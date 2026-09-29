// APEX LAB — SHAPE STUDIO (V4.2).
// The chassis is DESIGNED here, not dialed in: you sculpt the car's side
// silhouette and plan outline by dragging curve points; the body mesh, the
// frontal area, the aero map and every downstream test follow that shape.
// No body-metric sliders anywhere — the curve IS the input.

import { h, clear, fmtN, fmtS } from '../dom.js';
import { state, applyShape, pushUndo, events } from '../../core/state.js';
import { defaultShape, SHAPE_PRESETS, smoothShape, sampleCurve, STATIONS } from '../../core/carShape.js';
import { buildGeometry } from '../../core/geometry.js';
import { evalReference } from '../../core/aero.js';
import { createViewer } from '../../render/viewer.js';
import { encodeShareCodeV2 } from '../../storage/sharecode.js';

const H_MIN = 60, H_MAX = 700, W_MIN = 40, W_MAX = 660; // mm (carShape clamps)
const STATION_LABELS = ['NOSE', 'FW', 'FLOOR', 'POD IN', 'COCKPIT', 'POD', 'TANK', 'SHRUNK', 'REAR', 'RW', 'TAIL', 'END'];

function clone(s) { return { heights: [...s.heights], widths: [...s.widths] }; }

export function studioScreen(root) {
  // working shape = the model's shape, else studio-local edit of the default
  let shape = clone(state.shape ?? state.model.shape ?? defaultShape());

  const layout = h('div', { class: 'studio-layout' });
  const colL = h('div', { class: 'col-left studio-col' });
  const colR = h('div', { class: 'col-right studio-col' });

  // ============ LEFT: the two curve editors ============
  const intro = h('div', { class: 'panel' },
    h('div', { class: 'panel-title' }, 'SHAPE STUDIO — DESIGN THE CHASSIS'),
    h('p', { class: 'hint' },
      'Drag the points to sculpt the car. The side silhouette sets noses, cockpit and engine-cover lines; the plan outline sets the planform and coke-bottle taper. ',
      'Every drag rebuilds the real 3D body and updates the aero map. When the shape looks right, take it to the ', h('b', {}, 'WIND TUNNEL'), ' or ', h('b', {}, 'LAP SIM'), ' and let the numbers judge it.')
  );
  colL.appendChild(intro);

  const silCanvas = h('canvas', { class: 'curve-canvas' });
  const planCanvas = h('canvas', { class: 'curve-canvas' });
  colL.appendChild(h('div', { class: 'panel curve-card' },
    h('div', { class: 'panel-title' }, 'SIDE SILHOUETTE — height above floor (mm)'),
    silCanvas,
    h('div', { class: 'curve-xaxis' }, STATION_LABELS.map((l) => h('span', {}, l)))
  ));
  colL.appendChild(h('div', { class: 'panel curve-card' },
    h('div', { class: 'panel-title' }, 'PLAN OUTLINE — half-width (mm)'),
    planCanvas,
    h('div', { class: 'curve-xaxis' }, STATION_LABELS.map((l) => h('span', {}, l)))
  ));

  const silEd = new CurveEditor(silCanvas, 'heights', H_MIN, H_MAX, shape, onEdit, onEditEnd);
  const planEd = new CurveEditor(planCanvas, 'widths', W_MIN, W_MAX, shape, onEdit, onEditEnd);

  // ============ RIGHT: live 3D + tools + readout ============
  const viewerWrap = h('div', { class: 'viewport-wrap studio-viewport' });
  const canvas3d = h('canvas', { class: 'viewport' });
  viewerWrap.appendChild(canvas3d);
  const viewer = createViewer(canvas3d);

  const viewBar = h('div', { class: 'view-bar' },
    h('button', { class: 'btn small', onclick: () => viewer.setView('side') }, 'SIDE'),
    h('button', { class: 'btn small', onclick: () => viewer.setView('top') }, 'TOP'),
    h('button', { class: 'btn small', onclick: () => viewer.setView('front') }, 'FRONT'),
    h('button', { class: 'btn small', onclick: () => viewer.setView('rear3q') }, 'REAR ¾'),
    h('span', { class: 'vsep' }),
    toggleBtn('WIRE', false, draw3d),
    toggleBtn('TURNTABLE', true, draw3d, 'auto-orbit')
  );

  const chips = h('div', { class: 'chip-row' });
  const chipBtns = {};
  for (const [name, def] of Object.entries(SHAPE_PRESETS)) {
    const b = h('button', { class: 'btn small chip' }, name.toUpperCase());
    b.addEventListener('click', () => {
      pushUndo();
      shape = clone(def.shape ?? def);
      push('preset', { silent: true });
      refreshAll(true);
    });
    chipBtns[name] = b;
    chips.appendChild(b);
  }

  const tools = h('div', { class: 'chip-row' },
    h('button', {
      class: 'btn small', onclick: () => {
        pushUndo(); shape = smoothShape(shape, 2); push('smooth', { silent: true }); refreshAll(true);
      }
    }, 'SMOOTH'),
    h('button', {
      class: 'btn small', onclick: () => {
        pushUndo(); shape = clone(defaultShape()); push('reset', { silent: true }); refreshAll(true);
      }
    }, 'RESET'),
    h('button', { class: 'btn small', onclick: shareShapeModal }, 'COPY SHARE CODE'),
    h('button', { class: 'btn small primary', onclick: () => { location.hash = 'tunnel'; } }, 'RUN WIND TUNNEL →'),
    h('button', { class: 'btn small primary', onclick: () => { location.hash = 'lapsim'; } }, 'RUN LAP SIM →')
  );

  const stats = h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, 'WHAT THIS SHAPE DOES — live'));
  const statsBody = h('div', { class: 'stat-rows' });
  stats.appendChild(statsBody);

  colR.appendChild(h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, 'LIVE 3D — your shape'), viewBar, viewerWrap));
  colR.appendChild(chips);
  colR.appendChild(tools);
  colR.appendChild(stats);

  layout.appendChild(colL);
  layout.appendChild(colR);
  root.appendChild(layout);

  // ---------- plumbing ----------
  function push(source, opts = {}) {
    // silent during drags: no undo spam, no global re-render (drag survives);
    // state.persist() still debounces the save.
    applyShape(clone(shape), { noUndo: true, silent: true, source: 'studio:' + source, ...opts });
  }

  function onEdit() { // every pointermove
    push('drag');
    refreshStats();
    draw3d();
  }

  function onEditEnd() { // gesture finished → world gets ONE refresh
    events.emit('paramsChanged', { source: 'studio' });
    events.emit('requestRefresh');
  }

  function refreshAll(global) {
    silEd.draw(); planEd.draw();
    refreshStats();
    draw3d();
    if (global) { events.emit('paramsChanged', { source: 'studio' }); events.emit('requestRefresh'); }
  }

  function draw3d() {
    viewer.render(state.model, {
      wireframe: viewBar.querySelector('[data-t="WIRE"]')?.classList.contains('on') ?? false,
      turntable: viewBar.querySelector('[data-t="TURNTABLE"]')?.classList.contains('on') ?? true,
      reducedMotion: state.settings.reducedMotion
    });
  }

  function refreshStats() {
    const cal = state.model.calibration(state.cal);
    const { meta } = buildGeometry(state.model);
    const ref = evalReference(state.model, cal, meta);
    const sa = meta.shapeAero;
    clear(statsBody);
    const row = (k, v) => statsBody.appendChild(h('div', { class: 'stat-row' }, h('span', {}, k), h('b', {}, v)));
    row('Frontal area', fmtN(sa.frontalAreaM2, 3) + ' m²');
    row('Fineness L/d', fmtN(sa.fineness, 2));
    row('Deck slope', fmtN(sa.deckSlope * 100, 1) + ' %');
    row('Nose droop', fmtN((sa.noseSlope ?? 0) * 100, 1) + ' %');
    row('Max width', fmtN(sa.maxWidthMm, 0) + ' mm (' + fmtN(sa.maxWidthMm * 2, 0) + ' across)');
    row('Body length', fmtN(meta.Length * 1000, 0) + ' mm');
    statsBody.appendChild(h('div', { class: 'stat-sep' }));
    row('Downforce @250', fmtN(ref.df.total, 0) + ' N');
    row('Drag @250', fmtN(ref.drag, 0) + ' N');
    row('L/D', fmtN(ref.ld, 2));
    row('Balance', fmtN(ref.df.balancePct, 1) + ' % front');
    const dragDelta = ref.drag - 4758, dfDelta = ref.df.total - 14504;
    statsBody.appendChild(h('div', { class: 'hint', style: { marginTop: '6px' } },
      'vs baseline: DF ' + (dfDelta >= 0 ? '+' : '') + fmtN(dfDelta, 0) + ' N · drag ' + (dragDelta >= 0 ? '+' : '') + fmtN(dragDelta, 0) + ' N'));
  }

  function shareShapeModal() {
    const code = encodeShareCodeV2(state.model.params, state.shape);
    const overlayEl = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlayEl) overlayEl.remove(); } });
    const input = h('input', { class: 'text-input', value: code, readonly: 'readonly' });
    input.addEventListener('focus', () => input.select());
    const box = h('div', { class: 'modal' },
      h('div', { class: 'panel-title' }, 'SHARE CODE — params + sculpted shape'),
      h('p', { class: 'hint' }, 'APEX2 codes carry your silhouette and planform points as well. Paste into SETTINGS → LOAD SHARE CODE.'),
      input,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: () => { navigator.clipboard?.writeText(code); input.focus(); } }, 'COPY'),
        h('button', { class: 'btn', onclick: () => overlayEl.remove() }, 'CLOSE'))
    );
    overlayEl.appendChild(box);
    document.body.appendChild(overlayEl);
  }

  function toggleBtn(label, on, fn, title = '') {
    const b = h('button', { class: 'btn small toggle' + (on ? ' on' : ''), 'data-t': label, title }, label);
    b.addEventListener('click', () => { b.classList.toggle('on'); fn(); });
    return b;
  }

  refreshAll(false);
  window.addEventListener('resize', studioScreen._onResize = () => { silEd.draw(); planEd.draw(); draw3d(); });
  // cleanup if the shell re-renders this screen
  const obs = new MutationObserver(() => {
    if (!root.isConnected) { viewer.dispose?.(); window.removeEventListener('resize', studioScreen._onResize); obs.disconnect(); }
  });
  obs.observe(document.getElementById('main') ?? document.body, { childList: true });
}

