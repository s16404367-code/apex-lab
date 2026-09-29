// APEX LAB — EXPERIMENTS screen (spec §46, §47, §48, §51, §82, §83).
// Design-of-experiments sweeps, 2-variable heatmap, robustness Monte Carlo,
// and challenge briefs scored on the live car.

import { h, clear, panel, badge, fmtN, fmtPct } from '../dom.js';
import { state, events, persist } from '../../core/state.js';
import { carContext, solveAt } from '../common.js';
import { solveAero, evalReference, referenceCondition } from '../../core/aero.js';
import { buildGeometry } from '../../core/geometry.js';
import { robustnessTest } from '../../sim/robustness.js';
import { yawSweep, rideHeightSweep } from '../../core/stability.js';
import { lineChart, heatmapChart, barChartH } from '../../render/charts.js';
import { PARAM_BY_KEY } from '../../core/model.js';
import CHALLENGES from '../../../data/challenges/challenges.js';
import { prepareTrack } from '../../sim/tracks.js';
import { simulateLap } from '../../sim/lap.js';
import T1 from '../../../data/tracks/kestrel-ring.js';
import T2 from '../../../data/tracks/harbor-street.js';
import BASE_PARAMS from '../../../data/cars/baseline-car.js';

const TRACK_DEFS = { 'kestrel-ring': T1, 'harbor-street': T2 };

