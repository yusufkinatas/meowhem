/**
 * Procedural mess decals: illustrated top-down canvas art on a floor quad, toon-lit so they sit in the
 * scene like the floor does. Origin = floor contact. Downloaded models win for poop / fish / tp;
 * these are the fallback for those.
 */
import * as THREE from 'three';
import type { MessKind } from '../shared/contracts';
import { toon, outlineMaterial, addOutline } from '../shared/toon';
import { paintTex, blob, shine, glyph, circ, ellipse, poly, smooth, wobblyBlob, rng, dark, light, OL, TAU } from './paint';

type Draw = (g: CanvasRenderingContext2D, r: () => number) => void;

/** decal width in meters */
const SIZE: Record<MessKind, number> = {
  puddle: 0.85, shards: 0.55, fur: 0.5, soil: 0.62, litter: 0.55, catnip: 0.55, food: 0.55, tp: 0.9, hairball: 0.24, poop: 0.26, fish: 0.32,
};

const scatter = (r: () => number, rad: number): [number, number] => {
  const a = r() * TAU, d = Math.sqrt(r()) * rad;
  return [0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d];
};

function shardShape(x: number, y: number, s: number, r: () => number): Path2D {
  const n = 3 + ((r() * 2) | 0), a0 = r() * TAU, pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + (r() - 0.5) * 0.8, d = s * (0.5 + r() * 0.6);
    pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  return poly(pts);
}

/** a fluffy clump: soft blob plus fur wisps sticking out */
function furClump(g: CanvasRenderingContext2D, x: number, y: number, rad: number, col: string, r: () => number) {
  const body = wobblyBlob(x, y, rad, 9, 0.25, r);
  g.lineWidth = 0.012; g.strokeStyle = dark(col, 0.45);
  for (let i = 0; i < 40; i++) {
    const a = r() * TAU, d0 = rad * 0.5, d1 = rad * (1.2 + r() * 0.6);
    const p = new Path2D();
    p.moveTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0);
    p.quadraticCurveTo(x + Math.cos(a + 0.3) * d1 * 0.9, y + Math.sin(a + 0.3) * d1 * 0.9, x + Math.cos(a + 0.15) * d1, y + Math.sin(a + 0.15) * d1);
    g.lineWidth = 0.02; g.strokeStyle = dark(col, 0.3); g.stroke(p);
    g.lineWidth = 0.009; g.strokeStyle = light(col, 0.15); g.stroke(p);
  }
  blob(g, body, col, 0.008, 0.02);
  g.lineWidth = 0.008; g.strokeStyle = light(col, 0.5);
  for (let i = 0; i < 5; i++) {
    const a = r() * TAU, d = rad * 0.5 * r(), p = new Path2D();
    p.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    p.lineTo(x + Math.cos(a) * d + Math.cos(a + 1) * rad * 0.35, y + Math.sin(a) * d + Math.sin(a + 1) * rad * 0.35);
    g.stroke(p);
  }
}

