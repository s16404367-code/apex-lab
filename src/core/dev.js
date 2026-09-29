// APEX LAB — development system (spec §31–§59, §87–§90).
// Prototypes change REAL geometry/coefficients, are tested through the same
// solvers, correlated, then approved/rejected and installed as immutable car
// versions. Resources are game abstractions (documented), never car buffs.

import { deepClone, rng, hashObj, fnv1a } from '../core/util.js';
import { state } from './state.js'; // live binding (ESM cycle-safe; used only at call time)
import { CarModel, sanitizeParams } from '../core/model.js';
import { evalReference } from '../core/aero.js';
import { buildGeometry } from '../core/geometry.js';
import { simulateLap } from '../sim/lap.js';
import { prepareTrack } from '../sim/tracks.js';
import { heaveStability } from '../core/stability.js';
import UPGRADES from '../../data/development/upgrade-tree.js';
import KESTREL_DEF from '../../data/tracks/kestrel-ring.js';
import DEVBASE from '../../data/cars/development-baseline.js';
import CAL0 from '../../data/calibration/defaults.js';

export const UPGRADE_TREE = UPGRADES;
export const ALL_CONCEPTS = UPGRADES.branches.flatMap((b) => b.concepts.map((c) => ({ ...c, branch: b.id, branchName: b.name })));
export const conceptById = (id) => ALL_CONCEPTS.find((c) => c.id === id);

export const DEV_STAGES = ['simulated', 'tested', 'installed', 'rejected'];

/** Create a fresh R&D programme state. mode: 'sandbox' (unlimited) | 'season' (finite). */
export function newProgramme(mode = 'sandbox') {
  return {
    mode,
    resources: mode === 'season' ? deepClone(DEVBASE.resources) : {
      money: Infinity, tunnelHours: Infinity, cfdTokens: Infinity, engineeringHours: Infinity,
      prototypeSlots: Infinity, manufacturingCapacity: Infinity, testingDays: Infinity
    },
    unlocked: [],            // purchased concepts (effects)
    prototypes: [],          // R&D board
    versions: [],            // installed car history (immutable)
    notebook: [],            // engineering notebook entries
    counter: 1
  };
}

/** Apply a concept's paramRange/paramDelta to a params object (returns new params). */
export function applyConceptParams(params, concept, unlocked = []) {
  const out = deepClone(params);
  for (const eff of concept.effects) {
    if (eff.type === 'paramDelta') out[eff.param] = (out[eff.param] ?? 0) + eff.delta;
  }
  return sanitizeParams(out, unlocked);
}

/** Concept effects that extend model calibration (coeffMod) — attached to the car. */
export function conceptCalEffects(concept) {
  return concept.effects.filter((e) => e.type === 'coeffMod').map((e) => ({ ...e, id: concept.id }));
}

export function canAfford(programme, cost) {
  if (programme.mode === 'sandbox') return true;
  return Object.entries(cost).every(([k, v]) => (programme.resources[k] ?? 0) >= v);
}

export function spend(programme, cost) {
  if (programme.mode === 'sandbox') return true;
  if (!canAfford(programme, cost)) return false;
  for (const [k, v] of Object.entries(cost)) programme.resources[k] -= v;
  return true;
}

/**
 * Create a prototype from a concept (or a manual param tweak set).
 * Prediction uses the FAST solver + lap sim — no fake numbers (spec §97).
 */
export function createPrototype(programme, baseModel, baseCal, concept, opts = {}) {
  const effects = concept ? concept.effects : [];
  const unlocked = programme.unlocked.flatMap((id) => conceptCalEffects(conceptById(id)) ?? []);
  const newEffects = concept ? conceptCalEffects(concept) : [];
  const allEffects = [...unlocked, ...newEffects];

  let params = deepClone(baseModel.params);
  if (concept) params = applyConceptParams(params, concept, allEffects);
  if (opts.paramTweaks) {
    for (const [k, v] of Object.entries(opts.paramTweaks)) params[k] = v;
  }
  params = sanitizeParams(params, allEffects);

  const proto = {
    id: 'P' + String(programme.counter++).padStart(3, '0'),
    name: concept ? concept.name : (opts.name ?? 'Manual prototype'),
    conceptId: concept?.id ?? null,
    stage: 'simulated',
    parentId: baseModel.versionId ?? baseModel.hash,
    created: Date.now(),
    params,
    effects: allEffects,
    cost: concept?.cost ?? { money: 2, tunnelHours: 4, cfdTokens: 4, engineeringHours: 8 },
    risk: concept?.risk ?? 'Player-defined change.',
    prediction: null,
    tunnelResult: null,
    trackResult: null,
    decision: null,
    seed: 0x9e3779b9 ^ (programme.counter * 2654435761)
  };

  // ---- prediction on the SAME solver chain (honest numbers) ----
  const protoModel = new CarModel(params, { shape: deepClone(state.shape), name: proto.id + ' ' + proto.name, unlocked: allEffects });
  const cal = protoModel.calibration(CAL0);
  const { meta } = buildGeometry(protoModel);
  const ref = evalReference(protoModel, cal, meta);
  const track = prepareTrack(opts.trackDef ?? KESTREL_DEF, 600);
  const lap = simulateLap(protoModel, cal, meta, track);
  const hs = heaveStability(protoModel, cal, ref, 69.4);
  proto.prediction = {
    df: ref.df.total, drag: ref.drag, ld: ref.ld, balance: ref.df.balancePct,
    lapTime: lap.timeS, trackId: track.id, heaveRisk: hs.riskPct,
    flags: ref.flags.map((f) => f.id)
  };
  programme.prototypes.unshift(proto);
  return proto;
}

