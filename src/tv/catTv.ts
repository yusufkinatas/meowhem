import * as THREE from 'three';
import type { CatTvApi, TvShow } from '../shared/contracts';
import { OUTLINE_COLOR as INK } from '../shared/toon';

/**
 * Cat TV: six short looping cartoon shows drawn with canvas 2D into a CanvasTexture.
 * All drawing happens in a 512x288 design space, rendered at RES x for crisp text when the camera pulls in.
 */
const W = 512, H = 288, RES = 1.25, FPS = 30;
type G = CanvasRenderingContext2D;

// ---------------------------------------------------------------- helpers
const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ease = (k: number) => k * k * (3 - 2 * k);
const backOut = (k: number) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const within = (t: number, a: number, b: number) => t >= a && t < b;
const UI = "'Avenir Next', 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif";

function ell(g: G, x: number, y: number, rx: number, ry: number, fill: string | null, rot = 0, lw = 3) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw) { g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); }
}
function poly(g: G, pts: number[], fill: string | null, lw = 3, close = true) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  if (close) g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw) { g.lineWidth = lw; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke(); }
}
function rrect(g: G, x: number, y: number, w: number, h: number, r: number, fill: string | null, lw = 3) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw) { g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); }
}
/** outlined thick stroke (tails, branches) */
function thick(g: G, path: () => void, w: number, color: string) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); path(); g.lineWidth = w + 6; g.strokeStyle = INK; g.stroke();
  g.beginPath(); path(); g.lineWidth = w; g.strokeStyle = color; g.stroke();
}
function line(g: G, pts: number[], w = 3, color = INK) {
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = w; g.strokeStyle = color; g.stroke();
}
function txt(g: G, s: string, x: number, y: number, size: number, color: string, o: { weight?: number; font?: string; align?: CanvasTextAlign; stroke?: number; spacing?: number; alpha?: number } = {}) {
  g.save();
  g.globalAlpha *= o.alpha ?? 1;
  g.font = `${o.weight ?? 700} ${size}px ${o.font ?? UI}`;
  g.textBaseline = 'middle';
  const sp = o.spacing ?? 0;
  const widths = [...s].map((c) => g.measureText(c).width);
  const total = sp ? widths.reduce((a, b) => a + b, 0) + sp * (s.length - 1) : g.measureText(s).width;
  const align = o.align ?? 'center';
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  g.textAlign = 'left';
  const draw = (fn: (c: string, px: number) => void) => {
    if (!sp) { fn(s, cx); return; }
    let px = cx;
    [...s].forEach((c, i) => { fn(c, px); px += widths[i] + sp; });
  };
  if (o.stroke) { g.lineWidth = o.stroke; g.strokeStyle = 'rgba(20,12,8,0.9)'; g.lineJoin = 'round'; draw((c, px) => g.strokeText(c, px, y)); }
  g.fillStyle = color;
  draw((c, px) => g.fillText(c, px, y));
  g.restore();
}
/** subtitles: short, dry, outlined like real captions */
const sub = (g: G, s: string, color = '#ffffff', y = H - 24) => txt(g, s, W / 2, y, 16, color, { stroke: 5, weight: 600 });

/** cartoon eye: white, pupil looking (lx,ly in -1..1), optional upper lid 0..1 */
function eye(g: G, x: number, y: number, r: number, lx: number, ly: number, lid = 0, lidColor = '#999', pupil = 0.42) {
  ell(g, x, y, r, r, '#fff', 0, 2.5);
  const px = x + lx * r * 0.45, py = y + ly * r * 0.45;
  ell(g, px, py, r * pupil, r * pupil, '#1d1410', 0, 0);
  ell(g, px - r * pupil * 0.35, py - r * pupil * 0.4, r * pupil * 0.32, r * pupil * 0.32, '#fff', 0, 0);
  if (lid > 0) {
    g.save();
    g.beginPath(); g.ellipse(x, y, r, r, 0, 0, TAU); g.clip();
    g.fillStyle = lidColor;
    g.fillRect(x - r - 1, y - r - 1, r * 2 + 2, r * 2 * lid + 1);
    g.restore();
    line(g, [x - r * 0.95, y - r + r * 2 * lid, x + r * 0.95, y - r + r * 2 * lid], 2.5);
    ell(g, x, y, r, r, null, 0, 2.5);
  }
}
/** classic blink: closed for ~0.12 s every few seconds, seeded so characters blink out of sync */
const blink = (t: number, seed: number) => ((t + seed * 1.7) % (2.8 + seed)) < 0.12;

function sock(g: G, x: number, y: number, rot: number, fill: string | null = '#e86a6a', lw = 2.5) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.beginPath();
  g.moveTo(-7, -16); g.lineTo(7, -16); g.lineTo(7, 2); g.quadraticCurveTo(8, 6, 14, 6); g.quadraticCurveTo(22, 7, 21, 13);
  g.quadraticCurveTo(19, 18, 10, 17); g.lineTo(-1, 17); g.quadraticCurveTo(-8, 16, -7, 6); g.closePath();
  g.fillStyle = fill ?? '#000'; g.fill();
  if (lw) {
    g.lineWidth = lw; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke();
    line(g, [-7, -11, 7, -11], 2.5, '#fff'); line(g, [-7, -7, 7, -7], 2.5, '#fff');
  }
  g.restore();
}

