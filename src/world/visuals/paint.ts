/** Canvas art for world decals (surface detail only): scratches, tears, fur, soil, smudges, the fridge note... */
import * as THREE from 'three';
import { canvasTex, rng } from './kit';

const TAU = Math.PI * 2;
const cache = new Map<string, THREE.CanvasTexture>();
const cached = (key: string, make: () => THREE.CanvasTexture) => {
  let t = cache.get(key);
  if (!t) { t = make(); cache.set(key, t); }
  return t;
};

/** a tapered curved stroke from a to b, bulging by `bend` */
function slash(g: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, bend: number, w: number) {
  const mx = (ax + bx) / 2 + (by - ay) * bend, my = (ay + by) / 2 - (bx - ax) * bend;
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const q = (t: number) => [(1 - t) * (1 - t) * ax + 2 * (1 - t) * t * mx + t * t * bx, (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * my + t * t * by];
    const [x0, y0] = q(t0), [x1, y1] = q(t1);
    g.lineWidth = Math.max(0.5, w * Math.sin(Math.PI * (t0 + t1) / 2) ** 0.7);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
}

/** three or four parallel claw slashes, with a light frayed edge. 256 px square, transparent. */
export function scratchTex(seed: number, dark: string, light: string): THREE.CanvasTexture {
  return cached(`scratch|${seed}|${dark}|${light}`, () => canvasTex(256, 256, (g) => {
    const r = rng(seed);
    const n = 3 + (r() < 0.5 ? 1 : 0);
    const ang = -1.2 + r() * 0.5, len = 150 + r() * 60, gap = 26 + r() * 8;
    const cx = 128, cy = 128, dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * gap + (r() - 0.5) * 6;
      const l = len * (0.75 + r() * 0.3), s = (r() - 0.5) * 20;
      const ax = cx + px * o - dx * l / 2 + dx * s, ay = cy + py * o - dy * l / 2 + dy * s;
      const bx = ax + dx * l, by = ay + dy * l, bend = 0.06 + r() * 0.05;
      g.strokeStyle = light; slash(g, ax + px * 4, ay + py * 4, bx + px * 4, by + py * 4, bend, 11);
      g.strokeStyle = dark; slash(g, ax, ay, bx, by, bend, 8);
      // frayed threads
      g.lineWidth = 1.6; g.strokeStyle = light;
      for (let k = 0; k < 4; k++) {
        const t = 0.2 + r() * 0.6, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, a = ang + Math.PI / 2 + (r() - 0.5) * 1.2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * (6 + r() * 8), y + Math.sin(a) * (6 + r() * 8)); g.stroke();
      }
    }
  }));
}

function cloud(g: CanvasRenderingContext2D, x: number, y: number, rad: number, puffs: number, r: () => number, fill: string, edge: string) {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < puffs; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * rad * 0.7;
    pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d, rad * (0.35 + r() * 0.3)]);
  }
  g.fillStyle = edge;
  for (const [px, py, pr] of pts) { g.beginPath(); g.arc(px, py, pr + 3, 0, TAU); g.fill(); }
  g.fillStyle = fill;
  for (const [px, py, pr] of pts) { g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill(); }
}

/** torn fabric: jagged hole with cream stuffing bulging out and frayed flaps in the fabric color */
export function tearTex(seed: number, fabric: string, shade: string): THREE.CanvasTexture {
  return cached(`tear|${seed}|${fabric}`, () => canvasTex(256, 256, (g) => {
    const r = rng(seed);
    const cx = 128, cy = 128, n = 16;
    const hole = new Path2D();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, d = (i % 2 ? 62 : 86) * (0.75 + r() * 0.35);
      const x = cx + Math.cos(a) * d * 1.15, y = cy + Math.sin(a) * d * 0.8;
      if (i === 0) hole.moveTo(x, y); else hole.lineTo(x, y);
    }
    hole.closePath();
    g.lineWidth = 14; g.strokeStyle = shade; g.stroke(hole);
    g.fillStyle = '#e9dcc4'; g.fill(hole);
    g.save(); g.clip(hole);
    cloud(g, cx, cy + 4, 78, 14, r, '#fffaf0', '#d8c6a8');
    g.restore();
    // stuffing spilling over the edge
    cloud(g, cx + 30, cy - 20, 34, 5, r, '#fffaf0', '#d8c6a8');
    cloud(g, cx - 40, cy + 26, 26, 4, r, '#fffaf0', '#d8c6a8');
    // frayed fabric flaps
    g.fillStyle = fabric; g.strokeStyle = shade; g.lineWidth = 3;
    for (let k = 0; k < 5; k++) {
      const a = r() * TAU, d = 70 + r() * 10, x = cx + Math.cos(a) * d * 1.1, y = cy + Math.sin(a) * d * 0.78;
      const t = new Path2D();
      t.moveTo(x - 10, y); t.lineTo(x + 10, y); t.lineTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 30); t.closePath();
      g.fill(t); g.stroke(t);
    }
    g.lineWidth = 2; g.strokeStyle = '#fff6dc';
    for (let k = 0; k < 14; k++) {
      const a = r() * TAU, d = 82 + r() * 14, x = cx + Math.cos(a) * d * 1.1, y = cy + Math.sin(a) * d * 0.78;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10); g.stroke();
    }
  }));
}

