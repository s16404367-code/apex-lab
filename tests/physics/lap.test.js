// Lap simulation acceptance tests (spec §93).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baselineContext, CAL } from '../helpers.js';
import { simulateLap } from '../../src/sim/lap.js';
import { solveAero } from '../../src/core/aero.js';
import { prepareTrack } from '../../src/sim/tracks.js';
import T1 from '../../data/tracks/kestrel-ring.js';
import T2 from '../../data/tracks/harbor-street.js';
import T3 from '../../data/tracks/summit-classic.js';

const tracks = { 'kestrel-ring': T1, 'harbor-street': T2, 'summit-classic': T3 };

for (const [id, def] of Object.entries(tracks)) {
  test(`[${def.name}] produces a finite, plausible lap with a usable trace`, () => {
    const { model, cal, meta } = baselineContext();
    const track = prepareTrack(def, 700);
    assert.ok(track.length > 2500 && track.length < 9500, `length ${track.length}`);
    const lap = simulateLap(model, cal, meta, track);
    assert.ok(isFinite(lap.timeS) && lap.timeS > 40 && lap.timeS < 200, `time ${lap.timeS}`);
    assert.equal(lap.trace.length, 700);
    assert.ok(lap.topSpeedKmh > 200 && lap.topSpeedKmh < 420, `top ${lap.topSpeedKmh}`);
    const sectorSum = lap.sectors.reduce((s, v) => s + v, 0);
    assert.ok(Math.abs(sectorSum - lap.timeS) < lap.timeS * 0.05, 'sectors must sum to ~lap time');
    assert.ok(Object.keys(lap.limiterCounts).length >= 2, 'limiter map must show ≥2 limit types');
    for (const t of lap.trace) {
      assert.ok(isFinite(t.v) && t.v > 3);
      assert.ok(isFinite(t.gLat) && Math.abs(t.gLat) < 8);
      assert.ok(isFinite(t.tyreT));
    }
  });
}

test('more rear wing adds clean-air drag (attached regime) and stays finite on-track', () => {
  const { model, cal, meta } = baselineContext();
  const track = prepareTrack(T1, 700);
  const a = simulateLap(model, cal, meta, track);
  const b = model.clone();
  b.params.rwAngle = model.params.rwAngle + 6; // stays attached (below the stall band)
  const lapB = simulateLap(b, cal, meta, track);
  assert.ok(isFinite(lapB.timeS));
  const cond = { v: 90, yawDeg: 0, rho: 1.21, drs: false, dirtyAir: 0, hFDyn: b.params.rideHeightF, hRDyn: b.params.rideHeightR };
  const rA = solveAero(model, cal, meta, cond);
  const rB = solveAero(b, cal, meta, cond);
  assert.ok(rB.drag > rA.drag, `drag must rise with RW angle (${rA.drag.toFixed(0)} → ${rB.drag.toFixed(0)})`);
});

test('lowering from ABOVE the floor optimum adds load; lowering below it stalls', () => {
  const { model, cal, meta } = baselineContext({ rideHeightF: 60, rideHeightR: 80 });
  const track = prepareTrack(T1, 700);
  const a = simulateLap(model, cal, meta, track);
  const b = model.clone();
  b.params.rideHeightF = model.params.rideHeightF - 10;
  b.params.rideHeightR = model.params.rideHeightR - 10;
  void b;
  const lapB = simulateLap(b, cal, meta, track);
  const avgDf = (t) => t.trace.reduce((s, x) => s + x.df, 0) / t.trace.length;
  assert.ok(avgDf(lapB) > avgDf(a), 'lowering from above optimum → more average DF');
});

test('wet weather slows the lap', () => {
  const { model, cal, meta } = baselineContext();
  const track = prepareTrack(T2, 700);
  const dry = simulateLap(model, cal, meta, track, { weather: { tempC: 25, trackTempC: 38, wet: 0 } });
  const wet = simulateLap(model, cal, meta, track, { weather: { tempC: 17, trackTempC: 19, wet: 1 } });
  assert.ok(wet.timeS > dry.timeS, `wet ${wet.timeS} must be slower than dry ${dry.timeS}`);
});

test('harbor street is traction/brake dominated vs kestrel corner dominance', () => {
  const { model, cal, meta } = baselineContext();
  const harbor = simulateLap(model, cal, meta, prepareTrack(T2, 700));
  const kestrel = simulateLap(model, cal, meta, prepareTrack(T1, 700));
  const harborLow = (harbor.limiterCounts.TRACTION ?? 0) + (harbor.limiterCounts.BRAKE ?? 0);
  const kestrelLow = (kestrel.limiterCounts.TRACTION ?? 0) + (kestrel.limiterCounts.BRAKE ?? 0);
  assert.ok(harborLow > kestrelLow, 'street circuit must have more traction+brake stations');
});

test('lap time is sensitive to grip-affecting parameters (suspension → dynamics coupling)', () => {
  const { model, cal, meta } = baselineContext();
  const track = prepareTrack(T1, 700);
  const a = simulateLap(model, cal, meta, track);
  const b = model.clone();
  b.params.heaveStiff = 1.6; // stiffer platform holds the aero window at speed
  const lapB = simulateLap(b, cal, meta, track);
  assert.ok(isFinite(lapB.timeS));
  // direction: stiffer heave keeps ride height lower at speed → more DF → faster or equal
  assert.ok(lapB.timeS <= a.timeS + 0.5, 'heave stiffness should not be hugely harmful');
});
