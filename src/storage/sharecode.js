// APEX LAB — share codes (spec §77).
// Design parameters packed into a compact, checksummed, URL-safe string.
// Nothing ever leaves the browser.

import { PARAM_SCHEMA, defaultParams } from '../core/model.js';
import { fnv1a } from '../core/util.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function b64(x, bits) {
  let s = '';
  for (let i = bits - 6; i >= 0; i -= 6) s += ALPHABET[(x >>> i) & 63];
  return s;
}
function unb64(str, bits) {
  let x = 0;
  for (let i = 0; i < str.length; i++) {
    const v = ALPHABET.indexOf(str[i]);
    if (v < 0) return null;
    x = (x << 6) | v;
  }
  return bits % 6 === 0 ? x : x >>> ((6 - (bits % 6)) % 6);
}

/**
 * Encode params → share code. Each param quantised to 12 bits across its range.
 * Format: APEX1-<checksum4><payload>
 */
export function encodeShareCode(params) {
  const parts = [];
  for (const p of PARAM_SCHEMA) {
    const v = typeof params[p.key] === 'number' && isFinite(params[p.key]) ? params[p.key] : p.def;
    const t = Math.round(((v - p.min) / (p.max - p.min)) * 4095);
    parts.push(Math.max(0, Math.min(4095, t)));
  }
  // pack 12-bit values into 6-bit chars: 2 values → 4 chars
  let payload = '';
  for (let i = 0; i < parts.length; i += 2) {
    const a = parts[i];
    const b = parts[i + 1] ?? 0;
    const n = (a << 12) | b; // 24 bits
    payload += ALPHABET[(n >>> 18) & 63];
    payload += ALPHABET[(n >>> 12) & 63];
    payload += ALPHABET[(n >>> 6) & 63];
    payload += ALPHABET[n & 63];
  }
  const checksum = fnv1a(payload).slice(0, 4);
  return 'APEX1-' + checksum + payload;
}

/** Decode share code → params, or null if checksum fails. */
export function decodeShareCode(code) {
  try {
    const m = /^APEX1-([0-9a-f]{4})([A-Za-z0-9\-_]+)$/.exec(code.trim());
    if (!m) return null;
    const [, checksum, payload] = m;
    if (fnv1a(payload).slice(0, 4) !== checksum) return null;
    const params = defaultParams();
    const n = PARAM_SCHEMA.length;
    for (let i = 0; i < n; i += 2) {
      const chunk = payload.slice((i / 2) * 4, (i / 2) * 4 + 4);
      if (chunk.length < 4) break;
      let v24 = 0;
      for (let c = 0; c < 4; c++) v24 = (v24 << 6) | ALPHABET.indexOf(chunk[c]);
      const a = (v24 >>> 12) & 4095;
      const b = v24 & 4095;
      const p1 = PARAM_SCHEMA[i];
      params[p1.key] = p1.min + (a / 4095) * (p1.max - p1.min);
      if (i + 1 < n) {
        const p2 = PARAM_SCHEMA[i + 1];
        params[p2.key] = p2.min + (b / 4095) * (p2.max - p2.min);
      }
    }
    return params;
  } catch {
    return null;
  }
}