/** loose cat fur tufts */
export function furTex(seed: number, colors: string[]): THREE.CanvasTexture {
  return cached(`fur|${seed}|${colors.join()}`, () => canvasTex(256, 256, (g) => {
    const r = rng(seed);
    for (let c = 0; c < 7; c++) {
      const x = 40 + r() * 176, y = 40 + r() * 176, col = colors[c % colors.length];
      for (let i = 0; i < 26; i++) {
        const a = r() * TAU, l = 10 + r() * 22;
        g.strokeStyle = col; g.lineWidth = 2 + r() * 1.5; g.globalAlpha = 0.85;
        g.beginPath(); g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(a + 0.4) * l * 0.6, y + Math.sin(a + 0.4) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }));
}

/** dug soil crater with crumbs */
export function soilTex(seed: number): THREE.CanvasTexture {
  return cached(`soil|${seed}`, () => canvasTex(256, 256, (g) => {
    const r = rng(seed);
    const blob = (x: number, y: number, rad: number, col: string) => {
      g.fillStyle = col; g.beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * TAU, d = rad * (0.8 + r() * 0.35);
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.fill();
    };
    blob(128, 128, 92, '#5a3a22');
    blob(128, 132, 66, '#3e2615');
    blob(122, 138, 34, '#2c1a0e');
    for (let i = 0; i < 46; i++) {
      const a = r() * TAU, d = 70 + r() * 50, s = 3 + r() * 7;
      g.fillStyle = r() < 0.5 ? '#6b4528' : '#4a2e19';
      g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, s, 0, TAU); g.fill();
    }
  }));
}

/** a nose print on glass: greasy grey smear + nostril dabs + a light sheen */
export function smudgeTex(seed: number): THREE.CanvasTexture {
  return cached(`smudge|${seed}`, () => canvasTex(128, 128, (g) => {
    const r = rng(seed);
    g.save(); g.translate(64, 64); g.rotate((r() - 0.5) * 0.6); g.scale(1, 0.72);
    const gr = g.createRadialGradient(0, -4, 4, 0, 0, 48);
    gr.addColorStop(0, 'rgba(150,160,170,0.55)');
    gr.addColorStop(0.55, 'rgba(170,180,190,0.38)');
    gr.addColorStop(1, 'rgba(190,198,205,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, 48, 0, TAU); g.fill();
    g.restore();
    g.fillStyle = 'rgba(110,118,128,0.5)';
    for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(64 + sx * 11, 70, 7, 5, sx * 0.4, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const y = 44 + i * 10 + r() * 4;
      g.beginPath(); g.moveTo(34 + r() * 8, y); g.quadraticCurveTo(64, y + 6, 92 - r() * 8, y); g.stroke();
    }
  }));
}

/** toilet paper strip: soft white, quilted dots, perforation every tile. Repeats vertically. */
export function paperTex(): THREE.CanvasTexture {
  return cached('paper', () => {
    const t = canvasTex(64, 128, (g, w, h) => {
      g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(190,190,200,0.35)';
      for (let y = 10; y < h; y += 16) for (let x = 8 + ((y / 16) % 2) * 8; x < w; x += 16) { g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(150,150,160,0.55)';
      for (let x = 2; x < w; x += 8) g.fillRect(x, h - 2, 4, 2);
      g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** water ripples: tileable soft light arcs on transparent */
export function rippleTex(): THREE.CanvasTexture {
  return cached('ripple', () => {
    const t = canvasTex(256, 256, (g) => {
      const r = rng(7);
      for (let i = 0; i < 14; i++) {
        const x = r() * 256, y = r() * 256, rx = 18 + r() * 34, ry = rx * (0.3 + r() * 0.2), a0 = r() * Math.PI, sweep = 0.8 + r() * 1.2;
        g.lineWidth = 1.2 + r() * 1.2;
        g.strokeStyle = `rgba(255,255,255,${0.25 + r() * 0.25})`;
        for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
          g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, 0, a0, a0 + sweep); g.stroke();
        }
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** falling water: vertical streaks, repeats vertically */
export function streamTex(): THREE.CanvasTexture {
  return cached('stream', () => {
    const t = canvasTex(64, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(140,205,240,0)');
      gr.addColorStop(0.25, 'rgba(160,215,245,0.75)');
      gr.addColorStop(0.5, 'rgba(225,245,255,0.95)');
      gr.addColorStop(0.75, 'rgba(160,215,245,0.75)');
      gr.addColorStop(1, 'rgba(140,205,240,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const r = rng(3);
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 9; i++) {
        const x = 18 + r() * 28, y = r() * h, l = 30 + r() * 60;
        g.lineWidth = 2 + r() * 2;
        for (const oy of [-h, 0, h]) { g.beginPath(); g.moveTo(x, y + oy); g.lineTo(x, y + l + oy); g.stroke(); }
      }
    });
    t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** splash ring where the stream hits the water */
export function ringTex(): THREE.CanvasTexture {
  return cached('ring', () => canvasTex(128, 128, (g) => {
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 7;
    g.beginPath(); g.arc(64, 64, 48, 0, TAU); g.stroke();
    g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.beginPath(); g.arc(64, 64, 30, 0, TAU); g.stroke();
  }));
}

/** soft light shape: a 2 x 2 window-pane patch with blurred edges (sun patch, headlight cookie) */
export function paneLightTex(): THREE.CanvasTexture {
  return cached('pane', () => canvasTex(256, 256, (g) => {
    g.filter = 'blur(10px)';
    g.fillStyle = '#ffffff';
    const m = 28, gap = 12, s = (256 - m * 2 - gap) / 2;
    for (const x of [0, 1]) for (const y of [0, 1]) g.fillRect(m + x * (s + gap), m + y * (s + gap), s, s);
    g.filter = 'none';
  }));
}

/** soft radial glow */
export function glowTex(): THREE.CanvasTexture {
  return cached('glow', () => canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }));
}

/** a wobbly cartoon stink line */
export function stinkTex(): THREE.CanvasTexture {
  return cached('stink', () => canvasTex(64, 192, (g) => {
    g.strokeStyle = '#3a2a22'; g.lineWidth = 12;
    const path = () => { g.beginPath(); g.moveTo(32, 186); for (let y = 186; y > 8; y -= 4) g.lineTo(32 + Math.sin(y * 0.07) * 14, y); };
    path(); g.stroke();
    g.strokeStyle = '#a9c95a'; g.lineWidth = 7; path(); g.stroke();
  }));
}

/** "$89.99" price sticker: white, orange border, one peeled corner. 2:1 */
export function stickerTex(): THREE.CanvasTexture {
  return cached('sticker', () => canvasTex(256, 128, (g) => {
    const corner = 34;
    const body = new Path2D();
    body.moveTo(10, 10); body.lineTo(246 - corner, 10); body.lineTo(246, 10 + corner); body.lineTo(246, 118); body.lineTo(10, 118); body.closePath();
    g.fillStyle = '#ffffff'; g.fill(body);
    g.lineWidth = 9; g.strokeStyle = '#f08a24'; g.stroke(body);
    // peeled corner: the folded-over back of the sticker, with a soft shadow under it
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath(); g.moveTo(246 - corner, 10); g.lineTo(246 - corner - 6, 10 + corner + 8); g.lineTo(246, 10 + corner); g.fill();
    g.fillStyle = '#f3efe6'; g.strokeStyle = '#d9cfbf'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(246 - corner, 10); g.lineTo(246 - corner + 2, 10 + corner - 2); g.lineTo(246, 10 + corner); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#2a2320';
    g.font = '800 64px "Avenir Next", "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('$89.99', 124, 70);
  }));
}

// ---------------------------------------------------------------- fridge note (handwriting font, OFL)

const NOTE = ["They ate at 5. They will tell you they didn't.", 'Litter box once a day, they are very particular.', 'Scratching post is new!!'];
let fontReady: Promise<boolean> | null = null;
function loadHand(): Promise<boolean> {
  fontReady ??= (async () => {
    try {
      const f = new FontFace('MeowhemHand', `url(${import.meta.env.BASE_URL}fonts/Caveat.ttf)`);
      document.fonts.add(await f.load());
      return true;
    } catch { return false; }
  })();
  return fontReady;
}

function drawNote(g: CanvasRenderingContext2D, w: number, h: number, hand: boolean) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#fffcf1'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(120,150,200,0.22)';
  for (let y = 90; y < h - 10; y += 46) g.fillRect(14, y, w - 28, 2);
  g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, h - 6, w, 6); g.fillRect(w - 5, 0, 5, h);
  // the magnet holding it
  g.fillStyle = 'rgba(0,0,0,0.15)'; g.beginPath(); g.arc(w / 2 + 3, 26, 20, 0, TAU); g.fill();
  g.fillStyle = '#e8574a'; g.beginPath(); g.arc(w / 2, 22, 20, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(w / 2 - 6, 15, 6, 0, TAU); g.fill();
  g.fillStyle = '#28356b';
  g.font = hand ? '600 40px MeowhemHand, cursive' : '34px "Bradley Hand", "Segoe Print", cursive';
  g.textBaseline = 'alphabetic';
  let y = 84;
  const maxW = w - 40;
  for (const line of NOTE) {
    let row = '';
    for (const word of line.split(' ')) {
      const test = row ? `${row} ${word}` : word;
      if (g.measureText(test).width > maxW && row) { g.fillText(row, 22, y); y += 46; row = word; } else row = test;
    }
    g.fillText(row, 22, y);
    y += 58;
  }
}

/** 3:4 paper with the owners' note. Redraws itself once the handwriting font has loaded. */
export function noteTex(): THREE.CanvasTexture {
  return cached('note', () => {
    const t = canvasTex(384, 512, (g, w, h) => drawNote(g, w, h, false));
    loadHand().then((ok) => {
      if (!ok) return;
      const c = t.image as HTMLCanvasElement;
      drawNote(c.getContext('2d')!, c.width, c.height, true);
      t.needsUpdate = true;
    });
    return t;
  });
}
