/**
 * The cat: Kenney Cube Pets cat (manifest 'cat') rebuilt into a procedural rig.
 * - fur atlas per look (pattern + colors), chonk, eye color (cat/fur.ts)
 * - expressive face decal on the cube's front face (cat/face.ts)
 * - every CatAnim as a procedural pose, crossfaded; gait mirrors the GLB walk/run clips but is
 *   phase-locked to speed; springy skinned tail, springy ears, squash & stretch on jump/land
 * - downloaded accessories (cat/accessories.ts), carried items cloned from the prop models
 * Everything inside `fix` is in GLB model units (cube = 1.25 u); root is at the feet, facing +Z.
 */
import * as THREE from 'three';
import type { CatAccessory, CatAnim, CatFace, CatLook, CatModelApi, CatVisualState } from '../shared/contracts';
import { cloneModel, hasModel, modelInfo } from '../assets/loader';
import { BODY_Y, EAR_PIVOT, H, LEG_POS, TAIL_ELEV, TAIL_JOINTS, TAIL_ROOT, catGeometry, furPaint } from './cat/fur';
import { EYE, MOUTH, createFaceMaterial, type FaceUniforms, type MouthName } from './cat/face';
import { ACCESSORIES, accessoryFor, collarFor, preloadAccessories } from './cat/accessories';
import { OUTLINE_COLOR, gradientMap } from '../shared/toon';

/** accessories this model actually supports (menus show only these) */
export const CAT_ACCESSORIES: CatAccessory[] = ['none', ...ACCESSORIES];

const CY = BODY_Y + H;          // cube center height (model units)
const S_DEFAULT = 0.263159;

// ---------------------------------------------------------------- pose channels
const PX = 0, PY = 1, PZ = 2, PRX = 3, PRY = 4, PRZ = 5;
const BSX = 6, BSY = 7, BSZ = 8, BY = 9, BZ = 10, BRX = 11, BRY = 12, BRZ = 13;
const HRX = 14, HRY = 15, HRZ = 16;
const LEG0 = 17; // per leg: rx, splay, lift, fwd, len
const LRX = 0, LSP = 1, LLF = 2, LFW = 3, LLN = 4;
const EAR0 = 37; // per ear: fold (back), out (droop)
const TB = 41; // tail bone j: pitch delta TB + 2j, yaw TB + 2j + 1 (bone frames run along the segments)
const TW = 49, TF = 50; // wag amplitude, wag frequency
const NCH = 51;
const leg = (i: number, k: number) => LEG0 + i * 5 + k;

// tail presets: [p0, y0, p1, y1, p2, y2, p3, y3] (pitch deltas from the modeled hook; elevations add up along the chain)
type Tail = readonly number[];
const TAIL_STREAM: Tail = [-0.6, 0, -0.43, 0, -0.81, 0, -0.9, 0];
const TAIL_UP: Tail = [0.83, 0, -0.43, 0, -0.81, 0, -0.97, 0];
const TAIL_LOW: Tail = [-1.0, 0, -0.63, 0, -0.91, 0, -1.02, 0];
const TAIL_SIT: Tail = [-0.77, 1.25, -0.43, 0, -0.11, 0.7, -1.12, 0.7];
const TAIL_LOAF: Tail = [-1.45, 1.35, -0.43, 0, 0.02, 0.75, -1.12, 0.75];
const TAIL_TUCK: Tail = [-2.1, 0, 0.35, 0, 0.45, 0, 0.2, 0];
const TAIL_HANG: Tail = [-0.3, 0, -0.3, 0, -0.6, 0, -0.8, 0];
function tail(o: Float32Array, t: Tail, k = 1) { for (let i = 0; i < 8; i++) o[TB + i] = k === 1 ? t[i] : lerp(o[TB + i], t[i], k); }

function rest(o: Float32Array) {
  o.fill(0);
  o[BSX] = o[BSY] = o[BSZ] = 1;
  for (let i = 0; i < 4; i++) o[leg(i, LLN)] = 1;
  o[TW] = 0.18; o[TF] = 0.5;
}

/** internal animation names (CatAnim + a few derived ones) */
type Anim = CatAnim | 'noodle' | 'tossed';

// ---------------------------------------------------------------- outline
let outlineMat: THREE.MeshBasicMaterial | null = null;
function outline(): THREE.MeshBasicMaterial {
  if (outlineMat) return outlineMat;
  const m = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 onrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(onrm) * 0.026;');
  };
  m.customProgramCacheKey = () => 'meowhem-cat-outline';
  outlineMat = m;
  return m;
}

// ---------------------------------------------------------------- small math
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const sstep = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const wrapPi = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const TAIL_STIFF = [260, 170, 120, 90];
type Pair = 'lid' | 'bot' | 'pw' | 'ph' | 'browAng' | 'browH';
const both = (f: FaceT, k: Pair, v: number) => { f[k][0] = v; f[k][1] = v; };
const _xAxis = new THREE.Vector3(1, 0, 0);

/** face targets (per eye where it matters) */
interface FaceT {
  lid: [number, number]; bot: [number, number]; tilt: number; mode: [number, number];
  pw: [number, number]; ph: [number, number]; lx: [number, number]; ly: [number, number];
  scale: number; sparkle: number; tv: number;
  brow: number; browAng: [number, number]; browH: [number, number];
  mouth: MouthName; blush: number; noBlink: boolean;
}
const newFaceT = (): FaceT => ({
  lid: [0, 0], bot: [0, 0], tilt: 0, mode: [0, 0], pw: [0.4, 0.4], ph: [0.5, 0.5], lx: [0, 0], ly: [0, 0],
  scale: 1, sparkle: 0, tv: 0, brow: 0, browAng: [0, 0], browH: [0, 0], mouth: 'omega', blush: 0.2, noBlink: false,
});

