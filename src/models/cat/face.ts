/**
 * Expressive cat face: one decal plane on the cube's flat front face. Eyes, lids, brows, blush and
 * whiskers are drawn procedurally in the fragment shader (uniforms per cat, no texture uploads per
 * frame). Nose + mouth shapes come from a small atlas drawn once with canvas 2D into separate
 * channels (R ink, G mouth interior, B pink, A white) and tinted in the shader.
 * The decal is a MeshToonMaterial with the face injected, so it gets the same lighting as the fur.
 */
import * as THREE from 'three';
import { gradientMap } from '../../shared/toon';

export const MOUTH = {
  omega: 0, meow: 1, hiss: 2, blep: 3, flehmen: 4, smile: 5, frown: 6, o: 7,
  flat: 8, smirk: 9, chomp: 10, derp: 11, grr: 12, hack: 13, lick: 14, ajar: 15,
} as const;
export type MouthName = keyof typeof MOUTH;

/** eye modes */
export const EYE = { open: 0, happy: 1, closed: 2, spiral: 3, x: 4, squeeze: 5 } as const;

// ---------------------------------------------------------------- mouth atlas
const CELL = 128, MCOLS = 8, MROWS = 2;
let mouthTex: THREE.DataTexture | null = null;
function mouthAtlas(): THREE.DataTexture {
  if (mouthTex) return mouthTex;
  const W = CELL * MCOLS, Hh = CELL * MROWS;
  const layers = ['ink', 'inside', 'pink', 'white'].map(() => {
    const c = document.createElement('canvas');
    c.width = W; c.height = Hh;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    return ctx;
  });
  const [ink, inside, pink, white] = layers;
  const names = Object.keys(MOUTH) as MouthName[];
  names.forEach((name, idx) => {
    const ox = (idx % MCOLS) * CELL, oy = Math.floor(idx / MCOLS) * CELL;
    for (const l of layers) { l.save(); l.translate(ox + CELL / 2, oy + CELL / 2); l.beginPath(); l.rect(-CELL / 2 + 2, -CELL / 2 + 2, CELL - 4, CELL - 4); l.clip(); }
    drawMouth(name, ink, inside, pink, white);
    for (const l of layers) l.restore();
  });
  // pack channels (cell row 0 at the top of the canvas = v high)
  const px = layers.map((l) => l.getImageData(0, 0, W, Hh).data);
  const data = new Uint8Array(W * Hh * 4);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const src = (y * W + x) * 4, dst = ((Hh - 1 - y) * W + x) * 4;
    for (let k = 0; k < 4; k++) data[dst + k] = px[k][src + 3];
  }
  mouthTex = new THREE.DataTexture(data, W, Hh, THREE.RGBAFormat);
  mouthTex.magFilter = THREE.LinearFilter;
  mouthTex.minFilter = THREE.LinearMipmapLinearFilter;
  mouthTex.generateMipmaps = true;
  mouthTex.needsUpdate = true;
  return mouthTex;
}

