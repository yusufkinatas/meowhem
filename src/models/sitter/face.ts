/**
 * Sitter face: one canvas decal (brows, eyes, mouth) conformed onto the front of the KayKit head.
 * Canvas covers the face box x -0.30..0.30, y 1.24..1.84 in head-mesh units (see sitter.ts), 512 px square.
 * Redrawn only when something visible changes.
 */
import * as THREE from 'three';
import type { SitterVisualState } from '../../shared/contracts';
import { gradientMap } from '../../shared/toon';

export type SitterFace = SitterVisualState['face'];

const N = 512;
const INK = '#2b1d18';
const MOUTH = '#5e2420';
const TONGUE = '#e8737a';
const WHITE = '#fffaf3';
// layout (px)
const EYE_X = 124, EYE_Y = 206, EYE_RX = 40, EYE_RY = 56;
const BROW_Y = 104, BROW_LEN = 96;
const MOUTH_X = 256, MOUTH_Y = 410, MOUTH_SCALE = 1.3; // big enough to read from across a room

export interface FaceParams {
  face: SitterFace;
  blink: number;   // 0 open .. 1 closed
  lx: number;      // pupil look -1..1 (viewer's right = +)
  ly: number;      // -1..1 (up = +)
  brow: string;    // hair-ish color
  jitter: number;  // frame counter for shaky faces (panic)
}

export class SitterFaceDecal {
  readonly mesh: THREE.Mesh;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private key = '';

