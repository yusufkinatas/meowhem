/**
 * Cartoon FX: pooled billboard sprites with canvas-drawn art (drawn once per color, cached).
 * One pool for camera-facing sprites, one small pool for flat ground quads (ripples).
 * "screen" particles lay out in the camera's horizontal-right / world-up plane, so clouds, icons
 * and stink lines read the same from any angle.
 */
import * as THREE from 'three';
import type { FxApi, FxKind, FxOptions } from '../shared/contracts';
import { paintTex, disposePaint, blob, shine, glyph, circ, ellipse, poly, smooth, dark, light, OL, TAU } from './paint';

// ================================================================ art
const art = {
  /** puff body without outline; drawn above all `disc` sprites so overlapping puffs share one silhouette */
  puff: (c: string) => paintTex(`puff|${c}`, (g) => {
    g.fillStyle = dark(c, 0.14);
    g.fill(circ(0.5, 0.5, 0.41));
    g.fillStyle = c;
    g.fill(circ(0.45, 0.45, 0.36));
  }),
  /** unshaded puff body: overlapping ones merge into one flat shape (mist) */
  flat: (c: string) => paintTex(`flat|${c}`, (g) => {
    g.fillStyle = c;
    g.fill(circ(0.5, 0.5, 0.41));
  }),
  disc: (c: string) => paintTex(`disc|${c}`, (g) => {
    g.fillStyle = c;
    g.fill(circ(0.5, 0.5, 0.475));
  }),
  shard: (c: string, v: number) => paintTex(`shard|${c}|${v}`, (g) => {
    const shapes = [
      [0.48, 0.06, 0.62, 0.3, 0.9, 0.78, 0.42, 0.86, 0.14, 0.92],
      [0.2, 0.18, 0.86, 0.1, 0.7, 0.52, 0.8, 0.9, 0.3, 0.7],
      [0.5, 0.08, 0.92, 0.55, 0.55, 0.92, 0.1, 0.6],
    ];
    const s = shapes[v % 3];
    blob(g, poly(s), c, 0.04, 0.09);
    g.fillStyle = light(c, 0.5);
    g.fill(poly([s[0], s[1], (s[0] + s[2]) / 2 + 0.02, (s[1] + s[3]) / 2 + 0.06, (s[0] + s[4]) / 2, (s[1] + s[5]) / 2]));
    if (v === 1) { // painted mug stripe
      g.save(); g.clip(poly(s));
      g.fillStyle = '#5d9bd5'; g.fillRect(0, 0.42, 1, 0.12);
      g.restore();
    }
  }),
  burst: (c: string) => paintTex(`burst|${c}`, (g) => {
    const pts: number[] = [];
    const n = 11;
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * TAU, r = i % 2 ? 0.22 : 0.47 - (i % 4 === 0 ? 0.06 : 0);
      pts.push(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r);
    }
    blob(g, poly(pts), c, 0.035, 0);
    g.fillStyle = '#ffffff';
    g.fill(circ(0.5, 0.5, 0.14));
  }),
  star: (c: string) => paintTex(`star|${c}`, (g) => {
    const pts: number[] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * TAU, r = i % 2 ? 0.2 : 0.44;
      pts.push(0.5 + Math.cos(a) * r, 0.53 + Math.sin(a) * r);
    }
    blob(g, poly(pts), c, 0.05, 0.07);
    shine(g, 0.42, 0.4, 0.06, 0.035, -0.7);
  }),
  sparkle: (c: string) => paintTex(`sparkle|${c}`, (g) => {
    const p = new Path2D();
    const k = 0.1;
    p.moveTo(0.5, 0.03);
    p.quadraticCurveTo(0.5 + k, 0.5 - k, 0.97, 0.5);
    p.quadraticCurveTo(0.5 + k, 0.5 + k, 0.5, 0.97);
    p.quadraticCurveTo(0.5 - k, 0.5 + k, 0.03, 0.5);
    p.quadraticCurveTo(0.5 - k, 0.5 - k, 0.5, 0.03);
    blob(g, p, c, 0.035, 0);
    g.fillStyle = '#ffffff';
    g.fill(circ(0.5, 0.5, 0.07));
  }),
  heart: (c: string) => paintTex(`heart|${c}`, (g) => {
    const p = new Path2D();
    p.moveTo(0.5, 0.88);
    p.bezierCurveTo(0.12, 0.62, 0.02, 0.36, 0.2, 0.2);
    p.bezierCurveTo(0.34, 0.08, 0.48, 0.16, 0.5, 0.3);
    p.bezierCurveTo(0.52, 0.16, 0.66, 0.08, 0.8, 0.2);
    p.bezierCurveTo(0.98, 0.36, 0.88, 0.62, 0.5, 0.88);
    p.closePath();
    blob(g, p, c, 0.05, 0.08);
    shine(g, 0.27, 0.3, 0.08, 0.05, -0.8);
  }),
  z: (c: string) => paintTex(`z|${c}`, (g) => {
    const p = new Path2D();
    p.moveTo(0.26, 0.26); p.lineTo(0.74, 0.26); p.lineTo(0.26, 0.74); p.lineTo(0.74, 0.74);
    glyph(g, p, 0.15, c, 0.05);
  }),
  exclaim: (c: string) => paintTex(`exclaim|${c}`, (g) => {
    const bar = smooth([0.36, 0.08, 0.64, 0.08, 0.66, 0.1, 0.56, 0.64, 0.44, 0.64, 0.34, 0.1]);
    const dot = circ(0.5, 0.82, 0.095);
    g.lineWidth = 0.1; g.strokeStyle = OL; g.stroke(bar); g.stroke(dot);
    blob(g, bar, c, 0, 0.05);
    blob(g, dot, c, 0, 0.04);
    shine(g, 0.44, 0.2, 0.035, 0.07, 0.15);
  }),
  question: (c: string) => paintTex(`question|${c}`, (g) => {
    const p = new Path2D();
    p.moveTo(0.3, 0.32);
    p.bezierCurveTo(0.3, 0.1, 0.72, 0.08, 0.72, 0.32);
    p.bezierCurveTo(0.72, 0.46, 0.5, 0.47, 0.5, 0.64);
    const dot = circ(0.5, 0.84, 0.085);
    g.lineWidth = 0.17 + 0.1; g.strokeStyle = OL; g.lineCap = 'round'; g.stroke(p); g.stroke(dot);
    glyph(g, p, 0.17, c, 0);
    blob(g, dot, c, 0, 0);
    g.lineWidth = 0.04; g.strokeStyle = 'rgba(255,255,255,0.85)';
    const h = new Path2D(); h.moveTo(0.33, 0.27); h.bezierCurveTo(0.36, 0.17, 0.46, 0.14, 0.52, 0.14); g.stroke(h);
  }),
  anger: (c: string) => paintTex(`anger|${c}`, (g) => {
    const p = new Path2D();
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2, cs = Math.cos(a), sn = Math.sin(a);
      const T = (x: number, y: number): [number, number] => [0.5 + x * cs - y * sn, 0.5 + x * sn + y * cs];
      p.moveTo(...T(0.1, 0.38));
      p.quadraticCurveTo(...T(0.11, 0.11), ...T(0.38, 0.1));
    }
    glyph(g, p, 0.11, c, 0.05);
    g.lineWidth = 0.03; g.strokeStyle = light(c, 0.5);
    const h = new Path2D();
    h.moveTo(0.5 - 0.1, 0.5 - 0.3); h.quadraticCurveTo(0.5 - 0.12, 0.5 - 0.12, 0.5 - 0.3, 0.5 - 0.1);
    g.stroke(h);
  }),
  drop: (c: string) => paintTex(`drop|${c}`, (g) => {
    const p = new Path2D();
    p.moveTo(0.5, 0.06);
    p.bezierCurveTo(0.58, 0.28, 0.8, 0.46, 0.8, 0.64);
    p.bezierCurveTo(0.8, 0.84, 0.66, 0.94, 0.5, 0.94);
    p.bezierCurveTo(0.34, 0.94, 0.2, 0.84, 0.2, 0.64);
    p.bezierCurveTo(0.2, 0.46, 0.42, 0.28, 0.5, 0.06);
    blob(g, p, c, 0.045, 0.07);
    shine(g, 0.37, 0.62, 0.05, 0.1, 0.2);
  }),
  droplet: (c: string) => paintTex(`droplet|${c}`, (g) => {
    blob(g, circ(0.5, 0.5, 0.36), c, 0.06, 0.08);
    shine(g, 0.4, 0.38, 0.09, 0.06);
  }),
  ring: (c: string) => paintTex(`ring|${c}`, (g) => {
    const p = circ(0.5, 0.5, 0.4);
    glyph(g, p, 0.07, c, 0.025);
  }),
  ripple: (c: string) => paintTex(`ripple|${c}`, (g) => {
    g.lineWidth = 0.06; g.strokeStyle = c; g.stroke(circ(0.5, 0.5, 0.42));
    g.lineWidth = 0.015; g.strokeStyle = dark(c, 0.4); g.stroke(circ(0.5, 0.5, 0.45));
  }),
  paw: (c: string) => paintTex(`paw|${c}`, (g) => {
    const main = ellipse(0.5, 0.6, 0.3, 0.27);
    const toes = [[-0.22, 0.3], [-0.08, 0.22], [0.08, 0.22], [0.22, 0.3]].map(([x, y]) => circ(0.5 + x, y + 0.05, 0.11));
    g.lineWidth = 0.1; g.strokeStyle = OL;
    g.stroke(main); toes.forEach((t) => g.stroke(t));
    g.fillStyle = c; g.fill(main); toes.forEach((t) => g.fill(t));
    // shadow rim at the bottom
    g.save(); g.clip(main); g.fillStyle = dark(c, 0.22); g.fill(ellipse(0.56, 0.78, 0.3, 0.14)); g.restore();
    const bean = '#ff9cb5';
    const pad = new Path2D();
    pad.moveTo(0.5, 0.48);
    pad.bezierCurveTo(0.66, 0.46, 0.72, 0.66, 0.66, 0.72);
    pad.bezierCurveTo(0.6, 0.78, 0.55, 0.72, 0.5, 0.74);
    pad.bezierCurveTo(0.45, 0.72, 0.4, 0.78, 0.34, 0.72);
    pad.bezierCurveTo(0.28, 0.66, 0.34, 0.46, 0.5, 0.48);
    g.fillStyle = bean; g.fill(pad);
    [[-0.22, 0.32], [-0.08, 0.24], [0.08, 0.24], [0.22, 0.32]].forEach(([x, y]) => g.fill(ellipse(0.5 + x, y + 0.06, 0.055, 0.065)));
    shine(g, 0.45, 0.56, 0.04, 0.025, -0.3, 0.7);
  }),
  tuft: (c: string) => paintTex(`tuft|${c}`, (g) => {
    const p = new Path2D();
    // a soft lock of fur curling to one side
    p.moveTo(0.46, 0.94);
    p.bezierCurveTo(0.2, 0.9, 0.18, 0.6, 0.3, 0.42);
    p.quadraticCurveTo(0.32, 0.3, 0.26, 0.2);
    p.quadraticCurveTo(0.44, 0.26, 0.47, 0.4);
    p.bezierCurveTo(0.5, 0.24, 0.6, 0.1, 0.78, 0.06);
    p.bezierCurveTo(0.66, 0.2, 0.7, 0.4, 0.76, 0.56);
    p.bezierCurveTo(0.82, 0.8, 0.66, 0.94, 0.46, 0.94);
    p.closePath();
    blob(g, p, c, 0.04, 0.07);
    g.lineWidth = 0.025; g.strokeStyle = light(c, 0.5);
    const h = new Path2D(); h.moveTo(0.4, 0.8); h.quadraticCurveTo(0.34, 0.64, 0.4, 0.5); g.stroke(h);
  }),
  wave: (c: string) => paintTex(`wave|${c}`, (g) => {
    const p = new Path2D();
    for (let i = 0; i <= 24; i++) {
      const y = 0.9 - (i / 24) * 0.8, x = 0.5 + Math.sin((i / 24) * TAU * 1.25) * 0.12;
      if (i) p.lineTo(x, y); else p.moveTo(x, y);
    }
    glyph(g, p, 0.1, c, 0.04);
  }),
  fly: () => paintTex('fly', (g) => {
    g.lineWidth = 0.06; g.strokeStyle = OL;
    const w1 = ellipse(0.34, 0.32, 0.17, 0.11, -0.5), w2 = ellipse(0.66, 0.32, 0.17, 0.11, 0.5);
    g.stroke(w1); g.stroke(w2);
    g.fillStyle = 'rgba(235,248,255,0.95)'; g.fill(w1); g.fill(w2);
    blob(g, ellipse(0.5, 0.58, 0.17, 0.22), '#3d3540', 0.04, 0);
    g.fillStyle = '#ffffff'; g.fill(circ(0.44, 0.5, 0.05)); g.fill(circ(0.56, 0.5, 0.05));
  }),
  confetti: (c: string) => paintTex(`confetti|${c}`, (g) => {
    const p = new Path2D();
    p.roundRect(0.2, 0.3, 0.6, 0.4, 0.06);
    blob(g, p, c, 0.035, 0.06);
  }),
  streamer: () => paintTex('streamer', (g) => {
    const p = new Path2D();
    for (let i = 0; i <= 30; i++) {
      const t = i / 30, x = 0.08 + t * 0.84, y = 0.5 + Math.sin(t * TAU * 1.3) * 0.16;
      if (i) p.lineTo(x, y); else p.moveTo(x, y);
    }
    glyph(g, p, 0.17, '#fbf8f0', 0.035);
    g.save(); g.lineWidth = 0.17; g.strokeStyle = '#000'; g.globalCompositeOperation = 'source-atop';
    g.setLineDash([0.012, 0.14]); g.lineCap = 'butt'; g.strokeStyle = 'rgba(160,150,140,0.6)'; g.stroke(p);
    g.restore();
  }),
  sheet: () => paintTex('sheet', (g) => {
    const p = new Path2D();
    p.roundRect(0.18, 0.18, 0.64, 0.64, 0.05);
    blob(g, p, '#fbf8f0', 0.035, 0.07);
    g.fillStyle = 'rgba(170,160,150,0.5)';
    for (let x = 0.3; x < 0.75; x += 0.14) for (let y = 0.3; y < 0.75; y += 0.14) g.fill(circ(x, y, 0.018));
    g.setLineDash([0.04, 0.03]); g.lineWidth = 0.02; g.strokeStyle = 'rgba(140,130,120,0.7)';
    g.beginPath(); g.moveTo(0.2, 0.24); g.lineTo(0.8, 0.24); g.stroke();
  }),
  note: (c: string) => paintTex(`note|${c}`, (g) => {
    const head = ellipse(0.37, 0.74, 0.15, 0.11, -0.35);
    const stem = new Path2D(); stem.moveTo(0.5, 0.72); stem.lineTo(0.5, 0.16);
    const flag = new Path2D(); flag.moveTo(0.5, 0.16); flag.quadraticCurveTo(0.56, 0.32, 0.76, 0.36); flag.quadraticCurveTo(0.82, 0.44, 0.74, 0.54);
    g.lineWidth = 0.18; g.strokeStyle = OL; g.stroke(stem); g.stroke(flag);
    g.lineWidth = 0.1; g.stroke(head);
    blob(g, head, c, 0, 0.04);
    g.lineWidth = 0.08; g.strokeStyle = c; g.stroke(stem); g.stroke(flag);
    shine(g, 0.32, 0.71, 0.04, 0.025, -0.4);
  }),
  slash: (c: string) => paintTex(`slash|${c}`, (g) => {
    const p = new Path2D();
    p.moveTo(0.22, 0.88);
    p.quadraticCurveTo(0.34, 0.38, 0.8, 0.1);
    p.quadraticCurveTo(0.46, 0.46, 0.22, 0.88);
    p.closePath();
    g.lineWidth = 0.07; g.strokeStyle = OL; g.stroke(p);
    g.fillStyle = c; g.fill(p);
  }),
  leaf: (c: string) => paintTex(`leaf|${c}`, (g) => {
    const p = new Path2D();
    p.moveTo(0.5, 0.06);
    p.quadraticCurveTo(0.9, 0.44, 0.5, 0.94);
    p.quadraticCurveTo(0.1, 0.44, 0.5, 0.06);
    blob(g, p, c, 0.045, 0.07);
    g.lineWidth = 0.035; g.strokeStyle = dark(c, 0.35);
    g.beginPath(); g.moveTo(0.5, 0.16); g.lineTo(0.5, 0.86); g.stroke();
  }),
};

