// Sitter model preview: every anim, face and look, plus a carry test with the real cat (registry).
// URL: ?view=one|grid|faces|looks|carry|shoulder  &anim=idle &face=neutral &look=0 &speed=0 &carry=1 &flash=1 &pitch=0.2
//      &t=<seconds> (freeze the clock at t after a warm-up)  &yaw=<rad> (one view)  &cam=front|side|back|close|shoulder
// Console: set({anim:'clap'}), cam('side'), window.sitter
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { cloneModel, getClips, loadAssets } from '../src/assets/loader';
import { SITTER_LOOKS, OWNER_LOOKS, createSitter } from '../src/models/sitter';
import { createDevCat } from '../src/dev/devModels';
import type { CatLook, CatModelApi, SitterLook, SitterModelApi, SitterVisualState } from '../src/shared/contracts';
import { toon } from '../src/shared/toon';

type Anim = SitterVisualState['anim'];
type Face = SitterVisualState['face'];
const ANIMS: Anim[] = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'carry', 'spray', 'clean', 'interact', 'shakeTreats',
  'stunned', 'grabReach', 'celebrate', 'despair', 'scoop', 'slip', 'toss', 'clap'];
const FACES: Face[] = ['neutral', 'angry', 'panic', 'smug', 'tired', 'shock', 'happy', 'gag'];
const LOOKS: SitterLook[] = [...SITTER_LOOKS, ...OWNER_LOOKS];
/** one-shots re-trigger every N seconds so the grid shows them */
const ONESHOT: Partial<Record<Anim, number>> = { jump: 1.2, land: 1.2, spray: 1.0, stunned: 1.5, grabReach: 1.6, slip: 2.0, toss: 1.2, clap: 1.2, despair: 4 };
const SPEED: Partial<Record<Anim, number>> = { walk: 2.2, run: 5.2, carry: 2.4 };

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'one';
const hud = document.getElementById('hud')!;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
document.body.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f3e6d3');
const hemi = new THREE.HemisphereLight('#fff3df', '#b88f6c', 1.7);
const sun = new THREE.DirectionalLight('#ffe1b5', 2.4);
sun.position.set(4, 7, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.05;
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
scene.add(hemi, sun, sun.target);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), toon('#d9a066'));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
if (params.get('dark') === '1') { hemi.intensity = 0.15; sun.intensity = 0.1; scene.background = new THREE.Color('#1d1a24'); }

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.03, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
});

interface Item { m: SitterModelApi; st: SitterVisualState; cat?: CatModelApi; label?: string }
const items: Item[] = [];
const base = (): SitterVisualState => ({
  anim: (params.get('anim') as Anim) ?? 'idle', face: (params.get('face') as Face) ?? 'neutral',
  speed: Number(params.get('speed') ?? 0), vy: 0, grounded: true, carrying: params.get('carry') === '1',
  flashlight: params.get('flash') === '1', aimPitch: Number(params.get('pitch') ?? 0.2), lookAt: null,
});

function label(obj: THREE.Object3D, text: string, y = 2.05) {
  const div = document.createElement('div');
  div.className = 'lbl';
  div.textContent = text;
  const l = new CSS2DObject(div);
  l.position.set(0, y, 0);
  obj.add(l);
}

function add(look: SitterLook, st: Partial<SitterVisualState>, x: number, z: number, yaw = 0, text?: string): Item {
  const m = createSitterModel(look);
  m.root.position.set(x, 0, z);
  m.root.rotation.y = yaw;
  scene.add(m.root);
  const it: Item = { m, st: { ...base(), ...st } };
  if (text) label(m.root, text);
  items.push(it);
  return it;
}

function addCat(it: Item) {
  it.cat = createCatModel({ name: 'Mochi', pattern: 'tabby', furColor: '#f2a65a', secondaryColor: '#b8692e', eyeColor: '#7bc96f', accessory: 'none', chonk: 0.4 });
  scene.add(it.cat.root);
}

// the registry pulls in every module; if another package is mid-edit, fall back to direct imports
let createSitterModel: (l: SitterLook) => SitterModelApi = createSitter;
let createCatModel: (l: CatLook) => CatModelApi = createDevCat;
try {
  const R = await import('../src/registry');
  createSitterModel = R.createSitterModel;
  createCatModel = R.createCatModel;
} catch (err) {
  console.warn('[sitter preview] registry import failed, using direct imports + dev cat', err);
}
await loadAssets();
const lookIdx = Number(params.get('look') ?? 0);
const yaw0 = Number(params.get('yaw') ?? 0);