/** cell space: origin at the cell center, +y down, 128 px. Nose sits at y = -34, mouth below. */
function drawMouth(name: MouthName, ink: CanvasRenderingContext2D, inside: CanvasRenderingContext2D, pink: CanvasRenderingContext2D, white: CanvasRenderingContext2D) {
  const LW = 7;
  // nose: soft inverted triangle
  const nose = (ctx: CanvasRenderingContext2D, fill: boolean) => {
    ctx.beginPath();
    ctx.moveTo(-13, -42); ctx.quadraticCurveTo(0, -46, 13, -42);
    ctx.quadraticCurveTo(11, -36, 0, -28); ctx.quadraticCurveTo(-11, -36, -13, -42);
    ctx.closePath();
    if (fill) ctx.fill(); else { ctx.lineWidth = 4; ctx.stroke(); }
  };
  nose(pink, true); nose(ink, false);
  // philtrum
  const line = (ctx: CanvasRenderingContext2D, pts: number[], w = LW) => {
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  };
  const omega = (ctx: CanvasRenderingContext2D, lift = 0, w = 1) => {
    ctx.lineWidth = LW; ctx.beginPath();
    ctx.moveTo(-26 * w, -16 - lift);
    ctx.quadraticCurveTo(-13 * w, 2, 0, -14);
    ctx.quadraticCurveTo(13 * w, 2, 26 * w, -16 - lift);
    ctx.stroke();
  };
  const fill = (ctx: CanvasRenderingContext2D, path: () => void) => { ctx.beginPath(); path(); ctx.fill(); };
  const stroke = (ctx: CanvasRenderingContext2D, path: () => void, w = LW) => { ctx.lineWidth = w; ctx.beginPath(); path(); ctx.stroke(); };
  line(ink, [0, -28, 0, -16], 5);
  switch (name) {
    case 'omega': omega(ink); break;
    case 'blep': {
      omega(ink);
      // big enough to read from the game camera
      fill(pink, () => { pink.ellipse(0, 1, 15, 20, 0, 0, Math.PI * 2); });
      stroke(ink, () => { ink.ellipse(0, 1, 15, 20, 0, 0.1, Math.PI - 0.1); }, 4.5);
      stroke(ink, () => { ink.moveTo(0, -8); ink.lineTo(0, 9); }, 3);
      break;
    }
    case 'derp': {
      omega(ink);
      fill(pink, () => { pink.ellipse(15, 5, 14, 22, -0.4, 0, Math.PI * 2); });
      stroke(ink, () => { ink.ellipse(15, 5, 14, 22, -0.4, 0.1, Math.PI - 0.1); }, 4.5);
      break;
    }
    case 'lick': {
      omega(ink);
      fill(pink, () => { pink.ellipse(0, -2, 11, 17, 0, 0, Math.PI * 2); });
      stroke(ink, () => { ink.ellipse(0, -2, 11, 17, 0, 0.15, Math.PI - 0.15); }, 3.5);
      break;
    }
    case 'meow': case 'hiss': case 'hack': case 'o': case 'chomp': case 'ajar': {
      const mouth = (ctx: CanvasRenderingContext2D) => {
        if (name === 'meow') { ctx.moveTo(-22, -16); ctx.quadraticCurveTo(0, -8, 22, -16); ctx.quadraticCurveTo(18, 20, 0, 24); ctx.quadraticCurveTo(-18, 20, -22, -16); }
        else if (name === 'hiss') { ctx.moveTo(-34, -18); ctx.quadraticCurveTo(0, -6, 34, -18); ctx.quadraticCurveTo(26, 18, 0, 20); ctx.quadraticCurveTo(-26, 18, -34, -18); }
        else if (name === 'hack') ctx.ellipse(0, 2, 15, 22, 0, 0, Math.PI * 2);
        else if (name === 'o') ctx.ellipse(0, -3, 9, 11, 0, 0, Math.PI * 2);
        else if (name === 'chomp') { ctx.moveTo(-18, -14); ctx.quadraticCurveTo(0, -8, 18, -14); ctx.quadraticCurveTo(10, 4, 0, 5); ctx.quadraticCurveTo(-10, 4, -18, -14); }
        else { ctx.moveTo(-12, -14); ctx.quadraticCurveTo(0, -10, 12, -14); ctx.quadraticCurveTo(7, -2, 0, -2); ctx.quadraticCurveTo(-7, -2, -12, -14); }
        ctx.closePath();
      };
      fill(inside, () => mouth(inside));
      if (name === 'meow' || name === 'hiss') fill(pink, () => { pink.ellipse(0, name === 'meow' ? 16 : 12, name === 'meow' ? 13 : 18, 9, 0, 0, Math.PI * 2); });
      if (name === 'hiss') {
        fill(white, () => { white.moveTo(-24, -15); white.lineTo(-16, -13); white.lineTo(-20, 0); white.closePath(); white.moveTo(24, -15); white.lineTo(16, -13); white.lineTo(20, 0); white.closePath(); });
      }
      if (name === 'meow') fill(white, () => { white.moveTo(-17, -14); white.lineTo(-11, -12); white.lineTo(-14, -5); white.closePath(); white.moveTo(17, -14); white.lineTo(11, -12); white.lineTo(14, -5); white.closePath(); });
      stroke(ink, () => mouth(ink), name === 'o' || name === 'ajar' ? 5 : 6);
      // pink only inside the mouth
      pink.globalCompositeOperation = 'destination-in';
      fill(pink, () => { mouth(pink); pink.rect(-20, -50, 40, 26); });
      pink.globalCompositeOperation = 'source-over';
      nose(pink, true);
      break;
    }
    case 'flehmen': {
      const m = (ctx: CanvasRenderingContext2D) => { ctx.moveTo(-26, -20); ctx.quadraticCurveTo(-14, -26, 0, -22); ctx.quadraticCurveTo(14, -26, 26, -20); ctx.quadraticCurveTo(22, 8, 0, 6); ctx.quadraticCurveTo(-22, 8, -26, -20); ctx.closePath(); };
      fill(inside, () => m(inside));
      fill(white, () => { white.rect(-14, -22, 28, 6); });
      stroke(ink, () => m(ink), 6);
      break;
    }
    case 'smile': {
      const m = (ctx: CanvasRenderingContext2D) => { ctx.moveTo(-26, -16); ctx.quadraticCurveTo(0, -12, 26, -16); ctx.quadraticCurveTo(20, 18, 0, 20); ctx.quadraticCurveTo(-20, 18, -26, -16); ctx.closePath(); };
      fill(inside, () => m(inside));
      fill(pink, () => { pink.ellipse(0, 14, 14, 9, 0, 0, Math.PI * 2); });
      pink.globalCompositeOperation = 'destination-in';
      fill(pink, () => { m(pink); pink.rect(-20, -50, 40, 26); });
      pink.globalCompositeOperation = 'source-over';
      nose(pink, true);
      stroke(ink, () => m(ink), 6);
      break;
    }
    case 'frown': stroke(ink, () => { ink.moveTo(-22, -2); ink.quadraticCurveTo(-11, -16, 0, -12); ink.quadraticCurveTo(11, -16, 22, -2); }); break;
    case 'flat': line(ink, [-18, -12, 18, -12]); break;
    case 'smirk': stroke(ink, () => { ink.moveTo(-22, -10); ink.quadraticCurveTo(-11, -6, 0, -12); ink.quadraticCurveTo(14, 0, 28, -22); }); break;
    case 'grr': {
      stroke(ink, () => { ink.moveTo(-24, -4); ink.quadraticCurveTo(-12, -16, 0, -12); ink.quadraticCurveTo(12, -16, 24, -4); });
      fill(white, () => { white.moveTo(8, -13); white.lineTo(16, -11); white.lineTo(13, -1); white.closePath(); });
      stroke(ink, () => { ink.moveTo(8, -13); ink.lineTo(13, -1); ink.lineTo(16, -11); }, 3);
      break;
    }
  }
}

