// Final asset gallery: every manifest model through src/assets/loader at true relative scale, plus a room mock.
// URL: ?only=mug,glass&w=2 (ad-hoc block, view=only)  ?view=room|room2|room3|chars|living|kitchen|bathroom|bedroom|office|hallway|decor|props|mess|cands|other|clips
//      &labels=0  &outline=0 (character outlines)  &angle=front|iso|top|low
// Console: setView('kitchen'), window.report (keys + sizes)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadAssets, cloneModel, hasModel, modelInfo, getClips } from '../src/assets/loader';
import { toon, OUTLINE_COLOR } from '../src/shared/toon';

const params = new URLSearchParams(location.search);
const hud = document.getElementById('hud')!;

const ROOMS: [string, string, string[]][] = [
  ['chars', 'Characters', ['sitter', 'cat', 'bird']],
  ['living', 'Living room', ['sofa', 'armchair', 'coffeeTable', 'tvStand', 'tv', 'bookshelf', 'wallShelf', 'shelf', 'rug', 'rugRound', 'plant', 'plantTall', 'plantSmall', 'sideTable', 'floorLamp', 'curtains', 'window', 'aquarium', 'catTree', 'wallFrame']],
  ['kitchen', 'Kitchen', ['counter', 'counterCorner', 'kitchenSink', 'stove', 'fridge', 'wallCabinet', 'extractorHood', 'cuttingBoard', 'diningTable', 'chair', 'foodBowl', 'foodBowlEmpty', 'carrier']],
  ['bathroom', 'Bathroom', ['bathtub', 'toilet', 'bathSink', 'mirror', 'washer', 'litterBox', 'tpHolder', 'bathMat']],
  ['bedroom', 'Bedroom', ['bed', 'nightstand', 'wardrobe', 'laundryBasket']],
  ['office', 'Office', ['desk', 'officeChair', 'laptop']],
  ['hallway', 'Hallway', ['door', 'frontDoor', 'shoeRack', 'coatRack', 'fuseBox', 'doormat']],
];

// ---------------------------------------------------------------- scene
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
document.body.appendChild(labels.domElement);
if (params.get('labels') === '0') labels.domElement.style.display = 'none';

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f3e6d3');
scene.add(new THREE.HemisphereLight('#fff1dc', '#9c7650', 1.5));
const sun = new THREE.DirectionalLight('#ffe9cc', 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), toon('#d9a066'));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.03, 300);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
});

function label(html: string, cls: string, pos: THREE.Vector3, parent: THREE.Object3D): void {
  const el = document.createElement('div');
  el.className = cls;
  el.innerHTML = html;
  const o = new CSS2DObject(el);
  o.position.copy(pos);
  parent.add(o);
}

