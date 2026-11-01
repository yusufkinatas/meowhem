/**
 * Downloaded 3D assets: loads public/models/manifest.json + every GLB once, then hands out clones.
 * cloneModel(key) returns a plain Group (identity transform) whose child already carries the
 * manifest's rotation / scale / offset: meters, facing +Z, origin at the feet (furniture, characters,
 * mess) or at the collider center (props). Geometry, materials and textures are shared by all clones.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { gradientMap } from '../shared/toon';

export interface ManifestEntry {
  /** GLB path relative to /models/ */
  file: string;
  category: 'chars' | 'furniture' | 'decor' | 'props' | 'mess';
  /** source asset name */
  name: string;
  license: string;
  author: string;
  sourceUrl: string;
  /** source units -> meters, per final axis */
  scale: [number, number, number];
  /** degrees, XYZ euler, applied before scale (forward-axis / lie-flat fix) */
  rotation: [number, number, number];
  origin: 'feet' | 'center';
  /** meters, applied after rotation + scale so the origin lands at feet / collider center */
  offset: [number, number, number];
  /** final bounding box in meters [x width, y height, z depth] */
  size: [number, number, number];
  /** keep source materials, or convert to MeshToonMaterial (keeps map / color / vertex colors) */
  material: 'keep' | 'toon';
  /** source material name -> CSS color override */
  tint?: Record<string, string>;
  /** game animation name -> clip name in getClips(key) */
  clips?: Record<string, string>;
  /** notable parts (doors, water, bones) -> object name inside the clone (getObjectByName) */
  nodes?: Record<string, string>;
  /** props only: collider size from PROP_DEFS [x, y, z] meters */
  collider?: [number, number, number];
  notes?: string;
}

interface Loaded { template: THREE.Group; clips: THREE.AnimationClip[]; skinned: boolean }

const BASE = `${import.meta.env.BASE_URL}models/`;
let manifest: Record<string, ManifestEntry> = {};
const models = new Map<string, Loaded>();
const sharedTextures = new Map<string, THREE.Texture>();
const toonCache = new Map<string, THREE.MeshToonMaterial>();
let loading: Promise<void> | null = null;

/** Load the manifest and every model. Safe to call more than once. Failed models are skipped (hasModel = false). */
export function loadAssets(onProgress?: (p01: number) => void): Promise<void> {
  loading ??= (async () => {
    const res = await fetch(`${BASE}manifest.json`);
    if (!res.ok) throw new Error(`models/manifest.json: ${res.status}`);
    manifest = await res.json();
    const keys = Object.keys(manifest);
    const loader = new GLTFLoader();
    let done = 0;
    onProgress?.(0);
    await Promise.all(keys.map(async (key) => {
      try {
        const gltf = await loader.loadAsync(BASE + manifest[key].file);
        models.set(key, prepare(manifest[key], gltf.scene, gltf.animations));
      } catch (err) {
        console.warn(`[assets] ${key} failed to load`, err);
      }
      onProgress?.(++done / keys.length);
    }));
  })();
  return loading;
}

export const hasModel = (key: string): boolean => models.has(key);
export const modelInfo = (key: string): ManifestEntry | undefined => manifest[key];
export const getClips = (key: string): THREE.AnimationClip[] => models.get(key)?.clips ?? [];

/** A fresh instance in meters facing +Z. Throws for unknown keys: check hasModel() first for optional assets. */
export function cloneModel(key: string): THREE.Group {
  const m = models.get(key);
  if (!m) throw new Error(`[assets] no model '${key}' (loadAssets() done? key in manifest.json?)`);
  return (m.skinned ? SkeletonUtils.clone(m.template) : m.template.clone(true)) as THREE.Group;
}

// ---------------------------------------------------------------- internals

function prepare(e: ManifestEntry, scene: THREE.Group, clips: THREE.AnimationClip[]): Loaded {
  const fix = new THREE.Group();
  fix.name = '__fix';
  const r = e.rotation.map(THREE.MathUtils.degToRad) as [number, number, number];
  fix.matrix.compose(
    new THREE.Vector3(...e.offset),
    new THREE.Quaternion(),
    new THREE.Vector3(...e.scale),
  ).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...r)));
  fix.matrixAutoUpdate = false;
  fix.add(scene);

  const template = new THREE.Group();
  template.name = e.file;
  template.add(fix);

  let skinned = false;
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const out = mats.map((mat) => material(e, mat as THREE.MeshStandardMaterial));
    mesh.material = Array.isArray(mesh.material) ? out : out[0];
    mesh.castShadow = !out.some((m) => m.transparent);
    mesh.receiveShadow = true;
  });
  return { template, clips, skinned };
}

/** dedupe identical textures across files (build step names images by content hash) */
function shareTexture(t: THREE.Texture | null): THREE.Texture | null {
  if (!t || !t.name) return t;
  const key = `${t.name}|${t.colorSpace}|${t.wrapS}|${t.wrapT}|${t.flipY}`;
  const hit = sharedTextures.get(key);
  if (hit) { if (hit !== t) t.dispose(); return hit; }
  sharedTextures.set(key, t);
  return t;
}

function material(e: ManifestEntry, src: THREE.MeshStandardMaterial): THREE.Material {
  src.map = shareTexture(src.map);
  if ('emissiveMap' in src) src.emissiveMap = shareTexture(src.emissiveMap);
  const tint = e.tint?.[src.name];
  if (e.material === 'keep') {
    if (!tint) return src;
    const m = src.clone();
    m.color.set(tint);
    return m;
  }
  const color = tint ? new THREE.Color(tint) : (src.color ?? new THREE.Color(1, 1, 1));
  const emissive = src.emissive ?? new THREE.Color(0, 0, 0);
  const key = [src.name, color.getHexString(), src.map?.uuid, src.vertexColors, src.transparent, src.opacity, src.alphaTest, src.side,
    emissive.getHexString(), src.emissiveMap?.uuid, src.emissiveIntensity].join('|');
  let m = toonCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({
      name: src.name,
      color,
      map: src.map,
      gradientMap: gradientMap(),
      vertexColors: src.vertexColors,
      transparent: src.transparent,
      opacity: src.opacity,
      alphaTest: src.alphaTest,
      side: src.side,
      emissive,
      emissiveMap: src.emissiveMap ?? null,
      emissiveIntensity: src.emissiveIntensity ?? 1,
      depthWrite: src.depthWrite,
    });
    toonCache.set(key, m);
  }
  return m;
}
