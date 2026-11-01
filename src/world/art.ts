/** Painted canvases for the wall frames (canvas textures on the downloaded frame's picture surface). */
import * as THREE from 'three';

const W = 192, H = 244;
const cache = new Map<number, THREE.CanvasTexture>();

type Paint = (g: CanvasRenderingContext2D) => void;

const ARTS: Paint[] = [
  // 0: sunset hills
  (g) => {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#f6c8a4'); sky.addColorStop(0.6, '#f3a98f');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffe7b0'; g.beginPath(); g.arc(W * 0.62, H * 0.5, 30, 0, Math.PI * 2); g.fill();
    const hill = (y: number, c: string, a: number) => {
      g.fillStyle = c; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) g.lineTo(x, y + Math.sin(x / W * Math.PI * 2 + a) * 14);
      g.lineTo(W, H); g.fill();
    };
    hill(H * 0.62, '#9db88a', 0.5); hill(H * 0.72, '#7fa070', 2.2); hill(H * 0.84, '#62855c', 4);
  },
  // 1: the owners' cat, sitting, very proud of itself
  (g) => {
    g.fillStyle = '#a9d3cc'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#f2a65a';
    g.beginPath(); g.ellipse(W / 2, H * 0.68, 50, 58, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(W / 2, H * 0.36, 38, 0, Math.PI * 2); g.fill();
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(W / 2 + s * 34, H * 0.3); g.lineTo(W / 2 + s * 30, H * 0.14); g.lineTo(W / 2 + s * 12, H * 0.25); g.fill(); }
    g.strokeStyle = '#f2a65a'; g.lineWidth = 12; g.lineCap = 'round';
    g.beginPath(); g.moveTo(W / 2 + 44, H * 0.85); g.quadraticCurveTo(W / 2 + 80, H * 0.8, W / 2 + 66, H * 0.6); g.stroke();
    g.fillStyle = '#3a2a22';
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(W / 2 + s * 14, H * 0.35, 4, 6, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#e88a8a'; g.beginPath(); g.arc(W / 2, H * 0.41, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fbe9d0'; g.beginPath(); g.ellipse(W / 2, H * 0.7, 24, 34, 0, 0, Math.PI * 2); g.fill();
  },
  // 2: mid-century shapes
  (g) => {
    g.fillStyle = '#f4ead8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d9774f'; g.beginPath(); g.arc(W * 0.35, H * 0.35, 46, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8b54a'; g.beginPath(); g.arc(W * 0.65, H * 0.62, 56, Math.PI, 0); g.fill();
    g.fillStyle = '#4f8f8b'; g.fillRect(W * 0.18, H * 0.66, W * 0.3, 10); g.fillRect(W * 0.22, H * 0.74, W * 0.5, 10);
    g.strokeStyle = '#3a2a22'; g.lineWidth = 3; g.beginPath(); g.arc(W * 0.62, H * 0.28, 22, 0.3, 2.6); g.stroke();
  },
  // 3: a big blue fish (someone in this house stares at it a lot)
  (g) => {
    g.fillStyle = '#f7efe1'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#5b8fc7';
    g.beginPath(); g.ellipse(W * 0.46, H / 2, 60, 30, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(W * 0.74, H / 2); g.lineTo(W * 0.92, H * 0.4); g.lineTo(W * 0.92, H * 0.6); g.fill();
    g.fillStyle = '#f7efe1'; g.beginPath(); g.arc(W * 0.3, H * 0.47, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a2a22'; g.beginPath(); g.arc(W * 0.3, H * 0.47, 3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#82aedb'; g.lineWidth = 3;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(W * (0.45 + i * 0.08), H / 2, 18, -1, 1); g.stroke(); }
  },
  // 4: monstera leaf
  (g) => {
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#5f9a63';
    g.beginPath(); g.ellipse(W / 2, H * 0.46, 62, 74, 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#efe6d2';
    for (let i = 0; i < 4; i++) {
      const a = -1.1 + i * 0.75;
      g.beginPath(); g.ellipse(W / 2 + Math.cos(a) * 46, H * 0.46 + Math.sin(a) * 52, 14, 6, a, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = '#3f7547'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(W / 2 - 10, H * 0.92); g.quadraticCurveTo(W / 2, H * 0.6, W / 2 + 8, H * 0.2); g.stroke();
  },
  // 5: black cat asleep in a sun patch
  (g) => {
    g.fillStyle = '#f6d9a8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fbe7c4'; g.fillRect(W * 0.12, H * 0.5, W * 0.76, H * 0.32);
    g.fillStyle = '#2f2a33';
    g.beginPath(); g.ellipse(W / 2, H * 0.66, 52, 26, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(W / 2 - 40, H * 0.6, 20, 0, Math.PI * 2); g.fill();
    for (const dx of [-54, -30]) { g.beginPath(); g.moveTo(W / 2 + dx, H * 0.55); g.lineTo(W / 2 + dx + 5, H * 0.47); g.lineTo(W / 2 + dx + 12, H * 0.55); g.fill(); }
    g.strokeStyle = '#2f2a33'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(W / 2 + 48, H * 0.7); g.quadraticCurveTo(W / 2 + 30, H * 0.82, W / 2 - 20, H * 0.78); g.stroke();
    g.strokeStyle = '#f6d9a8'; g.lineWidth = 2;
    g.beginPath(); g.arc(W / 2 - 46, H * 0.6, 5, 0.2, 2.9); g.stroke();
  },
];

export const ART_COUNT = ARTS.length;

export function artTexture(i: number): THREE.CanvasTexture {
  const k = ((i % ARTS.length) + ARTS.length) % ARTS.length;
  let t = cache.get(k);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    ARTS[k](c.getContext('2d')!);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    cache.set(k, t);
  }
  return t;
}
