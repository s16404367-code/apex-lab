// APEX LAB — geometry builder (spec §4: 3D geometry is the truth).
// Builds ONE detailed 2026-regulation-style car mesh from CarModel params,
// in millimetres, +z up, +x toward the front axle, origin at ground under the
// car centre, mid-wheelbase.
//
// V4.1: parts-based construction for the WebGL layer — every face carries a
// group tag, and `mesh.parts` maps animated part names → face ranges:
//   rearWingFlap (DRS actuation), wheelFL/FR/RL/RR (spin + steer),
//   chassis, frontWing, rearWing, halo, suspension, cooling, detail.
// The same mesh feeds: WebGL viewport, 2D blueprint (true projections),
// legality checks and the aero-solver's derived areas.

import { rad } from './util.js';

// mesh: { verts:[[x,y,z]], quads:[[a,b,c,d,group]], tris:[[a,b,c,group]], parts:{} }
function mesh() {
  return { verts: [], quads: [], tris: [], parts: {} };
}
function v(m, x, y, z) {
  m.verts.push([x, y, z]);
  return m.verts.length - 1;
}
function tagFace(m, group) {
  if (!m.parts[group]) m.parts[group] = [];
  m.parts[group].push(m.quads.length);
}
function quad(m, a, b, c, d, group) {
  m.quads.push([a, b, c, d, group]);
  tagFace(m, group);
}

/** Axis-aligned box centred at (cx,cy,cz). */
function box(m, cx, cy, cz, dx, dy, dz, group) {
  const x0 = cx - dx / 2, x1 = cx + dx / 2, y0 = cy - dy / 2, y1 = cy + dy / 2, z0 = cz - dz / 2, z1 = cz + dz / 2;
  const A = v(m, x0, y0, z0), B = v(m, x1, y0, z0), C = v(m, x1, y1, z0), D = v(m, x0, y1, z0);
  const E = v(m, x0, y0, z1), F = v(m, x1, y0, z1), G = v(m, x1, y1, z1), H = v(m, x0, y1, z1);
  quad(m, A, B, C, D, group); quad(m, E, F, G, H, group);
  quad(m, A, B, F, E, group); quad(m, B, C, G, F, group);
  quad(m, C, D, H, G, group); quad(m, D, A, E, H, group);
}

/** Beam between two 3D points with rectangular cross-section (w × t). */
function beam(m, a, b, w, t, group) {
  const ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...ax) || 1;
  const ux = ax.map((c) => c / len);
  // reference up vector
  let up = Math.abs(ux[2]) > 0.93 ? [1, 0, 0] : [0, 0, 1];
  // side = u × up
  let sy = [ux[1] * up[2] - ux[2] * up[1], ux[2] * up[0] - ux[0] * up[2], ux[0] * up[1] - ux[1] * up[0]];
  const sl = Math.hypot(...sy) || 1;
  sy = sy.map((c) => c / sl);
  // recompute up = sy × u
  const uz = [sy[1] * ux[2] - sy[2] * ux[1], sy[2] * ux[0] - sy[0] * ux[2], sy[0] * ux[1] - sy[1] * ux[0]];
  const hw = w / 2, ht = t / 2;
  const corner = (P, s, u) => v(m, P[0] + sy[0] * s + uz[0] * u, P[1] + sy[1] * s + uz[1] * u, P[2] + sy[2] * s + uz[2] * u);
  const A = corner(a, -hw, -ht), B = corner(a, +hw, -ht), C = corner(a, +hw, +ht), D = corner(a, -hw, +ht);
  const E = corner(b, -hw, -ht), F = corner(b, +hw, -ht), G = corner(b, +hw, +ht), H = corner(b, -hw, +ht);
  quad(m, A, B, C, D, group); quad(m, E, F, G, H, group);
  quad(m, A, B, F, E, group); quad(m, B, C, G, F, group);
  quad(m, C, D, H, G, group); quad(m, D, A, E, H, group);
}

/**
 * Lofted body: stations [{x, halfW, zB, zT, topT (top width factor 0..1)}]
 * Creates a closed hull: top, bottom, left, right + front/rear caps.
 * Segments between stations are subdivided for smoothness.
 */
