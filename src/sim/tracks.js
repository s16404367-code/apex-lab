// APEX LAB — track geometry (spec §30).
// Tracks are defined as compass-walk segments in JSON, converted to a closed
// centreline, resampled to stations with arc length + smoothed curvature.
// All circuits are original — no real layouts.

import { rad } from '../core/util.js';

export const TRACKS = {
  'kestrel-ring': () => KESTREL,
  'harbor-street': () => HARBOR,
  'summit-classic': () => SUMMIT
};

import KESTREL from '../../data/tracks/kestrel-ring.js';
import HARBOR from '../../data/tracks/harbor-street.js';
import SUMMIT from '../../data/tracks/summit-classic.js';

/**
 * Convert segment definition to a dense closed centreline.
 * Returns { id, name, pts:[{x,y,s,k,heading}], length, sectorS:[s1,s2] }
 */
export function prepareTrack(def, stations = 700) {
  const raw = [];
  let x = 0, y = 0, heading = 0;
  const step = 5; // m between raw samples

  // walk segments (pure), used for closure optimisation
  function walk(segments, overrideLastLen = null) {
    let X = 0, Y = 0, H = 0;
    segments.forEach((seg, si) => {
      const [len0, radius, dir] = seg;
      const len = overrideLastLen !== null && si === segments.length - 1 && !radius ? overrideLastLen : len0;
      if (!radius) {
        X += Math.cos(H) * len;
        Y += Math.sin(H) * len;
      } else {
        const k = (dir === 'L' ? -1 : 1) / radius;
        const dth = k * len;
        const mid = H + dth / 2;
        X += Math.cos(mid) * len * (Math.sin(dth) / dth);
        Y += Math.sin(mid) * len * (Math.sin(dth) / dth);
        H += dth;
      }
    });
    return { x: X, y: Y, heading: H };
  }

  // if the last segment is a straight, shorten/lengthen it to minimise closure gap
  const segments = def.segments.slice();
  const lastIdx = segments.length - 1;
  if (!segments[lastIdx][1]) {
    const orig = segments[lastIdx][0];
    let bestLen = orig, bestDist = Infinity;
    for (let f = 0.15; f <= 1.6; f += 0.05) {
      const len = orig * f;
      const w = walk(segments, len);
      const d = Math.hypot(w.x, w.y);
      if (d < bestDist) { bestDist = d; bestLen = len; }
    }
    segments[lastIdx][0] = bestLen;
  }

  for (const seg of segments) {
    const [len, radius, dir] = seg;
    if (!radius) {
      const n = Math.max(1, Math.round(len / step));
      for (let i = 0; i < n; i++) {
        raw.push({ x, y, k: 0 });
        x += Math.cos(heading) * (len / n);
        y += Math.sin(heading) * (len / n);
      }
    } else {
      const k = (dir === 'L' ? -1 : 1) / radius;
      const total = len;
      const n = Math.max(2, Math.round(total / (step / 2)));
      for (let i = 0; i < n; i++) {
        raw.push({ x, y, k });
        const dth = k * (total / n);
        const mid = heading + dth / 2;
        x += Math.cos(mid) * (total / n);
        y += Math.sin(mid) * (total / n);
        heading += dth;
      }
    }
  }
  // close the remaining gap with a smooth bezier back to origin (heading 0)
  {
    const dist = Math.hypot(x, y);
    const d = Math.max(40, dist * 0.6);
    const p0 = { x, y };
    const c1 = { x: x + Math.cos(heading) * d, y: y + Math.sin(heading) * d };
    const c2 = { x: -d, y: 0 };
    const n = Math.max(8, Math.round(Math.max(dist, 60) / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      const bx = u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x;
      const by = u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y;
      raw.push({ x: bx, y: by, k: null });
    }
  }

  // resample by arc length
  let L = 0;
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    const b = raw[(i + 1) % raw.length];
    L += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const pts = [];
  let target = 0;
  let acc = 0;
  let j = 0;
  for (let i = 0; i < stations; i++) {
    target = (L * i) / stations;
    while (j < raw.length - 1) {
      const b = raw[(j + 1) % raw.length];
      const segLen = Math.hypot(b.x - raw[j].x, b.y - raw[j].y);
      if (acc + segLen >= target) break;
      acc += segLen;
      j++;
    }
    const a = raw[j];
    const b = raw[(j + 1) % raw.length];
    const segLen = Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1e-6);
    const t = (target - acc) / segLen;
    pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: target, k: 0, heading: 0 });
  }

  // heading + curvature (discrete, smoothed)
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i - 1 + pts.length) % pts.length];
    const b = pts[(i + 1) % pts.length];
    pts[i].heading = Math.atan2(b.y - a.y, b.x - a.x);
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i - 1 + pts.length) % pts.length];
    const b = pts[(i + 1) % pts.length];
    let dh = pts[i].heading * 2 - a.heading - b.heading; // not ideal; use tangent angle change instead
    dh = b.heading - a.heading;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    const ds = Math.hypot(b.x - a.x, b.y - a.y);
    pts[i].k = Math.abs(dh / Math.max(ds, 1e-6));
  }
  // smooth curvature
  for (let pass = 0; pass < 4; pass++) {
    const ks = pts.map((p) => p.k);
    for (let i = 0; i < pts.length; i++) {
      let s = 0;
      for (let d = -3; d <= 3; d++) s += ks[(i + d + pts.length) % pts.length];
      pts[i].k = s / 7;
    }
  }

  return {
    id: def.id,
    name: def.name,
    character: def.character,
    sectorNames: def.sectorNames,
    pts,
    length: L,
    sectorS: [L / 3, (2 * L) / 3]
  };
}

/** Downsample points for the mini-map. */
export function trackOutline(track, n = 140) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = track.pts[Math.floor((i * track.pts.length) / n)];
    out.push([p.x, p.y]);
  }
  return out;
}
