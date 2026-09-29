// APEX LAB — data screens: REGULATIONS, HANDBOOK, SETTINGS (spec §106–§108, §81, §73).

import { h, clear, panel, badge, download } from '../dom.js';
import { state, events, persist, exportJSON, importJSON, resetToBaseline } from '../../core/state.js';
import { REGS, checkLegality } from '../../core/regulations.js';
import { decodeShareCode, encodeShareCode } from '../../storage/sharecode.js';
import { CarModel, PARAM_BY_KEY } from '../../core/model.js';
import { lsDel, idbClear } from '../../storage/storage.js';
import { buildGeometry } from '../../core/geometry.js';
import { evalReference } from '../../core/aero.js';

const TIER_INFO = {
  verified: { label: 'VERIFIED', cls: 'ok', desc: 'Manually transcribed from the cited source by a named human.' },
  'game-default': { label: 'GAME DEFAULT', cls: 'warn', desc: 'Chosen for playability. NOT an official FIA limit.' },
  pending: { label: 'PENDING', cls: 'dim', desc: 'No value available yet. Not enforced.' },
  candidate: { label: 'CANDIDATE', cls: '', desc: 'Sourced but not independently reviewed.' }
};

export function regulationsScreen(root) {
  const ctx = carContext();
  const banner = h('div', { class: 'honesty-banner' }, REGS.honestyNotice);
  const table = h('table', { class: 'data-table wide' });
  table.appendChild(h('tr', {},
    h('th', {}, 'RULE'), h('th', {}, 'VALUE'), h('th', {}, 'TIER'), h('th', {}, 'ARTICLE'), h('th', {}, 'STATUS')));
  const checkById = Object.fromEntries(ctx.legality.checks.map((c) => [c.id, c]));
  for (const r of REGS.rules) {
    const tier = TIER_INFO[r.tier] ?? TIER_INFO['game-default'];
    const chk = checkById[r.id];
    table.appendChild(h('tr', {},
      h('td', {}, h('b', {}, r.name), h('div', { class: 'hint' }, r.description)),
      h('td', {}, String(r.value) + ' ' + r.unit),
      h('td', {}, badge(tier.label, tier.cls), h('div', { class: 'hint tiny' }, tier.desc)),
      h('td', {}, r.article),
      h('td', {}, chk ? (chk.pass ? badge('PASS', 'ok') : badge('FAIL', 'bad')) : badge('INFO', 'dim'))
    ));
  }
  const envelope = h('div', { class: 'concept-card' },
    h('div', { class: 'concept-head' }, 'DESIGN ENVELOPE'),
    h('div', { class: 'hint' },
      `Length ${REGS.envelope.lengthMax_mm} mm · Width ${REGS.envelope.widthMax_mm} mm · Height ${REGS.envelope.heightMax_mm} mm — tier ${TIER_INFO[REGS.envelope.tier].label}. The 3D envelope shown in the Design Lab is built from these values.`));
  const changelog = h('div', { class: 'concept-card' },
    h('div', { class: 'concept-head' }, 'CHANGELOG'),
    ...REGS.regulationChangelog.map((c) => h('div', { class: 'hint' }, `${c.version} — ${c.date}: ${c.changes}`)));
  root.appendChild(h('div', { class: 'develop-layout' }, banner,
    panel('ACTIVE RULESET — ' + REGS.title, table),
    envelope, changelog));
}

export function handbookScreen(root) {
  const lessons = [
    { id: 'downforce', title: 'Downforce', body: 'F = ½·ρ·V²·C·A. Downforce rises with the SQUARE of speed: twice the speed → four times the load. That is why aero dominates high-speed corners and barely matters in slow ones. Watch the speed sweep in the tunnel — the DF and drag curves both bend upward with V².' },
    { id: 'drag', title: 'Drag & L/D', body: 'Drag has three parts here: profile (bodywork pushing air), induced (the price of making downforce — scales with CL²) and internal (cooling flow). Efficiency L/D decides straight-line performance. More rear wing = more load AND more induced drag: the trade never disappears.' },
    { id: 'ground', title: 'Ground Effect', body: 'The floor works like a venturi: air accelerates under the car, pressure drops, the car is sucked down. Ride the tunnel sweep: downforce climbs as ride height falls, peaks at the tunnel optimum, then CHOKES and stalls below it. Very low is not infinitely good — it is a cliff.' },
    { id: 'balance', title: 'Aero Balance', body: 'Balance = front downforce ÷ total. Move it rearward and the car understeers less in fast corners but the rear axle carries more. The FW wake and diffuser upwash couple the ends: changing one wing changes the other wing\'s effective flow. Check the ledger interactions.' },
    { id: 'porpoising', title: 'Porpoising', body: 'Below the tunnel optimum, downforce increases as the floor drops (positive feedback). With flow lag (~45 ms), that restoring force arrives late — negative damping. If damper rate can\'t absorb the aero slope, heave oscillation grows: porpoising. Fix with dampers, platform stiffness, or ride height.' },
    { id: 'yaw', title: 'Yaw', body: 'Crosswinds hit the floor inlet hardest: underbody load decays roughly exponentially with yaw angle, balance migrates forward, the car understeers/overspills. Yaw robustness is a design property — vanes and throat geometry move the critical angle.' },
    { id: 'flex', title: 'Wing Flex', body: 'Wings twist under load; effective incidence falls as speed rises (watch FW/RW twist in the speed sweep). Softer wings = load plateau at high speed; stiff wings hold shape but weigh more. Regulations define deflection tests — design inside them.' },
    { id: 'tyres', title: 'Tyres', body: 'Grip lives in a temperature window (~95 °C here). Heavy cornering heats the tyre; straights cool it. A balance that overworks one axle overheats that end and grip fades. The lap sim shows the temperature trace — aim to finish the lap near the window, not clamped at the ceiling.' },
    { id: 'cooling', title: 'Cooling', body: 'Inlet area buys thermal margin with drag. Smaller inlets are only "better" if the thermal margin stays positive at race speeds. The tunnel shows capacity vs demand — watch the flag.' },
    { id: 'robustness', title: 'Robustness', body: 'A manufactured part is never exactly the CAD. Tolerances on wing angles and ride heights spread your operating point. A design with 96% peak load and a wide window can beat a 100% peak with a knife-edge. Run the robustness test before approving anything.' }
  ];
  const listEl = h('div', { class: 'handbook-list' });
  for (const l of lessons) {
    listEl.appendChild(h('div', { class: 'concept-card' },
      h('div', { class: 'concept-head' }, l.title),
      h('div', { class: 'hint' }, l.body),
      h('button', {
        class: 'btn small', onclick: () => {
          // live demo: jump to tunnel with a relevant preset
          location.hash = '#tunnel';
        }
      }, 'SEE IT LIVE → TUNNEL')
    ));
  }
  root.appendChild(h('div', { class: 'develop-layout' },
    panel('ENGINEERING HANDBOOK — every lesson is driven by the same simulator', h('div', { class: 'hint' }, 'Reduced-order teaching models, honestly labelled. Nothing here is CFD.'), listEl)));
}

