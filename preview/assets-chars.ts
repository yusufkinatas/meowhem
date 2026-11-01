// Asset scouting viewer for characters (cats, catsitter, birds). Loads from /assets-raw/chars at game scale
// (cats normalized to 0.45 m tall, humans to 1.75 m, birds to 0.22 m) and prints native bounding boxes + clip names.
// URL params: view=all|cats|sitters|birds|catClose|sitterClose|side  clip=walk|idle|run|none  toon=1  outline=0.012  rows=cat,sitter,bird
// From devtools / agent-browser: window.setView('cats'), window.playAll('idle'), window.report
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { gradientMap, OUTLINE_COLOR } from '../src/shared/toon';

// Local copy of toon.ts outlineMaterial using the raw `normal` attribute: the shared one references `objectNormal`,
// which MeshBasicMaterial only declares with envmap/skinning, so it fails to compile on static meshes (three 0.187).
const outlineCache = new Map<number, THREE.MeshBasicMaterial>();
function outlineMaterial(thickness: number): THREE.MeshBasicMaterial {
  const hit = outlineCache.get(thickness);
  if (hit) return hit;
  const m = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.outlineThickness = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineThickness;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * outlineThickness;');
  };
  m.customProgramCacheKey = () => `chars-outline-${thickness}`;
  outlineCache.set(thickness, m);
  return m;
}

type Row = 'cat' | 'sitter' | 'bird';
interface Cand { row: Row; name: string; file: string; lic: string; yaw?: number }

const R = '/assets-raw/chars/';
const KCP = R + 'kenney-cube-pets/Models/GLB format/';
const KMC = R + 'kenney-mini-characters/Models/GLB format/';
const KBC = R + 'kenney-blocky-characters/Models/GLB format/';
const KAY = R + 'kaykit-adventurers/KayKit-Character-Pack-Adventures-1.0-main/addons/kaykit_character_pack_adventures/Characters/gltf/';
const QCW = R + 'quaternius-cube-world/';
const QUA = R + 'quaternius-ultimate-animated-character/';
const PP = R + 'polypizza/';

const CANDS: Cand[] = [
  { row: 'cat', name: 'Kenney Cube Pets cat', file: KCP + 'animal-cat.glb', lic: 'CC0' },
  { row: 'cat', name: 'Quaternius Cube World cat', file: QCW + 'Cat.gltf', lic: 'CC0' },
  { row: 'cat', name: 'Quaternius Cat Blob', file: PP + 'cathead-quaternius-2f54vbV0In.glb', lic: 'CC0' },
  { row: 'cat', name: 'J-Toastie cat', file: PP + 'cat-jtoastie-DJ9rpAhrh3.glb', lic: 'CC-BY 3.0', yaw: -Math.PI / 2 },
  { row: 'cat', name: 'Quaternius Animals Vol.2 cat', file: R + 'oga-quaternius-animals-vol2/Animal Pack Vol.2 by @Quaternius/FBX/Cat.fbx', lic: 'CC0', yaw: -Math.PI / 2 },
  { row: 'cat', name: 'jeremy Kitten (static)', file: PP + 'kitten-jeremy-dXyLRVNOalM.glb', lic: 'CC-BY 3.0', yaw: -Math.PI / 2 },
  { row: 'cat', name: 'hk cat loaf (static)', file: PP + 'catloaf-hk-5qGO_C5GvAB.glb', lic: 'CC-BY 3.0', yaw: Math.PI / 2 },

  { row: 'sitter', name: 'Kenney Mini female-a', file: KMC + 'character-female-a.glb', lic: 'CC0' },
  { row: 'sitter', name: 'Kenney Mini male-b', file: KMC + 'character-male-b.glb', lic: 'CC0' },
  { row: 'sitter', name: 'Kenney Blocky char-a', file: KBC + 'character-a.glb', lic: 'CC0' },
  { row: 'sitter', name: 'Quaternius Cube World M1', file: QCW + 'Character_Male_1.gltf', lic: 'CC0' },
  { row: 'sitter', name: 'Quaternius Cube World F1', file: QCW + 'Character_Female_1.gltf', lic: 'CC0' },
  { row: 'sitter', name: 'Quaternius Casual_Male', file: QUA + 'Casual_Male.gltf', lic: 'CC0' },
  { row: 'sitter', name: 'Quaternius Casual2_Female', file: QUA + 'Casual2_Female.gltf', lic: 'CC0' },
  { row: 'sitter', name: 'Quaternius Casual3_Male', file: QUA + 'Casual3_Male.gltf', lic: 'CC0' },
  { row: 'sitter', name: 'KayKit Rogue', file: KAY + 'Rogue.glb', lic: 'CC0' },
  { row: 'sitter', name: 'KayKit Barbarian', file: KAY + 'Barbarian.glb', lic: 'CC0' },
  { row: 'sitter', name: 'Quaternius UAL mannequin', file: R + 'quaternius-ual/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb', lic: 'CC0' },

  { row: 'bird', name: 'Kenney parrot', file: KCP + 'animal-parrot.glb', lic: 'CC0' },
  { row: 'bird', name: 'Kenney chick', file: KCP + 'animal-chick.glb', lic: 'CC0' },
  { row: 'bird', name: 'Quaternius Cube World chick', file: QCW + 'Chick.gltf', lic: 'CC0' },
  { row: 'bird', name: 'Quaternius parrot (static)', file: PP + 'bird-quaternius-gYYC0gYMnw.glb', lic: 'CC0' },
  { row: 'bird', name: 'Google sparrow (static)', file: PP + 'sparrow-google-3rTjKefT184.glb', lic: 'CC-BY 3.0' },
];

