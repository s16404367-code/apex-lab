// APEX LAB — geometry builder (spec §4: 3D geometry is the truth).
// Builds ONE mesh from CarModel params, in millimetres, +z up, +x toward the
// front axle, origin at ground under the car centre, mid-wheelbase.
// The same mesh feeds: 3D viewport, 2D blueprint, legality checks and the
// aero-solver's derived areas. There is no separate cosmetic model.

import { rad } from './util.js';

// mesh: { verts:[[x,y,z]], quads:[[a,b,c,d,group]], tris:[[a,b,c,group]] }
function mesh() {
  return { verts: [], quads: [], tris: [] };
}
function v(m, x, y, z) {
  m.verts.push([x, y, z]);
  return m.verts.length - 1;
}
function quad(m, a, b, c, d, group) {
  m.quads.push([a, b, c, d, group]);
}
/** Axis-aligned box centred at (cx,cy,cz) with sizes (dx,dy,dz). */
function box(m, cx, cy, cz, dx, dy, dz, group) {
  const x0 = cx - dx / 2, x1 = cx + dx / 2, y0 = cy - dy / 2, y1 = cy + dy / 2, z0 = cz - dz / 2, z1 = cz + dz / 2;
  const A = v(m, x0, y0, z0), B = v(m, x1, y0, z0), C = v(m, x1, y1, z0), D = v(m, x0, y1, z0);
  const E = v(m, x0, y0, z1), F = v(m, x1, y0, z1), G = v(m, x1, y1, z1), H = v(m, x0, y1, z1);
  quad(m, A, B, C, D, group); quad(m, E, F, G, H, group);
  quad(m, A, B, F, E, group); quad(m, B, C, G, F, group);
  quad(m, C, D, H, G, group); quad(m, D, A, E, H, group);
}
/** Tapered box along x: at x0 cross-section (w0,h0), at x1 (w1,h1), bottom at z0. */
function taperX(m, x0, x1, w0, h0, w1, h1, z0, group, yCenter = 0) {
  const A = v(m, x1, yCenter + w1 / 2, z0), B = v(m, x1, yCenter - w1 / 2, z0);
  const C = v(m, x0, yCenter - w0 / 2, z0), D = v(m, x0, yCenter + w0 / 2, z0);
  const E = v(m, x1, yCenter + w1 / 2, z0 + h1), F = v(m, x1, yCenter - w1 / 2, z0 + h1);
  const G = v(m, x0, yCenter - w0 / 2, z0 + h0), H = v(m, x0, yCenter + w0 / 2, z0 + h0);
  quad(m, A, B, C, D, group); quad(m, E, F, G, H, group);
  quad(m, A, B, F, E, group); quad(m, B, C, G, F, group);
  quad(m, C, D, H, G, group); quad(m, D, A, E, H, group);
}
/** Wing element: N-segment cambered slab. angle deg about y-axis, camber in % of chord. */
function wing(m, x, z, span, chord, angleDeg, camberPct, segments, group) {
  const a = rad(angleDeg);
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const dx = -Math.cos(a) * t * chord;
    const dz = Math.sin(a) * t * chord + Math.sin(t * Math.PI) * chord * camberPct * 0.01;
    pts.push([v(m, x + dx, 0, z + dz), v(m, x + dx, span / 2, z + dz)]);
  }
  for (let i = 0; i < segments; i++) {
    quad(m, pts[i][0], pts[i + 1][0], pts[i + 1][1], pts[i][1], group);
  }
}
/** Wheel: 8-segment cylinder along y. */
function wheel(m, x, y, r, w, group) {
  const N = 8;
  const ring0 = [];
  const ring1 = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    ring0.push(v(m, x + Math.cos(t) * r, y - w / 2, r + Math.sin(t) * r));
    ring1.push(v(m, x + Math.cos(t) * r, y + w / 2, r + Math.sin(t) * r));
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    quad(m, ring0[i], ring0[j], ring1[j], ring1[i], group);
    m.tris.push([ring0[i], ring0[j], v(m, x, y - w / 2, r), group]);
    m.tris.push([ring1[i], ring1[j], v(m, x, y + w / 2, r), group]);
  }
}

/**
 * Build the car mesh. Returns { mesh, meta } — meta carries derived dimensions
 * used by the legality engine, blueprint and the aero solver.
 */
