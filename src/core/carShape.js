// APEX LAB — SHAPE STUDIO core (spec §10 MODE B, shape-first design).
// The chassis is defined by two editable curves the player sculpts:
//   heights[] — top silhouette (mm above reference plane) at 12 stations
//   widths[]  — half-width (mm) at the same stations
// These curves are the SOURCE OF TRUTH for the chassis body: the 3D mesh,
// the blueprint, the legality checks and the aero solver all derive from them
// (spec §4). Sliders are gone for the body — you design the SHAPE, then test.

import { clamp } from './util.js';

export const STATIONS = 12;

export function defaultShape() {
  return {
    // 2026-style silhouette: droop nose → cockpit rise → engine cover → tail deck
    heights: [128, 150, 205, 300, 400, 480, 545, 585, 608, 622, 632, 638],
    // plan half-widths incl. sidepod mass: needle nose → wide flanks → coke bottle → rear hips
    widths: [92, 128, 190, 300, 425, 530, 590, 618, 630, 622, 566, 478]
  };
}

export const SHAPE_PRESETS = {
  standard: { label: '2026 Standard', shape: defaultShape() },
  sleek: {
    label: 'Sleek Low-Drag',
    shape: {
      heights: [110, 128, 160, 215, 275, 330, 378, 412, 438, 458, 472, 480],
      widths: [78, 102, 148, 234, 330, 412, 462, 488, 498, 490, 446, 378]
    }
  },
  highload: {
    label: 'High-Load Platform',
    shape: {
      heights: [150, 178, 240, 330, 430, 510, 575, 620, 650, 668, 680, 688],
      widths: [104, 148, 222, 348, 488, 588, 650, 678, 685, 672, 610, 515]
    }
  }
};

const H_MIN = 60, H_MAX = 700;
const W_MIN = 40, W_MAX = 660;

export function sanitizeShape(shape) {
  const def = defaultShape();
  const out = { heights: [], widths: [] };
  for (let i = 0; i < STATIONS; i++) {
    const h = Number(shape?.heights?.[i]);
    const w = Number(shape?.widths?.[i]);
    out.heights.push(isFinite(h) ? clamp(h, H_MIN, H_MAX) : def.heights[i]);
    out.widths.push(isFinite(w) ? clamp(w, W_MIN, W_MAX) : def.widths[i]);
  }
  // keep monotonic station order implicit; enforce tail not lower than nose base
  return out;
}

export function isValidShape(shape) {
  return !!shape && Array.isArray(shape.heights) && Array.isArray(shape.widths)
    && shape.heights.length === STATIONS && shape.widths.length === STATIONS
    && [...shape.heights, ...shape.widths].every((v) => isFinite(v));
}

/** 3-point smoothing passes over both curves (keeps endpoints). */
export function smoothShape(shape, passes = 2) {
  const s = sanitizeShape(shape);
  const smooth = (arr) => {
    const out = [...arr];
    for (let p = 0; p < passes; p++) {
      for (let i = 1; i < arr.length - 1; i++) {
        out[i] = (arr[i - 1] + 2 * arr[i] + arr[i + 1]) / 4;
      }
      arr = out;
    }
    return out;
  };
  return { heights: smooth([...s.heights]), widths: smooth([...s.widths]) };
}

/** Catmull-Rom interpolation across stations, t ∈ [0,1] (0 = nose tip, 1 = tail). */
export function sampleCurve(values, t) {
  const n = values.length - 1;
  const x = clamp(t, 0, 1) * n;
  const i = Math.min(Math.floor(x), n - 1);
  const f = x - i;
  const p0 = values[Math.max(i - 1, 0)];
  const p1 = values[i];
  const p2 = values[i + 1];
  const p3 = values[Math.min(i + 2, n)];
  return (
    0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)
  );
}

/**
 * Aero-relevant shape descriptors, derived by integrating the curves.
 * Consumed by the solver (meta.shapeAero) — the shape genuinely changes the physics.
 */
export function shapeAero(shape, model) {
  const s = sanitizeShape(shape);
  const p = model?.params ?? {};
  const wb = p.wheelbase ?? 3600;
  const lengthM = (wb + 950 + 320 + 380 + 60) / 1000; // metres (matches geometry meta)
  const N = 48;
  let maxArea = 0;
  let maxHalfW = 0;
  const zAt = (t) => sampleCurve(s.heights, t);
  const wAt = (t) => sampleCurve(s.widths, t);
  // mid-body bottom ≈ floor line; section height = top − bottom
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const hz = Math.max(zAt(t) - 40, 40) / 2;
    const area = 3.4 * wAt(t) * hz * 1e-6; // superellipse approx, mm² → m²
    maxArea = Math.max(maxArea, area);
    maxHalfW = Math.max(maxHalfW, wAt(t));
  }
  const dEq = 2 * Math.sqrt(maxArea / Math.PI);
  const fineness = lengthM / Math.max(dEq, 0.05);
  const lengthMm = lengthM * 1000;
  const deckSlope = (zAt(1) - zAt(0.72)) / (0.28 * lengthMm);   // rear-deck upwash mm/mm
  const noseSlope = (zAt(0.22) - zAt(0)) / (0.22 * lengthMm);   // nose droop (positive = rising)
  return {
    frontalAreaM2: +maxArea.toFixed(3),
    fineness: +fineness.toFixed(2),
    deckSlope: +deckSlope.toFixed(4),
    noseSlope: +noseSlope.toFixed(4),
    maxWidthMm: Math.round(maxHalfW * 2)
  };
}
