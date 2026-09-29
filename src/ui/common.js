// APEX LAB — shared screen helpers.

import { state } from '../core/state.js';
import { buildGeometry } from '../core/geometry.js';
import { solveAero, evalReference, referenceCondition } from '../core/aero.js';
import { heaveStability } from '../core/stability.js';
import { checkLegality } from '../core/regulations.js';
import { validateParams } from '../core/model.js';

/** Everything a screen needs about the current car, solved once per render. */
export function carContext(opts = {}) {
  const model = state.model;
  const cal = model.calibration(state.cal);
  const { meta } = buildGeometry(model);
  const ref = evalReference(model, cal, meta);
  const cond = referenceCondition(model, cal, state.weather);
  cond.rho = state.conditions?.rho ?? cond.rho;
  const heave = heaveStability(model, cal, ref, 69.4);
  const legality = checkLegality(model);
  legality.checks = legality.checks.map((c) => ({ ...c, _value: c.value }));
  const paramIssues = validateParams(model.params, model.unlocked);
  return { model, cal, meta, ref, cond, heave, legality, paramIssues };
}

/** Solve at arbitrary conditions with dynamic heights from current params. */
export function solveAt(cond) {
  const model = state.model;
  const cal = model.calibration(state.cal);
  const { meta } = buildGeometry(model);
  return solveAero(model, cal, meta, { ...referenceCondition(model, cal), ...cond });
}

export const LIMITER_COLORS = {
  CORNER: '#5ad1ff', GRIP: '#63e6b0', 'POWER+ERS': '#ffb454', POWER: '#ffb454',
  BRAKE: '#ff7a6e', TRACTION: '#c792ea', 'AERO-FLAT': '#3f8cff'
};

export function limitersLegend(counts) {
  const el = document.createElement('div');
  el.className = 'legend-row';
  for (const [k, v] of Object.entries(counts)) {
    const s = document.createElement('span');
    s.className = 'legend-item';
    s.innerHTML = `<i style="background:${LIMITER_COLORS[k] ?? '#888'}"></i>${k} <b>${v}</b>`;
    el.appendChild(s);
  }
  return el;
}