function loft(m, stations, group, sub = 1) {
  const S = [];
  for (let i = 0; i < stations.length - 1; i++) {
    for (let s = 0; s < sub; s++) {
      const t = s / sub;
      S.push(lerpStation(stations[i], stations[i + 1], t));
    }
  }
  S.push(stations[stations.length - 1]);
  for (let i = 0; i < S.length - 1; i++) {
    const A = S[i], B = S[i + 1];
    // top surface (crowned: top width = halfW * topT)
    const a1 = v(m, A.x, -A.halfW * A.topT, A.zT), a2 = v(m, A.x, A.halfW * A.topT, A.zT);
    const b1 = v(m, B.x, -B.halfW * B.topT, B.zT), b2 = v(m, B.x, B.halfW * B.topT, B.zT);
    quad(m, a1, a2, b2, b1, group);
    // bottom
    const c1 = v(m, A.x, A.halfW, A.zB), c2 = v(m, A.x, -A.halfW, A.zB);
    const d1 = v(m, B.x, B.halfW, B.zB), d2 = v(m, B.x, -B.halfW, B.zB);
    quad(m, c1, c2, d2, d1, group);
    // sides (vertical panel from bottom width to top width)
    for (const s of [1, -1]) {
      const e1 = v(m, A.x, s * A.halfW, A.zB), e2 = v(m, A.x, s * A.halfW * A.topT, A.zT);
      const f1 = v(m, B.x, s * B.halfW, B.zB), f2 = v(m, B.x, s * B.halfW * B.topT, B.zT);
      quad(m, e1, e2, f2, f1, group);
    }
  }
  // caps
  const F0 = S[0], FN = S[S.length - 1];
  {
    const a = v(m, F0.x, -F0.halfW * F0.topT, F0.zT), b = v(m, F0.x, F0.halfW * F0.topT, F0.zT);
    const c = v(m, F0.x, F0.halfW, F0.zB), d = v(m, F0.x, -F0.halfW, F0.zB);
    quad(m, a, b, c, d, group);
    const e = v(m, FN.x, -FN.halfW * FN.topT, FN.zT), f = v(m, FN.x, FN.halfW * FN.topT, FN.zT);
    const g = v(m, FN.x, FN.halfW, FN.zB), h = v(m, FN.x, -FN.halfW, FN.zB);
    quad(m, e, f, g, h, group);
  }
  return S;
}
function lerpStation(A, B, t) {
  return {
    x: A.x + (B.x - A.x) * t,
    halfW: A.halfW + (B.halfW - A.halfW) * t,
    zB: A.zB + (B.zB - A.zB) * t,
    zT: A.zT + (B.zT - A.zT) * t,
    topT: A.topT + ((B.topT ?? 0.6) - (A.topT ?? 0.6)) * t
  };
}

/** Wing element: cambered slab, angle deg, camber % of chord. Returns verts of LE for pivot use. */
function wing(m, x, z, span, chord, angleDeg, camberPct, segments, group, yCenter = 0) {
  const a = rad(angleDeg);
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const dx = -Math.cos(a) * t * chord;
    const dz = Math.sin(a) * t * chord + Math.sin(t * Math.PI) * chord * camberPct * 0.01;
    pts.push([v(m, x + dx, yCenter, z + dz), v(m, x + dx, yCenter + span / 2, z + dz)]);
  }
  for (let i = 0; i < segments; i++) {
    quad(m, pts[i][0], pts[i + 1][0], pts[i + 1][1], pts[i][1], group);
  }
  return pts;
}

/** Wheel: tyre (cylinder) + rim disc + hub. Returns nothing; tagged as part. */
function wheel(m, x, y, r, w, group) {
  const N = 14;
  const ringL = [];
  const ringR = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    ringL.push(v(m, x + Math.cos(t) * r, y - w / 2, r + Math.sin(t) * r));
    ringR.push(v(m, x + Math.cos(t) * r, y + w / 2, r + Math.sin(t) * r));
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    quad(m, ringL[i], ringL[j], ringR[j], ringR[i], group);
  }
  // sidewalls + rim
  const rimR = r * 0.62;
  const rimL = [];
  const rimRr = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    rimL.push(v(m, x + Math.cos(t) * rimR, y - w / 2 - 1, r + Math.sin(t) * rimR));
    rimRr.push(v(m, x + Math.cos(t) * rimR, y + w / 2 + 1, r + Math.sin(t) * rimR));
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    quad(m, ringL[i], ringL[j], rimL[j], rimL[i], 'detail');
    quad(m, ringR[i], ringR[j], rimRr[j], rimRr[i], 'detail');
    m.tris.push([rimL[i], rimL[j], v(m, x, y - w / 2 - 2, r), 'detail']);
    m.tris.push([rimRr[j], rimRr[i], v(m, x, y + w / 2 + 2, r), 'detail']);
  }
  m.tris.push([rimL[0], rimL[2], rimL[4], 'detail']);
  m.tris.push([rimRr[0], rimRr[2], rimRr[4], 'detail']);
}

