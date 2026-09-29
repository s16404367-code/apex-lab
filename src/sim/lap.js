// APEX LAB — lap simulator (spec §28, §29, §19, §22).
// Point-mass (GGV) solver with:
//  • downforce-dependent cornering / braking limits
//  • DYNAMIC ride heights per station (heave under aero load, pitch under g)
//  • tyre temperature window + wear affecting mu
//  • limiter map: which physical limit binds at every station
//  • DRS on straight sections (regulation zones policy)
// Limitations documented in docs/MODEL.md — this is not a 3-DOF model.

import { clamp } from '../core/util.js';
import { solveAero } from '../core/aero.js';
import { airDensity, gripScale } from '../core/weather.js';

export function simulateLap(model, cal, meta, track, opts = {}) {
  const p = model.params;
  const weather = opts.weather ?? { tempC: 25, trackTempC: 38, wet: 0 };
  const rho = airDensity(weather);
  const wetGrip = gripScale(weather);
  const N = track.pts.length;
  const m = p.mass;
  const ds = track.length / N;
  const PwIce = cal.powertrain.ice_power_kw * 1000 * cal.powertrain.drivetrain_eff;
  const PwErs = cal.powertrain.ers_power_kw * 1000 * cal.powertrain.drivetrain_eff;

  let tyreTemp = cal.tyres.temp_opt_c - 8;
  let wear = 0;

  // ---- DRS zones: ≥130 m of sustained low curvature ----
  const drsOK = new Array(N).fill(false);
  {
    const kThresh = 1 / 800;
    const runNeed = Math.ceil(150 / ds);
    let runLen = 0;
    for (let i = 0; i < N * 2; i++) {
      const idx = i % N;
      runLen = track.pts[idx].k < kThresh ? runLen + 1 : 0;
      drsOK[idx] = runLen >= runNeed;
    }
  }

  // ---- tyre grip vs temperature window ----
  const muT = () => {
    const d = (tyreTemp - cal.tyres.temp_opt_c) / (cal.tyres.temp_window_c / 2);
    const cold = tyreTemp < cal.tyres.temp_opt_c
      ? cal.tyres.mu_cold_loss * clamp((cal.tyres.temp_opt_c - tyreTemp) / 45, 0, 1)
      : 0;
    return cal.tyres.mu_max * wetGrip * Math.max(0.55, 1 - 0.30 * d * d - cold) * (1 - cal.tyres.wear_mu_loss_max * clamp(wear, 0, 1));
  };

  // terminal velocity cap: a corner can never be faster than the car's terminal speed
  const ref = solveAero(model, cal, meta, { v: 69.4, yawDeg: 0, rho, drs: false, dirtyAir: 0, hFDyn: p.rideHeightF, hRDyn: p.rideHeightR });
  const vTerm = Math.min(120, Math.pow((PwIce + PwErs) / (0.5 * rho * Math.max(ref.cdA, 0.5)), 1 / 3) * 1.04);

  const passes = 10;
  let V = new Float64Array(N).fill(35);
  let finalTrace = null;
  let timeS = 0, energyMJ = 0, topSpeed = 0;

  for (let pass = 0; pass < passes; pass++) {
    const out = runPass(V, pass === passes - 1);
    let delta = 0;
    for (let i = 0; i < V.length; i++) delta = Math.max(delta, Math.abs(V[i] - out.V[i]));
    V = out.V;
    if (pass === passes - 1 || delta < 0.03) {
      if (pass < passes - 1) { const fin = runPass(V, true); finalTrace = fin; V = fin.V; timeS = fin.timeS; energyMJ = fin.energyMJ; topSpeed = fin.topSpeed; }
      else { finalTrace = out; timeS = out.timeS; energyMJ = out.energyMJ; topSpeed = out.topSpeed; }
      break;
    }
  }

  function aeroAt(v, drs, hF, hR) {
    return solveAero(model, cal, meta, { v: Math.max(v, 5), yawDeg: 0, rho, drs, dirtyAir: 0, hFDyn: hF, hRDyn: hR });
  }

  function runPass(Vin, final) {
    const V = Float64Array.from(Vin);
    const limiter = new Array(N).fill('CORNER');
    let timeS = 0, energyMJ = 0, topSpeed = 0;

    // aero per station with dynamic ride heights
    const cache = new Array(N);
    for (let i = 0; i < N; i++) {
      const v = Math.max(V[i], 8);
      let hF = p.rideHeightF, hR = p.rideHeightR, a = null;
      for (let sub = 0; sub < 2; sub++) {
        a = aeroAt(v, false, hF, hR);
        const heave = (a.df.total / (m * 9.81)) * (cal.suspension.heave_ref_mm_per_g / p.heaveStiff);
        hF = Math.max(2, p.rideHeightF - heave * 0.42);
        hR = Math.max(2, p.rideHeightR - heave * 0.58);
      }
      cache[i] = a;
    }

    // ---- cornering limit ----
    const Vcorner = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const k = Math.max(track.pts[i].k, 1e-9);
      const a = cache[i];
      const mu = muT();
      const CLA = a.df.total / a.q;
      const denom = k - (mu * rho * CLA) / (2 * m);
      Vcorner[i] = denom <= 1e-6 ? vTerm : Math.sqrt((mu * 9.81) / denom);
      Vcorner[i] = Math.min(Vcorner[i], vTerm);
    }

    // init: cornering envelope (no 999 m/s nonsense)
    for (let i = 0; i < N; i++) V[i] = Vcorner[i];

    // ---- backward pass: braking ----
    for (let loop = 0; loop < 2; loop++) {
      for (let ii = N * 2 - 1; ii >= 0; ii--) {
        const i = ii % N;
        const iNext = (i + 1) % N;
        const a = cache[i];
        const muB = muT() * cal.tyres.mu_brake_scale;
        const aBrake = muB * (9.81 + a.df.total / m) + a.drag / m;
        const vNew = Math.sqrt(V[iNext] * V[iNext] + 2 * aBrake * ds);
        if (vNew < V[i]) { V[i] = vNew; limiter[i] = 'BRAKE'; }
      }
    }

    // ---- forward pass: power + traction (two loops for closure) ----
    for (let loop = 0; loop < 2; loop++) {
      for (let ii = 0; ii < N * 2; ii++) {
        const i = ii % N;
        const iPrev = (i - 1 + N) % N;
        const v = V[i];
        const vPrev = V[iPrev];
        const vAvg = (v + vPrev) / 2;
        const a = cache[i];
        const drag = a.drag * (drsOK[i] && vAvg * 3.6 > 100 ? drsDragFactor(model, cal, a) : 1);
        const ers = vAvg * 3.6 > cal.powertrain.ers_deploy_v_kmh ? PwErs : 0;
        const aPower = (PwIce + ers) / Math.max(m * vAvg, 200) - drag / m;
        const rearLoadFrac = (m * 9.81 * (1 - p.massDistFront / 100) + a.df.rear) / (m * 9.81 + a.df.total);
        const aTraction = muT() * 9.81 * (rearLoadFrac / Math.max(1 - p.massDistFront / 100, 0.3)) * 0.9;
        const aAcc = Math.min(aPower, Math.min(aTraction, 22));
        const vNew = Math.sqrt(vPrev * vPrev + 2 * aAcc * ds);
        if (vNew < V[i]) {
          V[i] = vNew;
          limiter[i] = aTraction < aPower ? 'TRACTION' : ers > 0 ? 'POWER+ERS' : 'POWER';
        }
      }
    }

    // ---- integrate ----
    const trace = final ? [] : null;
    for (let i = 0; i < N; i++) {
      const iN = (i + 1) % N;
      const vAvg = (V[i] + V[iN]) / 2;
      timeS += ds / Math.max(vAvg, 1);
      const pt = track.pts[i];
      const a = cache[i];
      const gLat = (V[i] * V[i] * Math.max(pt.k, 0)) / 9.81;
      const gLong = (V[iN] * V[iN] - V[i] * V[i]) / (2 * ds * 9.81);
      const ers = V[i] * 3.6 > cal.powertrain.ers_deploy_v_kmh ? cal.powertrain.ers_power_kw : 0;
      const powerNow = Math.max(0, Math.min(cal.powertrain.ice_power_kw + ers, (Math.max(0, gLong) * 9.81 * m * V[i] + a.drag * V[i]) / 1000));
      energyMJ += (powerNow * (ds / Math.max(vAvg, 1))) / 1e3; // kW·s → kJ → MJ
      topSpeed = Math.max(topSpeed, V[i]);

      // tyre state
      const dT = (0.9 * Math.abs(gLat) + 0.5 * Math.abs(gLong) + 0.10 - V[i] / 180) * 0.008;
      tyreTemp = clamp(tyreTemp + dT, 15, 165);
      wear += (Math.abs(gLat) * 0.7 + Math.max(0, gLong) * 0.5) * 0.0000025 * ds;

      if (final) {
        trace.push({
          s: +pt.s.toFixed(1), x: +pt.x.toFixed(1), y: +pt.y.toFixed(1),
          v: +V[i].toFixed(2), kmh: +(V[i] * 3.6).toFixed(1),
          gLat: +gLat.toFixed(2), gLong: +gLong.toFixed(2),
          df: Math.round(a.df.total), drag: Math.round(a.drag),
          balance: +a.df.balancePct.toFixed(1),
          hF: +(p.rideHeightF - (a.df.total / (m * 9.81)) * (cal.suspension.heave_ref_mm_per_g / p.heaveStiff) * 0.42).toFixed(1),
          hR: +(p.rideHeightR - (a.df.total / (m * 9.81)) * (cal.suspension.heave_ref_mm_per_g / p.heaveStiff) * 0.58).toFixed(1),
          tyreT: +tyreTemp.toFixed(1),
          limiter: limiter[i], drs: drsOK[i] && V[i] * 3.6 > 100,
          throttle: +clamp(Math.max(0, gLong) / 2.2, 0, 1).toFixed(2),
          brake: +clamp(Math.max(0, -gLong) / 4.5, 0, 1).toFixed(2)
        });
      }
    }
    return { V, trace, timeS, energyMJ, topSpeed };
  }

  // ---- sector times (from final trace) ----
  const sectors = [0, 0, 0];
  if (finalTrace?.trace?.length) {
    const tr = finalTrace.trace;
    let sec = 0;
    for (let i = 0; i < tr.length; i++) {
      if (sec < 2 && tr[i].s >= track.sectorS[sec]) sec++;
      const vAvg = (tr[i].v + tr[(i + 1) % tr.length].v) / 2;
      sectors[sec] += ds / Math.max(vAvg, 1);
    }
  }

  const limiterCounts = {};
  for (const t of finalTrace?.trace ?? []) limiterCounts[t.limiter] = (limiterCounts[t.limiter] || 0) + 1;
  const drsCount = (finalTrace?.trace ?? []).filter((t) => t.drs).length;

  return {
    timeS,
    sectors: sectors.map((s) => +s.toFixed(2)),
    topSpeedKmh: topSpeed * 3.6,
    energyMJ: +energyMJ.toFixed(1),
    limiterCounts,
    drsPct: +((drsCount / Math.max(N, 1)) * 100).toFixed(1),
    tyre: { tempEnd: +tyreTemp.toFixed(1), wearPct: +(wear * 100).toFixed(1) },
    trace: finalTrace?.trace ?? [],
    conditions: { rho: +rho.toFixed(3), weather }
  };
}

/** Drag multiplier while DRS is open (derived from the same solver's rear-wing terms). */
function drsDragFactor(model, cal, a) {
  const cR = cal.rearWing;
  const p = model.params;
  const arRw = p.rwSpan / p.rwChord;
  const inducedRw = (a.cla.rw * a.cla.rw) / (Math.PI * arRw * cR.oswald_e);
  const savedN = inducedRw * (1 - cR.drs_cd_induced_factor) * a.q;
  return (a.drag - savedN) / Math.max(a.drag, 1);
}
