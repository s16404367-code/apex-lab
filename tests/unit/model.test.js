// Unit tests: model, regulations, share codes, geometry, tracks (spec §93).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baselineContext, BASE, CAL } from '../helpers.js';
import { CarModel, defaultParams, sanitizeParams, PARAM_SCHEMA } from '../../src/core/model.js';
import { checkLegality } from '../../src/core/regulations.js';
import { buildGeometry } from '../../src/core/geometry.js';
import { encodeShareCode, decodeShareCode } from '../../src/storage/sharecode.js';
import { prepareTrack } from '../../src/sim/tracks.js';
import { heaveStability } from '../../src/core/stability.js';
import { robustnessTest } from '../../src/sim/robustness.js';
import { solveAero } from '../../src/core/aero.js';
import T1 from '../../data/tracks/kestrel-ring.js';
import T2 from '../../data/tracks/harbor-street.js';
import T3 from '../../data/tracks/summit-classic.js';
import REGS from '../../data/regulations/regulations-2026.js';

test('param schema is complete and internally consistent', () => {
  for (const p of PARAM_SCHEMA) {
    assert.ok(p.max > p.min, `${p.key} range invalid`);
    assert.ok(p.def >= p.min && p.def <= p.max, `${p.key} default outside range`);
  }
  const defaults = defaultParams();
  assert.equal(Object.keys(defaults).length, PARAM_SCHEMA.length);
});

test('baseline car is legal', () => {
  const { model } = baselineContext();
  const legality = checkLegality(model);
  assert.ok(legality.legal, 'baseline must be legal: ' + JSON.stringify(legality.checks.filter((c) => !c.pass)));
});

test('illegal geometry is flagged (width, span, diffuser angle)', () => {
  const wide = baselineContext({ track: 1850 }); // 1850+325 > 2000
  assert.ok(!checkLegality(wide.model).legal);
  const bigWing = baselineContext({ rwSpan: 1120 }); // span over the 1020 regulation
  assert.ok(!checkLegality(bigWing.model).legal);
  const steepDiff = baselineContext({ diffAngle: 18 }); // over the 17° regulation
  assert.ok(!checkLegality(steepDiff.model).legal);
});

test('every regulation rule has a provenance tier and article', () => {
  const valid = ['verified', 'game-default', 'pending', 'candidate'];
  for (const r of REGS.rules) {
    assert.ok(valid.includes(r.tier), `${r.id} bad tier`);
    assert.ok(r.article, `${r.id} missing article`);
    assert.ok(r.description, `${r.id} missing description`);
  }
  assert.ok(REGS.honestyNotice.includes('game'), 'honesty notice required (spec §7)');
});

test('share code round-trips params exactly (±quantisation)', () => {
  const { model } = baselineContext();
  const code = encodeShareCode(model.params);
  const decoded = decodeShareCode(code);
  assert.ok(decoded, 'decode failed');
  for (const p of PARAM_SCHEMA) {
    const tol = (p.max - p.min) / 4095 + 1e-9;
    assert.ok(Math.abs(decoded[p.key] - model.params[p.key]) < tol, `${p.key} mismatch`);
  }
  assert.ok(decodeShareCode(code.slice(0, -2) + 'zz') === null, 'corrupted code must fail checksum');
});

test('geometry builds a non-degenerate mesh with plausible dimensions', () => {
  const { model } = baselineContext();
  const { mesh, meta } = buildGeometry(model);
  assert.ok(mesh.verts.length > 100);
  assert.ok(mesh.quads.length > 60);
  for (const v of mesh.verts) {
    for (const c of v) assert.ok(isFinite(c));
  }
  assert.ok(meta.overallWidth >= model.params.track && meta.overallWidth <= 2000 + 60);
  assert.ok(meta.frontalArea > 0.8 && meta.frontalArea < 3);
});

test('tracks close and have finite curvature', () => {
  for (const def of [T1, T2, T3]) {
    const t = prepareTrack(def, 400);
    assert.ok(Math.abs(t.pts[0].x) < 5 && Math.abs(t.pts[0].y) < 5, `${def.name} must start at origin`);
    const end = t.pts[t.pts.length - 1];
    assert.ok(Math.hypot(end.x, end.y) < 60, `${def.name} closure gap too big: ${Math.hypot(end.x, end.y).toFixed(1)}m`);
    for (const p of t.pts) assert.ok(isFinite(p.k) && p.k >= 0);
  }
});

test('porpoising: soft damper + big throat risks more than stiff damper', () => {
  const { model, cal, meta } = baselineContext({ throatArea: 1.3, heaveStiff: 0.7 });
  const ref = solveAero(model, cal, meta, { v: 90, yawDeg: 0, rho: 1.21, drs: false, dirtyAir: 0, hFDyn: model.params.rideHeightF, hRDyn: model.params.rideHeightR });
  const soft = model.clone(); soft.params.damper = 0.6;
  const stiff = model.clone(); stiff.params.damper = 1.8;
  const rSoft = heaveStability(soft, cal, ref, 90);
  const rStiff = heaveStability(stiff, cal, ref, 90);
  assert.ok(rSoft.riskPct >= rStiff.riskPct, `soft (${rSoft.riskPct}) must risk ≥ stiff (${rStiff.riskPct})`);
});

test('robustness: stall probability is 0 at safe ride height, rises at the edge', () => {
  const { model, cal, meta } = baselineContext();
  const safe = robustnessTest(model, cal, meta, { v: 69.4, yawDeg: 0, rho: 1.21 }, { samples: 120, seed: 7 });
  const edge = baselineContext({ rideHeightF: 14, rideHeightR: 20 });
  const rEdge = robustnessTest(edge.model, edge.cal, edge.meta, { v: 69.4, yawDeg: 0, rho: 1.21 }, { samples: 120, seed: 7 });
  assert.equal(safe.pStallPct, 0, 'safe setup must not stall');
  assert.ok(rEdge.pStallPct > safe.pStallPct, 'edge setup must risk more stall');
});

test('development version hash is stable and distinct per params', () => {
  const a = baselineContext().model;
  const b = baselineContext().model;
  assert.equal(a.hash, b.hash, 'identical params must hash equal');
  const c = baselineContext({ rwAngle: 24 }).model;
  assert.notEqual(a.hash, c.hash);
});
