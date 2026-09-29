// APEX LAB — 2D engineering blueprint (spec §12).
// Side / top / front schematics with auto-calculated dimensions from geometry.

import { buildGeometry } from '../core/geometry.js';

export function drawBlueprint(canvas, model, view = 'side') {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  canvas.width = r.width * dpr;
  canvas.height = 340 * dpr;
  canvas.style.height = '340px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = 340;
  ctx.fillStyle = '#0b1322';
  ctx.fillRect(0, 0, W, H);
  const { meta } = buildGeometry(model);
  const p = model.params;

  // mm grid
  ctx.strokeStyle = 'rgba(80,120,170,0.10)';
  const scale = W / 6200; // px per mm
  const cx = W / 2, ground = H - 42;
  for (let mm = -3000; mm <= 3000; mm += 250) {
    const x = cx + mm * scale;
    ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, H - 30); ctx.stroke();
  }
  for (let mm = 0; mm <= 1200; mm += 250) {
    const y = ground - mm * scale;
    ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(W - 8, y); ctx.stroke();
  }

  ctx.lineWidth = 1.6;
  const rect = (x0mm, x1mm, z0mm, z1mm, color, label) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color + '22';
    const x0 = cx + x0mm * scale, x1 = cx + x1mm * scale;
    const y0 = ground - z1mm * scale, y1 = ground - z0mm * scale;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    if (label && x1 - x0 > 46) {
      ctx.fillStyle = color;
      ctx.font = '9px ui-monospace,monospace';
      ctx.fillText(label, x0 + 4, y0 + 11);
    }
  };

  const dim = (x0mm, x1mm, ymm, label, color = '#7d93ad') => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    const x0 = cx + x0mm * scale, x1 = cx + x1mm * scale;
    const y = ground - ymm * scale;
    ctx.beginPath();
    ctx.moveTo(x0, y - 4); ctx.lineTo(x0, y + 4);
    ctx.moveTo(x1, y - 4); ctx.lineTo(x1, y + 4);
    ctx.moveTo(x0, y); ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.font = '10px ui-monospace,monospace';
    const txt = label;
    ctx.fillText(txt, (x0 + x1) / 2 - ctx.measureText(txt).width / 2, y - 5);
  };

  if (view === 'side' || view === 'all') {
    // floor, body silhouette, wings, wheels
    rect(-p.wheelbase / 2 - p.diffLen + 250, p.wheelbase / 2 - 260, (p.rideHeightF + p.rideHeightR) / 2, (p.rideHeightF + p.rideHeightR) / 2 + 30, '#3f8cff', 'FLOOR');
    rect(-p.wheelbase / 2 - p.diffLen + 250, -p.wheelbase / 2 - p.diffLen + 250 + p.diffLen, p.diffExitH * 0.5, p.diffExitH + 20, '#5ad1ff', 'DIFF');
    rect(p.wheelbase / 2 + 620 - p.fwChord, p.wheelbase / 2 + 620, p.fwHeight, p.fwHeight + 70, '#ffb454', 'FW');
    rect(-p.wheelbase / 2 - 320 - p.rwChord, -p.wheelbase / 2 - 320, p.rwHeight, p.rwHeight + 110, '#ff7a6e', 'RW');
    rect(-p.wheelbase / 2 - 350, p.wheelbase / 2 + 200, (p.rideHeightF + p.rideHeightR) / 2 + 40, (p.rideHeightF + p.rideHeightR) / 2 + 420, '#9fb2c8', 'BODY');
    // wheels
    for (const [x, r0] of [[p.wheelbase / 2, 330], [-p.wheelbase / 2, 340]]) {
      ctx.strokeStyle = '#8fa3bb';
      ctx.fillStyle = 'rgba(57,66,78,0.8)';
      ctx.beginPath();
      ctx.arc(cx + x * scale, ground - r0 * scale, r0 * scale, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    dim(-p.wheelbase / 2, p.wheelbase / 2, -140, `WHEELBASE ${p.wheelbase} mm`);
    dim(p.wheelbase / 2 + 620 - p.fwChord, p.wheelbase / 2 + 620, p.fwHeight + 150, `FW ${p.fwChord}c/${p.fwAngle}°`, '#ffb454');
    dim(-p.wheelbase / 2 - 320 - p.rwChord, -p.wheelbase / 2 - 320, p.rwHeight + 180, `RW ${p.rwChord}c/${p.rwAngle}°`, '#ff7a6e');
    dim(0, 0, 0, '');
    ctx.strokeStyle = '#7d93ad';
    ctx.fillStyle = '#7d93ad';
    ctx.font = '10px ui-monospace,monospace';
    ctx.fillText(`RH-F ${p.rideHeightF} mm`, cx - p.wheelbase / 2 * scale - 60, ground - 6);
    ctx.fillText(`RH-R ${p.rideHeightR} mm`, cx + p.wheelbase / 2 * scale - 10, ground - 6);
    ctx.fillText(`RAKE ${meta.rakeDeg.toFixed(2)}°`, cx + 60 * scale, ground - (p.rideHeightF + 60) * scale);
  }
  if (view === 'top' || view === 'all') {
    const y0 = 26;
    const tw = (mm) => mm * (scale * 0.9);
    ctx.strokeStyle = '#3f8cff';
    ctx.strokeRect(cx - tw(p.floorWidth) / 2, y0 + 150, tw(p.floorWidth), 240);
    ctx.fillStyle = '#3f8cff33';
    ctx.fillRect(cx - tw(p.floorWidth) / 2, y0 + 150, tw(p.floorWidth), 240);
    ctx.strokeStyle = '#9fb2c8';
    ctx.strokeRect(cx - tw(p.bodyWidth) / 2, y0 + 60, tw(p.bodyWidth), 260);
    ctx.strokeStyle = '#ffb454';
    ctx.beginPath();
    ctx.moveTo(cx - tw(p.fwSpan) / 2, y0 + 30); ctx.lineTo(cx + tw(p.fwSpan) / 2, y0 + 30);
    ctx.stroke();
    ctx.strokeStyle = '#ff7a6e';
    ctx.beginPath();
    ctx.moveTo(cx - tw(p.rwSpan) / 2, y0 + 430); ctx.lineTo(cx + tw(p.rwSpan) / 2, y0 + 430);
    ctx.stroke();
    ctx.fillStyle = '#8fa3bb';
    for (const yw of [y0 + 30, y0 + 430]) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + s * tw(p.track) / 2, yw, tw(330), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#7d93ad';
    ctx.font = '10px ui-monospace,monospace';
    ctx.fillText(`TRACK ${p.track} mm`, cx - tw(p.track) / 2, y0 + 470);
    ctx.fillText(`FW SPAN ${p.fwSpan}`, cx + tw(p.fwSpan) / 2 - 90, y0 + 24);
    ctx.fillText(`RW SPAN ${p.rwSpan}`, cx + tw(p.rwSpan) / 2 - 90, y0 + 448);
  }
  ctx.fillStyle = 'rgba(150,170,200,0.7)';
  ctx.font = '10px ui-monospace,monospace';
  ctx.fillText(`${view.toUpperCase()} VIEW — dimensions auto-derived from CarModel geometry`, 10, 14);
}
