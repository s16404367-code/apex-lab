// APEX LAB — geometry builder v4.2 (spec §4: 3D geometry is the truth).
// REAL-CAR SURFACES:
//  • chassis body = lofted superellipse cross-sections generated from the
//    player-sculpted SHAPE curves (src/core/carShape.js) — smooth, welded
//    normals in the WebGL layer make it read as a car, not boxes
//  • wings = true airfoil sections (camber + thickness), lofted along span
//  • halo & suspension = swept tubes
//  • wheels = lathed tyre profile (rounded shoulders) + rim + spokes
// Every face carries a part tag; meta carries dimensions for legality,
// blueprint and the solver, plus shapeAero descriptors for the physics.

import { rad, clamp } from './util.js';
import { defaultShape, sanitizeShape, sampleCurve, shapeAero, STATIONS } from './carShape.js';

// mesh: { verts, quads, tris, parts }
function mesh() {
  return { verts: [], quads: [], tris: [], parts: {} };
}
function v(m, x, y, z) {
  m.verts.push([x, y, z]);
  return m.verts.length - 1;
}
function quad(m, a, b, c, d, group) {
  if (!m.parts[group]) m.parts[group] = [];
  m.parts[group].push(m.quads.length);
  m.quads.push([a, b, c, d, group]);
}
function tri(m, a, b, c, group) {
  m.tris.push([a, b, c, group]);
}

/**
 * Sweep closed ring profiles (rings of [x,y,z] coordinate arrays) along
 * stations. Produces welded quads between rings + fan caps. All consumers
 * pass COORDINATES; vertex creation happens here (single convention).
 */
function loftRings(m, ringsPts, group, capStart = true, capEnd = true) {
  const rings = ringsPts.map((pts) => pts.map((P) => v(m, P[0], P[1], P[2])));
  for (let s = 0; s < rings.length - 1; s++) {
    const A = rings[s];
    const B = rings[s + 1];
    const n = A.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      quad(m, A[i], A[j], B[j], B[i], group);
    }
  }
  const cap = (ring, flip) => {
    let cx = 0, cy = 0, cz = 0;
    for (const idx of ring) { cx += m.verts[idx][0]; cy += m.verts[idx][1]; cz += m.verts[idx][2]; }
    const C = v(m, cx / ring.length, cy / ring.length, cz / ring.length);
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      if (flip) tri(m, C, ring[j], ring[i], group);
      else tri(m, C, ring[i], ring[j], group);
    }
  };
  if (capStart) cap(rings[0], true);
  if (capEnd) cap(rings[rings.length - 1], false);
}

/** Superellipse cross-section ring. */
function seRing(cx, halfW, zB, zT, nExp, ringN = 22) {
  const hz = Math.max((zT - zB) / 2, 4);
  const cz = (zT + zB) / 2;
  const ring = [];
  const ex = 2 / nExp;
  for (let i = 0; i < ringN; i++) {
    const a = (i / ringN) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const yy = Math.sign(ca) * Math.pow(Math.abs(ca), ex);
    let zz = Math.sign(sa) * Math.pow(Math.abs(sa), ex);
    let z = cz + zz * hz;
    if (z < zB) z = zB;                       // flat floor region
    if (z > zT) z = zT;
    ring.push([cx, yy * halfW, z]);
  }
  return ring;
}