/** Wheel-arch fairing (2026 regs): arc shell over the wheel. */
function wheelArch(m, x, y, r, w, a0deg, a1deg, group) {
  const N = 8;
  const R = r + 42;
  const WW = w + 46;
  const inner = [];
  const outer = [];
  for (let i = 0; i <= N; i++) {
    const t = rad(a0deg + ((a1deg - a0deg) * i) / N);
    inner.push([x + Math.cos(t) * R, y - WW / 2, r * 0.18 + Math.sin(t) * R]);
    outer.push([x + Math.cos(t) * R, y + WW / 2, r * 0.18 + Math.sin(t) * R]);
  }
  const vi = inner.map((P) => v(m, P[0], P[1], P[2]));
  const vo = outer.map((P) => v(m, P[0], P[1], P[2]));
  for (let i = 0; i < N; i++) {
    quad(m, vi[i], vi[i + 1], vo[i + 1], vo[i], group);
  }
  // side skirts of the arch
  for (const ring of [vi, vo]) {
    for (let i = 0; i < N; i++) {
      const a = m.verts[ring[i]];
      const b = m.verts[ring[i + 1]];
      const drop = 30;
      const a2 = v(m, a[0], a[1], Math.max(a[2] - drop, r * 0.25));
      const b2 = v(m, b[0], b[1], Math.max(b[2] - drop, r * 0.25));
      quad(m, ring[i], ring[i + 1], b2, a2, group);
    }
  }
}

