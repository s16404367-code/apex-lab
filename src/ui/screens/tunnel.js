// APEX LAB — WIND TUNNEL (spec §24, §25, §26, §27, §18, §17).
// Live condition controls, force ledger, sweeps, pressure taps (per-group),
// WHY explanations. Consumes tunnel hours in season mode (sandbox: free).

import { h, clear, sliderRow, badge, panel, fmtN } from '../dom.js';
import { state, events, persist } from '../../core/state.js';
import { carContext, solveAt } from '../common.js';
import { solveAero } from '../../core/aero.js';
import { buildGeometry } from '../../core/geometry.js';
import { rideHeightSweep, yawSweep, speedSweep } from '../../core/stability.js';
import { lineChart, barChartH } from '../../render/charts.js';
import { heaveStability } from '../../core/stability.js';
import { spend } from '../../core/dev.js';

const PRESETS = {
  straight: { label: 'Straight', v: 69.4, yawDeg: 0, note: '250 km/h, 0° yaw — reference condition' },
  lowSpeed: { label: 'Low-Speed Corner', v: 22, yawDeg: 0, note: '80 km/h — mechanical platform dominance' },
  medSpeed: { label: 'Medium-Speed Corner', v: 44, yawDeg: 2, note: '160 km/h, 2° yaw — transition regime' },
  highSpeed: { label: 'High-Speed Corner', v: 67, yawDeg: 3, note: '240 km/h, 3° yaw — aero dominance, platform stress' },
  braking: { label: 'Braking', v: 50, yawDeg: 0, note: '180 km/h decel entry — pitch forward, floor inlet unloaded' },
  rhSweep: { label: 'Ride Height Sweep', v: 69.4, yawDeg: 0, note: 'hF 12→70 mm, response curve + stall edge' },
  yawSweep: { label: 'Yaw Sweep', v: 69.4, yawDeg: 0, note: '0→7° yaw — DF loss & balance migration' },
  aeroSweep: { label: 'Speed Sweep', v: 28, yawDeg: 0, note: '100→330 km/h — V² scaling + wing flex' }
};