/** NACA-ish airfoil wing: camber + thickness, lofted along span with taper. */
function airfoilWing(m, x, z, span, chord, angleDeg, camberPct, thickPct, group, yCenter = 0, taper = 1, chordSegs = 10, spanSegs = 4) {
  const a = rad(angleDeg);
  const prof = [];
  for (let i = 0; i <= chordSegs; i++) {
    const t = i / chordSegs;
    const zc = Math.sin(t * Math.PI) * chord * camberPct * 0.01;
    const th = (thickPct / 100) * chord * Math.sqrt(Math.max(1 - Math.pow(2 * t - 1, 2), 0.04)) * 0.9 + (thickPct / 100) * chord * 0.08 * (1 - t);
    prof.push([-Math.cos(a) * t * chord, zc + th / 2]);
  }
  for (let i = chordSegs - 1; i >= 1; i--) {
    const t = i / chordSegs;
    const zc = Math.sin(t * Math.PI) * chord * camberPct * 0.01;
    const th = (thickPct / 100) * chord * Math.sqrt(Math.max(1 - Math.pow(2 * t - 1, 2), 0.04)) * 0.9 + (thickPct / 100) * chord * 0.08 * (1 - t);
    prof.push([-Math.cos(a) * t * chord, zc - th / 2]);
  }
  const ringsPts = [];
  for (let s = 0; s <= spanSegs; s++) {
    const st = s / spanSegs;
    const y = yCenter + (st - 0.5) * span;
    const taperF = 1 - (1 - taper) * st;
    ringsPts.push(prof.map(([dx, dz]) => [x + dx * taperF, y, z + dz * taperF]));
  }
  loftRings(m, ringsPts, group, true, true);
}

/** Sweep a circular tube along points. */
function tube(m, pts, r, sides, group) {
  const ringsPts = [];
  for (let s = 0; s < pts.length; s++) {
    const P = pts[s];
    const Pn = pts[Math.min(s + 1, pts.length - 1)];
    const Pp = pts[Math.max(s - 1, 0)];
    let u = [Pn[0] - Pp[0], Pn[1] - Pp[1], Pn[2] - Pp[2]];
    const ul = Math.hypot(...u) || 1;
    u = u.map((c) => c / ul);
    let up = Math.abs(u[2]) > 0.92 ? [1, 0, 0] : [0, 0, 1];
    let sy = [u[1] * up[2] - u[2] * up[1], u[2] * up[0] - u[0] * up[2], u[0] * up[1] - u[1] * up[0]];
    const sl = Math.hypot(...sy) || 1;
    sy = sy.map((c) => c / sl);
    const uz = [sy[1] * u[2] - sy[2] * u[1], sy[2] * u[0] - sy[0] * u[2], sy[0] * u[1] - sy[1] * u[0]];
    const ring = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      ring.push([P[0] + (sy[0] * Math.cos(a) + uz[0] * Math.sin(a)) * r,
        P[1] + (sy[1] * Math.cos(a) + uz[1] * Math.sin(a)) * r,
        P[2] + (sy[2] * Math.cos(a) + uz[2] * Math.sin(a)) * r]);
    }
    ringsPts.push(ring);
  }
  loftRings(m, ringsPts, group, true, true);
}

/** Straight round bar between two points. */
function bar(m, a, b, r, sides, group) {
  tube(m, [a, b], r, sides, group);
}

/** Rounded box (superellipse-ish via lofted rings along x). */
function roundedBox(m, cx, cy, cz, dx, dy, dz, group, nExp = 2.6, ringN = 14, steps = 2) {
  const ringsPts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / Math.max(steps, 1);
    const x = cx - dx / 2 + dx * t;
    ringsPts.push(seRing(x, dy / 2, cz - dz / 2, cz + dz / 2, nExp, ringN));
  }
  loftRings(m, ringsPts, group, true, true);
}

/** Lathe a tyre: rounded shoulders, flat tread, bead → rim. */
function tyre(m, x, y, r, w, group) {
  const N = 22; // around axle
  const prof = [
    { l: -w * 0.47, R: 0.66 },  // bead L
    { l: -w * 0.50, R: 0.86 },  // sidewall L
    { l: -w * 0.47, R: 0.965 }, // shoulder L
    { l: -w * 0.38, R: 1.0 },
    { l: -w * 0.20, R: 1.012 },
    { l: 0.0, R: 1.015 },       // crown
    { l: w * 0.20, R: 1.012 },
    { l: w * 0.38, R: 1.0 },
    { l: w * 0.47, R: 0.965 },  // shoulder R
    { l: w * 0.50, R: 0.86 },
    { l: w * 0.47, R: 0.66 }    // bead R
  ];
  const ringsPts = prof.map(({ l, R }) => {
    const ring = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      ring.push([x + Math.cos(a) * r * R, y + l, r + Math.sin(a) * r * R]);
    }
    return ring;
  });
  loftRings(m, ringsPts, group, true, true);
}

