/** Small helpers shared by the world-visual features: lookup inside downloaded models, decals, pivots. */
import * as THREE from 'three';
import type { RoomDef, RoomId, WorldVisualValue } from '../../shared/contracts';
import type { LevelRefs, RefKey } from '../refs';
import { gradientMap } from '../../shared/toon';

export interface Feature {
  keys?: Record<string, (v: WorldVisualValue) => void>;
  update?: (dt: number, t: number) => void;
  tv?: (tex: THREE.Texture | null) => void;
}
export interface Ctx {
  refs: LevelRefs;
  obj(k: RefKey): THREE.Object3D | undefined;
  room(id: RoomId): RoomDef | undefined;
  /** world-space parent for loose visuals (flood sheet, headlights, piles) */
  world: THREE.Group;
  floorY: number;
}
export type Builder = (c: Ctx) => Feature | void;

export const num = (v: WorldVisualValue): number => (typeof v === 'number' ? v : v === true ? 1 : Number(v) || 0);
export const bool = (v: WorldVisualValue): boolean => v === true || v === 'true' || (typeof v === 'number' && v > 0);
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** frame-rate independent approach */
export const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** deterministic rng so decals look the same for everyone */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- inside models

export function meshes(root: THREE.Object3D, pred: (m: THREE.Mesh) => boolean = () => true): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && pred(m)) out.push(m); });
  return out;
}
export const matName = (m: THREE.Mesh) => (Array.isArray(m.material) ? m.material[0] : m.material).name;
export const byMat = (root: THREE.Object3D, ...names: string[]) => meshes(root, (m) => names.includes(matName(m)));

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
/** bounding box of the given meshes (index-aware, so multi-material splits are exact) in root-local space */
export function localBox(root: THREE.Object3D, list: THREE.Mesh[] = meshes(root)): THREE.Box3 {
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  for (const m of list) {
    _m.multiplyMatrices(inv, m.matrixWorld);
    const pos = m.geometry.attributes.position, idx = m.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i++) box.expandByPoint(_v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(_m));
  }
  return box;
}

/** world position of a point given in root-local coordinates */
export function toWorld(root: THREE.Object3D, p: THREE.Vector3): THREE.Vector3 {
  root.updateWorldMatrix(true, false);
  return p.clone().applyMatrix4(root.matrixWorld);
}

/** per-instance material: cloned once per mesh so shared model materials stay untouched */
export function ownMaterial<T extends THREE.Material>(m: THREE.Mesh): T {
  const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as T;
  if (mat.userData.visOwned) return mat;
  const c = mat.clone() as T;
  c.userData.visOwned = true;
  m.material = c;
  return c;
}

/**
 * Re-parents every child of `obj` under a pivot group sitting at `at` (obj-local), so the whole model
 * can sway / fall / rattle around that point without touching the level's placement of `obj`.
 */
export function pivotize(obj: THREE.Object3D, at: THREE.Vector3): THREE.Group {
  const pivot = new THREE.Group();
  pivot.name = 'vis-pivot';
  pivot.position.copy(at);
  const inner = new THREE.Group();
  inner.position.copy(at).negate();
  for (const ch of [...obj.children]) inner.add(ch);
  pivot.add(inner);
  obj.add(pivot);
  return pivot;
}

/** rotate a hinged leaf (door) about a vertical axis through `hingeLocal`, keeping the level's base transform */
export function hinge(obj: THREE.Object3D, hingeLocal: THREE.Vector3) {
  const p0 = obj.position.clone(), q0 = obj.quaternion.clone();
  const h = hingeLocal.clone();
  const q = new THREE.Quaternion(), off = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  return (angle: number) => {
    q.setFromAxisAngle(Y, angle);
    obj.quaternion.copy(q0).multiply(q);
    // keep the hinge point fixed: p = p0 + q0*h - q0*q*h
    off.copy(h).applyQuaternion(q0);
    obj.position.copy(p0).add(off);
    off.copy(h).applyQuaternion(obj.quaternion);
    obj.position.sub(off);
  };
}

// ---------------------------------------------------------------- canvas + decals

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const unitPlane = new THREE.PlaneGeometry(1, 1);
/** a lit (toon) decal quad, w x h meters, facing +Z. Transparent, no depth write, pulled toward the camera. */
export function decal(map: THREE.Texture, w: number, h: number, opts: { basic?: boolean; opacity?: number; order?: number } = {}): THREE.Mesh {
  const params = { map, transparent: true, opacity: opts.opacity ?? 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };
  const mat = opts.basic ? new THREE.MeshBasicMaterial(params) : new THREE.MeshToonMaterial({ ...params, gradientMap: gradientMap() });
  const m = new THREE.Mesh(unitPlane, mat);
  m.scale.set(w, h, 1);
  m.renderOrder = opts.order ?? 2;
  m.receiveShadow = !opts.basic;
  m.castShadow = false;
  m.raycast = () => {};
  m.name = 'vis-decal';
  return m;
}

const Z = new THREE.Vector3(0, 0, 1);
/** place a decal at `pos` (parent-local) on a surface with normal `n`, spun by `spin` radians around the normal */
export function stick(m: THREE.Object3D, pos: THREE.Vector3, n: THREE.Vector3, spin = 0, lift = 0.002): THREE.Object3D {
  const nn = n.clone().normalize();
  m.position.copy(pos).addScaledVector(nn, lift);
  m.quaternion.setFromUnitVectors(Z, nn);
  if (spin) m.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Z, spin));
  return m;
}

/**
 * Planar UVs for a screen mesh without UVs, projected in `root`-local axes (0 x, 1 y, 2 z) over the
 * mesh's own bounds. The geometry is cloned so other instances of the model keep theirs.
 */
export function planarUv(root: THREE.Object3D, m: THREE.Mesh, axisU: 0 | 1 | 2, axisV: 0 | 1 | 2, mirrorU = false): void {
  const g = m.geometry.clone();
  root.updateWorldMatrix(true, true);
  _m.copy(root.matrixWorld).invert().multiply(m.matrixWorld);
  const pos = g.attributes.position;
  const pts: number[][] = [];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.count; i++) {
    const p = _v.fromBufferAttribute(pos, i).applyMatrix4(_m).toArray();
    pts.push(p);
    for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], p[c]); max[c] = Math.max(max[c], p[c]); }
  }
  const uv = new Float32Array(pos.count * 2);
  pts.forEach((p, i) => {
    const u = (p[axisU] - min[axisU]) / (max[axisU] - min[axisU] || 1);
    uv[i * 2] = mirrorU ? 1 - u : u;
    uv[i * 2 + 1] = (p[axisV] - min[axisV]) / (max[axisV] - min[axisV] || 1);
  });
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.geometry = g;
}

/** room center in world space */
export const roomCenter = (r: RoomDef) => new THREE.Vector3((r.min[0] + r.max[0]) / 2, r.min[1], (r.min[2] + r.max[2]) / 2);
