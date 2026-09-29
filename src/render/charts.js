// APEX LAB — Canvas-2D engineering charts. Every graph has a data table
// equivalent (accessibility, spec §73) via the `table` return hook.

export function lineChart(canvas, series, opts = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  canvas.width = r.width * dpr;
  canvas.height = (opts.height ?? 180) * dpr;
  canvas.style.height = (opts.height ?? 180) + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = opts.height ?? 180;
  const padL = 46, padR = 12, padT = 14, padB = 24;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  ctx.fillRect(0, 0, W, H);

  const pts = series.flatMap((s) => s.points);
  if (!pts.length) return;
  let xMin = Math.min(...pts.map((p) => p.x));
  let xMax = Math.max(...pts.map((p) => p.x));
  let yMin = opts.yMin ?? Math.min(...pts.map((p) => p.y));
  let yMax = opts.yMax ?? Math.max(...pts.map((p) => p.y));
  if (xMax === xMin) xMax = xMin + 1;
  if (yMax === yMin) yMax = yMin + 1;
  const spanY = yMax - yMin;
  yMin -= spanY * 0.08;
  yMax += spanY * 0.08;
  const X = (x) => padL + ((x - xMin) / (xMax - xMin)) * (W - padL - padR);
  const Y = (y) => H - padB - ((y - yMin) / (yMax - yMin)) * (H - padT - padB);

  // grid
  ctx.strokeStyle = 'rgba(120,150,190,0.12)';
  ctx.fillStyle = 'rgba(150,170,200,0.65)';
  ctx.font = '10px ui-monospace,monospace';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const yv = yMin + ((yMax - yMin) * g) / 4;
    ctx.beginPath(); ctx.moveTo(padL, Y(yv)); ctx.lineTo(W - padR, Y(yv)); ctx.stroke();
    ctx.fillText(fmtAxis(yv), 4, Y(yv) + 3);
  }
  for (let g = 0; g <= 4; g++) {
    const xv = xMin + ((xMax - xMin) * g) / 4;
    ctx.beginPath(); ctx.moveTo(X(xv), padT); ctx.lineTo(X(xv), H - padB); ctx.stroke();
    ctx.fillText(fmtAxis(xv), X(xv) - 10, H - 8);
  }

  // highlight lines
  if (opts.vline !== undefined) {
    ctx.strokeStyle = 'rgba(255,180,84,0.5)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(X(opts.vline), padT); ctx.lineTo(X(opts.vline), H - padB); ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const s of series) {
    ctx.strokeStyle = s.color ?? '#5ad1ff';
    ctx.lineWidth = s.width ?? 1.8;
    if (s.dashed) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    s.points.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.stroke();
    ctx.setLineDash([]);
    if (s.fill) {
      ctx.lineTo(X(s.points[s.points.length - 1].x), Y(yMin));
      ctx.lineTo(X(s.points[0].x), Y(yMin));
      ctx.closePath();
      ctx.fillStyle = (s.color ?? '#5ad1ff') + '22';
      ctx.fill();
    }
  }

  // labels
  if (opts.xlabel) {
    ctx.fillStyle = 'rgba(150,170,200,0.8)';
    ctx.fillText(opts.xlabel, W - padR - ctx.measureText(opts.xlabel).width, H - 8);
  }
  if (opts.ylabel) {
    ctx.fillStyle = 'rgba(150,170,200,0.8)';
    ctx.fillText(opts.ylabel, padL, 10);
  }
  // legend
  let lx = padL + 6;
  for (const s of series) {
    if (!s.label) continue;
    ctx.fillStyle = s.color ?? '#5ad1ff';
    ctx.fillRect(lx, padT + 2, 10, 3);
    ctx.fillStyle = 'rgba(200,215,235,0.85)';
    ctx.fillText(s.label, lx + 14, padT + 7);
    lx += 18 + ctx.measureText(s.label).width + 12;
  }
}

function fmtAxis(v) {
  const a = Math.abs(v);
  if (a >= 10000) return (v / 1000).toFixed(0) + 'k';
  if (a >= 1000) return (v / 1000).toFixed(1) + 'k';
  if (a >= 10) return v.toFixed(0);
  return v.toFixed(a >= 1 ? 1 : 2);
}

export function barChartH(container, items, opts = {}) {
  // items: {label, value, sub, color, delta}
  container.innerHTML = '';
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  for (const it of items) {
    const row = document.createElement('div');
    row.className = 'hbar-row';
    const w = (Math.abs(it.value) / max) * 100;
    row.innerHTML = `
      <div class="hbar-label" title="${it.sub ?? ''}">${it.label}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${w}%;background:${it.color ?? '#3f8cff'}"></div></div>
      <div class="hbar-val">${opts.formatter ? opts.formatter(it.value) : Math.round(it.value)}${it.delta ? `<span class="delta ${it.delta > 0 ? 'pos' : 'neg'}">${it.delta > 0 ? '▲' : '▼'}${Math.abs(it.delta).toFixed(0)}%</span>` : ''}</div>`;
    container.appendChild(row);
  }
}