const TARGET: Record<Row, number> = { cat: 0.45, sitter: 1.75, bird: 0.22 };
const SPACING: Record<Row, number> = { cat: 0.85, sitter: 1.35, bird: 0.6 };
const ROW_Z: Record<Row, number> = { bird: 1.6, cat: 0.6, sitter: -1.4 };

const params = new URLSearchParams(location.search);
const rows = (params.get('rows') ?? 'cat,sitter,bird').split(',') as Row[];
const useToon = params.get('toon') === '1';
const outline = Number(params.get('outline') ?? (useToon ? 0.012 : 0));
const hud = document.getElementById('hud')!;

// ---------------------------------------------------------------- scene
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
scene.add(new THREE.HemisphereLight('#fff4e0', '#b08060', 1.6));
const sun = new THREE.DirectionalLight('#fff1dc', 2.4);
sun.position.set(4, 7, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 6, bottom: -6, near: 0.5, far: 30 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.02;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshStandardMaterial({ color: '#d9a066', roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

function label(text: string, cls: string, pos: THREE.Vector3, parent: THREE.Object3D = scene): void {
  const el = document.createElement('div');
  el.className = cls;
  el.innerHTML = text;
  const o = new CSS2DObject(el);
  o.position.copy(pos);
  parent.add(o);
}

function pole(h: number, x: number, z: number, color: string): void {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, h, 8), new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, h / 2, z);
  scene.add(m);
  label(`${h} m`, 'pole', new THREE.Vector3(x, h + 0.06, z));
}

// ---------------------------------------------------------------- loading
const gltf = new GLTFLoader();
const fbx = new FBXLoader();
async function load(file: string): Promise<{ root: THREE.Object3D; clips: THREE.AnimationClip[] }> {
  const url = encodeURI(file);
  if (file.toLowerCase().endsWith('.fbx')) {
    const g = await fbx.loadAsync(url);
    return { root: g, clips: g.animations };
  }
  const g = await gltf.loadAsync(url);
  return { root: g.scene, clips: g.animations };
}

function toToon(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const conv = (src: THREE.Material): THREE.Material => {
      const s = src as THREE.MeshStandardMaterial;
      return new THREE.MeshToonMaterial({ color: s.color ?? 0xffffff, map: s.map ?? null, vertexColors: s.vertexColors, gradientMap: gradientMap(), side: s.side, transparent: s.transparent });
    };
    m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
  });
}

