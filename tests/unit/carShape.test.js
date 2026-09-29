// APEX LAB — sculpted-chassis shape tests (V4.2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATIONS, defaultShape, sanitizeShape, isValidShape, smoothShape,
  sampleCurve, shapeAero, SHAPE_PRESETS
} from '../../src/core/carShape.js';
import { CarModel } from '../../src/core/model.js';
import { buildGeometry } from '../../src/core/geometry.js';
import { encodeShareCodeV2, decodeShareCodeV2 } from '../../src/storage/sharecode.js';

test('default shape is valid, in clamps, and differs from other presets', () => {
  const d = defaultShape();
  assert.equal(isValidShape(d), true);
  assert.equal(d.heights.length, STATIONS);
  assert.equal(d.widths.length, STATIONS);
  assert.ok(d.heights.every((h) => h >= 60 && h <= 700));
  assert.ok(d.widths.every((w) => w >= 40 && w <= 660));
  for (const [, preset] of Object.entries(SHAPE_PRESETS)) {
    assert.equal(isValidShape(preset.shape ?? preset), true);
  }
  const sleek = SHAPE_PRESETS.sleek.shape ?? SHAPE_PRESETS.sleek;
  assert.notDeepEqual(sleek.heights, d.heights, 'sleek preset must differ from default');
});

test('sanitizeShape clamps rogue values and repairs broken input', () => {
  const rogue = { heights: Array(STATIONS).fill(5000), widths: Array(STATIONS).fill(-50) };
  const s = sanitizeShape(rogue);
  assert.ok(s.heights.every((h) => h <= 700 && h >= 60));
  assert.ok(s.widths.every((w) => w <= 660 && w >= 40));
  assert.equal(isValidShape(null), false, 'null shape is not valid');
  assert.equal(isValidShape({ heights: [1, 2], widths: [] }), false, 'wrong lengths rejected pre-sanitize');
  assert.equal(isValidShape(sanitizeShape({ heights: [1, 2], widths: [] })), true, 'sanitize REPAIRS broken input to defaults');
});

test('sampleCurve hits the endpoints exactly and stays monotone-safe', () => {
  const vals = [100, 150, 300, 400, 480, 545, 585, 608, 622, 632, 638, 640];
  assert.equal(sampleCurve(vals, 0), vals[0]);
  assert.equal(sampleCurve(vals, 1), vals[vals.length - 1]);
  const mid = sampleCurve(vals, 0.5);
  const lo = Math.min(vals[5], vals[6]) - 60, hi = Math.max(vals[5], vals[6]) + 60;
  assert.ok(mid > lo && mid < hi, `mid sample ${mid} must stay near its stations (Catmull-Rom allows mild overshoot)`);
  // between two equal stations the curve is flat (no wild overshoot)
  const flat = Array(STATIONS).fill(300);
  assert.ok(Math.abs(sampleCurve(flat, 0.37) - 300) < 1e-9);
});

test('smoothShape keeps endpoints and reduces local wiggle', () => {
  const s = defaultShape();
  s.heights[5] = 200; // deliberate dent into a 545/585 neighbourhood
  const sm = smoothShape(s, 2);
  assert.equal(sm.heights[0], s.heights[0]);
  assert.equal(sm.heights[STATIONS - 1], s.heights[STATIONS - 1]);
  const wiggle = (a) => a.slice(1, -1).reduce((acc, v, i) => acc + Math.abs(a[i + 2] - v), 0);
  assert.ok(wiggle(sm.heights) < wiggle(s.heights), 'smoothing must reduce wiggle');
});

test('shapeAero: sleek shape has less frontal area + higher fineness than default', () => {
  const model = new CarModel({});
  const { meta } = buildGeometry(model);
  const saDef = meta.shapeAero;
  const sleekModel = new CarModel({}, { shape: SHAPE_PRESETS.sleek.shape ?? SHAPE_PRESETS.sleek });
  const saSleek = buildGeometry(sleekModel).meta.shapeAero;
  assert.ok(saSleek.frontalAreaM2 < saDef.frontalAreaM2, `${saSleek.frontalAreaM2} < ${saDef.frontalAreaM2}`);
  assert.ok(saSleek.fineness > saDef.fineness, 'sleek must be finer');
  assert.ok(saDef.frontalAreaM2 > 0.3 && saDef.frontalAreaM2 < 1.2, 'default frontal area plausible');
  assert.ok(saDef.fineness > 3 && saDef.fineness < 12, 'fineness plausible');
});

test('geometry follows the sculpted shape: raising the deck raises the roof', () => {
  const base = new CarModel({});
  const tall = defaultShape();
  for (let i = 5; i < 11; i++) tall.heights[i] += 90;
  const tallModel = new CarModel({}, { shape: tall });
  const m1 = buildGeometry(base).meta;
  const m2 = buildGeometry(tallModel).meta;
  assert.ok(m2.bodyTop > m1.bodyTop, 'taller deck → higher body roof');
  assert.ok(m2.shapeAero.frontalAreaM2 > m1.shapeAero.frontalAreaM2, 'taller deck → more frontal area');
  const mesh = buildGeometry(tallModel).mesh;
  assert.equal(mesh.verts.filter((v) => !isFinite(v?.[0])).length, 0, 'no NaN verts for user-shaped body');
});

test('CarModel carries shape: hash changes with shape, clone preserves it', () => {
  const a = new CarModel({});
  const b = new CarModel({}, { shape: SHAPE_PRESETS.sleek.shape ?? SHAPE_PRESETS.sleek });
  assert.notEqual(a.hash, b.hash, 'shape is part of model identity');
  const c = b.clone();
  assert.deepEqual(c.shape, b.shape);
  assert.equal(c.hash, b.hash);
});

test('APEX2 share code round-trips the sculpted shape; APEX1 still decodes', () => {
  const shape = defaultShape();
  shape.heights[4] = 340; shape.widths[7] = 600;
  const code = encodeShareCodeV2({ rideHeightF: 20, rwAngle: 18 }, shape);
  assert.ok(code.startsWith('APEX2-'));
  const back = decodeShareCodeV2(code);
  assert.ok(back);
  assert.ok(Math.abs(back.shape.heights[4] - 340) < 3.5);
  assert.ok(Math.abs(back.shape.widths[7] - 600) < 3.5);
  assert.ok(Math.abs(back.params.rwAngle - 18) < 0.3);
  // tamper → checksum fail
  assert.equal(decodeShareCodeV2(code.slice(0, -3) + 'aaa'), null);
  // legacy APEX1 (no shape) still decodes
  const legacy = decodeShareCodeV2(encodeShareCodeV2({ rideHeightF: 25, rwAngle: 15 }, null));
  assert.equal(legacy.shape, null);
  assert.ok(legacy.params.rideHeightF > 24);
});
