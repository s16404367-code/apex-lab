// APEX LAB V4 — application shell: nav, top bar KPIs, onboarding, boot.

import { h, clear, badge, fmtN } from './ui/dom.js';
import { state, events, init, undo, redo, applyParams, persist } from './core/state.js';
import { carContext } from './ui/common.js';
import { designScreen } from './ui/screens/design.js';
import { tunnelScreen } from './ui/screens/tunnel.js';
import { lapsimScreen } from './ui/screens/lapsim.js';
import { developScreen } from './ui/screens/develop.js';
import { experimentsScreen } from './ui/screens/experiments.js';
import { compareScreen } from './ui/screens/compare.js';
import { regulationsScreen, handbookScreen, settingsScreen } from './ui/screens/data.js';
import { decodeShareCode } from './storage/sharecode.js';


const NAV = [
  { id: 'design', label: 'DESIGN', render: designScreen },
  { id: 'tunnel', label: 'WIND TUNNEL', render: tunnelScreen },
  { id: 'lapsim', label: 'LAP SIM', render: lapsimScreen },
  { id: 'develop', label: 'DEVELOP', render: developScreen },
  { id: 'experiments', label: 'EXPERIMENTS', render: experimentsScreen },
  { id: 'compare', label: 'COMPARE', render: compareScreen },
  { id: 'regulations', label: 'REGULATIONS', render: regulationsScreen },
  { id: 'handbook', label: 'HANDBOOK', render: handbookScreen },
  { id: 'settings', label: 'SETTINGS', render: settingsScreen }
];

let current = 'design';

function boot() {
  init();
  exposeDebug();
  document.getElementById('app').append(buildTopbar(), buildNav(), buildMain());
  navigate(location.hash.replace('#', '') || 'design');
  events.on('paramsChanged', () => refreshTopbar());
  events.on('session', () => refreshTopbar());
  window.addEventListener('hashchange', () => {
    const id = location.hash.replace('#', '');
    if (NAV.some((n) => n.id === id)) navigate(id);
  });
  onboarding();
  setInterval(persistTick, 4000);
}

function persistTick() {
  // periodic implicit save is handled by state.persist(); nothing needed here
}

function exposeDebug() {
  // used by settings share-code import + e2e tests
  window.__apexState = { state, applyParams, events };
}

let topbarEl, mainEl;
function buildTopbar() {
  topbarEl = h('div', { class: 'topbar' });
  refreshTopbar();
  return topbarEl;
}

function refreshTopbar() {
  if (!topbarEl) return;
  const ctx = carContext();
  clear(topbarEl);
  topbarEl.append(
    h('div', { class: 'brand' }, h('b', {}, 'APEX'), ' LAB', h('span', { class: 'dim' }, ' V4')),
    h('div', { class: 'topbar-kpis' },
      kpi('CAR', state.model.versionId === 'APEX-000' ? 'BASELINE' : state.model.versionId),
      kpi('LEGALITY', ctx.legality.legal ? 'LEGAL' : 'ILLEGAL', ctx.legality.legal ? 'ok' : 'bad'),
      kpi('DOWNFORCE', fmtN(ctx.ref.df.total) + ' N'),
      kpi('DRAG', fmtN(ctx.ref.drag) + ' N'),
      kpi('L/D', ctx.ref.ld.toFixed(2)),
      kpi('BALANCE', ctx.ref.df.balancePct.toFixed(0) + '%F'),
      kpi('THERMAL', ctx.ref.thermal.marginPct.toFixed(0) + '%', ctx.ref.thermal.marginPct > 10 ? '' : 'bad'),
      kpi('PORPOISE RISK', ctx.heave.riskPct.toFixed(0) + '%', ctx.heave.riskPct < 40 ? 'ok' : 'bad')
    ),
    h('div', { class: 'topbar-actions' },
      h('button', { class: 'btn small', title: 'Undo (Ctrl+Z)', onclick: () => { undo(); } }, '⟲ UNDO'),
      h('button', { class: 'btn small', title: 'Redo (Ctrl+Y)', onclick: () => { redo(); } }, 'REDO ⟳'),
      h('span', { class: 'dim tiny' }, 'autosaved locally')
    )
  );
}

