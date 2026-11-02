/**
 * Cat geometry prep (once, shared by every cat) + per-look fur atlas painting (cached per look).
 * Source: Kenney Cube Pets cat (manifest key 'cat'). All positions are in the GLB's model units
 * (cube = 1.25 u, 1 u = manifest scale meters). The baked eyes / nose / mouth are dropped (the face
 * decal replaces them), the ears are split out so they can rotate, every part gets UVs into one
 * per-look atlas so patterns (tabby, tuxedo, calico...) can be painted, and the tail is skinned.
 */
import * as THREE from 'three';
import type { CatLook } from '../../shared/contracts';
import { cloneModel } from '../../assets/loader';

/** cube space = the GLB `body` node's local space: cube x,z in [-0.625, 0.625], y in [0, 1.25] */
export const H = 0.625;
export const BODY_Y = 0.18125;          // body node height in the GLB root
export const LEG_POS: [number, number, number][] = [[0.25, 0.3, 0.25], [-0.25, 0.3, 0.25], [0.25, 0.3, -0.25], [-0.25, 0.3, -0.25]]; // FL FR BL BR
export const LEG_H = 0.1875;
export const EAR_PIVOT: [number, number, number][] = [[0.336, 1.2, 0.32], [-0.336, 1.2, 0.32]]; // L (+x) R (-x), cube space
export const TAIL_ROOT: [number, number, number] = [0, 0.6375, -0.5484]; // cube space
/** tail chain joints in tail space, read off the mesh profile (base -> tip) */
export const TAIL_JOINTS: [number, number, number][] = [[0, 0, 0], [0, 0.17, -0.24], [0, 0.5, -0.43], [0, 0.8, -0.34]];
const TAIL_TIP: [number, number, number] = [0, 0.84, -0.1];
/** elevation of each segment above the backward horizontal; bone frames are rotated so their -Z runs along the segment */
export const TAIL_ELEV: number[] = TAIL_JOINTS.map((j, i) => {
  const n = i + 1 < TAIL_JOINTS.length ? TAIL_JOINTS[i + 1] : TAIL_TIP;
  return Math.atan2(n[1] - j[1], -(n[2] - j[2]));
});

export interface CatGeo {
  cube: THREE.BufferGeometry;
  ears: THREE.BufferGeometry[];   // L, R (pivot at EAR_PIVOT)
  legs: THREE.BufferGeometry[];   // FL FR BL BR (pivot at hip)
  tail: THREE.BufferGeometry;     // skinned, 4 bones
  /** face decal: the cube's front-facing triangles, nudged out, uv = planar projection of head-space x,y over ±FACE_HALF */
  face: THREE.BufferGeometry;
}
/** the face decal's uv square covers head-space x,y in ±FACE_HALF (model units) */
export const FACE_HALF = 0.6;

// ---------------------------------------------------------------- atlas layout
const COLS = 5, ROWS = 4;
export const TILE = 96;
const T = {
  F: [0, 0], B: [1, 0], L: [2, 0], R: [3, 0], T: [4, 0],
  D: [0, 1], earL: [1, 1], earR: [2, 1], tail: [3, 1], pink: [4, 1],
  leg0: [0, 2], leg1: [1, 2], leg2: [2, 2], leg3: [3, 2],
  paw0: [0, 3], paw1: [1, 3], paw2: [2, 3], paw3: [3, 3],
} as const;
type TileKey = keyof typeof T;
/** tile-local (u, v in 0..1, v up) -> atlas uv (texture flipY = true) */
function auv(tile: TileKey, u: number, v: number, out: number[], i: number) {
  const [c, r] = T[tile];
  const iu = 0.04 + 0.92 * THREE.MathUtils.clamp(u, 0, 1), iv = 0.04 + 0.92 * THREE.MathUtils.clamp(v, 0, 1);
  out[i] = (c + iu) / COLS;
  out[i + 1] = 1 - (r + 1 - iv) / ROWS;
}

// ---------------------------------------------------------------- geometry
let geo: CatGeo | null = null;
/** palette u of the source colormap: 15th column = eyes / nose / pupils, 1st = inner ear */
const cellOf = (u: number, v: number) => [Math.floor(u * 16), Math.floor(v * 4)];