function addOutlines(root: THREE.Object3D, worldThickness: number, scale: number): void {
  const list: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) list.push(o as THREE.Mesh); });
  for (const m of list) {
    // thickness is applied in the mesh's local space, so undo the world scale of this mesh
    const ws = new THREE.Vector3(); m.getWorldScale(ws);
    const t = worldThickness / Math.max(1e-6, ws.x * scale) * scale;
    const mat = outlineMaterial(+t.toFixed(5));
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
      const sm = m as THREE.SkinnedMesh;
      const shell = new THREE.SkinnedMesh(sm.geometry, mat);
      shell.bind(sm.skeleton, sm.bindMatrix);
      shell.frustumCulled = false;
      sm.parent!.add(shell);
      shell.position.copy(sm.position); shell.quaternion.copy(sm.quaternion); shell.scale.copy(sm.scale);
    } else {
      const shell = new THREE.Mesh(m.geometry, mat);
      m.add(shell);
    }
  }
}

interface Entry {
  cand: Cand; holder: THREE.Group; mixer: THREE.AnimationMixer | null; clips: THREE.AnimationClip[];
  info: { name: string; file: string; lic: string; native: number[]; meters: number[]; scaleToMeters: number; clips: string[]; skinned: boolean; bones: number; meshes: number; materials: string[] };
}
const entries: Entry[] = [];

function pickClip(clips: THREE.AnimationClip[], want: string): THREE.AnimationClip | undefined {
  if (want === 'none' || clips.length === 0) return undefined;
  const bad = /back|carry|formal|hold|strafe|crouch|wheelchair|swim|talk|torch|pistol|attack|_pose|tpose/i;
  const re = new RegExp(want, 'i');
  return clips.find((c) => re.test(c.name) && !bad.test(c.name))
    ?? clips.find((c) => /idle/i.test(c.name) && !bad.test(c.name))
    ?? clips.find((c) => c.duration > 0.2);
}

function play(e: Entry, want: string): void {
  if (!e.mixer) return;
  e.mixer.stopAllAction();
  const c = pickClip(e.clips, want);
  if (c) e.mixer.clipAction(c).play();
}

async function build(): Promise<void> {
  const want = params.get('clip') ?? 'walk';
  for (const row of rows) {
    const list = CANDS.filter((c) => c.row === row);
    const x0 = -((list.length - 1) * SPACING[row]) / 2;
    pole(1.75, x0 - SPACING[row] * 0.9, ROW_Z[row], '#b23a2a');
    pole(0.45, x0 - SPACING[row] * 0.9 + 0.12, ROW_Z[row], '#2a6ab2');
    for (let i = 0; i < list.length; i++) {
      const cand = list[i];
      hud.textContent = `loading ${cand.name}…`;
      try {
        const { root, clips } = await load(cand.file);
        root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
        // KayKit ships every weapon as a visible child mesh; hide them (bbox would include them otherwise)
        root.traverse((o) => { if (/Knife|Crossbow|Throwable|Sword|Shield|Axe|Staff|Wand|Spellbook|Mug/i.test(o.name) && (o as THREE.Mesh).isMesh) o.visible = false; });
        root.updateMatrixWorld(true);
        const box = new THREE.Box3();
        root.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh) box.union(new THREE.Box3().expandByObject(o, true)); });
        const size = box.getSize(new THREE.Vector3());
        const scale = TARGET[row] / size.y;
        const holder = new THREE.Group();
        const inner = new THREE.Group();
        inner.add(root);
        inner.scale.setScalar(scale);
        // origin at feet, centered on x/z
        const c = box.getCenter(new THREE.Vector3());
        root.position.set(-c.x, -box.min.y, -c.z);
        inner.rotation.y = cand.yaw ?? 0;
        holder.add(inner);
        holder.position.set(x0 + i * SPACING[row], 0, ROW_Z[row]);
        scene.add(holder);
        // recolor demo for per-part materials (what SitterLook.skin/hair/shirt would do); native Quaternius skin is near-black
        if (params.get('recolor') !== '0') root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          for (const mm of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
            if (mm.name === 'Skin' && !mm.map) mm.color.set('#f0c09a');
            // FBXLoader drops the 2017 Quaternius FBX diffuse colors; materials are named after their color
            const named: Record<string, string> = { Grey: '#3d3d44', White: '#f2f0ea', Pink: '#f0a0b8' };
            if (named[mm.name] && mm.color.getHex() === 0xffffff) mm.color.set(named[mm.name]);
          }
        });
        if (useToon) toToon(root);
        if (outline > 0) addOutlines(root, outline, scale);
        let skinned = false, bones = 0, meshes = 0;
        const mats = new Set<string>();
        root.traverse((o) => {
          const m = o as THREE.SkinnedMesh;
          if (!m.isMesh) return;
          meshes++;
          if (m.isSkinnedMesh) { skinned = true; bones = Math.max(bones, m.skeleton.bones.length); }
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => mats.add(mm.name || mm.type));
        });
        const e: Entry = {
          cand, holder, clips, mixer: clips.length ? new THREE.AnimationMixer(root) : null,
          info: {
            name: cand.name, file: cand.file, lic: cand.lic,
            native: size.toArray().map((v) => +v.toFixed(3)),
            meters: size.clone().multiplyScalar(scale).toArray().map((v) => +v.toFixed(3)),
            scaleToMeters: +scale.toPrecision(4), clips: clips.map((c2) => `${c2.name} ${c2.duration.toFixed(2)}s`),
            skinned, bones, meshes, materials: [...mats],
          },
        };
        entries.push(e);
        play(e, want);
        const m = e.info.meters;
        label(`${i + 1}. ${cand.name}<small>${cand.lic} · ${clips.length} clips · ${m[0]}×${m[1]}×${m[2]} m</small>`, 'lbl', new THREE.Vector3(0, TARGET[row] * (i % 2 ? 1.45 : 1.1) + 0.03, 0), holder);
      } catch (err) {
        console.error('failed', cand.file, err);
        label(`FAILED ${cand.name}`, 'lbl', new THREE.Vector3(x0 + i * SPACING[row], 0.3, ROW_Z[row]));
      }
    }
  }
  const report = entries.map((e) => e.info);
  (window as unknown as { report: unknown }).report = report;
  console.log('REPORT ' + JSON.stringify(report));
  hud.textContent = `${entries.length}/${CANDS.filter((c) => rows.includes(c.row)).length} loaded · clip=${want}${useToon ? ' · toon' : ''}`;
  (window as unknown as { ready: boolean }).ready = true;
}