const DRAW: Record<MessKind, Draw> = {
  puddle(g, r) {
    const main = wobblyBlob(0.5, 0.5, 0.36, 10, 0.16, r);
    const blue = '#8ed0f3';
    g.lineWidth = 0.022; g.strokeStyle = '#4d93c4'; g.stroke(main);
    g.fillStyle = blue; g.fill(main);
    g.save(); g.clip(main);
    g.fillStyle = light(blue, 0.35);
    g.fill(wobblyBlob(0.47, 0.46, 0.27, 9, 0.12, r));
    g.restore();
    for (let i = 0; i < 4; i++) {
      const a = r() * TAU, d = 0.4 + r() * 0.05, s = 0.025 + r() * 0.025;
      const p = circ(0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d, s);
      g.lineWidth = 0.014; g.stroke(p); g.fillStyle = blue; g.fill(p);
    }
    g.lineWidth = 0.022; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineCap = 'round';
    const h = new Path2D(); h.arc(0.5, 0.5, 0.25, Math.PI * 1.05, Math.PI * 1.4); g.stroke(h);
    g.fillStyle = '#ffffff';
    g.fill(circ(0.36, 0.3, 0.014)); g.fill(ellipse(0.66, 0.66, 0.05, 0.016, -0.7));
  },
  shards(g, r) {
    for (let i = 0; i < 22; i++) { const [x, y] = scatter(r, 0.42); blob(g, circ(x, y, 0.008 + r() * 0.008), '#f3efe7', 0.004, 0); }
    for (let i = 0; i < 9; i++) {
      const [x, y] = scatter(r, 0.36), s = 0.04 + r() * 0.05, p = shardShape(x, y, s, r);
      blob(g, p, '#f8f4ec', 0.008, 0.012);
      if (i % 3 === 0) { g.save(); g.clip(p); g.fillStyle = '#5d9bd5'; g.fillRect(x - s, y - s * 0.15, s * 2, s * 0.3); g.restore(); }
      g.fillStyle = 'rgba(255,255,255,0.95)'; g.fill(circ(x - s * 0.2, y - s * 0.2, s * 0.12));
    }
  },
  fur(g, r) {
    const cols = ['#f2b47a', '#f7e6cc', '#b1aaa6'];
    for (let i = 0; i < 3; i++) { const [x, y] = scatter(r, 0.17); furClump(g, x, y, 0.11 + r() * 0.05, cols[i % 3], r); }
  },
  soil(g, r) {
    const base = '#6e4b33';
    const splat = wobblyBlob(0.5, 0.5, 0.3, 11, 0.3, r);
    blob(g, splat, base, 0.01, 0.025);
    for (let i = 0; i < 18; i++) {
      const [x, y] = scatter(r, 0.43), s = 0.012 + r() * 0.03;
      blob(g, wobblyBlob(x, y, s, 6, 0.3, r), r() < 0.5 ? '#8a6446' : '#5a3c28', 0.007, s * 0.3);
    }
    for (let i = 0; i < 6; i++) { const [x, y] = scatter(r, 0.2); blob(g, wobblyBlob(x, y, 0.04 + r() * 0.03, 7, 0.3, r), '#9a7252', 0.008, 0.012); }
    g.save(); g.translate(0.62, 0.38); g.rotate(0.8);
    const leaf = new Path2D(); leaf.moveTo(0, -0.07); leaf.quadraticCurveTo(0.05, 0, 0, 0.07); leaf.quadraticCurveTo(-0.05, 0, 0, -0.07);
    blob(g, leaf, '#79b84f', 0.008, 0.01);
    g.restore();
  },
  litter(g, r) {
    for (let i = 0; i < 80; i++) {
      const [x, y] = scatter(r, i < 50 ? 0.25 : 0.42), s = 0.014 + r() * 0.016;
      const c = r() < 0.07 ? '#7cc4ec' : r() < 0.5 ? '#ddd6ca' : '#c8bfb1';
      blob(g, wobblyBlob(x, y, s, 6, 0.25, r), c, 0.005, s * 0.35);
    }
  },
  catnip(g, r) {
    const greens = ['#7fa04a', '#9bbd5c', '#5f8036', '#b0c56a'];
    for (let i = 0; i < 34; i++) {
      const [x, y] = scatter(r, 0.38), s = 0.018 + r() * 0.026;
      blob(g, shardShape(x, y, s, r), greens[i % 4], 0.005, s * 0.25);
    }
    for (let i = 0; i < 7; i++) {
      const [x, y] = scatter(r, 0.3);
      g.save(); g.translate(x, y); g.rotate(r() * TAU);
      const s = 0.05 + r() * 0.035, leaf = new Path2D();
      leaf.moveTo(0, -s); leaf.quadraticCurveTo(s * 0.8, 0, 0, s); leaf.quadraticCurveTo(-s * 0.8, 0, 0, -s);
      blob(g, leaf, greens[i % 3], 0.007, s * 0.2);
      g.lineWidth = 0.006; g.strokeStyle = dark(greens[i % 3], 0.4); g.beginPath(); g.moveTo(0, -s * 0.8); g.lineTo(0, s * 0.8); g.stroke();
      g.restore();
    }
  },
  food(g, r) {
    const fruity = ['#ff6b6b', '#ffb347', '#ffe066', '#7ed67a', '#b48cff', '#6ec8ff'];
    for (let i = 0; i < 30; i++) { const [x, y] = scatter(r, 0.44); g.fillStyle = '#e9c48e'; g.fill(circ(x, y, 0.005 + r() * 0.007)); }
    for (let i = 0; i < 10; i++) {
      const [x, y] = scatter(r, 0.4), rr = 0.035 + r() * 0.008, c = fruity[i % fruity.length];
      const p = new Path2D(); p.arc(x, y, rr, 0, TAU); p.arc(x, y, rr * 0.42, 0, TAU, true);
      g.lineWidth = 0.012; g.strokeStyle = OL; g.stroke(p);
      blob(g, p, c, 0, 0);
      g.save(); g.clip(p); g.fillStyle = dark(c, 0.2); g.fill(circ(x + rr * 0.35, y + rr * 0.35, rr)); g.fillStyle = c; g.fill(circ(x - rr * 0.1, y - rr * 0.1, rr * 0.85)); g.restore();
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.fill(circ(x - rr * 0.55, y - rr * 0.35, rr * 0.16));
    }
  },
  tp(g, r) {
    const pts: number[] = [];
    let x = 0.12, y = 0.75, a = -0.6;
    for (let i = 0; i < 26; i++) { pts.push(x, y); a += (r() - 0.5) * 1.6 + 0.12; x += Math.cos(a) * 0.05; y += Math.sin(a) * 0.05; x = Math.min(0.9, Math.max(0.1, x)); y = Math.min(0.9, Math.max(0.1, y)); }
    const p = new Path2D();
    p.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length - 2; i += 2) p.quadraticCurveTo(pts[i], pts[i + 1], (pts[i] + pts[i + 2]) / 2, (pts[i + 1] + pts[i + 3]) / 2);
    glyph(g, p, 0.085, '#fbf8f0', 0.012);
    g.save(); g.setLineDash([0.006, 0.07]); g.lineCap = 'butt'; g.lineWidth = 0.085; g.strokeStyle = 'rgba(160,150,140,0.55)'; g.stroke(p); g.restore();
    g.lineWidth = 0.016; g.strokeStyle = 'rgba(200,192,182,0.8)'; g.setLineDash([]); g.stroke(p);
    for (let i = 0; i < 3; i++) {
      const [sx, sy] = scatter(r, 0.32);
      blob(g, wobblyBlob(sx, sy, 0.05 + r() * 0.02, 7, 0.28, r), '#fbf8f0', 0.01, 0.02);
      g.lineWidth = 0.006; g.strokeStyle = 'rgba(170,160,150,0.7)';
      g.beginPath(); g.moveTo(sx - 0.03, sy); g.lineTo(sx + 0.02, sy + 0.015); g.moveTo(sx, sy - 0.03); g.lineTo(sx + 0.01, sy + 0.02); g.stroke();
    }
  },
  hairball(g, r) {
    // damp spot along the tube (tube lies along x), a couple of stray hairs off the ends
    g.fillStyle = 'rgba(80,100,120,0.25)';
    g.fill(ellipse(0.5, 0.52, 0.4, 0.2));
    for (const [x, y, dx, dy] of [[0.2, 0.48, -0.12, -0.06], [0.22, 0.54, -0.1, 0.08], [0.8, 0.5, 0.12, -0.04], [0.78, 0.55, 0.08, 0.1]]) {
      const h = new Path2D();
      h.moveTo(x, y); h.quadraticCurveTo(x + dx * 0.4, y + dy * 1.6, x + dx, y + dy);
      glyph(g, h, 0.014, '#9b8b7a', 0.006);
    }
  },
  poop(g, r) {
    g.fillStyle = 'rgba(80,60,40,0.18)'; g.fill(ellipse(0.52, 0.54, 0.4, 0.3));
    const logs: [number, number, number, number, number][] = [[0.38, 0.58, 0.2, 0.09, 0.4], [0.62, 0.5, 0.18, 0.085, -0.5], [0.5, 0.4, 0.15, 0.075, 0.15]];
    for (const [x, y, a, b, rot] of logs) {
      blob(g, ellipse(x, y, a, b, rot), '#7b4f2e', 0.014, 0.03);
      shine(g, x - a * 0.3, y - b * 0.35, a * 0.35, b * 0.2, rot, 0.55);
    }
  },
  fish(g) {
    const body = new Path2D();
    body.moveTo(0.12, 0.5);
    body.bezierCurveTo(0.22, 0.26, 0.56, 0.24, 0.7, 0.44);
    body.lineTo(0.92, 0.28); body.quadraticCurveTo(0.86, 0.5, 0.92, 0.72); body.lineTo(0.7, 0.56);
    body.bezierCurveTo(0.56, 0.76, 0.22, 0.74, 0.12, 0.5);
    body.closePath();
    blob(g, body, '#ff9a4d', 0.014, 0.03);
    const fin = smooth([0.36, 0.32, 0.46, 0.2, 0.54, 0.32]);
    blob(g, fin, '#ffb36b', 0.01, 0);
    g.lineWidth = 0.01; g.strokeStyle = dark('#ff9a4d', 0.3);
    for (let i = 0; i < 3; i++) { const h = new Path2D(); h.arc(0.42 + i * 0.08, 0.5, 0.07, -0.9, 0.9); g.stroke(h); }
    g.fillStyle = '#ffffff'; g.fill(circ(0.24, 0.46, 0.045));
    g.fillStyle = OL; g.fill(circ(0.235, 0.465, 0.025));
    g.fillStyle = '#ffffff'; g.fill(circ(0.228, 0.455, 0.009));
    shine(g, 0.36, 0.4, 0.08, 0.02, -0.15, 0.6);
  },
};

