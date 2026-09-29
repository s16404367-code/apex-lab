// verify:regs — validates the regulations dataset structure and provenance (spec §6, §95).
// No network access, per spec §109.
import REGS from '../data/regulations/regulations-2026.js';

const VALID_TIERS = ['verified', 'game-default', 'pending', 'candidate'];
const errors = [];
const warnings = [];

if (!REGS.honestyNotice || !REGS.honestyNotice.includes('game')) errors.push('honestyNotice missing or does not declare game status');
if (!Array.isArray(REGS.rules) || REGS.rules.length < 5) errors.push('rules list too small');
for (const r of REGS.rules) {
  if (!VALID_TIERS.includes(r.tier)) errors.push(`rule ${r.id}: invalid tier "${r.tier}"`);
  if (!r.article) errors.push(`rule ${r.id}: missing article`);
  if (!r.description) errors.push(`rule ${r.id}: missing description`);
  if (r.value === undefined) errors.push(`rule ${r.id}: missing value`);
  if (r.tier === 'verified') {
    for (const k of ['source', 'verifiedBy', 'verificationDate']) {
      if (!r[k]) errors.push(`rule ${r.id}: verified tier requires ${k}`);
    }
  }
  if (r.tier === 'candidate' && !r.source) errors.push(`rule ${r.id}: candidate tier requires a source note`);
}
if (!REGS.regulationChangelog?.length) warnings.push('no changelog entries');

console.log(`verify:regs — ${REGS.rules.length} rules checked`);
for (const w of warnings) console.warn('  ⚠', w);
if (errors.length) {
  for (const e of errors) console.error('  ✗', e);
  process.exit(1);
}
console.log('  ✓ all rules carry valid provenance tiers; honesty notice present');
