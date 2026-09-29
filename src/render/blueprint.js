// APEX LAB — 2D engineering blueprint (spec §12). V4.1:
// TRUE orthographic projections of the actual CarModel mesh (side/top/front),
// mm grid, auto-calculated dimensions, title block.
// Draws only after layout (requestAnimationFrame) so the canvas is never 0px
// (this was the blank-blueprint bug in v4.0).

import { buildGeometry } from '../core/geometry.js';

export function drawBlueprint(canvas, model, view = 'side') {
  const { mesh, meta } = buildGeometry(model);
  const p = model.params;

  const paint = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(canvas.clientWidth || 900, 320);
    const cssH = parseInt(canvas.getAttribute('data-h') || '360', 10);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = cssW, H = cssH;

    // ---------- sheet ----------
    ctx.fillStyle = '#0b1322';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1d2a3d';
    ctx.lineWidth = 1;
    ctx.strokeRect(6.5, 6.5, W - 13, H - 13);

    // extents per view
    const xMin = meta.xR - 320 - p.rwChord - 80, xMax = meta.noseTip + 60;
    const halfW = meta.overallWidth / 2;
    const zMax = 1400;
    const cfg = {
      side: { w: xMax - xMin, h: zMax, label: 'SIDE ELEVATION' },
      top: { w: xMax - xMin, h: meta.overallWidth + 400, label: 'PLAN VIEW' },
      front: { w: meta.overallWidth + 400, h: zMax, label: 'FRONT ELEVATION' }
    }[view] ?? { w: xMax - xMin, h: zMax, label: 'SIDE ELEVATION' };

    const padL = 50, padR = 44, padT = 34, padB = 40;
    const scale = Math.max(Math.min((W - padL - padR) / cfg.w, (H - padT - padB) / cfg.h), 0.02);
    const xMid = (xMin + xMax) / 2;

    // mapping (car coords → canvas)
    const X = (x) => W / 2 + (x - xMid) * scale;              // side/top horizontal
    const Yz = (z) => H - padB - z * scale;                   // side/front vertical
    const Yy = (y) => H - padB - (y + cfg.h / 2) * scale;     // top vertical (lateral)
    const Xy = (y) => W / 2 + y * scale;                      // front horizontal (lateral)

    // ---------- grid ----------
    ctx.strokeStyle = 'rgba(70,110,160,0.10)';
    ctx.lineWidth = 1;
    if (view !== 'front') {
      for (let mm = Math.ceil(xMin / 500) * 500; mm <= xMax; mm += 500) {
        ctx.beginPath(); ctx.moveTo(X(mm), padT - 10); ctx.lineTo(X(mm), H - padB + 10); ctx.stroke();
      }
    }
    if (view === 'top') {
      for (let mm = Math.ceil(-cfg.h / 2 / 250) * 250; mm <= cfg.h / 2; mm += 250) {
        ctx.beginPath(); ctx.moveTo(padL - 10, Yy(mm)); ctx.lineTo(W - padR + 10, Yy(mm)); ctx.stroke();
      }
    } else {
      for (let mm = 0; mm <= zMax; mm += 250) {
        ctx.beginPath(); ctx.moveTo(padL - 10, Yz(mm)); ctx.lineTo(W - padR + 10, Yz(mm)); ctx.stroke();
      }
      if (view === 'front') {
        for (let mm = Math.ceil(-halfW / 250) * 250; mm <= halfW; mm += 250) {
          ctx.beginPath(); ctx.moveTo(Xy(mm), padT - 10); ctx.lineTo(Xy(mm), H - padB + 10); ctx.stroke();
        }
      }
    }

    // ---------- mesh edges (true projection) ----------
    const COL = { floor: '#3f8cff', diffuser: '#5ad1ff', frontWing: '#ffb454', rearWing: '#ff7a6e', rearWingFlap: '#ff9a8e', wheels: '#74859b', body: '#9fb2c8', sidepod: '#8ba0ba', halo: '#c9d6e8', suspension: '#6d7f96', cooling: '#63e6b0', detail: '#5c7089', nose: '#aebfd4', engineCover: '#9fb2c8' };
    const groups = {};
    for (const q of mesh.quads) {
      const [a, b, c, d, g] = q;
      (groups[g] ??= []).push([a, b], [b, c], [c, d], [d, a]);
    }
    const PX = (V) => (view === 'front' ? Xy(V[1]) : X(V[0]));
    const PY = (V) => (view === 'side' ? Yz(V[2]) : view === 'top' ? Yy(V[1]) : Yz(V[2]));
    ctx.lineWidth = 0.7;
    for (const [g, edges] of Object.entries(groups)) {
      ctx.strokeStyle = (COL[g] ?? '#8899aa') + '55';
      ctx.beginPath();
      for (const [a, b] of edges) {
        ctx.moveTo(PX(mesh.verts[a]), PY(mesh.verts[a]));
        ctx.lineTo(PX(mesh.verts[b]), PY(mesh.verts[b]));
      }
      ctx.stroke();
    }

    // ---------- ground line ----------
    if (view !== 'top') {
      ctx.strokeStyle = '#3d5570';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(padL - 10, Yz(0));
      ctx.lineTo(W - padR + 10, Yz(0));
      ctx.stroke();
    }

    // ---------- dimensions ----------
    ctx.font = '10px ui-monospace,monospace';
    const dimH = (x0, x1, zmm, label, color = '#7d93ad') => {
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
      const xa = PX([x0, 0, 0]).x === undefined ? 0 : (view === 'front' ? Xy(x0) : X(x0));
      const xb = view === 'front' ? Xy(x1) : X(x1);
      const y = view === 'top' ? Yy(zmm) : Yz(zmm);
      ctx.beginPath();
      ctx.moveTo(xa, y - 4); ctx.lineTo(xa, y + 4);
      ctx.moveTo(xb, y - 4); ctx.lineTo(xb, y + 4);
      ctx.moveTo(xa, y); ctx.lineTo(xb, y);
      ctx.stroke();
      ctx.fillText(label, (xa + xb) / 2 - ctx.measureText(label).width / 2, y - 5);
    };
    const dimV = (z0, z1, xmm, label, color = '#7d93ad') => {
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
      const x = view === 'front' ? Xy(xmm) : X(xmm);
      const y0 = view === 'top' ? Yy(z0) : Yz(z0);
      const y1 = view === 'top' ? Yy(z1) : Yz(z1);
      ctx.beginPath();
      ctx.moveTo(x - 4, y0); ctx.lineTo(x + 4, y0);
      ctx.moveTo(x - 4, y1); ctx.lineTo(x + 4, y1);
      ctx.moveTo(x, y0); ctx.lineTo(x, y1);
      ctx.stroke();
      ctx.save();
      ctx.translate(x - 6, (y0 + y1) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(label, -ctx.measureText(label).width / 2, -4);
      ctx.restore();
    };

    if (view === 'side') {
      dimH(-p.wheelbase / 2, p.wheelbase / 2, -140, `WHEELBASE ${p.wheelbase} mm`);
      dimH(xMin + 80, meta.noseTip, 1330, `LENGTH ≈ ${Math.round(meta.overallLength)} mm`, '#5c7089');
      dimV(0, p.rwHeight + 40, -p.wheelbase / 2 - 460, `RW HEIGHT ${p.rwHeight}`, '#ff7a6e');
      dimV(0, p.rideHeightF, p.wheelbase / 2 + 130, `RH-F ${p.rideHeightF}`, '#63e6b0');
      dimV(0, p.rideHeightR, -p.wheelbase / 2 - 130, `RH-R ${p.rideHeightR}`, '#63e6b0');
      ctx.fillStyle = '#ffb454';
      ctx.fillText(`FW ${p.fwChord}c × ${p.fwSpan}S @ ${p.fwAngle}°+${p.fwFlap}°`, X(p.wheelbase / 2 + 40), Yz(p.fwHeight + 210));
      ctx.fillStyle = '#ff7a6e';
      ctx.fillText(`RW ${p.rwChord}c @ ${p.rwAngle}° (DRS flap)`, X(-p.wheelbase / 2 - 900), Yz(p.rwHeight + 140));
      ctx.fillStyle = '#5ad1ff';
      ctx.fillText(`DIFFUSER ${p.diffAngle}° → exit ${p.diffExitH} mm`, X(-p.wheelbase / 2 - 480), Yz(p.diffExitH + 90));
    }
    if (view === 'top') {
      dimV(-p.track / 2, p.track / 2, meta.noseTip - 200, `TRACK ${p.track} mm`);
      dimV(-p.fwSpan / 2, p.fwSpan / 2, p.wheelbase / 2 + 620, `FW SPAN ${p.fwSpan}`, '#ffb454');
      dimV(-p.rwSpan / 2, p.rwSpan / 2, -p.wheelbase / 2 - 390, `RW SPAN ${p.rwSpan}`, '#ff7a6e');
      dimV(-p.floorWidth / 2, p.floorWidth / 2, 100, `FLOOR ${p.floorWidth}`, '#3f8cff');
      dimH(xMin + 80, meta.noseTip, -cfg.h / 2 + 40, `LENGTH ≈ ${Math.round(meta.overallLength)} mm`, '#5c7089');
    }
    if (view === 'front') {
      dimH(-halfW, halfW, -130, `WIDTH ≈ ${Math.round(meta.overallWidth)} mm`, '#5c7089');
      dimV(0, 950, -halfW - 140, 'REG HEIGHT 950', '#5ad1ff');
      dimV(0, p.rwHeight + 40, halfW + 120, `RW ${p.rwHeight}`, '#ff7a6e');
    }

    // ---------- title block ----------
    ctx.strokeStyle = '#27394f';
    ctx.strokeRect(W - 242.5, H - 58.5, 236, 52);
    ctx.fillStyle = '#d7e1ee';
    ctx.font = 'bold 11px ui-monospace,monospace';
    ctx.fillText('APEX LAB — ENGINEERING DRAWING', W - 234, H - 42);
    ctx.fillStyle = '#8fa3bb';
    ctx.font = '9.5px ui-monospace,monospace';
    ctx.fillText(`${model.name} · ${cfg.label}`, W - 234, H - 29);
    ctx.fillText('all dims auto-derived from CarModel · mm', W - 234, H - 17);
    ctx.fillStyle = '#5c7089';
    ctx.fillText('true orthographic projection of the simulation mesh', 14, H - 17);
  };

  // draw after layout so clientWidth is real (fixes the v4.0 blank-canvas bug)
  if (canvas.isConnected && canvas.clientWidth > 0) requestAnimationFrame(paint);
  else requestAnimationFrame(() => requestAnimationFrame(paint));
}