export function catGeometry(): CatGeo {
  if (geo) return geo;
  const src = cloneModel('cat');
  const byName = (n: string) => src.getObjectByName(n) as THREE.Mesh;
  const body = byName('body').geometry.toNonIndexed();
  const P = body.attributes.position as THREE.BufferAttribute;
  const U = body.attributes.uv as THREE.BufferAttribute;
  const triCount = P.count / 3;

  // connected components by shared positions
  const parent = new Map<string, string>();
  const find = (a: string): string => { let p = parent.get(a) ?? a; if (p !== a) { p = find(p); parent.set(a, p); } return p; };
  const key = (i: number) => `${P.getX(i).toFixed(4)},${P.getY(i).toFixed(4)},${P.getZ(i).toFixed(4)}`;
  for (let t = 0; t < triCount; t++) {
    const a = find(key(t * 3));
    for (let k = 1; k < 3; k++) { const b = find(key(t * 3 + k)); if (a !== b) parent.set(b, a); }
  }
  const comp = new Map<string, number[]>();
  for (let t = 0; t < triCount; t++) {
    const r = find(key(t * 3));
    if (!comp.has(r)) comp.set(r, []);
    comp.get(r)!.push(t);
  }
  const cubeTris: number[] = [];
  const earTris: number[][] = [[], []];
  for (const tris of comp.values()) {
    let cy = 0, cx = 0, eye = false;
    for (const t of tris) {
      for (let k = 0; k < 3; k++) { cx += P.getX(t * 3 + k); cy += P.getY(t * 3 + k); }
      const [cu] = cellOf(U.getX(t * 3), U.getY(t * 3));
      if (cu === 15) eye = true;
    }
    cx /= tris.length * 3; cy /= tris.length * 3;
    if (eye) continue;                                  // baked eyes + nose: replaced by the face decal
    if (cy > 1.05 && tris.length < 120) earTris[cx > 0 ? 0 : 1].push(...tris);
    else cubeTris.push(...tris);
  }

  const cube = buildPart(body, cubeTris, (p, n, uv, i) => {
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    const s = 1 / (2 * H);
    if (az >= ax && az >= ay) n.z > 0 ? auv('F', (p.x + H) * s, p.y * s, uv, i) : auv('B', (H - p.x) * s, p.y * s, uv, i);
    else if (ax >= ay) n.x > 0 ? auv('L', (H - p.z) * s, p.y * s, uv, i) : auv('R', (p.z + H) * s, p.y * s, uv, i);
    else n.y > 0 ? auv('T', (H - p.x) * s, (p.z + H) * s, uv, i) : auv('D', (p.x + H) * s, (p.z + H) * s, uv, i);
  });

  const ears = earTris.map((tris, e) => {
    const piv = EAR_PIVOT[e];
    const g = buildPart(body, tris, (p, n, uv, i, srcUv) => {
      const [cu, cv] = cellOf(srcUv[0], srcUv[1]);
      if (cu === 1 && cv === 2) { auv('pink', 0.5, 0.5, uv, i); return; }
      const v = (p.y - 1.04) / 0.37;
      const u = Math.abs(n.x) > Math.abs(n.z) ? (p.z - 0.16) / 0.32 : (Math.abs(p.x) - 0.17) / 0.33;
      auv(e === 0 ? 'earL' : 'earR', u, v, uv, i);
    });
    g.translate(-piv[0], -piv[1], -piv[2]);
    return g;
  });

  const legSrc = byName('leg-front-left').geometry.toNonIndexed();
  const legs = [0, 1, 2, 3].map((li) => buildPart(legSrc, null, (p, n, uv, i) => {
    const h = LEG_H, s = 1 / (2 * h);
    const v = (p.y + 0.3) / 0.306;
    if (n.y < -0.5) { auv(`paw${li}` as TileKey, (p.x + h) * s, (p.z + h) * s, uv, i); return; }
    if (n.y > 0.5) { auv(`leg${li}` as TileKey, 0.5, 1, uv, i); return; }
    let u: number;
    if (Math.abs(n.z) >= Math.abs(n.x)) u = n.z > 0 ? (p.x + h) * s * 0.25 : (2 + (h - p.x) * s) * 0.25;
    else u = n.x > 0 ? (1 + (h - p.z) * s) * 0.25 : (3 + (p.z + h) * s) * 0.25;
    auv(`leg${li}` as TileKey, u, v, uv, i);
  }));

  const tailSrc = byName('tail').geometry.toNonIndexed();
  const tail = buildPart(tailSrc, null, (p, _n, uv, i) => {
    const s = tailParam(p);
    auv('tail', 0.5 + Math.atan2(p.x, 0.1) * 0.3, s, uv, i);
  });
  skinTail(tail);
  for (const g of [cube, ...ears, ...legs, tail]) addOutlineNormals(g);
  geo = { cube, ears, legs, tail, face: faceDecal(cube) };
  return geo;
}

