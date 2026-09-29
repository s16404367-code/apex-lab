// APEX LAB — DESIGN LAB (spec §8, §9, §11, §12, §13).
// Part tree · 3D viewport · Inspector · legality status. THE primary screen.

import { h, clear, sliderRow, badge, panel, fmtN, download } from '../dom.js';
import { state, setParam, applyParams, pushUndo, undo as doUndo, redo as doRedo, events } from '../../core/state.js';
import { PARAM_SCHEMA, GROUPS, PARAM_BY_KEY, boundsFor } from '../../core/model.js';
import { carContext, solveAt } from '../common.js';
import { createViewer } from '../../render/viewer.js';
import { drawBlueprint } from '../../render/blueprint.js';
import { encodeShareCode } from '../../storage/sharecode.js';

const GROUP_LABELS = {
  chassis: 'Chassis & Platform', suspension: 'Suspension', frontWing: 'Front Wing',
  rearWing: 'Rear Wing', floor: 'Floor', diffuser: 'Diffuser', body: 'Bodywork', cooling: 'Cooling'
};

export function designScreen(root) {
  const ctx = carContext();
  const prev = designScreen._lastSnapshot;
  const snapshot = JSON.stringify(ctx.model.params);

  const viewerWrap = h('div', { class: 'viewport-wrap' });
  const canvas = h('canvas', { class: 'viewport' });
  viewerWrap.appendChild(canvas);
  const viewer = createViewer(canvas);

  // ---------- left: part tree ----------
  const tree = h('div', { class: 'part-tree' });
  tree.appendChild(h('div', { class: 'panel-title' }, 'PART TREE'));
  const groupBtns = {};
  for (const g of GROUPS) {
    const count = PARAM_SCHEMA.filter((p) => p.group === g).length;
    const b = h('button', { class: 'tree-item', 'data-group': g, onclick: () => selectGroup(g) },
      h('span', { class: 'tree-dot', style: { background: treeColor(g) } }),
      GROUP_LABELS[g] ?? g,
      h('span', { class: 'tree-count' }, String(count))
    );
    groupBtns[g] = b;
    tree.appendChild(b);
  }
  tree.appendChild(h('div', { class: 'tree-actions' },
    h('button', { class: 'btn small', onclick: () => { blueprintModal(); } }, 'BLUEPRINT 2D'),
    h('button', { class: 'btn small', onclick: () => { pushUndo(); applyParams({ ...state.model.params, ...{} }, { silent: false }); } }, 'SNAPSHOT'),
    h('button', { class: 'btn small', onclick: shareModal }, 'SHARE CODE')
  ));

  // ---------- center: viewport ----------
  const viewBar = h('div', { class: 'view-bar' },
    h('button', { class: 'btn small', onclick: () => viewer.setView('side') }, 'SIDE'),
    h('button', { class: 'btn small', onclick: () => viewer.setView('top') }, 'TOP'),
    h('button', { class: 'btn small', onclick: () => viewer.setView('front') }, 'FRONT'),
    h('button', { class: 'btn small', onclick: () => viewer.setView('rear3q') }, 'REAR ¾'),
    h('span', { class: 'vsep' }),
    toggleBtn('ENVELOPE', true, (v) => draw()),
    toggleBtn('PRESSURE', false, (v) => draw()),
    toggleBtn('FLOW', false, (v) => draw(), 'animated flow particles'),
    toggleBtn('FORCES', true, (v) => draw()),
    toggleBtn('WIRE', true, (v) => draw()),
    h('span', { class: 'vsep' }),
    toggleBtn('TURNTABLE', false, (v) => draw(), 'auto-orbit showcase'),
    toggleBtn('DRS OPEN', false, (v) => draw(), 'animate the DRS actuator')
  );
  viewerWrap.appendChild(viewBar);

  // ---------- right: inspector ----------
  const inspector = h('div', { class: 'inspector' });
  let currentGroup = 'frontWing';
  const inspectorTitle = h('div', { class: 'panel-title' }, 'INSPECTOR — FRONT WING');
  const inspectorBody = h('div', { class: 'inspector-body' });
  inspector.append(inspectorTitle, inspectorBody);

  function selectGroup(g) {
    currentGroup = g;
    for (const [k, b] of Object.entries(groupBtns)) b.classList.toggle('active', k === g);
    inspectorTitle.textContent = 'INSPECTOR — ' + (GROUP_LABELS[g] ?? g).toUpperCase();
    clear(inspectorBody);
    const unlocked = state.model.unlocked;
    for (const p of PARAM_SCHEMA.filter((p) => p.group === g)) {
      const { min, max } = boundsFor(p.key, unlocked);
      const row = sliderRow({
        label: p.label, min, max, step: p.step, unit: p.unit, value: state.model.params[p.key], desc: p.desc, precision: p.step >= 1 ? 0 : 2,
        onInput: (v) => {
          setParam(p.key, v, { source: 'inspector' });
          if (p.desc) row.title = p.desc;
        }
      });
      inspectorBody.appendChild(row);
      row.dataset.param = p.key;
      paramRows[p.key] = row;
    }
    const gdesc = h('div', { class: 'hint' }, groupHint(g, ctx));
    inspectorBody.appendChild(gdesc);
  }
  const paramRows = {};

  // ---------- bottom: legality + deltas ----------
  const statusBar = h('div', { class: 'status-bar' });
  renderStatus();

  function renderStatus() {
    clear(statusBar);
    const legal = ctx.legality.legal;
    statusBar.append(
      h('div', { class: 'status-block' },
        h('span', { class: 'kpi-k' }, 'LEGality'.toUpperCase()),
        badge(legal ? 'LEGAL' : 'ILLEGAL', legal ? 'ok' : 'bad'),
        h('span', { class: 'hint' }, ` ${ctx.legality.checks.filter((c) => !c.pass).length} failed / ${ctx.legality.checks.length}`)
      ),
      h('div', { class: 'status-block wide' },
        (() => {
          const failed = ctx.legality.checks.filter((c) => !c.pass);
          if (!failed.length) {
            const flags = ctx.ref.flags.map((f) => f.id);
            return h('span', { class: 'hint' }, flags.length ? '⚠ ' + flags.join(' · ') : 'All regulation checks pass. Engineering state: ' + (ctx.heave.stable ? 'aero-stable' : 'PORPOISING RISK ' + ctx.heave.riskPct.toFixed(0) + '%'));
          }
          return h('span', { class: 'hint warn' }, '✗ ' + failed.slice(0, 3).map((f) => `${f.name}: ${fmtVal(f)} vs limit ${f.limit}${f.unit}`).join(' · '));
        })()
      )
    );
    // WHAT CHANGED (spec §11)
    if (prev && prev !== snapshot) {
      const before = JSON.parse(prev);
      const deltas = [];
      for (const k of Object.keys(before)) {
        if (before[k] !== ctx.model.params[k]) deltas.push({ k, d: ctx.model.params[k] - before[k] });
      }
      if (deltas.length) {
        const d = deltas[0];
        const pDef = PARAM_BY_KEY[d.k];
        statusBar.append(h('div', { class: 'status-block' },
          h('span', { class: 'kpi-k' }, 'LAST CHANGE'),
          h('span', { class: 'hint' }, `${pDef.label} ${d.d > 0 ? '+' : ''}${d.d.toFixed(pDef.step >= 1 ? 0 : 2)}${pDef.unit} → DF ${fmtN(ctx.ref.df.total)}N · drag ${fmtN(ctx.ref.drag)}N · bal ${ctx.ref.df.balancePct.toFixed(1)}%F`)
        ));
      }
    }
  }

  function fmtVal(f) {
    return typeof f.value === 'number' ? (Math.round(f.value * 10) / 10) : f.value;
  }

  // ---------- draw ----------
  function draw() {
    const overlay = {
      envelope: viewBar.querySelector('[data-t="ENVELOPE"]')?.classList.contains('on') ?? true,
      pressure: viewBar.querySelector('[data-t="PRESSURE"]')?.classList.contains('on') ? ctx.ref : null,
      flow: viewBar.querySelector('[data-t="FLOW"]')?.classList.contains('on') ?? false,
      forces: viewBar.querySelector('[data-t="FORCES"]')?.classList.contains('on') ? { dfFront: ctx.ref.df.front, dfRear: ctx.ref.df.rear, drag: ctx.ref.drag } : null,
      wireframe: viewBar.querySelector('[data-t="WIRE"]')?.classList.contains('on') ?? true,
      turntable: viewBar.querySelector('[data-t="TURNTABLE"]')?.classList.contains('on') ?? false,
      drs: viewBar.querySelector('[data-t="DRS OPEN"]')?.classList.contains('on') ?? false,
      reducedMotion: state.settings.reducedMotion
    };
    viewer.render(state.model, overlay);
  }

  selectGroup('frontWing');
  draw();

  const wrap = h('div', { class: 'design-layout' },
    h('div', { class: 'col-left' }, tree),
    h('div', { class: 'col-center' }, viewerWrap, statusBar),
    h('div', { class: 'col-right' }, inspector)
  );
  root.appendChild(wrap);
  designScreen._lastSnapshot = snapshot;

  // refresh param rows when params changed elsewhere
  events.on('paramsChanged', () => {
    for (const [k, row] of Object.entries(paramRows)) row.update(state.model.params[k]);
    draw();
  });

  function blueprintModal() {
    const overlayEl = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlayEl) overlayEl.remove(); } });
    const box = h('div', { class: 'modal' },
      h('div', { class: 'panel-title' }, 'ENGINEERING BLUEPRINT — auto dimensions'),
      (() => {
        const c = h('canvas', { class: 'bp-canvas' });
        drawBlueprint(c, state.model, 'side');
        const c2 = h('canvas', { class: 'bp-canvas' });
        drawBlueprint(c2, state.model, 'top');
        return [c, c2];
      })(),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: () => overlayEl.remove() }, 'CLOSE'))
    );
    overlayEl.appendChild(box);
    document.body.appendChild(overlayEl);
  }

  function shareModal() {
    const code = encodeShareCode(state.model.params);
    const overlayEl = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlayEl) overlayEl.remove(); } });
    const input = h('input', { class: 'text-input', value: code, readonly: 'readonly' });
    input.addEventListener('focus', () => input.select());
    const box = h('div', { class: 'modal' },
      h('div', { class: 'panel-title' }, 'SHARE CODE — car geometry, no server involved'),
      h('p', { class: 'hint' }, 'Anyone can paste this into SETTINGS → IMPORT SHARE CODE to reconstruct the exact design. Checksum-verified.'),
      input,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: () => { navigator.clipboard?.writeText(code); } }, 'COPY'),
        h('button', { class: 'btn', onclick: () => { download('apex-design.json', JSON.stringify(state.model.params, null, 2)); } }, 'EXPORT JSON'),
        h('button', { class: 'btn', onclick: () => overlayEl.remove() }, 'CLOSE')
      )
    );
    overlayEl.appendChild(box);
    document.body.appendChild(overlayEl);
  }
}

