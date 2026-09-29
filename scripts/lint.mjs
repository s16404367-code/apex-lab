// Zero-dependency lint: syntax check every JS module (ESM parse check).
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const skip = new Set(['node_modules', '.git', 'dist', 'public']);
const files = [];

(function walk(dir) {
  for (const f of readdirSync(dir)) {
    if (skip.has(f)) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.js') || f.endsWith('.mjs')) files.push(p);
  }
})(root);

let bad = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    bad++;
    console.error('✗', f.replace(root, ''));
    console.error(String(e.stderr).split('\n').slice(0, 4).join('\n'));
  }
}
console.log(`lint: ${files.length - bad}/${files.length} modules parse clean`);
process.exit(bad ? 1 : 0);
