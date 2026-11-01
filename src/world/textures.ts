/** Canvas textures for architecture surfaces (floors, outdoor ground). One texture per kind, cached. */
import * as THREE from 'three';

export type SurfaceKind = 'wood' | 'woodDark' | 'kitchenTile' | 'bathTile' | 'wallTile' | 'grass' | 'herring';

/** meters covered by one texture repeat */
export const TILE_M: Record<SurfaceKind, number> = { wood: 2.4, woodDark: 2.4, kitchenTile: 1.2, bathTile: 0.8, wallTile: 0.6, grass: 6, herring: 2.0 };

const cache = new Map<SurfaceKind, THREE.CanvasTexture>();

/** tiny deterministic rng so floors look the same every load */
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, k);
  return `#${c.getHexString()}`;
}

function planks(g: CanvasRenderingContext2D, S: number, base: string, r: () => number) {
  const rows = 12, h = S / rows;
  for (let i = 0; i < rows; i++) {
    let x = -r() * S;
    while (x < S) {
      const w = S * (0.35 + r() * 0.45);
      g.fillStyle = shade(base, (r() - 0.5) * 0.07);
      g.fillRect(x, i * h, w, h);
      // soft grain streaks
      g.strokeStyle = shade(base, -0.06);
      g.globalAlpha = 0.18;
      g.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        const y = i * h + h * (0.2 + r() * 0.6);
        g.beginPath();
        g.moveTo(x + 4, y);
        g.bezierCurveTo(x + w * 0.3, y + (r() - 0.5) * 4, x + w * 0.6, y + (r() - 0.5) * 4, x + w - 4, y);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = shade(base, -0.16);
      g.fillRect(x, i * h, 2, h); // plank end seam
      x += w;
    }
    g.fillStyle = shade(base, -0.14);
    g.fillRect(0, i * h, S, 2); // long seam
  }
}

function tiles(g: CanvasRenderingContext2D, S: number, n: number, a: string, b: string, grout: string, r: () => number) {
  const t = S / n;
  g.fillStyle = grout;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = shade((i + j) % 2 ? a : b, (r() - 0.5) * 0.03);
    g.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(i * t + 4, j * t + 4, t * 0.5, 3); // glaze glint
  }
}

function draw(kind: SurfaceKind): HTMLCanvasElement {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = rng(kind.length * 7919 + 13);
  if (kind === 'wood') planks(g, S, '#d9a46c', r);
  else if (kind === 'woodDark') planks(g, S, '#c48a55', r);
  else if (kind === 'kitchenTile') tiles(g, S, 4, '#efe2cc', '#e6c3a2', '#c9b59b', r);
  else if (kind === 'bathTile') tiles(g, S, 6, '#bfdcd6', '#a9cfc8', '#8fb3ac', r);
  else if (kind === 'wallTile') tiles(g, S, 4, '#f4f7f2', '#e6f1ec', '#b9cdc6', r);
  else if (kind === 'herring') {
    // basket-weave parquet: 8x8 blocks of 3 strips, alternating direction
    const n = 8, b = S / n, st = b / 3;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < 3; k++) {
      g.fillStyle = shade('#c48d58', (r() - 0.5) * 0.1);
      if ((i + j) % 2) g.fillRect(i * b + 1, j * b + k * st + 1, b - 2, st - 2);
      else g.fillRect(i * b + k * st + 1, j * b + 1, st - 2, b - 2);
    }
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = '#8a5d36';
    g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'source-over';
  } else {
    g.fillStyle = '#9cc47a';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() > 0.5 ? '#8ab869' : '#addb88';
      g.globalAlpha = 0.5;
      g.fillRect(r() * S, r() * S, 2, 5 + r() * 5);
    }
    g.globalAlpha = 1;
  }
  return c;
}

export function surfaceTexture(kind: SurfaceKind): THREE.CanvasTexture {
  let t = cache.get(kind);
  if (!t) {
    t = new THREE.CanvasTexture(draw(kind));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    cache.set(kind, t);
  }
  return t;
}
