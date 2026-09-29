// APEX LAB — CarModel: the single source of truth (spec §4).
// Every system (3D view, blueprint, legality, aero, dynamics, lap sim, saves,
// versions) reads the SAME parameter object. There is no second geometry system.

import { clamp, hashObj, deepClone } from './util.js';
import { defaultShape, sanitizeShape, isValidShape } from './carShape.js';
export { defaultShape, sanitizeShape };

/**
 * Parameter schema. Each entry:
 *  group, label, min, max, step, unit, def, desc, precision
 * Ranges are the LEGAL + physically sane envelope; upgrade concepts can widen
 * some ranges (spec: paramRange effects). Regulations are enforced separately.
 */
export const PARAM_SCHEMA = [
  // --- chassis ---
  { key: 'mass', group: 'chassis', label: 'Mass', min: 700, max: 900, step: 1, unit: 'kg', def: 768, desc: 'Car + driver without fuel. Legal minimum enforced by regulations.' },
  { key: 'massDistFront', group: 'chassis', label: 'Mass distribution (front)', min: 42, max: 52, step: 0.1, unit: '%', def: 46, desc: 'Share of mass on the front axle.' },
  { key: 'wheelbase', group: 'chassis', label: 'Wheelbase', min: 3200, max: 3800, step: 10, unit: 'mm', def: 3600, desc: 'Front-to-rear axle distance.' },
  { key: 'track', group: 'chassis', label: 'Track width', min: 1500, max: 1850, step: 10, unit: 'mm', def: 1600, desc: 'Distance between wheel centrelines (lateral).' },
  { key: 'rideHeightF', group: 'chassis', label: 'Front ride height', min: 10, max: 80, step: 1, unit: 'mm', def: 32, desc: 'Static reference-plane height at the front axle. Drives the whole underbody model.' },
  { key: 'rideHeightR', group: 'chassis', label: 'Rear ride height', min: 10, max: 110, step: 1, unit: 'mm', def: 48, desc: 'Static height at the rear axle. Rear − front defines rake.' },
  // --- suspension (multipliers on calibration base — real model coupling, no direct grip) ---
  { key: 'heaveStiff', group: 'suspension', label: 'Heave stiffness', min: 0.6, max: 1.8, step: 0.05, unit: '×', def: 1.0, desc: 'Platform (third element) rate. Stiffer → less aero ride-height loss, more kerb load into tyres.' },
  { key: 'pitchStiff', group: 'suspension', label: 'Pitch stiffness', min: 0.6, max: 1.8, step: 0.05, unit: '×', def: 1.0, desc: 'Resistance to longitudinal platform rotation (braking/acceleration).' },
  { key: 'rollStiff', group: 'suspension', label: 'Roll stiffness (ARB)', min: 0.6, max: 1.8, step: 0.05, unit: '×', def: 1.0, desc: 'Lateral platform rotation. Trades inner-wheel load for balance stability.' },
  { key: 'damper', group: 'suspension', label: 'Damper rate', min: 0.6, max: 1.8, step: 0.05, unit: '×', def: 1.0, desc: 'Heave-mode damping. Primary tool against porpoising growth.' },
  // --- front wing ---
  { key: 'fwAngle', group: 'frontWing', label: 'FW main angle', min: 0, max: 20, step: 0.25, unit: '°', def: 8, desc: 'Main-plane incidence. Core front load knob; feeds the wake into the floor.' },
  { key: 'fwFlap', group: 'frontWing', label: 'FW flap angle', min: 0, max: 25, step: 0.25, unit: '°', def: 12, desc: 'Flap incidence (partially effective). Cheap front load, stalls earlier than the mainplane.' },
  { key: 'fwSpan', group: 'frontWing', label: 'FW span', min: 1200, max: 2000, step: 10, unit: 'mm', def: 1600, desc: 'Span-wise extent. Widening raises load and aspect-ratio efficiency — and regulation exposure.' },
  { key: 'fwChord', group: 'frontWing', label: 'FW chord', min: 250, max: 450, step: 5, unit: 'mm', def: 320, desc: 'Average element chord.' },
  { key: 'fwHeight', group: 'frontWing', label: 'FW height', min: 25, max: 150, step: 1, unit: 'mm', def: 55, desc: 'Height of the mainplane above ground. Lower = stronger ground effect, earlier stall contact risk.' },
  { key: 'fwElements', group: 'frontWing', label: 'FW elements', min: 2, max: 4, step: 1, unit: '', def: 3, desc: 'Element count: more elements → more load and drag, earlier flap stall.' },
  { key: 'fwCamber', group: 'frontWing', label: 'FW camber', min: 0, max: 15, step: 0.5, unit: '°', def: 6, desc: 'Element camber. Adds load at low angle, but steepens the pressure field (stall risk).' },
  // --- rear wing ---
  { key: 'rwAngle', group: 'rearWing', label: 'RW angle', min: 5, max: 40, step: 0.25, unit: '°', def: 22, desc: 'Rear wing incidence. Rear load, drag, balance and top speed all live here.' },
  { key: 'rwSpan', group: 'rearWing', label: 'RW span', min: 800, max: 1120, step: 10, unit: 'mm', def: 1000, desc: 'Between endplates.' },
  { key: 'rwChord', group: 'rearWing', label: 'RW chord', min: 300, max: 450, step: 5, unit: 'mm', def: 380, desc: 'Average chord of the element set.' },
  { key: 'rwHeight', group: 'rearWing', label: 'RW height', min: 750, max: 1000, step: 5, unit: 'mm', def: 880, desc: 'Centreline height. Legally capped; aero effect secondary.' },
  { key: 'rwElements', group: 'rearWing', label: 'RW elements', min: 1, max: 3, step: 1, unit: '', def: 2, desc: 'Main + flap count.' },
  // --- floor ---
  { key: 'floorWidth', group: 'floor', label: 'Floor width', min: 1400, max: 1900, step: 10, unit: 'mm', def: 1600, desc: 'Planform width of the floor body.' },
  { key: 'throatArea', group: 'floor', label: 'Inlet throat area', min: 0.7, max: 1.3, step: 0.02, unit: '×', def: 1.0, desc: 'Relative tunnel-inlet area. Bigger throats move the optimum ride height up.' },
  { key: 'tunnelDepth', group: 'floor', label: 'Tunnel depth', min: 0.8, max: 1.2, step: 0.02, unit: '×', def: 1.0, desc: 'Vertical extent of the underbody tunnels.' },
  { key: 'edgeWing', group: 'floor', label: 'Floor edge wing', min: 0, max: 1, step: 0.05, unit: '×', def: 0.5, desc: 'Edge sealing device scale. Seals the tunnel, adds a drag sliver.' },
  { key: 'floorExp', group: 'floor', label: 'Expansion rate', min: 0.8, max: 1.25, step: 0.02, unit: '×', def: 1.0, desc: 'How fast the tunnel expands toward the diffuser.' },
  // --- diffuser ---
  { key: 'diffAngle', group: 'diffuser', label: 'Diffuser angle', min: 4, max: 19, step: 0.25, unit: '°', def: 11, desc: 'Local expansion angle. Above ~13° separation bites — legally capped at 17°.' },
  { key: 'diffLen', group: 'diffuser', label: 'Diffuser length', min: 600, max: 1000, step: 10, unit: 'mm', def: 850, desc: 'Expansion length. Longer = gentler gradient for the same exit.' },
  { key: 'diffExitH', group: 'diffuser', label: 'Diffuser exit height', min: 150, max: 260, step: 5, unit: 'mm', def: 200, desc: 'Exit plane height above reference. Legally capped.' },
  // --- body ---
  { key: 'bodyWidth', group: 'body', label: 'Body width', min: 1000, max: 1400, step: 10, unit: 'mm', def: 1180, desc: 'Maximum bodywork width between the wheels.' },
  { key: 'noseTaper', group: 'body', label: 'Nose taper', min: 0.5, max: 1.0, step: 0.02, unit: '×', def: 0.8, desc: 'How sharply the nose cross-section shrinks. Less frontal area vs. weaker flow to the floor inlet.' },
  { key: 'sidepodShoulder', group: 'body', label: 'Sidepod shoulder', min: 0, max: 1, step: 0.05, unit: '×', def: 0.5, desc: 'Shoulder/downwash surface scale: feeds the rear wing, adds drag.' },
  { key: 'rearContraction', group: 'body', label: 'Rear contraction', min: 0.6, max: 1.0, step: 0.02, unit: '×', def: 0.85, desc: 'Coke-bottle intensity. Tighter = less drag, more wake mess for the diffuser.' },
  // --- cooling ---
  { key: 'coolInlet', group: 'cooling', label: 'Cooling inlet area', min: 0.3, max: 1.0, step: 0.02, unit: '×', def: 0.72, desc: 'Relative radiator inlet size. Drag vs thermal margin — never a free lunch.' },
  { key: 'coolOutlet', group: 'cooling', label: 'Cooling outlet area', min: 0.3, max: 1.0, step: 0.02, unit: '×', def: 0.7, desc: 'Hot-air exit. Too small chokes flow through the core.' },
  { key: 'brakeDuct', group: 'cooling', label: 'Brake duct area', min: 0.3, max: 1.0, step: 0.02, unit: '×', def: 0.6, desc: 'Brake cooling flow.' }
];

