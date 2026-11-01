/**
 * Cat accessories: downloaded CC0 / CC-BY models from public/models/accessories/ (see CREDITS request in
 * design/REQUESTS.md). Loaded directly with GLTFLoader (not via the manifest) and fitted onto the cube
 * head by bounding box. Positions are head space, GLB model units: cube center origin, top y = +0.625,
 * front face z = +0.625. Each accessory is one model or a few instances of one model (flower crown).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CatAccessory } from '../../shared/contracts';
import { gradientMap } from '../../shared/toon';

interface Part {
  file: string;
  /** fit the bbox: 'w' x width, 'h' y height, 'd' z depth = size */
  fit: 'w' | 'h' | 'd';
  size: number;
  /** where the bbox anchor lands */
  at: [number, number, number];
  /** bbox anchor: x center, y = 'bottom' | 'center' | 'top', z = 'front' | 'center' | 'back' */
  y?: 'bottom' | 'center' | 'top';
  z?: 'front' | 'center' | 'back';
  /** euler applied before fitting (re-orient the source) */
  pre?: [number, number, number];
  /** euler applied after fitting, around the anchor */
  rot?: [number, number, number];
  /** material override, e.g. the see-through vet cone */
  tint?: { color: string; opacity?: number };
  /** reshape the source (source units, before `pre`): vertices below y = minY collapse onto it, radius capped at maxR */
  trim?: { minY: number; maxR: number };
}
interface Def { parts: Part[]; collar?: string }

const BASE = `${import.meta.env.BASE_URL}models/accessories/`;
const crown = (): Part[] => [-0.5, -0.25, 0, 0.25, 0.5].map((x, i) => ({
  file: i % 2 ? 'flowerB.glb' : 'flowerA.glb', fit: 'w' as const, size: i % 2 ? 0.26 : 0.32,
  at: [x, 0.6 + (1 - Math.abs(x) * 1.2) * 0.04, 0.42 - Math.abs(x) * 0.25] as [number, number, number],
  y: 'bottom' as const, rot: [0.55, x * 0.8, -x * 0.5] as [number, number, number],
}));
const DEFS: Partial<Record<CatAccessory, Def>> = {
  glasses: { parts: [{ file: 'glasses.glb', fit: 'w', size: 1.16, at: [0, 0.12, 0.74], y: 'center', z: 'front' }] },
  tinyHat: { parts: [{ file: 'tophat.glb', fit: 'w', size: 0.66, at: [0.14, 0.6, 0.0], y: 'bottom', rot: [0.05, 0.3, -0.3] }] },
  bow: { parts: [{ file: 'bowtie.glb', fit: 'w', size: 0.74, at: [0.3, 0.7, 0.5], y: 'center', rot: [0.15, -0.25, 0.42] }] },
  bell: { collar: '#d9473a', parts: [{ file: 'bell.glb', fit: 'w', size: 0.24, at: [0, -0.33, 0.66], y: 'top', z: 'center' }] },
  flowerCrown: { parts: crown() },
  cone: { parts: [{ file: 'cone.glb', fit: 'w', size: 2.05, at: [0, -0.02, 1.2], y: 'center', z: 'front', pre: [Math.PI / 2, 0, 0], tint: { color: '#e4f4ff', opacity: 0.55 },
    // the source is a kitchen funnel: drop its spout (it poked out of the cat's back) and the side tab
    trim: { minY: 0.75, maxR: 0.97 } }] },
};
/** the accessories that have a model (CAT_ACCESSORIES) */
export const ACCESSORIES = Object.keys(DEFS) as CatAccessory[];

const loader = new GLTFLoader();
const templates = new Map<CatAccessory, Promise<THREE.Object3D | null>>();
const toonCache = new Map<string, THREE.MeshToonMaterial>();

function toonOf(src: THREE.MeshStandardMaterial): THREE.MeshToonMaterial {
  const key = `${src.color?.getHexString()}|${src.map?.uuid ?? ''}`;
  let m = toonCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: src.color ?? 0xffffff, map: src.map ?? null, gradientMap: gradientMap(), side: src.side });
    toonCache.set(key, m);
  }
  return m;
}