/** Rim: dish + 5 spokes + hub (all quads/tris tagged with `group`). */
function rim(m, x, y, r, w, group) {
  const N = 16;
  const R = r * 0.64;
  const side = w * 0.47;
  for (const s of [1, -1]) {
    const inner = [];
    const outer = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      inner.push(v(m, x + Math.cos(a) * R * 0.25, y + s * (side - 6), r + Math.sin(a) * R * 0.25));
      outer.push(v(m, x + Math.cos(a) * R, y + s * side, r + Math.sin(a) * R));
    }
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      quad(m, inner[i], inner[j], outer[j], outer[i], group);
    }
    tri(m, inner[0], inner[Math.floor(N / 3)], inner[Math.floor((2 * N) / 3)], group);
    tri(m, inner[1], inner[1 + Math.floor(N / 3)], inner[1 + Math.floor((2 * N) / 3)], group);
  }
  // spokes (visible on outboard side)
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const a2 = a + 0.28;
    const P1 = [x + Math.cos(a) * R * 0.9, y + side * 1.02, r + Math.sin(a) * R * 0.9];
    const P2 = [x + Math.cos(a2) * R * 0.9, y + side * 1.02, r + Math.sin(a2) * R * 0.9];
    const P3 = [x + Math.cos(a2) * R * 0.24, y + side * 0.98, r + Math.sin(a2) * R * 0.24];
    const P4 = [x + Math.cos(a) * R * 0.24, y + side * 0.98, r + Math.sin(a) * R * 0.24];
    quad(m, v(m, ...P1), v(m, ...P2), v(m, ...P3), v(m, ...P4), 'detail');
  }
  void side;
}

/**
 * Build the car mesh from CarModel (params + sculpted shape).
 * Returns { mesh, meta }.
 */