/**
 * The decal follows the puffy cube's front (flat centre + the four sloped bevels), so eyes and whiskers sit
 * on the surface from any angle and end where the head ends (a flat plane floated up to 3 cm off the bevels).
 */
function faceDecal(cube: THREE.BufferGeometry): THREE.BufferGeometry {
  const P = cube.attributes.position as THREE.BufferAttribute;
  const N = cube.attributes.normal as THREE.BufferAttribute;
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [];
  for (let t = 0; t < P.count / 3; t++) {
    _a.fromBufferAttribute(P, t * 3); _b.fromBufferAttribute(P, t * 3 + 1); _c.fromBufferAttribute(P, t * 3 + 2);
    const nz = _b.clone().sub(_a).cross(_c.clone().sub(_a)).normalize().z;
    if (nz < 0.7) continue;
    for (let k = 0; k < 3; k++) {
      _p.fromBufferAttribute(P, t * 3 + k);
      const y = _p.y - H;
      pos.push(_p.x, y, _p.z + 0.006);
      nrm.push(N.getX(t * 3 + k), N.getY(t * 3 + k), N.getZ(t * 3 + k));
      uv.push((_p.x + FACE_HALF) / (2 * FACE_HALF), (y + FACE_HALF) / (2 * FACE_HALF));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

type UvFn = (p: THREE.Vector3, n: THREE.Vector3, uv: number[], i: number, srcUv: [number, number]) => void;
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
/** copy the given triangles (or all) into a fresh non-indexed geometry with atlas uvs (face normal per tri) */
function buildPart(src: THREE.BufferGeometry, tris: number[] | null, fn: UvFn): THREE.BufferGeometry {
  const P = src.attributes.position as THREE.BufferAttribute;
  const N = src.attributes.normal as THREE.BufferAttribute;
  const U = src.attributes.uv as THREE.BufferAttribute;
  const list = tris ?? Array.from({ length: P.count / 3 }, (_, t) => t);
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [];
  for (const t of list) {
    _a.fromBufferAttribute(P, t * 3); _b.fromBufferAttribute(P, t * 3 + 1); _c.fromBufferAttribute(P, t * 3 + 2);
    const face = _b.clone().sub(_a).cross(_c.clone().sub(_a)).normalize();
    for (let k = 0; k < 3; k++) {
      const i = t * 3 + k;
      _p.fromBufferAttribute(P, i);
      _n.fromBufferAttribute(N, i);
      pos.push(_p.x, _p.y, _p.z);
      nrm.push(_n.x, _n.y, _n.z);
      uv.push(0, 0);
      fn(_p, face, uv, uv.length - 2, [U.getX(i), U.getY(i)]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

/** smoothed normals (averaged per position) for a crack-free inverted-hull outline */
function addOutlineNormals(g: THREE.BufferGeometry) {
  const P = g.attributes.position as THREE.BufferAttribute;
  const N = g.attributes.normal as THREE.BufferAttribute;
  const acc = new Map<string, THREE.Vector3>();
  const k = (i: number) => `${P.getX(i).toFixed(3)},${P.getY(i).toFixed(3)},${P.getZ(i).toFixed(3)}`;
  for (let i = 0; i < P.count; i++) {
    const v = acc.get(k(i)) ?? acc.set(k(i), new THREE.Vector3()).get(k(i))!;
    v.x += N.getX(i); v.y += N.getY(i); v.z += N.getZ(i);
  }
  const out = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const v = acc.get(k(i))!.clone().normalize();
    out.set([v.x, v.y, v.z], i * 3);
  }
  g.setAttribute('onrm', new THREE.BufferAttribute(out, 3));
}

// ---------------------------------------------------------------- tail skinning
const SEGS = [...TAIL_JOINTS, TAIL_TIP];
// own scratch (_r): buildPart hands its shared _p to the uv callback, which calls tailParam(p) -> nearestSeg(p)
const _q = new THREE.Vector3(), _r = new THREE.Vector3(), _s0 = new THREE.Vector3(), _s1 = new THREE.Vector3();
/** nearest segment along the joint polyline: returns [segment index, t] */
function nearestSeg(p: THREE.Vector3): [number, number] {
  let best = 1e9, bi = 0, bt = 0;
  for (let i = 0; i < SEGS.length - 1; i++) {
    _s0.set(...SEGS[i]); _s1.set(...SEGS[i + 1]);
    _q.subVectors(_s1, _s0);
    const t = THREE.MathUtils.clamp(_r.copy(p).sub(_s0).dot(_q) / _q.lengthSq(), 0, 1);
    const d = _r.copy(_s0).addScaledVector(_q, t).distanceToSquared(p);
    if (d < best) { best = d; bi = i; bt = t; }
  }
  return [bi, bt];
}
/** 0 at the base, 1 at the tip */
function tailParam(p: THREE.Vector3): number {
  const [i, t] = nearestSeg(p);
  return (i + t) / (SEGS.length - 1);
}
function skinTail(g: THREE.BufferGeometry) {
  const P = g.attributes.position as THREE.BufferAttribute;
  const idx = new Uint16Array(P.count * 4), w = new Float32Array(P.count * 4);
  const p = new THREE.Vector3();
  for (let v = 0; v < P.count; v++) {
    p.fromBufferAttribute(P, v);
    const [i, t] = nearestSeg(p);
    const last = TAIL_JOINTS.length - 1;
    if (i >= last) { idx[v * 4] = last; w[v * 4] = 1; continue; }
    idx[v * 4] = i; idx[v * 4 + 1] = i + 1;
    w[v * 4] = 1 - t; w[v * 4 + 1] = t;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
}

// ---------------------------------------------------------------- fur atlas
export interface FurPaint {
  tex: THREE.CanvasTexture;
  /** color right under the mouth (decides ink / whisker contrast) */
  muzzle: THREE.Color;
}
const cache = new Map<string, FurPaint>();
const lookKey = (l: CatLook, collar = '') => `${l.pattern}|${l.furColor}|${l.secondaryColor}|${l.pattern === 'calico' || l.pattern === 'tortie' ? l.name : ''}|${collar}`;

const CREAM = new THREE.Color('#fbf3e6');
const PINK = new THREE.Color('#f4a3b5');
const PAD = new THREE.Color('#e98a9f');

/** deterministic 3D value noise */
function hash3(x: number, y: number, z: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise3(x: number, y: number, z: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf), sz = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const w = (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
    r += w * hash3(xi + dx, yi + dy, zi + dz, seed);
  }
  return r;
}
function strHash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) % 100000; }
const sstep = (a: number, b: number, x: number) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** distance from point to segment in 2D */
function segD(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const t = THREE.MathUtils.clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

type Region = 'cube' | 'leg' | 'tail' | 'ear';
/** pattern color at a point. cube: p in cube space. leg: p.x = leg index, p.y = height 0..1, p.z = around 0..1. tail: p.y = 0..1 along. ear: p.x = side (0 L, 1 R), p.y = height 0..1 */
function patternAt(l: CatLook, seed: number, region: Region, x: number, y: number, z: number, out: THREE.Color, fur: THREE.Color, sec: THREE.Color) {
  out.copy(fur);
  const pat = l.pattern;
  if (region === 'cube') {
    const front = z > H - 0.01, top = y > 2 * H - 0.01, bottom = y < 0.01;
    if (pat === 'tabby') {
      // bands run front to back over the top and sides; the back face (constant z) gets horizontal rings instead
      const back = z < -H + 0.01;
      const band = back ? y * 2.6 + Math.sin(x * 6 + seed) * 0.1 : (z + H) * 2.4 + Math.sin(x * 5 + seed) * 0.12;
      const stripeW = top ? 0.34 : back ? 0.3 * sstep(0.2, 0.5, y) : 0.34 * sstep(0.1, 1.0, y);
      const bd = Math.abs(band - Math.round(band)) - stripeW * 0.5;
      if (!front && !bottom && z < H - 0.08) out.lerp(sec, 0.85 * sstep(0.025, -0.025, bd));
      if (front) {
        // forehead M + cheek stripes
        const fx = x, fy = y;
        const m = Math.min(segD(fx, fy, -0.2, 1.0, -0.1, 1.2), segD(fx, fy, -0.1, 1.2, 0, 1.03), segD(fx, fy, 0, 1.03, 0.1, 1.2), segD(fx, fy, 0.1, 1.2, 0.2, 1.0));
        const cheek = Math.min(segD(Math.abs(fx), fy, 0.48, 0.52, 0.62, 0.56), segD(Math.abs(fx), fy, 0.5, 0.42, 0.62, 0.44));
        out.lerp(sec, 0.85 * Math.max(sstep(0.055, 0.035, m), sstep(0.04, 0.02, cheek)));
        out.lerp(CREAM, 0.35 * sstep(0.34, 0.2, Math.hypot(fx * 0.8, fy - 0.2)));
      }
      if (bottom) out.lerp(CREAM, 0.4);
    } else if (pat === 'tuxedo') {
      // fur = the dark coat, secondary = the white bib
      let white = 0;
      if (front) white = Math.max(sstep(0.03, -0.03, y - (0.58 - 0.75 * Math.abs(x))), sstep(0.09, 0.06, Math.abs(x)) * sstep(0.66, 0.6, y));
      if (bottom) white = 1;
      if (!front && !top && !bottom && z > 0.2 && y < 0.18) white = 1;
      out.lerp(sec, white);
    } else if (pat === 'calico') {
      out.copy(CREAM);
      const n1 = noise3(x * 1.9 + 3, y * 1.9, z * 1.9, seed), n2 = noise3(x * 2.1, y * 2.1 + 7, z * 2.1, seed + 17);
      out.lerp(fur, sstep(0.5, 0.54, n1));
      out.lerp(sec, sstep(0.58, 0.62, n2));
      if (front && y < 0.6 && Math.abs(x) < 0.32 + (0.6 - y) * 0.4) out.copy(CREAM);
      if (bottom) out.copy(CREAM);
    } else if (pat === 'siamese') {
      if (front) {
        const d = Math.hypot(x * 0.9, (y - 0.5) * 1.1);
        out.lerp(sec, sstep(0.62, 0.18, d));
      } else if (top) out.lerp(sec, 0.12);
      else if (bottom) out.lerp(CREAM, 0.3);
      else out.lerp(sec, 0.1 * (y / (2 * H)));
    } else if (pat === 'tortie') {
      const n = noise3(x * 3.2, y * 3.2, z * 3.2, seed) * 0.7 + noise3(x * 7, y * 7, z * 7, seed + 5) * 0.3;
      out.copy(fur).lerp(sec, sstep(0.48, 0.52, n));
      if (front) {
        // split face
        const split = x + (noise3(0, y * 4, 0, seed) - 0.5) * 0.15;
        if (Math.abs(split) < 0.05 && y < 1.15) out.lerp(new THREE.Color('#f0b46e'), 0.6);
        else out.copy(split > 0 ? fur : sec);
      }
    }
    // Kenney-style soft vertical gradient (lighter top)
    out.multiplyScalar(top ? 1.04 : 0.86 + 0.14 * (y / (2 * H)));
    return;
  }
  if (region === 'leg') {
    const li = x, v = y;
    const back = li >= 2;
    if (pat === 'tabby') out.lerp(sec, 0.8 * Math.max(sstep(0.08, 0.06, Math.abs(v - 0.5)), sstep(0.07, 0.05, Math.abs(v - 0.78))));
    else if (pat === 'tuxedo') out.lerp(sec, sstep(0.02, -0.02, v - (back ? 0.62 : 0.48)));
    else if (pat === 'calico') {
      out.copy(CREAM);
      const r = hash3(li, 1, 2, seed);
      if (r > 0.55 && v > 0.45) out.copy(r > 0.8 ? sec : fur);
    } else if (pat === 'siamese') out.lerp(sec, sstep(0.9, 0.2, v));
    else if (pat === 'tortie') { const n = noise3(li * 3 + z * 3, v * 3, 0, seed); out.copy(n > 0.5 ? sec : fur); }
    out.multiplyScalar(0.82 + 0.12 * v);
    return;
  }
  if (region === 'tail') {
    const s = y;
    if (pat === 'tabby') out.lerp(sec, 0.85 * Math.max(sstep(0.24, 0.16, Math.abs(s * 6.5 - Math.round(s * 6.5))), sstep(0.88, 0.92, s)));
    else if (pat === 'tuxedo') out.lerp(sec, sstep(0.88, 0.92, s));
    else if (pat === 'calico') { const r = noise3(s * 4, 0, 0, seed + 9); out.copy(r > 0.62 ? sec : r > 0.4 ? fur : CREAM); }
    else if (pat === 'siamese') out.lerp(sec, sstep(0.05, 0.5, s));
    else if (pat === 'tortie') { const n = noise3(s * 6, z * 2, 0, seed); out.copy(n > 0.5 ? sec : fur); }
    out.multiplyScalar(0.92 + 0.08 * s);
    return;
  }
  // ear
  const side = x, h = y;
  if (pat === 'tabby') out.lerp(sec, sstep(0.55, 0.95, h) * 0.7);
  else if (pat === 'calico') out.copy(side === 0 ? fur : sec);
  else if (pat === 'siamese') out.copy(sec);
  else if (pat === 'tortie') out.copy(side === 0 ? fur : sec);
  out.multiplyScalar(0.95 + 0.08 * h);
}

/** perceived lightness of a CSS hex (sRGB) */
function lightness(hex: string) {
  const c = new THREE.Color(hex).convertLinearToSRGB();
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}
/**
 * The two paint colors a pattern actually uses. Menu coats often pair a fur with a lighter secondary,
 * so each pattern picks what it needs: tabby stripes and siamese points are always darker than the base,
 * tuxedo is dark coat + light bib, calico / tortie always get a dark patch color.
 */
function patternColors(l: CatLook): [THREE.Color, THREE.Color] {
  const f = l.furColor || '#f2a65a', sc = l.secondaryColor || f;
  const lf = lightness(f), ls = lightness(sc);
  const fur = new THREE.Color(f), sec = new THREE.Color(sc);
  const darker = (c: THREE.Color, k: number) => c.clone().multiplyScalar(k).lerp(new THREE.Color('#4a2c1c'), 0.15);
  const white = new THREE.Color('#f7f2ea');
  switch (l.pattern) {
    // stripes need contrast: a barely darker secondary (white coat + beige) gets real stripes instead
    case 'tabby': return [fur, ls < lf - 0.2 ? sec : darker(fur, 0.5)];
    // dark coat + light bib; light coats become bicolors (ginger and white, blue and white), never a muddy darkened coat
    case 'tuxedo':
      if (Math.abs(lf - ls) >= 0.3) return lf < ls ? [fur, sec] : [sec, fur];
      if (lf < 0.88) return [fur, white];
      return [new THREE.Color('#8c8580'), fur];
    // pale body, darker points: ginger + cream -> flame point, cocoa + cream -> chocolate point; a dark-only coat gets a pale body
    case 'siamese': {
      const [body, pts] = Math.abs(lf - ls) >= 0.15 ? (lf > ls ? [fur, sec] : [sec, fur]) : [fur, darker(fur, 0.32)];
      return [Math.max(lf, ls) < 0.55 ? body.clone().lerp(white, 0.7) : body, pts];
    }
    case 'calico': case 'tortie': {
      const a = lf > 0.72 ? new THREE.Color(l.pattern === 'calico' ? '#e8913f' : '#d9823b') : fur;
      const dark = Math.min(lf, ls) < 0.25 ? (lf < ls ? fur : sec) : new THREE.Color('#33292a');
      return [a.equals(dark) ? new THREE.Color('#e8913f') : a, dark];
    }
    default: return [fur, sec];
  }
}

/** paint (or fetch) the fur atlas for a look */
export function furPaint(l: CatLook, collar?: string): FurPaint {
  const k = lookKey(l, collar);
  const hit = cache.get(k);
  if (hit) { cache.delete(k); cache.set(k, hit); return hit; }
  const W = COLS * TILE, Hh = ROWS * TILE;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = Hh;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, Hh);
  const [fur, sec] = patternColors(l);
  const seed = strHash(l.name || 'cat');
  const c = new THREE.Color();
  const band = collar ? new THREE.Color(collar) : null;
  /** collar band around the cube just under the mouth (bell collar) */
  const collarAt = (y: number, bottomFace: boolean) => { if (band && !bottomFace && y > 0.17 && y < 0.27) c.copy(band).multiplyScalar(y > 0.25 ? 0.8 : 1); };
  const put = (px: number, py: number) => {
    // write in sRGB bytes (canvas texture is sRGB)
    const i = (py * W + px) * 4;
    const s = c.clone().convertLinearToSRGB();
    img.data[i] = s.r * 255; img.data[i + 1] = s.g * 255; img.data[i + 2] = s.b * 255; img.data[i + 3] = 255;
  };
  const tiles = Object.keys(T) as TileKey[];
  for (const tk of tiles) {
    const [tc, tr] = T[tk];
    for (let py = 0; py < TILE; py++) for (let px = 0; px < TILE; px++) {
      const u = (px + 0.5) / TILE, v = 1 - (py + 0.5) / TILE;
      if (tk === 'F') { patternAt(l, seed, 'cube', u * 2 * H - H, v * 2 * H, H, c, fur, sec); collarAt(v * 2 * H, false); }
      else if (tk === 'B') { patternAt(l, seed, 'cube', H - u * 2 * H, v * 2 * H, -H, c, fur, sec); collarAt(v * 2 * H, false); }
      else if (tk === 'L') { patternAt(l, seed, 'cube', H, v * 2 * H, H - u * 2 * H, c, fur, sec); collarAt(v * 2 * H, false); }
      else if (tk === 'R') { patternAt(l, seed, 'cube', -H, v * 2 * H, u * 2 * H - H, c, fur, sec); collarAt(v * 2 * H, false); }
      else if (tk === 'T') patternAt(l, seed, 'cube', H - u * 2 * H, 2 * H, v * 2 * H - H, c, fur, sec);
      else if (tk === 'D') patternAt(l, seed, 'cube', u * 2 * H - H, 0, v * 2 * H - H, c, fur, sec);
      else if (tk === 'earL' || tk === 'earR') patternAt(l, seed, 'ear', tk === 'earL' ? 0 : 1, v, 0, c, fur, sec);
      else if (tk === 'tail') patternAt(l, seed, 'tail', 0, v, u, c, fur, sec);
      else if (tk === 'pink') c.copy(PINK);
      else if (tk.startsWith('leg')) patternAt(l, seed, 'leg', +tk[3], v, u, c, fur, sec);
      else if (tk.startsWith('paw')) {
        const li = +tk[3];
        patternAt(l, seed, 'leg', li, 0.02, 0.5, c, fur, sec);
        // toe beans: main pad + 4 toes (v = 1 is the front of the paw)
        const x = u * 2 - 1, y = v * 2 - 1;
        const main = Math.hypot((x) / 0.42, (y + 0.3) / 0.32);
        let bean = main < 1 ? 1 : 0;
        for (const [bx, by] of [[-0.55, 0.28], [-0.2, 0.55], [0.2, 0.55], [0.55, 0.28]]) if (Math.hypot((x - bx) / 0.18, (y - by) / 0.2) < 1) bean = 1;
        if (bean) c.copy(PAD);
      }
      put(tc * TILE + px, tr * TILE + py);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const muzzle = new THREE.Color();
  patternAt(l, seed, 'cube', 0, 0.45, H, muzzle, fur, sec);
  const paint = { tex, muzzle };
  cache.set(k, paint);
  // menu color pickers create a look per change: keep the newest few (a disposed texture re-uploads if still in use)
  if (cache.size > 24) { const [oldK, old] = cache.entries().next().value!; cache.delete(oldK); old.tex.dispose(); }
  return paint;
}
