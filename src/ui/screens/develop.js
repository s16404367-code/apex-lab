// APEX LAB — DEVELOPMENT screen (spec §31–§59).
// Upgrade tree · R&D board (prototype workflow) · resources · notebook.

import { h, clear, badge, panel, fmtN, fmtPct, fmtS, download } from '../dom.js';
import { state, events, persist, checkoutVersion } from '../../core/state.js';
import { carContext } from '../common.js';
import {
  UPGRADE_TREE, ALL_CONCEPTS, conceptById, newProgramme, createPrototype,
  runPrototypeTests, installPrototype, rejectPrototype, canAfford, spend, conceptCalEffects
} from '../../core/dev.js';
import { CarModel } from '../../core/model.js';
import { buildGeometry } from '../../core/geometry.js';
import { evalReference } from '../../core/aero.js';
import { prepareTrack } from '../../sim/tracks.js';
import { simulateLap } from '../../sim/lap.js';
import T1 from '../../../data/tracks/kestrel-ring.js';

const RES_LABEL = { money: 'Money', tunnelHours: 'Tunnel hrs', cfdTokens: 'CFD tokens', engineeringHours: 'Eng hrs', prototypeSlots: 'Proto slots', manufacturingCapacity: 'Mfg capacity', testingDays: 'Test days' };

