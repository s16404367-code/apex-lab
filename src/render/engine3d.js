// APEX LAB — lightweight 3D renderer (Canvas 2D, painter's algorithm).
// Engineering-style presentation: flat shading + wireframe overlay, ground
// grid, regulation envelope, pressure overlay, force arrows and deterministic
// flow lines derived from the SAME CarModel geometry (never random fields).

import { buildGeometry } from '../core/geometry.js';

const GROUP_COLORS = {
  floor: '#3f8cff', diffuser: '#5ad1ff', nose: '#c9d6e8', body: '#9fb2c8',
  rims: '#9aa7b8', detail: '#c4571e', frontWing: '#ffb454',
  rearWing: '#ff7a6e', wheels: '#39424e', cooling: '#63e6b0'
};

export function createViewer(canvas) {
  const ctx = canvas.getContext('2d');
  const cam = { yaw: 0.72, pitch: 0.34, dist: 7800, tx: 0, tz: 420, fov: 900 };
  let model = null;
  let built = null;      // {mesh, meta}
  let overlay = { envelope: true, pressure: null, forces: null, flow: false, wireframe: true, grid: true };
  let dragging = null;
  let time = 0;
  let flowPhase = 0;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) {
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    }
  }

  function project(p, W, H) {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    let x = p[0] - cam.tx, y = p[1], z = p[2] - cam.tz;
    // yaw about z
    const x1 = x * cy - y * sy;
    const y1 = x * sy + y * cy;
    // pitch about x-axis (screen)
    const z2 = z * cp - y1 * sp;
    const y2 = z * sp + y1 * cp;
    const d = cam.dist;
    const f = cam.fov / (d + z2);
    return { x: W / 2 + x1 * f, y: H / 2 - y2 * f, depth: z2, f };
  }

  function faceNormal(a, b, c) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  }

  function shadeHex(hex, lum) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, ((n >> 16) & 255) * lum)) | 0;
    const g = Math.min(255, Math.max(0, ((n >> 8) & 255) * lum)) | 0;
    const b = Math.min(255, Math.max(0, (n & 255) * lum)) | 0;
    return `rgb(${r},${g},${b})`;
  }

  function render(m2, opts = {}) {
    if (m2) { model = m2; built = buildGeometry(m2); }
    if (!built) return;
    overlay = { ...overlay, ...opts };
    resize();
    time += 1 / 60;
    const W = canvas.width, H = canvas.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = W / dpr, h2 = H / dpr;
    ctx.clearRect(0, 0, w, h2);

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h2);
    bg.addColorStop(0, '#0a0e14');
    bg.addColorStop(1, '#0d1420');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h2);

    drawGround(w, h2);
    if (overlay.grid) drawGrid(w, h2);
    if (overlay.envelope) drawEnvelope(w, h2);
    drawMesh(w, h2);
    if (overlay.flow) drawFlow(w, h2);
    if (overlay.forces && overlay.forces.df) drawForces(w, h2);
    drawHUD(w, h2);
  }

  function drawGround(w, h2) {
    // ground plane shadow ellipse under car
    const pts = [[2800, 0, 0], [-2800, 0, 0]];
    void pts;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    const c = project([0, 0, 0], w, h2);
    ctx.ellipse(c.x, c.y, 2200 * c.f, 1300 * c.f, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGrid(w, h2) {
    ctx.strokeStyle = 'rgba(80,120,170,0.14)';
    ctx.lineWidth = 1;
    for (let x = -5000; x <= 5000; x += 500) {
      ctx.beginPath();
      const a = project([x, -3200, 0], w, h2);
      const b = project([x, 3200, 0], w, h2);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let y = -3000; y <= 3000; y += 500) {
      ctx.beginPath();
      const a = project([-5000, y, 0], w, h2);
      const b = project([5000, y, 0], w, h2);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  function drawEnvelope(w, h2) {
    const E = { l: 5600, w: 2000, h: 950 };
    const x0 = 1800 - E.l * 0.62, x1 = x0 + E.l;
    const y0 = -E.w / 2, y1 = E.w / 2, z1 = E.h;
    const c = [
      project([x0, y0, 0], w, h2), project([x1, y0, 0], w, h2), project([x1, y1, 0], w, h2), project([x0, y1, 0], w, h2),
      project([x0, y0, z1], w, h2), project([x1, y0, z1], w, h2), project([x1, y1, z1], w, h2), project([x0, y1, z1], w, h2)
    ];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    ctx.strokeStyle = 'rgba(90,209,255,0.30)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 5]);
    for (const [a, b] of edges) {
      ctx.beginPath();
      ctx.moveTo(c[a].x, c[a].y); ctx.lineTo(c[b].x, c[b].y); ctx.stroke();
    }
    ctx.setLineDash([]);
    // axle lines + centreline
    const wb = built.meta.wheelbase;
    ctx.strokeStyle = 'rgba(255,180,84,0.25)';
    for (const ax of [wb / 2, -wb / 2]) {
      const a = project([ax, -1100, 2], w, h2);
      const b = project([ax, 1100, 2], w, h2);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(140,160,190,0.18)';
    const a = project([x0, 0, 2], w, h2), b = project([x1, 0, 2], w, h2);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  function drawMesh(w, h2) {
    const { mesh } = built;
    const faces = [];
    for (const q of mesh.quads) {
      const [a, b, c, d, group] = q;
      const A = mesh.verts[a], B = mesh.verts[b], C = mesh.verts[c], D = mesh.verts[d];
      const pa = project(A, w, h2), pb = project(B, w, h2), pc = project(C, w, h2), pd = project(D, w, h2);
      const depth = (pa.depth + pb.depth + pc.depth + pd.depth) / 4;
      const n = faceNormal(A, B, C);
      // light from above-front-left in view space
      const light = [0.35, 0.5, 0.79];
      const lum = 0.42 + 0.58 * Math.abs(n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
      faces.push({ pts: [pa, pb, pc, pd], depth, color: faceColor(group, n), group, lum, n });
    }
    for (const t of mesh.tris) {
      const [a, b, c, group] = t;
      const A = mesh.verts[a], B = mesh.verts[b], C = mesh.verts[c];
      const pa = project(A, w, h2), pb = project(B, w, h2), pc = project(C, w, h2);
      faces.push({ pts: [pa, pb, pc], depth: (pa.depth + pb.depth + pc.depth) / 3, color: faceColor(group, null), group, lum: 0.55, n: null });
    }
    faces.sort((f1, f2) => f2.depth - f1.depth);
    for (const f of faces) {
      ctx.beginPath();
      ctx.moveTo(f.pts[0].x, f.pts[0].y);
      for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i].x, f.pts[i].y);
      ctx.closePath();
      ctx.fillStyle = shadeHex(f.color, f.lum * (overlay.pressure ? pressureTint(f.group) : 1));
      ctx.fill();
      if (overlay.wireframe || overlay.pressure) {
        ctx.strokeStyle = 'rgba(10,16,24,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  function faceColor(group) {
    return GROUP_COLORS[group] ?? '#8899aa';
  }

  /** Pressure overlay: deterministic per-group tint from the solved ledger. */
  function pressureTint(group) {
    const P = overlay.pressure;
    if (!P) return 1;
    const map = { frontWing: P.cla.fw / 1.9, floor: P.cla.floor / 2.4, diffuser: P.cla.floor / 2.6, rearWing: P.cla.rw / 1.7, body: P.cla.body / 0.5, cooling: 0.5 };
    const t = Math.max(0.08, Math.min(1.25, map[group] ?? 0.6));
    return 0.35 + t * 0.9;
  }

  function drawFlow(w, h2) {
    // deterministic streamlines: follow body silhouette heights (no random fields)
    const lines = [];
    const meta = built.meta;
    const ys = [-700, -350, 0, 350, 700];
    for (const y of ys) {
      for (const zOff of [120, 340, 620]) {
        const pts = [];
        for (let x = 3400; x >= -3600; x -= 200) {
          // body profile: approximate height field of the car at (x,y)
          const t = (3400 - x) / 7000;
          const bodyH = Math.max(40,
            150 + 260 * Math.exp(-Math.pow((x - 1000) / 1600, 2)) +      // cockpit hump
            240 * Math.exp(-Math.pow((x + 600) / 1300, 2)) +             // engine cover
            (overlay.pressure ? 0 : 0));
          const z = x > meta.noseTip ? zOff : Math.max(zOff, bodyH * 0.4 + zOff * Math.max(0.35, 1 - 0.45 * Math.exp(-Math.pow((x - 200) / 1800, 2))));
          pts.push([x, y + Math.sin(t * 9 + y / 300) * (30 + 240 * (1 - t)), z]);
        }
        lines.push(pts);
      }
    }
    ctx.lineWidth = 1.2;
    flowPhase = overlay.reducedMotion ? 0 : (flowPhase + 0.02) % 1;
    for (const pts of lines) {
      const proj = pts.map((p) => project(p, w, h2));
      ctx.strokeStyle = 'rgba(90,209,255,0.28)';
      ctx.setLineDash([]);
      ctx.beginPath();
      proj.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      // moving dash highlight
      const idx = Math.floor(flowPhase * (proj.length - 2));
      if (idx < proj.length - 1) {
        ctx.strokeStyle = 'rgba(140,230,255,0.9)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(proj[idx].x, proj[idx].y);
        ctx.lineTo(proj[idx + 1].x, proj[idx + 1].y);
        ctx.stroke();
      }
    }
    void time;
  }

  function drawForces(w, h2) {
    const F = overlay.forces; // {dfFront, dfRear, drag}
    const scale = 2600 / Math.max(F.dfRear, 1);
    const drawArrow = (from, to, color, label) => {
      const a = project(from, w, h2), b = project(to, w, h2);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - 10 * Math.cos(ang - 0.4), b.y - 10 * Math.sin(ang - 0.4));
      ctx.lineTo(b.x - 10 * Math.cos(ang + 0.4), b.y - 10 * Math.sin(ang + 0.4));
      ctx.fill();
      ctx.font = '11px ui-monospace,monospace';
      ctx.fillText(label, b.x + 6, b.y - 6);
    };
    const wb = built.meta.wheelbase;
    const dfF = Math.min(F.dfFront * scale, 950);
    const dfR = Math.min(F.dfRear * scale, 950);
    drawArrow([wb / 2, 0, 120], [wb / 2, 0, 120 + dfF], '#5ad1ff', `DF-F ${Math.round(F.dfFront)}N`);
    drawArrow([-wb / 2, 0, 120], [-wb / 2, 0, 120 + dfR], '#5ad1ff', `DF-R ${Math.round(F.dfRear)}N`);
    drawArrow([0, 0, 320], [-Math.min(F.drag * 0.35, 620), 0, 320], '#ff7a6e', `DRAG ${Math.round(F.drag)}N`);
  }

  function drawHUD(w, h2) {
    ctx.font = '10px ui-monospace,monospace';
    ctx.fillStyle = 'rgba(150,170,200,0.55)';
    ctx.fillText('reduced-order engineering visualisation — NOT CFD', 10, h2 - 10);
    void w;
  }

  // ---- interaction ----
  canvas.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY, mode: e.button === 2 ? 'pan' : 'orbit' }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => { dragging = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
    dragging.x = e.clientX; dragging.y = e.clientY;
    if (dragging.mode === 'orbit') {
      cam.yaw -= dx * 0.008;
      cam.pitch = Math.max(-0.1, Math.min(1.25, cam.pitch + dy * 0.006));
    } else {
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
      cam.tx += (dx * cy - dy * 0) * 4;
      cam.tz = Math.max(30, cam.tz + dy * 4);
      void sy;
    }
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.dist = Math.max(2600, Math.min(22000, cam.dist * (1 + Math.sign(e.deltaY) * 0.09)));
  }, { passive: false });

  function setView(preset) {
    if (preset === 'front') { cam.yaw = Math.PI / 2; cam.pitch = 0.10; cam.dist = 7000; }
    if (preset === 'side') { cam.yaw = 0; cam.pitch = 0.06; cam.dist = 7200; }
    if (preset === 'top') { cam.yaw = 0; cam.pitch = 1.45; cam.dist = 9000; }
    if (preset === 'rear3q') { cam.yaw = -0.72; cam.pitch = 0.34; cam.dist = 7800; }
    if (preset === 'default') { cam.yaw = 0.72; cam.pitch = 0.34; cam.dist = 7800; cam.tx = 0; cam.tz = 420; }
  }

  return { render, setView, camera: cam };
}