function toggleBtn(label, initial, onchange, title) {
  const b = h('button', { class: 'btn small toggle' + (initial ? ' on' : ''), 'data-t': label, title: title || '' }, label);
  b.addEventListener('click', () => { b.classList.toggle('on'); onchange(b.classList.contains('on')); });
  return b;
}

function treeColor(g) {
  return { chassis: '#c9d6e8', suspension: '#c792ea', frontWing: '#ffb454', rearWing: '#ff7a6e', floor: '#3f8cff', diffuser: '#5ad1ff', body: '#9fb2c8', cooling: '#63e6b0' }[g] ?? '#8899aa';
}

function groupHint(g, ctx) {
  const hints = {
    frontWing: 'FW sets the front axle load AND seeds the wake the floor and rear wing live in. Watch the FW wake → RW ledger line in the tunnel.',
    rearWing: 'RW angle is your biggest drag lever. Every degree of rear load shifts balance rearward and costs top speed.',
    floor: 'The floor is the engine of modern downforce. Ride height vs throat area sets the operating window (see tunnel sweep).',
    diffuser: 'Expansion angle above ~13° risks separation — legal up to 17°, but legal is not the same as good.',
    chassis: 'Ride heights and rake define the underbody geometry. Mass distribution shifts mechanical grip balance.',
    suspension: 'Suspension shapes the DYNAMIC platform: heave under load, pitch under braking, roll in corners. It couples directly into the aero map — no fake grip bonuses.',
    body: 'Bodywork trades frontal drag against flow conditioning for the beam wing and diffuser.',
    cooling: 'Inlet area is a hard trade: smaller = less drag, but thermal margin shrinks. Check the tunnel thermal readout.'
  };
  const base = hints[g] ?? '';
  if (g === 'floor') return base + ` Current: hAvg ${((state.model.params.rideHeightF + state.model.params.rideHeightR) / 2).toFixed(0)}mm, x=${ctx.ref.underbody.x.toFixed(2)} (1.0 = tunnel optimum).`;
  return base;
}
