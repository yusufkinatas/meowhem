/**
 * World visuals preview (dev only): a mini house built from the real downloaded models, driven by
 * createWorldVisuals(). URL: ?cam=<preset>&set=key:value,key:value&t=<seconds to simulate>&panel=0
 * window.__vis = { set(key, value), cam(name), step(seconds), refs, keys }
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadAssets, cloneModel, hasModel } from '../src/assets/loader';
import { createWorldVisuals } from '../src/world/visuals';
import type { LevelRefs, RefKey } from '../src/world/refs';
import type { RoomDef, Spot, SpotId, WorldVisualValue } from '../src/shared/contracts';
import { createCatTv } from '../src/tv/catTv';
import { createProp, createMess } from '../src/models/props';

const P = new URLSearchParams(location.search);
const hud = document.getElementById('hud')!;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f4e4cc');
const hemi = new THREE.HemisphereLight('#fff3df', '#b88f6c', 1.7);
const sun = new THREE.DirectionalLight('#ffe1b5', 2.4);
sun.position.set(-6, 14, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 9, bottom: -9, near: 1, far: 40 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.05;
scene.add(hemi, sun);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.03, 80);
camera.position.set(0, 12, 12);
const controls = new OrbitControls(camera, renderer.domElement);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// ---------------------------------------------------------------- mini house (architecture is procedural, objects are models)
const ROOMS: RoomDef[] = [
  { id: 'living', name: 'Living room', min: [-8, 0, -6], max: [0, 2.6, 0] },
  { id: 'kitchen', name: 'Kitchen', min: [-8, 0, 0], max: [-2, 2.6, 5] },
  { id: 'office', name: 'Office', min: [-2, 0, 0], max: [0, 2.6, 5] },
  { id: 'hallway', name: 'Hallway', min: [0, 0, -6], max: [2.5, 2.6, 5] },
  { id: 'bathroom', name: 'Bathroom', min: [2.5, 0, -6], max: [7, 2.6, -1] },
  { id: 'bedroom', name: 'Bedroom', min: [2.5, 0, -1], max: [7, 2.6, 5] },
];

function arch(): THREE.Group {
  const g = new THREE.Group();
  const floorMat = new THREE.MeshStandardMaterial({ color: '#d9a66b', roughness: 0.8 });
  const tile = new THREE.MeshStandardMaterial({ color: '#dfe7e4', roughness: 0.6 });
  const wall = new THREE.MeshStandardMaterial({ color: '#f1e3cf', roughness: 0.9 });
  for (const r of ROOMS) {
    const w = r.max[0] - r.min[0], d = r.max[2] - r.min[2];
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), r.id === 'bathroom' ? tile : floorMat);
    f.rotation.x = -Math.PI / 2;
    f.position.set(r.min[0] + w / 2, 0, r.min[2] + d / 2);
    f.receiveShadow = true;
    g.add(f);
  }
  const box = (x: number, z: number, w: number, d: number, h = 2.6) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
    m.position.set(x, h / 2, z);
    m.receiveShadow = true;
    g.add(m);
  };
  box(-4, -6.05, 8, 0.1, 0.6); box(-4, -6.05, 8, 0.1, 0.6); // low back wall (window sill height)
  box(-8.05, -0.5, 0.1, 11, 1.2);
  box(4.75, -6.05, 4.5, 0.1, 1.2);
  box(2.55, -3.6, 0.1, 4.8, 1.2);
  box(2.55, 3.05, 0.1, 3.9, 1.2);
  // living-room ceiling seen from below (headlight sweep target), only drawn from below
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), new THREE.MeshStandardMaterial({ color: '#fbf3e6', side: THREE.FrontSide }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(-4, 2.6, -3);
  ceil.name = 'ceiling';
  ceil.visible = P.get('ceil') === '1';
  g.add(ceil);
  return g;
}

const PLACE: [RefKey, string, [number, number, number], number][] = [
  ['livingWindow', 'window', [-4.5, 0.62, -5.95], 0],
  ['curtains', 'curtains', [-4.5, 0, -5.8], 0],
  ['sofa', 'sofa', [-4.3, 0, -2.6], -Math.PI / 2],
  ['tv', 'tv', [-7.45, 0.55, -2.6], Math.PI / 2],
  ['livingRug', 'rug', [-5.9, 0, -2.6], Math.PI / 2],
  ['aquarium', 'aquarium', [-1.6, 0.55, -5.55], 0],
  ['catTree', 'catTree', [-0.8, 0, -1.2], -Math.PI / 4],
  ['bigPlant', 'plant', [-7.3, 0, -5.3], 0],
  ['fridge', 'fridge', [-7.5, 0, 1.6], Math.PI / 2],
  ['stove', 'stove', [-7.6, 0, 3.0], Math.PI / 2],
  ['foodBowl', 'foodBowl', [-5.2, 0, 1.2], 0],
  ['carrier', 'carrier', [-4.2, 0, 1.8], 0],
  ['laptop', 'laptop', [-1.0, 0.75, 3.0], Math.PI],
  ['frontDoor', 'frontDoor', [1.25, 0, 4.95], Math.PI],
  ['fuseBox', 'fuseBox', [2.44, 1.3, 3.2], -Math.PI / 2],
  ['bathtub', 'bathtub', [6.3, 0, -4.9], 0],
  ['tpHolder', 'tpHolder', [3.4, 0.7, -5.95], 0],
  ['litterBox', 'litterBox', [4.0, 0, -2.2], 0],
  ['bathroomDoor', 'door', [2.55, 0, -0.7], Math.PI / 2],
  ['bed', 'bed', [5.4, 0, 3.6], Math.PI],
  ['bedPillow', 'pillow', [5.0, 0.73, 4.25], Math.PI],
  ['laundryBasket', 'laundryBasket', [3.2, 0, 4.4], 0],
  ['bedroomRug', 'rugRound', [5.2, 0, 1.0], 0],
  ['bedroomDoor', 'door', [2.55, 0, 0.6], Math.PI / 2],
  ['officeDoor', 'door', [-1.0, 0, 0.05], 0],
];
const EXTRA: [string, [number, number, number], number][] = [
  ['tvStand', [-7.55, 0, -2.6], Math.PI / 2], ['desk', [-1.0, 0, 3.0], Math.PI], ['tvStand', [-1.6, 0, -5.55], 0],
  ['floorLamp', [-7.2, 0, -0.8], 0], ['counter', [-5.6, 0, 4.6], Math.PI], ['bathSink', [5.2, 0, -5.6], 0],
];

const SPOTS: [SpotId, [number, number, number], number, RoomDef['id']][] = [
  ['frontDoor', [1.25, 0, 4.3], 0, 'hallway'], ['window', [-4.5, 0, -5.4], Math.PI, 'living'], ['tubFaucet', [6.3, 0, -3.8], Math.PI, 'bathroom'], ['hideout', [5.2, 0, 2.2], 0, 'bedroom'],
];

async function main() {
  await loadAssets((p) => { hud.textContent = `loading ${Math.round(p * 100)}%`; });
  const group = new THREE.Group();
  group.add(arch());
  scene.add(group);
  const objects = new Map<RefKey, THREE.Object3D>();
  for (const [ref, key, p, yaw] of PLACE) {
    if (!hasModel(key)) { console.warn('missing model', key); continue; }
    const o = cloneModel(key);
    o.position.set(...p);
    o.rotation.y = yaw;
    group.add(o);
    objects.set(ref, o);
  }
  for (const [key, p, yaw] of EXTRA) {
    if (!hasModel(key)) continue;
    const o = cloneModel(key);
    o.position.set(...p);
    o.rotation.y = yaw;
    group.add(o);
  }
  // props + mess (props.ts check)
  const pm: [THREE.Object3D, [number, number, number]][] = [
    [createProp('mug'), [-5.2, 0.05, 4.4]], [createProp('vase'), [-5.6, 1.07, 4.5]], [createProp('book'), [-6.0, 1.02, 4.5]],
    [createMess('poop'), [-3.0, 0, 3.0]], [createMess('fish'), [-3.4, 0, 3.0]], [createMess('tp'), [-3.0, 0, 3.6]], [createMess('shards'), [-3.6, 0, 3.6]],
    [createMess('puddle'), [-4.2, 0, 3.6]], [createMess('hairball'), [-4.2, 0, 3.0]],
  ];
  for (const [o, p] of pm) { o.position.set(...p); group.add(o); }

  // lamps + house lights as the layout would provide them
  const lampMeshes: THREE.Mesh[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.parent && /lamp/i.test(String(m.parent.name) + String(findFile(m)))) lampMeshes.push(m);
  });
  const houseLights: THREE.Light[] = [];
  for (const r of ROOMS) {
    const l = new THREE.PointLight('#ffd9a0', 4, 7, 1.6);
    l.position.set((r.min[0] + r.max[0]) / 2, 2.3, (r.min[2] + r.max[2]) / 2);
    group.add(l);
    houseLights.push(l);
  }
  const spots = new Map<SpotId, Spot>();
  for (const [id, pos, facing, room] of SPOTS) spots.set(id, { id, pos, facing, room, radius: 0.8 });

  const refs: LevelRefs = { group, objects, spots, rooms: ROOMS, floorY: 0, lampMeshes, houseLights };
  const vis = createWorldVisuals(refs);
  const tv = createCatTv();
  vis.setTvTexture(tv.texture);

  // ---------------------------------------------------------------- panel
  type Spec = [string, 'bool' | 'num' | 'enum', number | string[]];
  const KEYS: Spec[] = [
    ['lights', 'bool', 0], ['fuse.flipped', 'bool', 0], ['time.dusk', 'num', 1], ['owners.headlights', 'bool', 0],
    ['tub.running', 'bool', 0], ['tub.water', 'num', 1], ['flood', 'num', 1],
    ['tp.unrolled', 'num', 1], ['tp.avalanche', 'bool', 0], ['litter.fill', 'num', 1], ['litter.stink', 'bool', 0],
    ['sofa.shred', 'num', 3], ['tank.fish', 'num', 3], ['curtains.climb', 'num', 1], ['curtains.down', 'bool', 0],
    ['plant.dug', 'num', 1], ['window.birds', 'bool', 0], ['window.smudges', 'num', 8], ['tv.on', 'bool', 0],
    ['laptop.screen', 'enum', ['off', 'idle', 'hacking', 'ordered']], ['laptop.progress', 'num', 1],
    ['pillow.knead', 'num', 1], ['carrier.closed', 'bool', 0], ['carrier.occupied', 'bool', 0],
    ['foodBowl.fill', 'num', 1], ['foodBowl.shaken', 'bool', 0], ['frontDoor.open', 'num', 1],
    ['laptop.order', 'enum', ['catnip', 'wetFood']], ['done.salmon', 'bool', 0],
  ];
  const state: Record<string, WorldVisualValue> = { lights: true, 'foodBowl.fill': 1, 'laptop.screen': 'idle', 'laptop.order': 'catnip' };
  const panel = document.getElementById('panel')!;
  if (P.get('panel') === '0') panel.classList.add('hide');
  const set = (k: string, v: WorldVisualValue) => {
    state[k] = v;
    vis.setVisual(k, v);
    if (k === 'tv.on') tv.setOn(!!v);
    const lightsOn = state.lights !== false;
    hemi.intensity = 1.7 * (lightsOn ? 1 : 0.15);
    sun.intensity = 2.4 * (lightsOn ? 1 : 0.1);
    const d = Number(state['time.dusk'] ?? 0);
    sun.color.set('#fff3df').lerp(new THREE.Color('#ffae6b'), d);
    hemi.color.set('#dfe9ff').lerp(new THREE.Color('#ffcfa8'), d);
    sync();
  };
  const camSel = document.createElement('select');
  const controlsUi: Record<string, HTMLInputElement | HTMLSelectElement> = {};
  const sync = () => {
    for (const [k] of KEYS) {
      const el = controlsUi[k];
      if (!el) continue;
      const v = state[k];
      if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = !!v;
      else el.value = String(v ?? (el instanceof HTMLSelectElement ? 'off' : 0));
    }
  };
  panel.append(camSel);
  for (const [k, kind, arg] of KEYS) {
    const row = document.createElement('label');
    row.className = 'row';
    const name = document.createElement('span');
    name.textContent = k;
    row.append(name);
    if (kind === 'bool') {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.onchange = () => set(k, cb.checked);
      row.append(cb);
      controlsUi[k] = cb;
    } else if (kind === 'num') {
      const r = document.createElement('input');
      r.type = 'range'; r.min = '0'; r.max = String(arg); r.step = arg === 1 ? '0.05' : '1';
      const b = document.createElement('b');
      r.oninput = () => { b.textContent = r.value; set(k, Number(r.value)); };
      row.append(r, b);
      controlsUi[k] = r;
    } else {
      const s = document.createElement('select');
      for (const o of arg as string[]) s.append(new Option(o, o));
      s.onchange = () => set(k, s.value);
      row.append(s);
      controlsUi[k] = s;
    }
    panel.append(row);
  }

  // ---------------------------------------------------------------- cameras
  const CAMS: Record<string, [THREE.Vector3Tuple, THREE.Vector3Tuple]> = {
    overview: [[-1, 13, 10], [-0.5, 0, -0.5]],
    living: [[-1.5, 3.2, 1.5], [-4.5, 0.8, -3.5]],
    sofa: [[-6.3, 1.4, -2.6], [-4.3, 0.4, -2.6]],
    tv: [[-5.6, 1.3, -2.6], [-7.4, 0.9, -2.6]],
    aquarium: [[-1.6, 1.4, -4.1], [-1.6, 0.85, -5.55]],
    window: [[-4.5, 1.2, -4.2], [-4.5, 0.9, -5.95]],
    curtains: [[-4.5, 1.5, -2.6], [-4.5, 1.1, -5.8]],
    plant: [[-6.3, 1.6, -4.3], [-7.3, 0.6, -5.3]],
    catTree: [[-0.8, 0.6, 0.1], [-0.8, 0.25, -1.2]],
    kitchen: [[-4.0, 2.2, 0.0], [-6.8, 0.8, 2.2]],
    fridge: [[-6.6, 1.35, 1.6], [-7.3, 1.3, 1.6]],
    stove: [[-6.4, 0.9, 3.0], [-7.6, 0.45, 3.0]],
    bowl: [[-5.2, 0.45, 1.65], [-5.2, 0.02, 1.2]],
    carrier: [[-4.2, 1.1, 2.9], [-4.2, 0.25, 1.8]],
    laptop: [[-1.0, 1.12, 2.45], [-1.0, 0.86, 3.0]],
    hallway: [[1.2, 1.7, -2.0], [1.25, 0.8, 4.0]],
    frontDoor: [[1.2, 1.5, 2.6], [1.25, 1.0, 4.9]],
    fuse: [[1.6, 1.55, 3.2], [2.44, 1.5, 3.2]],
    bathroom: [[3.2, 2.4, -1.4], [5.4, 0.4, -4.3]],
    tub: [[5.2, 1.5, -3.6], [6.3, 0.6, -4.8]],
    tp: [[4.2, 1.4, -4.3], [3.4, 0.25, -5.6]],
    fuseClose: [[2.0, 1.45, 3.2], [2.44, 1.42, 3.2]],
    litter: [[4.0, 0.9, -1.5], [4.0, 0.05, -2.2]],
    bedroom: [[3.4, 2.0, -0.2], [5.2, 0.6, 3.2]],
    pillow: [[5.0, 1.4, 3.3], [5.0, 0.75, 4.2]],
    doors: [[1.6, 0.6, 0.3], [2.55, 0.2, 0.3]],
    tree: [[-0.4, 0.55, -0.5], [-0.75, 0.05, -1.05]],
    ceilUp: [[-4.0, 0.6, -1.0], [-4.0, 2.6, -3.5]],
    birds: [[-4.45, 0.95, -5.0], [-4.45, 0.75, -6.1]],
    tank: [[-1.6, 0.95, -4.8], [-1.6, 0.85, -5.55]],
    hideout: [[4.2, 0.9, 1.2], [5.2, 0.0, 2.2]],
    mess: [[-3.5, 0.9, 4.6], [-3.6, 0.0, 3.3]],
    bowlFar: [[-5.2, 0.9, 2.4], [-5.2, 0.0, 1.2]],
    doorsBack: [[3.6, 0.8, 0.0], [2.55, 0.3, 0.0]],
    office: [[-1.0, 0.6, -0.9], [-1.0, 0.3, 0.05]],
  };
  for (const k of Object.keys(CAMS)) camSel.append(new Option(k, k));
  const cam = (name: string) => {
    const c = CAMS[name];
    if (!c) return;
    camera.position.set(...c[0]);
    controls.target.set(...c[1]);
    controls.update();
    camSel.value = name;
  };
  camSel.onchange = () => cam(camSel.value);

  // ---------------------------------------------------------------- loop
  let prev = performance.now();
  let time = 0;
  const step = (dt: number) => { time += dt; vis.update(dt, time); tv.update(dt); };
  const frame = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    if (!freeze) step(dt);
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  for (const k of Object.keys(state)) set(k, state[k]);
  for (const kv of (P.get('set') ?? '').split(',').filter(Boolean)) {
    const [k, raw] = kv.split(':');
    const v: WorldVisualValue = raw === 'true' ? true : raw === 'false' ? false : isNaN(Number(raw)) ? raw : Number(raw);
    set(k, v);
  }
  cam(P.get('cam') ?? 'overview');
  const freeze = P.get('freeze') === '1';
  const pre = Number(P.get('t') ?? 0);
  for (let s = 0; s < pre; s += 1 / 30) step(1 / 30);
  hud.textContent = 'world visuals';
  (window as unknown as { __vis: unknown }).__vis = { set, cam, step, refs, state, scene, camera, controls };
  frame();
}

function findFile(o: THREE.Object3D): string {
  let p: THREE.Object3D | null = o;
  while (p) { if (/\.glb$/.test(p.name)) return p.name; p = p.parent; }
  return '';
}

main().catch((e) => { hud.textContent = String(e); console.error(e); });
