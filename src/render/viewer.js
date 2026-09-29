// APEX LAB — viewer factory: WebGL (Three.js) with Canvas-2D fallback (spec §75).
// Also auto-disposes viewers whose canvas left the DOM (screen navigation).

import { createWebGLViewer } from './webgl.js';
import { createViewer as createCanvasViewer } from './engine3d.js';

const live = new Set();

export function createViewer(canvas) {
  // dispose viewers for detached canvases
  for (const v of [...live]) {
    if (!v._canvas || !v._canvas.isConnected) {
      try { v.dispose?.(); } catch { /* noop */ }
      live.delete(v);
    }
  }
  let viewer = null;
  try {
    viewer = createWebGLViewer(canvas);
  } catch (e) {
    console.warn('[apexlab] WebGL viewer failed, using Canvas-2D fallback:', e);
    viewer = null;
  }
  if (!viewer) viewer = createCanvasViewer(canvas);
  viewer._canvas = canvas;
  live.add(viewer);
  return viewer;
}
