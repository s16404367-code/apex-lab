// APEX LAB — WebGL 3D viewer (Three.js, vendored locally — works offline).
// Engineering-paddock presentation: dark studio, soft shadows, edge lines,
// pressure heatmap, animated DRS actuator, rolling road, flow particles,
// force arrows, turntable. Car geometry comes from buildGeometry() — the same
// single source of truth used by the blueprint, legality and aero solver.

import * as THREE from 'three';
import { buildGeometry } from '../core/geometry.js';
import { rad } from '../core/util.js';

const MAT_DEF = {
  body:        { color: 0x161c28, metalness: 0.45, roughness: 0.42 },
  sidepod:     { color: 0x151b26, metalness: 0.45, roughness: 0.44 },
  floor:       { color: 0x111724, metalness: 0.35, roughness: 0.6 },
  diffuser:    { color: 0x0f141f, metalness: 0.35, roughness: 0.62 },
  frontWing:   { color: 0x1a2332, metalness: 0.4,  roughness: 0.38 },
  rearWing:    { color: 0x1a2332, metalness: 0.4,  roughness: 0.38 },
  rearWingFlap:{ color: 0x1d2838, metalness: 0.4,  roughness: 0.35 },
  wheels:      { color: 0x0e1116, metalness: 0.1,  roughness: 0.92 },
  suspension:  { color: 0x2a3140, metalness: 0.65, roughness: 0.35 },
  halo:        { color: 0x0d131d, metalness: 0.7,  roughness: 0.3 },
  cooling:     { color: 0x04060a, metalness: 0.0,  roughness: 1.0 },
  detail:      { color: 0x33415a, metalness: 0.5,  roughness: 0.4 },
  nose:        { color: 0x161c28, metalness: 0.45, roughness: 0.42 },
  engineCover: { color: 0x161c28, metalness: 0.45, roughness: 0.42 }
};

// parts that get smooth (welded) normals
const SMOOTH_PARTS = new Set(['body', 'sidepod', 'floor', 'diffuser', 'frontWing', 'rearWing', 'rearWingFlap', 'nose', 'engineCover']);
const PART_ORDER = ['body', 'nose', 'engineCover', 'sidepod', 'floor', 'diffuser', 'frontWing', 'rearWing', 'rearWingFlap', 'halo', 'suspension', 'detail', 'cooling', 'wheels'];

function partGeometry(mesh, group, smooth) {
  const faces = [];
  for (const q of mesh.quads) if (q[4] === group) faces.push(q);
  if (!faces.length) return null;
  // gather triangles as raw positions
  const raw = [];
  for (const q of faces) {
    const [a, b, c, d] = q;
    for (const idx of [a, b, c, a, c, d]) {
      const P = mesh.verts[idx];
      raw.push(P[0], P[1], P[2]);
    }
  }
  for (const t of mesh.tris) {
    if (t[3] !== group) continue;
    for (const idx of [t[0], t[1], t[2]]) {
      const P = mesh.verts[idx];
      raw.push(P[0], P[1], P[2]);
    }
  }
  const geom = new THREE.BufferGeometry();
  if (!smooth) {
    const arr = new Float32Array(raw);
    geom.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    geom.computeVertexNormals(); // flat (non-indexed)
    return geom;
  }
  // weld by position → indexed smooth normals
  const map = new Map();
  const positions = [];
  const indices = [];
  const n = raw.length / 3;
  for (let i = 0; i < n; i++) {
    const x = raw[i * 3], y = raw[i * 3 + 1], z = raw[i * 3 + 2];
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = positions.length / 3;
      map.set(key, id);
      positions.push(x, y, z);
    }
    indices.push(id);
  }
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