// ---------------------------------------------------------------- text
const TEXT_FONT = '"Baloo 2","Fredoka","Arial Rounded MT Bold","Nunito","Arial Black",system-ui,sans-serif';
const textCache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>();
function textTex(text: string, color: string): { tex: THREE.CanvasTexture; aspect: number } {
  const key = `${text}|${color}`;
  const hit = textCache.get(key);
  if (hit) { textCache.delete(key); textCache.set(key, hit); return hit; }
  const px = 96, pad = 26;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = `900 ${px}px ${TEXT_FONT}`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + pad * 2;
  c.width = w; c.height = px + pad * 2;
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const x = w / 2, y = c.height / 2 + px * 0.06;
  g.fillStyle = OL; // drop shadow
  g.lineWidth = px * 0.3; g.strokeStyle = OL;
  g.strokeText(text, x, y + px * 0.07);
  g.strokeText(text, x, y);
  const gr = g.createLinearGradient(0, y - px * 0.45, 0, y + px * 0.4);
  gr.addColorStop(0, light(color, 0.55));
  gr.addColorStop(0.45, color);
  gr.addColorStop(1, dark(color, 0.18));
  g.fillStyle = gr;
  g.fillText(text, x, y);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const out = { tex, aspect: w / c.height };
  textCache.set(key, out);
  if (textCache.size > 48) { // ponytail: LRU by insertion order, a disposed texture re-uploads if still on screen
    const [k, v] = textCache.entries().next().value!;
    v.tex.dispose(); textCache.delete(k);
  }
  return out;
}