function setCam(name: string, target = new THREE.Vector3(0, 0.95, 0)) {
  const c: Record<string, [number, number, number]> = {
    front: [0, 1.25, 4.2], side: [4.2, 1.25, 0], right: [-4.2, 1.25, 0], fr: [-2.6, 1.4, 3.2], back: [0, 1.6, -4.2], close: [0, 1.35, 1.6], three: [2.6, 1.6, 3.4],
  };
  if (name === 'shoulder') {
    // the game's sitter cam: pivot 1.6 up, 0.5 to the right, 3 m back, pitch 0.22
    const it = items[0];
    const yaw = it.m.root.rotation.y;
    const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const pivot = it.m.root.position.clone().add(new THREE.Vector3(0, 1.6, 0)).addScaledVector(right, 0.5);
    const p = 0.22;
    const dir = fwd.clone().multiplyScalar(Math.cos(p)).setY(-Math.sin(p));
    camera.position.copy(pivot).addScaledVector(dir, -3);
    controls.target.copy(pivot).addScaledVector(dir, 4);
    camera.fov = 65;
  } else {
    camera.position.set(...(c[name] ?? c.front)).add(target).sub(new THREE.Vector3(0, 0.95, 0));
    controls.target.copy(target);
    camera.fov = name === 'close' ? 30 : 35;
  }
  camera.updateProjectionMatrix();
}

switch (view) {
  case 'grid': {
    const cols = 7;
    ANIMS.forEach((a, i) => {
      const x = (i % cols - (cols - 1) / 2) * 1.6, z = -Math.floor(i / cols) * 2.1;
      const it = add(LOOKS[i % LOOKS.length], { anim: a, speed: SPEED[a] ?? 0, carrying: a === 'carry' || a === 'toss', face: FACES[i % FACES.length] }, x, z, yaw0 || 0.35, a);
      if (a === 'carry') addCat(it);
    });
    camera.position.set(0, 4.2, 10.5);
    controls.target.set(0, 0.6, -2.2);
    break;
  }
  case 'faces': {
    // ?page=0|1: four faces per page, head height
    const page = Number(params.get('page') ?? 0);
    FACES.slice(page * 4, page * 4 + 4).forEach((f, i) => add(LOOKS[(i + page * 4) % LOOKS.length], { face: f }, (i - 1.5) * 1.05, 0, 0, f));
    camera.position.set(0, 1.45, 4.6);
    controls.target.set(0, 1.25, 0);
    break;
  }
  case 'raw': {
    // raw KayKit clips on plain clones: ?view=raw&clips=Idle,Unarmed_Idle&t=0.4
    const names = (params.get('clips') ?? 'Idle,Unarmed_Idle').split(',');
    names.forEach((n, i) => {
      const m = cloneModel('sitter');
      m.position.x = (i - (names.length - 1) / 2) * 1.4;
      m.rotation.y = yaw0 || 0.4;
      scene.add(m);
      const clip = getClips('sitter').find((c) => c.name === n);
      if (clip) { const mx = new THREE.AnimationMixer(m); mx.clipAction(clip).play(); mx.setTime(Number(params.get('t') ?? 0.4)); }
      label(m, n);
    });
    camera.position.set(0, 1.5, 3 + names.length * 1.2);
    controls.target.set(0, 0.9, 0);
    break;
  }
  case 'looks':
    LOOKS.forEach((l, i) => add(l, { face: FACES[[0, 6, 3, 1, 4, 0, 0][i] ?? 0] }, (i - (LOOKS.length - 1) / 2) * 1.25, 0, 0, l.name));
    camera.position.set(0, 1.5, 8.2);
    controls.target.set(0, 0.9, 0);
    break;
  case 'carry':
  case 'shoulder': {
    const it = add(LOOKS[lookIdx], { anim: 'carry', carrying: true, face: (params.get('face') as Face) ?? 'angry', speed: Number(params.get('speed') ?? 0) }, 0, 0, yaw0);
    addCat(it);
    setCam(view === 'shoulder' ? 'shoulder' : params.get('cam') ?? 'three');
    break;
  }
  default: {
    add(LOOKS[lookIdx], {}, 0, 0, yaw0);
    setCam(params.get('cam') ?? 'front');
    if (params.get('cat') === '1') addCat(items[0]);
    const cp = params.get('campos'), ct = params.get('camtgt');
    if (cp && ct) { camera.position.set(...(cp.split(',').map(Number) as [number, number, number])); controls.target.set(...(ct.split(',').map(Number) as [number, number, number])); }
  }
}

