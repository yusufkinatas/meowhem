/** Canvas painting helpers for FX sprites and mess decals. Everything is drawn once and cached. */
import * as THREE from 'three';
import { OUTLINE_COLOR } from '../shared/toon';

export const OL = OUTLINE_COLOR;
export const TAU = Math.PI * 2;

const cache = new Map<string, THREE.CanvasTexture>();

/**
 * Cached canvas texture. `draw` works in unit space: y spans 0..1 (canvas height), x spans 0..aspect.
 */
export function paintTex(key: string, draw: (g: CanvasRenderingContext2D) => void, px = 128, aspect = 1): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(px * aspect));
  c.height = px;
  const g = c.getContext('2d')!;
  g.setTransform(px, 0, 0, px, 0, 0);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

export function disposePaint(): void {
  cache.forEach((t) => t.dispose());
  cache.clear();
}

// ---------------------------------------------------------------- color
const _c = new THREE.Color();
const _rgb = { r: 0, g: 0, b: 0 };
function rgb(col: string): [number, number, number] {
  _c.set(col).getRGB(_rgb, THREE.SRGBColorSpace);
  return [_rgb.r, _rgb.g, _rgb.b];
}
/** sRGB mix, returns a CSS color. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b);
  const ch = (i: number) => Math.round((x[i] + (y[i] - x[i]) * t) * 255);
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
}
/** toon shadow tone: darker, slightly cool */
export const dark = (c: string, t = 0.3) => mix(c, '#3b2550', t);
export const light = (c: string, t = 0.45) => mix(c, '#ffffff', t);

// ---------------------------------------------------------------- shapes
export function circ(x: number, y: number, r: number): Path2D {
  const p = new Path2D();
  p.arc(x, y, r, 0, TAU);
  return p;
}
export function ellipse(x: number, y: number, rx: number, ry: number, rot = 0): Path2D {
  const p = new Path2D();
  p.ellipse(x, y, rx, ry, rot, 0, TAU);
  return p;
}
export function poly(pts: number[]): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath();
  return p;
}
/** Smooth closed blob through points (quadratic midpoints). */
export function smooth(pts: number[]): Path2D {
  const p = new Path2D();
  const n = pts.length / 2;
  const mx = (i: number) => (pts[(i % n) * 2] + pts[((i + 1) % n) * 2]) / 2;
  const my = (i: number) => (pts[(i % n) * 2 + 1] + pts[((i + 1) % n) * 2 + 1]) / 2;
  p.moveTo(mx(0), my(0));
  for (let i = 1; i <= n; i++) p.quadraticCurveTo(pts[(i % n) * 2], pts[(i % n) * 2 + 1], mx(i), my(i));
  p.closePath();
  return p;
}
/** Irregular round blob around (x,y). */
export function wobblyBlob(x: number, y: number, r: number, n: number, jitter: number, rnd: () => number): Path2D {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (1 - jitter + rnd() * jitter * 2);
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  return smooth(pts);
}

// ---------------------------------------------------------------- toon fills
/**
 * Outlined toon fill: dark outline, shadow rim on the lower right, base color elsewhere.
 * `ol` = outline half-width, `rim` = shadow offset (unit space).
 */
export function blob(g: CanvasRenderingContext2D, p: Path2D, col: string, ol = 0.045, rim = 0.07): void {
  if (ol > 0) {
    g.lineWidth = ol * 2;
    g.strokeStyle = OL;
    g.stroke(p);
  }
  g.fillStyle = rim > 0 ? dark(col) : col;
  g.fill(p);
  if (rim > 0) {
    g.save();
    g.clip(p);
    g.translate(-rim, -rim);
    g.fillStyle = col;
    g.fill(p);
    g.restore();
  }
}
/** white glossy highlight */
export function shine(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = -0.6, a = 0.9): void {
  g.fillStyle = `rgba(255,255,255,${a})`;
  g.fill(ellipse(x, y, rx, ry, rot));
}
/** Outlined thick stroke (letters, veins, wavy lines). */
export function glyph(g: CanvasRenderingContext2D, p: Path2D, w: number, col: string, ol = 0.04): void {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (ol > 0) {
    g.lineWidth = w + ol * 2;
    g.strokeStyle = OL;
    g.stroke(p);
  }
  g.lineWidth = w;
  g.strokeStyle = col;
  g.stroke(p);
}

/** Small deterministic PRNG so decals look the same every load. */
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