// ---------------------------------------------------------------- views
const VIEWS: Record<string, [THREE.Vector3Tuple, THREE.Vector3Tuple]> = {
  all: [[0, 10, 13], [0, 0.2, 0]],
  cats: [[0, 1.6, 7.4], [0, 0.25, ROW_Z.cat]],
  catClose: [[-1.3, 0.55, 2.5], [-1.3, 0.22, ROW_Z.cat]],
  catClose2: [[1.3, 0.55, 2.5], [1.3, 0.22, ROW_Z.cat]],
  catQuarter: [[-3.2, 1.3, 3.6], [-0.6, 0.2, ROW_Z.cat]],
  sitters: [[0, 3.2, 16], [0, 0.9, ROW_Z.sitter]],
  sitterClose: [[-3.4, 1.5, 3.2], [-3.4, 1.0, ROW_Z.sitter]],
  sitterClose2: [[3.4, 1.5, 3.2], [3.4, 1.0, ROW_Z.sitter]],
  birds: [[0, 0.8, 5.2], [0, 0.12, ROW_Z.bird]],
  sitterQuarter: [[-7, 2.4, 5], [-1.5, 0.9, ROW_Z.sitter]],
};
function setView(name: string): void {
  const v = VIEWS[name] ?? VIEWS.all;
  camera.position.set(...v[0]);
  controls.target.set(...v[1]);
  controls.update();
}
Object.assign(window, {
  setView, scene,
  playAll: (want: string) => entries.forEach((e) => play(e, want)),
  setYaw: (yaw: number) => entries.forEach((e) => { e.holder.rotation.y = yaw; }),
  // frame one model: focus('cat', 0, 0.6) -> 3/4 front close-up; az = camera azimuth in radians
  focus: (row: Row, i: number, az = 0.5) => {
    const e = entries.filter((x) => x.cand.row === row)[i];
    if (!e) return;
    const h = TARGET[row], d = h * 2.6, p = e.holder.position;
    camera.position.set(p.x + Math.sin(az) * d, h * 0.9, p.z + Math.cos(az) * d);
    controls.target.set(p.x, h * 0.5, p.z);
    controls.update();
  },
});
setView(params.get('view') ?? 'all');

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const e of entries) e.mixer?.update(dt);
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
});

build();