/**
 * Run a prototype through wind tunnel + track test.
 * Correlation noise is a DOCUMENTED abstraction (facility quality, spec §44).
 */
export function runPrototypeTests(programme, proto, baseModel, baseLap, opts = {}) {
  const noise = opts.correlationNoise ?? CAL0.development.correlation_noise;
  const rand = rng(proto.seed);
  const protoModel = new CarModel(proto.params, { shape: deepClone(state.shape), name: proto.name, unlocked: proto.effects });
  const cal = protoModel.calibration(CAL0);
  const { meta } = buildGeometry(protoModel);
  const ref = evalReference(protoModel, cal, meta);

  const n = () => 1 + gaussAbst(rand) * noise * 0.5;
  proto.tunnelResult = {
    df: ref.df.total * n(),
    drag: ref.drag * n(),
    balance: ref.df.balancePct + gaussAbst(rand) * 0.4,
    hoursUsed: 8
  };
  const track = prepareTrack(opts.trackDef ?? KESTREL_DEF, 600);
  const lap = simulateLap(protoModel, cal, meta, track);
  const parentModel = new CarModel(baseModel.params, { unlocked: baseModel.unlocked, shape: baseModel.shape });
  const parentLap = baseLap ?? simulateLap(parentModel, parentModel.calibration(CAL0), meta, track);
  proto.trackResult = {
    lapTime: lap.timeS * (1 + gaussAbst(rand) * noise * 0.25),
    parentLapTime: parentLap.timeS,
    hoursUsed: 4,
    tyre: lap.tyre,
    topSpeed: lap.topSpeedKmh
  };
  proto.correlation = {
    dfDeltaPct: ((proto.tunnelResult.df - baseRef(programme, baseModel).df) / baseRef(programme, baseModel).df) * 100,
    predictedVsTestedPct: Math.abs(((proto.tunnelResult.df - proto.prediction.df) / Math.max(proto.prediction.df, 1)) * 100),
    lapDeltaS: proto.trackResult.lapTime - parentLap.timeS
  };
  proto.stage = 'tested';
  return proto;
}

function gaussAbst(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

let _baseRefCache = null;
function baseRef(programme, baseModel) {
  if (!_baseRefCache || _baseRefCache.hash !== baseModel.hash) {
    const cal = baseModel.calibration(CAL0);
    const { meta } = buildGeometry(baseModel);
    _baseRefCache = { hash: baseModel.hash, ...evalReference(baseModel, cal, meta) };
  }
  return _baseRefCache;
}

/** Approve → manufacture → install: creates an immutable version (spec §54, §97). */
export function installPrototype(programme, proto, opts = {}) {
  const version = {
    id: 'APEX-' + String(programme.versions.length + 1).padStart(3, '0'),
    name: proto.name,
    parentId: proto.parentId,
    params: deepClone(proto.params),
    effects: deepClone(proto.effects),
    conceptId: proto.conceptId,
    installed: Date.now(),
    summary: proto.decision?.summary ?? 'Installed after testing.',
    evidence: {
      predicted: proto.prediction,
      tunnel: proto.tunnelResult,
      track: proto.trackResult
    },
    hash: 'v1-' + hashObj({ p: proto.params, e: proto.effects.map((e) => e.id ?? e.path) })
  };
  programme.versions.push(version);
  proto.stage = 'installed';
  proto.decision = { ...(proto.decision ?? {}), outcome: 'INSTALLED', at: Date.now() };
  programme.notebook.unshift({
    id: fnv1a(version.id + version.name),
    t: Date.now(),
    kind: 'install',
    text: `${version.id} — ${proto.name} installed. Tunnel: ${proto.tunnelResult ? (proto.tunnelResult.df / 1000).toFixed(1) + ' kN' : 'n/a'}, lap Δ ${proto.trackResult ? proto.correlation.lapDeltaS.toFixed(2) + ' s' : 'n/a'}.`,
    tags: [proto.conceptId ?? 'manual']
  });
  return version;
}

export function rejectPrototype(programme, proto, reason) {
  proto.stage = 'rejected';
  proto.decision = { outcome: 'REJECTED', reason, at: Date.now() };
  programme.notebook.unshift({
    id: fnv1a(proto.id + 'rej' + proto.decision.at),
    t: Date.now(),
    kind: 'reject',
    text: `${proto.id} ${proto.name} rejected — ${reason} (information retained: ${proto.correlation ? 'correlation ' + proto.correlation.predictedVsTestedPct.toFixed(1) + '%' : 'test data'}; failure has value — spec §86).`,
    tags: [proto.conceptId ?? 'manual', 'rejected']
  });
}

/** Version tree helper (spec §90). */
export function versionTree(programme) {
  const byParent = new Map();
  for (const v of programme.versions) {
    const list = byParent.get(v.parentId) ?? [];
    list.push(v);
    byParent.set(v.parentId, list);
  }
  return byParent;
}