const _box = new THREE.Box3(), _size = new THREE.Vector3();
function fitPart(src: THREE.Object3D, p: Part): THREE.Object3D {
  const inner = src.clone(true);
  if (p.pre) inner.rotation.set(...p.pre);
  const wrap = new THREE.Group();
  wrap.add(inner);
  wrap.updateMatrixWorld(true);
  _box.setFromObject(inner);
  _box.getSize(_size);
  const k = p.size / Math.max(1e-6, p.fit === 'w' ? _size.x : p.fit === 'h' ? _size.y : _size.z);
  const ax = (_box.min.x + _box.max.x) / 2;
  const ay = p.y === 'top' ? _box.max.y : p.y === 'center' ? (_box.min.y + _box.max.y) / 2 : _box.min.y;
  const az = p.z === 'front' ? _box.max.z : p.z === 'back' ? _box.min.z : (_box.min.z + _box.max.z) / 2;
  inner.position.set(-ax, -ay, -az);
  const sc = new THREE.Group();
  sc.scale.setScalar(k);
  sc.add(wrap);
  const placed = new THREE.Group();
  placed.position.set(...p.at);
  if (p.rot) placed.rotation.set(...p.rot);
  placed.add(sc);
  return placed;
}

function trimSource(src: THREE.Object3D, t: NonNullable<Part['trim']>) {
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.trimmed) return;
    m.userData.trimmed = true;
    const pos = m.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z), k = r > t.maxR ? t.maxR / r : 1;
      pos.setXYZ(i, x * k, Math.max(t.minY, pos.getY(i)), z * k);
    }
    pos.needsUpdate = true;
    m.geometry.computeBoundingBox();
    m.geometry.computeBoundingSphere();
  });
}

const files = new Map<string, Promise<THREE.Group | null>>();
function loadFile(file: string): Promise<THREE.Group | null> {
  let pr = files.get(file);
  if (!pr) {
    pr = loader.loadAsync(BASE + file).then((gltf) => {
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.material = Array.isArray(m.material) ? m.material.map((x) => toonOf(x as THREE.MeshStandardMaterial)) : toonOf(m.material as THREE.MeshStandardMaterial);
        m.castShadow = true;
        m.receiveShadow = true;
      });
      return gltf.scene;
    }).catch((err) => { console.warn(`[cat] accessory ${file} failed`, err); return null; });
    files.set(file, pr);
  }
  return pr;
}

function load(a: CatAccessory): Promise<THREE.Object3D | null> {
  const def = DEFS[a];
  if (!def) return Promise.resolve(null);
  let pr = templates.get(a);
  if (!pr) {
    pr = Promise.all(def.parts.map((p) => loadFile(p.file))).then((srcs) => {
      if (srcs.some((x) => !x)) return null;
      const g = new THREE.Group();
      g.name = `acc:${a}`;
      def.parts.forEach((p, i) => {
        if (p.trim) trimSource(srcs[i]!, p.trim);
        const part = fitPart(srcs[i]!, p);
        if (p.tint) {
          const mat = new THREE.MeshToonMaterial({ color: p.tint.color, gradientMap: gradientMap(), transparent: (p.tint.opacity ?? 1) < 1, opacity: p.tint.opacity ?? 1, depthWrite: false, side: THREE.DoubleSide });
          part.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = mat; m.castShadow = false; m.renderOrder = 2; } });
        }
        g.add(part);
      });
      return g;
    });
    templates.set(a, pr);
  }
  return pr;
}

/** collar band color painted into the fur (bell collar), if any */
export const collarFor = (a: CatAccessory): string | undefined => DEFS[a]?.collar;

/** a fresh instance (shares geometry + materials), or null if missing */
export async function accessoryFor(a: CatAccessory): Promise<THREE.Object3D | null> {
  const t = await load(a);
  return t ? t.clone(true) : null;
}

/** start fetching everything early so the first round has them */
export function preloadAccessories(): Promise<unknown> {
  return Promise.all(ACCESSORIES.map(load));
}
