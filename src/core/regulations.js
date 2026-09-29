// APEX LAB — regulations engine (spec §6, §7, §107).
// All rules come from data (regulations module). Every rule carries a
// provenance tier; the UI never presents game-default values as official.

import REGS from '../../data/regulations/regulations-2026.js';
import { buildGeometry } from './geometry.js';

export { REGS };

/**
 * Evaluate a model's legality against the active ruleset.
 * @returns {legal:boolean, checks:[{id,name,value,limit,unit,pass,tier,article,op}], notice:string}
 */
export function checkLegality(model) {
  const p = model.params;
  model._meta = buildGeometry(model).meta; // derived dims from the same geometry truth
  const checks = [];
  const byId = Object.fromEntries(REGS.rules.map((r) => [r.appliesTo + '|' + r.id, r]));
  const rule = (id) => REGS.rules.find((r) => r.id === id);

  const add = (r, value, op) => {
    if (!r) return;
    let pass;
    if (op === '<=') pass = value <= r.value;
    else if (op === '>=') pass = value >= r.value;
    else if (op === 'range') {
      const rMax = REGS.rules.find((x) => x.id === r.id.replace('-min', '-max'));
      pass = value >= r.value && (!rMax || value <= rMax.value);
    }
    checks.push({ id: r.id, name: r.name, value, limit: r.value, unit: r.unit, pass, tier: r.tier, article: r.article, op });
  };

  // Width (track + tyres vs body/floor)
  const widthRule = rule('width-max');
  checks.push({
    id: widthRule.id, name: widthRule.name, value: model._meta?.overallWidth ?? null, limit: widthRule.value, unit: 'mm',
    pass: (model._meta?.overallWidth ?? 0) <= widthRule.value, tier: widthRule.tier, article: widthRule.article, op: '<='
  });

  add(rule('wheelbase-min'), p.wheelbase, 'range');
  add(rule('mass-min'), p.mass, '>=');
  add(rule('fw-span-max'), p.fwSpan, '<=');
  add(rule('rw-span-max'), p.rwSpan, '<=');
  add(rule('rw-height-max'), p.rwHeight, '<=');
  add(rule('diffuser-exit-max'), p.diffExitH, '<=');
  add(rule('diffuser-angle-max'), p.diffAngle, '<=');
  add(rule('floor-width-max'), p.floorWidth, '<=');

  const rhRule = rule('ride-height-min');
  checks.push({ id: rhRule.id, name: rhRule.name + ' — front', value: p.rideHeightF, limit: rhRule.value, unit: 'mm', pass: p.rideHeightF >= rhRule.value, tier: rhRule.tier, article: rhRule.article, op: '>=' });
  checks.push({ id: rhRule.id, name: rhRule.name + ' — rear', value: p.rideHeightR, limit: rhRule.value, unit: 'mm', pass: p.rideHeightR >= rhRule.value, tier: rhRule.tier, article: rhRule.article, op: '>=' });

  const heightRule = rule('height-max');
  checks.push({
    id: heightRule.id, name: heightRule.name, value: model._meta?.overallHeight ?? null, limit: heightRule.value, unit: 'mm',
    pass: (model._meta?.overallHeight ?? 0) <= heightRule.value, tier: heightRule.tier, article: heightRule.article, op: '<='
  });

  // Geometry sanity (spec §13): degenerate values, symmetry by construction.
  const sane = Object.values(p).every((v) => typeof v === 'number' && isFinite(v));
  checks.push({ id: 'geometry-sanity', name: 'Geometry validity', value: sane ? 'valid' : 'invalid', limit: 'valid', unit: '', pass: sane, tier: 'verified', article: 'internal', op: '==' });

  return {
    legal: checks.every((c) => c.pass),
    checks,
    notice: REGS.honestyNotice
  };
}
