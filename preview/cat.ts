// Cat model preview: ?view=faces|anims|patterns|acc|chonk|turn|hand|game  (&close=1 for face close-ups)
// window.__cat: { view(name), cats, cells, setAll(partialState), t }
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { CatAccessory, CatAnim, CatFace, CatLook, CatModelApi, CatVisualState, FurPattern, SitterModelApi, SitterVisualState } from '../src/shared/contracts';
import { loadAssets } from '../src/assets/loader';
import { createCat, CAT_ACCESSORIES } from '../src/models/cat';
import { createSitterModel } from '../src/registry';
import { COAT_PRESETS } from '../src/core/profile';

const params = new URLSearchParams(location.search);
const hud = document.getElementById('hud')!;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
labels.domElement.style.cssText = 'position:fixed;inset:0;pointer-events:none';
document.body.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f4e4cc');
scene.add(new THREE.HemisphereLight('#dfe9ff', '#b88f6c', 1.55));
const sun = new THREE.DirectionalLight('#fff3df', 2.6);
sun.position.set(-4, 9, 5.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 3;
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshToonMaterial({ color: '#d9b48a' }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const camera = new THREE.PerspectiveCamera(35, 1, 0.02, 100);
const controls = new OrbitControls(camera, renderer.domElement);
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- looks
const PRESETS: Record<string, Omit<CatLook, 'name' | 'accessory' | 'chonk'>> = {
  orangeTabby: { pattern: 'tabby', furColor: '#f0a050', secondaryColor: '#b45a26', eyeColor: '#9ccf5a' },
  greyTabby: { pattern: 'tabby', furColor: '#aaa49c', secondaryColor: '#57504a', eyeColor: '#e9c46a' },
  black: { pattern: 'solid', furColor: '#2d2928', secondaryColor: '#2d2928', eyeColor: '#f2c14e' },
  white: { pattern: 'solid', furColor: '#f7f2ea', secondaryColor: '#f7f2ea', eyeColor: '#6fb7e8' },
  tuxedo: { pattern: 'tuxedo', furColor: '#2a2624', secondaryColor: '#f7f2ea', eyeColor: '#a9d36b' },
  calico: { pattern: 'calico', furColor: '#e8913f', secondaryColor: '#3a302c', eyeColor: '#d9a441' },
  siamese: { pattern: 'siamese', furColor: '#f3e6d3', secondaryColor: '#5a4033', eyeColor: '#5fa8e8' },
  tortie: { pattern: 'tortie', furColor: '#d9823b', secondaryColor: '#2e2622', eyeColor: '#e0b44a' },
  blue: { pattern: 'solid', furColor: '#8d97a3', secondaryColor: '#8d97a3', eyeColor: '#8fd06b' },
  ginger: { pattern: 'solid', furColor: '#e8a35c', secondaryColor: '#e8a35c', eyeColor: '#d4a017' },
};
const look = (preset: string, extra: Partial<CatLook> = {}): CatLook => ({ name: preset, accessory: 'none', chonk: 0.2, ...PRESETS[preset], ...extra });

// ---------------------------------------------------------------- cells
type StateFn = (s: CatVisualState, t: number) => void;
interface Cell { cat: CatModelApi; s: CatVisualState; fn: StateFn; label: string; base: THREE.Vector3; sitter?: SitterModelApi; ss?: SitterVisualState; spin?: number }
let cells: Cell[] = [];
const group = new THREE.Group();
scene.add(group);

function baseState(): CatVisualState {
  return { anim: 'idle', face: 'neutral', speed: 0, vy: 0, grounded: true, wet: 0, puffed: false, high: false, talk: null, lookAt: null };
}
function addCell(l: CatLook, x: number, z: number, label: string, fn: StateFn, yaw = 0) {
  const cat = createCat(l);
  cat.root.position.set(x, 0, z);
  cat.root.rotation.y = yaw;
  group.add(cat.root);
  const div = document.createElement('div');
  div.className = 'lbl';
  div.textContent = label;
  const lab = new CSS2DObject(div);
  lab.position.set(x, -0.04, z + 0.28);
  group.add(lab);
  const c: Cell = { cat, s: baseState(), fn, label, base: new THREE.Vector3(x, 0, z) };
  cells.push(c);
  return c;
}
function clear() {
  for (const c of cells) { c.cat.dispose(); c.sitter?.root.removeFromParent(); }
  cells = [];
  group.clear();
}
const camLook = new THREE.Vector3();
const lookAtCam = (s: CatVisualState) => { s.lookAt = camLook; };

function grid<T>(items: T[], cols: number, dx: number, dz: number, f: (it: T, x: number, z: number, i: number) => void) {
  const rows = Math.ceil(items.length / cols);
  items.forEach((it, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    f(it, (c - (cols - 1) / 2) * dx, (r - (rows - 1) / 2) * dz, i);
  });
  return { w: cols * dx, h: rows * dz };
}

const FACES: CatFace[] = ['neutral', 'happy', 'smug', 'angry', 'shock', 'sad', 'derp', 'sleepy', 'blep', 'flehmen', 'love', 'focused', 'unimpressed'];
const ANIMS: CatAnim[] = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'sit', 'loaf', 'sleep', 'crouch', 'pounceCharge', 'swipe', 'scratch', 'poop', 'eat', 'type', 'dig', 'knead', 'climb', 'interact', 'carryMouth', 'hairball', 'grabbed', 'caged', 'stunned', 'hypnotized', 'fight', 'hangDoor', 'tap', 'groom'];

function view(name: string) {
  clear();
  const close = params.get('close') === '1';
  const preset = params.get('look') ?? 'orangeTabby';
  hud.innerHTML = ['faces', 'anims', 'patterns', 'coats', 'acc', 'chonk', 'turn', 'hand', 'game'].map((v) => `<a href="?view=${v}" class="${v === name ? 'on' : ''}">${v}</a>`).join('') + ` <span id="fps"></span>`;
  if (name === 'faces') {
    const items: { label: string; fn: StateFn }[] = FACES.map((f) => ({ label: f, fn: (s: CatVisualState) => { s.anim = 'sit'; s.face = f; lookAtCam(s); } }));
    items.push({ label: 'talk meow', fn: (s) => { s.anim = 'sit'; s.talk = 'meow'; lookAtCam(s); } });
    items.push({ label: 'talk hiss', fn: (s) => { s.anim = 'sit'; s.face = 'angry'; s.talk = 'hiss'; s.puffed = true; lookAtCam(s); } });
    items.push({ label: 'talk purr', fn: (s) => { s.anim = 'sit'; s.talk = 'purr'; lookAtCam(s); } });
    items.push({ label: 'talk chirp', fn: (s) => { s.anim = 'sit'; s.talk = 'chirp'; lookAtCam(s); } });
    items.push({ label: 'dizzy', fn: (s) => { s.anim = 'sit'; s.dizzy = true; } });
    items.push({ label: 'hypnotized', fn: (s) => { s.anim = 'hypnotized'; s.face = 'love'; } });
    items.push({ label: 'focused + charge', fn: (s, t) => { s.anim = 'pounceCharge'; s.face = 'focused'; s.pounceCharge = 0.5 + 0.5 * Math.sin(t); } });
    items.push({ label: 'catnip derp', fn: (s) => { s.anim = 'sit'; s.face = 'derp'; s.high = true; } });
    // a wall of cats: rows stacked vertically so every face is seen head-on
    const sp = 0.5;
    grid(items, 6, sp, 0.55, (it, x, z) => { const c = addCell(look(preset), x, 0, it.label, it.fn); c.base.y = 1.1 - z * 1.0; c.cat.root.position.y = c.base.y; });
    for (const c of cells) { const lab = group.children.find((o) => o instanceof CSS2DObject && (o as CSS2DObject).element.textContent === c.label) as CSS2DObject; if (lab) lab.position.set(c.base.x, c.base.y - 0.05, 0.25); }
    camLook.set(0, 1.25, 6);
    camera.position.set(0, 1.3, close ? 3.0 : 5.0);
    controls.target.set(0, 1.2, 0);
  } else if (name === 'anims') {
    const items: { label: string; fn: StateFn }[] = ANIMS.map((a) => ({
      label: a, fn: (s: CatVisualState, t: number) => {
        s.anim = a;
        s.speed = a === 'walk' || a === 'carryMouth' ? 2.6 : a === 'run' ? 5.8 : 0;
        s.grounded = !(a === 'jump' || a === 'fall');
        s.vy = a === 'jump' ? 3 : a === 'fall' ? -3 : 0;
        s.carrying = a === 'carryMouth' ? 'salmon' : null;
        s.wiggle = a === 'caged' || a === 'grabbed' ? (Math.sin(t * 0.8) > 0 ? 1 : 0) : 0;
        s.face = a === 'grabbed' ? 'unimpressed' : a === 'sleep' || a === 'loaf' ? 'sleepy' : a === 'stunned' || a === 'fight' ? 'shock' : a === 'eat' ? 'happy' : a === 'climb' || a === 'dig' || a === 'type' ? 'focused' : a === 'hypnotized' ? 'love' : 'neutral';
        s.talk = a === 'knead' ? 'purr' : null;
        s.puffed = a === 'fight';
        if (a === 'tap') s.lookAt = camLook;
      },
    }));
    items.push({ label: 'noodle', fn: (s) => { s.anim = 'grabbed'; s.noodle = true; s.face = 'sleepy'; s.talk = 'purr'; } });
    items.push({ label: 'tossed', fn: (s, t) => { const ph = (t % 1.3); s.anim = 'fall'; s.tossed = ph < 0.9; s.grounded = ph >= 0.9; s.vy = 4.2 - ph * 9.3; s.face = 'shock'; } });
    items.push({ label: 'wet', fn: (s) => { s.anim = 'idle'; s.wet = 1; s.face = 'sad'; } });
    items.push({ label: 'puffed', fn: (s) => { s.anim = 'idle'; s.puffed = true; s.face = 'angry'; s.talk = 'hiss'; } });
    items.push({ label: 'high', fn: (s) => { s.anim = 'idle'; s.high = true; s.face = 'derp'; } });
    items.push({ label: 'jump loop', fn: (s, t) => { const ph = t % 1.2; s.grounded = ph > 0.8; s.vy = 4.8 - ph * 10; s.anim = s.grounded ? 'idle' : s.vy > 0 ? 'jump' : 'fall'; } });
    // pages of 8, a wall of floating cats seen at 3/4 (floor shadows still show the hops)
    const page = +(params.get('page') ?? -1);
    const list = page >= 0 ? items.slice(page * 8, page * 8 + 8) : items;
    const cols = page >= 0 ? 4 : 7;
    const yaw = +(params.get('yaw') ?? -0.6);
    grid(list, cols, page >= 0 ? 0.78 : 0.62, 0.62, (it, x, z) => {
      const c = addCell(look(preset), x, 0, it.label, it.fn, yaw);
      c.base.y = 1.2 - z; c.cat.root.position.y = c.base.y;
      const lab = group.children[group.children.length - 1] as CSS2DObject;
      lab.position.set(x, c.base.y - 0.06, 0.25);
    });
    camLook.set(-3, 1.6, 5);
    const rows = Math.ceil(list.length / cols);
    camera.position.set(0, 1.35, page >= 0 ? 3.7 : 4.4 + rows * 0.2);
    controls.target.set(0, 1.25, 0);
  } else if (name === 'patterns') {
    const keys = Object.keys(PRESETS);
    const extra: [string, Partial<CatLook>][] = [['tabby x tortie colors', { pattern: 'tabby', furColor: '#d9823b', secondaryColor: '#2e2622' }], ['calico pastel', { pattern: 'calico', furColor: '#f2b880', secondaryColor: '#8a8f99' }]];
    const items = [...keys.map((k) => [k, {}] as [string, Partial<CatLook>]), ...extra];
    grid(items, 6, 0.62, 0.8, ([k, ex], x, z, i) => addCell(look(i < keys.length ? k : 'orangeTabby', ex), x, z, k, (s, t) => { s.anim = 'idle'; s.face = 'neutral'; }, Math.sin(i) * 0.6));
    camera.position.set(0, 2.2, 3.4);
    controls.target.set(0, 0.1, 0);
  } else if (name === 'acc') {
    const items: CatAccessory[] = ['none', 'bell', 'bow', 'bandana', 'tinyHat', 'glasses', 'flowerCrown', 'cone'];
    grid(items, 4, 0.7, 0.8, (a, x, z, i) => addCell(look(Object.keys(PRESETS)[i % 10], { accessory: a }), x, z, a + (CAT_ACCESSORIES.includes(a) ? '' : ' (n/a)'), (s) => { s.anim = 'sit'; lookAtCam(s); }, -0.35));
    camLook.set(-1, 0.5, 6);
    camera.position.set(-0.6, 1.6, 2.6);
    controls.target.set(0, 0.15, 0);
  } else if (name === 'chonk') {
    [0, 0.5, 1].forEach((ch, i) => addCell(look(['ginger', 'greyTabby', 'tuxedo'][i], { chonk: ch }), (i - 1) * 0.6, 0, `chonk ${ch}`, (s) => { s.anim = 'idle'; }, -0.5));
    camera.position.set(0.4, 1, 1.9);
    controls.target.set(0, 0.15, 0);
  } else if (name === 'turn') {
    const c = addCell(look(preset, { accessory: (params.get('acc') as CatAccessory) ?? 'none' }), 0, 0, preset, (s, t) => {
      s.anim = (params.get('anim') as CatAnim) ?? 'idle'; s.face = (params.get('face') as CatFace) ?? 'neutral';
      s.speed = s.anim === 'walk' ? 2.5 : s.anim === 'run' ? 5.8 : 0;
    });
    if (params.has('yaw')) c.cat.root.rotation.y = +params.get('yaw')!; else c.spin = 0.6;
    camera.position.set(0, 0.55, 1.25);
    if (params.get('cam') === 'top') camera.position.set(0, 1.4, 0.15);
    if (params.get('cam') === 'game') camera.position.set(0, 1.25, 2.3);
    controls.target.set(0, 0.2, 0);
  } else if (name === 'hand') {
    const variants: [string, StateFn][] = [
      ['grabbed (limp)', (s) => { s.anim = 'grabbed'; s.face = 'unimpressed'; }],
      ['grabbed + wiggle', (s, t) => { s.anim = 'grabbed'; s.face = 'angry'; s.wiggle = Math.sin(t * 1.3) > -0.3 ? 1 : 0; }],
      ['noodle', (s) => { s.anim = 'grabbed'; s.noodle = true; s.face = 'sleepy'; s.talk = 'purr'; }],
    ];
    variants.forEach(([label, fn], i) => {
      const x = (i - 1) * 1.3;
      const c = addCell(look(['orangeTabby', 'tuxedo', 'calico'][i]), x, 0, label, fn);
      const sitter = createSitterModel({ name: 'S', skin: '#f1c7a5', hair: '#5a3b2a', shirt: '#e0785c' });
      sitter.root.position.set(x, 0, -0.6);
      scene.add(sitter.root);
      c.sitter = sitter;
      c.ss = { anim: 'carry', face: i === 2 ? 'happy' : 'neutral', speed: 0, vy: 0, grounded: true, carrying: true, flashlight: false, aimPitch: 0, lookAt: null };
    });
    const behind = params.get('side') === '1';
    camera.position.set(behind ? 2.8 : 0.5, behind ? 1.65 : 2.3, behind ? 0.2 : -3.4);
    controls.target.set(0, 0.95, 0.1);
  } else if (name === 'strip') {
    // one anim at n phases: cell k started k*step seconds before the freeze time (use with &freeze=)
    const anim = (params.get('anim') ?? 'tossed') as CatAnim | 'tossed' | 'noodle';
    const n = +(params.get('n') ?? 6), step = +(params.get('step') ?? 0.12), F = +(params.get('freeze') ?? 3);
    const yaw = +(params.get('yaw') ?? 1.2);
    for (let k = 0; k < n; k++) {
      const start = F - (k + 1) * step;
      addCell(look(preset, { accessory: (params.get('acc') as CatAccessory) ?? 'none' }), (k - (n - 1) / 2) * 0.62, 0, `+${((k + 1) * step).toFixed(2)}s`, (st, tt) => {
        const at = tt - start;
        if (at < 0) { st.anim = 'idle'; return; }
        if (anim === 'tossed') {
          const vy0 = 4.2, v = vy0 - 10 * at;
          st.tossed = v > -vy0; st.grounded = !st.tossed; st.vy = st.tossed ? v : 0; st.anim = st.tossed ? 'fall' : 'idle'; st.speed = 0; st.face = 'shock';
          const c = cells[k]; if (c) c.cat.root.position.y = st.tossed ? Math.max(0, vy0 * at - 5 * at * at) : 0;
        } else if (anim === 'noodle') { st.anim = 'grabbed'; st.noodle = true; st.talk = 'purr'; }
        else { st.anim = anim; st.face = (params.get('face') as CatFace) ?? 'neutral'; st.wiggle = +(params.get('wiggle') ?? 0); st.pounceCharge = 0.8; st.lookAt = camLook; }
      }, yaw);
    }
    camLook.set(0, 1.0, 5);
    camera.position.set(0, 1.0, 0.75 * n);
    controls.target.set(0, 0.4, 0);
  } else if (name === 'coats') {
    // the menu's coat presets x every pattern (what players can actually pick)
    const pats: FurPattern[] = ['solid', 'tabby', 'tuxedo', 'calico', 'siamese', 'tortie'];
    COAT_PRESETS.forEach((coat, ci) => pats.forEach((pat, pi) => {
      const x = (ci - 3) * 0.5;
      const c = addCell({ name: `${coat.name}-${pat}`, pattern: pat, furColor: coat.fur, secondaryColor: coat.sec, eyeColor: ['#8fd06b', '#f2c14e', '#5fa8e8', '#e08a3a'][(ci + pi) % 4], accessory: 'none', chonk: 0.2 }, x, 0, ci === 0 ? pat : '', (st) => { st.anim = 'sit'; st.lookAt = camLook; }, -0.35);
      c.base.y = (5 - pi) * 0.45; c.cat.root.position.y = c.base.y;
      const lab = group.children[group.children.length - 1] as CSS2DObject; lab.position.set(x - 0.32, c.base.y + 0.12, 0);
    }));
    camLook.set(0, 1.4, 6);
    camera.position.set(0, 1.25, 5.6);
    controls.target.set(0, 1.2, 0);
  } else if (name === 'scout') {
    // raw accessory candidates, normalized to 0.3 m
    const files = (params.get('files') ?? 'tophat,tophat2,bowtie,bell,collar,flowerA,flowerB,funnel1,funnel2,funnel3,funnel4,glasses').split(',');
    const gl = new GLTFLoader();
    files.forEach((f, i) => gl.load(`/models/accessories/${f}.glb`, (g) => {
      const o = g.scene;
      const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3());
      const k = 0.3 / Math.max(size.x, size.y, size.z);
      o.scale.setScalar(k);
      const c = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
      const x = (i % 6 - 2.5) * 0.45, z = Math.floor(i / 6) * 0.6;
      o.position.set(x - c.x, 0.2 - c.y, z - c.z);
      group.add(o);
      const div = document.createElement('div'); div.className = 'lbl'; div.textContent = `${f} ${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}`;
      const lab = new CSS2DObject(div); lab.position.set(x, 0.0, z + 0.2); group.add(lab);
    }));
    camera.position.set(0, 1.1, 2.6);
    controls.target.set(0, 0.2, 0.3);
  } else if (name === 'game') {
    // gameplay distance: one cat running a loop, one loafing, one meowing
    const a = addCell(look('orangeTabby'), 0, 0, '', (s, t) => {
      const ang = t * 0.9;
      s.speed = Math.sin(t * 0.3) > 0 ? 3.2 : 5.8; s.anim = s.speed > 4 ? 'run' : 'walk';
      a.cat.root.position.set(Math.cos(ang) * 1.6, 0, Math.sin(ang) * 1.6);
      a.cat.root.rotation.y = -ang + Math.PI;
    });
    addCell(look('tuxedo'), -0.6, 0.4, '', (s, t) => { s.anim = 'idle'; s.talk = Math.sin(t * 2) > 0.7 ? 'meow' : null; s.lookAt = camLook; });
    addCell(look('siamese'), 0.7, -0.3, '', (s) => { s.anim = 'loaf'; s.face = 'sleepy'; });
    addCell(look('calico'), 0.2, 0.9, '', (s, t) => { s.anim = 'pounceCharge'; s.face = 'focused'; s.pounceCharge = (t % 1.5) / 1.5; });
    camLook.copy(camera.position);
    camera.position.set(0, 1.5, 3.4);
    controls.target.set(0, 0.2, 0);
  }
  controls.update();
}