// ---------------------------------------------------------------- HUD controls (view=one / carry)
if (view === 'one' || view === 'carry' || view === 'shoulder') {
  const it = items[0];
  const mk = (tag: string, html: string, on: (e: Event) => void) => { const e = document.createElement(tag); e.innerHTML = html; e.addEventListener(tag === 'select' ? 'change' : 'click', on); hud.appendChild(e); return e; };
  hud.innerHTML = '';
  const sel = (opts: string[], cur: string, on: (v: string) => void) => {
    const s = mk('select', opts.map((o) => `<option ${o === cur ? 'selected' : ''}>${o}</option>`).join(''), (e) => on((e.target as HTMLSelectElement).value)) as HTMLSelectElement;
    return s;
  };
  sel(ANIMS, it.st.anim, (v) => { it.st.anim = v as Anim; it.st.speed = SPEED[v as Anim] ?? it.st.speed; });
  sel(FACES, it.st.face, (v) => { it.st.face = v as Face; });
  sel(LOOKS.map((l) => l.name), LOOKS[lookIdx].name, (v) => it.m.setLook(LOOKS.find((l) => l.name === v)!));
  mk('button', 'carry', () => { it.st.carrying = !it.st.carrying; if (it.st.carrying && !it.cat) addCat(it); });
  mk('button', 'phone', () => { it.st.flashlight = !it.st.flashlight; });
  for (const c of ['front', 'side', 'back', 'close', 'three', 'shoulder']) mk('button', c, () => setCam(c));
}

// ---------------------------------------------------------------- loop
const W = window as unknown as Record<string, unknown>;
W.sitter = items[0]?.m;
if (params.get('nozzle') === '1') for (const it of items) { const ax = new THREE.AxesHelper(0.1); it.m.sprayNozzle.add(ax); it.m.holdAnchor.add(new THREE.AxesHelper(0.08)); }
W.items = items;
W.set = (p: Partial<SitterVisualState>) => { for (const it of items) Object.assign(it.st, p); };
W.cam = (n: string) => setCam(n);

const freeze = params.has('t') ? Number(params.get('t')) : null;
let t = 0;
const clock = new THREE.Clock();
const look = new THREE.Vector3();
function frame(dt: number) {
  t += dt;
  for (const it of items) {
    const st = it.st;
    const period = ONESHOT[st.anim];
    const real = st.anim;
    // retrigger one-shots: one frame of idle every period
    const phase = period ? t % period : 1;
    const s = period && phase < dt * 1.5 ? { ...st, anim: 'idle' as Anim } : st;
    if (params.get('lookcam') === '1') s.lookAt = camera.getWorldPosition(look);
    it.m.update(dt, s);
    st.anim = real;
    if (it.cat) {
      const held = st.carrying && st.anim !== 'toss';
      it.cat.root.visible = held;
      it.cat.update(dt, { anim: 'grabbed', face: 'unimpressed', speed: 0, vy: 0, grounded: false, wet: 0, puffed: false, high: false, talk: null });
      // same math as client/view.ts attachToHand
      it.m.root.updateMatrixWorld(true);
      const w = it.m.holdAnchor.getWorldPosition(new THREE.Vector3());
      it.cat.root.rotation.y = it.m.root.rotation.y + Math.PI;
      it.cat.root.position.set(0, 0, 0);
      it.cat.root.updateMatrixWorld(true);
      const v = it.cat.scruffAnchor.getWorldPosition(new THREE.Vector3());
      it.cat.root.position.copy(w).sub(v);
    }
  }
}
if (freeze !== null) {
  const steps = Math.round(freeze * 60);
  for (let i = 0; i < steps; i++) frame(1 / 60);
}
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (freeze === null) frame(dt);
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
});
if (view !== 'one' && view !== 'carry' && view !== 'shoulder') hud.textContent = `sitter preview: ${view}`;