export function experimentsScreen(root) {
  const ctx0 = carContext();

  // ---------------- DoE ----------------
  const paramSel = h('select', { class: 'select' });
  for (const key of ['rwAngle', 'fwAngle', 'rideHeightF', 'rideHeightR', 'diffAngle', 'throatArea', 'coolInlet', 'floorExp', 'fwFlap']) {
    paramSel.appendChild(h('option', { value: key }, PARAM_BY_KEY[key].label));
  }
  const minIn = h('input', { class: 'num-input', type: 'number', value: '10', step: '0.5' });
  const maxIn = h('input', { class: 'num-input', type: 'number', value: '38', step: '0.5' });
  const stepIn = h('input', { class: 'num-input', type: 'number', value: '2', step: '0.5' });
  const speedIn = h('input', { class: 'num-input', type: 'number', value: '250', step: '10' });
  const runDoE = h('button', {
    class: 'btn primary', onclick: () => {
      runSweep(paramSel.value, +minIn.value, +maxIn.value, +stepIn.value, +speedIn.value);
    }
  }, 'RUN SWEEP');
  const doeChart = h('canvas');
  const doeFindings = h('div', { class: 'why-panel' });

  function runSweep(key, min, max, step, speedKmh) {
    const model = state.model;
    const cal = model.calibration(state.cal);
    const { meta } = buildGeometry(model);
    const pts = [];
    const findings = [];
    let best = null, prevVal = null, diminishing = false, dropAfterPeak = false;
    for (let v = min; v <= max + 1e-9; v += step) {
      const params = { ...model.params, [key]: v };
      const m2 = new CarModel(params, { unlocked: model.unlocked });
      const r = solveAero(m2, cal, meta, { v: speedKmh / 3.6, yawDeg: 0, rho: 1.21, drs: false, dirtyAir: 0, hFDyn: params.rideHeightF, hRDyn: params.rideHeightR });
      pts.push({ x: v, y: r.df.total });
      pts.push({ x: NaN, y: NaN }); // separator guard (filtered by chart)
      const ptsClean = pts.filter((p) => isFinite(p.x));
      if (!best || r.df.total > best.y) best = { x: v, y: r.df.total, r };
      if (prevVal !== null && r.df.total < prevVal) {
        if (v > best.x) diminishing = true;
        if (v < best.x) dropAfterPeak = true;
      }
      prevVal = r.df.total;
      if (r.flags.some((f) => f.id === 'floorStall')) findings.push(`x=${v}: floor stall — outside operating window`);
    }
    const clean = pts.filter((p) => isFinite(p.x));
    const dragPts = clean.map((p) => p);
    lineChart(doeChart, [
      { points: clean, color: '#5ad1ff', label: 'downforce N', fill: true }
    ], { height: 220, xlabel: PARAM_BY_KEY[key].label + ' settings', ylabel: `${speedKmh} km/h · 0° yaw` });
    clear(doeFindings);
    doeFindings.appendChild(h('div', { class: 'why-item' }, `· Optimum region: ${PARAM_BY_KEY[key].label} = ${best.x}${PARAM_BY_KEY[key].unit} → ${fmtN(best.y)} N downforce.`));
    if (diminishing) doeFindings.appendChild(h('div', { class: 'why-item' }, '· Diminishing returns above the optimum: load per degree decays as the element approaches its stall plateau.'));
    if (dropAfterPeak) doeFindings.appendChild(h('div', { class: 'why-item bad' }, '· Response DROPS below the optimum — you are on the wrong side of the flow attachment boundary.'));
    for (const f of findings.slice(0, 3)) doeFindings.appendChild(h('div', { class: 'why-item bad' }, '· ' + f));
    // sensitivity
    const first = clean[0], last = clean[clean.length - 1];
    doeFindings.appendChild(h('div', { class: 'why-item' }, `· Total response across range: ${fmtPct(((last.y - first.y) / first.y) * 100)} — average sensitivity ${fmtN((last.y - first.y) / Math.max(1, clean.length - 1))} N per step.`));
  }

  // ---------------- heatmap ----------------
  const heatChart = h('canvas');
  const heatInfo = h('div', { class: 'hint' }, 'X = rear wing angle · Y = front ride height · Z = downforce. Run to reveal the coupled operating window.');
  const runHeat = h('button', {
    class: 'btn', onclick: () => {
      const model = state.model;
      const cal = model.calibration(state.cal);
      const { meta } = buildGeometry(model);
      const xs = [], ys = [], z = [];
      const rw = [10, 14, 18, 22, 26, 30, 34];
      const rh = [12, 18, 24, 30, 36, 44, 52];
      for (const r0 of rh) {
        const row = [];
        ys.push(r0);
        for (const w0 of rw) {
          if (!ys.length === false && xs.length === 0) xs.push(0);
          const params = { ...model.params, rwAngle: w0, rideHeightF: r0 };
          const m2 = new CarModel(params, { unlocked: model.unlocked });
          const r = solveAero(m2, cal, meta, { v: 69.4, yawDeg: 0, rho: 1.21, drs: false, dirtyAir: 0, hFDyn: r0, hRDyn: params.rideHeightR });
          row.push(r.df.total);
        }
        z.push(row);
      }
      rw.forEach((w0) => xs.push(w0));
      heatmapChart(heatChart, { xs, ys, z }, { height: 220, xlabel: 'RW angle °', ylabel: 'RH-F mm' });
      const flat = [];
      z.forEach((row, yi) => row.forEach((v, xi) => flat.push({ v, x: xs[xi], y: ys[yi] })));
      flat.sort((a, b) => b.v - a.v);
      heatInfo.textContent = `Hotspot: RW ${flat[0].x}° @ RH-F ${flat[0].y}mm → ${fmtN(flat[0].v)} N. But peak ≠ best: check the plateau shape and the yaw/porpoising risk before committing.`;
    }
  }, 'RUN AERO MAP');

  // ---------------- robustness ----------------
  const robEl = h('div', { class: 'robustness' });
  const robHist = h('canvas');
  const runRob = h('button', {
    class: 'btn primary', onclick: () => {
      const model = state.model;
      const cal = model.calibration(state.cal);
      const { meta } = buildGeometry(model);
      const res = robustnessTest(model, cal, meta, { v: 69.4, yawDeg: 0, rho: 1.21, drs: false, dirtyAir: 0 }, { samples: 300 });
      robEl.innerHTML = '';
      robEl.appendChild(h('div', { class: 'proto-grid' },
        cell('Mean DF', fmtN(res.meanDf) + ' N'),
        cell('Best', fmtN(res.bestDf) + ' N'),
        cell('Worst', fmtN(res.worstDf) + ' N'),
        cell('Spread', res.spreadDfPct.toFixed(1) + '%'),
        cell('P(stall)', res.pStallPct.toFixed(1) + '%'),
        cell('P(balance excursion)', res.pBalancePct.toFixed(1) + '%')
      ));
      robEl.appendChild(h('div', { class: 'hint' }, `Monte Carlo over ${res.samples} manufactured + environmental samples: wing angle ±${res.tolerance.tolWing.toFixed(2)}°, ride height ±${res.tolerance.tolRH.toFixed(1)}mm, yaw N(0,1.4°), mass, air density. Seed ${res.seed} — reproducible (spec §91).`));
      lineChart(robHist, [{ points: res.histogram.bins.map((b, i) => ({ x: res.histogram.lo + ((res.histogram.hi - res.histogram.lo) * (i + 0.5)) / 12, y: b })), color: '#5ad1ff', fill: true, label: 'samples' }], { height: 140, xlabel: 'downforce N' });
    }
  }, 'RUN ROBUSTNESS (300 samples)');

  function cell(k, v) {
    return h('div', { class: 'proto-cell' }, h('div', { class: 'kpi-k' }, k), h('div', { class: 'proto-val' }, v));
  }

  // ---------------- challenges ----------------
  const challengeEls = [];
  for (const ch of CHALLENGES.challenges) {
    const statusEl = h('div', { class: 'why-panel' }, h('div', { class: 'hint' }, 'Run evaluation against the current car.'));
    const btn = h('button', {
      class: 'btn small primary', onclick: () => {
        clear(statusEl);
        const model = state.model;
        const cal = model.calibration(state.cal);
        const { meta } = buildGeometry(model);
        const ref = evalReference(model, cal, meta);
        let results = [];
        if (ch.metrics.lapDeltaPct !== undefined) {
          const def = TRACK_DEFS[ch.track] ?? T1;
          const lap = simulateLap(model, cal, meta, prepareTrack(def, 700), { weather: state.weather });
          const baseModel = new CarModel(BASE_PARAMS.params, {});
          const base = simulateLap(baseModel, baseModel.calibration(state.cal), meta, prepareTrack(def, 700), { weather: state.weather });
          results.push({ key: 'lapDeltaPct', label: ch.metrics.lapDeltaPct.label, value: ((lap.timeS - base.timeS) / base.timeS) * 100, target: ch.metrics.lapDeltaPct.target, compare: ch.metrics.lapDeltaPct.compare, ok: ((lap.timeS - base.timeS) / base.timeS) * 100 <= ch.metrics.lapDeltaPct.target });
        }
        if (ch.metrics.ldRatio !== undefined) results.push({ key: 'ldRatio', label: ch.metrics.ldRatio.label, value: ref.ld, target: ch.metrics.ldRatio.target, compare: '>=', ok: ref.ld >= ch.metrics.ldRatio.target });
        if (ch.metrics.thermalMargin !== undefined) results.push({ key: 'thermalMargin', label: ch.metrics.thermalMargin.label, value: ref.thermal.marginPct, target: ch.metrics.thermalMargin.target, compare: '>=', ok: ref.thermal.marginPct >= ch.metrics.thermalMargin.target });
        if (ch.metrics.yawDfLoss7 !== undefined) {
          const ys = yawSweep(solveAero, model, cal, meta, { v: 69.4, yawDeg: 0, rho: 1.21 });
          const y7 = ys.find((y) => y.yawDeg === 7);
          results.push({ key: 'yawDfLoss7', label: ch.metrics.yawDfLoss7.label, value: y7.dfLossPct, target: '<=25', compare: '<=', ok: y7.dfLossPct <= 25 });
          results.push({ key: 'yawBalanceShift7', label: ch.metrics.yawBalanceShift7.label, value: Math.abs(y7.balanceShift), target: 2.5, compare: '<=', ok: Math.abs(y7.balanceShift) <= 2.5 });
        }
        if (ch.metrics.floorDfLowH !== undefined) {
          const rLow = solveAt({ v: 69.4, hFDyn: 26, hRDyn: 26 });
          results.push({ key: 'floorDfLowH', label: ch.metrics.floorDfLowH.label, value: rLow.cla.floor * rLow.q * 0.98, target: 5500, compare: '>=', ok: rLow.cla.floor * rLow.q * 0.98 >= 5500 });
          const model2 = state.model;
          const rob = robustnessTest(model2, cal, meta, { v: 69.4, yawDeg: 0, rho: 1.21, hFDyn: 26, hRDyn: 26 }, { samples: 120 });
          results.push({ key: 'stallRisk', label: ch.metrics.stallRisk.label, value: rob.pStallPct, target: 15, compare: '<=', ok: rob.pStallPct <= 15 });
        }
        for (const r of results) {
          statusEl.appendChild(h('div', { class: 'why-item' + (r.ok ? ' ok' : ' bad') },
            `${r.ok ? '✓' : '✗'} ${r.label}: ${typeof r.value === 'number' ? r.value.toFixed(r.key === 'lapDeltaPct' ? 2 : 1) : r.value} (target ${r.compare} ${r.target})`));
        }
        const passed = results.length && results.every((r) => r.ok);
        statusEl.appendChild(h('div', { class: 'row-btns' }, passed ? badge('CHALLENGE MET — GOLD/SILVER per thresholds', 'ok') : badge('NOT MET', 'bad')));
      }
    }, 'EVALUATE');
    challengeEls.push(h('div', { class: 'concept-card' },
      h('div', { class: 'concept-head' }, ch.name, badge(ch.track ? 'TRACK: ' + ch.track : 'CONDITIONS', 'dim')),
      h('div', { class: 'hint' }, ch.brief),
      btn, statusEl));
  }

  const layout = h('div', { class: 'develop-layout' },
    panel('EXPERIMENT LAB — design of experiments on the REAL solver',
      h('div', { class: 'row gap wrap' },
        paramSel,
        h('label', { class: 'hint' }, 'min'), minIn,
        h('label', { class: 'hint' }, 'max'), maxIn,
        h('label', { class: 'hint' }, 'step'), stepIn,
        h('label', { class: 'hint' }, '@ km/h'), speedIn,
        runDoE),
      doeChart, doeFindings),
    panel('MULTI-DIMENSIONAL AERO MAP — X: RW angle · Y: front ride height · Z: downforce', runHeat, heatChart, heatInfo),
    panel('ROBUSTNESS — peak design vs robust design (spec §46, §89)', runRob, robEl, robHist),
    panel('BLUEPRINT CHALLENGES — briefs scored on multiple criteria', ...challengeEls)
  );
  root.appendChild(layout);
}