export function buildGeometry(model) {
  const p = model.params;
  const shape = sanitizeShape(model.shape ?? defaultShape());
  const m = mesh();
  const wb = p.wheelbase;
  const xF = wb / 2;
  const xR = -wb / 2;
  const hF = p.rideHeightF;
  const hR = p.rideHeightR;
  const hAvg = (hF + hR) / 2;

  const noseTip = xF + 950;
  const tailX = xR - 320 - 380;              // behind rear wing centreline
  const zAt = (t) => sampleCurve(shape.heights, t);
  const wAt = (t) => sampleCurve(shape.widths, t);

  // ================= FLOOR =================
  const floorW = p.floorWidth;
  const floorZ = hAvg + 12;
  const floorX0 = xR + 250, floorX1 = xF - 260;
  {
    const A = v(m, floorX1, -floorW / 2, floorZ), B = v(m, floorX1, floorW / 2, floorZ);
    const C = v(m, floorX0, floorW / 2, floorZ), D = v(m, floorX0, -floorW / 2, floorZ);
    const E = v(m, floorX1, -floorW / 2, floorZ - 26), F = v(m, floorX1, floorW / 2, floorZ - 26);
    const G = v(m, floorX0, floorW / 2, floorZ - 26), H = v(m, floorX0, -floorW / 2, floorZ - 26);
    quad(m, A, B, C, D, 'floor'); quad(m, E, F, G, H, 'floor');
    quad(m, A, B, F, E, 'floor'); quad(m, B, C, G, F, 'floor');
    quad(m, C, D, H, G, 'floor'); quad(m, D, A, E, H, 'floor');
    // edge wings
    for (const s of [1, -1]) {
      const a = v(m, floorX1, s * (floorW / 2 - 12), floorZ + 6);
      const b = v(m, floorX1, s * (floorW / 2 + 24), floorZ + 18);
      const c = v(m, floorX0, s * (floorW / 2 + 24), floorZ + 18);
      const d = v(m, floorX0, s * (floorW / 2 - 12), floorZ + 6);
      quad(m, a, b, c, d, 'floor');
    }
  }

  // ================= DIFFUSER =================
  {
    const x0 = floorX0;
    const x1 = x0 + p.diffLen;
    const zExit = p.diffExitH;
    const halfW0 = floorW / 2 * 0.9;
    const halfW1 = floorW / 2 * 0.8;
    const A = v(m, x1, halfW1, zExit), B = v(m, x1, -halfW1, zExit);
    const C = v(m, x0, -halfW0, floorZ - 12), D = v(m, x0, halfW0, floorZ - 12);
    const E = v(m, x1, halfW1, zExit + 18), F = v(m, x1, -halfW1, zExit + 18);
    const G = v(m, x0, -halfW0, floorZ + 12), H = v(m, x0, halfW0, floorZ + 12);
    quad(m, A, B, C, D, 'diffuser'); quad(m, E, F, G, H, 'diffuser');
    quad(m, A, B, F, E, 'diffuser'); quad(m, B, C, G, F, 'diffuser');
    quad(m, C, D, H, G, 'diffuser'); quad(m, D, A, E, H, 'diffuser');
    for (const f of [0.45, 0.72, 0.9]) {
      bar(m, [x0, -floorW / 2 * 0.9 * f, floorZ], [x1, -floorW / 2 * 0.8 * f, zExit + 14], 5, 6, 'diffuser');
      bar(m, [x0, floorW / 2 * 0.9 * f, floorZ], [x1, floorW / 2 * 0.8 * f, zExit + 14], 5, 6, 'diffuser');
    }
  }

  // ================= CHASSIS BODY — sculpted by the player's shape curves =====
  // One silhouette: heights[] = top profile, widths[] = plan half-width
  // (sidepods are PART of the body now — one sculpted form, like the 2026 cars).
  const bodyMaxW = Math.max(...shape.widths);
  {
    const NSEC = 30;
    const ringsPts = [];
    const nExpAt = (t) => 2.2 + 0.6 * Math.sin(Math.PI * clamp(t * 1.15, 0.06, 0.95));
    const topTAt = (t) => 0.94 - 0.38 * Math.sin(Math.PI * clamp(t, 0.04, 0.96));
    const zBAt = (t) => hAvg + 46 - 34 * clamp(t * 2.2, 0, 1);
    for (let i = 0; i <= NSEC; i++) {
      const t = i / NSEC;
      const x = noseTip + (tailX - noseTip) * t;
      ringsPts.push(seRing(x, wAt(t), zBAt(t), zAt(t), nExpAt(t), 26));
    }
    loftRings(m, ringsPts, 'body', true, true);

    // cockpit opening (dark inset) + headrest
    const cx1 = noseTip + (tailX - noseTip) * 0.24;
    const cx2 = noseTip + (tailX - noseTip) * 0.44;
    {
      const a = v(m, cx1, -150, zAt(0.24) + 2), b = v(m, cx1, 150, zAt(0.24) + 2);
      const c = v(m, cx2, 128, zAt(0.44) - 6), d = v(m, cx2, -128, zAt(0.44) - 6);
      quad(m, a, b, c, d, 'cooling');
    }
    // airbox snorkel above headrest + dark intake mouth
    const ax = noseTip + (tailX - noseTip) * 0.47;
    const az = zAt(0.47);
    roundedBox(m, ax - 46, 0, az + 34, 220, 148, 70, 'body', 2.4, 12, 1);
    roundedBox(m, ax + 74, 0, az + 36, 44, 116, 52, 'cooling', 2.4, 12, 0);

    // cooling inlets on the sidepod flanks (morph with the sculpted width)
    for (const sgn of [1, -1]) {
      const inT = 0.55;
      const inX = noseTip + (tailX - noseTip) * inT;
      const inY = sgn * (wAt(inT) - 34);
      const inZ = hAvg + 150;
      const inH = 58 + 140 * p.coolInlet;
      roundedBox(m, inX, inY, inZ, 96, 34, inH, 'cooling', 2.4, 10, 0);
    }

    // dorsal fin + engine-cover crest into the rear wing zone
    const finX0 = noseTip + (tailX - noseTip) * 0.52;
    const finX1 = xR - 230;
    const fz0 = zAt(0.52);
    const fz1 = Math.min(p.rwHeight + 40, 940);
    {
      const A = v(m, finX0, 0, fz0), B = v(m, finX1, 0, hAvg + 320);
      const C = v(m, finX1, 0, fz1), D = v(m, finX0, 0, fz0 + 26);
      quad(m, A, B, C, D, 'body');
      const A2 = v(m, finX0, 9, fz0), B2 = v(m, finX1, 9, hAvg + 320);
      const C2 = v(m, finX1, 9, fz1), D2 = v(m, finX0, 9, fz0 + 26);
      quad(m, A2, B2, C2, D2, 'body');
      quad(m, A, B, B2, A2, 'body');
      quad(m, D, C, C2, D2, 'body');
      quad(m, A, D, D2, A2, 'body');
      quad(m, B, C, C2, B2, 'body');
    }
    // T-cam
    roundedBox(m, finX0 + 60, 0, fz0 + 50, 84, 52, 38, 'detail', 2.2, 10, 1);
    // downwash shoulder vanes along the flanks
    for (const sgn of [1, -1]) {
      bar(m, [noseTip + (tailX - noseTip) * 0.5, sgn * wAt(0.5) * 0.94, zAt(0.5) * 0.99],
        [xR + 300, sgn * wAt(0.85) * 0.9, zAt(0.85)], 9, 6, 'detail');
    }
    // livery flash
    for (const sgn of [1, -1]) {
      const a = v(m, noseTip + (tailX - noseTip) * 0.2, sgn * wAt(0.2) * 0.99, zAt(0.2) * 0.62);
      const b = v(m, noseTip + (tailX - noseTip) * 0.62, sgn * wAt(0.62) * 0.99, zAt(0.62) * 0.55);
      const c = v(m, noseTip + (tailX - noseTip) * 0.62, sgn * wAt(0.62) * 0.99, zAt(0.62) * 0.36);
      const d = v(m, noseTip + (tailX - noseTip) * 0.2, sgn * wAt(0.2) * 0.99, zAt(0.2) * 0.34);
      quad(m, a, b, c, d, 'detail');
    }
  }

  // ================= HALO (tube, realistic curve) =================
  {
    const cx = xF - 250;
    const zTop = zAt(0.30) + 128;
    const haloPath = [];
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI * (1 - i / 14);
      const yy = Math.cos(a) * 292;
      const dz = Math.sin(a) * 118;
      haloPath.push([cx - 195 - Math.cos(a) * -55, yy, zTop + dz - 44]);
    }
    tube(m, haloPath, 17, 8, 'halo');
    bar(m, [cx - 302, 0, zAt(0.24) + 60], [cx - 262, 0, zTop + 70], 15, 8, 'halo');
    for (const s of [1, -1]) {
      bar(m, [cx + 150, s * 252, zAt(0.36) + 40], [cx + 44, s * 288, zTop + 34], 14, 8, 'halo');
    }
  }

  // ================= MIRRORS =================
  for (const s of [1, -1]) {
    roundedBox(m, xF - 190, s * (wAt(0.3) + 74), zAt(0.3) + 62, 84, 44, 26, 'detail', 2.2, 10, 0);
    bar(m, [xF - 178, s * wAt(0.3) * 0.96, zAt(0.3) + 40], [xF - 186, s * (wAt(0.3) + 52), zAt(0.3) + 60], 8, 6, 'detail');
  }

  // ================= FRONT WING (airfoil elements) =================
  const fwSpan = Math.min(p.fwSpan, 2000);
  const fwX = xF + 620;
  const fwZ = p.fwHeight + hAvg * 0.2;
  {
    airfoilWing(m, fwX, fwZ, fwSpan, p.fwChord, p.fwAngle, 3 + p.fwCamber * 0.2, 5.5, 'frontWing');
    const f1x = fwX - Math.cos(rad(p.fwAngle)) * p.fwChord * 0.5;
    const f1z = fwZ + Math.sin(rad(p.fwAngle)) * p.fwChord * 0.5 + 14;
    airfoilWing(m, f1x, f1z, fwSpan * 0.94, p.fwChord * 0.42, p.fwAngle + p.fwFlap * 0.6, 4 + p.fwCamber * 0.2, 4.5, 'frontWing');
    const f2x = f1x - Math.cos(rad(p.fwAngle + p.fwFlap * 0.6)) * p.fwChord * 0.42;
    const f2z = f1z + Math.sin(rad(p.fwAngle + p.fwFlap * 0.6)) * p.fwChord * 0.42 + 12;
    airfoilWing(m, f2x, f2z, fwSpan * 0.88, p.fwChord * 0.3, p.fwAngle + p.fwFlap, 4 + p.fwCamber * 0.25, 4, 'frontWing');
    // endplates (rounded slim shells) + diveplanes
    for (const s of [1, -1]) {
      const y = s * fwSpan / 2;
      roundedBox(m, fwX - p.fwChord * 0.35, y, fwZ + 18, p.fwChord * 1.25, 13, 84 + p.fwFlap * 1.6, 'frontWing', 2.4, 12, 1);
      bar(m, [fwX - 46, s * (fwSpan / 2 - 6), fwZ + 52], [fwX - 150, s * (fwSpan / 2 - 8), fwZ + 92], 8, 6, 'frontWing');
    }
    // nose pylons
    for (const s of [1, -1]) {
      bar(m, [fwX - 30, s * 44, fwZ + 8], [xF + 560, s * 38, hAvg + 66], 13, 8, 'frontWing');
    }
  }

  // ================= REAR WING (airfoil + DRS flap part) =================
  const rwSpan = Math.min(p.rwSpan, 1120);
  const rwX = xR - 320;
  const rwZ = Math.min(p.rwHeight, 1000);
  {
    airfoilWing(m, rwX, rwZ, rwSpan, p.rwChord * 0.62, -p.rwAngle * 0.85, 4.5, 6.5, 'rearWing', 0, 0.96);
    const pivotX = rwX - Math.cos(rad(p.rwAngle)) * p.rwChord * 0.5;
    const pivotZ = rwZ - Math.sin(rad(p.rwAngle)) * p.rwChord * 0.5 + 10;
    airfoilWing(m, pivotX, pivotZ, rwSpan * 0.97, p.rwChord * 0.45, -(p.rwAngle + 16), 3, 5, 'rearWingFlap', 0, 0.96);
    for (const s of [1, -1]) {
      roundedBox(m, rwX - p.rwChord * 0.38, s * rwSpan / 2, rwZ + 34, p.rwChord * 1.18, 13, 210, 'rearWing', 2.4, 12, 1);
      bar(m, [xR + 60, s * 118, hAvg + 300], [rwX + p.rwChord * 0.3, s * 118, rwZ - 4], 12, 8, 'rearWing');
    }
    airfoilWing(m, rwX + 90, hAvg + 330, rwSpan * 0.8, 130, -11, 3, 6, 'rearWing', 0, 0.98, 8, 2);
    // rain light
    roundedBox(m, xR - 150, 0, hAvg + 300, 26, 42, 62, 'detail', 2.2, 10, 0);
  }

  // ================= WHEELS (lathed tyres + rims) =================
  const wheelsMeta = [];
  const wPos = [
    { x: xF, y: p.track / 2, r: 330, w: 305, id: 'wheelFL' },
    { x: xF, y: -p.track / 2, r: 330, w: 305, id: 'wheelFR' },
    { x: xR, y: p.track / 2, r: 340, w: 405, id: 'wheelRL' },
    { x: xR, y: -p.track / 2, r: 340, w: 405, id: 'wheelRR' }
  ];
  for (const wp of wPos) {
    tyre(m, wp.x, wp.y, wp.r, wp.w, 'wheels');
    rim(m, wp.x, wp.y, wp.r, wp.w, 'rims');
    wheelsMeta.push({ ...wp, part: wp.id });
    // 2026 arch fairing: arc tube over the wheel
    {
      const R = wp.r + 40;
      const pts = [];
      const a0 = wp.x === xF ? rad(18) : rad(38);
      const a1 = wp.x === xF ? rad(162) : rad(142);
      for (let i = 0; i <= 10; i++) {
        const a = a0 + ((a1 - a0) * i) / 10;
        pts.push([wp.x + Math.cos(a) * R, wp.y, wp.r * 0.16 + Math.sin(a) * R]);
      }
      tube(m, pts, 16, 8, 'body');
      // arch side plate
      const plate = [];
      for (let i = 0; i <= 10; i++) {
        const a = a0 + ((a1 - a0) * i) / 10;
        plate.push([wp.x + Math.cos(a) * R, wp.y + (wp.y > 0 ? -1 : 1) * (wp.w / 2 + 20), wp.r * 0.16 + Math.sin(a) * R]);
      }
      tube(m, plate, 4, 6, 'body');
    }
  }

  // ================= SUSPENSION (round tubes) =================
  const wAtX = (x) => sampleCurve(shape.widths, clamp((x - noseTip) / (tailX - noseTip), 0, 1));
  for (const [wp, dir] of [[wPos[0], -1], [wPos[1], -1], [wPos[2], 1], [wPos[3], 1]]) {
    const bodyX = wp.x + dir * 320;
    const zHub = wp.r + 18;
    const yIn = Math.min(wp.y * 0.4, wAtX(bodyX) * 0.82);
    bar(m, [bodyX, yIn, hAvg + 168], [wp.x, wp.y, zHub + 42], 10, 8, 'suspension');
    bar(m, [bodyX - 55, yIn, hAvg + 92], [wp.x, wp.y, zHub - 46], 10, 8, 'suspension');
    bar(m, [bodyX - 20, yIn + Math.sign(wp.y) * 40, hAvg + 46], [wp.x, wp.y, zHub], 8, 8, 'suspension');
    bar(m, [bodyX - 140, yIn + Math.sign(wp.y) * 40, hAvg + 150], [wp.x - 55, wp.y, zHub + 8], 7, 8, 'suspension');
  }

  // ---- derived meta ----
  const overallWidth = Math.max(p.track + 325, bodyMaxW * 2 + 60, floorW);
  const bodyTop = Math.max(...shape.heights);
  const overallHeight = Math.max(p.rwHeight + 70, hAvg + bodyTop + 96);
  const overallLength = noseTip - (rwX - p.rwChord - 60);
  const rakeDeg = (Math.atan2(hR - hF, wb) * 180) / Math.PI;
  const meta = {
    wheelbase: wb,
    xF, xR, hF, hR, hAvg,
    rakeDeg,
    overallWidth,
    overallHeight,
    overallLength,
    noseTip,
    bodyTop,
    frontalArea: shapeAero(shape, model).frontalAreaM2,
    floorArea: (p.floorWidth / 1000) * ((p.wheelbase - 510) / 1000),
    wheels: wheelsMeta,
    shapeAero: shapeAero(shape, model),
    drsPivot: {
      x: rwX - Math.cos(rad(p.rwAngle)) * p.rwChord * 0.5,
      z: rwZ - Math.sin(rad(p.rwAngle)) * p.rwChord * 0.5 + 10,
      span: rwSpan * 0.97,
      openAngle: p.rwAngle * 0.85 + 16
    }
  };
  return { mesh: m, meta };
}

/** Rough frontal-area estimate from params (legacy fallback). */
export function estimateFrontalArea(p) {
  const body = (p.bodyWidth / 1000) * 0.42;
  const wheels = ((p.track / 1000) * 0.33 * 2 + (p.track / 1000) * 0.4 * 2) * 0.55;
  const cooling = (p.coolInlet * 0.09 + 0.05) * 2;
  return body + wheels + cooling;
}

export { STATIONS };
