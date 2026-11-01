/**
 * Sitter looks: preset SitterLooks + palette repaint of the KayKit Rogue atlas (8 x 4 gradient cells).
 * Cells are [col, row], row 0 = top of the image (glTF UVs, flipY false).
 */
import * as THREE from 'three';
import type { SitterLook } from '../../shared/contracts';

/** menu / bot presets */
export const SITTER_LOOKS: SitterLook[] = [
  { name: 'Sam', skin: '#f1c7a5', hair: '#5a3b2a', shirt: '#e0785c' },
  { name: 'Robin', skin: '#8d5a3b', hair: '#1f1a17', shirt: '#7fb2a0' },
  { name: 'Alex', skin: '#f6d3b8', hair: '#d9a84e', shirt: '#6f86c9' },
  { name: 'Jo', skin: '#c99068', hair: '#a8452c', shirt: '#f2c45a' },
  { name: 'Kim', skin: '#e9c09a', hair: '#2b2b33', shirt: '#b88ac9' },
];

/** the two owners in the end show (ADDENDUM 5.1): A plain, B holds the grocery bag */
export const OWNER_LOOKS: readonly [SitterLook, SitterLook] = [
  { name: 'Owner A', skin: '#e8b894', hair: '#3b2a20', shirt: '#6a8caf' },
  { name: 'Owner B', skin: '#c98e62', hair: '#1e1a17', shirt: '#c46a4a' },
];

export type Cell = readonly [number, number];
export const CELL = {
  skin: [[0, 0], [5, 2]] as Cell[],      // face + ears + ankles, hands (mittens)
  eyes: [2, 0] as Cell,                  // baked eyes (hidden by uv remap, see sitter.ts)
  hair: [[1, 0]] as Cell[],
  shirt: [[0, 1]] as Cell[],             // tunic, sleeves
  accent: [[1, 1]] as Cell[],            // scarf + cuffs
  shirtDark: [[5, 0], [6, 0]] as Cell[], // belt + shoulder pads, pouches
  pants: [[7, 1]] as Cell[],
  shoes: [[3, 2]] as Cell[],
};
const PANTS = '#3f4c66';
const SHOES = '#f3eee4';
const SIZE = 512;
const CS = SIZE / 8; // cell width in px; cells are twice as tall (atlas 8 x 4)

const lookKey = (l: SitterLook) => `${l.skin}|${l.hair}|${l.shirt}`;
const cache = new Map<string, THREE.CanvasTexture>();

/**
 * Repainted copy of the atlas for a look (cached per look, shared by instances).
 * refV: cell-local v (0 top .. 1 bottom) where that cell is mostly sampled, so the visible tone matches the hex.
 */
export function paletteFor(base: THREE.Texture, look: SitterLook, refV: (c: Cell) => number): THREE.Texture {
  const key = lookKey(look);
  const hit = cache.get(key);
  if (hit) return hit;
  const img = base.image as CanvasImageSource & { width: number; height: number };
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const shirt = new THREE.Color(look.shirt);
  const paint = (cells: Cell[], hex: THREE.Color | string, soft = 0.75) => {
    const c = typeof hex === 'string' ? new THREE.Color(hex) : hex;
    for (const cell of cells) repaint(ctx, cell, c, refV(cell), soft);
  };
  paint(CELL.skin, look.skin, 0.6);
  paint(CELL.hair, look.hair, 0.8);
  paint(CELL.shirt, shirt);
  paint(CELL.accent, shirt.clone().multiplyScalar(0.72));
  paint(CELL.shirtDark, shirt.clone().multiplyScalar(0.62));
  paint(CELL.pants, PANTS);
  paint(CELL.shoes, SHOES, 0.5);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = base.wrapS;
  tex.wrapT = base.wrapT;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

/** multiply the cell's own shading (luminance / luminance at refV) onto the target color */
function repaint(ctx: CanvasRenderingContext2D, [col, row]: Cell, c: THREE.Color, refV: number, soft: number) {
  const w = CS, h = CS * 2; // atlas cells are 128 x 256 in the 1024 source -> 64 x 128 here
  const x0 = col * w, y0 = row * h;
  const d = ctx.getImageData(x0, y0, w, h);
  const px = d.data;
  const lum = (i: number) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const ry = Math.min(h - 1, Math.max(0, Math.round(refV * (h - 1))));
  let ref = 0;
  const cols = Math.floor(w * 0.8);
  for (let x = 0; x < cols; x++) ref += lum((ry * w + x) * 4);
  ref = Math.max(1, ref / cols);
  const s = c.clone().convertLinearToSRGB(); // canvas bytes are sRGB
  for (let i = 0; i < px.length; i += 4) {
    const k = 1 + (lum(i) / ref - 1) * soft;
    px[i] = Math.min(255, s.r * 255 * k);
    px[i + 1] = Math.min(255, s.g * 255 * k);
    px[i + 2] = Math.min(255, s.b * 255 * k);
  }
  ctx.putImageData(d, x0, y0);
}