// ================================================================ engine
interface Inst {
  at: THREE.Vector3; off: THREE.Vector3; follow: THREE.Object3D | null;
  t: number; dur: number; live: number; s: number; acc: number; acc2: number; ox: number; oy: number; n: number;
  tick: ((f: Inst, dt: number) => void) | null;
}
type Fn = (p: P, a: number, dt: number) => void;
interface P {
  obj: THREE.Object3D; mat: THREE.SpriteMaterial | THREE.MeshBasicMaterial; flat: boolean; fx: Inst;
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  g: number; drag: number; bounce: number; floor: number;
  age: number; delay: number; life: number; size: number; aspect: number; grow: number;
  rot: number; vr: number; pop: number; out: number; shrink: boolean; fade: boolean; fadeIn: number; op: number;
  screen: boolean; flutter: number; sway: number; swayF: number; phase: number; keep: number;
  /** rotate the sprite so its texture-up points against the motion (trailing drop tip) */
  align: boolean;
  layer: number;
  sx: number; sy: number; fn: Fn | null;
}
type Opt = Partial<Omit<P, 'obj' | 'mat' | 'flat' | 'fx'>> & { tint?: THREE.ColorRepresentation };

// render layers: all puff outlines, then things poking out from behind clouds, then puff bodies, then the rest
const L_LINE = 1, L_POKE = 1.5, L_FILL = 2, L_TOP = 3, L_UI = 4;
const SPRITE_CAP = 400, FLAT_CAP = 24;
const R = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: readonly T[]): T => a[(Math.random() * a.length) | 0];
const backOut = (t: number, k = 2.2) => 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2;
const CONFETTI = ['#ff6f91', '#ffd84a', '#6fd3ff', '#8be07a', '#b98cff', '#ff9a4d'];