export function buildGeometry(model) {
  const p = model.params;
  const m = mesh();
  const wb = p.wheelbase;
  const xF = wb / 2;
  const xR = -wb / 2;
  const hF = p.rideHeightF;
  const hR = p.rideHeightR;
  const hAvg = (hF + hR) / 2;

  // ---- floor + plank ----
  const floorW = p.floorWidth;
  const floorZ = hAvg + 12;
  box(m, (xR + 250 + xF - 260) / 2, 0, floorZ, xF - 260 - (xR + 250), floorW, 26, 'floor');

  // ---- diffuser ramp ----
  {
    const x0 = xR + 250;
    const x1 = x0 + p.diffLen;
    const zExit = p.diffExitH;
    const halfW0 = floorW / 2 * 0.9;
    const halfW1 = floorW / 2 * 0.82;
    const A = v(m, x1, halfW1, zExit), B = v(m, x1, -halfW1, zExit);
    const C = v(m, x0, -halfW0, floorZ - 12), D = v(m, x0, halfW0, floorZ - 12);
    const E = v(m, x1, halfW1, zExit + 20), F = v(m, x1, -halfW1, zExit + 20);
    const G = v(m, x0, -halfW0, floorZ + 14), H = v(m, x0, halfW0, floorZ + 14);
    quad(m, A, B, C, D, 'diffuser'); quad(m, E, F, G, H, 'diffuser');
    quad(m, A, B, F, E, 'diffuser'); quad(m, B, C, G, F, 'diffuser');
    quad(m, C, D, H, G, 'diffuser'); quad(m, D, A, E, H, 'diffuser');
  }

  // ---- nose + chassis ----
  const noseTip = xF + 950;
  const noseW = 95 + (1 - p.noseTaper) * 60;
  taperX(m, xF - 250, noseTip, p.bodyWidth * 0.5, 300, noseW, 130 + (1 - p.noseTaper) * 40, hAvg + 55, 'nose');
  taperX(m, xR + 600, xF - 250, p.bodyWidth * 0.55, 420, p.bodyWidth * 0.5, 300, hAvg + 30, 'body');

  // ---- sidepods (mirrored) ----
  const podY = p.bodyWidth * 0.25 + 90;
  const podW = (Math.min(p.floorWidth, p.track) - p.bodyWidth * 0.5) / 2 - 40;
  if (podW > 40) {
    const podH = 320 + p.sidepodShoulder * 90;
    for (const s of [1, -1]) {
      taperX(m, xR + 700, xF + 150, podW * p.rearContraction, 240 + p.sidepodShoulder * 60, podW, podH, hAvg + 80, 'sidepod', s * podY);
    }
    // cooling inlets sit on the pod front face
    for (const s of [1, -1]) {
      box(m, xF + 160, s * podY, hAvg + 130 + podH / 2 - 40, 60, podW * 0.7, 60 + 130 * p.coolInlet, 'cooling');
    }
  }

  // ---- engine cover ----
  taperX(m, xR + 150, xF - 100, 340, 480, 150, 420, hAvg + 240, 'engineCover');

  // ---- front wing ----
  {
    const x = xF + 620;
    const span = Math.min(p.fwSpan, 1900);
    const z = p.fwHeight + hAvg * 0.2;
    wing(m, x, z, span, p.fwChord, p.fwAngle, 3 + p.fwCamber * 0.2, 6, 'frontWing');
    const flapX = x - Math.cos(rad(p.fwAngle)) * p.fwChord * 0.55;
    const flapZ = z + Math.sin(rad(p.fwAngle)) * p.fwChord * 0.55 + 18;
    wing(m, flapX, flapZ, span * 0.92, p.fwChord * 0.55, p.fwAngle + p.fwFlap, 4 + p.fwCamber * 0.25, 5, 'frontWing');
    for (const s of [1, -1]) {
      const y = s * span / 2;
      const zBase = p.fwHeight + hAvg * 0.2 - 20;
      const zTop = Math.min(zBase + 200, hAvg + 260);
      const a = v(m, x + 60, y, zBase), b = v(m, x + 60, y + s * 22, zBase);
      const c = v(m, x - p.fwChord - 30, y + s * 22, zTop), d = v(m, x - p.fwChord - 30, y, zTop);
      quad(m, a, b, c, d, 'frontWing');
    }
  }

  // ---- rear wing ----
  {
    const x = xR - 320;
    const span = Math.min(p.rwSpan, 1020);
    const z = p.rwHeight;
    wing(m, x, z, span, p.rwChord, -p.rwAngle, 5, 6, 'rearWing');
    const flapX = x - Math.cos(rad(p.rwAngle)) * p.rwChord * 0.52;
    const flapZ = z - Math.sin(rad(p.rwAngle)) * p.rwChord * 0.52 + 14;
    wing(m, flapX, flapZ, span * 0.96, p.rwChord * 0.52, -(p.rwAngle + 14), 5, 5, 'rearWing');
    for (const s of [1, -1]) {
      box(m, x - p.rwChord / 2, s * span / 2, z + 55, p.rwChord * 1.35, 16, 250, 'rearWing');
    }
    wing(m, x + 70, hAvg + 330, span * 0.8, 130, -10, 3, 3, 'rearWing'); // beam wing
    box(m, x + 20, 0, hAvg + 250, 44, 44, 200, 'rearWing');              // central pylon
  }

  // ---- wheels ----
  wheel(m, xF, p.track / 2, 330, 305, 'wheels');
  wheel(m, xF, -p.track / 2, 330, 305, 'wheels');
  wheel(m, xR, p.track / 2, 340, 405, 'wheels');
  wheel(m, xR, -p.track / 2, 340, 405, 'wheels');

  // ---- derived meta (single source for legality + blueprint + solver areas) ----
  const overallWidth = Math.max(p.track + 325, p.bodyWidth, floorW);
  const overallHeight = p.rwHeight + 70; // endplate top edge
  const overallLength = noseTip - (xR - 320 - p.rwChord - 60);
  const rakeDeg = (Math.atan2(hR - hF, wb) * 180) / Math.PI;
  const meta = {
    wheelbase: wb,
    xF, xR, hF, hR, hAvg,
    rakeDeg,
    overallWidth,
    overallHeight,
    overallLength,
    noseTip,
    frontalArea: estimateFrontalArea(p),
    floorArea: (p.floorWidth / 1000) * ((p.wheelbase - 510) / 1000)
  };
  return { mesh: m, meta };
}

/** Rough frontal-area estimate (m²) used by the drag model. */
export function estimateFrontalArea(p) {
  const body = (p.bodyWidth / 1000) * 0.42;
  const wheels = ((p.track / 1000) * 0.33 * 2 + (p.track / 1000) * 0.4 * 2) * 0.55;
  const cooling = (p.coolInlet * 0.09 + 0.05) * 2;
  return body + wheels + cooling;
}
