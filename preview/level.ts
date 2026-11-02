// Level preview: the real house with the game's lights, free-fly camera, plan view and debug overlays.
// URL: ?top=1 (plan) ?cam=x,y,z&at=x,y,z ?ceil=0 ?col=1 (colliders) ?nav=1 ?spots=1 ?props=1 ?labels=1
//      ?model=sofa,bed (model bench + __lv.hm(key) height maps) ?w=1600&h=1000
// Free-fly: drag to look, WASD move, Q/E down/up, shift = fast.
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { loadAssets, cloneModel, modelInfo, hasModel } from '../src/assets/loader';
import { buildHouse, PLACED } from '../src/world/level';
import { createDevProp } from '../src/dev/devModels';
import { createProp } from '../src/models/props';
import { createCat } from '../src/models/cat';
import { createSitter, SITTER_LOOKS } from '../src/models/sitter';
import { PROP_DEFS } from '../src/shared/propDefs';
import type { CatAnim, CatLook, CatVisualState, LevelData, PropKind, SitterVisualState, Vec3 } from '../src/shared/contracts';

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
  const a = w / h, half = 6.9;
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
ortho.position.set(0, 50, 0.3);
ortho.up.set(0, 0, -1);
ortho.lookAt(0, 0, 0.3);

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

// ---------------------------------------------------------------- scale sheets: sitter + cat next to every model
// ?sheet=furniture|props &frame=a,b (cells a..b, ortho, eye level) &side=1 (bed/sofa seen from the side) &col=1
// in the house: ?sitter=x,z,yaw &cats=x,y,z,yaw[,anim];...
const SHEET_SKIP = new Set(['window', 'tree', 'treeLarge', 'bush', 'fence', 'rug', 'rugRound', 'doormat', 'bathMat', 'curtains']);
const catLook = (fur = '#f0a050'): CatLook => ({ name: 'c', pattern: 'tabby', furColor: fur, secondaryColor: '#b45a26', eyeColor: '#9ccf5a', accessory: 'none', chonk: 0.2 });
const ticking: ((dt: number) => void)[] = [];
function addSitter(x: number, z: number, yaw: number, y = 0) {
  const m = createSitter(SITTER_LOOKS[0]);
  m.root.position.set(x, y, z);
  m.root.rotation.y = yaw;
  scene.add(m.root);
  const s: SitterVisualState = { anim: 'idle', face: 'neutral', speed: 0, vy: 0, grounded: true, carrying: false, flashlight: false, aimPitch: 0 };
  ticking.push((dt) => m.update(dt, s));
  return m;
}
function addCat(x: number, y: number, z: number, yaw: number, anim: CatAnim = 'idle', fur?: string) {
  const c = createCat(catLook(fur));
  c.root.position.set(x, y, z);
  c.root.rotation.y = yaw;
  scene.add(c.root);
  const s: CatVisualState = { anim, face: 'neutral', speed: 0, vy: 0, grounded: true, wet: 0, puffed: false, high: false, talk: null };
  ticking.push((dt) => c.update(dt, s));
  return c;
}
const boxLines = (b: readonly (number | string | undefined)[], color: string) => boxLinesN(b as number[], color);
const boxLinesN = (b: number[], color: string) => {
  const m = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b[3] - b[0], b[4] - b[1], b[5] - b[2])), new THREE.LineBasicMaterial({ color, depthTest: false }));
  m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
  m.renderOrder = 40;
  return m;
};
/** one cell per model: sitter | model | cat, returns the x extents of every cell */
function sheet(kind: string): [number, number][] {
  buildHouse(); // fills PLACED with the in-game scale/prep/colliders
  const cells: [number, number][] = [];
  let x = 0;
  const side = flag('side');
  if (kind === 'furniture') {
    for (const [key, o] of PLACED) {
      const info = modelInfo(key)!;
      if (info.category === 'props' || SHEET_SKIP.has(key)) continue;
      const m = cloneModel(key);
      o.prep?.(m);
      if (o.s !== undefined) typeof o.s === 'number' ? m.scale.setScalar(o.s) : m.scale.set(...o.s);
      const yaw = side && ['bed', 'sofa', 'bathtub', 'armchair'].includes(key) ? -Math.PI / 2 : 0;
      const g = new THREE.Group();
      g.add(m);
      if (flag('col') && Array.isArray(o.box)) for (const b of o.box) g.add(boxLines(b, b[6] === 'soft' ? '#ffb000' : b[6] === 'catOnly' ? '#3a7bff' : '#e0301e'));
      g.rotation.y = yaw;
      g.position.y = o.y ?? 0;
      g.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(m);
      const x0 = x;
      addSitter(x + 0.3, 0, 0);
      x += 0.75;
      g.position.x = x - bb.min.x;
      x += bb.max.x - bb.min.x + 0.15;
      scene.add(g);
      addCat(x + 0.17, 0, 0, Math.PI / 2);
      x += 0.5;
      label(`${key} ${Math.round((bb.max.y) * 100)}cm`, new THREE.Vector3((x0 + x) / 2, -0.12, 0.6));
      cells.push([x0, x]);
      x += 0.25;
    }
  } else {
    for (const kind of Object.keys(PROP_DEFS) as PropKind[]) {
      const x0 = x;
      const s = addSitter(x + 0.3, 0, 0);
      const inHand = createProp(kind);
      s.root.updateMatrixWorld(true);
      const hand = s.root.getObjectByName('handslotl');
      if (hand) {
        hand.add(inHand);
        const ws = hand.getWorldScale(new THREE.Vector3());
        inHand.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
      }
      const d = PROP_DEFS[kind];
      const hy = d.shape === 'box' ? d.half![1] : d.shape === 'cyl' ? d.hh! : d.r!;
      const hx = d.shape === 'box' ? d.half![0] : d.r!;
      const p = createProp(kind);
      p.position.set(x + 0.95, hy, 0.15);
      if (flag('long')) p.rotation.y = Math.PI / 2; // long props (shoe, sock, remote) seen along their length
      scene.add(p);
      if (flag('col')) scene.add(boxLines([x + 0.95 - hx, 0, 0.15 - hx, x + 0.95 + hx, hy * 2, 0.15 + hx], '#e0301e'));
      addCat(x + 0.95 + hx + 0.2, 0, 0, -Math.PI / 2);
      x += 1.6;
      label(kind, new THREE.Vector3((x0 + x) / 2, -0.08, 0.6));
      cells.push([x0, x]);
    }
  }
  const floorG = new THREE.Mesh(new THREE.PlaneGeometry(400, 40), new THREE.MeshToonMaterial({ color: '#e2c7a4' }));
  floorG.rotation.x = -Math.PI / 2;
  floorG.position.x = 180;
  floorG.receiveShadow = true;
  scene.add(floorG, new THREE.GridHelper(400, 4000, '#b08a6a', '#d8c2a8'));
  return cells;
}