export function createFx(scene: THREE.Scene): FxApi {
  const group = new THREE.Group();
  group.name = 'fx';
  scene.add(group);
  const flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const freeS: P[] = [], freeF: P[] = [], live: P[] = [], insts: Inst[] = [];
  let nS = 0, nF = 0;
  const right = new THREE.Vector3(1, 0, 0), back = new THREE.Vector3(0, 0, 1), camPos = new THREE.Vector3();
  const tmpV = new THREE.Vector3(), tmpU = new THREE.Vector3(), tmpW = new THREE.Vector3(), view = new THREE.Matrix4();

  function make(flat: boolean): P {
    let obj: THREE.Object3D, mat: P['mat'];
    if (flat) {
      mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
      obj = new THREE.Mesh(flatGeo, mat);
    } else {
      mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false });
      obj = new THREE.Sprite(mat);
    }
    obj.visible = false;
    obj.frustumCulled = false;
    group.add(obj);
    return { obj, mat, flat } as P;
  }

  function acquire(flat: boolean): P {
    const free = flat ? freeF : freeS;
    let p = free.pop();
    if (!p && (flat ? nF < FLAT_CAP : nS < SPRITE_CAP)) {
      p = make(flat);
      if (flat) nF++; else nS++;
    }
    if (!p) { // steal the oldest of the same kind
      const i = live.findIndex((q) => q.flat === flat);
      p = live[i];
      live.splice(i, 1);
      p.fx.live--;
    }
    return p;
  }

  function emit(f: Inst, tex: THREE.Texture, o: Opt, flat = false): P {
    const p = acquire(flat);
    p.fx = f;
    p.x = p.y = p.z = p.vx = p.vy = p.vz = p.g = p.drag = p.bounce = 0;
    p.floor = -Infinity; p.age = p.delay = 0; p.life = 1; p.size = 0.1; p.aspect = 1; p.grow = 1;
    p.rot = p.vr = p.pop = 0; p.out = 0.2; p.shrink = true; p.fade = true; p.fadeIn = 0; p.op = 1;
    p.screen = false; p.flutter = 0; p.sway = 0; p.swayF = 3; p.phase = Math.random() * TAU; p.keep = 0;
    p.align = false; p.layer = o.keep ? L_UI : L_TOP; p.sx = p.sy = 1; p.fn = null;
    Object.assign(p, o);
    p.mat.map = tex;
    p.mat.color.set(o.tint ?? 0xffffff);
    p.mat.opacity = 0;
    p.obj.visible = false;
    p.obj.renderOrder = p.layer;
    f.live++;
    live.push(p);
    return p;
  }

  /** cartoon puff: outline disc + body on separate layers, so a cluster of puffs reads as one outlined cloud */
  function puff(f: Inst, c: string, o: Opt, line: string = OL, flat = false) {
    const ph = o.phase ?? Math.random() * TAU;
    emit(f, art.disc(line), { ...o, phase: ph, layer: L_LINE, fade: false });
    emit(f, flat ? art.flat(c) : art.puff(c), { ...o, phase: ph, layer: L_FILL, fade: false });
  }

  function newInst(pos: THREE.Vector3, o: FxOptions): Inst {
    const f: Inst = { at: pos.clone(), off: new THREE.Vector3(), follow: o.follow ?? null, t: 0, dur: 0, live: 0, s: o.scale ?? 1, acc: 0, acc2: 0, ox: 0, oy: 0, n: 0, tick: null };
    if (f.follow) {
      f.follow.updateWorldMatrix(true, false);
      f.off.copy(pos).sub(f.follow.getWorldPosition(tmpV));
    }
    insts.push(f);
    return f;
  }

  /** random unit vector inside a cone around d (half angle in radians) */
  function cone(d: THREE.Vector3, half: number, out: THREE.Vector3): THREE.Vector3 {
    tmpU.set(Math.abs(d.y) < 0.9 ? 0 : 1, Math.abs(d.y) < 0.9 ? 1 : 0, 0).cross(d).normalize();
    tmpW.copy(d).cross(tmpU);
    const r = Math.tan(half) * Math.sqrt(Math.random()), a = Math.random() * TAU;
    return out.copy(d).addScaledVector(tmpU, Math.cos(a) * r).addScaledVector(tmpW, Math.sin(a) * r).normalize();
  }

  /** looped emitter: calls `burst` every `period` seconds while t < dur */
  const every = (f: Inst, dur: number, period: number, burst: (f: Inst) => void) => {
    f.dur = dur;
    f.tick = (f, dt) => {
      if (f.t > dur) return;
      f.acc -= dt;
      while (f.acc <= 0) { f.acc += period; burst(f); }
    };
  };

  // ---------------------------------------------------------------- effects
  const puffRing = (f: Inst, n: number, c: string, speed: number, size: number, life: number, y = 0.06) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + R(-0.3, 0.3), v = speed * R(0.8, 1.2) * f.s;
      puff(f, c, { x: Math.cos(a) * 0.06 * f.s, z: Math.sin(a) * 0.06 * f.s, y: y * f.s, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: R(0.2, 0.5) * f.s,
        drag: 4.5, size: size * R(0.8, 1.2) * f.s, grow: 1.9, life: life * R(0.85, 1.15), pop: 0.07, out: life * 0.55 });
    }
  };

  const FX: Record<FxKind, (f: Inst, o: FxOptions) => void> = {
    shatter(f, o) {
      const s = f.s, c = o.color ?? '#f7f2e8', d = o.dir;
      emit(f, art.burst('#fff4c2'), { y: 0.1 * s, size: 0.45 * s, life: 0.16, pop: 0.05, out: 0.1, rot: R(0, TAU) });
      for (let i = 0; i < 9; i++) {
        const a = R(0, TAU), h = R(0.9, 2.2) * s, sz = R(0.09, 0.15) * s;
        emit(f, art.shard(c, i % 3), { y: 0.06 * s, vx: Math.cos(a) * h + (d ? d.x * 1.4 * s : 0), vz: Math.sin(a) * h + (d ? d.z * 1.4 * s : 0), vy: R(2, 3.6) * s,
          g: -11, bounce: 0.35, floor: sz * 0.3, size: sz, vr: R(-16, 16), rot: R(0, TAU), flutter: R(7, 14), life: R(0.9, 1.25), out: 0.25 });
      }
      puffRing(f, 4, '#efe6d6', 1.1, 0.13, 0.45);
    },
    dust(f, o) {
      puffRing(f, 6, o.color ?? '#efe4d0', 1.3, 0.13, 0.55);
    },
    poof(f, o) {
      const s = f.s, c = o.color ?? '#ffffff';
      puffRing(f, 8, c, 1.9, 0.17, 0.5, 0.14);
      for (let i = 0; i < 3; i++) puff(f, c, { x: R(-0.06, 0.06) * s, y: R(0.12, 0.22) * s, vy: 0.7 * s, drag: 3, size: 0.22 * s, grow: 1.8, life: 0.45, pop: 0.07, out: 0.3 });
      for (let i = 0; i < 4; i++) emit(f, art.sparkle('#fff3a6'), { screen: true, z: 0.1, x: R(-0.32, 0.32) * s, y: R(0.15, 0.5) * s, size: R(0.08, 0.12) * s, pop: 0.1, delay: 0.08 + i * 0.05, life: 0.4, out: 0.2, vr: 3 });
    },
    fightCloud(f, o) {
      const s = f.s, dur = o.duration ?? 4, R0 = 0.33 * s, cy = 0.36 * s;
      const cloud = '#f3e6cf', paws = [o.color ?? '#f6be84', '#a9a3b6'];
      f.dur = dur;
      const ring = (i: number, n: number, rr: number, sz: number, spin: number) => {
        const a0 = (i / n) * TAU + R(-0.2, 0.2), ph = Math.random() * TAU;
        puff(f, cloud, { screen: true, life: dur + 0.3, pop: 0.22, out: 0.3, size: sz, phase: ph, fn: (p, a) => {
          const an = a0 + a * spin, end = Math.max(0, a - dur) * 3, w = (1 + 0.1 * Math.sin(a * 13 + ph)) * rr * (1 + end);
          p.x = f.ox + Math.cos(an) * w; p.y = cy + f.oy + Math.sin(an) * w * 0.82; p.z = Math.sin(an) * 0.05 * s;
          p.sx = p.sy = 1 + 0.12 * Math.sin(a * 17 + ph);
        } });
      };
      for (let i = 0; i < 13; i++) ring(i, 13, R0 * R(0.9, 1.05), R(0.3, 0.38) * s, 4.4);
      for (let i = 0; i < 5; i++) ring(i, 5, R0 * 0.4, R(0.36, 0.44) * s, -3);
      const pokeOut = (f: Inst) => {
        const th = R(0, TAU), r = Math.random(), life = R(0.24, 0.34);
        const at = (p: P, a: number, k0: number, k1: number) => {
          const e = Math.sin((a / life) * Math.PI), rr = R0 * (k0 + k1 * e);
          p.x = f.ox + Math.cos(th) * rr; p.y = cy + f.oy + Math.sin(th) * rr * 0.82; p.z = 0.06 * s;
        };
        if (r < 0.5) emit(f, art.paw(paws[f.n++ % 2]), { screen: true, layer: L_POKE, size: 0.27 * s, life, pop: 0.06, out: 0.08, rot: th - Math.PI / 2, fn: (p, a) => at(p, a, 0.9, 1.05) });
        else if (r < 0.68) emit(f, art.star('#ffd84a'), { screen: true, layer: L_POKE, size: 0.16 * s, life, pop: 0.06, out: 0.08, vr: 9, fn: (p, a) => at(p, a, 0.9, 1.1) });
        else if (r < 0.9) emit(f, art.tuft(paws[f.n % 2]), { screen: true, x: f.ox + Math.cos(th) * R0, y: cy + f.oy + Math.sin(th) * R0 * 0.82, z: 0.06 * s,
          vx: Math.cos(th) * 1.6 * s, vy: Math.sin(th) * 1.4 * s + 0.6 * s, g: -3.5, drag: 1.5, size: R(0.08, 0.12) * s, rot: th - Math.PI / 2, vr: R(-6, 6), life: 0.8, out: 0.3 });
        else emit(f, art.burst('#fff6cf'), { screen: true, x: f.ox + Math.cos(th) * R0 * 1.1, y: cy + f.oy + Math.sin(th) * R0, z: 0.08 * s, size: 0.2 * s, life: 0.12, pop: 0.04, out: 0.06, rot: R(0, TAU) });
      };
      f.tick = (f, dt) => {
        f.ox = (Math.sin(f.t * 7.3) * 0.07 + Math.sin(f.t * 13.1) * 0.03) * s;
        f.oy = Math.abs(Math.sin(f.t * 9)) * 0.07 * s;
        if (f.t > dur) {
          if (f.n >= 0) { f.n = -1; FX.poof(f, { color: cloud }); }
          return;
        }
        f.acc -= dt;
        while (f.acc <= 0) { f.acc += R(0.06, 0.12); pokeOut(f); }
        f.acc2 -= dt;
        while (f.acc2 <= 0) { // dust kicked up at the base
          f.acc2 += 0.14;
          const side = Math.random() < 0.5 ? -1 : 1;
          puff(f, cloud, { screen: true, x: f.ox + side * R0 * 0.8, y: 0.04 * s, z: R(-0.1, 0.1) * s, vx: side * R(0.6, 1.1) * s, vy: R(0.1, 0.3) * s, drag: 3,
            size: R(0.12, 0.17) * s, grow: 1.5, life: 0.45, pop: 0.06, out: 0.3 });
        }
      };
    },
    stink(f, o) {
      const s = f.s, c = o.color ?? '#9fd46a', dur = o.duration ?? 3;
      every(f, dur, 0.55, (f) => {
        for (let j = -1; j <= 1; j++) emit(f, art.wave(c), { screen: true, x: (j * 0.12 + R(-0.02, 0.02)) * s, y: R(0.12, 0.2) * s, vy: 0.3 * s,
          size: 0.28 * s, life: 1.6, fadeIn: 0.35, out: 0.6, shrink: false, sway: 0.025 * s, swayF: 4, grow: 1.2, delay: (j + 1) * 0.1, rot: j * 0.15 });
      });
      if (dur >= 1.5) emit(f, art.fly(), { screen: true, size: 0.07 * s, life: dur, pop: 0.2, out: 0.2, fn: (p, a) => {
        p.x = (Math.cos(a * 4.6) * 0.24 + Math.sin(a * 11) * 0.03) * s; p.z = Math.sin(a * 4.6) * 0.24 * s;
        p.y = (0.42 + Math.sin(a * 7) * 0.06) * s; p.sx = 0.85 + 0.15 * Math.sin(a * 70);
      } });
    },
    sparkle(f, o) {
      const s = f.s, c = o.color ?? '#fff1a0';
      for (let i = 0; i < 5; i++) emit(f, art.sparkle(c), { screen: true, x: R(-0.25, 0.25) * s, y: R(-0.1, 0.28) * s, z: R(-0.1, 0.1) * s,
        size: R(0.1, 0.17) * s, pop: 0.14, delay: i * 0.06, life: 0.5, out: 0.25, vr: R(-2, 2) });
    },
    splash(f, o) {
      const s = f.s, c = o.color ?? '#9ddcff', d = o.dir;
      emit(f, art.ripple(c), { y: 0.01, size: 0.14 * s, grow: 6, life: 0.6, out: 0.45, shrink: false }, true);
      emit(f, art.ripple(c), { y: 0.01, size: 0.12 * s, grow: 4, life: 0.5, out: 0.35, shrink: false, delay: 0.12 }, true);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        puff(f, '#e6f6ff', { x: Math.cos(a) * 0.07 * s, z: Math.sin(a) * 0.07 * s, y: 0.05 * s, vx: Math.cos(a) * 0.9 * s, vz: Math.sin(a) * 0.9 * s, vy: R(0.6, 1.2) * s,
          drag: 5, size: R(0.1, 0.14) * s, grow: 1.6, life: R(0.3, 0.4), pop: 0.06, out: 0.2 }, '#4f9fd6');
      }
      for (let i = 0; i < 10; i++) {
        const a = R(0, TAU), h = R(0.4, 1.2) * s;
        emit(f, art.drop(c), { y: 0.06 * s, vx: Math.cos(a) * h + (d ? d.x * s : 0), vz: Math.sin(a) * h + (d ? d.z * s : 0), vy: R(2, 3.3) * s, g: -9.8,
          floor: 0, bounce: -1, size: R(0.05, 0.08) * s, align: true, life: 1, out: 0.1 });
      }
    },
    spray(f, o) {
      const s = f.s, d = (o.dir ? o.dir.clone() : new THREE.Vector3(0, 0, 1)).normalize();
      const fill = o.color ?? '#eaf8ff', line = '#5aa6d8', v = new THREE.Vector3();
      puff(f, fill, { size: 0.12 * s, grow: 1.6, life: 0.18, pop: 0.05, out: 0.1 }, line, true); // nozzle pff
      every(f, 0.22, 0.006, (f) => {
        cone(d, 0.2, v);
        const sp = R(6.5, 9.5) * s;
        if (f.n++ % 3 === 2) emit(f, art.drop('#8fd3ff'), { vx: v.x * sp * 0.8, vy: v.y * sp * 0.8, vz: v.z * sp * 0.8, drag: 1.6, g: -5, size: R(0.04, 0.06) * s, align: true, life: 0.7, out: 0.2 });
        else puff(f, fill, { vx: v.x * sp, vy: v.y * sp, vz: v.z * sp, drag: 2.8, size: R(0.04, 0.06) * s, grow: R(6, 9), life: R(0.5, 0.8), out: 0.4 }, line, true);
      });
    },
    hearts(f, o) {
      const s = f.s, c = o.color ?? '#ff6f91';
      const burst = (f: Inst) => {
        for (let i = 0; i < 4; i++) emit(f, art.heart(c), { screen: true, x: R(-0.14, 0.14) * s, y: R(0, 0.08) * s, vy: R(0.35, 0.5) * s, size: R(0.12, 0.17) * s,
          life: 1.2, pop: 0.18, out: 0.4, sway: 0.04 * s, swayF: R(3, 5), delay: i * 0.12, rot: R(-0.3, 0.3) });
      };
      if (o.duration) every(f, o.duration, 0.6, burst); else burst(f);
    },
    zzz(f, o) {
      const s = f.s, c = o.color ?? '#e6efff';
      every(f, o.duration ?? 2.4, 0.6, (f) => emit(f, art.z(c), { screen: true, x: 0.05 * s, y: 0.04 * s, vx: 0.12 * s, vy: 0.24 * s, size: 0.1 * s, grow: 2.3,
        life: 1.7, fadeIn: 0.2, out: 0.5, sway: 0.03 * s, swayF: 2.5, rot: -0.25 }));
    },
    question(f, o) { icon(f, o, art.question(o.color ?? '#8fd8ff'), 0.15); },
    exclaim(f, o) { icon(f, o, art.exclaim(o.color ?? '#ffd23f'), 0); },
    confetti(f, o) {
      const s = f.s, d = o.dir;
      emit(f, art.burst('#fff4c2'), { screen: true, y: 0.12 * s, size: 0.4 * s, life: 0.14, pop: 0.05, out: 0.08 });
      for (let i = 0; i < 34; i++) {
        const a = R(0, TAU), h = R(0.3, 1.5) * s;
        emit(f, art.confetti(o.color && i % 2 ? o.color : CONFETTI[i % CONFETTI.length]), { y: 0.1 * s, vx: Math.cos(a) * h + (d ? d.x * 2 * s : 0), vz: Math.sin(a) * h + (d ? d.z * 2 * s : 0),
          vy: R(3, 5.5) * s, g: -9, drag: 2.4, size: R(0.08, 0.11) * s, rot: R(0, TAU), vr: R(-10, 10), flutter: R(6, 12), sway: 0.05 * s, life: R(2, 2.8), out: 0.5, floor: 0.01 });
      }
    },
    furPoof(f, o) {
      const s = f.s, c = o.color ?? '#f3b97f';
      for (let i = 0; i < 9; i++) {
        const a = R(0, TAU), h = R(0.6, 1.3) * s;
        emit(f, art.tuft(c), { y: 0.12 * s, vx: Math.cos(a) * h, vz: Math.sin(a) * h, vy: R(0.8, 1.9) * s, g: -2.2, drag: 2.2, size: R(0.1, 0.15) * s,
          rot: R(0, TAU), vr: R(-4, 4), sway: 0.04 * s, life: R(1.1, 1.6), out: 0.5, floor: 0.04 * s, pop: 0.08 });
      }
      puffRing(f, 3, '#ffffff', 0.6, 0.12, 0.35, 0.12);
    },
    catnipHaze(f, o) {
      const s = f.s, col = new THREE.Color();
      every(f, o.duration ?? 3, 0.05, (f) => {
        const k = f.n++;
        col.setHSL((f.t * 0.35 + R(0, 0.3)) % 1, 0.9, 0.72, THREE.SRGBColorSpace);
        const a = R(0, TAU), r = Math.sqrt(Math.random()) * 0.4 * s;
        const base: Opt = { x: Math.cos(a) * r, z: Math.sin(a) * r, y: R(0.05, 0.55) * s, vy: 0.12 * s, tint: col, sway: 0.02 * s, life: R(0.7, 1.1), out: 0.4 };
        if (k % 9 === 4) emit(f, art.leaf('#7cc456'), { ...base, tint: 0xffffff, size: 0.08 * s, rot: R(0, TAU), vr: R(-3, 3), pop: 0.15 });
        else if (k % 3 === 0) emit(f, art.droplet('#ffffff'), { ...base, size: R(0.04, 0.06) * s, pop: 0.15 });
        else emit(f, art.sparkle('#ffffff'), { ...base, size: R(0.07, 0.12) * s, pop: 0.2, vr: R(-2, 2) });
      });
    },
    stars(f, o) {
      const s = f.s, dur = o.duration ?? 1.6, n = 3, c = o.color ?? '#ffd84a';
      f.dur = dur;
      for (let i = 0; i < n; i++) emit(f, art.star(c), { size: 0.12 * s, life: dur, pop: 0.2, out: 0.25, vr: 4, fn: (p, a) => {
        const an = a * 5 + (i * TAU) / n;
        p.x = Math.cos(an) * 0.2 * s; p.z = Math.sin(an) * 0.2 * s; p.y = (0.06 + Math.sin(an * 2) * 0.02) * s;
      } });
    },
    tpBurst(f, o) {
      const s = f.s, d = o.dir;
      for (let i = 0; i < 18; i++) {
        const a = R(0, TAU), h = R(0.8, 2) * s, strip = i < 12;
        emit(f, strip ? art.streamer() : art.sheet(), { y: 0.1 * s, vx: Math.cos(a) * h + (d ? d.x * 1.5 * s : 0), vz: Math.sin(a) * h + (d ? d.z * 1.5 * s : 0), vy: R(2.5, 4.2) * s,
          g: -6, drag: 1.6, size: (strip ? R(0.2, 0.3) : R(0.11, 0.15)) * s, rot: R(0, TAU), vr: R(-6, 6), flutter: R(3, 7), sway: 0.06 * s, life: R(2, 2.8), out: 0.5, floor: 0.02 });
      }
    },
    scratchMarks(f, o) {
      const s = f.s, c = o.color ?? '#fff7ea';
      for (let i = 0; i < 3; i++) emit(f, art.slash(c), { screen: true, x: (i - 1) * 0.08 * s, y: (i === 1 ? 0.03 : 0) * s, z: 0.02, size: 0.3 * s, rot: -0.2, pop: 0.09, delay: i * 0.05, life: 0.9, out: 0.35 });
      for (let i = 0; i < 3; i++) emit(f, art.tuft('#efdcc6'), { screen: true, x: R(-0.12, 0.12) * s, y: R(-0.05, 0.05) * s, z: 0.03, vx: R(-0.4, 0.4) * s, vy: 0.5 * s, g: -2, drag: 2,
        size: 0.07 * s, rot: R(0, TAU), vr: R(-5, 5), delay: 0.1, life: 0.9, out: 0.3 });
    },
    noteMusic(f, o) {
      const s = f.s;
      const burst = (f: Inst) => {
        for (let i = 0; i < 3; i++) emit(f, art.note(o.color ?? pick(['#7fc8ff', '#ff8fb1', '#ffd84a', '#9be38a'])), { screen: true, x: R(-0.12, 0.12) * s, vy: 0.3 * s,
          sway: 0.05 * s, swayF: 3, size: R(0.13, 0.18) * s, rot: R(-0.2, 0.2), life: 1.4, pop: 0.15, out: 0.4, delay: i * 0.3 });
      };
      if (o.duration) every(f, o.duration, 0.9, burst); else burst(f);
    },
    anger(f, o) {
      const s = f.s, dur = o.duration ?? 1.3;
      f.dur = dur;
      emit(f, art.anger(o.color ?? '#ff4d4d'), { screen: true, x: 0.12 * s, y: 0.14 * s, z: 0.05, size: 0.22 * s, pop: 0.14, life: dur, out: 0.15, keep: 0.06, rot: -0.15, fn: (p, a) => {
        const b = Math.max(0, Math.sin(a * 11));
        p.sx = p.sy = 1 + 0.22 * b * b;
      } });
    },
    sweat(f, o) {
      const s = f.s, c = o.color ?? '#8fd8ff', dur = o.duration ?? 1.1;
      emit(f, art.drop(c), { screen: true, x: 0.15 * s, y: 0.1 * s, z: 0.05, vy: -0.06 * s, size: 0.15 * s, pop: 0.15, life: dur, out: 0.25, rot: 0.3, keep: 0.05 });
      for (let i = 0; i < 3; i++) {
        const side = i % 2 ? -1 : 1;
        emit(f, art.drop(c), { screen: true, x: side * 0.12 * s, y: 0.15 * s, vx: side * R(0.4, 0.7) * s, vy: R(0.6, 0.9) * s, g: -4, size: 0.06 * s, align: true, delay: R(0.1, 0.5), life: 0.6, out: 0.2 });
      }
    },
    ding(f, o) {
      const s = f.s, c = o.color ?? '#ffd84a';
      emit(f, art.ring(c), { screen: true, z: 0.02, size: 0.12 * s, grow: 5, life: 0.45, out: 0.35, shrink: false });
      emit(f, art.sparkle('#fffbe0'), { screen: true, z: 0.03, size: 0.28 * s, pop: 0.1, life: 0.35, out: 0.2, vr: 3 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        emit(f, art.sparkle(c), { screen: true, z: 0.03, x: Math.cos(a) * 0.05 * s, y: Math.sin(a) * 0.05 * s, vx: Math.cos(a) * 1.5 * s, vy: Math.sin(a) * 1.5 * s, drag: 4,
          size: 0.09 * s, life: 0.5, out: 0.25, vr: 4 });
      }
    },
  };

  /** bouncy icon above a head: squash-and-stretch pop, bob, quick pop out */
  function icon(f: Inst, o: FxOptions, tex: THREE.Texture, wobble: number) {
    const s = f.s, dur = o.duration ?? 1.2;
    f.dur = dur;
    emit(f, tex, { screen: true, z: 0.05, size: 0.34 * s, life: dur, pop: 0.12, out: 0.15, keep: 0.06, fn: (p, a) => {
      const t = Math.min(1, a / 0.45), j = Math.sin(t * Math.PI * 3) * (1 - t);
      p.sy = 1 + j * 0.45; p.sx = 1 - j * 0.3;
      p.y = (0.2 + Math.sin(a * 6) * 0.015) * s + j * 0.05 * s;
      p.rot = wobble * Math.sin(a * 5);
    } });
  }

  // ---------------------------------------------------------------- api
  return {
    spawn(kind, pos, opts = {}) {
      const f = newInst(pos, opts);
      FX[kind](f, opts);
    },
    text(text, pos, opts = {}) {
      const f = newInst(pos, { follow: opts.follow });
      const { tex, aspect } = textTex(text, opts.color ?? '#ffffff');
      emit(f, tex, { screen: true, z: 0.08, vy: 0.75, drag: 2.2, size: opts.size ?? 0.24, aspect, life: opts.duration ?? 1.6, pop: 0.22, out: 0.35, keep: 0.07, rot: R(-0.06, 0.06) });
    },
    update(dt, camera) {
      dt = Math.min(dt, 0.1);
      const m = camera.matrixWorld;
      view.copy(m).invert();
      camPos.setFromMatrixPosition(m);
      right.setFromMatrixColumn(m, 0).setY(0);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();
      back.set(-right.z, 0, right.x); // horizontal, toward the camera
      for (let i = insts.length - 1; i >= 0; i--) {
        const f = insts[i];
        if (f.follow) f.follow.getWorldPosition(f.at).add(f.off);
        f.t += dt;
        f.tick?.(f, dt);
        if (f.t >= f.dur && f.live <= 0) insts.splice(i, 1);
      }
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i];
        p.age += dt;
        const a = p.age - p.delay;
        if (a < 0) continue;
        if (a >= p.life) {
          p.obj.visible = false;
          p.fx.live--;
          live[i] = live[live.length - 1];
          live.pop();
          (p.flat ? freeF : freeS).push(p);
          continue;
        }
        if (p.fn) p.fn(p, a, dt);
        else {
          p.vy += p.g * dt;
          if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.y < p.floor) {
            p.y = p.floor;
            if (p.bounce < 0) p.life = Math.min(p.life, a + 0.06);
            else if (p.vy < -0.8 && p.bounce > 0) { p.vy *= -p.bounce; p.vx *= 0.6; p.vz *= 0.6; p.vr *= 0.5; }
            else { p.vx = p.vy = p.vz = 0; p.vr *= 0.85; p.flutter = 0; }
          }
        }
        p.rot += p.vr * dt;
        let k = p.size * (1 + (p.grow - 1) * (a / p.life)), o = p.op;
        if (p.pop > 0 && a < p.pop) k *= Math.max(0, backOut(a / p.pop));
        if (p.fadeIn > 0 && a < p.fadeIn) o *= a / p.fadeIn;
        const rem = p.life - a;
        if (rem < p.out) { // puffs (fade=false) shrink to nothing so their outline layer never shows through
          const e = rem / p.out;
          if (p.fade) { o *= e; if (p.shrink) k *= 0.3 + 0.7 * e; } else k *= e * (2 - e);
        }
        let sx = k * p.aspect * p.sx, sy = k * p.sy;
        if (p.flutter) sx *= Math.abs(Math.cos(a * p.flutter + p.phase)) * 0.85 + 0.15;
        const sw = p.sway ? Math.sin(a * p.swayF + p.phase) * p.sway : 0;
        const at = p.fx.at, obj = p.obj;
        if (p.screen) {
          const h = p.x + sw;
          obj.position.set(at.x + right.x * h + back.x * p.z, at.y + p.y, at.z + right.z * h + back.z * p.z);
        } else obj.position.set(at.x + p.x + right.x * sw, at.y + p.y, at.z + p.z + right.z * sw);
        if (p.keep) { const d = obj.position.distanceTo(camPos); const mm = 1 + Math.max(0, d - 4) * p.keep; sx *= mm; sy *= mm; }
        if (p.align && (p.vx || p.vy || p.vz)) {
          if (p.screen) tmpV.set(right.x * p.vx + back.x * p.vz, p.vy, right.z * p.vx + back.z * p.vz);
          else tmpV.set(p.vx, p.vy, p.vz);
          tmpV.transformDirection(view);
          p.rot = Math.atan2(-tmpV.y, -tmpV.x) - Math.PI / 2;
        }
        if (p.flat) { obj.scale.set(sx, 1, sy); obj.rotation.y = p.rot; }
        else { obj.scale.set(sx, sy, 1); (p.mat as THREE.SpriteMaterial).rotation = p.rot; }
        p.mat.opacity = o;
        obj.visible = true;
      }
    },
    dispose() {
      scene.remove(group);
      for (const p of [...live, ...freeS, ...freeF]) p.mat.dispose();
      flatGeo.dispose();
      live.length = freeS.length = freeF.length = insts.length = 0;
      textCache.forEach((v) => v.tex.dispose());
      textCache.clear();
      disposePaint();
    },
  };
}