const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const mats = new Map<MessKind, THREE.MeshToonMaterial>();
function decalMat(kind: MessKind): THREE.MeshToonMaterial {
  let m = mats.get(kind);
  if (m) return m;
  const seed = [...kind].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7);
  const tex = paintTex(`decal|${kind}`, (g) => DRAW[kind](g, rng(seed)), 512);
  m = toon('#ffffff', { map: tex, transparent: kind === 'puddle', opacity: kind === 'puddle' ? 0.92 : 1 });
  m.alphaTest = kind === 'puddle' ? 0.02 : 0.4;
  m.depthWrite = kind !== 'puddle';
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -2;
  mats.set(kind, m);
  return m;
}

// ---------------------------------------------------------------- small 3D bits
// Only where the real thing is a plain shape anyway (cereal loop = torus, ceramic chip = thin sliver,
// hairball = little tube). Instanced, with a matching instanced outline shell.
const loopGeo = new THREE.TorusGeometry(0.019, 0.0085, 8, 18).rotateX(Math.PI / 2);
const chipGeo = (() => {
  const sh = new THREE.Shape([new THREE.Vector2(0, 0.034), new THREE.Vector2(0.03, -0.016), new THREE.Vector2(0.004, -0.026), new THREE.Vector2(-0.026, -0.02)]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.005, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  return g.rotateX(-Math.PI / 2).center();
})();
const tubeGeo = new THREE.CapsuleGeometry(0.02, 0.05, 4, 10).rotateZ(Math.PI / 2);
const FRUITY = ['#ff6b6b', '#ffb347', '#ffe066', '#7ed67a', '#b48cff', '#6ec8ff'];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _col = new THREE.Color();

function bits(geo: THREE.BufferGeometry, n: number, spread: number, lift: number, tilt: number, scale: [number, number], colors: string[], outline: number): THREE.Object3D[] {
  const fill = new THREE.InstancedMesh(geo, toon('#ffffff'), n);
  const line = new THREE.InstancedMesh(geo, outlineMaterial(outline), n);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * spread, k = scale[0] + Math.random() * (scale[1] - scale[0]);
    _p.set(Math.cos(a) * d, lift * k, Math.sin(a) * d);
    _q.setFromEuler(_e.set((Math.random() - 0.5) * tilt, Math.random() * TAU, (Math.random() - 0.5) * tilt));
    _m.compose(_p, _q, _s.setScalar(k));
    fill.setMatrixAt(i, _m);
    line.setMatrixAt(i, _m);
    fill.setColorAt(i, _col.set(colors[i % colors.length]));
  }
  fill.castShadow = true;
  fill.receiveShadow = true;
  line.raycast = () => {};
  return [fill, line];
}

export function createMessDecal(kind: MessKind): THREE.Object3D {
  const root = new THREE.Group();
  root.name = `mess-${kind}`;
  const quad = new THREE.Mesh(plane, decalMat(kind));
  const s = SIZE[kind];
  quad.scale.set(s, 1, s);
  quad.position.y = 0.004;
  if (kind !== 'hairball') quad.rotation.y = Math.random() * TAU;
  quad.receiveShadow = true;
  root.add(quad);
  if (kind === 'food') root.add(...bits(loopGeo, 9, 0.16, 0.007, 0.5, [0.9, 1.15], FRUITY, 0.0025));
  if (kind === 'shards') root.add(...bits(chipGeo, 5, 0.15, 0.006, 0.7, [0.8, 1.5], ['#f8f4ec', '#f8f4ec', '#cfe2f5'], 0.0025));
  if (kind === 'hairball') {
    const tube = new THREE.Mesh(tubeGeo, toon('#9b8b7a'));
    tube.position.y = 0.017;
    tube.scale.set(1, 0.85, 1);
    tube.castShadow = true;
    addOutline(tube, 0.004);
    root.add(tube);
  }
  return root;
}
