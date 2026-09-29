// APEX LAB — FAST aerodynamic evaluator (spec §14, §15, §16, §17, §18, §21, §23).
//
// A reduced-order, quasi-physical model. NOT CFD (spec §106): wings use
// thin-airfoil load slopes with empirical ground effect and stall corrections;
// the underbody uses a ride-height response curve derived from venturi
// behaviour; drag splits into induced + profile + interference terms.
// Every coefficient lives in data/calibration/defaults.js and is exposed to
// the player via the calibration panel (spec §92). Target: <5 ms per call.

import { clamp, smoothstep, rad, deg } from './util.js';

/** Air density shortcut. */
export function rhoOf(weather) {
  const { airDensity } = isBrowser() ? {} : {};
  return weather.rho ?? 1.225;
}
function isBrowser() { return typeof window !== 'undefined'; }

/**
 * Main solver.
 * @param model   CarModel
 * @param cal     effective calibration (model.calibration(base))
 * @param meta    geometry meta from buildGeometry()
 * @param cond    {v m/s, yawDeg, rho, hFDyn, hRDyn, drs, dirtyAir, throttle thermalDemandScale}
 */
export function solveAero(model, cal, meta, cond) {
  const p = model.params;
  const v = Math.max(cond.v, 1);
  const q = 0.5 * cond.rho * v * v; // dynamic pressure
  const yaw = rad(cond.yawDeg || 0);

  const hF = cond.hFDyn ?? p.rideHeightF;
  const hR = cond.hRDyn ?? p.rideHeightR;
  const hAvg = (hF + hR) / 2;
  const rakeDeg = (Math.atan2(hR - hF, p.wheelbase) * 180) / Math.PI;

  const flags = [];
  const notes = [];

  // ============ FRONT WING (thin-airfoil slope + ground gain + soft stall) ====
  let claFw = 0, dfFw = 0, fwTwist = 0, fwStall = 0;
  {
    const c = cal.frontWing;
    const areaF = (p.fwSpan / 1600) * (p.fwChord / 320);
    const elementsF = 1 + c.element_factor_per_extra * (p.fwElements - 3);
    const camberF = 1 + c.camber_factor_per_deg * p.fwCamber;
    const groundF = 1 + c.ground_gain * Math.exp(-(p.fwHeight + hF * 0.25) / c.ground_h0_mm);
    const aoaBase = (p.fwAngle + c.flap_effectiveness * p.fwFlap) * Math.PI / 180;
    // structural flex feedback (spec §21): load → twist → reduced effective AoA
    let aoa = aoaBase;
    for (let i = 0; i < cal.flex.iterations; i++) {
      fwTwist = cal.flex.fw_compliance_deg_per_kn * (dfFw / 1000);
      aoa = aoaBase - rad(fwTwist) * 0.6;
      fwStall = 1 / (1 + Math.exp(-(aoa - c.stall_aoa_rad) / c.stall_sharpness_rad));
      claFw = c.cla_slope_m2_per_rad * Math.max(aoa, -0.05) * groundF * elementsF * camberF * areaF * (1 - 0.75 * fwStall);
      dfFw = q * claFw * (1 - cal.dirtyAir.fw_loss * (cond.dirtyAir || 0));
    }
    if (fwStall > 0.4) flags.push({ id: 'fwStall', msg: `Front wing entering stall (effective AoA ${deg(aoa).toFixed(1)}°, stall zone) — load plateaued.` });
  }

  // ============ FLOOR + DIFFUSER (ground-effect response curve) ================
  let claFloor = 0, dfFloor = 0, floorX = 1, chokeF = 1, sepF = 0;
  {
    const c = cal.floor;
    const hOpt = Math.max(14, c.h_opt_base_mm * Math.sqrt(p.throatArea) / Math.pow(p.tunnelDepth, 0.3));
    floorX = hAvg / hOpt;
    const shape = floorX * Math.exp(1 - floorX);                    // venturi curve: rises, peaks at x=1, decays
    chokeF = clamp(1 - Math.exp(-(Math.max(hAvg - c.choke_min_h_mm, 0)) / c.choke_h0_mm), 0, 1); // very-low-h choke
    sepF = smoothstep(cal.diffuser.sep_start_deg, cal.diffuser.sep_full_deg, p.diffAngle);     // diffuser separation
    const recoveryF = 1 - cal.diffuser.sep_load_loss * sepF;
    const expansionF = 1 + c.expansion_gain * (p.floorExp - 1);
    const rakeF = 1 + c.rake_gain_per_deg * rakeDeg - c.rake_penalty_per_deg2 * rakeDeg * rakeDeg;
    const yawLoss = c.yaw_loss_max * (1 - Math.exp(-Math.pow((cond.yawDeg || 0) / c.yaw_crit_deg, 2)));
    const yawF = 1 - yawLoss;
    const edgeF = 1 + c.edge_wing_gain * p.edgeWing;
    const dirtyF = 1 - cal.dirtyAir.floor_loss * (cond.dirtyAir || 0);
    claFloor = c.cla_max_m2 * shape * chokeF * recoveryF * expansionF * Math.max(rakeF, 0.4) * yawF * edgeF * dirtyF;
    dfFloor = q * claFloor;
    if (floorX < c.stall_x_threshold || chokeF < 0.55) {
      flags.push({ id: 'floorStall', msg: `Underbody choked/stalled: ride height ${hAvg.toFixed(0)} mm is ${(hOpt - hAvg).toFixed(0)} mm below the tunnel optimum (${hOpt.toFixed(0)} mm) — diffuser pressure recovery collapsed.` });
    }
    if (sepF > 0.5) flags.push({ id: 'diffuserSep', msg: `Diffuser separation at ${p.diffAngle.toFixed(1)}° expansion — flow no longer attached through the exit.` });
    if (rakeDeg > 1.4) notes.push(`Rake ${rakeDeg.toFixed(2)}° beyond the underbody sweet spot (~1.4°) — rake load benefit decaying.`);
  }

  // ============ REAR WING (wake + upwash couplings + flex + DRS) ==============
  let claRw = 0, dfRw = 0, rwTwist = 0, drsActive = false;
  let wakeDelta = 0, upwashDelta = 0;
  {
    const c = cal.rearWing;
    const areaF = (p.rwSpan / 1020) * (p.rwChord / 380);
    const elementsF = 0.85 + 0.15 * p.rwElements;
    drsActive = !!cond.drs;
    const aoaBase = p.rwAngle * Math.PI / 180 * (drsActive ? c.drs_cla_factor : 1);
    // couplings evaluated from pre-flex loads
    const fwNorm = claFw / 1.4;
    const diffNorm = claFloor * 0.78 / 1.9;
    let aoa = aoaBase;
    for (let i = 0; i < cal.flex.iterations; i++) {
      rwTwist = cal.flex.rw_compliance_deg_per_kn * (dfRw / 1000);
      aoa = aoaBase - rad(rwTwist) * 0.5;
      const stall = 1 / (1 + Math.exp(-(aoa - c.stall_aoa_rad) / c.stall_sharpness_rad));
      const wakeF = 1 - c.wake_loss_max * clamp(fwNorm, 0, 1.6);
      const upwashF = 1 + c.upwash_gain_max * clamp(diffNorm, 0, 1.4);
      const dirtyF = 1 - c.dirty_air_loss * (cond.dirtyAir || 0);
      const yawF = 1 - 0.10 * (1 - Math.exp(-Math.pow((cond.yawDeg || 0) / 9, 2)));
      claRw = c.cla_slope_m2_per_rad * aoa * areaF * elementsF * wakeF * upwashF * dirtyF * yawF * (1 - 0.8 * stall);
      dfRw = q * claRw;
    }
    wakeDelta = -c.wake_loss_max * clamp(fwNorm, 0, 1.6);
    upwashDelta = +c.upwash_gain_max * clamp(diffNorm, 0, 1.4);
    if (p.rwAngle > 32) notes.push(`Rear wing at ${p.rwAngle}° — approaching the stall plateau; load per degree of angle is diminishing.`);
  }

  // ============ BODY — from the sculpted shape (meta.shapeAero) ==============
  const cB = cal.body;
  const SA = meta.shapeAero ?? {
    frontalAreaM2: 0.6, fineness: 6.0, deckSlope: 0.02, noseSlope: 0.09, maxWidthMm: p.bodyWidth
  };
  const widthF = Math.pow(Math.max(SA.maxWidthMm, 600) / 1260, cB.width_exp);
  // deck upwash and nose droop genuinely change body lift; fineness changes drag
  const claBody = cB.cla_m2 * (1 + 2.1 * Math.max(SA.deckSlope, 0) + 0.35 * Math.max((SA.noseSlope ?? 0.09) - 0.07, 0)) * (0.75 + 0.25 * widthF);
  const dfBody = q * claBody;

  // ============ DRAG LEDGER ====================================================
  const cdTerms = [];
  {
    const cF = cal.frontWing, cR = cal.rearWing;
    const arFw = (p.fwSpan / 1000) / (p.fwChord / 1000);
    const inducedFw = (claFw * claFw) / (Math.PI * arFw * cF.oswald_e);
    const arRw = (p.rwSpan / 1000) / (p.rwChord / 1000);
    let inducedRw = (claRw * claRw) / (Math.PI * arRw * cR.oswald_e);
    if (drsActive) inducedRw *= cR.drs_cd_induced_factor;
    const floorDrag = 0.035 * claFloor * (1 + 0.5 * p.edgeWing);
    const bodyCda = 1.02 * SA.frontalAreaM2 * clamp(1.34 - 0.062 * SA.fineness, 0.72, 1.3);
    const wheelDrag = cB.cda_wheels_m2 * (p.track / 1600);
    const coolCda = cal.cooling.cda_per_inlet_m2 * Math.pow(p.coolInlet, cal.cooling.inlet_exponent) * (0.75 + 0.25 * (p.coolOutlet / p.coolInlet || 1))
      + cal.cooling.brake_duct_cda_m2 * p.brakeDuct;
    cdTerms.push(
      { name: 'Front wing', cda: inducedFw + cF.cd_profile_m2 * (p.fwSpan / 1600) * (p.fwChord / 320), kind: 'induced+profile' },
      { name: 'Floor & diffuser', cda: floorDrag, kind: 'drag-due-to-lift + edge' },
      { name: 'Rear wing', cda: inducedRw + cR.cd_profile_m2 * (p.rwSpan / 1020) * (p.rwChord / 380), kind: drsActive ? 'induced+profile (DRS OPEN)' : 'induced+profile' },
      { name: 'Bodywork', cda: bodyCda, kind: 'profile' },
      { name: 'Wheels & tyres', cda: wheelDrag, kind: 'profile' },
      { name: 'Cooling flow', cda: coolCda, kind: 'internal flow' }
    );
  }
  const cdaTotal = cdTerms.reduce((s, t) => s + t.cda, 0);
  const dragN = q * cdaTotal * (1 - cal.dirtyAir.drag_reduction * (cond.dirtyAir || 0));

  // ============ ASSEMBLY + CONTRIBUTION LEDGER (spec §16) ======================
  const floorFrontShare = cal.floor.front_load_share;
  const contributions = [
    { name: 'Front wing', df: dfFw, group: 'front', frontShare: 1 },
    { name: 'Floor & diffuser', df: dfFloor, group: 'rear', frontShare: floorFrontShare },
    { name: 'Rear wing', df: dfRw, group: 'rear' },
    { name: 'Bodywork', df: dfBody, group: 'rear', frontShare: cB.cla_front_share }
  ];
  const interactions = [
    { name: 'FW wake → RW (loss)', dfShare: wakeDelta, of: 'rw', desc: 'front-wing load pushes its wake upward into the rear wing plane' },
    { name: 'Diffuser upwash → RW (gain)', dfShare: upwashDelta, of: 'rw', desc: 'diffuser expansion seeds upwash that raises rear-wing effective incidence' }
  ];
  let dfTotal = 0, dfFront = 0;
  const ledgerDf = [];
  for (const c of contributions) {
    ledgerDf.push({ name: c.name, N: c.df, front: c.df * (c.frontShare || 0) });
    dfTotal += c.df;
    dfFront += c.df * (c.frontShare || 0);
  }
  for (const it of interactions) {
    const target = it.of === 'rw' ? dfRw : 0;
    const N = target * it.dfShare / (1 + it.dfShare);
    ledgerDf.push({ name: it.name, N, interaction: true, desc: it.desc });
    dfTotal += N;
    if (it.of === 'rw') dfRw += N;
    else dfFront += N;
  }

  const balancePct = dfTotal > 0 ? (dfFront / dfTotal) * 100 : 50;
  const ld = dragN > 0 ? dfTotal / dragN : 0;

  // ============ THERMAL MODEL (spec §23) ======================================
  const capPw = cal.cooling.capacity_per_inlet_kw * p.coolInlet * (0.55 + 0.45 * (p.coolOutlet / p.coolInlet || 1)) * cal.cooling.outlet_flow_factor;
  const capBrake = cal.cooling.brake_capacity_per_duct_kw * p.brakeDuct;
  const demand = cal.cooling.pu_heat_demand_kw * (0.6 + 0.4 * clamp(v / 85, 0, 1.2)) * (cond.thermalDemandScale || 1);
  const brakeDemand = cal.cooling.brake_heat_demand_kw * (cond.brakeDemandScale || 1);
  const thermalMarginPct = ((capPw - demand) / Math.max(demand, 1)) * 100;
  const brakeMarginPct = ((capBrake - brakeDemand) / Math.max(brakeDemand, 1)) * 100;
  if (thermalMarginPct < 8) flags.push({ id: 'thermal', msg: `Power unit thermal margin only ${thermalMarginPct.toFixed(0)}% — inlet area ${p.coolInlet.toFixed(2)}× cannot reject expected heat at this speed.` });
  if (brakeMarginPct < 5) flags.push({ id: 'brakeThermal', msg: `Brake cooling insufficient (${brakeMarginPct.toFixed(0)}% margin) — expect fade on heavy braking circuits.` });

  // ============ RIDE-HEIGHT SENSITIVITY + AERO MAP HINTS (spec §17, §20) =======
  const dh = 2;
  const floorAt = (h) => {
    const x = h / Math.max(14, cal.floor.h_opt_base_mm * Math.sqrt(p.throatArea) / Math.pow(p.tunnelDepth, 0.3));
    return cal.floor.cla_max_m2 * x * Math.exp(1 - x);
  };
  const aeroStiffness = (floorAt(hAvg + dh) - floorAt(hAvg - dh)) / (2 * dh) * q; // N/mm (dDF/dh)

  return {
    q, v,
    df: {
      total: dfTotal,
      front: dfFront,
      rear: dfTotal - dfFront,
      balancePct,
      frontN: dfFront, rearN: dfTotal - dfFront
    },
    drag: dragN,
    cdA: cdaTotal,
    ld,
    copPct: 100 - balancePct,
    cla: { fw: claFw, floor: claFloor, rw: claRw, body: claBody },
    ledger: { df: ledgerDf, drag: cdTerms.map((t) => ({ name: t.name, cda: t.cda, kind: t.kind, N: t.cda * q })) },
    interactions,
    flex: { fwTwistDeg: fwTwist, rwTwistDeg: rwTwist },
    thermal: { capacityKw: capPw, demandKw: demand, marginPct: thermalMarginPct, brakeMarginPct },
    underbody: { hAvg, hOpt: Math.max(14, cal.floor.h_opt_base_mm * Math.sqrt(p.throatArea) / Math.pow(p.tunnelDepth, 0.3)), x: floorX, chokeF, sepF, aeroStiffness },
    flags,
    notes,
    drsActive,
    meta: { solver: 'FAST', yawDeg: cond.yawDeg || 0, rho: cond.rho, rakeDeg }
  };
}

/** Standard evaluation condition for KPI comparisons (spec: consistent basis). */
export function referenceCondition(model, cal, weather = {}) {
  return {
    v: 250 / 3.6,
    yawDeg: 0,
    rho: weather.rho ?? 1.21,
    hFDyn: model.params.rideHeightF,
    hRDyn: model.params.rideHeightR,
    drs: false,
    dirtyAir: 0
  };
}

/** Convenience: solve at reference conditions with aero-suspended static heights. */
export function evalReference(model, cal, meta, weather = {}) {
  const cond = referenceCondition(model, cal, weather);
  const cal2 = cal;
  // heave drop under aero load (spec §19): platform compresses with load
  const first = solveAero(model, cal2, meta, cond);
  const heave = (first.df.total / (model.params.mass * 9.81)) * cal.suspension.heave_ref_mm_per_g / model.params.heaveStiff;
  cond.hFDyn = model.params.rideHeightF - heave * 0.42;
  cond.hRDyn = model.params.rideHeightR - heave * 0.58;
  return solveAero(model, cal, meta, cond);
}
