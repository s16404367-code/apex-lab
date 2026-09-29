// APEX LAB — COMPARE + GARAGE (spec §49, §54, §68, §69, §90).
// Version list, side-by-side diff (what ACTUALLY changed), pareto scatter.

import { h, clear, panel, badge, fmtN, fmtS, fmtPct } from '../dom.js';
import { state, events, persist, checkoutVersion, resetToBaseline } from '../../core/state.js';
import { CarModel } from '../../core/model.js';
import { buildGeometry } from '../../core/geometry.js';
import { evalReference } from '../../core/aero.js';
import { heaveStability } from '../../core/stability.js';
import { prepareTrack } from '../../sim/tracks.js';
import { simulateLap } from '../../sim/lap.js';
import T1 from '../../../data/tracks/kestrel-ring.js';
import { scatterChart } from '../../render/charts.js';

export function compareScreen(root) {
  const prog = state.programme;
  const selA = h('select', { class: 'select' });
  const selB = h('select', { class: 'select' });
  const diffEl = h('div', { class: 'diff-panel' });
  const paretoCanvas = h('canvas');
  const paretoInfo = h('div', { class: 'hint' });

  function allVersions() {
    return [
      { id: 'APEX-000', name: 'APEX-001 Baseline', params: BASE.params, effects: [] },
      ...prog.versions.map((v) => ({ id: v.id, name: v.id + ' ' + v.name, params: v.params, effects: v.effects ?? [] }))
    ];
  }

  function fillSelectors() {
    clear(selA); clear(selB);
    const vs = allVersions();
    vs.forEach((v, i) => {
      selA.appendChild(h('option', { value: String(i) }, v.name));
      selB.appendChild(h('option', { value: String(i) }, v.name));
    });
    selA.selectedIndex = 0;
    selB.selectedIndex = Math.max(0, vs.length - 1);
  }

  function renderDiff() {
    const vs = allVersions();
    const a = vs[+selA.value], b = vs[+selB.value];
    clear(diffEl);
    const ma = new CarModel(a.params, { unlocked: a.effects });
    const mb = new CarModel(b.params, { unlocked: b.effects });
    const ca = ma.calibration(state.cal), cb = mb.calibration(state.cal);
    const ga = buildGeometry(ma).meta, gb = buildGeometry(mb).meta;
    const ra = evalReference(ma, ca, ga), rb = evalReference(mb, cb, gb);
    const ta = simulateLap(ma, ca, ga, prepareTrack(T1, 700)), tb = simulateLap(mb, cb, gb, prepareTrack(T1, 700));
    const ha = heaveStability(ma, ca, ra), hb = heaveStability(mb, cb, rb);

    // geometry/param diff (spec §69)
    const paramTable = h('table', { class: 'data-table' });
    paramTable.appendChild(h('tr', {}, h('th', {}, 'PARAMETER'), h('th', {}, 'A'), h('th', {}, 'B'), h('th', {}, 'Δ')));
    const keys = Object.keys(a.params);
    for (const k of keys) {
      const d = b.params[k] - a.params[k];
      if (Math.abs(d) < 1e-9) continue;
      paramTable.appendChild(h('tr', {},
        h('td', {}, k), h('td', {}, round(a.params[k])), h('td', {}, round(b.params[k])),
        h('td', { class: d > 0 ? 'pos' : 'neg' }, (d > 0 ? '+' : '') + round(d))
      ));
    }
    const aeroTable = h('table', { class: 'data-table' });
    aeroTable.appendChild(h('tr', {}, h('th', {}, 'METRIC (250 km/h)'), h('th', {}, 'A'), h('th', {}, 'B'), h('th', {}, 'Δ')));
    const rows = [
      ['Downforce', ra.df.total, rb.df.total, 0],
      ['Drag', ra.drag, rb.drag, 0],
      ['L/D', ra.ld, rb.ld, 2],
      ['Balance %F', ra.df.balancePct, rb.df.balancePct, 1],
      ['Lap (Kestrel)', ta.timeS, tb.timeS, 2],
      ['Top speed km/h', ta.topSpeedKmh, tb.topSpeedKmh, 0],
      ['Heave risk %', ha.riskPct, hb.riskPct, 0]
    ];
    for (const [label, v1, v2, dgt] of rows) {
      const d = v2 - v1;
      aeroTable.appendChild(h('tr', {},
        h('td', {}, label), h('td', {}, round(v1, dgt)), h('td', {}, round(v2, dgt)),
        h('td', { class: d > 0 ? 'pos' : d < 0 ? 'neg' : '' }, (d > 0 ? '+' : '') + round(d, dgt))
      ));
    }
    diffEl.append(
      h('div', { class: 'grid-2' },
        panel('GEOMETRY / PARAMETERS — what actually changed', paramTable),
        panel('PERFORMANCE — measured on the same solvers, same conditions', aeroTable)
      ),
      h('div', { class: 'hint' }, `Lap Δ: ${(tb.timeS - ta.timeS > 0 ? '+' : '')}${(tb.timeS - ta.timeS).toFixed(2)} s on Kestrel Ring. Where time was gained: ${(tb.timeS < ta.timeS) ? 'B' : 'A'} carries more average corner speed ${(Math.abs(tb.timeS - ta.timeS) < 0.05) ? '— effectively identical' : ''}.`)
    );
    renderPareto();
  }

  function round(v, d = 1) {
    return typeof v === 'number' ? (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('en-GB') : v;
  }

  function renderPareto() {
    const pts = [];
    const vs = allVersions();
    for (const v of vs) {
      const m = new CarModel(v.params, { unlocked: v.effects });
      const cal = m.calibration(state.cal);
      const { meta } = buildGeometry(m);
      const r = evalReference(m, cal, meta);
      pts.push({ x: r.drag, y: r.df.total, label: v.id.replace('APEX-', 'A'), color: v.id === 'APEX-000' ? '#8fa3bb' : '#5ad1ff' });
    }
    // current working car
    const m = state.model;
    const cal = m.calibration(state.cal);
    const { meta } = buildGeometry(m);
    const r = evalReference(m, cal, meta);
    pts.push({ x: r.drag, y: r.df.total, label: 'WORKING', color: '#ffb454', highlight: true });
    scatterChart(paretoCanvas, pts, { height: 240, xlabel: 'drag N →', ylabel: '↑ downforce N', vline: undefined });
    const n = pts.length;
    paretoInfo.textContent = `${n} designs. Lower-right is unambiguously better (less drag, more load). Designs up-left trade load for speed — the Pareto frontier, not a single score (spec §49).`;
  }

  fillSelectors();
  renderDiff();
  selA.addEventListener('change', renderDiff);
  selB.addEventListener('change', renderDiff);

  // garage: installed versions
  const garageEl = h('div', { class: 'garage' });
  renderGarage();
  function renderGarage() {
    clear(garageEl);
    garageEl.appendChild(versionRow({ id: 'APEX-000', name: 'APEX-001 Baseline', params: BASE.params, effects: [] }, false));
    for (const v of prog.versions) garageEl.appendChild(versionRow(v, true));
    if (!prog.versions.length) garageEl.appendChild(h('div', { class: 'hint' }, 'Install your first development to grow the garage. Every version stays recoverable (spec §54).'));
  }
  function versionRow(v, canCheckout) {
    return h('div', { class: 'version-row' },
      h('span', { class: 'version-id' }, v.id),
      h('span', { class: 'version-name' }, v.name),
      state.model.versionId === v.id ? badge('CURRENT', 'ok') : '',
      canCheckout ? h('button', { class: 'btn small', onclick: () => { checkoutVersion(v); renderGarage(); } }, 'CHECKOUT') : h('button', { class: 'btn small', onclick: () => { resetToBaseline(); renderGarage(); } }, 'CHECKOUT')
    );
  }

  const layout = h('div', { class: 'develop-layout' },
    panel('GARAGE — immutable version history (Git-like tree, spec §90)', garageEl),
    h('div', { class: 'row gap' }, h('span', { class: 'hint' }, 'Compare A:'), selA, h('span', { class: 'hint' }, 'B:'), selB),
    diffEl,
    panel('PARETO — downforce vs drag across all versions', paretoCanvas, paretoInfo)
  );
  root.appendChild(layout);
  events.on('paramsChanged', renderPareto);
}

import BASE from '../../../data/cars/baseline-car.js';