export const PARAM_KEYS = PARAM_SCHEMA.map((p) => p.key);
export const GROUPS = [...new Set(PARAM_SCHEMA.map((p) => p.group))];
export const PARAM_BY_KEY = Object.fromEntries(PARAM_SCHEMA.map((p) => [p.key, p]));

export function defaultParams() {
  const out = {};
  for (const p of PARAM_SCHEMA) out[p.key] = p.def;
  return out;
}

/** Widen parameter bounds after unlocking engineering concepts. */
export function boundsFor(key, unlocked = []) {
  const base = PARAM_BY_KEY[key];
  let min = base.min;
  let max = base.max;
  for (const c of unlocked) {
    if (c.type === 'paramRange' && c.param === key) {
      min = Math.min(min, c.min);
      max = Math.max(max, c.max);
    }
  }
  return { min, max };
}

export function validateParams(params, unlocked = []) {
  const issues = [];
  for (const key of PARAM_KEYS) {
    if (typeof params[key] !== 'number' || !isFinite(params[key])) {
      issues.push(`Parameter ${key} missing or non-numeric`);
      continue;
    }
    const { min, max } = boundsFor(key, unlocked);
    if (params[key] < min - 1e-9 || params[key] > max + 1e-9) {
      issues.push(`${PARAM_BY_KEY[key].label} ${params[key].toFixed(2)} outside design range [${min}, ${max}]`);
    }
  }
  return issues;
}

