// Level preview: the real house with the game's lights, free-fly camera, plan view and debug overlays.
// URL: ?top=1 (plan) ?cam=x,y,z&at=x,y,z ?ceil=0 ?col=1 (colliders) ?nav=1 ?spots=1 ?props=1 ?labels=1
//      ?model=sofa,bed (model bench + __lv.hm(key) height maps) ?w=1600&h=1000
// Free-fly: drag to look, WASD move, Q/E down/up, shift = fast.
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { loadAssets, cloneModel, modelInfo, hasModel } from '../src/assets/loader';
import { buildHouse } from '../src/world/level';
import { createDevProp } from '../src/dev/devModels';
import { createProp } from '../src/models/props';
import { PROP_DEFS } from '../src/shared/propDefs';
import type { LevelData, Vec3 } from '../src/shared/contracts';

const q = new URLSearchParams(location.search);
const flag = (k: string) => q.get(k) === '1';
const vec = (k: string, d: Vec3): Vec3 => (q.get(k)?.split(',').map(Number) as Vec3) ?? d;
const hud = document.getElementById('hud')!;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
const css = new CSS2DRenderer();
css.domElement.style.cssText = 'position:fixed;inset:0;pointer-events:none';
document.body.appendChild(css.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f4e4cc');
// same rig as src/client/renderer.ts
const hemi = new THREE.HemisphereLight('#fff3df', '#b88f6c', 1.7);
const sun = new THREE.DirectionalLight('#ffe1b5', 2.4);
sun.position.set(-6, 14, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 9, bottom: -9, near: 1, far: 40 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.05;
scene.add(hemi, sun, sun.target);

const persp = new THREE.PerspectiveCamera(65, 1, 0.05, 120);
const ortho = new THREE.OrthographicCamera(-10, 10, 7, -7, 0.1, 100);
let camera: THREE.Camera = flag('top') ? ortho : persp;

function resize() {
  const w = Number(q.get('w')) || innerWidth, h = Number(q.get('h')) || innerHeight;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = w + 'px';
  renderer.domElement.style.height = h + 'px';
  css.setSize(w, h);
  persp.aspect = w / h;
  persp.updateProjectionMatrix();
  const a = w / h, half = 6.6;
  Object.assign(ortho, { left: -half * a, right: half * a, top: half, bottom: -half });
  ortho.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const label = (text: string, p: THREE.Vector3, parent: THREE.Object3D = scene) => {
  const d = document.createElement('div');
  d.className = 'lbl';
  d.textContent = text;
  const o = new CSS2DObject(d);
  o.position.copy(p);
  parent.add(o);
};

// ---------------------------------------------------------------- free-fly
let yaw = 0, pitch = -0.3;
const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
let drag = false;
addEventListener('mousedown', () => (drag = true));
addEventListener('mouseup', () => (drag = false));
addEventListener('mousemove', (e) => {
  if (!drag) return;
  yaw -= e.movementX * 0.004;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.004));
});
function setCam(p: Vec3, at: Vec3) {
  persp.position.set(...p);
  const d = new THREE.Vector3(at[0] - p[0], at[1] - p[1], at[2] - p[2]).normalize();
  yaw = Math.atan2(-d.x, -d.z);
  pitch = Math.asin(d.y);
}
setCam(vec('cam', [0, 9, 13]), vec('at', [0, 0, 0]));
ortho.position.set(0, 50, 0);
ortho.up.set(0, 0, -1);
ortho.lookAt(0, 0, 0);

// ---------------------------------------------------------------- overlays
function overlays(level: LevelData) {
  if (flag('col')) {
    const g = new THREE.Group();
    for (const b of level.colliders) {
      const color = b.tag === 'rug' ? '#ff5fa2' : b.tag === 'catOnly' ? '#3a7bff' : b.tag === 'soft' ? '#ffb000' : b.tag === 'wall' || b.tag === 'floor' || b.tag === 'ceiling' ? '#666' : '#e0301e';
      if (b.tag === 'ceiling' || b.tag === 'floor') continue;
      const m = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b.half[0] * 2, b.half[1] * 2, b.half[2] * 2)), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.85 }));
      m.position.set(...b.center);
      m.rotation.y = b.rotY ?? 0;
      m.renderOrder = 30;
      g.add(m);
    }
    scene.add(g);
  }
  if (flag('nav')) {
    const pts: number[] = [], cols: number[] = [];
    const byId = new Map(level.nav.nodes.map((n) => [n.id, n]));
    for (const l of level.nav.links) {
      const a = byId.get(l.a)!, b = byId.get(l.b)!;
      pts.push(a.pos[0], a.pos[1] + 0.05, a.pos[2], b.pos[0], b.pos[1] + 0.05, b.pos[2]);
      const c = l.door ? [1, 0.2, 0.9] : l.catOnly && l.kind === 'walk' ? [0.2, 0.5, 1] : l.kind === 'jump' ? (l.catOnly ? [1, 0.5, 0] : [1, 0.85, 0]) : [0.1, 0.75, 0.3];
      cols.push(...c, ...c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
    lines.renderOrder = 31;
    scene.add(lines);
    const dot = new THREE.SphereGeometry(0.06, 6, 4), dm = new THREE.MeshBasicMaterial({ color: '#0a8f3a', depthTest: false });
    for (const n of level.nav.nodes) { const m = new THREE.Mesh(dot, dm); m.position.set(...n.pos); m.renderOrder = 32; scene.add(m); }
  }
  if (flag('spots')) {
    for (const s of level.spots) {
      const m = new THREE.Mesh(new THREE.RingGeometry(s.radius - 0.04, s.radius, 32), new THREE.MeshBasicMaterial({ color: '#ffd60a', side: THREE.DoubleSide, depthTest: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(s.pos[0], s.pos[1] + 0.03, s.pos[2]);
      m.renderOrder = 33;
      scene.add(m);
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(Math.sin(s.facing), 0, Math.cos(s.facing)), new THREE.Vector3(s.pos[0], s.pos[1] + 0.05, s.pos[2]), 0.5, '#ff8800');
      scene.add(arrow);
      if (flag('labels')) label(s.id, new THREE.Vector3(s.pos[0], s.pos[1] + 0.3, s.pos[2]));
    }
    for (const sp of level.sunPatches) {
      const m = new THREE.Mesh(new THREE.RingGeometry(sp.radius - 0.04, sp.radius, 32), new THREE.MeshBasicMaterial({ color: '#ff9f0a', side: THREE.DoubleSide, depthTest: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(sp.center[0], sp.center[1] + 0.03, sp.center[2]);
      scene.add(m);
    }
    const sp = [level.spawns.sitter, ...level.spawns.cats];
    sp.forEach((p, i) => label(i ? `cat${i - 1}` : 'SITTER', new THREE.Vector3(p[0], p[1] + 0.5, p[2])));
  }
  if (flag('props')) {
    for (const p of level.props) {
      let m: THREE.Object3D;
      try { m = createProp(p.kind); } catch { m = createDevProp(p.kind); }
      const d = PROP_DEFS[p.kind];
      const hy = d.shape === 'box' ? d.half![1] : d.shape === 'cyl' ? d.hh! : d.r!;
      m.position.set(p.pos[0], p.pos[1] + hy, p.pos[2]);
      m.rotation.y = p.rotY ?? 0;
      scene.add(m);
    }
  }
  if (flag('roomlabels')) for (const r of level.rooms) label(r.name, new THREE.Vector3((r.min[0] + r.max[0]) / 2, 0.2, (r.min[2] + r.max[2]) / 2));
}

// ---------------------------------------------------------------- model bench
/** height map of a model: top surface (first hit from above) per cell, in cm. */
function hm(key: string | THREE.Object3D, step = 0.05, mode: 'top' | 'under' = 'top') {
  const m = typeof key === 'string' ? cloneModel(key) : key;
  m.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m);
  const rc = new THREE.Raycaster();
  const rows: string[] = [];
  for (let z = box.max.z - step / 2; z > box.min.z; z -= step) {
    let row = `${z.toFixed(2).padStart(6)} `;
    for (let x = box.min.x + step / 2; x < box.max.x; x += step) {
      if (mode === 'top') rc.set(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
      else rc.set(new THREE.Vector3(x, 0.005, z), new THREE.Vector3(0, 1, 0));
      const hit = rc.intersectObject(m, true)[0];
      const v = hit ? Math.round(hit.point.y * 100) : -1;
      row += v < 0 ? '  .' : String(v).padStart(3);
    }
    rows.push(row);
  }
  let head = '       ';
  for (let x = box.min.x + step / 2; x < box.max.x; x += step) head += String(Math.round(x * 100)).padStart(3);
  return `${typeof key === 'string' ? key : key.name} ${mode} x:[${box.min.x.toFixed(2)},${box.max.x.toFixed(2)}] y:[${box.min.y.toFixed(2)},${box.max.y.toFixed(2)}] z:[${box.min.z.toFixed(2)},${box.max.z.toFixed(2)}] (+z = front, rows top = +z)\n${head}\n${rows.join('\n')}`;
}

/** every surface height along a vertical line through a model (cm) */
function vcol(key: string, x: number, z: number) {
  const m = cloneModel(key);
  m.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
  return rc.intersectObject(m, true).map((h) => `${Math.round(h.point.y * 100)}${h.face && h.face.normal.y > 0 ? 'u' : 'd'}`).join(' ');
}

let level: LevelData | null = null;
(window as any).__lv = { THREE, hm, vcol, scene, setCam, modelInfo, get level() { return level; } };

async function main() {
  await loadAssets((p) => (hud.textContent = `loading ${Math.round(p * 100)}%`));
  const bench = q.get('model');
  const raw = q.get('raw'); // raw=path@heightMeters,... (paths under /assets-raw/)
  if (raw) {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const ld = new GLTFLoader();
    let x = 0;
    for (const item of raw.split(',')) {
      const [path, h] = item.split('@');
      const g = (await ld.loadAsync('/assets-raw/' + path)).scene;
      const b = new THREE.Box3().setFromObject(g);
      const s = Number(h) / (b.max.y - b.min.y);
      g.scale.setScalar(s);
      const b2 = new THREE.Box3().setFromObject(g);
      g.position.set(x - b2.min.x, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
      g.traverse((o) => { o.castShadow = o.receiveShadow = true; });
      scene.add(g);
      label(path.split('/').pop()!, new THREE.Vector3(x + (b2.max.x - b2.min.x) / 2, Number(h) + 0.1, 0));
      (window as any).__raw = [...((window as any).__raw ?? []), g];
      x += b2.max.x - b2.min.x + 0.4;
    }
    scene.add(new THREE.GridHelper(40, 400, '#b08a6a', '#d8c2a8'));
  } else if (bench) {
    const keys = bench === 'all' ? [] : bench.split(',');
    let x = 0;
    for (const k of keys) {
      if (!hasModel(k)) continue;
      const m = cloneModel(k);
      const w = modelInfo(k)!.size[0];
      m.position.x = x + w / 2;
      scene.add(m);
      label(k, new THREE.Vector3(x + w / 2, modelInfo(k)!.size[1] + 0.1, 0));
      x += w + 0.4;
    }
    const grid = new THREE.GridHelper(40, 400, '#b08a6a', '#d8c2a8');
    scene.add(grid);
    hud.textContent = 'model bench';
  } else {
    level = buildHouse();
    scene.add(level.group);
    if (q.get('ceil') === '0' || flag('top')) level.group.traverse((o) => { if (o.name === 'ceiling') o.visible = false; });
    overlays(level);
    hud.textContent = `house: ${level.colliders.length} colliders, ${level.props.length} props, ${level.nav.nodes.length} nodes, ${level.nav.links.length} links`;
    if (q.get('doors')) for (const d of level.doors) level.setDoorOpen(d.id, Number(q.get('doors')));
  }
  let last = performance.now();
  let frames = 0, acc = 0;
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt; frames++;
    if (acc > 1) { (window as any).__fps = frames / acc; acc = 0; frames = 0; }
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const sp = (keys.has('shift') ? 6 : 2.5) * dt;
    if (keys.has('w')) persp.position.addScaledVector(fwd, sp);
    if (keys.has('s')) persp.position.addScaledVector(fwd, -sp);
    if (keys.has('d')) persp.position.addScaledVector(right, sp);
    if (keys.has('a')) persp.position.addScaledVector(right, -sp);
    if (keys.has('e')) persp.position.y += sp;
    if (keys.has('q')) persp.position.y -= sp;
    persp.rotation.set(pitch, yaw, 0, 'YXZ');
    level?.update(dt, now / 1000);
    renderer.render(scene, camera);
    css.render(scene, camera);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
camera = flag('top') ? ortho : persp;
main();