export function scatterChart(canvas, pts, opts = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  canvas.width = r.width * dpr;
  canvas.height = (opts.height ?? 220) * dpr;
  canvas.style.height = (opts.height ?? 220) + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = opts.height ?? 220;
  const padL = 46, padR = 14, padT = 14, padB = 26;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  ctx.fillRect(0, 0, W, H);
  if (!pts.length) return;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  let xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys);
  const padX = (xMax - xMin) * 0.08 || 1, padY = (yMax - yMin) * 0.12 || 1;
  xMin -= padX; xMax += padX; yMin -= padY; yMax += padY;
  const X = (x) => padL + ((x - xMin) / (xMax - xMin)) * (W - padL - padR);
  const Y = (y) => H - padB - ((y - yMin) / (yMax - yMin)) * (H - padT - padB);
  ctx.strokeStyle = 'rgba(120,150,190,0.12)';
  ctx.fillStyle = 'rgba(150,170,200,0.65)';
  ctx.font = '10px ui-monospace,monospace';
  for (let g = 0; g <= 4; g++) {
    const yv = yMin + ((yMax - yMin) * g) / 4;
    ctx.beginPath(); ctx.moveTo(padL, Y(yv)); ctx.lineTo(W - padR, Y(yv)); ctx.stroke();
    ctx.fillText(fmtAxis(yv), 4, Y(yv) + 3);
    const xv = xMin + ((xMax - xMin) * g) / 4;
    ctx.beginPath(); ctx.moveTo(X(xv), padT); ctx.lineTo(X(xv), H - padB); ctx.stroke();
    ctx.fillText(fmtAxis(xv), X(xv) - 10, H - 8);
  }
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(X(p.x), Y(p.y), p.highlight ? 7 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = p.color ?? '#5ad1ff';
    ctx.fill();
    if (p.highlight) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
    if (p.label) { ctx.fillStyle = 'rgba(200,215,235,0.9)'; ctx.fillText(p.label, X(p.x) + 8, Y(p.y) - 6); }
  }
  if (opts.xlabel) { ctx.fillStyle = 'rgba(150,170,200,0.8)'; ctx.fillText(opts.xlabel, W - padR - ctx.measureText(opts.xlabel).width, H - 8); }
  if (opts.ylabel) { ctx.fillStyle = 'rgba(150,170,200,0.8)'; ctx.fillText(opts.ylabel, padL, 10); }
}

export function heatmapChart(canvas, grid, opts = {}) {
  // grid: {xs:[], ys:[], z:[[..]]} z[ yi ][ xi ]
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  canvas.width = r.width * dpr;
  canvas.height = (opts.height ?? 200) * dpr;
  canvas.style.height = (opts.height ?? 200) + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = opts.height ?? 200;
  const padL = 52, padR = 60, padT = 14, padB = 26;
  ctx.clearRect(0, 0, W, H);
  const { xs, ys, z } = grid;
  const flat = z.flat();
  const zMin = Math.min(...flat), zMax = Math.max(...flat);
  const cw = (W - padL - padR) / xs.length;
  const ch = (H - padT - padB) / ys.length;
  for (let yi = 0; yi < ys.length; yi++) {
    for (let xi = 0; xi < xs.length; xi++) {
      const t = (z[yi][xi] - zMin) / Math.max(zMax - zMin, 1e-9);
      // blue→teal→amber ramp
      const col = t < 0.5
        ? `rgb(${Math.round(30 + t * 2 * 60)},${Math.round(80 + t * 2 * 130)},${Math.round(200 - t * 2 * 40)})`
        : `rgb(${Math.round(90 + (t - 0.5) * 2 * 200)},${Math.round(210 - (t - 0.5) * 2 * 40)},${Math.round(160 - (t - 0.5) * 2 * 160)})`;
      ctx.fillStyle = col;
      ctx.fillRect(padL + xi * cw, H - padB - (yi + 1) * ch, cw - 0.5, ch - 0.5);
    }
  }
  ctx.fillStyle = 'rgba(200,215,235,0.8)';
  ctx.font = '10px ui-monospace,monospace';
  const yStep = Math.max(1, Math.floor(ys.length / 6));
  for (let yi = 0; yi < ys.length; yi += yStep) ctx.fillText(fmtAxis(ys[yi]), 8, H - padB - (yi + 0.5) * ch + 3);
  const xStep = Math.max(1, Math.floor(xs.length / 6));
  for (let xi = 0; xi < xs.length; xi += xStep) ctx.fillText(fmtAxis(xs[xi]), padL + xi * cw + 2, H - 10);
  // colorbar
  const grad = ctx.createLinearGradient(0, H - padB, 0, padT);
  grad.addColorStop(0, 'rgb(30,80,200)');
  grad.addColorStop(0.5, 'rgb(90,210,160)');
  grad.addColorStop(1, 'rgb(240,190,120)');
  ctx.fillStyle = grad;
  ctx.fillRect(W - padR + 12, padT, 14, H - padT - padB);
  ctx.fillStyle = 'rgba(200,215,235,0.85)';
  ctx.fillText(fmtAxis(zMax), W - padR + 30, padT + 10);
  ctx.fillText(fmtAxis(zMin), W - padR + 30, H - padB);
  if (opts.xlabel) ctx.fillText(opts.xlabel, padL, H - 10);
  if (opts.ylabel) { ctx.save(); ctx.translate(12, padT + 40); ctx.rotate(-Math.PI / 2); ctx.fillText(opts.ylabel, 0, 0); ctx.restore(); }
}

export function sparkBar(canvas, value, max, color = '#5ad1ff') {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = 90 * dpr; canvas.height = 8 * dpr;
  canvas.style.width = '90px'; canvas.style.height = '8px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, 0, 90, 8);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 90 * Math.max(0, Math.min(1, value / max)), 8);
}