function kpi(k, v, cls = '') {
  return h('div', { class: 'topbar-kpi ' + cls }, h('div', { class: 'kpi-k' }, k), h('div', { class: 'kpi-v' }, v));
}

function buildNav() {
  const nav = h('div', { class: 'nav' });
  for (const n of NAV) {
    nav.appendChild(h('button', {
      class: 'nav-btn' + (n.id === current ? ' active' : ''),
      'data-nav': n.id,
      onclick: () => { location.hash = n.id; }
    }, n.label));
  }
  return nav;
}

function buildMain() {
  mainEl = h('main', { class: 'main', id: 'main' });
  return mainEl;
}

function navigate(id) {
  current = id;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.nav === id));
  clear(mainEl);
  const screen = NAV.find((n) => n.id === id);
  const scrollPos = window.scrollY;
  try {
    screen.render(mainEl);
  } catch (err) {
    // error recovery (spec §112): inform + preserve
    mainEl.appendChild(h('div', { class: 'panel' },
      h('div', { class: 'panel-title' }, 'SCREEN ERROR — recovered'),
      h('div', { class: 'hint' }, String(err?.stack ?? err)),
      h('button', { class: 'btn', onclick: () => navigate(id) }, 'RETRY')));
    console.error('[apexlab] screen error:', err);
  }
  window.scrollTo(0, scrollPos);
  refreshTopbar();
}

function onboarding() {
  if (state.settings.onboardingDone) return;
  const steps = [
    ['1 · Welcome, Engineer', 'You are the aerodynamicist, vehicle dynamics engineer and technical director. This is your legal design envelope — everything you build must live inside it. The baseline car is deliberately unremarkable.'],
    ['2 · Change something real', 'Open the FRONT WING in the part tree and move the main angle slider. Watch the WHAT CHANGED evidence in the status bar — every edit becomes geometry, then forces.'],
    ['3 · Test it', 'Go to the WIND TUNNEL. Run the Ride Height Sweep preset. Find the floor peak and the stall edge — downforce does NOT grow forever at low ride height.'],
    ['4 · Feel the consequence', 'Run the LAP SIM on Kestrel Ring. The coloured limiter map shows exactly which physical limit binds where.'],
    ['5 · Develop', 'In DEVELOP, create a prototype from a concept. It predicts with the same solver, tests with correlation noise, then you approve or reject. Install it and your car version evolves.'],
    ['6 · Understand', 'Legal ≠ good. Peak ≠ robust. Fast ≠ winnable. The best engineers read the trade-offs, not the biggest number.']
  ];
  const overlay = h('div', { class: 'modal-overlay onboarding' });
  let i = 0;
  const content = h('div', { class: 'modal onboarding-modal' });
  const renderStep = () => {
    clear(content);
    content.append(
      h('div', { class: 'panel-title' }, steps[i][0]),
      h('p', { style: { margin: '10px 0 18px', lineHeight: '1.55' } }, steps[i][1]),
      h('div', { class: 'modal-actions' },
        i > 0 ? h('button', { class: 'btn', onclick: () => { i--; renderStep(); } }, 'BACK') : '',
        h('button', { class: 'btn primary', onclick: () => { if (i < steps.length - 1) { i++; renderStep(); } else { state.settings.onboardingDone = true; persist(); overlay.remove(); } } }, i < steps.length - 1 ? 'NEXT' : 'START ENGINEERING')
      )
    );
  };
  renderStep();
  overlay.appendChild(content);
  document.body.appendChild(overlay);
}

// keyboard: undo/redo (spec §73 keyboard support)
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); }
});

// deep-link share code: index.html#code=APEX1-...
window.addEventListener('load', () => {
  const m = /code=(APEX1-[A-Za-z0-9\-_]+)/.exec(location.hash);
  if (m) {
    init();
    const params = decodeShareCode(m[1]);
    if (params) {
      applyParams(params, { source: 'sharecode' });
      history.replaceState(null, '', location.pathname);
    }
  }
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