export function tunnelScreen(root) {
  const ctx = carContext();
  const cond = { v: 69.4, yawDeg: 0, drs: false, dirtyAir: 0, hFDyn: ctx.model.params.rideHeightF, hRDyn: ctx.model.params.rideHeightR };
  let sweepMode = null;

  // ---- left: controls ----
  const controls = h('div', { class: 'tunnel-controls' });
  controls.appendChild(h('div', { class: 'panel-title' }, 'TUNNEL CONTROLS'));
  const rows = {};
  const addControl = (key, label, min, max, step, unit, val, oncb) => {
    const row = sliderRow({ label, min, max, step, unit, value: val, precision: 1, onInput: (v) => { cond[key] = v; run(); oncb?.(v); } });
    rows[key] = row;
    controls.appendChild(row);
  };
  addControl('v', 'Speed', 8, 95, 0.5, 'm/s', cond.v, (v) => { speedVal.textContent = (v * 3.6).toFixed(0) + ' km/h'; });
  addControl('yawDeg', 'Yaw', 0, 9, 0.5, '°', 0);
  addControl('hFDyn', 'Ride height F', 8, 80, 1, 'mm', ctx.model.params.rideHeightF);
  addControl('hRDyn', 'Ride height R', 8, 110, 1, 'mm', ctx.model.params.rideHeightR);
  const drsBtn = h('button', { class: 'btn small toggle', onclick: () => { cond.drs = !cond.drs; drsBtn.classList.toggle('on', cond.drs); run(); } }, 'DRS OPEN');
  const dirtyBtn = h('button', { class: 'btn small toggle', onclick: () => { cond.dirtyAir = cond.dirtyAir ? 0 : 1; dirtyBtn.classList.toggle('on', !!cond.dirtyAir); run(); } }, 'DIRTY AIR (lead car)');
  controls.appendChild(h('div', { class: 'row-btns' }, drsBtn, dirtyBtn));
  const speedVal = h('span', { class: 'param-val' }, '250 km/h');
  controls.appendChild(h('div', { class: 'panel-title', style: { marginTop: '12px' } }, 'TEST PRESETS'));
  const presetBtns = {};
  for (const [id, p] of Object.entries(PRESETS)) {
    const b = h('button', { class: 'btn small block', title: p.note, onclick: () => applyPreset(id) }, p.label);
    presetBtns[id] = b;
    controls.appendChild(b);
  }

  function applyPreset(id) {
    for (const b of Object.values(presetBtns)) b.classList.remove('active');
    presetBtns[id].classList.add('active');
    const p = PRESETS[id];
    cond.v = p.v; cond.yawDeg = p.yawDeg ?? 0;
    cond.hFDyn = ctx.model.params.rideHeightF; cond.hRDyn = ctx.model.params.rideHeightR;
    rows.v.update(p.v); rows.yawDeg.update(p.yawDeg ?? 0);
    rows.hFDyn.update(cond.hFDyn); rows.hRDyn.update(cond.hRDyn);
    speedVal.textContent = (p.v * 3.6).toFixed(0) + ' km/h';
    sweepMode = id === 'rhSweep' ? 'rh' : id === 'yawSweep' ? 'yaw' : id === 'aeroSweep' ? 'speed' : null;
    state.session.tunnelRuns++;
    if (state.programme.mode === 'season') spend(state.programme, { tunnelHours: sweepMode ? 6 : 2 });
    persist();
    events.emit('session');
    run();
  }

  // ---- center: readouts ----
  const readouts = h('div', { class: 'tunnel-readouts' });
  const bigRow = h('div', { class: 'big-readouts' });
  const bigDF = bigReadout('DOWNFORCE', 'N');
  const bigDrag = bigReadout('DRAG', 'N');
  const bigLD = bigReadout('L/D', '');
  const bigBal = bigReadout('AERO BAL', '%F');
  bigRow.append(bigDF.el, bigDrag.el, bigLD.el, bigBal.el);

  const ledgerEl = h('div', { class: 'ledger' });
  const dragLedgerEl = h('div', { class: 'ledger' });
  const whyEl = h('div', { class: 'why-panel' });
  const chartRh = h('canvas');
  const chartYaw = h('canvas');
  const chartSpeed = h('canvas');
  const notesEl = h('div', { class: 'hint' });

  readouts.append(bigRow,
    h('div', { class: 'grid-2' },
      panel('DOWNFORCE CONTRIBUTION LEDGER — isolated + interactions = final', ledgerEl),
      panel('DRAG CONTRIBUTION LEDGER', dragLedgerEl)
    ),
    panel('WHY DID THIS HAPPEN? — evidence-backed mechanisms', whyEl),
    h('div', { class: 'grid-2' },
      panel('RIDE HEIGHT RESPONSE (DF & efficiency vs hAvg)', chartRh),
      panel('YAW RESPONSE (DF loss & balance migration)', chartYaw)
    ),
    panel('SPEED RESPONSE (V² scaling, flex, DRS delta)', chartSpeed),
    panel('MODEL NOTES', notesEl)
  );

  notesEl.innerHTML = 'FAST solver: thin-airfoil slopes + empirical ground effect + venturi response curve. <b>Not CFD</b>. Assumptions in docs/MODEL.md (§ MODEL NOTES).';

  // ---- right: live car ----
  const tunnelViewWrap = h('div', { class: 'viewport-wrap tunnel-view' });
  const tunnelCanvas = h('canvas', { class: 'viewport' });
  tunnelViewWrap.appendChild(tunnelCanvas);
  const tunnelViewer = createViewerTunnel(tunnelCanvas);
  tunnelViewWrap.appendChild(h('div', { class: 'view-bar' },
    h('span', { class: 'hint' }, 'Pressure tint = component load share · live from FAST solver')
  ));

  function run() {
    const model = state.model;
    const cal = model.calibration(state.cal);
    const { meta } = buildGeometry(model);
    const r = solveAero(model, cal, meta, cond);
    bigDF.val.textContent = fmtN(r.df.total);
    bigDrag.val.textContent = fmtN(r.drag);
    bigLD.val.textContent = r.ld.toFixed(2);
    bigBal.val.textContent = r.df.balancePct.toFixed(1) + '%';
    bigDF.val.style.color = r.flags.some((f) => f.id === 'floorStall') ? '#ff7a6e' : '#5ad1ff';

    // ledger (isolated + interaction deltas, spec §16)
    barChartH(ledgerEl, r.ledger.df.map((l) => ({
      label: l.name + (l.interaction ? ' ⤷' : ''),
      value: l.N,
      sub: l.desc ?? '',
      color: l.interaction ? '#c792ea' : l.N >= 0 ? '#3f8cff' : '#ff7a6e'
    })), { formatter: (v) => fmtN(v) + ' N' });
    barChartH(dragLedgerEl, r.ledger.drag.map((l) => ({
      label: l.name, value: l.N, sub: l.kind, color: '#ff9f6e'
    })), { formatter: (v) => fmtN(v) + ' N' });

    // WHY panel (spec §27)
    clear(whyEl);
    for (const f of r.flags) whyEl.appendChild(h('div', { class: 'why-item bad' }, '⚠ ' + f.msg));
    for (const nt of r.notes) whyEl.appendChild(h('div', { class: 'why-item' }, '· ' + nt));
    if (r.interactions[0].dfShare < -0.01) whyEl.appendChild(h('div', { class: 'why-item' }, `· Rear wing loses ${Math.abs(r.interactions[0].dfShare * 100).toFixed(0)}% of its potential because the front wing operates at high load — its wake displaces the RW flow field upward.`));
    if (r.interactions[1].dfShare > 0.01) whyEl.appendChild(h('div', { class: 'why-item' }, `· Diffuser expansion seeds upwash that effectively increases rear-wing incidence (+${(r.interactions[1].dfShare * 100).toFixed(0)}%) — floor and RW gains are coupled, not additive.`));
    if (!r.flags.length && !r.notes.length) whyEl.appendChild(h('div', { class: 'why-item' }, '· All systems inside their stable operating windows at this condition.'));

    // sweeps
    if (sweepMode === 'rh' || !sweepMode) {
      const sw = rideHeightSweep(solveAero, model, cal, meta, cond);
      lineChart(chartRh, [
        { points: sw.map((s) => ({ x: s.h, y: s.df })), color: '#5ad1ff', label: 'DF (N)', fill: true },
        { points: sw.map((s) => ({ x: s.h, y: s.ld * 4000 })), color: '#63e6b0', label: 'L/D ×4000', dashed: true }
      ], { xlabel: 'ride height mm', height: 190, vline: (cond.hFDyn + cond.hRDyn) / 2 });
    } else lineChart(chartRh, [{ points: [{ x: 0, y: 0 }] }], {});
    if (sweepMode === 'yaw' || !sweepMode) {
      const ys = yawSweep(solveAero, model, cal, meta, cond);
      lineChart(chartYaw, [
        { points: ys.map((y) => ({ x: y.yawDeg, y: y.df })), color: '#ff9f6e', label: 'DF (N)' },
        { points: ys.map((y) => ({ x: y.yawDeg, y: y.balance * 200 })), color: '#c792ea', label: 'balance ×200', dashed: true }
      ], { xlabel: 'yaw °', height: 190, vline: cond.yawDeg });
    } else lineChart(chartYaw, [{ points: [{ x: 0, y: 0 }] }], {});
    if (sweepMode === 'speed' || !sweepMode) {
      const ss = speedSweep(solveAero, model, cal, meta, cond, [15, 25, 35, 45, 55, 65, 75, 85, 92]);
      lineChart(chartSpeed, [
        { points: ss.map((s) => ({ x: s.vKmh, y: s.df })), color: '#5ad1ff', label: 'DF (N)' },
        { points: ss.map((s) => ({ x: s.vKmh, y: s.drag })), color: '#ff7a6e', label: 'drag (N)' }
      ], { xlabel: 'speed km/h', height: 190, vline: cond.v * 3.6 });
    } else lineChart(chartSpeed, [{ points: [{ x: 0, y: 0 }] }], {});

    tunnelViewer.render(state.model, { pressure: r, envelope: false, flow: true, forces: { dfFront: r.df.front, dfRear: r.df.rear, drag: r.drag }, wireframe: true, reducedMotion: state.settings.reducedMotion });
  }

  run();
  events.on('paramsChanged', run);

  const layout = h('div', { class: 'tunnel-layout' },
    h('div', { class: 'col-left' }, controls),
    h('div', { class: 'col-center' }, readouts),
    h('div', { class: 'col-right' }, tunnelViewWrap)
  );
  root.appendChild(layout);
}

function bigReadout(label, unit) {
  const val = h('div', { class: 'big-val' }, '—');
  const el = h('div', { class: 'big-readout' }, h('div', { class: 'kpi-k' }, label), val, h('div', { class: 'hint' }, unit));
  return { el, val };
}

// tunnel viewport uses the same renderer as the design lab
function createViewerTunnel(canvas) {
  return makeViewer(canvas);
}
import { createViewer as makeViewer } from '../../render/engine3d.js';