  constructor(geometry: THREE.BufferGeometry) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    this.ctx = cv.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const mat = new THREE.MeshToonMaterial({
      map: this.tex, gradientMap: gradientMap(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(geometry, mat);
    this.mesh.name = 'sitterFace';
    this.mesh.renderOrder = 2;
    this.mesh.castShadow = false;
    this.mesh.raycast = () => {};
  }

  set(p: FaceParams) {
    const shaky = p.face === 'panic' || p.face === 'shock';
    const key = `${p.face}|${p.blink.toFixed(1)}|${Math.round(p.lx * 4)}|${Math.round(p.ly * 4)}|${p.brow}|${shaky ? p.jitter : 0}`;
    if (key === this.key) return;
    this.key = key;
    drawFace(this.ctx, p);
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.tex.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ---------------------------------------------------------------- drawing

/** per-face shape parameters. lid: top lid cut 0..1 (inner, outer). brow: y offset px (inner, outer), up = negative */
interface Spec {
  eye: 'dot' | 'white' | 'happy' | 'squeeze';
  lid: [number, number];
  brow: [number, number];
  browR?: [number, number]; // viewer's right brow if different (smug)
  pupil: number;            // white eyes: pupil radius
  blush: number;
  bags?: boolean;
  green?: boolean;
}
const SPECS: Record<SitterFace, Spec> = {
  neutral: { eye: 'dot', lid: [0, 0], brow: [0, 0], pupil: 0, blush: 0 },
  angry: { eye: 'dot', lid: [0.52, 0.12], brow: [34, -16], pupil: 0, blush: 0 },
  panic: { eye: 'white', lid: [0, 0], brow: [-26, 14], pupil: 13, blush: 0 },
  smug: { eye: 'dot', lid: [0.5, 0.46], brow: [8, 6], browR: [-22, -30], pupil: 0, blush: 0.25 },
  tired: { eye: 'dot', lid: [0.55, 0.68], brow: [-4, 16], pupil: 0, blush: 0, bags: true },
  shock: { eye: 'white', lid: [0, 0], brow: [-40, -30], pupil: 9, blush: 0 },
  happy: { eye: 'happy', lid: [0, 0], brow: [-14, -8], pupil: 0, blush: 0.55 },
  gag: { eye: 'squeeze', lid: [0, 0], brow: [22, 2], pupil: 0, blush: 0, green: true },
};

function drawFace(ctx: CanvasRenderingContext2D, p: FaceParams) {
  const s = SPECS[p.face] ?? SPECS.neutral;
  ctx.clearRect(0, 0, N, N);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const rnd = mulberry(p.jitter * 7919 + 1);
  const jx = p.face === 'panic' ? (rnd() - 0.5) * 6 : 0, jy = p.face === 'panic' ? (rnd() - 0.5) * 6 : 0;

  if (s.green) {
    const g = ctx.createRadialGradient(MOUTH_X, MOUTH_Y - 30, 10, MOUTH_X, MOUTH_Y - 30, 200);
    g.addColorStop(0, 'rgba(120,190,90,0.55)');
    g.addColorStop(1, 'rgba(120,190,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 230, N, N - 230);
  }
  if (s.blush > 0) {
    for (const x of [EYE_X - 26, N - EYE_X + 26]) {
      const g = ctx.createRadialGradient(x, 330, 4, x, 330, 52);
      g.addColorStop(0, `rgba(255,120,110,${s.blush})`);
      g.addColorStop(1, 'rgba(255,120,110,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 60, 270, 120, 120);
    }
  }

  // brows (side -1 = viewer's left, inner end toward the center)
  for (const side of [-1, 1]) {
    const b = side === 1 && s.browR ? s.browR : s.brow;
    const cx = N / 2 + side * (N / 2 - EYE_X);
    const innerX = cx - side * BROW_LEN * 0.5, outerX = cx + side * BROW_LEN * 0.5;
    const iy = BROW_Y + b[0] + jy * 0.5, oy = BROW_Y + b[1] + jy * 0.5;
    ctx.strokeStyle = p.brow;
    ctx.lineWidth = p.face === 'angry' ? 26 : 22;
    ctx.beginPath();
    ctx.moveTo(innerX, iy);
    ctx.quadraticCurveTo(cx, (iy + oy) / 2 - 12, outerX, oy);
    ctx.stroke();
  }

  // eyes
  const closed = s.eye === 'dot' || s.eye === 'white' ? p.blink : 0;
  for (const side of [-1, 1]) {
    const cx = N / 2 + side * (N / 2 - EYE_X) + jx, cy = EYE_Y + jy;
    if (s.eye === 'happy') { arcEye(ctx, cx, cy + 8, EYE_RX * 0.95); continue; }
    if (s.eye === 'squeeze') { chevron(ctx, cx, cy, side); continue; }
    if (closed > 0.7) { closedEye(ctx, cx, cy + EYE_RY * 0.25, EYE_RX); continue; }
    // lid cut line: inner end / outer end heights
    const lidIn = Math.max(s.lid[0], closed), lidOut = Math.max(s.lid[1], closed);
    const top = cy - EYE_RY * 1.2;
    const yIn = top + EYE_RY * 2.4 * lidIn * 0.85, yOut = top + EYE_RY * 2.4 * lidOut * 0.85;
    const xIn = cx - side * EYE_RX * 1.3, xOut = cx + side * EYE_RX * 1.3;
    ctx.save();
    if (lidIn > 0 || lidOut > 0) {
      ctx.beginPath();
      ctx.moveTo(xIn, yIn);
      ctx.lineTo(xOut, yOut);
      ctx.lineTo(xOut, cy + EYE_RY * 2);
      ctx.lineTo(xIn, cy + EYE_RY * 2);
      ctx.closePath();
      ctx.clip();
    }
    if (s.eye === 'white') {
      const rx = EYE_RX * 1.12, ry = EYE_RY * 1.05;
      ctx.fillStyle = WHITE;
      ellipse(ctx, cx, cy, rx, ry);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.fillStyle = INK;
      const px = cx + p.lx * rx * 0.35 + (p.face === 'panic' ? (rnd() - 0.5) * 8 : 0);
      const py = cy - p.ly * ry * 0.3;
      ellipse(ctx, px, py, s.pupil, s.pupil * 1.15);
      ctx.fill();
    } else {
      const px = cx + p.lx * 9, py = cy - p.ly * 8;
      ctx.fillStyle = INK;
      ellipse(ctx, px, py, EYE_RX, EYE_RY);
      ctx.fill();
      ctx.fillStyle = WHITE;
      ellipse(ctx, px - EYE_RX * 0.32, py - EYE_RY * 0.4, EYE_RX * 0.34, EYE_RY * 0.27);
      ctx.fill();
      ellipse(ctx, px + EYE_RX * 0.3, py + EYE_RY * 0.35, EYE_RX * 0.14, EYE_RY * 0.1);
      ctx.fill();
    }
    ctx.restore();
    if (lidIn > 0 || lidOut > 0) {
      // the lid edge
      ctx.strokeStyle = INK;
      ctx.lineWidth = 12;
      ctx.beginPath();
      const k = 0.62;
      ctx.moveTo(cx - side * EYE_RX * 1.05, yIn + (yOut - yIn) * (0.5 - k / 2 * 1.3));
      ctx.lineTo(cx + side * EYE_RX * 1.05, yIn + (yOut - yIn) * (0.5 + k / 2 * 1.3));
      ctx.stroke();
    }
    if (s.bags) {
      ctx.strokeStyle = 'rgba(80,50,60,0.55)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(cx, cy + EYE_RY * 0.55, EYE_RX * 0.95, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
    }
  }

  drawMouth(ctx, p.face, jx, jy, rnd);
}

function drawMouth(ctx: CanvasRenderingContext2D, face: SitterFace, jx: number, jy: number, rnd: () => number) {
  const x = MOUTH_X + jx * 0.5, y = MOUTH_Y + jy * 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(MOUTH_SCALE, MOUTH_SCALE);
  ctx.translate(-x, -y);
  ctx.strokeStyle = INK;
  ctx.fillStyle = MOUTH;
  switch (face) {
    case 'neutral':
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.moveTo(x - 38, y - 6);
      ctx.quadraticCurveTo(x, y + 16, x + 38, y - 6);
      ctx.stroke();
      break;
    case 'angry': { // gritted teeth
      const w = 108, h = 44;
      ctx.fillStyle = WHITE;
      roundRect(ctx, x - w / 2, y - h / 2 + 4, w, h, 14);
      ctx.fill();
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x - w / 2 + 6, y + 4);
      ctx.lineTo(x + w / 2 - 6, y + 4);
      for (const dx of [-28, 0, 28]) { ctx.moveTo(x + dx, y - h / 2 + 6); ctx.lineTo(x + dx, y + h / 2 + 2); }
      ctx.stroke();
      break;
    }
    case 'panic': { // big wobbly open mouth, top teeth
      const w = 52 + rnd() * 6, h = 48 + rnd() * 6;
      ellipse(ctx, x, y + 10, w, h);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = TONGUE;
      ellipse(ctx, x, y + 10 + h * 0.85, w * 0.8, h * 0.55);
      ctx.fill();
      ctx.fillStyle = WHITE;
      ctx.fillRect(x - w, y + 10 - h, w * 2, h * 0.38);
      ctx.restore();
      ctx.lineWidth = 9;
      ellipse(ctx, x, y + 10, w, h);
      ctx.stroke();
      break;
    }
    case 'smug':
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.moveTo(x - 40, y + 4);
      ctx.quadraticCurveTo(x + 8, y + 14, x + 48, y - 20);
      ctx.stroke();
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(x + 40, y - 28);
      ctx.lineTo(x + 56, y - 10);
      ctx.stroke();
      break;
    case 'tired':
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(x - 44, y + 2);
      for (let i = 1; i <= 6; i++) ctx.lineTo(x - 44 + i * 14.6, y + 2 + (i % 2 ? -7 : 7));
      ctx.stroke();
      break;
    case 'shock':
      ellipse(ctx, x, y + 10, 28, 38);
      ctx.fill();
      ctx.lineWidth = 9;
      ctx.stroke();
      break;
    case 'happy': { // open D smile with tongue
      ctx.beginPath();
      ctx.moveTo(x - 60, y - 16);
      ctx.quadraticCurveTo(x, y - 22, x + 60, y - 16);
      ctx.quadraticCurveTo(x + 56, y + 54, x, y + 56);
      ctx.quadraticCurveTo(x - 56, y + 54, x - 60, y - 16);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = TONGUE;
      ellipse(ctx, x, y + 54, 40, 28);
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 10;
      ctx.stroke();
      break;
    }
    case 'gag': { // wavy grimace, tongue out
      ctx.fillStyle = TONGUE;
      roundRect(ctx, x - 4, y + 2, 36, 56, 16);
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(x - 56, y + 4);
      for (let i = 1; i <= 8; i++) ctx.lineTo(x - 56 + i * 14, y + 4 + (i % 2 ? -10 : 8));
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- helpers

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function arcEye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 17;
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI * 1.12, Math.PI * 1.88);
  ctx.stroke();
}
function closedEye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.9, r * 1.1, Math.PI * 0.25, Math.PI * 0.75);
  ctx.stroke();
}
function chevron(ctx: CanvasRenderingContext2D, x: number, y: number, side: number) {
  // > <  pointing toward the nose
  ctx.strokeStyle = INK;
  ctx.lineWidth = 16;
  const w = EYE_RX * 0.95, h = EYE_RY * 0.6;
  ctx.beginPath();
  ctx.moveTo(x + side * w, y - h);
  ctx.lineTo(x - side * w * 0.6, y);
  ctx.lineTo(x + side * w, y + h);
  ctx.stroke();
}
function mulberry(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
