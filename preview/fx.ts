/**
 * FX + mess decal preview. Dev only.
 *   /preview/fx.html                  interactive: buttons spawn FX on the stand-in
 *   /preview/fx.html?view=grid        every FX frozen at a readable moment
 *   /preview/fx.html?view=decals      every mess decal on the floor
 *   /preview/fx.html?shot=fightCloud&t=1.2   one FX frozen at t seconds
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { FxKind, FxOptions, MessKind } from '../src/shared/contracts';
import { toon, toonMesh } from '../src/shared/toon';
import { createFx } from '../src/fx/fx';
import { createMessDecal } from '../src/fx/messDecals';

const KINDS: FxKind[] = ['shatter', 'dust', 'fightCloud', 'stink', 'sparkle', 'splash', 'spray', 'hearts', 'zzz', 'question', 'exclaim', 'confetti',
  'furPoof', 'catnipHaze', 'poof', 'stars', 'tpBurst', 'scratchMarks', 'noteMusic', 'anger', 'sweat', 'ding'];
const MESS: MessKind[] = ['puddle', 'shards', 'fur', 'soil', 'litter', 'catnip', 'food', 'tp', 'hairball', 'poop', 'fish'];
const HEAD = new Set<FxKind>(['zzz', 'question', 'exclaim', 'stars', 'hearts', 'anger', 'sweat', 'noteMusic', 'ding', 'sparkle']);
const HERO: Record<FxKind, number> = { shatter: 0.16, dust: 0.2, fightCloud: 1.2, stink: 1.7, sparkle: 0.28, splash: 0.18, spray: 0.4, hearts: 0.7, zzz: 1.7,
  question: 0.6, exclaim: 0.6, confetti: 0.55, furPoof: 0.3, catnipHaze: 1.5, poof: 0.14, stars: 0.8, tpBurst: 0.55, scratchMarks: 0.35, noteMusic: 0.8,
  anger: 0.6, sweat: 0.45, ding: 0.18 };
const DUR: Partial<Record<FxKind, number>> = { fightCloud: 4, stink: 4, zzz: 4, catnipHaze: 4, stars: 2.5 };

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? (q.get('shot') ? 'shot' : 'live');

// ---------------------------------------------------------------- scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f3e6d3');
scene.add(new THREE.HemisphereLight('#fff4e0', '#b08a6a', 1.6));
const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
sun.position.set(4, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
scene.add(sun);

const planks = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = ['#d9a66b', '#d29d61', '#ddab72', '#cf9a5f'][i % 4];
    g.fillRect(0, i * 64, 512, 64);
    g.fillStyle = 'rgba(90,55,30,.35)';
    g.fillRect(0, i * 64, 512, 3);
    g.fillRect(((i * 197) % 512), i * 64, 3, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 8);
  t.anisotropy = 8;
  return t;
})();
const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24).rotateX(-Math.PI / 2), toon('#ffffff', { map: planks }));
floor.receiveShadow = true;
scene.add(floor);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 2.6), toon('#efe1c8'));
wall.position.set(0, 1.3, -4);
scene.add(wall);

// preview-only stand-in for a cat (0.45 m tall); the game uses the downloaded cat model
const dummy = new THREE.Group();
const body = toonMesh(new THREE.CapsuleGeometry(0.14, 0.12, 6, 16), '#c9d6c0', 0.01);
body.position.y = 0.28;
dummy.add(body);
scene.add(dummy);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 100);
const controls = new OrbitControls(camera, renderer.domElement);
camera.position.set(0, 1.5, 3.2);
controls.target.set(0, 0.4, 0);
controls.update();

const fx = createFx(scene);

// ---------------------------------------------------------------- labels
const labels: { el: HTMLDivElement; p: THREE.Vector3 }[] = [];
function label(text: string, p: THREE.Vector3) {
  const el = document.createElement('div');
  el.className = 'lbl';
  el.textContent = text;
  document.body.appendChild(el);
  labels.push({ el, p });
}
const tmp = new THREE.Vector3();
function placeLabels() {
  for (const l of labels) {
    tmp.copy(l.p).project(camera);
    l.el.style.left = `${(tmp.x * 0.5 + 0.5) * innerWidth}px`;
    l.el.style.top = `${(-tmp.y * 0.5 + 0.5) * innerHeight}px`;
  }
}

// ---------------------------------------------------------------- spawning
function optsFor(kind: FxKind, follow?: THREE.Object3D): FxOptions {
  const o: FxOptions = { duration: DUR[kind], follow };
  if (kind === 'spray') o.dir = new THREE.Vector3(0.15, -0.12, -1).normalize();
  if (kind === 'shatter' || kind === 'splash') o.follow = undefined;
  return o;
}
function spawnAt(kind: FxKind, base: THREE.Vector3, follow?: THREE.Object3D) {
  const p = base.clone();
  if (HEAD.has(kind)) p.y += 0.45;
  if (kind === 'spray') p.add(new THREE.Vector3(0, 1.0, 1.4));
  fx.spawn(kind, p, optsFor(kind, follow));
}
function step(t: number) {
  camera.updateMatrixWorld();
  for (let n = Math.round(t * 60); n > 0; n--) fx.update(1 / 60, camera);
}
/** spawn entries so each one is at its own hero time when we stop */
function stage(list: { kind: FxKind; pos: THREE.Vector3; t: number }[]) {
  list.sort((a, b) => b.t - a.t);
  list.forEach((e, i) => { spawnAt(e.kind, e.pos); step(e.t - (list[i + 1]?.t ?? 0)); });
}