function vignette(g: G, strength = 0.35) {
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${strength})`);
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}
function letterbox(g: G, h = 26) { g.fillStyle = '#000'; g.fillRect(0, 0, W, h); g.fillRect(0, H - h, W, h); }

// ---------------------------------------------------------------- show: birds (real cat TV)
function bird(g: G, x: number, y: number, dir: number, kind: 0 | 1 | 2, t: number, o: { peck?: number; fly?: number; chirp?: boolean; squash?: number } = {}) {
  const pal = [
    { back: '#8a5a3c', belly: '#f08a3c', head: '#8a5a3c', wing: '#6f4630' },   // robin
    { back: '#7fb27a', belly: '#f6d74a', head: '#3d8fd6', wing: '#4f7ec2' },   // blue tit
    { back: '#a37b55', belly: '#e9d6b8', head: '#7a5a3d', wing: '#7e5c3f' },   // sparrow
  ][kind];
  const sq = o.squash ?? 0;
  g.save();
  g.translate(x, y);
  g.scale(1.45 * dir * (1 + sq * 0.15), 1.45 * (1 - sq * 0.15));
  const flying = o.fly !== undefined;
  if (!flying) { line(g, [-3, 10, -4, 17], 2.5, '#d08a3a'); line(g, [4, 10, 5, 17], 2.5, '#d08a3a'); }
  poly(g, [-14, -2, -30, -12, -28, -4, -14, 4], pal.wing, 2.5); // tail
  ell(g, 0, 0, 17, 13, pal.back, 0, 3);
  ell(g, 5, 4, 11, 8, pal.belly, 0.2, 0);
  const peck = o.peck ?? 0;
  const hx = 12 + peck * 6, hy = -10 + peck * 14;
  ell(g, hx, hy, 10, 9.5, pal.head, 0, 3);
  if (kind === 1) { ell(g, hx + 2, hy + 2, 6, 5, '#ffffff', 0, 0); line(g, [hx - 6, hy + 1, hx + 4, hy + 4], 2, '#1d3550'); }
  if (kind === 0) ell(g, hx + 3, hy + 5, 6, 4, pal.belly, 0, 0);
  const open = o.chirp ? 3 : 0;
  poly(g, [hx + 8, hy - 2 - open * 0.3, hx + 16, hy + 1, hx + 8, hy + 3 + open], '#f2a43a', 2);
  ell(g, hx + 3, hy - 2, 2.6, 2.6, '#1d1410', 0, 0);
  ell(g, hx + 2.3, hy - 2.8, 0.9, 0.9, '#fff', 0, 0);
  const flap = flying ? Math.sin(o.fly! * 28) : 0;
  g.save();
  g.translate(-2, -2);
  g.rotate(flying ? -0.4 - flap * 0.9 : 0.15);
  ell(g, -2, 0, 11, 7, pal.wing, 0, 2.5);
  g.restore();
  g.restore();
}

function squirrel(g: G, x: number, y: number, dir: number, t: number, pose: 'run' | 'sit', nibble: number) {
  g.save();
  g.translate(x, y);
  g.scale(dir * 1.3, 1.3);
  const run = pose === 'run';
  const ph = t * 14;
  const stretch = run ? Math.sin(ph) * 0.18 : 0;
  // tail: big S-curve, flicks
  const flick = Math.sin(t * 6) * (run ? 6 : 3);
  thick(g, () => {
    g.moveTo(-14, -2);
    if (run) g.bezierCurveTo(-40, -6, -52, -30 + flick, -38, -44 + flick);
    else g.bezierCurveTo(-34, 0, -44, -30, -26, -48 + flick);
  }, 22, '#b4652c');
  thick(g, () => {
    if (run) { g.moveTo(-38, -38 + flick); g.lineTo(-38, -44 + flick); }
    else { g.moveTo(-28, -42 + flick); g.lineTo(-26, -48 + flick); }
  }, 14, '#d58a4a');
  if (run) {
    ell(g, 0, -6 + Math.sin(ph) * 2, 18 * (1 + stretch), 11 * (1 - stretch * 0.5), '#c8743a', 0, 3);
    line(g, [-10, 2, -14 + Math.sin(ph) * 6, 10], 4, INK);
    line(g, [10, 2, 12 - Math.sin(ph) * 6, 10], 4, INK);
    const hx = 18 * (1 + stretch), hy = -12;
    ell(g, hx - 2, hy - 9, 4, 6, '#b4652c', -0.3, 2.5);
    ell(g, hx, hy, 10, 9, '#c8743a', 0, 3);
    ell(g, hx + 4, hy - 1, 2.8, 2.8, '#1d1410', 0, 0);
    ell(g, hx + 10, hy + 2, 2, 2, '#3a2a22', 0, 0);
  } else {
    ell(g, 0, -14, 13, 18, '#c8743a', 0, 3);
    ell(g, 3, -10, 8, 12, '#f1d7b0', 0, 0);
    ell(g, -2, 2, 10, 5, '#b4652c', 0, 2.5);
    const bob = Math.sin(nibble * 40) * 1.5 * (nibble > 0 ? 1 : 0);
    const hx = 4, hy = -36 + bob;
    ell(g, hx - 5, hy - 10, 4, 6.5, '#b4652c', -0.2, 2.5);
    ell(g, hx, hy, 11, 10, '#c8743a', 0, 3);
    ell(g, hx + 7, hy + 3, 6, 5, '#f1d7b0', 0, 0);
    ell(g, hx + 4, hy - 2, 3, 3, '#1d1410', 0, 0);
    ell(g, hx + 3.2, hy - 2.9, 1, 1, '#fff', 0, 0);
    ell(g, hx + 11, hy + 1, 2, 2, '#3a2a22', 0, 0);
    // acorn in paws
    ell(g, 13, -22 + bob, 5, 6, '#a0672f', 0, 2.5);
    ell(g, 13, -27 + bob, 6, 3, '#6b4423', 0, 2);
    ell(g, 10, -19 + bob, 3.5, 3, '#c8743a', 0, 2);
  }
  g.restore();
}

const BRANCH_Y = (x: number) => 196 - x * 0.07 + Math.sin(x * 0.012) * 6;
function birdsShow(g: G, t: number) {
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#a9daf0'); sky.addColorStop(0.7, '#dff1e6'); sky.addColorStop(1, '#cfe8c4');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // soft bokeh bushes
  for (let i = 0; i < 14; i++) {
    const x = hash(i) * W, y = 200 + hash(i + 9) * 110, r = 30 + hash(i + 3) * 50;
    g.fillStyle = `rgba(${90 + hash(i + 1) * 40},${150 + hash(i + 2) * 40},${90 + hash(i + 4) * 30},0.45)`;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  for (let i = 0; i < 8; i++) {
    g.fillStyle = 'rgba(255,255,240,0.35)';
    g.beginPath(); g.arc(hash(i + 20) * W, 30 + hash(i + 30) * 120, 4 + hash(i + 40) * 9, 0, TAU); g.fill();
  }
  // feeder hanging on the right
  const sway = Math.sin(t * 1.3) * 0.04;
  g.save(); g.translate(400, 0); g.rotate(sway);
  line(g, [0, 0, 0, 58], 2, '#5b4636');
  poly(g, [-34, 70, 0, 52, 34, 70], '#c0533c', 3);
  rrect(g, -24, 70, 48, 30, 4, '#f3e2c0', 3);
  ell(g, 0, 85, 9, 9, '#3a2a22', 0, 0);
  rrect(g, -32, 98, 64, 7, 3, '#a8703f', 3);
  for (let i = 0; i < 7; i++) ell(g, -24 + i * 8, 96, 2.4, 1.8, '#e8c27a', 0, 0);
  g.restore();
  // branch
  thick(g, () => { g.moveTo(-10, BRANCH_Y(-10)); for (let x = 0; x <= W + 20; x += 16) g.lineTo(x, BRANCH_Y(x)); }, 16, '#7b5434');
  thick(g, () => { g.moveTo(160, BRANCH_Y(160)); g.quadraticCurveTo(190, 150, 230, 130); }, 7, '#7b5434');
  thick(g, () => { g.moveTo(330, BRANCH_Y(330)); g.quadraticCurveTo(350, 230, 380, 250); }, 6, '#7b5434');
  for (let x = 20; x < W; x += 47) line(g, [x, BRANCH_Y(x) - 3, x + 14, BRANCH_Y(x + 14) - 2], 1.5, 'rgba(58,42,34,0.6)');
  const leaves: [number, number, number][] = [[230, 130, -0.6], [214, 136, 0.5], [236, 118, -1.4], [380, 250, 0.4], [362, 244, 1.6], [40, 182, 2.3], [480, 166, -0.5], [120, 192, 2.6]];
  leaves.forEach(([x, y, r], i) => ell(g, x, y, 13, 6, i % 2 ? '#79b45a' : '#5f9e4a', r + Math.sin(t * 2 + i) * 0.12, 2.5));

  // robin hops back and forth around x 110..210
  {
    const cyc = t % 7, hopT = (cyc % 1.1) / 1.1, dir = cyc < 3.5 ? 1 : -1;
    const hops = Math.floor((cyc < 3.5 ? cyc : cyc - 3.5) / 1.1);
    const base = cyc < 3.5 ? 130 + Math.min(hops, 3) * 30 : 220 - Math.min(hops, 3) * 30;
    const hopping = hopT < 0.35 && hops < 3;
    const k = hopT / 0.35;
    const x = hopping ? base + dir * k * 30 : base;
    const lift = hopping ? Math.sin(k * Math.PI) * 14 : 0;
    const peck = !hopping && hopT > 0.55 && hopT < 0.8 ? Math.sin(seg(hopT, 0.55, 0.8) * Math.PI) : 0;
    bird(g, x, BRANCH_Y(x) - 30 - lift, dir, 0, t, { peck, squash: !hopping && hopT < 0.45 ? 1 - seg(hopT, 0.35, 0.45) : 0 });
  }
  // blue tit: sits, chirps, flees when the squirrel comes, returns
  {
    const away = within(t, 8.2, 12.6);
    if (!away) {
      const back = seg(t, 12.6, 13.6);
      const x = t >= 12.6 ? lerp(520, 300, ease(back)) : 300;
      const y = t >= 12.6 && back < 1 ? lerp(40, BRANCH_Y(300) - 30, ease(back)) : BRANCH_Y(300) - 30;
      const dir = t >= 12.6 && back < 1 ? -1 : Math.floor(t / 2.3) % 2 ? -1 : 1;
      bird(g, x, y, dir, 1, t, back > 0 && back < 1 ? { fly: t } : { chirp: (t % 1.6) < 0.25 });
    } else {
      const k = seg(t, 8.2, 9.4);
      if (k < 1) bird(g, lerp(300, 560, ease(k)), lerp(BRANCH_Y(300) - 30, -20, k), 1, 1, t, { fly: t });
    }
  }
  // sparrow flies in from the left at 2 s
  {
    const k = seg(t, 1.6, 2.8);
    if (t > 1.6) {
      const landed = k >= 1;
      const x = lerp(-30, 40, ease(k));
      const y = landed ? BRANCH_Y(40) - 30 : lerp(60, BRANCH_Y(40) - 30, ease(k));
      bird(g, x, y, 1, 2, t, landed ? { peck: (t % 2.2) > 1.7 ? Math.sin(seg(t % 2.2, 1.7, 2.1) * Math.PI) : 0 } : { fly: t });
    }
  }
  // squirrel: runs in from the right, sits and nibbles, runs off
  if (within(t, 7.4, 12.8)) {
    let x: number, pose: 'run' | 'sit' = 'sit', dir = -1;
    if (t < 8.6) { x = lerp(560, 430, ease(seg(t, 7.4, 8.6))); pose = 'run'; }
    else if (t < 11.6) x = 430;
    else { x = lerp(430, 580, seg(t, 11.6, 12.8)); pose = 'run'; dir = 1; }
    squirrel(g, x, BRANCH_Y(x) - 8, dir, t, pose, within(t, 9.2, 11.2) ? t : 0);
  }
  // cam overlay
  rrect(g, 10, 10, 160, 20, 5, 'rgba(20,14,10,0.45)', 0);
  if (Math.floor(t * 1.4) % 2 === 0) ell(g, 21, 20, 4.5, 4.5, '#ff3b30', 0, 0);
  txt(g, 'LIVE', 31, 20.5, 11, '#fff', { align: 'left', weight: 800 });
  txt(g, 'BACKYARD CAM 2', 64, 20.5, 10, 'rgba(255,255,255,0.9)', { align: 'left', weight: 600, spacing: 0.5 });
  rrect(g, W - 78, H - 27, 68, 18, 5, 'rgba(20,14,10,0.45)', 0);
  txt(g, `07:42:${String(25 + Math.floor(t)).padStart(2, '0')}`, W - 44, H - 17.5, 10, 'rgba(255,255,255,0.9)', { weight: 600 });
}

// ---------------------------------------------------------------- show: the scientist and the kitten
function portal(g: G, x: number, y: number, s: number, t: number) {
  if (s <= 0) return;
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  const glow = g.createRadialGradient(0, 0, 10, 0, 0, 90);
  glow.addColorStop(0, 'rgba(170,255,120,0.9)'); glow.addColorStop(0.5, 'rgba(90,220,70,0.35)'); glow.addColorStop(1, 'rgba(90,220,70,0)');
  g.fillStyle = glow; g.beginPath(); g.arc(0, 0, 90, 0, TAU); g.fill();
  g.scale(1, 1.15);
  ell(g, 0, 0, 52, 52, '#5bd64a', 0, 4);
  for (let k = 0; k < 4; k++) {
    g.beginPath();
    for (let a = 0; a < 5.2; a += 0.15) {
      const r = 4 + a * 9, ang = a + t * 3.2 + (k * TAU) / 4;
      const px = Math.cos(ang) * r, py = Math.sin(ang) * r;
      if (a === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.lineWidth = 5; g.strokeStyle = k % 2 ? '#c9ff8a' : '#2fa83a'; g.lineCap = 'round'; g.stroke();
  }
  ell(g, 0, 0, 10, 10, '#eaffd0', 0, 0);
  g.restore();
}

function scientist(g: G, x: number, y: number, t: number, o: { talk: boolean; gun: number; burp: number; look: number }) {
  g.save();
  g.translate(x, y);
  // lab coat body
  poly(g, [-58, 120, -46, 30, 0, 14, 46, 30, 58, 120], '#f3f6f7', 3);
  poly(g, [-18, 22, 0, 70, 18, 22, 0, 16], '#8ed0e6', 2.5);
  line(g, [-18, 22, -8, 78], 2.5); line(g, [18, 22, 8, 78], 2.5);
  // gadget arm
  if (o.gun > 0) {
    const a = lerp(0.9, -0.15, ease(o.gun));
    g.save(); g.translate(40, 44); g.rotate(a);
    thick(g, () => { g.moveTo(0, 0); g.lineTo(46, 0); }, 13, '#f3f6f7');
    rrect(g, 40, -9, 34, 14, 4, '#9aa6ad', 3);
    ell(g, 77, -2, 5, 5, '#7dff6a', 0, 2.5);
    ell(g, 46, 2, 7, 7, '#b9c3c9', 0, 2.5);
    g.restore();
  }
  const puff = o.burp;
  // head
  g.translate(0, -8);
  const spikes: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI * (1.05 + (i / 12) * 0.9), r = i % 2 ? 50 : 76;
    spikes.push(Math.cos(a) * r * 1.05, Math.sin(a) * r * 0.9 - 6);
  }
  poly(g, spikes, '#cfe2ec', 3);
  poly(g, [-42, -22, -38, -60, -14, -40], '#a8b4bb', 3);
  poly(g, [42, -22, 38, -60, 14, -40], '#a8b4bb', 3);
  ell(g, 0, -6, 48 + puff * 4, 40 + puff * 2, '#b9c3c9', 0, 3);
  ell(g, 0, 14, 26 + puff * 8, 16 + puff * 5, '#e2e8eb', 0, 0);
  const shut = blink(t, 0.3);
  const lid = shut ? 1 : 0.45;
  eye(g, -17, -10, 13, o.look * 0.6 + 0.2, 0.2, lid, '#a8b4bb', 0.3);
  eye(g, 17, -10, 13, o.look * 0.6 - 0.25, 0.25, lid, '#a8b4bb', 0.3);
  // unibrow
  g.beginPath(); g.moveTo(-34, -27); g.quadraticCurveTo(-18, -34, 0, -26); g.quadraticCurveTo(18, -34, 34, -27);
  g.lineWidth = 6; g.strokeStyle = '#6f7d85'; g.lineCap = 'round'; g.stroke();
  ell(g, 0, 6, 4.5, 3.2, '#e48aa0', 0, 2);
  // mouth + drool
  const open = o.talk ? (Math.sin(t * 22) * 0.5 + 0.5) * 7 : 0;
  g.beginPath(); g.moveTo(-18, 18); g.quadraticCurveTo(0, 22 + open + puff * 4, 16, 16);
  if (open > 1 || puff > 0.2) { g.quadraticCurveTo(0, 14, -18, 18); g.fillStyle = '#5b2a2a'; g.fill(); }
  g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
  const dl = 14 + Math.sin(t * 2.2) * 5;
  line(g, [16, 17, 18, 17 + dl], 2.5, 'rgba(220,240,255,0.95)');
  ell(g, 18, 18 + dl, 2.6, 3.2, 'rgba(220,240,255,0.95)', 0, 0);
  for (const s of [-1, 1]) { line(g, [s * 24, 10, s * 48, 6], 1.5); line(g, [s * 24, 14, s * 48, 16], 1.5); }
  g.restore();
}

function kitten(g: G, x: number, y: number, t: number, o: { talk: boolean; scared: number; look: number }) {
  const jit = Math.sin(t * 50) * 1.2 * o.scared;
  g.save();
  g.translate(x + jit, y);
  rrect(g, -38, 30, 76, 100, 26, '#f5d547', 3);
  ell(g, 0, 32, 16, 6, '#e9c23a', 0, 2.5);
  poly(g, [-36, -12, -30, -48, -8, -30], '#e0995c', 3);
  poly(g, [36, -12, 30, -48, 8, -30], '#e0995c', 3);
  ell(g, 0, -4, 40, 34, '#eaa96c', 0, 3);
  poly(g, [-12, -34, -4, -48, 2, -36, 10, -46, 12, -32], '#9a5f35', 2.5);
  ell(g, 0, 12, 20, 12, '#f6d3a8', 0, 0);
  const shut = blink(t, 1.1);
  const shake = Math.sin(t * 37) * 0.15 * o.scared;
  eye(g, -14, -6, 13, o.look + shake, 0.1, shut ? 1 : 0, '#e0a064', 0.28);
  eye(g, 14, -6, 13, o.look + shake, 0.1, shut ? 1 : 0, '#e0a064', 0.28);
  line(g, [-26, -24, -8, -20], 3.5, '#8a5530');
  line(g, [26, -24, 8, -20], 3.5, '#8a5530');
  ell(g, 0, 6, 3.6, 2.6, '#e48aa0', 0, 2);
  const open = o.talk ? (Math.sin(t * 20) * 0.5 + 0.5) * 6 : 0;
  g.beginPath(); g.moveTo(-9, 15); g.quadraticCurveTo(-4, 12, 0, 15 + open * 0.3); g.quadraticCurveTo(4, 12 + open, 9, 15);
  g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
  if (o.scared > 0.3) {
    const dy = (t * 30) % 14;
    g.save(); g.globalAlpha = 0.9;
    g.beginPath(); g.moveTo(40, -24 + dy); g.quadraticCurveTo(46, -14 + dy, 40, -10 + dy); g.quadraticCurveTo(34, -14 + dy, 40, -24 + dy);
    g.fillStyle = '#9fdcff'; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
    g.restore();
  }
  g.restore();
}

function labShow(g: G, t: number) {
  // garage lab
  g.fillStyle = '#7f9a96'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#89a5a0';
  for (let x = 0; x < W; x += 64) g.fillRect(x + 2, 0, 60, 190);
  g.fillStyle = 'rgba(40,30,25,0.18)'; g.fillRect(0, 186, W, 6);
  // shelf + flasks
  rrect(g, 24, 70, 120, 8, 2, '#8b5e3c', 2.5);
  const flask = (x: number, c: string, i: number) => {
    poly(g, [x - 5, 46, x - 5, 56, x - 14, 70, x + 14, 70, x + 5, 56, x + 5, 46], 'rgba(230,250,255,0.6)', 2.5);
    poly(g, [x - 10, 63, x + 10, 63, x + 14, 70, x - 14, 70], c, 0);
    const by = 62 - ((t * 18 + i * 7) % 18);
    ell(g, x + Math.sin(t * 5 + i) * 2, by, 2, 2, 'rgba(255,255,255,0.8)', 0, 0);
  };
  flask(46, '#7dff6a', 0); flask(84, '#ff6ab0', 1); flask(120, '#6ac8ff', 2);
  // pegboard with tool silhouettes
  rrect(g, 380, 30, 110, 70, 4, '#b98e62', 2.5);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) ell(g, 392 + i * 22, 44 + j * 20, 1.5, 1.5, '#7a5a3c', 0, 0);
  line(g, [400, 40, 400, 86], 5, '#5d6a70'); line(g, [430, 42, 444, 84], 4, '#5d6a70'); ell(g, 470, 62, 12, 12, null, 0, 4);
  // bulb
  line(g, [256, 0, 256, 24], 2);
  const bg = g.createRadialGradient(256, 32, 4, 256, 32, 120);
  bg.addColorStop(0, 'rgba(255,240,180,0.5)'); bg.addColorStop(1, 'rgba(255,240,180,0)');
  g.fillStyle = bg; g.fillRect(130, 0, 250, 160);
  ell(g, 256, 32, 9, 10, '#fff4c2', 0, 2.5);

  // timeline
  const gun = seg(t, 1.6, 2.2) - seg(t, 12.0, 12.4);
  const portalS = t < 7.9 ? 0 : t < 13.6 ? backOut(seg(t, 7.9, 8.5)) : 1 - seg(t, 13.6, 14.0);
  const px = 450, py = 112;
  if (within(t, 7.6, 7.95)) { line(g, [250, 120, px, py], 6, 'rgba(160,255,120,0.9)'); line(g, [250, 120, px, py], 2, '#fff'); }
  portal(g, px, py, portalS, t);
  if (within(t, 13.95, 14.15)) { g.fillStyle = 'rgba(220,255,200,0.8)'; g.fillRect(0, 0, W, H); }

  // characters jump in 12.4..13.6
  const jumpS = seg(t, 12.4, 13.1), jumpK = seg(t, 12.7, 13.5);
  const gone = t >= 13.1, kGone = t >= 13.5;
  if (!kGone && t > 0) {
    const kx = lerp(318, px, ease(jumpK)), ky = lerp(170, py, ease(jumpK)) - Math.sin(jumpK * Math.PI) * 40;
    g.save(); g.translate(kx, ky); const s = 1 - jumpK * 0.8; g.scale(s, s); g.translate(-kx, -ky);
    kitten(g, kx, ky, t, { talk: within(t, 4.7, 7.4), scared: t > 4.4 ? 1 : 0.2, look: t < 4.5 ? -0.6 : t < 7.6 ? -0.8 : 0.9 });
    g.restore();
  }
  if (!gone) {
    const sx = lerp(170, px, ease(jumpS)), sy = lerp(150, py, ease(jumpS)) - Math.sin(jumpS * Math.PI) * 50;
    g.save(); g.translate(sx, sy); const s = 1 - jumpS * 0.8; g.scale(s, s); g.translate(-sx, -sy);
    const burp = within(t, 9.9, 10.5) ? Math.sin(seg(t, 9.9, 10.5) * Math.PI) : 0;
    scientist(g, sx, sy, t, { talk: (within(t, 0.4, 4.4) || within(t, 8.6, 11.8)) && burp < 0.1, gun: Math.max(0, gun), burp, look: t < 4.5 ? 0.5 : t < 7.6 ? 0.6 : 0.9 });
    g.restore();
  }
  // bench in front
  g.fillStyle = '#6e4a30'; g.fillRect(0, 238, W, 50);
  g.fillStyle = '#8b5e3c'; g.fillRect(0, 230, W, 12);
  line(g, [0, 230, W, 230], 3); line(g, [0, 242, W, 242], 3);
  rrect(g, 60, 214, 34, 18, 3, '#c94f3c', 2.5); line(g, [77, 214, 77, 206], 3);
  ell(g, 450, 222, 14, 9, '#9aa6ad', 0, 2.5);
  // a sock is spat out before the portal closes and lands on the bench
  if (t > 13.55) {
    const k = seg(t, 13.55, 14.1);
    sock(g, lerp(px, 300, k), lerp(py, 214, k) - Math.sin(k * Math.PI) * 60, k < 1 ? k * 7 : 1.57);
  }
  if (portalS > 0) { g.fillStyle = `rgba(110,255,90,${0.12 * Math.min(1, portalS)})`; g.fillRect(0, 0, W, H); }

  if (within(t, 0.5, 4.5)) sub(g, 'I turned the red dot into a portal.');
  else if (within(t, 4.7, 7.5)) sub(g, 'Is that... allowed?', '#ffe45c');
  else if (within(t, 8.6, 11.9)) sub(g, 'Nothing is allowed, kid. *burp* Get in.');
}

// ---------------------------------------------------------------- show: nature documentary
function tabby(g: G, x: number, y: number, t: number, crouch: number, wiggle: number, pose: 'crouch' | 'air' | 'sit', groom: number) {
  g.save();
  g.translate(x, y);
  g.scale(1.5, 1.5);
  const fur = '#a7a29a', dark = '#6e6860', light = '#e8e2d6';
  if (pose === 'sit') {
    thick(g, () => { g.moveTo(-18, 0); g.quadraticCurveTo(-46, -2, -44, -22 + Math.sin(t * 3) * 3); }, 9, fur);
    ell(g, -4, -24, 26, 28, fur, 0, 3);
    ell(g, 4, -18, 12, 18, light, 0, 0);
    for (let i = 0; i < 3; i++) line(g, [-24, -36 + i * 9, -10, -38 + i * 9], 3, dark);
    const lift = groom > 0 ? 1 : 0;
    const lickPaw = groom > 0 ? Math.sin(t * 12) * 2 : 0;
    // head (turned to the paw while grooming)
    const hx = 12 - lift * 2, hy = -58 + lift * 6;
    poly(g, [hx - 18, hy - 8, hx - 14, hy - 28, hx - 3, hy - 14], fur, 3);
    poly(g, [hx + 14, hy - 10, hx + 16, hy - 30, hx + 4, hy - 16], fur, 3);
    ell(g, hx, hy, 20, 17, fur, 0, 3);
    for (let i = -1; i <= 1; i++) line(g, [hx + i * 6, hy - 16, hx + i * 5, hy - 9], 2.5, dark);
    if (lift) {
      line(g, [hx - 10, hy - 2, hx - 4, hy - 1], 2.5); line(g, [hx + 4, hy - 1, hx + 10, hy - 2], 2.5);
      ell(g, hx + 12 + lickPaw * 0.3, hy + 12, 8, 6, light, -0.4, 2.5);
      ell(g, hx + 6, hy + 8, 3, 2.5, '#f08aa0', 0, 0);
    } else {
      eye(g, hx - 7, hy - 2, 5, 0.6, 0, 0, fur, 0.5);
      eye(g, hx + 8, hy - 2, 5, 0.6, 0, 0, fur, 0.5);
    }
    ell(g, hx + 1, hy + 6, 2.6, 2, '#e48aa0', 0, 0);
    ell(g, -16, -2, 9, 5, light, 0, 2.5);
    ell(g, 8, -2, 9, 5, light, 0, 2.5);
    g.restore();
    return;
  }
  const air = pose === 'air';
  const low = air ? 0 : crouch;
  const hipShake = Math.sin(t * 26) * 4 * wiggle;
  // tail
  const tip = Math.sin(t * (air ? 4 : 9)) * (air ? 6 : 4 + wiggle * 5);
  thick(g, () => { g.moveTo(-36 + hipShake, -18 + low * 6); g.quadraticCurveTo(-70, air ? -30 : -6, -84, (air ? -40 : -14) + tip); }, 9, fur);
  // back legs
  ell(g, -30 + hipShake, -8 + low * 4, 13, 10, fur, 0, 3);
  // body
  g.beginPath();
  g.ellipse(-4, -18 + low * 8, 38, 15 - low * 2, air ? -0.15 : 0.05 + low * 0.08, 0, TAU);
  g.fillStyle = fur; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
  for (let i = 0; i < 4; i++) line(g, [-26 + i * 13 + hipShake * (1 - i / 4), -30 + low * 9, -22 + i * 13, -20 + low * 9], 3, dark);
  ell(g, 8, -10 + low * 8, 18, 6, light, 0.05, 0);
  // front paws
  if (air) { line(g, [24, -18, 44, -8], 7, fur); line(g, [22, -14, 40, -2], 7, fur); }
  else { ell(g, 24, -2, 9, 5, light, 0, 2.5); ell(g, 36, -1, 9, 5, light, 0, 2.5); }
  // head
  const hx = air ? 36 : 34, hy = air ? -34 : -26 + low * 8;
  poly(g, [hx - 16, hy - 6, hx - 10, hy - 30, hx, hy - 14], fur, 3);
  poly(g, [hx + 6, hy - 14, hx + 18, hy - 30, hx + 18, hy - 6], fur, 3);
  ell(g, hx, hy, 20, 17, fur, 0, 3);
  for (let i = -1; i <= 1; i++) line(g, [hx + i * 6, hy - 16, hx + i * 5, hy - 9], 2.5, dark);
  ell(g, hx + 6, hy + 5, 9, 7, light, 0, 0);
  // huge hunting pupils
  eye(g, hx - 2, hy - 3, 6, 0.8, 0.3, 0, fur, 0.72);
  eye(g, hx + 12, hy - 3, 6, 0.8, 0.3, 0, fur, 0.72);
  ell(g, hx + 14, hy + 5, 2.6, 2, '#e48aa0', 0, 0);
  g.restore();
}

function natureShow(g: G, t: number) {
  const zoom = 1 + t * 0.004;
  g.save();
  g.translate(W / 2, H / 2); g.scale(zoom, zoom); g.translate(-W / 2, -H / 2);
  const wall = g.createLinearGradient(0, 0, 0, 170);
  wall.addColorStop(0, '#f2c98f'); wall.addColorStop(1, '#e9a568');
  g.fillStyle = wall; g.fillRect(-20, -20, W + 40, 200);
  // sunbeam on the wall from a window
  g.fillStyle = 'rgba(255,240,200,0.35)';
  g.beginPath(); g.moveTo(300, 20); g.lineTo(380, 20); g.lineTo(470, 175); g.lineTo(360, 175); g.fill();
  // furniture silhouettes
  g.fillStyle = 'rgba(120,70,40,0.55)';
  g.beginPath(); g.roundRect(-20, 96, 150, 80, 18); g.fill();
  g.beginPath(); g.roundRect(-20, 70, 40, 106, 14); g.fill();
  g.fillStyle = 'rgba(80,110,60,0.55)';
  for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(470 + Math.sin(i) * 14, 80 + i * 12, 30, 9, -0.5 + i * 0.3, 0, TAU); g.fill(); }
  rrect(g, 452, 140, 36, 36, 6, 'rgba(150,80,50,0.7)', 0);
  // floor
  g.fillStyle = '#c4834f'; g.fillRect(-20, 175, W + 40, 140);
  g.strokeStyle = 'rgba(90,50,25,0.3)'; g.lineWidth = 2;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(-20, 185 + i * i * 4); g.lineTo(W + 20, 185 + i * i * 4); g.stroke(); }
  g.fillStyle = 'rgba(255,235,190,0.3)';
  g.beginPath(); g.moveTo(330, 175); g.lineTo(450, 175); g.lineTo(520, 260); g.lineTo(360, 260); g.fill();
  // dust motes in the light
  for (let i = 0; i < 16; i++) {
    const x = 330 + hash(i) * 140 + Math.sin(t * 0.5 + i) * 10, y = (hash(i + 5) * 160 + t * (4 + hash(i) * 6)) % 170 + 10;
    g.fillStyle = 'rgba(255,250,230,0.7)'; g.beginPath(); g.arc(x, y, 1.2 + hash(i + 2), 0, TAU); g.fill();
  }

  // the dot
  const jitter = (a: number) => Math.sin(t * 13 + a) * 1.5 + Math.sin(t * 7.3 + a * 2) * 1.2;
  let dx = 392 + Math.sin(t * 0.6) * 14 + jitter(0), dy = 226 + jitter(3);
  if (t > 10.75) { const k = seg(t, 10.75, 11.1); dx = lerp(dx, 500, k); dy = lerp(dy, 110, k * k); }
  const dotVisible = t < 11.1;
  if (dotVisible) {
    const dg = g.createRadialGradient(dx, dy, 0, dx, dy, 16);
    dg.addColorStop(0, 'rgba(255,255,255,1)'); dg.addColorStop(0.22, 'rgba(255,40,40,1)'); dg.addColorStop(1, 'rgba(255,0,0,0)');
    g.fillStyle = dg; g.beginPath(); g.arc(dx, dy, 16, 0, TAU); g.fill();
  }

  // the subject
  const wig = t < 6 ? 0.2 : seg(t, 8.2, 10.4);
  if (t < 10.5) tabby(g, 210, 244, t, 0.6 + wig * 0.4, wig, 'crouch', 0);
  else if (t < 11.3) {
    const k = seg(t, 10.5, 11.3);
    tabby(g, lerp(210, 330, k), 244 - Math.sin(k * Math.PI) * 80, t, 0, 0, 'air', 0);
  } else tabby(g, 336, 250, t, 0, 0, 'sit', t > 12.4 ? 1 : 0);
  g.restore();

  // foreground: another cat watching, from behind (the audience is also a cat)
  g.save();
  g.fillStyle = 'rgba(25,15,10,0.92)';
  const twitch = (t % 5) < 0.2 ? 4 : 0;
  g.beginPath(); g.ellipse(70, 300, 70, 62, 0, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(22, 262); g.lineTo(30 - twitch, 206); g.lineTo(58, 246); g.fill();
  g.beginPath(); g.moveTo(118, 262); g.lineTo(112, 206); g.lineTo(84, 246); g.fill();
  g.restore();

  letterbox(g);
  if (t < 2.6) {
    const a = seg(t, 0, 0.6) * (1 - seg(t, 2.0, 2.6));
    g.fillStyle = `rgba(0,0,0,${0.35 * a})`; g.fillRect(0, 0, W, H);
    txt(g, 'PLANET MEARTH', W / 2, H / 2 - 8, 26, '#fff', { weight: 300, spacing: 7, alpha: a, font: "'Avenir Next', 'Helvetica Neue', sans-serif" });
    txt(g, 'Episode 4: Floors', W / 2, H / 2 + 22, 12, '#fff', { weight: 500, spacing: 2, alpha: a * 0.85 });
  }
  if (within(t, 2.8, 5.9)) sub(g, 'For eleven years, she has hunted the dot.');
  else if (within(t, 6.1, 8.2)) sub(g, 'She has never caught it.');
  else if (within(t, 8.4, 10.4)) sub(g, 'Today, she tries again.');
  else if (within(t, 12.3, 15)) sub(g, 'She meant to do that.');
}

// ---------------------------------------------------------------- show: cooking show with a cucumber
function chef(g: G, x: number, y: number, t: number, o: { talk: boolean; arm: readonly [number, number]; shh: boolean; wrecked: boolean; sly: boolean }) {
  g.save();
  g.translate(x, y);
  // jacket
  rrect(g, -56, 40, 112, 120, 30, '#ffffff', 3);
  poly(g, [-14, 40, 0, 58, 14, 40], '#e2463b', 2.5);
  for (const yy of [74, 96, 118]) { ell(g, -14, yy, 3, 3, '#cfcfcf', 0, 1.5); ell(g, 14, yy, 3, 3, '#cfcfcf', 0, 1.5); }
  // arms
  const [armA, armL] = o.arm;
  g.save(); g.translate(46, 56); g.rotate(armA);
  thick(g, () => { g.moveTo(0, 0); g.lineTo(0, armL); }, 22, '#ffffff');
  ell(g, 0, armL + 8, 12, 11, '#f2c4a0', 0, 3);
  g.restore();
  if (o.shh) { thick(g, () => { g.moveTo(-46, 60); g.lineTo(-14, 10); }, 22, '#ffffff'); ell(g, -6, 2, 6, 14, '#f2c4a0', 0, 3); }
  else { g.save(); g.translate(-46, 56); g.rotate(-0.35); thick(g, () => { g.moveTo(0, 0); g.lineTo(0, 62); }, 22, '#ffffff'); ell(g, 0, 70, 12, 11, '#f2c4a0', 0, 3); g.restore(); }
  // head
  ell(g, 0, 0, 38, 40, '#f5cba7', 0, 3);
  ell(g, -38, 4, 7, 10, '#f2c4a0', 0, 3);
  ell(g, 38, 4, 7, 10, '#f2c4a0', 0, 3);
  // hat
  if (o.wrecked) {
    g.save(); g.translate(8, -40); g.rotate(0.5);
    rrect(g, -30, -16, 60, 22, 8, '#f4f4f4', 3); ell(g, 0, -20, 30, 12, '#f4f4f4', 0, 3);
    g.restore();
    for (let i = 0; i < 5; i++) line(g, [-20 + i * 9, -34, -24 + i * 11, -52 - (i % 2) * 8], 3, '#6b4a2e');
  } else {
    rrect(g, -32, -58, 64, 26, 6, '#ffffff', 3);
    ell(g, -18, -70, 20, 18, '#ffffff', 0, 3); ell(g, 18, -70, 20, 18, '#ffffff', 0, 3); ell(g, 0, -80, 22, 20, '#ffffff', 0, 3);
    g.fillStyle = '#ffffff'; g.fillRect(-29, -66, 58, 14);
  }
  ell(g, -22, 14, 8, 5, 'rgba(240,120,110,0.45)', 0, 0);
  ell(g, 22, 14, 8, 5, 'rgba(240,120,110,0.45)', 0, 0);
  if (o.wrecked) {
    line(g, [-20, -4, -8, 4], 3); line(g, [-20, 4, -8, -4], 3);
    line(g, [8, -4, 20, 4], 3); line(g, [8, 4, 20, -4], 3);
    g.save(); g.translate(24, 12); g.rotate(-0.5); rrect(g, -11, -4, 22, 8, 3, '#f3d6a4', 2); g.restore();
    for (let i = 0; i < 3; i++) line(g, [-30 + i * 5, 6, -24 + i * 5, 18], 2, '#c0504a');
  } else {
    const shut = blink(t, 0.7);
    if (shut || o.sly) { line(g, [-20, -2, -8, o.sly ? 0 : -2], 3); line(g, [8, o.sly ? 0 : -2, 20, -2], 3); }
    else { ell(g, -14, -2, 4.5, 6, '#2b1d16', 0, 0); ell(g, 14, -2, 4.5, 6, '#2b1d16', 0, 0); ell(g, -15, -4, 1.5, 1.5, '#fff', 0, 0); ell(g, 13, -4, 1.5, 1.5, '#fff', 0, 0); }
    line(g, [-22, o.sly ? -18 : -14, -6, -16], 3); line(g, [6, -16, 22, o.sly ? -18 : -14], 3);
  }
  ell(g, 0, 8, 7, 6, '#eeb08e', 0, 2.5);
  // mustache
  g.beginPath(); g.moveTo(0, 18); g.quadraticCurveTo(-14, 10, -26, 22); g.quadraticCurveTo(-12, 24, 0, 20); g.quadraticCurveTo(12, 24, 26, 22); g.quadraticCurveTo(14, 10, 0, 18);
  g.fillStyle = '#6b4a2e'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
  const open = o.talk ? (Math.sin(t * 18) * 0.5 + 0.5) * 6 : 0;
  if (o.wrecked) line(g, [-8, 30, -3, 28, 2, 31, 8, 29], 2.5);
  else { g.beginPath(); g.ellipse(0, 28, 9, 2 + open, 0, 0, Math.PI); g.fillStyle = '#7a2e2e'; g.fill(); g.lineWidth = 2.5; g.stroke(); }
  g.restore();
}

function cucumberShape(g: G, x: number, y: number, rot: number) {
  g.save(); g.translate(x, y); g.rotate(rot);
  rrect(g, -30, -9, 60, 18, 9, '#4f9a3a', 3);
  line(g, [-20, -3, 18, -3], 3, 'rgba(190,230,140,0.7)');
  for (let i = 0; i < 6; i++) ell(g, -22 + i * 9, 3 + (i % 2) * 2, 1.4, 1.4, '#2f6a24', 0, 0);
  g.restore();
}

function tuxCat(g: G, x: number, y: number, t: number, eating: boolean, look: number, shock: boolean) {
  g.save(); g.translate(x, y);
  const k = '#2f2a2e', w = '#f7f3ee';
  thick(g, () => { g.moveTo(-16, -4); g.quadraticCurveTo(-44, 0, -40, -22 + Math.sin(t * 3) * 3); }, 9, shock ? k : k);
  ell(g, 0, -24, 24, 27, k, 0, 3);
  ell(g, 9, -18, 11, 17, w, 0, 0);
  const bob = eating ? Math.abs(Math.sin(t * 6)) * 5 : 0;
  // head turns from the bowl (right) to look back (left) when look -> 1
  const hx = lerp(26, 6, look), hy = lerp(-38 + bob, -56, look);
  const fl = shock ? 1.25 : 1;
  poly(g, [hx - 17 * fl, hy - 6, hx - 14 * fl, hy - 28 * fl, hx - 3, hy - 14], k, 3);
  poly(g, [hx + 14 * fl, hy - 8, hx + 16 * fl, hy - 30 * fl, hx + 4, hy - 16], k, 3);
  ell(g, hx, hy, 19, 16, k, 0, 3);
  if (look > 0.5) {
    ell(g, hx, hy + 6, 10, 7, w, 0, 0);
    const r = shock ? 8 : 5;
    eye(g, hx - 8, hy - 2, r, -0.7, 0, 0, k, shock ? 0.25 : 0.5);
    eye(g, hx + 8, hy - 2, r, -0.7, 0, 0, k, shock ? 0.25 : 0.5);
    ell(g, hx, hy + 5, 2.4, 1.8, '#e48aa0', 0, 0);
  } else {
    ell(g, hx + 9, hy + 5, 9, 7, w, 0, 0);
    ell(g, hx + 12, hy - 2, 3.2, 3.6, '#c9e05a', 0, 1.5);
  }
  ell(g, 14, -1, 8, 4.5, w, 0, 2.5);
  g.restore();
}

const ARM_REST = [0.35, 62] as const, ARM_HOLD = [-2.5, 58] as const, ARM_PLACE = [-1.45, 82] as const;
function chefArm(t: number): readonly [number, number] {
  const mix = (a: readonly [number, number], b: readonly [number, number], k: number) => [lerp(a[0], b[0], ease(k)), lerp(a[1], b[1], ease(k))] as const;
  if (t < 3.9 || t >= 7.3) return ARM_REST;
  if (t < 4.4) return mix(ARM_REST, ARM_HOLD, seg(t, 3.9, 4.4));
  if (t < 5.4) return [ARM_HOLD[0] + Math.sin(t * 4) * 0.06, ARM_HOLD[1]];
  if (t < 6.6) return mix(ARM_HOLD, ARM_PLACE, seg(t, 5.4, 6.3));
  return mix(ARM_PLACE, ARM_REST, seg(t, 6.6, 7.3));
}
const CHEF_X = 160, CHEF_Y = 120;
const handPos = ([a, L]: readonly [number, number]) => [CHEF_X + 46 - Math.sin(a) * (L + 8), CHEF_Y + 56 + Math.cos(a) * (L + 8)] as const;

function cucumberShow(g: G, t: number) {
  if (within(t, 8.7, 11.7)) {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const a = seg(t, 8.7, 9.0) * (1 - seg(t, 11.4, 11.7));
    g.save(); g.globalAlpha = a;
    poly(g, [W / 2, 88, W / 2 + 22, 126, W / 2 - 22, 126], null, 0);
    g.lineWidth = 3; g.strokeStyle = '#fff'; g.lineJoin = 'round'; g.stroke();
    txt(g, '!', W / 2, 113, 20, '#fff', { weight: 800 });
    txt(g, 'VIEWER DISCRETION ADVISED', W / 2, 160, 20, '#fff', { weight: 700, spacing: 3 });
    g.restore();
    return;
  }
  const wrecked = t >= 11.7;
  // studio set
  g.fillStyle = '#9fd6cf'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2;
  for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 200); g.stroke(); }
  for (let y = 0; y < 200; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  rrect(g, 330, 26, 130, 80, 6, '#e8f6ff', 3);
  line(g, [395, 26, 395, 106], 3); line(g, [330, 66, 460, 66], 3);
  ell(g, 350, 104, 14, 10, '#6bb35a', 0, 2.5); ell(g, 440, 104, 14, 10, '#6bb35a', 0, 2.5);
  line(g, [40, 40, 140, 40], 4, '#8b5e3c');
  for (const [x, l] of [[60, 34], [86, 44], [112, 30]] as const) { line(g, [x, 40, x, 40 + l], 3); ell(g, x, 44 + l, 7, 9, '#c7ccd1', 0, 2.5); }

  const arm = wrecked ? ARM_REST : chefArm(t);
  chef(g, CHEF_X, CHEF_Y, t, {
    talk: !wrecked && (within(t, 0.3, 3.4) || within(t, 3.7, 5.2)),
    arm,
    shh: within(t, 7.3, 8.6),
    wrecked,
    sly: within(t, 3.7, 5.3),
  });
  // counter
  g.fillStyle = '#f5f1ea'; g.fillRect(0, 196, W, 16);
  g.fillStyle = '#c99a6b'; g.fillRect(0, 212, W, 76);
  line(g, [0, 196, W, 196], 3); line(g, [0, 212, W, 212], 3);
  for (let x = 64; x < W; x += 128) line(g, [x, 212, x, 288], 3);
  rrect(g, 46, 186, 90, 12, 4, '#e0b27a', 2.5);

  // cucumber: on the board, then carried and set behind the cat
  if (!wrecked) {
    let cx = 92, cy = 180, rot = 0;
    if (t >= 3.9) {
      const [hx, hy] = handPos(t < 6.3 ? arm : ARM_PLACE);
      const k = seg(t, 3.9, 4.4);
      cx = lerp(92, hx, ease(k)); cy = lerp(180, hy - 4, ease(k));
      rot = t < 5.4 ? -0.9 * k : lerp(-0.9, 0, seg(t, 5.4, 6.3));
    }
    cucumberShape(g, cx, cy, rot);
  } else cucumberShape(g, 420, 250, 0.4);

  if (!wrecked) {
    const look = seg(t, 7.8, 8.2);
    const jump = within(t, 8.25, 8.7) ? Math.sin(seg(t, 8.25, 8.7) * Math.PI) * 46 : 0;
    ell(g, 413, 194, 18, 6, '#e8634f', 0, 2.5);
    tuxCat(g, 375, 196 - jump, t, t < 7.8, look, t > 8.25);
    if (t > 8.25) txt(g, '!', 375, 112 - jump + Math.sin(t * 30) * 2, 30, '#fff', { stroke: 6, weight: 800 });
  } else {
    // aftermath: flour cloud, bowl upside down, cat long gone
    g.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(260 + hash(i) * 200, 120 + hash(i + 3) * 70, 18 + hash(i + 6) * 20, 0, TAU); g.fill(); }
    g.save(); g.translate(380, 190); g.rotate(0.6);
    g.beginPath(); g.ellipse(0, 0, 18, 10, 0, Math.PI, TAU); g.fillStyle = '#e8634f'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
    g.restore();
    for (let i = 0; i < 3; i++) line(g, [300 + i * 30, 160 + i * 6, 316 + i * 30, 150 + i * 6], 3, 'rgba(43,29,22,0.6)');
  }
  // show branding
  rrect(g, 10, 10, 124, 20, 5, 'rgba(226,70,59,0.9)', 0);
  txt(g, 'SIMPLY SEASONAL', 72, 20.5, 10, '#fff', { weight: 800, spacing: 1 });
  if (within(t, 0.3, 3.5)) sub(g, 'Today, a light summer salad.');
  else if (within(t, 3.7, 5.3)) sub(g, 'First, the cucumber.');
  else if (within(t, 12.0, 14)) sub(g, "We'll be right back.");
}

// ---------------------------------------------------------------- show: the dot (high production value)
function dotGlow(g: G, x: number, y: number, r: number) {
  const dg = g.createRadialGradient(x, y, 0, x, y, r * 4);
  dg.addColorStop(0, 'rgba(255,255,255,1)'); dg.addColorStop(0.18, 'rgba(255,60,50,1)'); dg.addColorStop(0.45, 'rgba(255,0,0,0.35)'); dg.addColorStop(1, 'rgba(255,0,0,0)');
  g.fillStyle = dg; g.beginPath(); g.arc(x, y, r * 4, 0, TAU); g.fill();
}
function dotPath(t: number): [number, number] {
  // lazy curves, a pause with hand tremor, a zip, a loop on the wall
  const u = t - 3.2;
  let x = 120 + u * 30 + Math.sin(u * 1.3) * 40, y = 220 + Math.sin(u * 2.1) * 18;
  if (u > 2.6 && u < 3.6) { x = 120 + 2.6 * 30 + Math.sin(2.6 * 1.3) * 40; y = 220 + Math.sin(2.6 * 2.1) * 18; }
  if (u >= 3.6) { const k = seg(u, 3.6, 3.85); x = lerp(120 + 78 + Math.sin(3.38) * 40, 380, k); y = lerp(220 + Math.sin(5.46) * 18, 120, k); }
  if (u >= 3.85) { const a = (u - 3.85) * 3; x = 380 + Math.sin(a) * 40; y = 120 - Math.sin(a * 2) * 20; }
  const tremor = Math.sin(t * 17) * 1.2 + Math.sin(t * 11.3) * 1;
  return [x + tremor, y + tremor * 0.7];
}
function grain(g: G, t: number, alpha: number) {
  g.save(); g.globalAlpha = alpha; g.fillStyle = '#fff';
  const f = Math.floor(t * 24);
  for (let i = 0; i < 140; i++) g.fillRect(hash(i + f * 131) * W, hash(i * 7 + f * 17) * H, 1.2, 1.2);
  g.restore();
}
function dotShow(g: G, t: number) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  if (t < 3.2) {
    const a1 = seg(t, 0.2, 0.7) * (1 - seg(t, 1.3, 1.7));
    txt(g, 'A LASER POINTER PRODUCTION', W / 2, H / 2, 11, '#d9d2c5', { weight: 500, spacing: 4, alpha: a1 });
    const k = seg(t, 1.7, 3.2), a2 = seg(t, 1.7, 2.1) * (1 - seg(t, 2.9, 3.2));
    if (a2 > 0) {
      g.save(); g.globalAlpha = a2;
      const fl = g.createLinearGradient(0, 0, W, 0);
      fl.addColorStop(0, 'rgba(255,60,40,0)'); fl.addColorStop(0.5, 'rgba(255,120,90,0.55)'); fl.addColorStop(1, 'rgba(255,60,40,0)');
      g.fillStyle = fl; g.fillRect(0, H / 2 - 2, W, 4);
      g.shadowColor = '#ff2a1a'; g.shadowBlur = 24;
      txt(g, 'THE DOT', W / 2, H / 2, 54 + k * 6, '#ff3a2a', { weight: 900, spacing: 8, font: "'Arial Black', 'Avenir Next', sans-serif" });
      g.restore();
    }
    grain(g, t, 0.25);
    return;
  }
  if (t > 10.2) {
    const a = seg(t, 10.2, 10.7);
    g.save(); g.globalAlpha = a; g.shadowColor = '#ff2a1a'; g.shadowBlur = 16;
    txt(g, 'THE DOT', W / 2, H / 2 - 14, 30, '#ff3a2a', { weight: 900, spacing: 6, font: "'Arial Black', 'Avenir Next', sans-serif" });
    g.restore();
    txt(g, 'Coming soon to a wall near you.', W / 2, H / 2 + 22, 13, '#e8e0d0', { weight: 500, alpha: seg(t, 10.6, 11.1) });
    grain(g, t, 0.25);
    return;
  }
  // the stage: a slow pan and push-in across a dark room, the dot is the star
  const pan = (t - 3.2) * 9, zoom = 1 + (t - 3.2) * 0.012;
  const [x, y] = dotPath(t);
  g.save();
  g.translate(W / 2, H / 2); g.scale(zoom, zoom); g.translate(-W / 2, -H / 2);
  const wall = g.createLinearGradient(0, 0, 0, 190);
  wall.addColorStop(0, '#231d35'); wall.addColorStop(1, '#3d3150');
  g.fillStyle = wall; g.fillRect(-20, -20, W + 40, 210);
  g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 2;
  for (let i = 0; i < 10; i++) { const px = ((i * 80 - pan) % (W + 160)) - 80; g.strokeRect(px, 110, 60, 64); }
  g.fillStyle = '#2f2433'; g.fillRect(-20, 190, W + 40, 120);
  g.fillStyle = '#4a3b52'; g.fillRect(-20, 182, W + 40, 9);
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 12; i++) { const px = ((i * 90 - pan * 1.4) % (W + 200)) - 100; g.beginPath(); g.moveTo(px, 192); g.lineTo(px - 120, 300); g.stroke(); }
  const spot = g.createRadialGradient(x, y, 8, x, y, 200);
  spot.addColorStop(0, 'rgba(255,110,90,0.38)'); spot.addColorStop(0.5, 'rgba(255,90,80,0.1)'); spot.addColorStop(1, 'rgba(255,90,70,0)');
  g.fillStyle = spot; g.fillRect(-20, -20, W + 40, H + 40);
  // parallax silhouettes: a chair and a lost sock
  g.fillStyle = '#0d0a12';
  const cx = 430 - pan * 1.6;
  g.fillRect(cx, 128, 12, 100); g.fillRect(cx + 100, 128, 12, 100); g.fillRect(cx - 6, 120, 124, 14);
  g.fillRect(cx + 100, 30, 12, 100); g.fillRect(cx + 70, 40, 46, 12); g.fillRect(cx + 70, 70, 46, 10);
  sock(g, 650 - pan * 2.2, 254, -0.25, '#0d0a12', 0);
  // dust in the beam
  for (let i = 0; i < 14; i++) {
    const a = hash(i) * TAU + t * 0.2, r = 20 + hash(i + 3) * 90;
    g.fillStyle = `rgba(255,200,190,${0.25 + hash(i + 7) * 0.3})`;
    g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7 - ((t * 6 + i * 9) % 30), 1.2, 0, TAU); g.fill();
  }
  for (let i = 8; i > 0; i--) { const [tx, ty] = dotPath(t - i * 0.03); g.fillStyle = `rgba(255,40,30,${0.06 * (9 - i)})`; g.beginPath(); g.arc(tx, ty, 4, 0, TAU); g.fill(); }
  const fl = g.createLinearGradient(x - 90, 0, x + 90, 0);
  fl.addColorStop(0, 'rgba(255,80,60,0)'); fl.addColorStop(0.5, 'rgba(255,160,140,0.55)'); fl.addColorStop(1, 'rgba(255,80,60,0)');
  g.fillStyle = fl; g.fillRect(x - 90, y - 1, 180, 2);
  dotGlow(g, x, y, 7);
  g.restore();
  vignette(g, 0.55);
  letterbox(g, 30);
  grain(g, t, 0.16);
  if (within(t, 5.6, 8.0)) sub(g, '[ dramatic music ]', '#ffffff', H - 15);
}

// ---------------------------------------------------------------- show: slow-motion tuna can
function tunaShow(g: G, t: number) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#3b2a22'); bg.addColorStop(1, '#1f1612');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 10; i++) {
    g.fillStyle = `rgba(255,${170 + hash(i) * 60},90,${0.08 + hash(i + 4) * 0.1})`;
    g.beginPath(); g.arc(hash(i + 2) * W, hash(i + 7) * 150, 20 + hash(i + 1) * 40, 0, TAU); g.fill();
  }
  g.fillStyle = '#8a5a36'; g.fillRect(0, 200, W, 88);
  g.strokeStyle = 'rgba(40,20,10,0.35)'; g.lineWidth = 2;
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0, 214 + i * 20); g.lineTo(W, 210 + i * 21); g.stroke(); }

  const cx = 256, top = 152, rx = 78, ry = 25, hgt = 72;
  const hingeY = top - ry;
  // lid hinges on its far edge: a disc tilted by th projects to sin(e - th) / sin(e) of its flat height
  const e = Math.asin(ry / rx);
  const th = t < 4.4 ? 0 : lerp(0, 0.14, seg(t, 4.4, 4.6)) + lerp(0, 1.06, ease(seg(t, 4.6, 9.5)));
  const proj = (a: number) => Math.sin(e - a) / Math.sin(e);
  const sy = proj(th);
  if (t > 4.4) {
    const a = Math.min(1, seg(t, 4.4, 5.2)) * (0.75 + Math.sin(t * 3) * 0.08);
    g.save(); g.translate(cx, top - 4); g.globalAlpha = a;
    for (let i = 0; i < 12; i++) {
      const ang = -Math.PI / 2 + (i - 5.5) * 0.2 + Math.sin(t * 0.7 + i) * 0.03;
      const rg = g.createLinearGradient(0, 0, Math.cos(ang) * 260, Math.sin(ang) * 260);
      rg.addColorStop(0, 'rgba(255,240,190,0.7)'); rg.addColorStop(1, 'rgba(255,240,190,0)');
      g.fillStyle = rg; g.beginPath(); g.moveTo(0, 0);
      g.lineTo(Math.cos(ang - 0.06) * 280, Math.sin(ang - 0.06) * 280); g.lineTo(Math.cos(ang + 0.06) * 280, Math.sin(ang + 0.06) * 280); g.fill();
    }
    g.restore();
  }
  const lidPath = (k: number, dx = 0, dy = 0, r = 1) => { // build a lid-space ellipse path under the hinge transform
    g.save(); g.translate(cx, hingeY + (1 - sy) * 3); g.scale(1, k);
    g.beginPath(); g.ellipse(dx, ry + dy, (rx - 3) * r, (ry - 2) * r, 0, 0, TAU);
    g.restore();
  };
  const lidDraw = () => {
    lidPath(sy);
    const lg = g.createLinearGradient(cx - rx, hingeY - 120, cx + rx, hingeY + 2 * ry);
    lg.addColorStop(0, '#f6f8f9'); lg.addColorStop(0.5, '#aab6bd'); lg.addColorStop(1, '#e3e8eb');
    g.fillStyle = lg; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(60,70,80,0.4)';
    for (const k of [0.75, 0.5]) { lidPath(sy, 0, 0, k); g.stroke(); }
    // pull ring: hinged on the lid near its front edge, lifts first
    const ph = lerp(0, 1.1, seg(t, 2.6, 4.4)) * (1 - seg(t, 5.0, 6.0));
    const ry0 = hingeY + (1 - sy) * 3 + (2 * ry - 26) * sy;
    g.save(); g.translate(cx + 22, ry0); g.scale(1, proj(th + ph));
    g.beginPath(); g.ellipse(0, 8, 15, 8, 0, 0, TAU);
    g.restore();
    g.lineWidth = 6; g.strokeStyle = INK; g.stroke(); g.lineWidth = 3.5; g.strokeStyle = '#dfe6ea'; g.stroke();
    return [cx + 22, ry0 + 16 * proj(th + ph)] as const;
  };
  // an opened lid stands behind the can, a closed one sits on top of it
  let ringTip: readonly [number, number] = [cx + 22, hingeY + 2 * ry - 10];
  if (sy < 0) ringTip = lidDraw();
  // can body
  g.beginPath(); g.moveTo(cx - rx, top); g.lineTo(cx - rx, top + hgt); g.ellipse(cx, top + hgt, rx, ry, 0, Math.PI, 0, true); g.lineTo(cx + rx, top);
  const side = g.createLinearGradient(cx - rx, 0, cx + rx, 0);
  side.addColorStop(0, '#8d9aa3'); side.addColorStop(0.35, '#e9eef1'); side.addColorStop(0.6, '#b8c3ca'); side.addColorStop(1, '#76838c');
  g.fillStyle = side; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
  g.save();
  g.beginPath(); g.moveTo(cx - rx, top + 14); g.lineTo(cx - rx, top + hgt - 9); g.ellipse(cx, top + hgt - 9, rx, ry, 0, Math.PI, 0, true); g.lineTo(cx + rx, top + 14); g.ellipse(cx, top + 14, rx, ry, 0, 0, Math.PI, false); g.closePath();
  g.fillStyle = '#2f6fb3'; g.fill(); g.clip();
  g.fillStyle = '#f4d35e'; g.fillRect(cx - rx, top + 46, rx * 2, 5);
  ell(g, cx - 4, top + 64, 22, 9.5, '#f2a65a', 0, 2.5);
  poly(g, [cx + 16, top + 64, cx + 30, top + 55, cx + 30, top + 73], '#f2a65a', 2.5);
  ell(g, cx - 16, top + 61, 2.2, 2.2, '#2b1d16', 0, 0);
  txt(g, 'TUNA', cx, top + 34, 18, '#ffffff', { weight: 900, spacing: 3 });
  g.restore();
  // inside
  ell(g, cx, top, rx, ry, '#c3ccd2', 0, 3);
  ell(g, cx, top + 2, rx - 7, ry - 4, '#e7b9a0', 0, 2);
  for (let i = 0; i < 14; i++) ell(g, cx - 52 + hash(i) * 104, top - 7 + hash(i + 5) * 15, 7, 3, i % 2 ? '#f0c7ae' : '#d9a184', hash(i) * 3, 0);
  if (sy >= 0) ringTip = lidDraw();
  if (t < 4.2) { // glint sweep across the closed lid
    const gx = cx - rx + ((t * 70) % (rx * 2 + 80));
    g.save(); g.beginPath(); g.ellipse(cx, top, rx - 3, ry - 2, 0, 0, TAU); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.moveTo(gx, top - ry); g.lineTo(gx + 14, top - ry); g.lineTo(gx - 6, top + ry); g.lineTo(gx - 20, top + ry); g.fill();
    g.restore();
  }
  // a finger on the ring tab, it follows the ring as the lid peels
  if (within(t, 1.8, 6.6)) {
    const k = seg(t, 1.8, 2.6) * (1 - seg(t, 5.8, 6.6));
    const fx = lerp(580, ringTip[0], ease(k)), fy = lerp(20, ringTip[1], ease(k));
    thick(g, () => { g.moveTo(fx, fy); g.lineTo(fx + 120, fy - 90); }, 24, '#f2c4a0');
    ell(g, fx + 3, fy - 1, 9, 7, '#f8d6bb', -0.65, 2.5);
  }
  if (within(t, 4.4, 5.6)) {
    const k = seg(t, 4.4, 5.6);
    g.save(); g.globalAlpha = 1 - k;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI - Math.PI, r0 = 40 + k * 60, r1 = 70 + k * 110;
      line(g, [cx + Math.cos(a) * r0, top + Math.sin(a) * r0 * 0.6, cx + Math.cos(a) * r1, top + Math.sin(a) * r1 * 0.6], 3, '#fff6d0');
    }
    g.restore();
  }
  if (t > 7) {
    for (let i = 0; i < 3; i++) {
      g.save(); g.globalAlpha = seg(t, 7 + i * 0.5, 8 + i * 0.5) * 0.7;
      g.beginPath();
      for (let y = 0; y < 60; y += 4) { const x = cx - 36 + i * 36 + Math.sin(y * 0.12 + t * 2 + i) * 7; if (y === 0) g.moveTo(x, top - 14 - y); else g.lineTo(x, top - 14 - y); }
      g.lineWidth = 4; g.strokeStyle = 'rgba(255,250,235,0.85)'; g.lineCap = 'round'; g.stroke();
      g.restore();
    }
  }
  // an orange tabby paw creeps in, very slowly
  if (t > 10.3) {
    const k = ease(seg(t, 10.3, 12.6));
    const px = lerp(-70, 104, k), py = lerp(330, 238, k);
    thick(g, () => { g.moveTo(px - 90, py + 70); g.lineTo(px - 6, py + 4); }, 36, '#f2a65a');
    for (let i = 0; i < 3; i++) line(g, [px - 70 + i * 22, py + 38 - i * 16, px - 56 + i * 22, py + 56 - i * 16], 4, '#d27c35');
    ell(g, px + 6, py - 2, 25, 20, '#f6b26e', -0.6, 3);
    for (let i = 0; i < 3; i++) {
      const a = -1.75 + i * 0.5;
      line(g, [px + 6 + Math.cos(a) * 14, py - 2 + Math.sin(a) * 11, px + 6 + Math.cos(a) * 24, py - 2 + Math.sin(a) * 19], 2.5);
    }
  }
  if (t > 3.3) {
    rrect(g, 16, 14, 122, 24, 5, 'rgba(200,30,30,0.9)', 0);
    txt(g, 'SLOW MOTION', 77, 26, 12, '#fff', { weight: 800, spacing: 1.5 });
    txt(g, `1000 FPS  ${String(Math.floor((t - 3.3) * 1000)).padStart(5, '0')}`, 16, 50, 10, 'rgba(255,255,255,0.85)', { align: 'left', weight: 600, stroke: 3 });
  }
  vignette(g, 0.45);
  if (within(t, 4.5, 6.4)) sub(g, '[ pssshk ]');
  else if (within(t, 6.8, 9.6)) sub(g, '[ every cat in the house wakes up ]');
}

// ---------------------------------------------------------------- shows table + api
const SHOWS: Record<TvShow, { len: number; ch: number; draw: (g: G, t: number) => void }> = {
  birds: { len: 14, ch: 2, draw: birdsShow },
  rickAndMeowty: { len: 15, ch: 4, draw: labShow },
  planetMearth: { len: 15, ch: 5, draw: natureShow },
  cucumber: { len: 14, ch: 7, draw: cucumberShow },
  laserDot: { len: 12.5, ch: 9, draw: dotShow },
  cookingShow: { len: 13, ch: 11, draw: tunaShow },
};

/** channel bug: little cat-head logo with the channel number */
function bug(g: G, ch: number) {
  g.save();
  g.globalAlpha = 0.6;
  const x = W - 34, y = 24;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(x - 16, y + 12); g.lineTo(x - 16, y - 8); g.lineTo(x - 11, y - 18); g.lineTo(x - 5, y - 10);
  g.lineTo(x + 5, y - 10); g.lineTo(x + 11, y - 18); g.lineTo(x + 16, y - 8); g.lineTo(x + 16, y + 12); g.closePath(); g.fill();
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-out';
  txt(g, String(ch), x, y + 2, 15, '#000', { weight: 900 });
  g.restore();
}

function makeNoise(): HTMLCanvasElement[] {
  return [0, 1, 2, 3].map(() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 72;
    const x = c.getContext('2d')!, img = x.createImageData(128, 72);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0);
    return c;
  });
}

export function createCatTv(): CatTvApi & { seek(t: number): void } {
  const canvas = document.createElement('canvas');
  canvas.width = W * RES; canvas.height = H * RES;
  const g = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const noise = makeNoise();

  let on = false, show: TvShow = 'birds', t = 0, clock = 0, acc = 1;
  let staticT = 0;       // channel switch static, counts down
  let powerT = 0;        // >0 powering on (counts down), <0 powering off (counts up to 0)

  function drawOff() {
    const bgr = g.createLinearGradient(0, 0, W, H);
    bgr.addColorStop(0, '#1b2226'); bgr.addColorStop(1, '#0b0e10');
    g.fillStyle = bgr; g.fillRect(0, 0, W, H);
    // glossy reflection: a soft diagonal sheen and a faint window
    const sh = g.createLinearGradient(0, 0, W, H);
    sh.addColorStop(0.15, 'rgba(255,255,255,0)'); sh.addColorStop(0.32, 'rgba(255,255,255,0.07)'); sh.addColorStop(0.42, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fillRect(0, 0, W, H);
    // a tall window behind the viewer, softly skewed
    g.fillStyle = 'rgba(255,240,220,0.045)';
    g.beginPath(); g.moveTo(360, 30); g.lineTo(420, 22); g.lineTo(426, 150); g.lineTo(366, 156); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(13,17,19,0.9)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(391, 26); g.lineTo(396, 153); g.stroke();
  }
  function drawStatic(k: number) {
    g.imageSmoothingEnabled = false;
    g.drawImage(noise[Math.floor(clock * 40) % 4], 0, 0, W, H);
    g.imageSmoothingEnabled = true;
    const by = ((clock * 300) % (H + 60)) - 30;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, by, W, 24);
    g.fillStyle = `rgba(0,0,0,${0.3 * (1 - k)})`; g.fillRect(0, 0, W, H);
  }
  function draw() {
    g.setTransform(RES, 0, 0, RES, 0, 0);
    if (!on && powerT >= 0) { drawOff(); return; }
    const s = SHOWS[show];
    if (staticT > 0) drawStatic(staticT / 0.35);
    else {
      g.save();
      s.draw(g, t % s.len);
      g.restore();
      bug(g, s.ch);
    }
    // CRT-ish power transitions: open from / collapse to a bright line
    const p = powerT > 0 ? 1 - powerT / 0.35 : powerT < 0 ? -powerT / 0.3 : 1;
    if (p < 1) {
      const h = Math.max(2, H * ease(p));
      g.fillStyle = '#05070a';
      g.fillRect(0, 0, W, (H - h) / 2); g.fillRect(0, (H + h) / 2, W, (H - h) / 2);
      g.fillStyle = `rgba(255,255,255,${0.8 * (1 - p)})`; g.fillRect(0, (H - h) / 2, W, h);
    }
  }

  draw();
  return {
    texture,
    setOn(v) {
      if (v === on) return;
      on = v;
      if (on) { powerT = 0.35; staticT = 0.25; t = 0; } else powerT = -0.3;
      acc = 1;
    },
    setShow(s) {
      if (s === show) return;
      show = s; t = 0;
      if (on) staticT = 0.35;
      acc = 1;
    },
    update(dt) {
      dt = Math.max(0, dt);
      clock += dt;
      if (!on && powerT >= 0) {
        if (acc > 0) { draw(); texture.needsUpdate = true; acc = 0; }
        return;
      }
      if (powerT > 0) powerT = Math.max(0, powerT - dt);
      else if (powerT < 0) { powerT = Math.min(0, powerT + dt); if (powerT === 0) acc = 1; }
      if (staticT > 0) staticT = Math.max(0, staticT - dt); else t += dt;
      acc += dt;
      if (acc >= 1 / FPS) { acc = 0; draw(); texture.needsUpdate = true; }
    },
    /** jump to a time in the current show (preview / screenshots) */
    seek(time) { t = time; staticT = 0; powerT = 0; draw(); texture.needsUpdate = true; },
  };
}
