// APEX LAB — share codes (spec §77).
// Design parameters packed into a compact, checksummed, URL-safe string.
// Nothing ever leaves the browser.

import { PARAM_SCHEMA, defaultParams } from '../core/model.js';
import { STATIONS, defaultShape, sanitizeShape } from '../core/carShape.js';
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

/**
 * APEX2 — params + sculpted shape. Shape points quantised to 8 bits each
 * (heights 60–700 mm, widths 40–660 mm), all 24 values → 48 bytes → chars.
 * Returns a code string (shape null ⇒ APEX1 body via encodeShareCode).
 */
export function encodeShareCodeV2(params, shape) {
  if (!shape) return encodeShareCode(params);
  const bytes = [];
  for (let i = 0; i < STATIONS; i++) {
    bytes.push(Math.round(((Math.max(60, Math.min(700, shape.heights[i])) - 60) / 640) * 255));
    bytes.push(Math.round(((Math.max(40, Math.min(660, shape.widths[i])) - 40) / 620) * 255));
  }
  let payload = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]; // 24 bits
    payload += ALPHABET[(n >>> 18) & 63] + ALPHABET[(n >>> 12) & 63] + ALPHABET[(n >>> 6) & 63] + ALPHABET[n & 63];
  }
  const checksum = fnv1a(payload).slice(0, 4);
  // embed the APEX1 body (checksum4 + params payload) verbatim, then shape payload
  return 'APEX2-' + checksum + encodeShareCode(params).slice(6) + payload;
}

/** Decode APEX1 or APEX2 → { params, shape } or null. */
export function decodeShareCodeV2(code) {
  try {
    const m = /^APEX2-([0-9a-f]{4})([A-Za-z0-9\-_]+)$/.exec(code.trim());
    if (m) {
      const [, checksum, rest] = m;
      const paramsBodyLen = 4 + Math.ceil(PARAM_SCHEMA.length / 2) * 4; // checksum4 + payload
      const paramsBody = rest.slice(0, paramsBodyLen);
      const shapePayload = rest.slice(paramsBodyLen);
      if (fnv1a(shapePayload).slice(0, 4) !== checksum) return null;
      const params = decodeShareCode('APEX1-' + paramsBody);
      if (!params) return null;
      if (shapePayload.length % 4 !== 0) return null;
      const bytes = [];
      for (let i = 0; i < shapePayload.length; i += 4) {
        let v24 = 0;
        for (let c = 0; c < 4; c++) v24 = (v24 << 6) | ALPHABET.indexOf(shapePayload[i + c]);
        bytes.push((v24 >>> 16) & 255, (v24 >>> 8) & 255, v24 & 255);
      }
      if (bytes.length < STATIONS * 2) return null;
      const shape = defaultShape();
      for (let i = 0; i < STATIONS; i++) {
        shape.heights[i] = 60 + (bytes[i * 2] / 255) * 640;
        shape.widths[i] = 40 + (bytes[i * 2 + 1] / 255) * 620;
      }
      return { params, shape: sanitizeShape(shape) };
    }
    const params = decodeShareCode(code);
    return params ? { params, shape: null } : null;
  } catch {
    return null;
  }
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
