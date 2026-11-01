/**
 * Shared look: soft toon shading + inverted-hull outlines.
 * Every model / level / prop module should build materials through here so the game reads as one style.
 */
import * as THREE from 'three';

export const OUTLINE_COLOR = '#3a2a22'; // warm dark brown, never pure black

let gradient: THREE.DataTexture | null = null;
/** 4-step soft toon ramp (shadow, mid, light, highlight). */
export function gradientMap(): THREE.DataTexture {
  if (gradient) return gradient;
  const tones = [110, 175, 225, 255];
  const data = new Uint8Array(tones.length * 4);
  tones.forEach((t, i) => data.set([t, t, t, 255], i * 4));
  gradient = new THREE.DataTexture(data, tones.length, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

const toonCache = new Map<string, THREE.MeshToonMaterial>();
/**
 * Cached toon material. Pass `unique: true` when you will mutate the material per instance
 * (e.g. animating color / opacity), otherwise instances share it.
 */
export function toon(
  color: THREE.ColorRepresentation,
  opts: { emissive?: THREE.ColorRepresentation; emissiveIntensity?: number; transparent?: boolean; opacity?: number; map?: THREE.Texture; unique?: boolean; side?: THREE.Side } = {},
): THREE.MeshToonMaterial {
  const key = opts.unique || opts.map ? '' : `${new THREE.Color(color).getHexString()}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? ''}|${opts.transparent ?? ''}|${opts.opacity ?? ''}|${opts.side ?? ''}`;
  if (key && toonCache.has(key)) return toonCache.get(key)!;
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: gradientMap(),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    map: opts.map ?? null,
    side: opts.side ?? THREE.FrontSide,
  });
  if (key) toonCache.set(key, m);
  return m;
}

const outlineCache = new Map<string, THREE.MeshBasicMaterial>();
/** Back-face material that pushes vertices along their normals by `thickness` meters. */
export function outlineMaterial(thickness = 0.012, color: THREE.ColorRepresentation = OUTLINE_COLOR): THREE.MeshBasicMaterial {
  const key = `${thickness}|${new THREE.Color(color).getHexString()}`;
  const cached = outlineCache.get(key);
  if (cached) return cached;
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.outlineThickness = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineThickness;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * outlineThickness;');
  };
  m.customProgramCacheKey = () => `outline-${thickness}`;
  outlineCache.set(key, m);
  return m;
}

/**
 * Adds an outline shell as a child of `mesh`. Works best on smooth geometry (spheres, capsules,
 * lathe, extruded with bevel). For hard-edged boxes prefer RoundedBoxGeometry.
 * Note: the shell shares the mesh geometry, so it follows morphs/scales of the parent.
 */
export function addOutline(mesh: THREE.Mesh, thickness = 0.012, color: THREE.ColorRepresentation = OUTLINE_COLOR): THREE.Mesh {
  const shell = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness, color));
  shell.name = 'outline';
  shell.castShadow = false;
  shell.receiveShadow = false;
  shell.raycast = () => {};
  mesh.add(shell);
  return shell;
}

/** Convenience: toon mesh with outline, shadows on. */
export function toonMesh(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  outline: number | false = 0.012,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, toon(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (outline !== false) addOutline(mesh, outline);
  return mesh;
}