export function developScreen(root) {
  const prog = state.programme;

  // ---------- resources header ----------
  const resRow = h('div', { class: 'res-row' });
  renderResources();

  function renderResources() {
    clear(resRow);
    resRow.appendChild(badge(prog.mode === 'sandbox' ? 'SANDBOX — unlimited resources' : 'SEASON — finite resources', prog.mode === 'sandbox' ? 'ok' : 'warn'));
    if (prog.mode === 'season') {
      for (const [k, v] of Object.entries(prog.resources)) {
        resRow.appendChild(h('span', { class: 'res-item' }, `${RES_LABEL[k]}: <b>${typeof v === 'number' && !isFinite(v) ? '∞' : Math.round(v * 10) / 10}</b>`));
      }
    }
  }

  // ---------- upgrade tree ----------
  const treeEl = h('div', { class: 'upgrade-tree' });
  renderTree();

  function conceptUnlocked(id) {
    return prog.unlocked.includes(id) || prog.mode === 'sandbox';
  }
  function requirementMet(c) {
    return (c.requires ?? []).every((r) => prog.unlocked.includes(r) || prog.mode === 'sandbox');
  }

  function renderTree() {
    clear(treeEl);
    for (const branch of UPGRADE_TREE.branches) {
      const branchEl = h('div', { class: 'upgrade-branch' }, h('div', { class: 'panel-title' }, branch.name.toUpperCase()));
      for (const c of branch.concepts) {
        const unlocked = conceptUnlocked(c.id);
        const met = requirementMet(c);
        const card = h('div', { class: 'concept-card' + (unlocked ? ' owned' : '') },
          h('div', { class: 'concept-head' }, c.name, unlocked ? badge('OWNED', 'ok') : met ? badge('AVAILABLE', '') : badge('LOCKED', 'dim')),
          h('div', { class: 'hint' }, c.summary),
          h('div', { class: 'concept-risk' }, '⚠ ' + c.risk),
          h('div', { class: 'concept-cost' },
            Object.entries(c.cost).map(([k, v]) => `${RES_LABEL[k]} ${v}`).join(' · '),
            unlocked ? '' : h('button', {
              class: 'btn small primary', style: { marginLeft: '10px' },
              onclick: () => {
                if (!met) return;
                if (!spend(prog, c.cost)) { alert('Insufficient resources.'); return; }
                prog.unlocked.push(c.id);
                state.model = new CarModel(state.model.params, { name: state.model.name, versionId: state.model.versionId, unlocked: prog.unlocked.flatMap((id) => conceptCalEffects(conceptById(id))) });
                persist();
                events.emit('paramsChanged', { source: 'concept' });
                renderTree(); renderResources();
              }
            }, 'DEVELOP')
          )
        );
        branchEl.appendChild(card);
      }
      treeEl.appendChild(branchEl);
    }
  }

  // ---------- R&D board ----------
  const boardEl = h('div', { class: 'rd-board' });
  renderBoard();

  function renderBoard() {
    clear(boardEl);
    if (!prog.prototypes.length) {
      boardEl.appendChild(h('div', { class: 'hint' }, 'No prototypes yet. Create one from a concept below — the prototype changes real geometry, is predicted by the same solvers, then tested in the tunnel and on track simulation.'));
    }
    for (const proto of prog.prototypes) {
      boardEl.appendChild(protoCard(proto));
    }
  }

  function protoCard(proto) {
    const stageBadge = { simulated: badge('PREDICTED', ''), tested: badge('TESTED', 'warn'), installed: badge('INSTALLED', 'ok'), rejected: badge('REJECTED', 'bad') }[proto.stage] ?? badge(proto.stage.toUpperCase());
    const card = h('div', { class: 'proto-card' });
    card.appendChild(h('div', { class: 'concept-head' }, `${proto.id} — ${proto.name}`, stageBadge));
    const pred = proto.prediction;
    if (pred) {
      card.appendChild(h('div', { class: 'proto-grid' },
        cell('Predicted DF', fmtN(pred.df) + ' N'),
        cell('Predicted drag', fmtN(pred.drag) + ' N'),
        cell('Predicted lap', fmtS(pred.lapTime)),
        cell('Heave risk', pred.heaveRisk.toFixed(0) + '%')
      ));
    }
    if (proto.tunnelResult && proto.trackResult) {
      const base = parentStats(proto);
      card.appendChild(h('div', { class: 'panel-title small' }, 'CORRELATION — predicted vs tested'));
      card.appendChild(h('table', { class: 'data-table' },
        h('tr', {}, h('th', {}, ''), h('th', {}, 'Predicted'), h('th', {}, 'Tested')),
        h('tr', {}, h('td', {}, 'Downforce'), h('td', {}, fmtPct(((pred.df - base.df) / base.df) * 100)), h('td', {}, fmtPct(((proto.tunnelResult.df - base.df) / base.df) * 100))),
        h('tr', {}, h('td', {}, 'Drag'), h('td', {}, fmtPct(((pred.drag - base.drag) / base.drag) * 100)), h('td', {}, fmtPct(((proto.tunnelResult.drag - base.drag) / base.drag) * 100))),
        h('tr', {}, h('td', {}, 'Lap time'), h('td', {}, fmtS(pred.lapTime)), h('td', {}, fmtS(proto.trackResult.lapTime)))
      ));
      card.appendChild(h('div', { class: 'hint' },
        `Lap Δ vs parent: <b>${proto.correlation.lapDeltaS > 0 ? '+' : ''}${proto.correlation.lapDeltaS.toFixed(2)} s</b> · correlation error ${proto.correlation.predictedVsTestedPct.toFixed(1)}% · risk note: ${proto.risk}`
      ));
    }
    const actions = h('div', { class: 'row-btns' });
    if (proto.stage === 'simulated') {
      actions.appendChild(h('button', {
        class: 'btn small primary', onclick: () => {
          if (state.programme.mode === 'season' && !spend(prog, { tunnelHours: proto.tunnelResult ? 0 : 8, testingDays: 0.5 })) { alert('Insufficient resources for testing.'); return; }
          runPrototypeTests(prog, proto, currentBase());
          state.session.prototypes++;
          persist(); renderBoard();
        }
      }, 'RUN TUNNEL + TRACK TEST'));
      actions.appendChild(h('button', { class: 'btn small', onclick: () => { prog.prototypes = prog.prototypes.filter((p) => p !== proto); persist(); renderBoard(); } }, 'DISCARD'));
    }
    if (proto.stage === 'tested') {
      actions.appendChild(h('button', {
        class: 'btn small primary', onclick: () => {
          proto.decision = { summary: 'Approved after correlation review.', outcome: 'APPROVED' };
          const v = installPrototype(prog, proto);
          state.session.installs++;
          state.versionMeta.set(v.id, { name: v.name });
          // auto-checkout installed version as the working car
          checkoutVersion(v);
          persist(); renderBoard(); renderResources();
        }
      }, 'APPROVE → MANUFACTURE → INSTALL'));
      actions.appendChild(h('button', {
        class: 'btn small danger', onclick: () => {
          rejectPrototype(prog, proto, 'Correlation review: no case to proceed.');
          persist(); renderBoard();
        }
      }, 'REJECT'));
    }
    card.appendChild(actions);
    return card;
  }

  function cell(k, v) {
    return h('div', { class: 'proto-cell' }, h('div', { class: 'kpi-k' }, k), h('div', { class: 'proto-val' }, v));
  }

  let parentStatsCache = null;
  function parentStats(proto) {
    if (parentStatsCache && parentStatsCache.parentId === proto.parentId) return parentStatsCache;
    const parent = currentBase();
    const cal = parent.calibration(state.cal);
    const { meta } = buildGeometry(parent);
    const ref = evalReference(parent, cal, meta);
    parentStatsCache = { parentId: proto.parentId, df: ref.df.total, drag: ref.drag };
    return parentStatsCache;
  }
  function currentBase() {
    // parent = the version the working car derives from
    return state.model;
  }

  // ---------- create prototype panel ----------
  const createRow = h('div', { class: 'row gap wrap' });
  const conceptSel = h('select', { class: 'select' });
  for (const c of ALL_CONCEPTS) conceptSel.appendChild(h('option', { value: c.id }, `${c.branchName} — ${c.name}`));
  const createBtn = h('button', {
    class: 'btn primary', onclick: () => {
      const c = conceptById(conceptSel.value);
      if (!c) return;
      if (state.programme.mode === 'season' && !canAfford(prog, c.cost)) { alert('Insufficient resources for this concept.'); return; }
      createPrototype(prog, state.model, null, c);
      state.session.prototypes++;
      persist(); renderBoard();
    }
  }, 'CREATE PROTOTYPE');
  createRow.append(h('span', { class: 'hint' }, 'New prototype from concept:'), conceptSel, createBtn);

  // ---------- notebook ----------
  const notebookEl = h('div', { class: 'notebook' });
  renderNotebook();
  function renderNotebook() {
    clear(notebookEl);
    if (!prog.notebook.length) { notebookEl.appendChild(h('div', { class: 'hint' }, 'The notebook logs every approval, rejection and finding automatically. Failed tests keep their information value (spec §86).')); return; }
    for (const entry of prog.notebook.slice(0, 12)) {
      notebookEl.appendChild(h('div', { class: 'notebook-entry' },
        h('span', { class: 'hint' }, new Date(entry.t).toLocaleString()),
        h('div', {}, entry.text)
      ));
    }
  }

  // ---------- season controls ----------
  const seasonRow = h('div', { class: 'row-btns' });
  const modeBtn = h('button', {
    class: 'btn small', onclick: () => {
      prog.mode = prog.mode === 'sandbox' ? 'season' : 'sandbox';
      if (prog.mode === 'season' && isFinite(prog.resources.money)) { /* keep finite pool */ }
      if (prog.mode === 'sandbox') {
        for (const k of Object.keys(prog.resources)) prog.resources[k] = Infinity;
      } else {
        Object.assign(prog.resources, { money: 100, tunnelHours: 120, cfdTokens: 200, engineeringHours: 400, prototypeSlots: 3, manufacturingCapacity: 6, testingDays: 4 });
      }
      persist(); renderResources(); renderTree();
    }
  }, prog.mode === 'sandbox' ? 'SWITCH TO SEASON MODE (finite resources)' : 'SWITCH TO SANDBOX (unlimited)');
  seasonRow.appendChild(modeBtn);

  const layout = h('div', { class: 'develop-layout' },
    resRow,
    seasonRow,
    createRow,
    h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, 'R&D BOARD — prototypes in development'), boardEl),
    h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, 'ENGINEERING DEVELOPMENT TREE — concepts change the real model'), treeEl),
    h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, "ENGINEER'S NOTEBOOK"), notebookEl)
  );
  root.appendChild(layout);
  events.on('paramsChanged', () => { renderResources(); });
}