const PRESSURE_RAMP = [
  [0.0, new THREE.Color(0x1a2740)],
  [0.4, new THREE.Color(0x2ea8d8)],
  [0.75, new THREE.Color(0xffb454)],
  [1.0, new THREE.Color(0xff6a5e)]
];
function pressureColor(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < PRESSURE_RAMP.length; i++) {
    if (t <= PRESSURE_RAMP[i][0]) {
      const [t0, c0] = PRESSURE_RAMP[i - 1];
      const [t1, c1] = PRESSURE_RAMP[i];
      return c0.clone().lerp(c1, (t - t0) / (t1 - t0));
    }
  }
  return PRESSURE_RAMP[PRESSURE_RAMP.length - 1][1].clone();
}

export function createWebGLViewer(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    console.warn('[apexlab] WebGL unavailable:', e);
    return null;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e14);
  scene.fog = new THREE.Fog(0x0a0e14, 12000, 26000);

  // ---------------- camera + custom z-up orbit controls ----------------
  const camera = new THREE.PerspectiveCamera(38, 1, 10, 60000);
  camera.up.set(0, 0, 1);
  const cam = { yaw: 0.72, pitch: 0.32, dist: 8200, tx: 0, ty: 0, tz: 420 };
  const camGoal = { ...cam };
  let camAnim = 1;

  function applyCamera(lerpT = 1) {
    for (const k of ['yaw', 'pitch', 'dist', 'tx', 'ty', 'tz']) cam[k] += (camGoal[k] - cam[k]) * lerpT;
    cam.pitch = Math.max(-0.05, Math.min(1.45, cam.pitch));
    cam.dist = Math.max(2200, Math.min(26000, cam.dist));
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    camera.position.set(
      cam.tx + cam.dist * cp * Math.cos(cam.yaw),
      cam.ty + cam.dist * cp * Math.sin(cam.yaw),
      cam.tz + cam.dist * sp
    );
    camera.lookAt(cam.tx, cam.ty, cam.tz);
  }

  // ---------------- lights ----------------
  const hemi = new THREE.HemisphereLight(0x43608a, 0x0a0e14, 0.95);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3600, -2600, 5400);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -4500; key.shadow.camera.right = 4500;
  key.shadow.camera.top = 4500; key.shadow.camera.bottom = -4500;
  key.shadow.camera.far = 20000;
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0004;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.55);
  fill.position.set(-4200, 2200, 1800);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x5ad1ff, 0.85);
  rim.position.set(-1600, 4200, 1400);
  scene.add(rim);

  // ---------------- ground ----------------
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(11000, 56).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0b101a, roughness: 0.95, metalness: 0 })
  );
  ground.receiveShadow = true;
  scene.add(ground);

  // engineering grid (custom, z-up)
  const gridGroup = new THREE.Group();
  {
    const mat1 = new THREE.LineBasicMaterial({ color: 0x1c3247, transparent: true, opacity: 0.55 });
    const pts = [];
    const N = 19, STEP = 500, EXT = N * STEP;
    for (let i = -N; i <= N; i++) {
      pts.push(i * STEP, -EXT, 1, i * STEP, EXT, 1);
      pts.push(-EXT, i * STEP, 1, EXT, i * STEP, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    gridGroup.add(new THREE.LineSegments(g, mat1));
    // accent centre axes
    const mat2 = new THREE.LineBasicMaterial({ color: 0x2c5f82, transparent: true, opacity: 0.8 });
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-EXT, 0, 1, EXT, 0, 1, 0, -EXT, 1, 0, EXT, 1]), 3));
    gridGroup.add(new THREE.LineSegments(g2, mat2));
  }
  scene.add(gridGroup);

  // ---------------- car ----------------
  const carGroup = new THREE.Group();
  scene.add(carGroup);
  let built = null;          // { mesh, meta }
  let builtHash = null;
  let pendingModel = null;
  const partMeshes = new Map();   // group → mesh
  let flapGroup = null;
  const steerGroups = [];
  const spinMeshes = [];
  let drsAngle = 0;               // current actuator angle (rad)
  let wheelSpin = 0;

  const edgeMats = new THREE.LineBasicMaterial({ color: 0x41608a, transparent: true, opacity: 0.32 });

  function rebuildCar(model) {
    const { mesh, meta } = buildGeometry(model);
    built = { mesh, meta };
    builtHash = model.hash;
    // clear old
    for (const [, m] of partMeshes) {
      m.geometry.dispose();
      carGroup.remove(m);
    }
    for (const [, e] of edgeStore) {
      e.geometry.dispose();
      carGroup.remove(e);
    }
    partMeshes.clear();
    edgeStore.clear();
    steerGroups.length = 0;
    spinMeshes.length = 0;

    for (const part of PART_ORDER) {
      const geom = partGeometry(mesh, part, SMOOTH_PARTS.has(part));
      if (!geom) continue;
      const def = MAT_DEF[part] ?? MAT_DEF.body;
      const mat = new THREE.MeshStandardMaterial({ color: def.color, metalness: def.metalness, roughness: def.roughness });
      const meshObj = new THREE.Mesh(geom, mat);
      meshObj.castShadow = true;
      meshObj.receiveShadow = false;
      meshObj.userData.part = part;

      if (part === 'wheels') {
        // four wheel meshes carved by y position — build separate geoms per wheel
      }
      partMeshes.set(part, meshObj);
      carGroup.add(meshObj);

      // crisp engineering edges
      try {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 24), edgeMats);
        edges.visible = overlay.wireframe;
        edgeStore.set(part, edges);
        carGroup.add(edges);
      } catch { /* non-fatal */ }
    }
    // ---- split wheels into 4 steer/spin rigs ----
    attachWheels(model, meta);
    // ---- DRS flap rig ----
    attachFlap(meta);
    applyPressure(pendingOverlay.pressure);
  }

  const edgeStore = new Map();

  function partGeoSolo(group, yMin, yMax, smooth) {
    // build geometry restricted to faces whose centroid y within [yMin,yMax]
    const mesh = built.mesh;
    const sub = { verts: mesh.verts, quads: [], tris: [], parts: {} };
    for (const q of mesh.quads) {
      if (q[4] !== group) continue;
      const cy = (mesh.verts[q[0]][1] + mesh.verts[q[1]][1] + mesh.verts[q[2]][1] + mesh.verts[q[3]][1]) / 4;
      if (cy >= yMin && cy <= yMax) sub.quads.push(q);
    }
    return partGeometry(sub, group, smooth);
  }

  function attachWheels(model, meta) {
    // remove the merged wheels mesh; create 4 individual rigs
    const merged = partMeshes.get('wheels');
    if (merged) {
      carGroup.remove(merged);
      merged.geometry.dispose();
      partMeshes.delete('wheels');
    }
    const mergedEdges = edgeStore.get('wheels');
    if (mergedEdges) {
      carGroup.remove(mergedEdges);
      mergedEdges.geometry.dispose();
      edgeStore.delete('wheels');
    }
    const detail = partMeshes.get('detail');
    void detail;
    for (const wp of meta.wheels) {
      const steer = new THREE.Group();
      const spin = new THREE.Group();
      steer.add(spin);
      carGroup.add(steer);
      const geom = partGeoSolo('wheels', wp.y - wp.w / 2 - 1, wp.y + wp.w / 2 + 1, false);
      if (geom) {
        const mat = new THREE.MeshStandardMaterial(MAT_DEF.wheels);
        const mm = new THREE.Mesh(geom, mat);
        mm.castShadow = true;
        spin.add(mm);
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 30), edgeMats);
        e.visible = overlay.wireframe;
        spin.add(e);
      }
      steerGroups.push({ group: steer, front: wp.x > 0 });
      spinMeshes.push({ node: spin, r: wp.r });
    }
  }

  function attachFlap(meta) {
    const flap = partMeshes.get('rearWingFlap');
    if (!flap) return;
    carGroup.remove(flap);
    const edges = edgeStore.get('rearWingFlap');
    if (edges) { carGroup.remove(edges); edgeStore.delete('rearWingFlap'); }
    flapGroup = new THREE.Group();
    const pivot = built.meta.drsPivot;
    flapGroup.position.set(pivot.x, 0, pivot.z);
    flap.position.set(-pivot.x, 0, -pivot.z);
    flapGroup.add(flap);
    if (edges) {
      edges.position.set(-pivot.x, 0, -pivot.z);
      flapGroup.add(edges);
      edgeStore.set('rearWingFlap', edges);
    }
    carGroup.add(flapGroup);
  }

  // ---------------- overlays ----------------
  const overlay = { envelope: true, pressure: null, flow: false, forces: null, wireframe: true, reducedMotion: false, turntable: false, drs: false, rollingRoad: false };

  let envelopeGroup = null;
  function drawEnvelope() {
    if (envelopeGroup) {
      scene.remove(envelopeGroup);
      envelopeGroup.traverse((o) => { o.geometry?.dispose(); });
    }
    envelopeGroup = new THREE.Group();
    const E = { l: 5600, w: 2000, h: 950 };
    const x0 = 1800 - E.l * 0.62, x1 = x0 + E.l;
    const y0 = -E.w / 2, y1 = E.w / 2, z1 = E.h;
    const c = [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    const edgeIdx = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    const pts = [];
    for (const [a, b] of edgeIdx) pts.push(...c[a], ...c[b]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    const lines = new THREE.LineSegments(g, new THREE.LineDashedMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.4, dashSize: 120, gapSize: 90 }));
    lines.computeLineDistances();
    envelopeGroup.add(lines);
    // axle lines
    const wb = built?.meta?.wheelbase ?? 3600;
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      wb / 2, -1150, 3, wb / 2, 1150, 3,
      -wb / 2, -1150, 3, -wb / 2, 1150, 3
    ]), 3));
    envelopeGroup.add(new THREE.LineSegments(g2, new THREE.LineBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.35 })));
    envelopeGroup.visible = overlay.envelope;
    scene.add(envelopeGroup);
  }

  function applyPressure(P) {
    for (const [part, meshObj] of partMeshes) {
      const def = MAT_DEF[part] ?? MAT_DEF.body;
      if (!P) {
        meshObj.material.color.setHex(def.color);
        meshObj.material.emissive.setHex(0x000000);
        meshObj.material.metalness = def.metalness;
        meshObj.material.roughness = def.roughness;
        continue;
      }
      const shares = {
        frontWing: P.cla.fw / 1.9,
        rearWing: P.cla.rw / 1.9,
        rearWingFlap: P.cla.rw / 1.9,
        floor: P.cla.floor / 2.4,
        diffuser: P.cla.floor / 2.6,
        body: P.cla.body / 0.5,
        sidepod: P.cla.body / 0.55,
        nose: P.cla.body / 0.6,
        engineCover: P.cla.body / 0.6,
        wheels: 0.45,
        cooling: 0.2,
        suspension: 0.3,
        halo: 0.3,
        detail: 0.4
      };
      const c = pressureColor((shares[part] ?? 0.3) * 1.15);
      meshObj.material.color.copy(c);
      meshObj.material.emissive.copy(c).multiplyScalar(0.22);
      meshObj.material.metalness = 0.1;
      meshObj.material.roughness = 0.55;
    }
  }

  // ---------------- force arrows ----------------
  const arrowDFf = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, 0x5ad1ff, 90, 55);
  const arrowDFr = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, 0x5ad1ff, 90, 55);
  const arrowDrag = new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(), 1, 0xff7a6e, 90, 55);
  for (const a of [arrowDFf, arrowDFr, arrowDrag]) {
    a.visible = false;
    scene.add(a);
  }
  function updateArrows(F) {
    if (!F || !built) { arrowDFf.visible = arrowDFr.visible = arrowDrag.visible = false; return; }
    const wb = built.meta.wheelbase;
    const scaleF = Math.min((F.dfFront || 1) / 9, 950);
    const scaleR = Math.min((F.dfRear || 1) / 9, 950);
    arrowDFf.position.set(wb / 2 + 300, 0, 100);
    arrowDFf.setLength(Math.max(scaleF, 60), 110, 60);
    arrowDFf.visible = !!overlay.forces;
    arrowDFr.position.set(-wb / 2 - 200, 0, 100);
    arrowDFr.setLength(Math.max(scaleR, 60), 110, 60);
    arrowDFr.visible = !!overlay.forces;
    arrowDrag.position.set(0, 0, 480);
    arrowDrag.setLength(Math.min((F.drag || 1) / 7, 800), 110, 60);
    arrowDrag.visible = !!overlay.forces;
  }

  // ---------------- flow particles ----------------
  const FLOW_N = 320;
  const flowPos = new Float32Array(FLOW_N * 3);
  const flowState = [];
  for (let i = 0; i < FLOW_N; i++) flowState.push({ x: 3600 + Math.random() * 7200 - 3600, y: (Math.random() * 2 - 1) * 950, z: 0, sp: 0.75 + Math.random() * 0.5 });
  const flowGeom = new THREE.BufferGeometry();
  flowGeom.setAttribute('position', new THREE.BufferAttribute(flowPos, 3));
  const flowPts = new THREE.Points(flowGeom, new THREE.PointsMaterial({
    color: 0x8fd8ff, size: 26, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
  }));
  flowPts.visible = false;
  scene.add(flowPts);

  function heightField(x, y) {
    // analytic silhouette of the car (for particle paths)
    const hAvg = built ? built.meta.hAvg : 40;
    const base = 70 + hAvg * 0.6;
    const hump = 330 * Math.exp(-Math.pow((x + 300) / 1500, 2))          // airbox/engine cover
      + 200 * Math.exp(-Math.pow((x - 1100) / 1300, 2))                 // cockpit
      + 140 * Math.exp(-Math.pow((x + 1900) / 900, 2));                 // rear wing zone
    const edge = Math.max(0, 1 - Math.abs(y) / 1050);
    return base + hump * edge * 1.15;
  }

  function stepFlow(dt, speed) {
    if (!flowPts.visible) return;
    const v = speed * 3.2;
    for (let i = 0; i < FLOW_N; i++) {
      const s = flowState[i];
      s.x -= v * s.sp * dt;
      if (s.x < -4200) { s.x = 4200 + Math.random() * 800; s.y = (Math.random() * 2 - 1) * 950; }
      const target = heightField(s.x, s.y) + 90 + 140 * Math.sin(i * 3.7);
      s.z += (target - s.z) * Math.min(1, dt * 6);
      flowPos[i * 3] = s.x;
      flowPos[i * 3 + 1] = s.y;
      flowPos[i * 3 + 2] = Math.max(28, s.z);
    }
    flowGeom.attributes.position.needsUpdate = true;
  }

  // ---------------- interaction ----------------
  let drag = null;
  const pointers = new Map();
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = { mode: e.button === 2 ? 'pan' : 'orbit' };
  });
  canvas.addEventListener('pointerup', (e) => { pointers.delete(e.pointerId); if (!pointers.size) drag = null; });
  canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); drag = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev || !drag) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      // pinch zoom
      const arr = [...pointers.values()];
      void arr;
      camGoal.dist *= 1 + dy * 0.004;
      return;
    }
    if (drag.mode === 'orbit') {
      camGoal.yaw -= dx * 0.0075;
      camGoal.pitch = Math.max(-0.05, Math.min(1.45, camGoal.pitch + dy * 0.006));
    } else {
      const s = camGoal.dist * 0.0012;
      camGoal.tx -= (Math.cos(camGoal.yaw) * -dx - Math.sin(camGoal.yaw) * dy) * s;
      camGoal.ty -= (Math.sin(camGoal.yaw) * -dx + Math.cos(camGoal.yaw) * dy) * s;
    }
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camGoal.dist *= 1 + Math.sign(e.deltaY) * 0.09;
  }, { passive: false });

  function setView(preset) {
    const targets = {
      default: { yaw: 0.72, pitch: 0.32, dist: 8200, tx: 0, ty: 0, tz: 420 },
      front: { yaw: Math.PI / 2, pitch: 0.12, dist: 7400, tx: 0, ty: 0, tz: 420 },
      side: { yaw: 0.02, pitch: 0.08, dist: 7600, tx: 0, ty: 0, tz: 420 },
      rear3q: { yaw: -0.72, pitch: 0.32, dist: 8200, tx: 0, ty: 0, tz: 420 },
      top: { yaw: 0.0, pitch: 1.42, dist: 9800, tx: 0, ty: 0, tz: 300 },
      wing: { yaw: -2.35, pitch: 0.2, dist: 4300, tx: -1900, ty: 0, tz: 800 },
      floor: { yaw: 0.5, pitch: 0.06, dist: 5200, tx: 0, ty: 0, tz: 160 }
    };
    Object.assign(camGoal, targets[preset] ?? targets.default);
    camAnim = 0;
  }

  // ---------------- resize ----------------
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(r.width * dpr));
    const h = Math.max(2, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false);
      renderer.setPixelRatio(dpr);
      camera.aspect = r.width / Math.max(r.height, 1);
      camera.updateProjectionMatrix();
    }
  }

  // ---------------- render loop ----------------
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  let lastT = performance.now();
  let running = true;
  let tunnelSpeed = 69.4;

  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    if (pendingModel && pendingModel.hash !== builtHash) {
      rebuildCar(pendingModel);
      pendingModel = null;
      drawEnvelope();
    }

    // camera easing
    camAnim = Math.min(1, camAnim + dt * 2.2);
    applyCamera(0.12 + 0.88 * (1 - Math.pow(1 - camAnim, 3)));

    // turntable
    if (overlay.turntable && !overlay.reducedMotion) camGoal.yaw += dt * 0.28;

    // DRS actuator (smooth ramp)
    if (flapGroup && built) {
      const openTarget = overlay.drs ? rad(built.meta.drsPivot.openAngle ?? 40) : 0;
      drsAngle += (openTarget - drsAngle) * Math.min(1, dt * 7);
      flapGroup.rotation.y = drsAngle;
    }
    // wheels: spin with rolling road, gentle steer wobble in showcase
    wheelSpin -= dt * (overlay.rollingRoad ? tunnelSpeed * 1.9 : overlay.reducedMotion ? 0 : 8);
    for (const s of spinMeshes) s.node.rotation.y = wheelSpin / s.r;
    for (const s of steerGroups) {
      if (s.front && !overlay.rollingRoad && !overlay.reducedMotion) {
        s.group.rotation.z = Math.sin(now * 0.0004) * 0.045;
      } else s.group.rotation.z = 0;
    }
    // rolling road: scroll grid
    if (overlay.rollingRoad && !overlay.reducedMotion) {
      const cell = 1000;
      gridGroup.position.x = (gridGroup.position.x - tunnelSpeed * 3.2 * dt) % cell;
    } else gridGroup.position.x = 0;

    stepFlow(dt, tunnelSpeed);
    renderer.render(scene, camera);
  }

  const onLost = (e) => { e.preventDefault(); running = false; };
  const onRestored = () => { running = true; lastT = performance.now(); tick(); };
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);

  let pendingOverlay = { ...overlay };

  const api = {
    render(model, opts = {}) {
      Object.assign(overlay, opts);
      pendingOverlay = { ...overlay };
      tunnelSpeed = opts.tunnelSpeed ?? tunnelSpeed;
      if (!built || model.hash !== builtHash) {
        pendingModel = model;
        if (!built) { rebuildCar(model); pendingModel = null; drawEnvelope(); }
      }
      flowPts.visible = !!overlay.flow && !overlay.reducedMotion;
      if (envelopeGroup) envelopeGroup.visible = !!overlay.envelope;
      for (const [, e] of edgeStore) e.visible = !!overlay.wireframe;
      applyPressure(overlay.pressure);
      updateArrows(overlay.forces);
      resize();
    },
    setView,
    dispose() {
      running = false;
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((mm) => mm.dispose?.());
        }
      });
      renderer.dispose();
    }
  };

  resize();
  // initial paint immediately
  applyCamera(1);
  tick();
  return api;
}