// ---------------------------------------------------------------- material
export interface FaceUniforms {
  uIris: { value: THREE.Color };
  uInk: { value: THREE.Color };
  uWhisk: { value: THREE.Color };
  /** per eye (0 = cat's left, +x): lidTop, lidBot, tilt (+ inner down), mode */
  uEyeA: { value: THREE.Vector4[] };
  /** per eye: pupil w, pupil h, look x, look y */
  uEyeB: { value: THREE.Vector4[] };
  /** eye scale, sparkle, tv glint, time */
  uEyeC: { value: THREE.Vector4 };
  /** per eye: brow alpha, angle (+ = angry), height offset, - */
  uBrow: { value: THREE.Vector4[] };
  /** mouth index, blush, whisker alpha, mouth scale */
  uMouth: { value: THREE.Vector4 };
  uMouthTex: { value: THREE.Texture };
  /** x stretch of the decal (chonk widens the cube): the drawing is squeezed back by this */
  uAspect: { value: number };
}

export function createFaceMaterial(): { mat: THREE.MeshToonMaterial; u: FaceUniforms } {
  const u: FaceUniforms = {
    uIris: { value: new THREE.Color('#f2c14e') },
    uInk: { value: new THREE.Color('#3a2a22') },
    uWhisk: { value: new THREE.Color('#ffffff') },
    uEyeA: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uEyeB: { value: [new THREE.Vector4(0.4, 0.5, 0, 0), new THREE.Vector4(0.4, 0.5, 0, 0)] },
    uEyeC: { value: new THREE.Vector4(1, 0, 0, 0) },
    uBrow: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uMouth: { value: new THREE.Vector4(0, 0.2, 0.6, 1.25) },
    uMouthTex: { value: mouthAtlas() },
    uAspect: { value: 1 },
  };
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(), transparent: true, depthWrite: false });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  mat.defines = { USE_UV: '' };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FACE_GLSL}`)
      .replace('#include <map_fragment>', `
        vec3 faceGlow;
        vec4 fc = catFace(vUv, faceGlow);
        diffuseColor.rgb = fc.rgb;
        diffuseColor.a *= fc.a;
        totalEmissiveRadiance += faceGlow;
      `);
  };
  mat.customProgramCacheKey = () => 'meowhem-cat-face-v2';
  return { mat, u };
}

const FACE_GLSL = /* glsl */ `
uniform vec3 uIris; uniform vec3 uInk; uniform vec3 uWhisk;
uniform vec4 uEyeA[2]; uniform vec4 uEyeB[2]; uniform vec4 uEyeC; uniform vec4 uBrow[2]; uniform vec4 uMouth;
uniform sampler2D uMouthTex; uniform float uAspect;
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float fill(float d, float aa) { return 1.0 - smoothstep(-aa, aa, d); }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
// one eye: returns color (rgb) and coverage (a); glow = emissive share
vec4 catEye(vec2 f, float side, vec4 A, vec4 B, inout vec3 glow) {
  vec2 c = vec2(side * 0.44, 0.12);
  float sc = uEyeC.x;
  vec2 rad = vec2(0.31, 0.35) * sc;
  vec2 q = (f - c) / rad;
  float r = length(q);
  float aa = fwidth(r) * 1.3 + 0.002;
  float mode = A.w;
  vec3 ink = lin(vec3(0.14, 0.09, 0.07));
  if (mode > 0.5 && mode < 2.5 || mode > 3.5) {
    // stroke modes: happy ^, closed u, X, squeeze ><
    float d;
    if (mode < 1.5) d = abs(length(q - vec2(0.0, -0.75)) - 1.0) + max(0.0, -(q.y + 0.05)) * 3.0;
    else if (mode < 2.5) d = abs(length(q - vec2(0.0, 0.95)) - 1.15) + max(0.0, q.y - 0.05) * 3.0;
    else if (mode < 4.5) d = min(sdSeg(q, vec2(-0.6, -0.6), vec2(0.6, 0.6)), sdSeg(q, vec2(-0.6, 0.6), vec2(0.6, -0.6)));
    else { float o = side; d = min(sdSeg(q, vec2(0.6 * o, 0.55), vec2(-0.45 * o, 0.0)), sdSeg(q, vec2(-0.45 * o, 0.0), vec2(0.6 * o, -0.55))); }
    float a = fill(d - 0.16, aa * 1.5);
    return vec4(ink, a);
  }
  float inside = fill(r - 1.0, aa);
  if (inside <= 0.0) return vec4(0.0);
  vec3 col;
  if (mode > 2.5) {
    // dizzy spiral
    float ang = atan(q.y, q.x) + uEyeC.w * 7.0 * side;
    float k = r * 2.6 - ang / 6.2832;
    float s = abs(fract(k) - 0.5);
    col = mix(vec3(1.0), ink, smoothstep(0.32, 0.26, s) * step(0.12, r));
    col = mix(col, ink, smoothstep(0.82, 0.86, r));
    glow += col * 0.25 * inside;
    return vec4(col, inside);
  }
  float lidTop = A.x, lidBot = A.y, tilt = A.z;
  float innerness = -q.x * side;
  float top = 1.0 - 2.0 * lidTop - tilt * innerness * 0.55;
  float bot = -1.0 + 2.0 * lidBot;
  float visT = smoothstep(-aa, aa, top - q.y);
  float visB = smoothstep(-aa, aa, q.y - bot);
  float vis = inside * visT * visB;
  if (top - bot < 0.12) {
    // fully shut: closed line
    float d = abs(q.y - (top + bot) * 0.5 + q.x * q.x * 0.25);
    return vec4(ink, fill(d - 0.13, aa * 1.5) * fill(r - 1.05, aa));
  }
  // iris
  col = uIris * mix(1.28, 0.62, smoothstep(-0.9, 0.95, q.y));
  // pupil
  vec2 look = B.zw;
  vec2 pq = (q - look) / max(B.xy, vec2(0.02));
  float pr = length(pq);
  float paa = fwidth(pr) * 1.3 + 0.002;
  float pupil = fill(pr - 1.0, paa);
  col = mix(col, lin(vec3(0.09, 0.06, 0.05)), pupil);
  // highlights
  vec2 hl = look * 0.3;
  float h1 = fill(length(q - vec2(0.3, 0.38) - hl) - 0.25 - uEyeC.y * 0.06, aa);
  float h2 = fill(length(q - vec2(-0.28, -0.3) - hl) - 0.11, aa);
  float h3 = uEyeC.y * fill(length(q - vec2(-0.05, 0.55) - hl) - 0.08, aa);
  float hi = max(max(h1, h2), h3);
  // tv glint: a little screen reflected in a huge pupil
  vec2 g = abs(q - vec2(0.18, 0.18) - hl) - vec2(0.2, 0.14);
  float tvg = uEyeC.z * fill(length(max(g, 0.0)) + min(max(g.x, g.y), 0.0) - 0.04, aa);
  col = mix(col, vec3(1.0), hi);
  col = mix(col, lin(vec3(0.75, 0.95, 1.0)), tvg * (0.85 + 0.15 * sin(uEyeC.w * 37.0)));
  // rim + lash line
  float rim = smoothstep(0.83 - aa, 0.83 + aa, r);
  float lash = smoothstep(-aa, aa, q.y - (top - 0.2)) * step(0.0, top - q.y + aa);
  float lashB = smoothstep(-aa, aa, (bot + 0.1) - q.y) * step(lidBot, 0.999) * step(0.04, lidBot);
  col = mix(col, ink, max(rim, max(lash, lashB)));
  glow += col * (0.18 + 0.5 * hi) * vis;
  return vec4(col, vis);
}
vec4 catFace(vec2 uv, out vec3 glow) {
  glow = vec3(0.0);
  vec2 f = uv * 2.0 - 1.0;
  f.x *= uAspect;
  vec4 outc = vec4(0.0);
  float aa = fwidth(f.x) * 1.5;
  // blush
  float bl = uMouth.y * 0.85 * smoothstep(0.2, 0.06, length((vec2(abs(f.x), f.y) - vec2(0.68, -0.24)) * vec2(1.0, 1.6)));
  outc = vec4(lin(vec3(1.0, 0.55, 0.62)), bl);
  // whiskers
  float wd = 1e3;
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    wd = min(wd, sdSeg(vec2(abs(f.x), f.y), vec2(0.5, -0.3 - fi * 0.1), vec2(0.88, -0.22 - fi * 0.2)));
  }
  float wa = uMouth.z * fill(wd - 0.012, aa);
  outc.rgb = mix(outc.rgb, uWhisk, wa); outc.a = max(outc.a, wa);
  // brows
  for (int i = 0; i < 2; i++) {
    float side = i == 0 ? 1.0 : -1.0;
    vec4 Bw = uBrow[i];
    vec2 bc = vec2(side * 0.44, 0.6 + Bw.z);
    vec2 inner = bc + vec2(-side * 0.17, -Bw.y * 0.13);
    vec2 outer = bc + vec2(side * 0.17, Bw.y * 0.13);
    float ba = Bw.x * fill(sdSeg(f, inner, outer) - 0.055, aa);
    outc.rgb = mix(outc.rgb, uInk, ba); outc.a = max(outc.a, ba);
  }
  // eyes
  for (int i = 0; i < 2; i++) {
    float side = i == 0 ? 1.0 : -1.0;
    vec4 e = catEye(f, side, uEyeA[i], uEyeB[i], glow);
    outc.rgb = mix(outc.rgb, e.rgb, e.a); outc.a = max(outc.a, e.a);
  }
  // nose + mouth from the atlas
  vec2 m = (f - vec2(0.0, -0.4)) / (0.62 * uMouth.w) + 0.5;
  if (m.x > 0.0 && m.x < 1.0 && m.y > 0.0 && m.y < 1.0) {
    float idx = uMouth.x;
    vec2 cell = vec2(mod(idx, 8.0), floor(idx / 8.0));
    vec2 auv = vec2((cell.x + m.x) / 8.0, 1.0 - (cell.y + 1.0 - m.y) / 2.0);
    vec4 t = texture2D(uMouthTex, auv);
    vec3 c = outc.rgb; float a = outc.a;
    c = mix(c, lin(vec3(0.42, 0.13, 0.16)), t.g); a = max(a, t.g);
    c = mix(c, lin(vec3(0.98, 0.58, 0.66)), t.b); a = max(a, t.b);
    c = mix(c, vec3(1.0), t.a); a = max(a, t.a);
    c = mix(c, uInk, t.r); a = max(a, t.r);
    outc = vec4(c, a);
  }
  return outc;
}
`;