// ---------------------------------------------------------------- character outline (preview-only)
// Inverted hull with merged smooth normals (Kenney cubes have split normals that crack the shell).
// Uses `normal`, not `objectNormal`, so it compiles on static meshes too.
const outlineMat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
outlineMat.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * 0.012;');
};
function outline(root: THREE.Object3D, thickness: number): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  for (const mesh of meshes) {
    const g = mesh.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'skinIndex' && k !== 'skinWeight') g.deleteAttribute(k);
    const smooth = mergeVertices(g, 1e-4);
    smooth.computeVertexNormals();
    // scale the 0.012 m shell to the mesh's world scale
    const s = new THREE.Vector3();
    mesh.getWorldScale(s);
    const m = outlineMat.clone();
    const t = thickness / Math.max(s.x, 1e-6);
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normalize(normal) * ${t.toFixed(6)};`);
    };
    m.customProgramCacheKey = () => `ol${t.toFixed(6)}`;
    const sk = mesh as THREE.SkinnedMesh;
    let shell: THREE.Mesh;
    if (sk.isSkinnedMesh) {
      const s2 = new THREE.SkinnedMesh(smooth, m);
      s2.bind(sk.skeleton, sk.bindMatrix);
      shell = s2;
    } else shell = new THREE.Mesh(smooth, m);
    shell.raycast = () => {};
    mesh.add(shell);
  }
}

// ---------------------------------------------------------------- helpers
const mixers: THREE.AnimationMixer[] = [];
function spawn(key: string, anim?: string): THREE.Group {
  const g = cloneModel(key);
  const clips = getClips(key);
  const want = anim ?? modelInfo(key)?.clips?.idle ?? modelInfo(key)?.clips?.swim;
  const clip = clips.find((c) => c.name === want);
  if (clip) {
    const mx = new THREE.AnimationMixer(g);
    mx.clipAction(clip).play();
    mixers.push(mx);
  }
  if (params.get('outline') !== '0' && modelInfo(key)?.category === 'chars') {
    g.updateMatrixWorld(true);
    outline(g, key === 'sitter' ? 0.016 : 0.01);
  }
  return g;
}
/** props sit with their origin at the collider center: lift them so they rest on y */
function lift(key: string): number { return modelInfo(key)?.origin === 'center' ? modelInfo(key)!.size[1] / 2 : 0; }

const sections = new Map<string, THREE.Group>();
const report: Record<string, number[]> = {};

/** a section block: items wrap into lines of maxW meters, lines recede along -z. Returns the block depth. */
function block(id: string, title: string, keys: string[], z: number, refs: 'both' | 'cat' | 'none', maxW = 9): number {
  const g = new THREE.Group();
  g.position.z = z;
  scene.add(g);
  sections.set(id, g);
  let x = 0, lineZ = 0, lineD = 0;
  const place = (key: string, ref = false) => {
    if (!hasModel(key)) return;
    const info = modelInfo(key)!;
    const [w, h, d] = info.size;
    if (x > 0 && x + w > maxW) { lineZ -= lineD + 0.9; x = 0; lineD = 0; }
    const o = spawn(key);
    o.position.set(x + w / 2, lift(key), lineZ - d / 2);
    g.add(o);
    if (!ref) {
      label(`${key}<small>${w.toFixed(2)}×${h.toFixed(2)}×${d.toFixed(2)} m</small>`, 'lbl', new THREE.Vector3(x + w / 2, h + 0.1, lineZ - d / 2), g);
      report[key] = info.size;
    }
    lineD = Math.max(lineD, d);
    x += w + Math.max(0.12, Math.min(0.5, w * 0.35));
  };
  if (refs === 'both') place('sitter', true);
  if (refs !== 'none') place('cat', true);
  keys.forEach((k) => place(k));
  label(title, 'sec', new THREE.Vector3(-0.5, 0.1, 0.3), g);
  return -lineZ + lineD;
}

/** one instance per mapped clip (manifest clips), labelled with the game anim name */
function clipStrip(key: string, z: number, gap: number): void {
  const g = sections.get('clips') ?? new THREE.Group();
  if (!sections.has('clips')) { g.position.z = 60; scene.add(g); sections.set('clips', g); }
  Object.entries(modelInfo(key)?.clips ?? {}).forEach(([role, clip], i) => {
    const o = spawn(key, clip);
    const x = (i % 10) * gap, zz = z - Math.floor(i / 10) * 2.4;
    o.position.set(x, 0, zz);
    g.add(o);
    label(`${role}<small>${clip}</small>`, 'lbl', new THREE.Vector3(x, modelInfo(key)!.size[1] + 0.15, zz), g);
  });
}

// ---------------------------------------------------------------- room mock (architecture is procedural, everything else is a model)
function room(): THREE.Group {
  const r = new THREE.Group();
  r.position.set(-30, 0, 0);
  scene.add(r);
  sections.set('room', r);
  const W = 6, D = 5, H = 2.6;
  const wood = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toon('#d9a066'));
  wood.rotation.x = -Math.PI / 2; wood.position.y = 0.002; wood.receiveShadow = true;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), toon('#f1e2c8'));
  back.position.set(0, H / 2, -D / 2); back.receiveShadow = true;
  const left = new THREE.Mesh(new THREE.PlaneGeometry(D, H), toon('#b9c9a6'));
  left.rotation.y = Math.PI / 2; left.position.set(-W / 2, H / 2, 0); left.receiveShadow = true;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, 0.02), toon('#fffaf2'));
  trim.position.set(0, 0.05, -D / 2 + 0.01);
  r.add(wood, back, left, trim);

  const put = (key: string, x: number, y: number, z: number, rotY = 0) => {
    if (!hasModel(key)) return null;
    const o = spawn(key);
    o.position.set(x, y + lift(key), z);
    o.rotation.y = rotY;
    r.add(o);
    return o;
  };
  const sz = (k: string) => modelInfo(k)?.size ?? [0, 0, 0];
  const backZ = -D / 2;
  put('rug', 0.4, 0.003, -0.6);
  const sofaZ = backZ + sz('sofa')[2] / 2 + 0.05;
  put('sofa', 0.4, 0, sofaZ);
  put('wallFrame', 0.4, 1.35, backZ + 0.06);
  const ctZ = sofaZ + sz('sofa')[2] / 2 + 0.35 + sz('coffeeTable')[2] / 2;
  put('coffeeTable', 0.4, 0, ctZ);
  const top = sz('coffeeTable')[1];
  put('mug', 0.05, top, ctZ + 0.1, 0.6);
  put('vase', 0.75, top, ctZ - 0.12);
  put('book', 0.42, top, ctZ - 0.15);
  put('remote', 0.3, top, ctZ + 0.15, 0.4);
  put('plate', 0.62, top, ctZ + 0.15);
  // tv wall
  const standX = -W / 2 + sz('tvStand')[2] / 2 + 0.05;
  put('tvStand', standX, 0, -0.1, Math.PI / 2);
  put('tv', standX, sz('tvStand')[1], -0.1, Math.PI / 2);
  put('plant', -W / 2 + 0.6, 0, backZ + 0.6);
  // window on the back wall right side
  put('window', 2.1, 0.85, backZ + 0.06);
  put('curtains', 2.1, 0.12, backZ + 0.16);
  put('floorLamp', 1.75, 0, sofaZ - 0.1);
  put('sideTable', -0.95, 0, sofaZ + 0.05);
  put('lamp', -0.95, sz('sideTable')[1], sofaZ + 0.05);
  put('catTree', 2.45, 0, 0.1, -Math.PI / 2);
  put('wallShelf', -W / 2 + 0.16, 1.5, -1.6, Math.PI / 2);
  // characters
  put('cat', 0.75, Number(params.get('seat') ?? 0.43), sofaZ + 0.12, 0.3);
  put('sitter', -1.05, 0, 0.75, 2.4);
  put('yarn', -0.3, 0, 0.6);
  return r;
}

// ---------------------------------------------------------------- views
const VIEW_DIR: Record<string, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0.75, 1), iso: new THREE.Vector3(0.6, 0.6, 1), top: new THREE.Vector3(0, 2.5, 0.6), low: new THREE.Vector3(0.2, 0.12, 1),
};
function frame(obj: THREE.Object3D, dir: THREE.Vector3, pad = 1.05): void {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const d = dir.clone().normalize();
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const fitW = (s.x / 2) / Math.tan(halfFov) / camera.aspect;
  const fitH = (Math.max(s.y, s.z * 0.5) / 2) / Math.tan(halfFov);
  const dist = Math.max(fitW, fitH) * pad + s.z / 2;
  camera.position.copy(c).addScaledVector(d, dist);
  controls.target.copy(c);
  sun.position.copy(c).add(new THREE.Vector3(4, 8, 6));
  sun.target.position.copy(c);
  const r = Math.max(s.x, s.z) / 2 + 2;
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.5, far: 40 });
  sun.shadow.camera.updateProjectionMatrix();
  controls.update();
}
function setView(name: string): void {
  const dir = VIEW_DIR[params.get('angle') ?? 'front'] ?? VIEW_DIR.front;
  if (name === 'room') {
    const r = sections.get('room')!;
    const t = r.position.clone().add(new THREE.Vector3(0.1, 0.75, -0.6));
    camera.position.copy(t).add(new THREE.Vector3(3.4, 2.6, 6.2));
    controls.target.copy(t);
  } else if (name === 'room2') { // cat close-up on the sofa
    const r = sections.get('room')!;
    const t = r.position.clone().add(new THREE.Vector3(0.6, 0.6, -1.7));
    camera.position.copy(t).add(new THREE.Vector3(0.6, 0.55, 2.1));
    controls.target.copy(t);
  } else if (name === 'room3') { // sitter eye level
    const r = sections.get('room')!;
    const t = r.position.clone().add(new THREE.Vector3(-0.5, 0.9, -0.8));
    camera.position.copy(t).add(new THREE.Vector3(2.6, 0.75, 3.4));
    controls.target.copy(t);
  } else {
    const g = sections.get(name);
    if (g) frame(g, dir);
    return;
  }
  const r = sections.get('room')!;
  sun.position.copy(r.position).add(new THREE.Vector3(3, 7, 5));
  sun.target.position.copy(r.position);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 30 });
  sun.shadow.camera.updateProjectionMatrix();
  controls.update();
}

// ---------------------------------------------------------------- go
(async () => {
  const t0 = performance.now();
  await loadAssets((p) => { hud.textContent = `loading ${(p * 100) | 0}%`; });
  const keys: string[] = Object.keys(await (await fetch(`${import.meta.env.BASE_URL}models/manifest.json`)).json());
  const used = new Set(ROOMS.flatMap(([, , k]) => k));
  const byCat = (c: string) => keys.filter((k) => !k.includes('~') && !used.has(k) && modelInfo(k)?.category === c);
  let z = 0;
  const add = (id: string, title: string, list: string[], refs: 'both' | 'cat' | 'none', maxW?: number) => { z -= block(id, title, list, z, refs, maxW) + 2.5; };
  for (const [id, title, list] of ROOMS) add(id, title, list, id === 'chars' ? 'none' : 'both');
  add('other', 'Other furniture', byCat('furniture'), 'both');
  add('decor', 'Decor', byCat('decor'), 'cat', 2.6);
  add('props', 'Props (PropKind + tools)', byCat('props'), 'cat', 2.2);
  add('mess', 'Mess', byCat('mess'), 'cat', 1.6);
  const cands = keys.filter((k) => k.includes('~'));
  if (cands.length) add('cands', 'Candidates (not final)', cands, 'both');
  const only = params.get('only');
  if (only) add('only', 'Selection', only.split(','), 'cat', Number(params.get('w') ?? 2));
  room();
  if (hasModel('sitter')) clipStrip('sitter', 0, 1.3);
  if (hasModel('cat')) clipStrip('cat', 1.4, 0.9);
  setView(params.get('view') ?? 'room');
  const w = window as unknown as Record<string, unknown>;
  w.setView = setView;
  w.report = report;
  hud.textContent = `${keys.length} models · ${((performance.now() - t0) / 1000).toFixed(1)} s · view=${params.get('view') ?? 'room'}`;
})();

const timer = new THREE.Timer();
renderer.setAnimationLoop((t) => {
  timer.update(t);
  const dt = timer.getDelta();
  for (const m of mixers) m.update(dt);
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
});