// ============================================================================
// CurveEditor — a 12-point draggable sculpting curve on a 2D canvas.
// x = station (nose → tail), y = curve value in mm. Catmull-Rom smoothing
// between points (same sampler the mesh uses — WYSIWYG by construction).
// ============================================================================
class CurveEditor {
  constructor(canvas, key, min, max, shapeRef, onEdit, onEditEnd) {
    this.canvas = canvas;
    this.key = key;
    this.min = min;
    this.max = max;
    this.shapeRef = shapeRef; // shared live shape object
    this.onEdit = onEdit;
    this.onEditEnd = onEditEnd;
    this.active = -1;
    this.hover = -1;
    this.pad = { l: 44, r: 14, t: 12, b: 18 };

    canvas.addEventListener('pointerdown', (e) => {
      const i = this.hit(e);
      if (i >= 0) {
        this.active = i;
        pushUndo(); // one undo entry per drag gesture
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.active >= 0) {
        const v = this.pxToVal(e);
        let clamped = Math.max(this.min, Math.min(this.max, v));
        const others = this.shapeRef[this.key];
        // monotonic-ish guard: don't allow crossing neighbours by more than 60% of range
        const step = (this.max - this.min) * 0.6;
        if (this.active > 0) clamped = Math.max(clamped, others[this.active - 1] - step);
        if (this.active < STATIONS - 1) clamped = Math.min(clamped, others[this.active + 1] + step);
        this.shapeRef[this.key][this.active] = clamped;
        this.draw();
        this.onEdit();
      } else {
        const h2 = this.hit(e);
        if (h2 !== this.hover) { this.hover = h2; this.canvas.style.cursor = h2 >= 0 ? 'grab' : 'crosshair'; this.draw(); }
      }
    });
    const end = (e) => {
      if (this.active >= 0) {
        this.active = -1;
        canvas.style.cursor = 'crosshair';
        try { canvas.releasePointerCapture(e.pointerId); } catch { /* released */ }
        this.onEditEnd();
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.style.touchAction = 'none';
    this.draw();
  }

  geom() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.canvas.clientWidth || 560;
    const cssH = this.canvas.clientHeight || 210;
    if (this.canvas.width !== Math.round(cssW * dpr)) {
      this.canvas.width = Math.round(cssW * dpr);
      this.canvas.height = Math.round(cssH * dpr);
    }
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { l, r, t, b } = this.pad;
    return { ctx, w: cssW, h: cssH, x0: l, x1: cssW - r, y0: t, y1: cssH - b };
  }

  stationX(g, i) { return g.x0 + (i / (STATIONS - 1)) * (g.x1 - g.x0); }
  valY(g, v) { return g.y1 - ((v - this.min) / (this.max - this.min)) * (g.y1 - g.y0); }
  pxToVal(e) {
    const g = this.geom();
    const rect = this.canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    return this.min + ((g.y1 - y) / (g.y1 - g.y0)) * (this.max - this.min);
  }
  hit(e) {
    const g = this.geom();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    for (let i = 0; i < STATIONS; i++) {
      const dx = x - this.stationX(g, i), dy = y - this.valY(g, this.shapeRef[this.key][i]);
      if (dx * dx + dy * dy < 196) return i;
    }
    return -1;
  }

  draw() {
    const g = this.geom();
    const { ctx } = g;
    ctx.clearRect(0, 0, g.w, g.h);
    const key = this.key;
    const vals = this.shapeRef[key];
    const isSil = key === 'heights';

    // grid
    ctx.strokeStyle = 'rgba(120,150,180,0.14)';
    ctx.fillStyle = 'rgba(140,160,190,0.55)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.lineWidth = 1;
    for (let gy = 0; gy <= 4; gy++) {
      const v = this.min + ((this.max - this.min) * gy) / 4;
      const y = this.valY(g, v);
      ctx.beginPath(); ctx.moveTo(g.x0, y); ctx.lineTo(g.x1, y); ctx.stroke();
      ctx.fillText(String(Math.round(v)), 8, y + 3);
    }
    for (let i = 0; i < STATIONS; i++) {
      const x = this.stationX(g, i);
      ctx.beginPath(); ctx.moveTo(x, g.y0); ctx.lineTo(x, g.y1); ctx.stroke();
    }

    // sampled curve (same Catmull-Rom the 3D mesh uses)
    const pts = [];
    for (let s = 0; s <= 96; s++) {
      const t = s / 96;
      const v = sampleCurve(vals, t);
      pts.push([this.stationX(g, t * (STATIONS - 1)), this.valY(g, v)]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.strokeStyle = isSil ? '#5ad1ff' : '#63e6b0';
    ctx.lineWidth = 2;
    ctx.stroke();

    // fill (silhouette: down to floor; plan: mirrored around centerline)
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    if (isSil) {
      ctx.lineTo(pts[pts.length - 1][0], g.y1);
      ctx.lineTo(pts[0][0], g.y1);
    } else {
      for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], 2 * ((g.y0 + g.y1) / 2) - pts[i][1]);
    }
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, g.y0, 0, g.y1);
    grad.addColorStop(0, isSil ? 'rgba(90,209,255,0.28)' : 'rgba(99,230,176,0.26)');
    grad.addColorStop(1, 'rgba(10,16,24,0.05)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // control points
    for (let i = 0; i < STATIONS; i++) {
      const x = this.stationX(g, i), y = this.valY(g, vals[i]);
      const hot = i === this.active || i === this.hover;
      ctx.beginPath();
      ctx.arc(x, y, hot ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = hot ? '#ffd166' : (isSil ? '#5ad1ff' : '#63e6b0');
      ctx.fill();
      ctx.strokeStyle = '#0a0e14';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (hot) {
        ctx.fillStyle = '#ffd166';
        ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.fillText(Math.round(vals[i]) + ' mm', Math.min(x + 9, g.x1 - 52), y - 8);
      }
    }
  }
}