export function settingsScreen(root) {
  const s = state.settings;

  const engMode = h('input', { type: 'checkbox' });
  engMode.checked = s.engineeringMode;
  engMode.addEventListener('change', () => { s.engineeringMode = engMode.checked; persist(); events.emit('requestRefresh'); });

  const motion = h('input', { type: 'checkbox' });
  motion.checked = s.reducedMotion;
  motion.addEventListener('change', () => { s.reducedMotion = motion.checked; persist(); });

  // export / import
  const exportBtn = h('button', { class: 'btn', onclick: () => download('apex-lab-save.json', exportJSON()) }, 'EXPORT SAVE (JSON)');
  const importInput = h('input', { type: 'file', accept: '.json', style: { display: 'none' } });
  importInput.addEventListener('change', async () => {
    const f = importInput.files[0];
    if (!f) return;
    try {
      importJSON(await f.text());
      alert('Save imported.');
    } catch (e) {
      alert('Import failed: ' + e.message + ' — last valid state preserved.');
    }
  });
  const importBtn = h('button', { class: 'btn', onclick: () => importInput.click() }, 'IMPORT SAVE (JSON)');

  // share code import
  const shareInput = h('input', { class: 'text-input', placeholder: 'APEX1-…' });
  const importShare = h('button', {
    class: 'btn', onclick: () => {
      const params = decodeShareCode(shareInput.value);
      if (!params) { alert('Invalid share code (checksum failed).'); return; }
      const { applyParams } = window.__apexState ?? {};
      if (applyParams) applyParams(params, { source: 'share' });
    }
  }, 'LOAD SHARE CODE');

  // calibration panel (developer, spec §92)
  const calEl = h('div', { class: 'cal-panel' });
  renderCal(calEl);
  function renderCal(el) {
    clear(el);
    const flat = [];
    const walk = (obj, path) => {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'number') flat.push({ path: path + k, v });
        else if (typeof v === 'object' && v !== null) walk(v, path + k + '.');
      }
    };
    walk(state.cal, '');
    const t = h('table', { class: 'data-table' });
    t.appendChild(h('tr', {}, h('th', {}, 'COEFFICIENT'), h('th', {}, 'VALUE'), h('th', {}, 'PROVENANCE')));
    for (const f of flat) {
      t.appendChild(h('tr', {}, h('td', { class: 'tiny' }, f.path), h('td', { class: 'tiny' }, String(f.v)), h('td', { class: 'tiny dim' }, 'game abstraction')));
    }
    el.appendChild(h('div', { class: 'hint' }, `All ${flat.length} coefficients. Every one is a documented game abstraction — no hidden buffs (spec §92, §117).`));
    el.appendChild(t);
  }

  const resetBtn = h('button', {
    class: 'btn danger', onclick: () => {
      if (!confirm('Erase all saved progress (designs, versions, prototypes)?')) return;
      lsDel('state');
      idbClear();
      location.reload();
    }
  }, 'ERASE ALL PROGRESS');

  root.appendChild(h('div', { class: 'develop-layout' },
    panel('SETTINGS',
      h('div', { class: 'row-btns' }, h('label', { class: 'hint' }, 'Engineering Mode (extra readouts)'), engMode),
      h('div', { class: 'row-btns' }, h('label', { class: 'hint' }, 'Reduced motion'), motion),
      h('div', { class: 'row-btns' }, exportBtn, importBtn, importInput),
      h('div', { class: 'row-btns' }, shareInput, importShare),
      h('div', { class: 'row-btns' }, resetBtn)),
    panel('CALIBRATION — every coefficient exposed', calEl)));
}