// ---------------------------------------------------------------- loop
let t = 0, last = performance.now(), frames = 0, fpsT = 0;
const _w = new THREE.Vector3(), _v = new THREE.Vector3();
const freeze = params.has('freeze') ? +params.get('freeze')! : -1;
function frame(now: number) {
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (freeze >= 0) {
    // deterministic: step at 60 Hz up to the freeze time, then hold
    if (t >= freeze) { renderer.render(scene, camera); labels.render(scene, camera); requestAnimationFrame(frame); return; }
    dt = 1 / 60;
    while (t + dt < freeze) { t += dt; stepCells(dt); }
  }
  t += dt;
  stepCells(dt);
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
  frames++; fpsT += dt;
  if (fpsT > 1) { const el = document.getElementById('fps'); if (el) el.textContent = `${Math.round(frames / fpsT)} fps`; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
function stepCells(dt: number) {
  if (camLook.lengthSq() === 0) camLook.copy(camera.position);
  for (const c of cells) {
    const s = c.s;
    Object.assign(s, baseState());
    s.dizzy = false; s.pounceCharge = 0; s.wiggle = 0; s.carrying = null; s.noodle = false; s.tossed = false;
    c.fn(s, t);
    if (c.spin) c.cat.root.rotation.y = t * c.spin;
    c.cat.update(dt, s);
    if (c.sitter && c.ss) {
      c.sitter.update(dt, c.ss);
      c.sitter.root.updateMatrixWorld(true);
      c.sitter.holdAnchor.getWorldPosition(_w);
      c.cat.root.rotation.y = c.sitter.root.rotation.y + Math.PI;
      c.cat.root.position.set(0, 0, 0);
      c.cat.root.updateMatrixWorld(true);
      c.cat.scruffAnchor.getWorldPosition(_v);
      c.cat.root.position.copy(_w).sub(_v);
    }
  }
}

loadAssets().then(() => {
  view(params.get('view') ?? 'faces');
  (window as unknown as Record<string, unknown>).__cat = { view, cells: () => cells, camera, controls, ready: true };
  requestAnimationFrame(frame);
}).catch((e) => { hud.textContent = String(e); console.error(e); });