/** Clamp params into (widened) design ranges — used when applying concepts or importing. */
export function sanitizeParams(params, unlocked = []) {
  const out = deepClone(params);
  for (const key of PARAM_KEYS) {
    if (typeof out[key] !== 'number' || !isFinite(out[key])) out[key] = PARAM_BY_KEY[key].def;
    const { min, max } = boundsFor(key, unlocked);
    out[key] = clamp(out[key], min, max);
  }
  return out;
}

/** CarModel = params + derived identity. Geometry is BUILT from this on demand. */
export class CarModel {
  constructor(params, meta = {}) {
    this.params = sanitizeParams(params ?? {});
    this.name = meta.name ?? 'Unnamed design';
    this.versionId = meta.versionId ?? null;
    this.parentId = meta.parentId ?? null;
    this.unlocked = meta.unlocked ?? []; // applied concept effects (coeffMods etc.)
    // Sculpted chassis shape (SHAPE STUDIO) — part of the model identity.
    this.shape = isValidShape(meta.shape) ? sanitizeShape(meta.shape) : defaultShape();
    this.hash = 'v1-' + hashObj({ p: this.params, u: this.unlocked.map((u) => u.id ?? u), s: this.shape });
  }

  clone(meta = {}) {
    return new CarModel(deepClone(this.params), { ...meta, unlocked: deepClone(this.unlocked), shape: deepClone(this.shape), parentId: this.versionId ?? this.parentId });
  }

  /** Get effective calibration = base coefficients + concept coefficient modifiers. */
  calibration(baseCal) {
    const cal = deepClone(baseCal);
    for (const eff of this.unlocked) {
      if (eff.type !== 'coeffMod') continue;
      const path = eff.path.split('.');
      let node = cal;
      for (let i = 0; i < path.length - 1; i++) node = node[path[i]];
      const leaf = path[path.length - 1];
      if (eff.add !== undefined) node[leaf] += eff.add;
      if (eff.mult !== undefined) node[leaf] *= eff.mult;
    }
    return cal;
  }
}
