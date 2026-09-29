// APEX LAB — robustness: Monte Carlo over real uncertainty sources (spec §45, §46).
// Manufacturing tolerance + environment + tyre state. Reports distribution,
// stall probability and balance-excursion probability. Clearly an abstraction
// layered on the FAST solver — documented in docs/MODEL.md.

import { clamp, rng, gauss } from '../core/util.js';
import { solveAero } from '../core/aero.js';

/**
 * @param samples number of MC samples
 * @param seed deterministic seed
 * @returns {mean, best, worst, spread, pStall, pBalance, pFlag, histogram, samples:[]}
 */
export function robustnessTest(model, cal, meta, cond, opts = {}) {
  const samples = Math.max(30, Math.min(opts.samples ?? 250, 1000));
  const seed = opts.seed ?? 42;
  const tolWing = cal.manufacturing.wing_angle_tol_deg * (opts.tolMult ?? 1);
  const tolRH = cal.manufacturing.ride_height_tol_mm * (opts.tolMult ?? 1);
  const targetBalance = cond.balanceTarget ?? model.params.massDistFront + 4;
  const rand = rng(seed);

  const rows = [];
  let stall = 0, balanceEx = 0, flagged = 0;
  const base = solveAero(model, cal, meta, { ...cond, hFDyn: model.params.rideHeightF, hRDyn: model.params.rideHeightR });

  for (let i = 0; i < samples; i++) {
    const c = {
      ...cond,
      v: cond.v * (1 + gauss(rand) * 0.02),
      yawDeg: Math.abs(gauss(rand) * 1.4),
      rho: cond.rho * (1 + gauss(rand) * 0.01),
      hFDyn: model.params.rideHeightF + gauss(rand) * tolRH,
      hRDyn: model.params.rideHeightR + gauss(rand) * tolRH * 1.3,
      drs: false,
      dirtyAir: opts.dirtyAir ?? 0
    };
    // clone params with manufacturing tolerance on wing angles
    const m2 = model.clone();
    m2.params.fwAngle = model.params.fwAngle + gauss(rand) * tolWing;
    m2.params.rwAngle = model.params.rwAngle + gauss(rand) * tolWing;
    m2.params.mass = model.params.mass + gauss(rand) * 2.5;
    const r = solveAero(m2, cal, meta, c);
    const isStall = r.flags.some((f) => f.id === 'floorStall' || f.id === 'fwStall');
    const balEx = Math.abs(r.df.balancePct - base.df.balancePct) > 2;
    if (isStall) stall++;
    if (balEx) balanceEx++;
    if (r.flags.length > 0) flagged++;
    rows.push({ df: r.df.total, drag: r.drag, balance: r.df.balancePct, ld: r.ld, stall: isStall, balEx });
  }

  const dfs = rows.map((r) => r.df).sort((a, b) => a - b);
  const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const meanDf = mean(dfs);
  const drags = rows.map((r) => r.drag);
  const bals = rows.map((r) => r.balance);
  // histogram of DF in 12 bins
  const lo = dfs[0], hi = dfs[dfs.length - 1];
  const bins = new Array(12).fill(0);
  for (const d of dfs) bins[Math.min(11, Math.floor(((d - lo) / Math.max(hi - lo, 1e-9)) * 12))]++;

  return {
    samples,
    seed,
    meanDf, bestDf: dfs[dfs.length - 1], worstDf: dfs[0],
    spreadDfPct: ((dfs[dfs.length - 1] - dfs[0]) / Math.max(meanDf, 1)) * 100,
    meanDrag: mean(drags),
    meanBalance: mean(bals),
    pStallPct: (stall / samples) * 100,
    pBalancePct: (balanceEx / samples) * 100,
    pFlagPct: (flagged / samples) * 100,
    histogram: { bins, lo, hi },
    tolerance: { tolWing, tolRH },
    baselineDf: base.df.total
  };
}