let level: LevelData | null = null;
(window as any).__lv = { THREE, hm, vcol, scene, setCam, modelInfo, cloneModel, PLACED, get level() { return level; } };

async function main() {
  await loadAssets((p) => (hud.textContent = `loading ${Math.round(p * 100)}%`));
  const bench = q.get('model');
  const raw = q.get('raw'); // raw=path@heightMeters,... (paths under /assets-raw/)
  const sheetKind = q.get('sheet');
  if (sheetKind) {
    const cells = sheet(sheetKind);
    const [a, b] = (q.get('frame') ?? `0,${cells.length - 1}`).split(',').map(Number);
    const x0 = cells[Math.max(0, a)][0], x1 = cells[Math.min(cells.length - 1, b)][1];
    const w = x1 - x0, asp = persp.aspect, top = Number(q.get('top2') ?? 2.35);
    const half = Math.max(w / asp / 2, (top + 0.25) / 2);
    Object.assign(ortho, { left: -half * asp, right: half * asp, top: half, bottom: -half });
    ortho.updateProjectionMatrix();
    ortho.up.set(0, 1, 0);
    ortho.position.set((x0 + x1) / 2, top / 2 - 0.12, 20); // eye level, looking straight along -z
    ortho.lookAt((x0 + x1) / 2, top / 2 - 0.12, 0);
    camera = ortho;
    sun.position.set((x0 + x1) / 2 - 4, 10, 10);
    sun.target.position.set((x0 + x1) / 2, 0, 0);
    Object.assign(sun.shadow.camera, { left: -w, right: w, top: 8, bottom: -8 });
    sun.shadow.camera.updateProjectionMatrix();
    hud.textContent = `sheet ${sheetKind}: ${cells.length} cells`;
  } else if (raw) {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const ld = new GLTFLoader();
    let x = 0;
    for (const item of raw.split(',')) {
      const [path, h] = item.split('@');
      const g = (await ld.loadAsync('/assets-raw/' + path)).scene;
      const b = new THREE.Box3().setFromObject(g);
      // @z2.1 = fit the length instead of the height, @L2.1 = the longer horizontal side
      const ax = h[0] === 'L' ? (b.max.x - b.min.x > b.max.z - b.min.z ? 'x' : 'z') : /^[xyz]/.test(h) ? h[0] as 'x' | 'y' | 'z' : 'y';
      const s = parseFloat(h.replace(/^[xyzL]/, '')) / (b.max[ax] - b.min[ax]);
      g.scale.setScalar(s);
      const b2 = new THREE.Box3().setFromObject(g);
      g.position.set(x - b2.min.x, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
      g.traverse((o) => { o.castShadow = o.receiveShadow = true; });
      scene.add(g);
      label(`${path.split('/').pop()} ${(b2.max.y - b2.min.y).toFixed(2)}`, new THREE.Vector3(x + (b2.max.x - b2.min.x) / 2, b2.max.y - b2.min.y + 0.1, 0));
      (window as any).__raw = [...((window as any).__raw ?? []), g];
      x += b2.max.x - b2.min.x + 0.4;
    }
    scene.add(new THREE.GridHelper(40, 400, '#b08a6a', '#d8c2a8'));
    addSitter(-0.5, 0, 0);
    addCat(-1.1, 0, 0, 0);
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
    const sp = q.get('sitter')?.split(',').map(Number);
    if (sp) addSitter(sp[0], sp[1], sp[2] ?? 0);
    for (const c of q.get('cats')?.split(';') ?? []) {
      const v = c.split(',');
      addCat(+v[0], +v[1], +v[2], +(v[3] ?? 0), (v[4] as CatAnim) ?? 'idle');
    }
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
    for (const f of ticking) f(dt);
    renderer.render(scene, camera);
    css.render(scene, camera);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
camera = flag('top') ? ortho : persp;
main();