function setFaceBase(f: FaceT, face: CatFace) {
  f.lid[0] = f.lid[1] = 0.08; f.bot[0] = f.bot[1] = 0; f.tilt = 0; f.mode[0] = f.mode[1] = EYE.open;
  f.pw[0] = f.pw[1] = 0.32; f.ph[0] = f.ph[1] = 0.5; f.lx[0] = f.lx[1] = 0; f.ly[0] = f.ly[1] = 0;
  f.scale = 1; f.sparkle = 0; f.tv = 0; f.brow = 0; f.browAng[0] = f.browAng[1] = 0; f.browH[0] = f.browH[1] = 0;
  f.mouth = 'omega'; f.blush = 0.25; f.noBlink = false;
  switch (face) {
    case 'happy': f.mode[0] = f.mode[1] = EYE.happy; f.mouth = 'smile'; f.blush = 0.65; break;
    case 'smug': both(f, 'lid', 0.4); both(f, 'bot', 0.1); f.lx[0] = f.lx[1] = 0.22; both(f, 'pw', 0.26); both(f, 'ph', 0.42);
      f.brow = 1; f.browAng[0] = -0.35; f.browH[0] = 0.08; f.browAng[1] = 0.25; f.browH[1] = -0.06; f.mouth = 'smirk'; f.blush = 0; break;
    case 'angry': both(f, 'lid', 0.3); f.tilt = 0.9; both(f, 'pw', 0.09); both(f, 'ph', 0.72);
      f.brow = 1; both(f, 'browAng', 0.75); both(f, 'browH', -0.1); f.mouth = 'grr'; f.blush = 0; break;
    case 'shock': f.scale = 1.14; both(f, 'lid', 0); both(f, 'pw', 0.13); both(f, 'ph', 0.15);
      f.brow = 1; both(f, 'browAng', -0.2); both(f, 'browH', 0.12); f.mouth = 'o'; f.blush = 0; break;
    case 'sad': both(f, 'lid', 0.16); f.tilt = -0.7; both(f, 'pw', 0.5); both(f, 'ph', 0.56); f.sparkle = 1;
      f.brow = 1; both(f, 'browAng', -0.7); both(f, 'browH', 0.02); f.mouth = 'frown'; f.blush = 0.35; break;
    case 'derp': f.lid[0] = 0.28; f.lid[1] = 0; f.pw[0] = 0.2; f.pw[1] = 0.4; f.ph[0] = 0.24; f.ph[1] = 0.44; f.lx[0] = -0.34; f.lx[1] = 0.34; f.ly[0] = 0.18; f.ly[1] = -0.22;
      f.scale = 1.05; f.mouth = 'derp'; f.blush = 0.4; break;
    case 'sleepy': both(f, 'lid', 0.62); both(f, 'bot', 0.1); both(f, 'pw', 0.36); f.mouth = 'omega'; f.blush = 0.3; break;
    case 'blep': f.mouth = 'blep'; f.blush = 0.3; break;
    case 'flehmen': both(f, 'lid', 0.44); both(f, 'bot', 0.22); both(f, 'pw', 0.5); both(f, 'ph', 0.52); f.noBlink = true;
      f.brow = 1; both(f, 'browAng', -0.3); both(f, 'browH', 0.1); f.mouth = 'flehmen'; f.blush = 0; break;
    case 'love': both(f, 'pw', 0.6); both(f, 'ph', 0.64); f.sparkle = 1; f.mouth = 'omega'; f.blush = 0.85; break;
    case 'focused': both(f, 'lid', 0.24); both(f, 'bot', 0.14); both(f, 'pw', 0.52); both(f, 'ph', 0.58);
      f.brow = 0.8; both(f, 'browAng', 0.2); both(f, 'browH', -0.08); f.mouth = 'flat'; f.blush = 0; break;
    case 'unimpressed': both(f, 'lid', 0.5); both(f, 'bot', 0.08); both(f, 'pw', 0.2); both(f, 'ph', 0.36);
      f.brow = 0.7; both(f, 'browAng', 0); both(f, 'browH', -0.1); f.mouth = 'flat'; f.blush = 0; break;
    default: break; // neutral
  }
}

// ---------------------------------------------------------------- the cat
class Cat implements CatModelApi {
  readonly root = new THREE.Group();
  readonly scruffAnchor = new THREE.Object3D();
  readonly mouthAnchor = new THREE.Object3D();

  private S = S_DEFAULT;
  private fix = new THREE.Group();
  private pose = new THREE.Group();
  private poseInner = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private legs: THREE.Group[] = [];
  private ears: THREE.Group[] = [];
  private bones: THREE.Bone[] = [];
  private boneRest: number[] = [];
  private furMat: THREE.MeshToonMaterial;
  private face: { mat: THREE.MeshToonMaterial; u: FaceUniforms };
  private accSlot = new THREE.Group();
  private facePlane!: THREE.Mesh;
  private accObj: THREE.Object3D | null = null;
  private accKey: CatAccessory = 'none';
  private carryObj: THREE.Object3D | null = null;
  private carryKey: string | null = null;
  private carryCache = new Map<string, THREE.Object3D>();
  private look: CatLook;

  // animation state
  private t = Math.random() * 100;
  private anim: Anim = 'idle';
  private at = 0;              // time in current anim
  private from = new Float32Array(NCH);
  private cur = new Float32Array(NCH);
  private out = new Float32Array(NCH);
  private fadeT = 1;
  private fadeLen = 0.2;
  private gait = 0;
  private idleT = 0;
  private idleGroom = false;
  private sq = 0; private sqv = 0;
  private wasGrounded = true; private airVy = 0;
  private tossVy0 = 1; private flip = 0; private wasTossed = false;
  private lastYaw = 0; private yawRate = 0;
  private tailX = new Float32Array(4); private tailVX = new Float32Array(4);
  private tailY = new Float32Array(4); private tailVY = new Float32Array(4);
  private earF = new Float32Array(2); private earVF = new Float32Array(2);
  private earS = new Float32Array(2); private earVS = new Float32Array(2);
  private earO = new Float32Array(2);
  private twitchT = 2 + Math.random() * 3;
  private headYaw = 0; private headPitch = 0;
  private lookYaw = 0; private lookPitch = 0; private hasLook = 0;
  private saccT = 0; private saccX = 0; private saccY = 0;
  private wet = 0; private puff = 0; private high = 0;
  private hue = 0;
  // face
  private ft = newFaceT();
  private fc = newFaceT();
  private blinkT = 2 + Math.random() * 3; private blink = 0; private blinkLen = 0.13;
  private blepT = 10 + Math.random() * 15; private blep = 0;
  private restScruff = new THREE.Vector3();
  private chonk = 0;
  private baseColor = new THREE.Color(1, 1, 1);

