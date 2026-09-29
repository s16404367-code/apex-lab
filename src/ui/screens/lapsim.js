// APEX LAB — LAP SIM screen (spec §28, §29, §30, §61).
// Track map coloured by limiter, speed/g traces, sectors, tyre + energy.

import { h, panel, badge, fmtS } from '../dom.js';
import { state, events, persist } from '../../core/state.js';
import { carContext, LIMITER_COLORS, limitersLegend } from '../common.js';
import { prepareTrack, trackOutline } from '../../sim/tracks.js';
import { simulateLap } from '../../sim/lap.js';
import { lineChart } from '../../render/charts.js';
import { WEATHER_PRESETS, airDensity } from '../../core/weather.js';
import { spend } from '../../core/dev.js';
import TRACK_DEFS from '../../../data/tracks/kestrel-ring.js';
import T2 from '../../../data/tracks/harbor-street.js';
import T3 from '../../../data/tracks/summit-classic.js';

const DEFS = { 'kestrel-ring': TRACK_DEFS, 'harbor-street': T2, 'summit-classic': T3 };

export function lapsimScreen(root) {
  let trackId = lapsimScreen._trackId ?? 'kestrel-ring';
  let lastLap = null;
  let compareLap = null;

  const head = h('div', { class: 'row gap wrap' });
  const trackBtns = {};
  for (const id of Object.keys(DEFS)) {
    const d = DEFS[id];
    const b = h('button', { class: 'btn track-btn' + (id === trackId ? ' active' : ''), onclick: () => selectTrack(id) },
      h('div', { class: 'track-name' }, d.name),
      h('div', { class: 'hint' }, d.character.split('.')[0] + '.')
    );
    trackBtns[id] = b;
    head.appendChild(b);
  }

  const weatherSel = h('select', { class: 'select' });
  for (const [k, w] of Object.entries(WEATHER_PRESETS)) weatherSel.appendChild(h('option', { value: k }, w.label));
  weatherSel.value = state.weatherPreset;
  weatherSel.addEventListener('change', () => {
    state.weatherPreset = weatherSel.value;
    state.weather = { ...WEATHER_PRESETS[weatherSel.value] };
    persist();
    run();
  });

  const runBtn = h('button', { class: 'btn primary', onclick: run }, 'RUN LAP SIMULATION');
  const resultRow = h('div', { class: 'lap-results' });

  const mapCanvas = h('canvas', { class: 'track-map' });
  const speedChart = h('canvas');
  const gChart = h('canvas');
  const tyreChart = h('canvas');
  const dfChart = h('canvas');

  function selectTrack(id) {
    trackId = id;
    lapsimScreen._trackId = id;
    for (const [k, b] of Object.entries(trackBtns)) b.classList.toggle('active', k === id);
    run();
  }

  function drawMap(lap, track) {
    const ctx2 = mapCanvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = mapCanvas.getBoundingClientRect();
    mapCanvas.width = r.width * dpr;
    mapCanvas.height = 300 * dpr;
    mapCanvas.style.height = '300px';
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width, H = 300;
    ctx2.clearRect(0, 0, W, H);
    ctx2.fillStyle = 'rgba(255,255,255,0.02)';
    ctx2.fillRect(0, 0, W, H);
    const pts = track.pts;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys);
    const sc = Math.min((W - 40) / Math.max(xMax - xMin, 1), (H - 40) / Math.max(yMax - yMin, 1));
    const ox = (W - (xMax - xMin) * sc) / 2, oy = (H - (yMax - yMin) * sc) / 2;
    const P = (p) => [ox + (p.x - xMin) * sc, oy + (p.y - yMin) * sc];
    // base track
    ctx2.strokeStyle = 'rgba(120,150,190,0.25)';
    ctx2.lineWidth = 4;
    ctx2.beginPath();
    pts.forEach((p, i) => { const [x, y] = P(p); i ? ctx2.lineTo(x, y) : ctx2.moveTo(x, y); });
    ctx2.closePath();
    ctx2.stroke();
    // limiter colouring
    ctx2.lineWidth = 4.5;
    if (lap?.trace?.length) {
      for (const t of lap.trace) {
        const col = LIMITER_COLORS[t.limiter] ?? '#888';
        ctx2.strokeStyle = col;
        ctx2.beginPath();
        const a = P(t), b = P(t);
        ctx2.moveTo(a[0], a[1]);
        ctx2.lineTo(b[0] + 0.01, b[1] + 0.01);
        ctx2.lineWidth = 7;
        ctx2.stroke();
      }
      // redraw as dots colored (visible segments)
      for (let i = 0; i < lap.trace.length; i += 2) {
        const t = lap.trace[i];
        const [x, y] = P(t);
        ctx2.fillStyle = LIMITER_COLORS[t.limiter] ?? '#888';
        ctx2.fillRect(x - 2, y - 2, 5, 5);
      }
    }
    // start marker
    const s0 = P(pts[0]);
    ctx2.fillStyle = '#fff';
    ctx2.beginPath(); ctx2.arc(s0[0], s0[1], 4, 0, Math.PI * 2); ctx2.fill();
    ctx2.fillStyle = 'rgba(200,215,235,0.8)';
    ctx2.font = '10px ui-monospace,monospace';
    ctx2.fillText('S/F', s0[0] + 7, s0[1] + 3);
  }

  function run() {
    const def = DEFS[trackId];
    const track = prepareTrack(def, 700);
    if (state.programme.mode === 'season') spend(state.programme, { testingDays: 0.5 });
    const ctx = carContext();
    const lap = simulateLap(ctx.model, ctx.cal, ctx.meta, track, { weather: state.weather });
    lastLap = lap;
    state.session.lapRuns++;
    state.session.lapTested = true;
    persist();
    events.emit('session');


    resultRow.innerHTML = `
      <div class="lap-stat"><div class="kpi-k">LAP TIME</div><div class="lap-big">${fmtS(lap.timeS)}</div></div>
      <div class="lap-stat"><div class="kpi-k">SECTORS</div><div class="lap-mid">${lap.sectors.map((s) => s.toFixed(2)).join(' / ')}</div><div class="hint">${def.sectorNames.join(' · ')}</div></div>
      <div class="lap-stat"><div class="kpi-k">TOP SPEED</div><div class="lap-mid">${lap.topSpeedKmh.toFixed(0)} km/h</div><div class="hint">DRS ${lap.drsPct}% of lap</div></div>
      <div class="lap-stat"><div class="kpi-k">ENERGY</div><div class="lap-mid">${lap.energyMJ} MJ</div><div class="hint">battery ${((ctx.cal.powertrain.battery_capacity_mj)).toFixed(0)} MJ cap</div></div>
      <div class="lap-stat"><div class="kpi-k">TYRES</div><div class="lap-mid">${lap.tyre.tempEnd}°C</div><div class="hint">wear ${lap.tyre.wearPct}% · opt ${ctx.cal.tyres.temp_opt_c}°C</div></div>
      <div class="lap-stat"><div class="kpi-k">AIR</div><div class="lap-mid">${lap.conditions.rho.toFixed(3)} kg/m³</div><div class="hint">${WEATHER_PRESETS[state.weatherPreset].label}</div></div>`;
    resultRow.className = 'lap-results';

    // charts
    lineChart(speedChart, [
      { points: lap.trace.map((t) => ({ x: t.s, y: t.kmh })), color: '#5ad1ff', fill: true, label: 'speed km/h' },
      ...(compareLap ? [{ points: compareLap.trace.map((t) => ({ x: t.s, y: t.kmh })), color: '#8fa3bb', dashed: true, label: 'previous run' }] : [])
    ], { height: 200, xlabel: 'distance m' });
    lineChart(gChart, [
      { points: lap.trace.map((t) => ({ x: t.s, y: t.gLat })), color: '#63e6b0', label: 'lat g' },
      { points: lap.trace.map((t) => ({ x: t.s, y: t.gLong })), color: '#ffb454', label: 'long g' }
    ], { height: 150, xlabel: 'distance m' });
    lineChart(tyreChart, [
      { points: lap.trace.map((t) => ({ x: t.s, y: t.tyreT })), color: '#ff7a6e', label: 'tyre °C', fill: true }
    ], { height: 130, xlabel: 'distance m', yMin: 40, yMax: 160, vline: null });
    lineChart(dfChart, [
      { points: lap.trace.map((t) => ({ x: t.s, y: t.df })), color: '#3f8cff', label: 'downforce N' },
      { points: lap.trace.map((t) => ({ x: t.s, y: t.balance * 100 })), color: '#c792ea', label: 'balance %F', dashed: true }
    ], { height: 150, xlabel: 'distance m' });

    drawMap(lap, track);

    // engineering diagnosis (spec 70 style, derived from the run)
    const dg = layout.querySelector('.why-panel');
    if (dg) {
      const counts = Object.entries(lap.limiterCounts).sort((a, b) => b[1] - a[1]);
      const top = counts[0];
      const brakeZones = (lap.limiterCounts.BRAKE ?? 0);
      const slowCorners = lap.trace.filter((t) => t.kmh < 120).length;
      dg.innerHTML = '';
      const msg = '· Dominant limitation: ' + top[0] + ' (' + top[1] + ' stations). ';
      const advice = top[0] === 'POWER+ERS'
        ? 'Straight-line speed is the constraint — reduce drag or add deployment.'
        : top[0] === 'CORNER'
          ? 'Cornering is the constraint — more downforce or better balance will pay.'
          : top[0] === 'BRAKE'
            ? 'Braking zones dominate — platform stability and brake cooling matter here.'
            : top[0] === 'TRACTION'
              ? 'Traction-limited: weight distribution and rear axle load are the levers.'
              : 'Mixed-limited circuit.';
      dg.appendChild(h('div', { class: 'why-item' }, msg + advice));
      if (lap.tyre.tempEnd > 128) dg.appendChild(h('div', { class: 'why-item bad' }, '⚠ Tyres finishing at ' + lap.tyre.tempEnd + '°C — above the grip window (' + ctx.cal.tyres.temp_opt_c + '°C optimal).'));
      if (lap.tyre.tempEnd < 70) dg.appendChild(h('div', { class: 'why-item bad' }, '⚠ Tyres only ' + lap.tyre.tempEnd + '°C — below window, cold sessions lose grip.'));
      if (brakeZones > 60) dg.appendChild(h('div', { class: 'why-item' }, '· ' + brakeZones + ' braking stations — verify brake duct thermal margin before racing here.'));
      if (slowCorners > 40) dg.appendChild(h('div', { class: 'why-item' }, '· ' + slowCorners + ' low-speed stations (<120 km/h): mechanical platform outweighs aero here.'));
    }

    compareLap = lap;
  }

  const layout = h('div', { class: 'lap-layout' },
    head,
    h('div', { class: 'row gap' }, weatherSel, runBtn),
    resultRow,
    h('div', { class: 'grid-2 lap-charts' },
      panel('TRACK MAP — LIMITER MAP (where each physical limit binds)', mapCanvas, limitersPlaceholder()),
      panel('SPEED TRACE', speedChart)
    ),
    h('div', { class: 'grid-2 lap-charts' },
      panel('LATERAL / LONGITUDINAL G', gChart),
      panel('DOWNFORCE & BALANCE ALONG LAP', dfChart)
    ),
    h('div', { class: 'grid-2 lap-charts' },
      panel('TYRE TEMPERATURE (window drives grip)', tyreChart),
      panel('DIAGNOSIS — read this before developing', diagnosisEl())
    )
  );

  function limitersPlaceholder() {
    const el = h('div', { class: 'hint' });
    events.on('paramsChanged', () => { if (lastLap) { el.innerHTML = ''; el.appendChild(limitersLegend(lastLap.limiterCounts)); } });
    return el;
  }
  function diagnosisEl() {
    const el = h('div', { class: 'why-panel' });
    events.on('paramsChanged', () => { el.innerHTML = ''; });
    return el;
  }

  root.appendChild(layout);
  run();
  events.on('paramsChanged', () => { /* manual rerun keeps runs explicit */ });
}
