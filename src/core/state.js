// APEX LAB — application state (single source of runtime truth).
// Owns the working CarModel, the R&D programme, weather, settings, undo/redo.

import { CarModel, defaultParams, sanitizeParams } from './model.js';
import { sanitizeShape, isValidShape } from './carShape.js';
import { bus, deepClone } from './util.js';
import { lsGet, lsSet } from '../storage/storage.js';
import { newProgramme, installPrototype } from './dev.js';
import CAL from '../../data/calibration/defaults.js';
import BASE from '../../data/cars/baseline-car.js';
import { WEATHER_PRESETS } from './weather.js';

export const events = bus();

export const state = {
  cal: CAL,
  model: null,
  shape: null, // sculpted chassis shape (Shape Studio); null = default shape
  programme: null,
  weather: { ...WEATHER_PRESETS.standard },
  weatherPreset: 'standard',
  settings: {
    engineeringMode: false,
    reducedMotion: false,
    resourceMode: 'sandbox',
    onboardingDone: false
  },
  undoStack: [],
  redoStack: [],
  session: { tunnelRuns: 0, lapRuns: 0, prototypes: 0, installs: 0, paramEdits: 0, tunnelTested: false, lapTested: false },
  versionMeta: new Map() // hash → {name, installed}
};

export function init() {
  const saved = lsGet('state');
  const params = saved?.params ?? { ...BASE.params };
  state.shape = isValidShape(saved?.shape) ? sanitizeShape(saved.shape) : null;
  state.model = new CarModel(sanitizeParams(params ?? defaultParams()), { name: saved?.modelName ?? 'APEX-001 Baseline', versionId: saved?.versionId ?? 'APEX-000', shape: state.shape });
  state.programme = saved?.programme ?? newProgramme(state.settings.resourceMode);
  if (saved?.settings) Object.assign(state.settings, saved.settings);
  if (saved?.weather) state.weather = saved.weather;
  if (saved?.weatherPreset) state.weatherPreset = saved.weatherPreset;
  // rebuild version meta map
  state.versionMeta = new Map();
  state.versionMeta.set('APEX-000', { name: 'APEX-001 Baseline' });
  for (const v of state.programme.versions) state.versionMeta.set(v.id, { name: v.name });
  if (!state.model.versionId) state.model.versionId = 'APEX-000';
}

let persistTimer = null;
export function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    lsSet('state', {
      params: state.model.params,
      shape: state.shape,
      modelName: state.model.name,
      versionId: state.model.versionId,
      programme: state.programme,
      settings: state.settings,
      weather: state.weather,
      weatherPreset: state.weatherPreset
    });
  }, 250);
}

/** Push current params+shape onto undo stack before a change. */
export function pushUndo() {
  state.undoStack.push(JSON.stringify({ params: state.model.params, shape: state.shape }));
  if (state.undoStack.length > 60) state.undoStack.shift();
  state.redoStack.length = 0;
}

export function undo() {
  if (!state.undoStack.length) return false;
  state.redoStack.push(JSON.stringify({ params: state.model.params, shape: state.shape }));
  const snap = JSON.parse(state.undoStack.pop());
  applyParams(snap.params, { silent: true, noUndo: true });
  applyShape(snap.shape, { silent: true, noUndo: true });
  return true;
}

export function redo() {
  if (!state.redoStack.length) return false;
  state.undoStack.push(JSON.stringify({ params: state.model.params, shape: state.shape }));
  const snap = JSON.parse(state.redoStack.pop());
  applyParams(snap.params, { silent: true, noUndo: true });
  applyShape(snap.shape, { silent: true, noUndo: true });
  return true;
}

/** Apply a params object to the working model (shape untouched — use applyShape). */
export function applyParams(params, opts = {}) {
  if (!opts.noUndo) pushUndo();
  state.model = new CarModel(sanitizeParams(params), {
    name: state.model.name,
    versionId: state.model.versionId === 'APEX-000' ? 'APEX-000' : 'WORKING',
    unlocked: state.model.unlocked,
    shape: state.shape
  });
  if (state.model.versionId !== 'APEX-000') {
    // working car inherits installed effects of its parent version
    const v = state.programme.versions.find((vv) => vv.id === opts.parentVersionId);
    if (v) state.model.unlocked = deepClone(v.effects);
  }
  state.session.paramEdits++;
  persist();
  events.emit('paramsChanged', { source: opts.source ?? 'user' });
  if (!opts.silent) events.emit('requestRefresh');
}

/** Set one parameter. */
export function setParam(key, value, opts = {}) {
  const params = deepClone(state.model.params);
  params[key] = value;
  applyParams(params, opts);
}

/** Apply a sculpted shape to the working model (Shape Studio pipeline).
 * shape: shape object | null (null = default body). */
export function applyShape(shape, opts = {}) {
  if (!opts.noUndo && !opts.silent) pushUndo();
  state.shape = shape == null ? null : sanitizeShape(shape);
  state.model = new CarModel(deepClone(state.model.params), {
    name: state.model.name,
    versionId: state.model.versionId === 'APEX-000' ? 'APEX-000' : 'WORKING',
    unlocked: state.model.unlocked,
    shape: state.shape
  });
  persist();
  events.emit('shapeChanged', { source: opts.source ?? 'studio' });
  if (!opts.silent) events.emit('requestRefresh');
}

/** Install a version object as the current working car. */
export function checkoutVersion(version) {
  pushUndo();
  state.model = new CarModel(deepClone(version.params), { name: version.name, versionId: version.id, unlocked: deepClone(version.effects ?? []), shape: state.shape });
  persist();
  events.emit('paramsChanged', { source: 'checkout' });
  events.emit('requestRefresh');
}

export function resetToBaseline() {
  pushUndo();
  state.model = new CarModel({ ...BASE.params }, { name: 'APEX-001 Baseline', versionId: 'APEX-000', shape: state.shape });
  persist();
  events.emit('paramsChanged', { source: 'reset' });
  events.emit('requestRefresh');
}

/** Full JSON export (spec §77). */
export function exportJSON() {
  return JSON.stringify({
    app: 'APEX LAB V4',
    schemaVersion: 1,
    exported: new Date().toISOString(),
    params: state.model.params,
    shape: state.shape,
    modelName: state.model.name,
    programme: state.programme,
    settings: state.settings,
    weather: state.weather
  }, null, 2);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data.params) throw new Error('No params in file');
  if (data.programme) state.programme = data.programme;
  if (data.weather) state.weather = data.weather;
  state.model = new CarModel(sanitizeParams(data.params), { name: data.modelName ?? 'Imported design', versionId: 'WORKING' });
  persist();
  events.emit('paramsChanged', { source: 'import' });
  events.emit('requestRefresh');
}
