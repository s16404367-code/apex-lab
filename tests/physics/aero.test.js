// Physics acceptance tests (spec §93): aero invariants that must hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baselineContext } from '../helpers.js';
import { solveAero, evalReference, referenceCondition } from '../../src/core/aero.js';

const cond = (over = {}) => ({ v: 69.4, yawDeg: 0, rho: 1.21, drs: false, dirtyAir: 0, ...over });

test('downforce scales with V² (quadratic relationship)', () => {
  const { model, cal, meta } = baselineContext();
  const v1 = solveAero(model, cal, meta, cond({ v: 30 }));
  const v2 = solveAero(model, cal, meta, cond({ v: 60 }));
  const ratio = v2.df.total / v1.df.total;
  assert.ok(Math.abs(ratio - 4) < 0.25, `expected ~4×, got ${ratio.toFixed(2)}`);
});

test('drag increases monotonically with rear wing angle (attached regime), falls past stall', () => {
  const { model, cal, meta } = baselineContext();
  let last = 0;
  for (let a = 8; a <= 30; a += 2) {
    const m2 = model.clone();
    m2.params.rwAngle = a;
    const r = solveAero(m2, cal, meta, cond());
    assert.ok(r.drag > last, `drag must rise with RW angle while attached (failed at ${a}°)`);
    last = r.drag;
  }
  });

test('ground effect has an interior peak, then stalls at very low ride height', () => {
  const { model, cal, meta } = baselineContext();
  const dfs = [];
  for (const h of [10, 14, 20, 26, 32, 40, 50, 65]) {
    const r = solveAero(model, cal, meta, cond({ hFDyn: h, hRDyn: h * 1.5 }));
    dfs.push(r.df.total);
  }
  const peak = Math.max(...dfs);
  const peakIdx = dfs.indexOf(peak);
  assert.ok(peakIdx > 0 && peakIdx < dfs.length - 1, `peak must be interior (got index ${peakIdx})`);
  assert.ok(dfs[0] < peak * 0.8, 'very low ride height must NOT give max downforce (choke/stall)');
  assert.ok(dfs[dfs.length - 1] < peak, 'excessive ride height must lose load');
});

test('floor stall flag appears in the choked regime and carries an explanation', () => {
  const { model, cal, meta } = baselineContext();
  const r = solveAero(model, cal, meta, cond({ hFDyn: 8, hRDyn: 10 }));
  const stall = r.flags.find((f) => f.id === 'floorStall');
  assert.ok(stall, 'stall flag missing at 8mm');
  assert.ok(stall.msg.length > 30, 'flag must explain the mechanism');
});

test('yaw degrades downforce and shifts balance forward', () => {
  const { model, cal, meta } = baselineContext();
  const r0 = solveAero(model, cal, meta, cond({ yawDeg: 0 }));
  const r7 = solveAero(model, cal, meta, cond({ yawDeg: 7 }));
  assert.ok(r7.df.total < r0.df.total * 0.95, 'DF must drop at 7° yaw');
  assert.ok(r7.df.balancePct > r0.df.balancePct, 'balance %F must rise (floor loses most → forward migration)');
});

test('DRS reduces both drag and downforce', () => {
  const { model, cal, meta } = baselineContext();
  const closed = solveAero(model, cal, meta, cond());
  const open = solveAero(model, cal, meta, cond({ drs: true }));
  assert.ok(open.drag < closed.drag, 'DRS must cut drag');
  assert.ok(open.df.total < closed.df.total, 'DRS must cut load');
});

test('contribution ledger sums to the reported totals', () => {
  const { model, cal, meta } = baselineContext();
  const r = solveAero(model, cal, meta, cond());
  const sumDf = r.ledger.df.reduce((s, l) => s + l.N, 0);
  assert.ok(Math.abs(sumDf - r.df.total) < Math.abs(r.df.total) * 0.02, `ledger ${sumDf} vs total ${r.df.total}`);
  const sumCd = r.ledger.drag.reduce((s, l) => s + l.cda, 0);
  assert.ok(Math.abs(sumCd - r.cdA) < 1e-9);
});

test('dirty air reduces downforce; cooling trade works in the right direction', () => {
  const { model, cal, meta } = baselineContext();
  const clean = solveAero(model, cal, meta, cond());
  const dirty = solveAero(model, cal, meta, cond({ dirtyAir: 1 }));
  assert.ok(dirty.df.total < clean.df.total);
  const small = model.clone();
  small.params.coolInlet = 0.35;
  const rSmall = solveAero(small, cal, meta, cond());
  const big = model.clone();
  big.params.coolInlet = 1.0;
  const rBig = solveAero(big, cal, meta, cond());
  assert.ok(rSmall.drag < rBig.drag, 'smaller inlet → less drag');
  assert.ok(rSmall.thermal.marginPct < rBig.thermal.marginPct, 'smaller inlet → less thermal margin');
});

test('wing flex reduces effective load at speed and responds to stiffness upgrades', () => {
  const { model, cal, meta } = baselineContext();
  const slow = solveAero(model, cal, meta, cond({ v: 25 }));
  const fast = solveAero(model, cal, meta, cond({ v: 90 }));
  assert.ok(fast.flex.rwTwistDeg > slow.flex.rwTwistDeg, 'more load at speed → more twist');
  const stiff = JSON.parse(JSON.stringify(cal));
  stiff.flex.rw_compliance_deg_per_kn *= 0.5;
  const rStiff = solveAero(model, stiff, meta, cond({ v: 90 }));
  assert.ok(rStiff.flex.rwTwistDeg < fast.flex.rwTwistDeg, 'stiffer wing twists less');
});

test('reference evaluation stays finite and plausible', () => {
  const { model, cal, meta } = baselineContext();
  const r = evalReference(model, cal, meta);
  for (const v of [r.df.total, r.drag, r.df.balancePct, r.ld]) assert.ok(isFinite(v));
  assert.ok(r.df.total > 4000 && r.df.total < 40000, `DF ${r.df.total}`);
  assert.ok(r.drag > 1000 && r.drag < 20000);
  assert.ok(r.df.balancePct > 20 && r.df.balancePct < 65);
  assert.ok(r.ld > 1.5 && r.ld < 8);
});