  constructor(look: CatLook) {
    this.look = look;
    const info = modelInfo('cat');
    if (info) this.S = info.scale[0];
    const g = catGeometry();
    this.furMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap() });
    this.face = createFaceMaterial();

    // hierarchy
    this.root.name = 'cat';
    this.fix.scale.setScalar(this.S);
    this.fix.position.set(...((info?.offset ?? [0, 0, 0.0528]) as [number, number, number]));
    this.root.add(this.fix);
    this.fix.add(this.pose);
    this.pose.add(this.poseInner);
    this.poseInner.position.y = -CY;
    this.poseInner.add(this.body);
    this.head.position.y = CY;
    this.body.add(this.head);

    const mesh = (geo: THREE.BufferGeometry, parent: THREE.Object3D, skinned = false): readonly [THREE.Mesh, THREE.Mesh] => {
      const m = skinned ? new THREE.SkinnedMesh(geo, this.furMat) : new THREE.Mesh(geo, this.furMat);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      const o = skinned ? new THREE.SkinnedMesh(geo, outline()) : new THREE.Mesh(geo, outline());
      o.castShadow = false;
      o.raycast = () => {};
      parent.add(o);
      return [m, o] as const;
    };
    const cube = new THREE.Group();
    cube.position.y = -H;
    this.head.add(cube);
    mesh(g.cube, cube);

    // ears
    for (let e = 0; e < 2; e++) {
      const piv = new THREE.Group();
      piv.position.set(EAR_PIVOT[e][0], EAR_PIVOT[e][1] - H, EAR_PIVOT[e][2]);
      mesh(g.ears[e], piv);
      this.head.add(piv);
      this.ears.push(piv);
    }
    // legs
    for (let i = 0; i < 4; i++) {
      const piv = new THREE.Group();
      piv.position.set(...LEG_POS[i]);
      mesh(g.legs[i], piv);
      this.body.add(piv);
      this.legs.push(piv);
    }
    // tail (skinned)
    const tailRoot = new THREE.Group();
    tailRoot.position.set(TAIL_ROOT[0], TAIL_ROOT[1] - H, TAIL_ROOT[2]);
    let prev: THREE.Object3D = tailRoot;
    for (let j = 0; j < TAIL_JOINTS.length; j++) {
      const b = new THREE.Bone();
      const p = TAIL_JOINTS[j], pp = j ? TAIL_JOINTS[j - 1] : [0, 0, 0];
      const parentElev = j ? TAIL_ELEV[j - 1] : 0;
      // position in the parent's (rotated) frame
      b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]).applyAxisAngle(_xAxis, -parentElev);
      b.rotation.x = TAIL_ELEV[j] - parentElev;
      prev.add(b);
      this.bones.push(b);
      if (j === 0) b.rotation.order = 'YXZ'; // base yaw swings around the vertical
      this.boneRest.push(b.rotation.x);
      prev = b;
    }
    const [tm, to] = mesh(g.tail, tailRoot, true);
    tailRoot.updateMatrixWorld(true);
    const skel = new THREE.Skeleton(this.bones);
    (tm as unknown as THREE.SkinnedMesh).bind(skel);
    (to as unknown as THREE.SkinnedMesh).bind(skel);
    tm.frustumCulled = false; to.frustumCulled = false;
    this.head.add(tailRoot);

    // face decal on the flat front
    const facePlane = this.facePlane = new THREE.Mesh(faceGeo(), this.face.mat);
    facePlane.position.set(0, 0, H + 0.004);
    facePlane.receiveShadow = true;
    facePlane.renderOrder = 1;
    this.head.add(facePlane);

    // anchors
    this.scruffAnchor.position.set(0, H + 0.02, -0.3);
    this.head.add(this.scruffAnchor);
    this.mouthAnchor.position.set(0, -0.22, H + 0.08);
    this.head.add(this.mouthAnchor);
    this.accSlot.name = 'accessory';
    this.head.add(this.accSlot);

    rest(this.cur); rest(this.from); rest(this.out);
    this.root.updateMatrixWorld(true);
    this.scruffAnchor.getWorldPosition(this.restScruff);
    this.setLook(look);
  }

  setLook(look: CatLook) {
    this.look = look;
    const paint = furPaint(look, collarFor(look.accessory));
    this.furMat.map = paint.tex;
    this.furMat.needsUpdate = true;
    this.chonk = clamp(look.chonk ?? 0, 0, 1);
    // the body widens with chonk; face, ears and hats keep their shape (chubby cheeks instead of stretched eyes)
    const keep = (1 + 0.08 * this.chonk) / (1 + 0.32 * this.chonk);
    this.facePlane.scale.x = keep;
    this.accSlot.scale.x = keep;
    for (const e of this.ears) e.scale.x = keep;
    const u = this.face.u;
    u.uIris.value.set(look.eyeColor || '#f2c14e');
    const lum = paint.muzzle.r * 0.2126 + paint.muzzle.g * 0.7152 + paint.muzzle.b * 0.0722;
    u.uInk.value.set(lum < 0.06 ? '#d9c6bd' : '#3a2a22');
    u.uWhisk.value.set(lum > 0.45 ? '#9c8a80' : '#fff8f0');
    u.uMouth.value.z = lum > 0.45 ? 0.55 : 0.75;
    this.setAccessory(look.accessory);
  }

  private setAccessory(a: CatAccessory) {
    if (a === this.accKey && (this.accObj || a === 'none')) return;
    this.accKey = a;
    if (this.accObj) { this.accSlot.remove(this.accObj); this.accObj = null; }
    if (a === 'none') return;
    accessoryFor(a).then((obj) => {
      if (!obj || this.accKey !== a || this.accObj) return;
      this.accObj = obj;
      this.accSlot.add(obj);
    });
  }

  private setCarry(item: CatVisualState['carrying']) {
    const key = item ?? null;
    if (key === this.carryKey) return;
    this.carryKey = key;
    if (this.carryObj) { this.mouthAnchor.remove(this.carryObj); this.carryObj = null; }
    if (!key || !hasModel(key)) return;
    let obj = this.carryCache.get(key);
    if (!obj) {
      const c = cloneModel(key);
      const holder = new THREE.Group();
      const k = (key === 'salmon' ? 0.75 : 1) / this.S;
      c.scale.setScalar(k);
      c.rotation.y = Math.PI / 2;
      if (key === 'salmon') c.rotation.z = 0.15;
      c.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = true; });
      holder.add(c);
      obj = holder;
      this.carryCache.set(key, obj);
    }
    this.carryObj = obj;
    this.mouthAnchor.add(obj);
  }

  dispose() {
    this.root.removeFromParent();
    this.furMat.dispose();
    this.face.mat.dispose();
  }

  // ---------------------------------------------------------------- update
  update(dt: number, s: CatVisualState) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const t = this.t;

    // yaw rate (tail / ear inertia)
    const yaw = this.root.rotation.y;
    this.yawRate = damp(this.yawRate, dt > 0 ? wrapPi(yaw - this.lastYaw) / dt : 0, 12, dt);
    this.lastYaw = yaw;

    // landing / takeoff squash
    if (!s.grounded) this.airVy = s.vy;
    if (s.grounded && !this.wasGrounded) this.sqv -= clamp(-this.airVy, 0, 9) * 0.9;
    if (!s.grounded && this.wasGrounded && s.vy > 1) this.sqv += 2.5;
    this.wasGrounded = s.grounded;
    const sqTarget = s.grounded ? 0 : clamp(Math.abs(s.vy) * 0.025, 0, 0.14);
    this.sqv += (-(this.sq - sqTarget) * 320 - this.sqv * 13) * dt;
    this.sq = clamp(this.sq + this.sqv * dt, -0.35, 0.3);

    // resolve internal anim
    let a: Anim = s.anim;
    if (a === 'land') a = 'idle';
    if (a === 'grabbed' && s.noodle) a = 'noodle';
    if (s.tossed && !s.grounded) a = 'tossed';
    if (a === 'idle' && s.speed < 0.15) {
      this.idleT += dt;
      if (this.idleT > 6) a = 'loaf';
      else if (this.idleT > 2.8 && this.idleGroom) a = 'groom';
    } else if (a !== 'idle') {
      this.idleT = 0;
      this.idleGroom = Math.random() < 0.45;
    } else this.idleT = 0;
    if (a !== this.anim) {
      this.from.set(this.out);
      this.fadeT = 0;
      this.fadeLen = a === 'tossed' || this.anim === 'tossed' ? 0.08 : a === 'swipe' || a === 'tap' ? 0.08 : a === 'loaf' || a === 'sleep' ? 0.45 : 0.18;
      this.anim = a;
      this.at = 0;
    }
    this.at += dt;
    this.fadeT += dt;

    // tossed flip bookkeeping
    if (a === 'tossed' && !this.wasTossed) { this.tossVy0 = Math.max(1.5, s.vy); this.flip = 0; }
    if (a === 'tossed') {
      this.tossVy0 = Math.max(this.tossVy0, s.vy);
      const ph = clamp((this.tossVy0 - s.vy) / (2 * this.tossVy0), 0, 1);
      this.flip = Math.max(this.flip, sstep(ph) * Math.PI * 2);
    } else this.flip = 0;
    this.wasTossed = a === 'tossed';

    // gait phase
    const sp = s.speed;
    const freq = a === 'run' ? 1.6 + sp * 1.0 : 0.9 + sp * 1.45;
    this.gait += dt * Math.PI * 2 * (sp > 0.05 ? freq : 0);

    // pose
    rest(this.cur);
    this.posePrimary(a, s, this.cur);
    const w = sstep(this.fadeT / this.fadeLen);
    for (let i = 0; i < NCH; i++) this.out[i] = lerp(this.from[i], this.cur[i], w);
    this.overlays(s, dt);
    this.apply(dt, s);
    this.updateFace(dt, s, a);
    this.setCarry(s.carrying ?? null);
  }

  /** the anim's own pose, written on top of rest() */
  private posePrimary(a: Anim, s: CatVisualState, o: Float32Array) {
    const t = this.t, at = this.at;
    const g = this.gait;
    const sw = Math.sin(g);
    switch (a) {
      case 'idle': {
        o[BSY] = 1 + Math.sin(t * 2.3) * 0.012;
        o[HRY] = Math.sin(t * 0.37) * 0.18 + Math.sin(t * 0.9) * 0.05;
        o[HRX] = Math.sin(t * 0.53) * 0.05;
        o[TW] = 0.3; o[TF] = 0.45;
        break;
      }
      case 'walk': case 'carryMouth': {
        const amp = clamp(0.35 + s.speed * 0.15, 0.35, 0.8);
        o[leg(0, LRX)] = sw * amp; o[leg(3, LRX)] = sw * amp;
        o[leg(1, LRX)] = -sw * amp; o[leg(2, LRX)] = -sw * amp;
        for (let i = 0; i < 4; i++) o[leg(i, LLF)] = Math.max(0, (i === 0 || i === 3 ? -1 : 1) * Math.cos(g)) * 0.04;
        o[BY] = Math.abs(Math.sin(g)) * 0.07;
        o[BRZ] = sw * 0.06;
        o[BRY] = sw * 0.04;
        o[HRX] = -Math.abs(Math.sin(g)) * 0.03 + (a === 'carryMouth' ? -0.12 : 0);
        if (a === 'carryMouth') o[TB] = 0.3; o[TW] = 0.35; o[TF] = 1.1;
        break;
      }
      case 'run': {
        const amp = 1.15;
        o[leg(0, LRX)] = o[leg(1, LRX)] = -sw * amp;
        o[leg(2, LRX)] = o[leg(3, LRX)] = sw * amp;
        o[BY] = Math.max(0, Math.sin(g)) * 0.16;
        o[BRX] = Math.cos(g) * 0.12;
        o[BSZ] = 1 + Math.sin(g) * 0.1; o[BSY] = 1 - Math.sin(g) * 0.06;
        o[HRX] = -Math.cos(g) * 0.08;
        o[EAR0] = o[EAR0 + 2] = 0.55;
        tail(o, TAIL_STREAM); o[TW] = 0.15; o[TF] = 2;
        break;
      }
      case 'jump': {
        o[BSY] = 1.06; o[BRX] = -0.12;
        o[leg(0, LRX)] = o[leg(1, LRX)] = -0.9;
        o[leg(2, LRX)] = o[leg(3, LRX)] = 0.85;
        o[EAR0] = o[EAR0 + 2] = 0.35;
        tail(o, TAIL_STREAM, 0.6); o[TW] = 0.05;
        break;
      }
      case 'fall': {
        o[BRX] = 0.08;
        o[leg(0, LRX)] = o[leg(1, LRX)] = -0.35;
        o[leg(2, LRX)] = o[leg(3, LRX)] = 0.3;
        for (let i = 0; i < 4; i++) o[leg(i, LSP)] = 0.25;
        o[EAR0 + 1] = o[EAR0 + 3] = -0.2;
        tail(o, TAIL_UP, 0.6); o[TW] = 0.05;
        break;
      }
      case 'tossed': {
        o[PRX] = wrapPi(this.flip);
        for (let i = 0; i < 4; i++) o[leg(i, LSP)] = 0.75;
        o[leg(0, LRX)] = o[leg(1, LRX)] = -0.7;
        o[leg(2, LRX)] = o[leg(3, LRX)] = 0.7;
        o[BSY] = 1.05;
        o[EAR0] = o[EAR0 + 2] = 0.7;
        tail(o, TAIL_STREAM, 0.7); o[TW] = 0.1; o[TF] = 3;
        break;
      }
      case 'sit': case 'hypnotized': case 'groom': this.sitPose(o); if (a === 'groom') this.groomPose(o); if (a === 'hypnotized') { o[HRX] -= 0.12; o[BRZ] = Math.sin(t * 0.7) * 0.02; o[TW] = 0.02; } break;
      case 'loaf': case 'sleep': case 'caged': {
        this.loafPose(o);
        if (a === 'sleep') { o[BY] -= 0.02; o[BRZ] = 0.12; o[HRX] = 0.22; o[HRZ] = 0.15; o[BSY] = 0.9 + Math.sin(t * 2.2) * 0.02; o[TB + 5] = 1.4; o[TB + 7] = 1.3; o[TW] = 0.03; }
        if (a === 'caged') {
          const wig = s.wiggle ?? 0;
          o[EAR0] = o[EAR0 + 2] = 0.5;
          if (wig > 0.05) {
            o[BY] += 0.08; o[leg(1, LLF)] = 0; o[leg(1, LFW)] = 0.15;
            o[leg(1, LRX)] = -1.5 + Math.sin(t * 22) * 0.45 * wig;
            o[BRY] = Math.sin(t * 14) * 0.08 * wig;
            o[TW] = 0.5; o[TF] = 4;
          }
        }
        break;
      }
      case 'crouch': case 'pounceCharge': {
        const c = a === 'pounceCharge' ? clamp(s.pounceCharge ?? 0.5, 0, 1) : 0;
        o[BY] = -0.1; o[BSY] = 0.88; o[BSX] = 1.04;
        o[BRX] = 0.12 + c * 0.12;
        for (let i = 0; i < 4; i++) o[leg(i, LLN)] = 0.65;
        o[leg(2, LLN)] = o[leg(3, LLN)] = 0.8;
        o[EAR0] = o[EAR0 + 2] = -0.25;
        tail(o, TAIL_LOW, 0.7); o[TW] = 0.06 + c * 0.1; o[TF] = 3 + c * 6;
        if (c > 0) {
          // the butt wiggle
          const wf = 7 + c * 6;
          o[BRY] = Math.sin(t * wf) * 0.07 * (0.4 + c);
          o[BRZ] = Math.sin(t * wf) * 0.05 * (0.4 + c);
          o[PX] = -Math.sin(t * wf) * 0.03 * c;
          o[leg(2, LLF)] = Math.max(0, Math.sin(t * wf)) * 0.05;
          o[leg(3, LLF)] = Math.max(0, -Math.sin(t * wf)) * 0.05;
          o[HRY] = -o[BRY]; o[HRZ] = -o[BRZ];
        }
        break;
      }
      case 'swipe': {
        const ph = (at % 0.42) / 0.42;
        const up = Math.sin(Math.min(1, ph / 0.35) * Math.PI / 2);
        const arc = ph < 0.35 ? 0 : Math.sin((ph - 0.35) / 0.65 * Math.PI);
        o[leg(1, LRX)] = -2.3 * up + arc * 0.9;
        o[leg(1, LSP)] = -0.2 * up + arc * 0.9;
        o[leg(1, LFW)] = 0.18 * up; o[leg(1, LLF)] = 0.1 * up;
        o[BRX] = -0.12 * up; o[BRZ] = -0.08 * up + arc * 0.06;
        o[HRY] = -0.15 * up; o[EAR0] = o[EAR0 + 2] = -0.2;
        o[TW] = 0.25; o[TF] = 3;
        break;
      }
      case 'tap': {
        const ph = (at % 0.45) / 0.45;
        const lift = Math.sin(ph * Math.PI);
        o[leg(0, LRX)] = -1.35 * lift;
        o[leg(0, LFW)] = 0.08 + 0.14 * lift;
        o[leg(0, LLF)] = 0.05 * lift;
        o[TW] = 0.08; o[TF] = 1.5;
        break;
      }
      case 'scratch': {
        o[PRX] = -0.85; o[PY] = 0.12; o[PZ] = 0.1;
        o[leg(2, LRX)] = o[leg(3, LRX)] = 0.85;
        o[leg(0, LRX)] = -1.5 + Math.sin(t * 9) * 0.45;
        o[leg(1, LRX)] = -1.5 - Math.sin(t * 9) * 0.45;
        o[HRX] = 0.45; o[BRZ] = Math.sin(t * 9) * 0.04;
        o[EAR0] = o[EAR0 + 2] = 0.2;
        tail(o, TAIL_UP, 0.4); o[TW] = 0.35; o[TF] = 4;
        break;
      }
      case 'poop': {
        o[BY] = -0.08; o[BRX] = -0.18; o[BZ] = 0.04;
        o[leg(2, LLN)] = o[leg(3, LLN)] = 0.62;
        o[leg(2, LRX)] = o[leg(3, LRX)] = -0.35;
        o[leg(0, LRX)] = o[leg(1, LRX)] = 0.15;
        o[HRX] = 0.12;
        o[BRZ] = Math.sin(t * 31) * 0.008;
        tail(o, TAIL_UP); o[TW] = 0.02;
        break;
      }
      case 'eat': {
        o[BRX] = 0.5; o[BY] = 0.02;
        o[HRX] = 0.12 + Math.max(0, Math.sin(t * 11)) * 0.08;
        o[leg(0, LRX)] = o[leg(1, LRX)] = -0.45;
        o[leg(2, LRX)] = o[leg(3, LRX)] = -0.45;
        tail(o, TAIL_LOW, 0.4); o[TW] = 0.4; o[TF] = 1.2;
        break;
      }
      case 'type': {
        this.sitPose(o);
        const k = Math.sin(t * 16);
        o[leg(0, LRX)] = -0.95 + Math.max(0, k) * 0.35;
        o[leg(1, LRX)] = -0.95 + Math.max(0, -k) * 0.35;
        o[leg(0, LLF)] = o[leg(1, LLF)] = 0.08; o[leg(0, LFW)] = o[leg(1, LFW)] = 0.12;
        o[HRX] += 0.25 + Math.sin(t * 8) * 0.03;
        o[TW] = 0.15; o[TF] = 2;
        break;
      }
      case 'dig': {
        o[BRX] = 0.35; o[BY] = 0.03;
        const k = Math.sin(t * 13);
        o[leg(0, LRX)] = -0.6 + k * 0.9;
        o[leg(1, LRX)] = -0.6 - k * 0.9;
        o[leg(2, LRX)] = o[leg(3, LRX)] = -0.25;
        o[HRX] = 0.2; o[BRZ] = k * 0.04;
        tail(o, TAIL_UP, 0.5); o[TW] = 0.4; o[TF] = 2;
        break;
      }
      case 'knead': {
        o[BY] = -0.03; o[BRX] = 0.05;
        const k = Math.sin(t * Math.PI * 2 * 1.4);
        o[leg(0, LRX)] = -0.35 + k * 0.35; o[leg(0, LLF)] = Math.max(0, k) * 0.09;
        o[leg(1, LRX)] = -0.35 - k * 0.35; o[leg(1, LLF)] = Math.max(0, -k) * 0.09;
        o[BRZ] = k * 0.03; o[HRZ] = -k * 0.03;
        o[EAR0 + 1] = o[EAR0 + 3] = 0.15;
        tail(o, TAIL_UP, 0.3); o[TW] = 0.15; o[TF] = 0.7;
        break;
      }
      case 'climb': case 'hangDoor': {
        const door = a === 'hangDoor';
        o[PRX] = door ? -1.5 : -1.42;
        o[PY] = door ? 1.95 + Math.sin(t * 2.2) * 0.04 : 1.0 + Math.sin(t * 6) * 0.06;
        o[PZ] = door ? 0.25 : 0.15;
        const k = Math.sin(t * (door ? 7 : 6));
        o[leg(0, LRX)] = -1.55 + (door ? 0 : k * 0.35);
        o[leg(1, LRX)] = -1.55 - (door ? 0 : k * 0.35);
        o[leg(2, LRX)] = 1.3 + k * (door ? 0.6 : 0.35);
        o[leg(3, LRX)] = 1.3 - k * (door ? 0.6 : 0.35);
        o[PRZ] = door ? Math.sin(t * 2.2) * 0.12 : 0;
        o[HRX] = -0.2;
        o[EAR0] = o[EAR0 + 2] = door ? 0.1 : 0.3;
        tail(o, TAIL_HANG); o[TW] = door ? 0.5 : 0.3; o[TF] = door ? 1.5 : 1;
        break;
      }
      case 'interact': {
        const k = Math.max(0, Math.sin(t * 9));
        o[leg(1, LRX)] = -1.1 * k; o[leg(1, LFW)] = 0.05 * k;
        o[HRZ] = 0.15; o[HRX] = 0.1;
        o[TW] = 0.3; o[TF] = 1.5;
        break;
      }
      case 'hairball': {
        // three heaves, the last one big, then the hack
        const ph = at % 2.0;
        const beat = Math.floor(ph / 0.5), f = (ph % 0.5) / 0.5;
        const big = beat === 3 ? 1.6 : 1;
        const h = Math.sin(f * Math.PI) * big;
        o[BSZ] = 1 + h * 0.12; o[BSY] = 1 - h * 0.12; o[BSX] = 1 + h * 0.04;
        o[BRX] = 0.15 + h * 0.18; o[BY] = -0.04 + h * 0.03;
        o[HRX] = 0.15 + h * 0.2;
        o[PZ] = h * 0.05;
        for (let i = 0; i < 4; i++) o[leg(i, LLN)] = 0.85;
        o[EAR0] = o[EAR0 + 2] = 0.3 * h;
        tail(o, TAIL_LOW, 0.8 - h * 0.4); o[TW] = 0.05;
        break;
      }
      case 'grabbed': case 'noodle': {
        const noodle = a === 'noodle';
        const wig = noodle ? 0 : clamp(s.wiggle ?? 0, 0, 1);
        const sway = Math.sin(t * 2.4);
        o[PRX] = 0.36 + sway * 0.03 + Math.sin(t * 17) * 0.1 * wig;
        o[PRZ] = Math.sin(t * 1.7) * (noodle ? 0.04 : 0.07) + Math.sin(t * 11) * 0.2 * wig;
        o[PRY] = Math.sin(t * 7) * 0.35 * wig;
        o[BSY] = noodle ? 1.25 : 1.1; o[BSX] = noodle ? 0.86 : 0.96; o[BSZ] = noodle ? 0.88 : 0.96;
        // legs straight down in the world, loose
        for (let i = 0; i < 4; i++) {
          const lag = Math.sin(t * 2.4 - 0.6 - i * 0.2) * 0.06;
          o[leg(i, LRX)] = -o[PRX] + lag;
          o[leg(i, LLN)] = noodle ? 1.35 : 1.05;
          o[leg(i, LSP)] = 0.04;
        }
        if (noodle) {
          const k = Math.sin(t * Math.PI * 2 * 1.4);
          o[leg(0, LRX)] += -0.3 + k * 0.3; o[leg(0, LLF)] = Math.max(0, k) * 0.07;
          o[leg(1, LRX)] += -0.3 - k * 0.3; o[leg(1, LLF)] = Math.max(0, -k) * 0.07;
          o[EAR0 + 1] = o[EAR0 + 3] = 0.25;
          tail(o, TAIL_TUCK, 0.6); o[TW] = 0.45; o[TF] = 0.4;
        } else {
          if (wig > 0.05) for (let i = 0; i < 4; i++) { o[leg(i, LRX)] += Math.sin(t * 19 + i * 1.7) * 0.7 * wig; o[leg(i, LSP)] += 0.3 * wig; }
          o[EAR0] = o[EAR0 + 2] = 0.3 + 0.4 * wig;
          o[EAR0 + 1] = o[EAR0 + 3] = 0.2;
          // tail tucked and curled forward between the legs
          tail(o, TAIL_TUCK); o[TW] = 0.05 + wig * 0.6; o[TF] = 1 + wig * 6;
        }
        o[HRX] = -0.1;
        break;
      }
      case 'stunned': {
        const decay = Math.exp(-this.at * 2.5);
        const shake = this.wet > 0.3;
        o[HRZ] = Math.sin(t * 13) * (shake ? 0.08 : 0.22 * decay + 0.04);
        o[BRY] = shake ? Math.sin(t * 38) * 0.22 * Math.max(0.2, decay) : 0;
        o[BRZ] = shake ? Math.sin(t * 38 + 1) * 0.08 : Math.sin(t * 7) * 0.05;
        o[BSY] = 0.94; o[BY] = -0.03;
        for (let i = 0; i < 4; i++) o[leg(i, LSP)] = 0.12;
        o[EAR0 + 1] = o[EAR0 + 3] = 0.5;
        tail(o, TAIL_LOW, 0.6); o[TW] = shake ? 0.6 : 0.05; o[TF] = 6;
        break;
      }
      case 'fight': {
        o[PY] = Math.abs(Math.sin(t * 9)) * 0.15;
        o[PRY] = Math.sin(t * 5.3) * 0.7;
        o[PRZ] = Math.sin(t * 7.1) * 0.25;
        o[leg(0, LRX)] = -1.6 + Math.sin(t * 24) * 0.8;
        o[leg(1, LRX)] = -1.6 + Math.sin(t * 24 + 2) * 0.8;
        o[leg(2, LRX)] = Math.sin(t * 20) * 0.6;
        o[leg(3, LRX)] = Math.sin(t * 20 + 2) * 0.6;
        o[EAR0] = o[EAR0 + 2] = 1;
        tail(o, TAIL_UP); o[TW] = 0.7; o[TF] = 5;
        break;
      }
      default: break;
    }
  }

  private sitPose(o: Float32Array) {
    o[BRX] = -0.55; o[BY] = 0.13; o[BZ] = 0.06;
    o[HRX] = 0.4;
    o[leg(0, LRX)] = o[leg(1, LRX)] = 0.55; o[leg(0, LLN)] = o[leg(1, LLN)] = 1.15;
    o[leg(2, LRX)] = o[leg(3, LRX)] = -1.4; o[leg(2, LLF)] = o[leg(3, LLF)] = 0.16;
    tail(o, TAIL_SIT); o[TW] = 0.12; o[TF] = 0.5;
  }

  private loafPose(o: Float32Array) {
    o[BY] = -0.16; o[BSY] = 0.92 + Math.sin(this.t * 1.6) * 0.012; o[BSX] = 1.06; o[BSZ] = 1.03;
    for (let i = 0; i < 4; i++) { o[leg(i, LLF)] = 0.2; o[leg(i, LLN)] = 0.8; }
    o[leg(0, LFW)] = o[leg(1, LFW)] = 0.04;
    tail(o, TAIL_LOAF); o[TW] = 0.06; o[TF] = 0.3;
  }

  /** sit + lick a raised paw + one face wipe, 1.5 s cycle */
  private groomPose(o: Float32Array) {
    const ph = (this.at % 1.5) / 1.5;
    if (ph < 0.6) {
      // raise the paw to the mouth and lick it
      const k = sstep(ph / 0.15);
      o[leg(0, LRX)] = lerp(o[leg(0, LRX)], -1.5, k); o[leg(0, LFW)] = 0.3 * k; o[leg(0, LLF)] = 0.3 * k; o[leg(0, LSP)] = -0.3 * k; o[leg(0, LLN)] = 1 + 0.15 * k;
      o[HRX] += 0.22 * k + Math.sin(this.t * 14) * 0.035 * k; o[HRZ] = 0.2 * k; o[HRY] = 0.18 * k;
    } else {
      // one wipe over the face
      const k = Math.sin((ph - 0.6) / 0.4 * Math.PI);
      o[leg(0, LRX)] = -1.5 - k * 0.5; o[leg(0, LFW)] = 0.3; o[leg(0, LLF)] = 0.3 + k * 0.3; o[leg(0, LSP)] = -0.3 - k * 0.25; o[leg(0, LLN)] = 1.15;
      o[HRX] += 0.3 * k; o[HRZ] = 0.2 + k * 0.1; o[HRY] = 0.18 + 0.15 * k;
      o[EAR0] = k * 0.45;
    }
    o[TW] = 0.08;
  }

  /** modifiers that apply over any anim */
  private overlays(s: CatVisualState, dt: number) {
    const o = this.out, t = this.t;
    this.wet = damp(this.wet, clamp(s.wet ?? 0, 0, 1), 4, dt);
    this.puff = damp(this.puff, s.puffed ? 1 : 0, 14, dt);
    this.high = damp(this.high, s.high ? 1 : 0, 3, dt);
    // squash & stretch
    o[BSY] *= 1 + this.sq; o[BSX] *= 1 - this.sq * 0.5; o[BSZ] *= 1 - this.sq * 0.5;
    // puffed: bigger, arched, tiptoe, ears flat, bottle-brush tail
    const p = this.puff;
    if (p > 0.001) {
      o[BSY] *= 1 + 0.1 * p; o[BY] += 0.06 * p;
      for (let i = 0; i < 4; i++) o[leg(i, LLN)] *= 1 + 0.15 * p;
      o[EAR0] += 0.9 * p; o[EAR0 + 2] += 0.9 * p; o[EAR0 + 1] += 0.35 * p; o[EAR0 + 3] += 0.35 * p;
      tail(o, TAIL_UP, p); o[TW] *= 1 - 0.7 * p;
      o[BRZ] += Math.sin(t * 40) * 0.01 * p;
    }
    // wet: droopy ears, low tail
    const wt = this.wet;
    if (wt > 0.001) {
      o[BSX] *= 1 - 0.14 * wt; o[BSZ] *= 1 - 0.1 * wt;
      o[EAR0 + 1] += 0.85 * wt; o[EAR0 + 3] += 0.85 * wt; o[EAR0] += 0.25 * wt; o[EAR0 + 2] += 0.25 * wt;
      tail(o, TAIL_LOW, wt * 0.7); o[TW] *= 1 - 0.5 * wt;
      o[HRX] += 0.08 * wt;
    }
    // catnip: wobble
    if (this.high > 0.001) {
      o[PRZ] += Math.sin(t * 2.1) * 0.1 * this.high;
      o[HRX] += Math.sin(t * 1.3) * 0.12 * this.high;
      o[HRZ] += Math.sin(t * 1.7 + 1) * 0.15 * this.high;
    }
    if (s.dizzy) { o[HRZ] += Math.sin(t * 6) * 0.12; o[HRX] += Math.cos(t * 6) * 0.08; }
    // talk: meow lifts the head with a tilt
    if (s.talk === 'meow' || s.talk === 'chirp') { o[HRX] -= 0.18; o[HRZ] += 0.14; o[BSY] *= 1.04; }
    if (s.talk === 'purr') o[BSY] *= 1 + Math.sin(t * 50) * 0.004;
  }

  private apply(dt: number, s: CatVisualState) {
    const o = this.out, t = this.t;
    const loose = this.anim === 'grabbed' || this.anim === 'noodle' || this.anim === 'tossed' || this.anim === 'hangDoor' || this.anim === 'climb';
    // chonk: wider, shorter legs (feet stay on the floor)
    const ch = this.chonk;
    const legLen = 1 - 0.22 * ch;
    const puffScale = 1 + 0.12 * this.puff;
    const wetScale = 1 - 0.08 * this.wet;
    const k = puffScale * wetScale;
    this.pose.position.set(o[PX], o[PY] + CY, o[PZ]);
    this.pose.rotation.set(o[PRX], o[PRY], o[PRZ]);
    this.pose.scale.setScalar(k);
    this.body.position.set(0, o[BY] - (loose ? 0 : 0.3 * (1 - legLen)), o[BZ]);
    this.body.rotation.set(o[BRX], o[BRY], o[BRZ]);
    this.body.scale.set(o[BSX] * (1 + 0.32 * ch), o[BSY] * (1 - 0.03 * ch), o[BSZ] * (1 + 0.18 * ch));

    // head: anim rotation + lookAt
    this.hasLook = damp(this.hasLook, s.lookAt ? 1 : 0, 6, dt);
    if (s.lookAt) {
      this.root.getWorldPosition(_v);
      _w.copy(s.lookAt).sub(_v);
      const c = Math.cos(-this.root.rotation.y), sn = Math.sin(-this.root.rotation.y);
      const lx = _w.x * c + _w.z * sn, lz = -_w.x * sn + _w.z * c;
      this.lookYaw = clamp(Math.atan2(lx, lz), -1.4, 1.4);
      this.lookPitch = clamp(-Math.atan2(_w.y - 0.3, Math.hypot(lx, lz)), -0.6, 0.5);
    }
    const allowLook = !loose && this.anim !== 'sleep' && this.anim !== 'hairball';
    const lw = allowLook ? this.hasLook : 0;
    this.headYaw = damp(this.headYaw, clamp(this.lookYaw, -0.55, 0.55) * lw, 10, dt);
    this.headPitch = damp(this.headPitch, this.lookPitch * 0.6 * lw, 10, dt);
    this.head.rotation.set(o[HRX] + this.headPitch, o[HRY] + this.headYaw, o[HRZ]);

    for (let i = 0; i < 4; i++) {
      const L = this.legs[i], base = LEG_POS[i];
      const sx = base[0] > 0 ? 1 : -1;
      L.position.set(base[0], base[1] + o[leg(i, LLF)], base[2] + o[leg(i, LFW)]);
      L.rotation.set(o[leg(i, LRX)], 0, sx * o[leg(i, LSP)]);
      L.scale.set(1, o[leg(i, LLN)] * (loose ? 1 : legLen), 1);
    }

    // ears: spring toward fold / droop / swivel (+ twitches, lookAt swivel up to 40 deg)
    this.twitchT -= dt;
    const swivel = clamp(this.lookYaw - this.headYaw, -0.7, 0.7) * this.hasLook * (allowLook ? 1 : 0);
    for (let e = 0; e < 2; e++) {
      if (this.twitchT <= 0 && (e === 0) === (Math.random() < 0.5)) { this.earVF[e] += 14; this.twitchT = 1.5 + Math.random() * 4; }
      const tf = o[EAR0 + e * 2], to = o[EAR0 + e * 2 + 1];
      this.earVF[e] += ((tf - this.earF[e]) * 260 - this.earVF[e] * 14) * dt;
      this.earF[e] += this.earVF[e] * dt;
      this.earVS[e] += ((swivel - this.earS[e]) * 200 - this.earVS[e] * 16) * dt;
      this.earS[e] += this.earVS[e] * dt;
      this.earO[e] = damp(this.earO[e], to, 10, dt);
      const sx = e === 0 ? 1 : -1;
      this.ears[e].rotation.set(-this.earF[e], this.earS[e], -sx * this.earO[e]);
    }

    // tail springs (lag grows along the chain; body turns fling it)
    const wagA = o[TW], wagF = o[TF];
    const brush = 1 + 0.6 * this.puff - 0.35 * this.wet;
    for (let j = 0; j < 4; j++) {
      const ph = t * Math.PI * 2 * wagF - j * 0.7;
      const tx = o[TB + j * 2];
      const ty = o[TB + j * 2 + 1] + Math.sin(ph) * wagA * (0.6 + j * 0.25);
      const kk = TAIL_STIFF[j], d = 2 * Math.sqrt(kk) * 0.45;
      this.tailVX[j] += ((tx - this.tailX[j]) * kk - this.tailVX[j] * d) * dt;
      this.tailVY[j] += ((ty - this.tailY[j]) * kk - this.tailVY[j] * d - this.yawRate * (8 + j * 6)) * dt;
      if (!s.grounded && !loose) this.tailVX[j] += clamp(s.vy, -6, 6) * 0.6 * dt * j;
      this.tailX[j] += this.tailVX[j] * dt;
      this.tailY[j] += this.tailVY[j] * dt;
      this.tailX[j] = clamp(this.tailX[j], -2.6, 2.6);
      this.tailY[j] = clamp(this.tailY[j], -2.2, 2.2);
      this.bones[j].rotation.set(this.boneRest[j] + this.tailX[j], this.tailY[j], 0);
      this.bones[j].scale.set(j === 0 ? brush : 1, j === 0 ? brush : 1, 1);
    }

    // scruff pin: while held, the scruff stays put and the body hangs under it
    if (this.anim === 'grabbed' || this.anim === 'noodle') {
      this.root.updateMatrixWorld(true);
      this.scruffAnchor.getWorldPosition(_v);
      this.root.worldToLocal(_v);
      _w.copy(this.restScruff).sub(_v).divideScalar(this.S);
      this.pose.position.add(_w);
    }

    // materials: wet darkens, catnip pulses a rainbow tint
    this.baseColor.setRGB(1 - 0.38 * this.wet, 1 - 0.34 * this.wet, 1 - 0.22 * this.wet);
    this.furMat.color.copy(this.baseColor);
    if (this.high > 0.01) {
      this.hue = (this.hue + dt * 0.35) % 1;
      this.furMat.emissive.setHSL(this.hue, 0.9, 0.5).multiplyScalar(0.22 * this.high * (0.6 + 0.4 * Math.sin(t * 5)));
    } else this.furMat.emissive.setRGB(0, 0, 0);
  }

  // ---------------------------------------------------------------- face
  private updateFace(dt: number, s: CatVisualState, a: Anim) {
    const f = this.ft, t = this.t;
    let face: CatFace = s.face;
    if (a === 'tossed') face = 'shock';
    if ((a === 'loaf' || a === 'groom') && face === 'neutral' && s.anim === 'idle') face = 'sleepy';
    setFaceBase(f, face);

    // anim overrides
    switch (a) {
      case 'sleep': f.mode[0] = f.mode[1] = EYE.closed; f.mouth = 'omega'; f.brow = 0; f.blush = 0.3; break;
      case 'hypnotized': f.mode[0] = f.mode[1] = EYE.open; both(f, 'lid', 0); both(f, 'bot', 0); both(f, 'pw', 0.74); both(f, 'ph', 0.76);
        f.tv = 1; f.noBlink = true; f.mouth = 'ajar'; f.scale = 1.08; f.brow = 0; f.lx[0] = f.lx[1] = 0; f.ly[0] = f.ly[1] = 0.05; break;
      case 'groom': f.mode[0] = f.mode[1] = EYE.closed; f.mouth = (this.at % 1.5) < 0.9 ? 'lick' : 'omega'; f.brow = 0; break;
      case 'hairball': {
        const ph = this.at % 2.0, beat = Math.floor(ph / 0.5), fr = (ph % 0.5) / 0.5;
        f.mode[0] = f.mode[1] = EYE.squeeze; f.mouth = fr > 0.25 && fr < 0.8 ? 'hack' : 'flat'; if (beat === 3 && fr > 0.3) f.mouth = 'hack';
        f.brow = 1; f.browAng[0] = f.browAng[1] = 0.4; break;
      }
      case 'poop': both(f, 'lid', 0.36); both(f, 'bot', 0.1); f.tilt = 0; both(f, 'pw', 0.24); both(f, 'ph', 0.4);
        f.lx[0] = f.lx[1] = 0; f.ly[0] = f.ly[1] = 0; f.noBlink = true; f.mouth = 'flat'; f.brow = 0.6; f.browAng[0] = f.browAng[1] = -0.1; f.blush = 0; break;
      case 'eat': f.mouth = Math.sin(t * 11) > 0 ? 'chomp' : 'omega'; break;
      case 'knead': case 'noodle': both(f, 'lid', 0.56); both(f, 'bot', 0.12); f.mouth = 'omega'; f.blush = 0.6; f.brow = 0; break;
      case 'type': if (face === 'neutral' || face === 'focused') f.mouth = 'blep'; break;
      case 'scratch': if (face === 'neutral') { f.mode[0] = f.mode[1] = EYE.happy; f.mouth = 'smile'; } break;
      case 'tap': if (face === 'neutral') { both(f, 'lid', 0.32); both(f, 'pw', 0.3); f.noBlink = true; f.mouth = 'flat'; } break;
      case 'grabbed': if ((s.wiggle ?? 0) > 0.3) { f.brow = 1; f.browAng[0] = f.browAng[1] = 0.6; f.mouth = 'grr'; f.tilt = 0.6; } break;
      case 'stunned': f.noBlink = false; break;
      default: break;
    }
    if (s.dizzy) { f.mode[0] = f.mode[1] = EYE.spiral; f.mouth = 'derp'; }
    if (a === 'run' && face === 'neutral') { both(f, 'pw', 0.5); both(f, 'ph', 0.56); f.scale = 1.06; }
    // pupils dilate: pounce charge, catnip
    const charge = a === 'pounceCharge' ? clamp(s.pounceCharge ?? 0, 0, 1) : 0;
    if (charge > 0) { const k = 0.5 + charge * 0.25; both(f, 'pw', Math.max(f.pw[0], k)); both(f, 'ph', Math.max(f.ph[0], k + 0.04)); }
    if (s.high && face !== 'derp') { both(f, 'pw', Math.max(f.pw[0], 0.62)); both(f, 'ph', Math.max(f.ph[0], 0.66)); }
    if (s.high && face === 'derp') { f.pw[1] = 0.62; f.ph[1] = 0.66; }
    // talk
    switch (s.talk) {
      case 'meow': f.mouth = 'meow'; if (face === 'neutral') both(f, 'lid', 0.18); break;
      case 'hiss': f.mouth = 'hiss'; both(f, 'pw', 0.09); both(f, 'ph', 0.7); f.brow = 1; f.browAng[0] = f.browAng[1] = 0.8; f.tilt = Math.max(f.tilt, 0.8); break;
      case 'purr': if (a !== 'noodle' && a !== 'knead') { both(f, 'lid', 0.45 + Math.sin(t * 1.3) * 0.15); f.blush = Math.max(f.blush, 0.45); } f.mouth = 'omega'; break;
      case 'chirp': f.mouth = 'o'; f.scale = Math.max(f.scale, 1.08); both(f, 'pw', 0.5); both(f, 'ph', 0.54); break;
      default: break;
    }
    // random blep (idle-ish only, shown, never explained)
    const calm = (a === 'idle' || a === 'loaf' || a === 'sit') && !s.talk && (face === 'neutral' || face === 'sleepy');
    this.blepT -= dt;
    if (this.blepT <= 0) { this.blepT = 12 + Math.random() * 18; if (calm) this.blep = 1.8; }
    if (this.blep > 0) { this.blep -= dt; if (calm) f.mouth = 'blep'; }

    // look: pupils follow lookAt (beyond what the head turned), else idle saccades
    this.saccT -= dt;
    if (this.saccT <= 0) { this.saccT = 0.8 + Math.random() * 2.2; this.saccX = (Math.random() - 0.5) * 0.3; this.saccY = (Math.random() - 0.5) * 0.15; }
    const lookOn = this.hasLook > 0.5 && a !== 'sleep' && a !== 'tossed';
    const px = lookOn ? clamp((this.lookYaw - this.headYaw) * 0.45, -0.32, 0.32) : (a === 'idle' || a === 'loaf' || a === 'sit' ? this.saccX : 0);
    const py = lookOn ? clamp(-(this.lookPitch - this.headPitch) * 0.5, -0.25, 0.25) : (a === 'idle' ? this.saccY : 0);
    if (face !== 'derp' && face !== 'smug' && a !== 'hypnotized' && a !== 'poop') { f.lx[0] += px; f.lx[1] += px; f.ly[0] += py; f.ly[1] += py; }

    // blinks (sometimes the slow one)
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkT = 2.2 + Math.random() * 3.5;
      if (!f.noBlink) { this.blinkLen = Math.random() < 0.15 ? 0.7 : 0.13; this.blink = this.blinkLen; }
      if (a === 'stunned') this.blinkT = 0.25;
    }
    let bk = 0;
    if (this.blink > 0) { this.blink -= dt; bk = Math.sin(clamp(1 - this.blink / this.blinkLen, 0, 1) * Math.PI); }

    // damp current toward target
    const c = this.fc, r = 22;
    for (let e = 0; e < 2; e++) {
      c.lid[e] = damp(c.lid[e], f.lid[e], r, dt);
      c.bot[e] = damp(c.bot[e], f.bot[e], r, dt);
      c.pw[e] = damp(c.pw[e], f.pw[e], 14, dt);
      c.ph[e] = damp(c.ph[e], f.ph[e], 14, dt);
      c.lx[e] = damp(c.lx[e], f.lx[e], 16, dt);
      c.ly[e] = damp(c.ly[e], f.ly[e], 16, dt);
      c.browAng[e] = damp(c.browAng[e], f.browAng[e], r, dt);
      c.browH[e] = damp(c.browH[e], f.browH[e], r, dt);
    }
    c.tilt = damp(c.tilt, f.tilt, r, dt);
    c.scale = damp(c.scale, f.scale, 18, dt);
    c.sparkle = damp(c.sparkle, f.sparkle, 10, dt);
    c.tv = damp(c.tv, f.tv, 8, dt);
    c.brow = damp(c.brow, f.brow, 16, dt);
    c.blush = damp(c.blush, f.blush, 6, dt);

    const u = this.face.u;
    for (let e = 0; e < 2; e++) {
      const lid = Math.max(c.lid[e], bk);
      u.uEyeA.value[e].set(lid, Math.max(c.bot[e], bk * 0.35), c.tilt, f.mode[e]);
      u.uEyeB.value[e].set(c.pw[e], c.ph[e], c.lx[e], c.ly[e]);
      u.uBrow.value[e].set(c.brow, c.browAng[e], c.browH[e], 0);
    }
    u.uEyeC.value.set(c.scale, c.sparkle, c.tv, t);
    u.uMouth.value.x = MOUTH[f.mouth];
    u.uMouth.value.y = c.blush;
  }
}

let faceGeometry: THREE.PlaneGeometry | null = null;
const faceGeo = () => (faceGeometry ??= new THREE.PlaneGeometry(1.2, 1.2));

let preloaded = false;
export function createCat(look: CatLook): CatModelApi {
  if (!hasModel('cat')) throw new Error('[cat] model not loaded');
  if (!preloaded) { preloaded = true; void preloadAccessories(); }
  return new Cat(look);
}
