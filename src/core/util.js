// APEX LAB — shared utilities. No dependencies.

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const deg = (r) => (r * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;
export const kmh = (ms) => ms * 3.6;
export const ms = (kmh_) => kmh_ / 3.6;

/** Deterministic 32-bit FNV-1a hash → 8-char hex. Used for reproducibility IDs (spec §91). */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

/** Deterministic object hash (stable key order). */
export function hashObj(obj) {
  return fnv1a(stableStringify(obj));
}

export function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/** Mulberry32 seeded PRNG — deterministic experiments (spec §91). */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller normal draw from a uniform generator. */
export function gauss(rand) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const fmt = (v, digits = 1) => {
  if (!isFinite(v)) return '—';
  if (Math.abs(v) >= 10000) return (v / 1000).toFixed(1) + 'k';
  return v.toFixed(digits);
};

export const pct = (v, digits = 1) => (isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(digits) + '%' : '—');

/** Deep clone via structured clone fallback JSON. */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Tiny pub/sub event bus. */
export function bus() {
  const map = new Map();
  return {
    on(ev, fn) {
      if (!map.has(ev)) map.set(ev, new Set());
      map.get(ev).add(fn);
      return () => map.get(ev).delete(fn);
    },
    emit(ev, data) {
      if (map.has(ev)) for (const fn of map.get(ev)) fn(data);
    },
  };
}