let paused = false;
if (view === 'grid') {
  dummy.visible = false;
  const cols = 6, sp = 1.5;
  const list = KINDS.map((kind, i) => {
    const pos = new THREE.Vector3(((i % cols) - (cols - 1) / 2) * sp, 0, Math.floor(i / cols) * sp - 2.4);
    label(kind, pos.clone().add(new THREE.Vector3(0, -0.12, 0.1)));
    return { kind, pos, t: HERO[kind] };
  });
  camera.position.set(0, 4.6, 5.4);
  controls.target.set(0, 0, -0.4);
  controls.update();
  for (const [i, s] of ['EYE CONTACT', 'MEOW', '+6%'].entries()) fx.text(s, new THREE.Vector3((i - 1) * 2.4, 0.6, 3), { color: ['#ffd23f', '#ffffff', '#8be07a'][i], duration: 10 });
  stage(list);
  paused = true;
} else if (view === 'decals') {
  dummy.visible = false;
  MESS.forEach((k, i) => {
    const pos = new THREE.Vector3(((i % 4) - 1.5) * 1.0, 0, Math.floor(i / 4) * 0.95 - 1);
    const d = createMessDecal(k);
    d.position.copy(pos);
    scene.add(d);
    label(k, pos.clone().add(new THREE.Vector3(0, 0, 0.42)));
  });
  const c = (q.get('cam') ?? '0,2.2,3.2').split(',').map(Number);
  camera.position.set(c[0], c[1], c[2]);
  controls.target.set(c[0] * 0.8, 0, c[2] - 2.2);
  controls.update();
} else if (view === 'shot') {
  const kind = q.get('shot') as FxKind;
  dummy.visible = HEAD.has(kind) || kind === 'stink' || kind === 'catnipHaze';
  if (q.get('cam') === 'far') { camera.position.set(0, 2.6, 6.5); controls.update(); }
  if (q.get('cam') === 'side') { camera.position.set(3.2, 1.3, 0.6); controls.target.set(0, 0.6, 0.4); controls.update(); }
  spawnAt(kind, new THREE.Vector3(), dummy);
  step(Number(q.get('t') ?? HERO[kind]));
  paused = true;
} else {
  const ui = document.getElementById('ui')!;
  const move = document.createElement('label');
  move.innerHTML = '<input type="checkbox" id="mv"> moving target';
  ui.appendChild(move);
  for (const k of KINDS) {
    const b = document.createElement('button');
    b.textContent = k;
    b.onclick = () => spawnAt(k, dummy.position, dummy);
    ui.appendChild(b);
  }
  const texts: [string, string][] = [['EYE CONTACT', '#ffd23f'], ['MEOW', '#ffffff'], ['+6%', '#8be07a'], ['mrrp', '#ffffff']];
  for (const [s, c] of texts) {
    const b = document.createElement('button');
    b.textContent = `"${s}"`;
    b.onclick = () => fx.text(s, dummy.position.clone().setY(0.6), { color: c, follow: dummy });
    ui.appendChild(b);
  }
  MESS.forEach((k, i) => {
    const d = createMessDecal(k);
    d.position.set((i - 5) * 0.9, 0, 1.8);
    scene.add(d);
  });
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let t = 0;
function frame() {
  const dt = clock.getDelta();
  if (!paused) {
    t += dt;
    const mv = (document.getElementById('mv') as HTMLInputElement | null)?.checked;
    if (mv) dummy.position.set(Math.sin(t * 1.2) * 1.2, 0, Math.cos(t * 1.2) * 1.2 - 0.5);
    fx.update(dt, camera);
  }
  controls.update();
  renderer.render(scene, camera);
  placeLabels();
  requestAnimationFrame(frame);
}
frame();
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
(window as unknown as { fxReady: boolean }).fxReady = true;
