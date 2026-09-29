// APEX LAB — heave-mode stability / porpoising (spec §20).
// NOT a random warning: a real 1-DOF heave oscillator coupled to the aero
// ride-height slope through a flow lag. Envelope growth between successive
// oscillation peaks is the porpoising risk. Dampers, platform stiffness and
// the floor response curve genuinely change the outcome.

import { clamp } from './util.js';

/**
 * @param model CarModel
 * @param cal   effective calibration
 * @param aero  solved aero result at the operating point (uses .underbody.aeroStiffness N/mm)
 * @param v     evaluation speed (m/s)
 * @returns {riskPct, freqHz, growthPerCycle, stable, amplitudeMm, cEff, verdict, trace}
 */
export function heaveStability(model, cal, aero, v = 69.4) {
  const mEff = model.params.mass * 0.55;                     // effective modal mass (kg)
  const zeta = 0.16 + 0.14 * model.params.damper;            // base damping ratio × damper param
  const kSpr = ((mEff * 9.81) / (cal.suspension.heave_ref_mm_per_g * model.params.heaveStiff)) * 1000; // N/m
  const cSpr = 2 * zeta * Math.sqrt(kSpr * mEff);            // N·s/m
  const Ka = aero.underbody.aeroStiffness * 1000 * clamp(v / 69.4, 0, 1.4); // N/m (dDF/dh at operating point)
  const tau = (cal.porpoising.flow_lag_ms / 1000) * (0.5 + 0.5 / Math.max(model.params.damper, 0.01));

  const dt = cal.porpoising.dt_ms / 1000;
  const T = cal.porpoising.sim_seconds;
  const steps = Math.round(T / dt);
  const lagSteps = Math.max(1, Math.round(tau / dt));
  const zBuf = new Float64Array(lagSteps + 1);

  const z0 = 0;
  let z = cal.porpoising.bump_amplitude_mm / 1000;
  let zd = 0;
  const trace = [];
  const amps = [];           // successive peak amplitudes
  let extreme = Math.abs(z); // max |z| since last sign change
  let prevSign = 1;
  let lastCrossT = 0;
  let period = 0;
  let maxAbs = Math.abs(z);

  for (let i = 0; i < steps; i++) {
    const zLag = zBuf[i % (lagSteps + 1)];
    const Faero = -Ka * (zLag - z0); // restoring slope delayed by flow lag → negative damping
    const Fspr = -kSpr * (z - z0);
    const Fdmp = -cSpr * zd;
    zd += ((Fspr + Fdmp + Faero) / mEff) * dt;
    z += zd * dt;
    zBuf[(i + 1) % (lagSteps + 1)] = z;
    maxAbs = Math.max(maxAbs, Math.abs(z));
    if (i % 6 === 0) trace.push({ t: +(i * dt).toFixed(3), z: +(z * 1000).toFixed(3) });

    const s = Math.sign(z);
    if (s !== 0 && s !== prevSign) {
      amps.push(extreme);
      if (lastCrossT > 0 && !period) period = (i * dt - lastCrossT) * 2;
      lastCrossT = i * dt;
      extreme = 0;
      prevSign = s;
    }
    extreme = Math.max(extreme, Math.abs(z));
    if (maxAbs > 0.05) break; // blown up — no need to simulate further
  }

  let growth;
  if (amps.length >= 3) growth = amps[2] / Math.max(amps[1], 1e-9);
  else if (maxAbs > 5 * cal.porpoising.bump_amplitude_mm / 1000) growth = 20; // static divergence
  else growth = maxAbs / (cal.porpoising.bump_amplitude_mm / 1000);           // pure decay, no second peak measured
  growth = clamp(growth, 0.01, 50);

  const freq = period > 0 ? 1 / period : Math.sqrt(kSpr / mEff) / (2 * Math.PI);
  const risk = clamp((Math.log(growth) / Math.log(3)) * 50 + 50, 0, 100);

  return {
    riskPct: risk,
    stable: growth <= 1.03,
    freqHz: freq,
    growthPerCycle: growth,
    amplitudeMm: maxAbs * 1000,
    cEff: cSpr - Ka * tau,
    KaN_per_mm: Ka / 1000,
    tauMs: tau * 1000,
    verdict: growth > 1.5
      ? `PORPOISING RISK: heave oscillation growing ${growth.toFixed(2)}× per cycle (~${freq.toFixed(1)} Hz). Aero slope ${ (Ka/1000).toFixed(0) } N/mm against ${tau.toFixed(0)} ms flow lag beats your damping. Raise damper rate, reduce load-per-mm (higher ride height / gentler throat), or stiffen the platform.`
      : growth > 1.03
        ? `MARGINAL: heave envelope growing ${growth.toFixed(2)}× per cycle — kerb inputs may excite sustained oscillation.`
        : `STABLE: heave envelope decaying (${growth.toFixed(2)}× per cycle, ~${freq.toFixed(1)} Hz) — damping dominates the aero slope.`,
    trace
  };
}

/**
 * Ride-height response sweep (spec §17): DF & efficiency vs ride height,
 * revealing the ground-effect peak and the stall edge.
 */
export function rideHeightSweep(solveFn, model, cal, meta, cond, range = null) {
  const p = model.params;
  const out = [];
  const lo = range?.min ?? Math.max(p.rideHeightF * 0.4, 12);
  const hi = range?.max ?? Math.max(p.rideHeightR * 1.8, 90);
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const h = lo + ((hi - lo) * i) / n;
    const c = { ...cond, hFDyn: h, hRDyn: h * (p.rideHeightR / Math.max(p.rideHeightF, 1)) };
    const r = solveFn(model, cal, meta, c);
    out.push({ h: +h.toFixed(1), df: r.df.total, drag: r.drag, ld: r.ld, balance: r.df.balancePct, stall: r.flags.some((f) => f.id === 'floorStall') });
  }
  return out;
}

/** Yaw sweep (spec §18). */
export function yawSweep(solveFn, model, cal, meta, cond, angles = [0, 1, 2, 3, 5, 7]) {
  const base = solveFn(model, cal, meta, { ...cond, yawDeg: 0 });
  return angles.map((y) => {
    const r = solveFn(model, cal, meta, { ...cond, yawDeg: y });
    return {
      yawDeg: y,
      df: r.df.total,
      dfLossPct: (1 - r.df.total / base.df.total) * 100,
      drag: r.drag,
      dragDeltaPct: (r.drag / base.drag - 1) * 100,
      balance: r.df.balancePct,
      balanceShift: r.df.balancePct - base.df.balancePct,
      lateral: r.df.total * Math.sin((y * Math.PI) / 180),
      floorLoss: (1 - r.cla.floor / base.cla.floor) * 100
    };
  });
}

/** Speed sweep — used for aero maps and flex behaviour visibility. */
export function speedSweep(solveFn, model, cal, meta, cond, speedsKmh = [100, 150, 200, 250, 300, 330]) {
  return speedsKmh.map((kmh) => {
    const r = solveFn(model, cal, meta, { ...cond, v: kmh / 3.6 });
    return { vKmh: kmh, df: r.df.total, drag: r.drag, ld: r.ld, balance: r.df.balancePct, fwTwist: r.flex.fwTwistDeg, rwTwist: r.flex.rwTwistDeg };
  });
}