/**
 * Build the car mesh. Returns { mesh, meta } — meta carries derived
 * dimensions for legality/blueprint/solver + animation anchors.
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
  const podY = p.bodyWidth * 0.25 + 90;
  const podW = Math.max((Math.min(p.floorWidth, p.track) - p.bodyWidth * 0.5) / 2 - 40, 60);

  // ================= FLOOR (with tunnel edge detail) =================
  const floorW = p.floorWidth;
  const floorZ = hAvg + 12;
  const floorX0 = xR + 250, floorX1 = xF - 260;
  box(m, (floorX0 + floorX1) / 2, 0, floorZ, floorX1 - floorX0, floorW, 26, 'floor');
  // floor edge wings (thin angled strips along both edges)
  for (const s of [1, -1]) {
    const a = v(m, floorX1, s * (floorW / 2 - 14), floorZ + 8);
    const b = v(m, floorX1, s * (floorW / 2 + 26), floorZ + 20);
    const c = v(m, floorX0, s * (floorW / 2 + 26), floorZ + 20);
    const d = v(m, floorX0, s * (floorW / 2 - 14), floorZ + 8);
    quad(m, a, b, c, d, 'floor');
    const a2 = v(m, floorX1, s * (floorW / 2 - 14), floorZ - 18);
    const b2 = v(m, floorX1, s * (floorW / 2 + 26), floorZ + 6);
    const c2 = v(m, floorX0, s * (floorW / 2 + 26), floorZ + 6);
    const d2 = v(m, floorX0, s * (floorW / 2 - 14), floorZ - 18);
    quad(m, a2, d2, c2, b2, 'floor');
  }

  // ================= DIFFUSER (ramp + strakes) =================
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
    // strakes
    for (const f of [0.45, 0.72, 0.9]) {
      const y0 = floorW / 2 * 0.9 * f;
      const y1 = floorW / 2 * 0.8 * f;
      beam(m, [x0, -y0, floorZ], [x1, -y1, zExit + 16], 8, 26, 'diffuser');
      beam(m, [x0, y0, floorZ], [x1, y1, zExit + 16], 8, 26, 'diffuser');
    }
  }

  // ================= MAIN BODY LOFT (2026 sleek profile) =================
  const noseTip = xF + 950;
  const noseW = 95 + (1 - p.noseTaper) * 55;
  loft(m, [
    { x: noseTip,        halfW: noseW * 0.55, zB: hAvg + 42, zT: hAvg + 118, topT: 0.9 },
    { x: xF + 700,       halfW: noseW * 0.8,  zB: hAvg + 34, zT: hAvg + 150, topT: 0.85 },
    { x: xF + 330,       halfW: 150,          zB: hAvg + 26, zT: hAvg + 235, topT: 0.8 },
    { x: xF - 60,        halfW: 205,          zB: hAvg + 20, zT: hAvg + 330, topT: 0.75 },
    { x: xF - 420,       halfW: p.bodyWidth * 0.24, zB: hAvg + 16, zT: hAvg + 405, topT: 0.72 },
    { x: xF - 900,       halfW: p.bodyWidth * 0.26, zB: hAvg + 12, zT: hAvg + 430, topT: 0.7 },
    { x: xR + 430,       halfW: p.bodyWidth * 0.24, zB: hAvg + 10, zT: hAvg + 400, topT: 0.68 },
    { x: xR + 40,        halfW: 150,          zB: hAvg + 10, zT: hAvg + 360, topT: 0.7 },
    { x: xR - 130,       halfW: 105,          zB: hAvg + 14, zT: hAvg + 330, topT: 0.8 }
  ], 'body', 2);

  // ================= AIRBOX + DORSAL FIN =================
  {
    // airbox intake above cockpit
    const ax = xF - 560;
    box(m, ax, 0, hAvg + 445, 190, 150, 90, 'body');
    const a = v(m, ax + 95, -70, hAvg + 400), b = v(m, ax + 95, 70, hAvg + 400);
    const c = v(m, ax + 95, -60, hAvg + 490), d = v(m, ax + 95, 60, hAvg + 490);
    quad(m, a, b, d, c, 'cooling');
    // dorsal fin sweeping to the rear wing
    const finX0 = ax + 60, finX1 = xR - 220;
    const zT = hAvg + 470;
    const A = v(m, finX0, 0, zT - 130), B = v(m, finX1, 0, hAvg + 330);
    const C = v(m, finX1, 0, hAvg + 330 + 130), D = v(m, finX0, 0, zT);
    quad(m, A, B, C, D, 'body');
    const A2 = v(m, finX0, 9, zT - 130), B2 = v(m, finX1, 9, hAvg + 330);
    const C2 = v(m, finX1, 9, hAvg + 330 + 130), D2 = v(m, finX0, 9, zT);
    quad(m, A2, B2, C2, D2, 'body');
    // fin side caps
    for (const [P0, P1, P2, P3, s] of [[A, B, C, D, -1], [A2, B2, C2, D2, 1]]) {
      quad(m, P0, P1, P2, P3, 'body');
    }
    // T-cam
    box(m, finX0 + 40, 0, zT + 18, 70, 46, 34, 'detail');
  }

  // ================= HALO =================
  {
    const cx = xF - 240;
    const zBase = hAvg + 330;
    const zTop = hAvg + 470;
    const N = 12;
    // ring: from left shoulder, over the cockpit, to right shoulder
    const prev = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const ang = Math.PI * (1 - t); // rear → top → front
      const y = Math.cos(ang) * 300;
      const dz = Math.sin(ang) * 130;
      const x = cx - 180 + Math.sin(ang) * -60;
      prev.push([v(m, x, y - 26, zTop + dz - 40), v(m, x, y + 26, zTop + dz - 40)]);
    }
    for (let i = 0; i < N; i++) quad(m, prev[i][0], prev[i + 1][0], prev[i + 1][1], prev[i][1], 'halo');
    // front pillar
    beam(m, [cx - 300, 0, hAvg + 240], [cx - 245, 0, zTop + 88], 34, 30, 'halo');
    // shoulder mounts
    for (const s of [1, -1]) beam(m, [cx + 150, s * 250, zBase + 60], [cx + 40, s * 296, zTop + 40], 30, 26, 'halo');
  }

  // ================= MIRRORS =================
  for (const s of [1, -1]) {
    box(m, xF - 190, s * (p.bodyWidth * 0.24 + 90), hAvg + 375, 90, 46, 30, 'detail');
    beam(m, [xF - 180, s * p.bodyWidth * 0.24, hAvg + 360], [xF - 190, s * (p.bodyWidth * 0.24 + 70), hAvg + 375], 16, 14, 'detail');
  }

  // ================= SIDEPODS (low 2026 downwash ramps + inlets) =================
  for (const s of [1, -1]) {
    loft(m, [
      { x: xF + 150,  halfW: podW * 0.55, zB: hAvg + 30, zT: hAvg + 200, topT: 0.9 },
      { x: xF + 40,   halfW: podW * 0.62, zB: hAvg + 22, zT: hAvg + 235, topT: 0.85 },
      { x: xF - 500,  halfW: podW * 0.6,  zB: hAvg + 16, zT: hAvg + 225, topT: 0.7 },
      { x: xR + 380,  halfW: podW * 0.4 * p.rearContraction, zB: hAvg + 12, zT: hAvg + 170, topT: 0.75 },
      { x: xR + 640,  halfW: podW * 0.18 * p.rearContraction, zB: hAvg + 10, zT: hAvg + 140, topT: 0.8 }
    ], 'sidepod', 2).valueOf();
    // inlet: dark inset on the pod face
    const inH = 60 + 150 * p.coolInlet;
    box(m, xF + 150, s * podY, hAvg + 60 + inH / 2, 34, podW * 0.72, inH, 'cooling');
    // shoulder downwash surface accent
    beam(m, [xF + 40, s * (podY + podW * 0.5), hAvg + 232], [xR + 300, s * podY * 0.7, hAvg + 300], 26, 10, 'detail');
  }

  // ================= FRONT WING =================
  const fwSpan = Math.min(p.fwSpan, 2000);
  const fwX = xF + 620;
  const fwZ = p.fwHeight + hAvg * 0.2;
  {
    // main plane
    wing(m, fwX, fwZ, fwSpan, p.fwChord, p.fwAngle, 3 + p.fwCamber * 0.2, 8, 'frontWing');
    // two upper flaps (separate group → flex/animation)
    const f1x = fwX - Math.cos(rad(p.fwAngle)) * p.fwChord * 0.5;
    const f1z = fwZ + Math.sin(rad(p.fwAngle)) * p.fwChord * 0.5 + 14;
    wing(m, f1x, f1z, fwSpan * 0.94, p.fwChord * 0.42, p.fwAngle + p.fwFlap * 0.6, 4 + p.fwCamber * 0.2, 6, 'frontWing');
    const f2x = f1x - Math.cos(rad(p.fwAngle + p.fwFlap * 0.6)) * p.fwChord * 0.42;
    const f2z = f1z + Math.sin(rad(p.fwAngle + p.fwFlap * 0.6)) * p.fwChord * 0.42 + 12;
    wing(m, f2x, f2z, fwSpan * 0.88, p.fwChord * 0.3, p.fwAngle + p.fwFlap, 4 + p.fwCamber * 0.25, 5, 'frontWing');
    // endplates with diveplane
    for (const s of [1, -1]) {
      const y = s * fwSpan / 2;
      const zBase = fwZ - 18;
      const zTop = fwZ + 60 + p.fwFlap;
      box(m, fwX - p.fwChord * 0.35, y, (zBase + zTop) / 2, p.fwChord * 1.25, 14, zTop - zBase, 'frontWing');
      // diveplane
      beam(m, [fwX - 40, s * (fwSpan / 2 - 6), zTop - 14], [fwX - 150, s * (fwSpan / 2 - 8), zTop + 34], 26, 8, 'frontWing');
    }
    // nose pylons connecting wing to chassis
    for (const s of [1, -1]) {
      beam(m, [fwX - 30, s * 46, fwZ + 6], [xF + 560, s * 40, hAvg + 60], 30, 22, 'frontWing');
    }
  }

  // ================= REAR WING (main + DRS flap part) =================
  const rwSpan = Math.min(p.rwSpan, 1120);
  const rwX = xR - 320;
  const rwZ = Math.min(p.rwHeight, 1000);
  {
    // mainplane
    wing(m, rwX, rwZ, rwSpan, p.rwChord * 0.62, -p.rwAngle * 0.85, 4, 8, 'rearWing');
    // DRS flap — separate part; pivot stored in meta for the WebGL actuator
    const flapChord = p.rwChord * 0.45;
    const flapPts = wing(m, rwX - Math.cos(rad(p.rwAngle)) * p.rwChord * 0.5, rwZ - Math.sin(rad(p.rwAngle)) * p.rwChord * 0.5 + 10,
      rwSpan * 0.97, flapChord, -(p.rwAngle + 16), 3, 6, 'rearWingFlap');
    // endplates
    for (const s of [1, -1]) {
      box(m, rwX - p.rwChord * 0.4, s * rwSpan / 2, rwZ + 40, p.rwChord * 1.15, 14, 200, 'rearWing');
      // lee flag/plate detail
      beam(m, [rwX - p.rwChord * 0.8, s * rwSpan / 2, rwZ + 130], [rwX + p.rwChord * 0.2, s * rwSpan / 2, rwZ + 130], 12, 40, 'rearWing');
    }
    // swan-neck pylons
    for (const s of [1, -1]) {
      beam(m, [xR + 60, s * 120, hAvg + 300], [rwX + p.rwChord * 0.32, s * 120, rwZ - 6], 30, 20, 'rearWing');
    }
    // beam wing
    wing(m, rwX + 90, hAvg + 330, rwSpan * 0.8, 130, -11, 3, 4, 'rearWing');
    // rain light
    box(m, xR - 150, 0, hAvg + 300, 26, 40, 60, 'detail');
  }

  // ================= WHEELS + 2026 ARCH FAIRINGS =================
  const wheelsMeta = [];
  const wPos = [
    { x: xF, y: p.track / 2, r: 330, w: 305, id: 'wheelFL' },
    { x: xF, y: -p.track / 2, r: 330, w: 305, id: 'wheelFR' },
    { x: xR, y: p.track / 2, r: 340, w: 405, id: 'wheelRL' },
    { x: xR, y: -p.track / 2, r: 340, w: 405, id: 'wheelRR' }
  ];
  for (const wp of wPos) {
    wheel(m, wp.x, wp.y, wp.r, wp.w, 'wheels');
    wheelsMeta.push({ ...wp, part: wp.id });
    // arches: fronts full arc per 2026 regs, rears smaller top shell
    wheelArch(m, wp.x, wp.y, wp.r, wp.w, wp.x === xF ? 15 : 35, wp.x === xF ? 165 : 145, 'body');
  }

  // ================= SUSPENSION (wishbones + pushrods) =================
  for (const [wp, ang] of [[wPos[0], 0.35], [wPos[1], -0.35], [wPos[2], 0.3], [wPos[3], -0.3]]) {
    const bodyX = wp.x + (wp.x > 0 ? -320 : 320);
    const zHub = wp.r + 20;
    beam(m, [bodyX, wp.y * 0.42, hAvg + 170], [wp.x, wp.y, zHub + 40], 22, 14, 'suspension');
    beam(m, [bodyX - 60, wp.y * 0.42, hAvg + 90], [wp.x, wp.y, zHub - 45], 22, 14, 'suspension');
    beam(m, [bodyX - 20, wp.y * 0.5, hAvg + 40], [wp.x, wp.y, zHub], 16, 12, 'suspension');
    // toe link
    beam(m, [bodyX - 140, wp.y * 0.5, hAvg + 150], [wp.x - 60, wp.y, zHub + 10], 14, 10, 'suspension');
  }

  // ================= ACCENT LIVERY STRIPES =================
  {
    // nose stripe
    beam(m, [noseTip - 40, 0, hAvg + 112], [xF + 240, 0, hAvg + 205], 26, 6, 'detail');
    // fin flash
    beam(m, [xF - 480, 4.5, hAvg + 450], [xR - 200, 4.5, hAvg + 430], 30, 2, 'detail');
    // sidepod hash
    for (const s of [1, -1]) {
      beam(m, [xF - 60, s * (podY + podW * 0.25), hAvg + 150], [xF - 380, s * (podY + podW * 0.25), hAvg + 160], 20, 4, 'detail');
    }
  }

  // ---- derived meta (single source for legality + blueprint + solver + 3D anim) ----
  const overallWidth = Math.max(p.track + 325, p.bodyWidth, floorW);
  const overallHeight = Math.max(p.rwHeight + 70, hAvg + 520); // RW top or fin/T-cam
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
    frontalArea: estimateFrontalArea(p),
    floorArea: (p.floorWidth / 1000) * ((p.wheelbase - 510) / 1000),
    wheels: wheelsMeta,
    drsPivot: { x: rwX - Math.cos(rad(p.rwAngle)) * p.rwChord * 0.5, z: rwZ - Math.sin(rad(p.rwAngle)) * p.rwChord * 0.5 + 10, span: rwSpan * 0.97, openAngle: p.rwAngle * 0.85 + 16 }
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
