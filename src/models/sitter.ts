/**
 * Catsitter model: KayKit Rogue (manifest 'sitter') + AnimationMixer with an upper/lower body split,
 * procedural layers on top (IK carry/clap/toss/phone, slip, squash, head look, panic flail),
 * spray bottle / treat bag / phone in the hands, and a canvas face decal.
 *
 * Hierarchy: root (client: position + yaw) > squash (world-up squash, pivot at the feet)
 *   > tilt (slip rotation, pivot at the hips; "model space" for every procedural rotation)
 *   > model (cloned glb) + tool holders + holdAnchor.
 */
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SitterLook, SitterModelApi, SitterVisualState } from '../shared/contracts';
import { cloneModel, getClips, hasModel, modelInfo } from '../assets/loader';
import { outlineMaterial } from '../shared/toon';
import { CELL, paletteFor, type Cell, SITTER_LOOKS, OWNER_LOOKS } from './sitter/looks';
import { SitterFaceDecal } from './sitter/face';

export { SITTER_LOOKS, OWNER_LOOKS };

type Anim = SitterVisualState['anim'];
const HIP = 0.5;           // slip pivot height (m)
const OUTLINE = 0.012;     // m (characters: 0.012..0.02)
// the clips' true ground speeds are 0.6 / 1.2 m/s (chibi legs); matching 3 m/s exactly would be a blur,
// so the legs scurry up to ~2.4x and slide the rest
const WALK_REF = 1.25;     // m/s at walk clip timeScale 1
const RUN_REF = 2.4;       // m/s at run clip timeScale 1
const FADE = 7;            // crossfade rate (1 / seconds)
const UPPER = new Set(['spine', 'chest', 'head', 'upperarml', 'lowerarml', 'wristl', 'handl', 'handslotl',
  'upperarmr', 'lowerarmr', 'wristr', 'handr', 'handslotr']);
/** our clip key -> [manifest clips key, fallback clip name, loop] */
const CLIPS: Record<string, [string, string, boolean]> = {
  idle: ['', 'Idle', true],            // relaxed arms (the manifest's Unarmed_Idle is a boxing stance)
  walk: ['walk', 'Walking_A', true],
  run: ['run', 'Running_A', true],
  jump: ['jump', 'Jump_Start', false],
  fall: ['fall', 'Jump_Idle', true],
  land: ['land', 'Jump_Land', false],
  interact: ['interact', 'Interact', true],
  hit: ['stunned', 'Hit_A', false],
  pickup: ['grabReach', 'PickUp', true],
  crouch: ['scoop', 'PickUp', true],     // PickUp frozen at the bottom: scrub the floor
  cheer: ['celebrate', 'Cheer', true],
  sitDown: ['despair', 'Sit_Floor_Down', false],
  sitIdle: ['despairIdle', 'Sit_Floor_Idle', true],
};

// ---------------------------------------------------------------- shared, built once from the first clone

interface Shared {
  upper: Map<string, THREE.AnimationClip>;
  lower: Map<string, THREE.AnimationClip>;
  headGeo: THREE.BufferGeometry;      // uv remap: baked eyes + brows painted over with skin
  faceGeo: THREE.BufferGeometry;      // decal, in head-bone space
  refV: Map<string, number>;          // mean cell-local v per atlas cell
  shells: Map<string, THREE.BufferGeometry>; // outline geometry per part: welded, smooth normals
}
let shared: Shared | null = null;

function prepare(model: THREE.Group): Shared {
  if (shared) return shared;
  const info = modelInfo('sitter');
  const all = getClips('sitter');
  const upper = new Map<string, THREE.AnimationClip>(), lower = new Map<string, THREE.AnimationClip>();
  for (const [key, [mk, fallback]] of Object.entries(CLIPS)) {
    const name = info?.clips?.[mk] ?? fallback;
    const clip = all.find((c) => c.name === name) ?? all.find((c) => c.name === fallback);
    if (!clip) continue;
    const isUpper = (t: THREE.KeyframeTrack) => UPPER.has(t.name.slice(0, t.name.lastIndexOf('.')));
    upper.set(key, new THREE.AnimationClip(`${key}_U`, clip.duration, clip.tracks.filter(isUpper)));
    lower.set(key, new THREE.AnimationClip(`${key}_L`, clip.duration, clip.tracks.filter((t) => !isUpper(t))));
  }

  const parts = skinnedParts(model);
  const head = parts.find((m) => m.name === (info?.nodes?.head ?? 'Rogue_Head')) ?? parts[0];
  const headBone = model.getObjectByName(info?.nodes?.headBone ?? 'head') as THREE.Bone;

  // mean v per cell (for palette repaint reference)
  const sums = new Map<string, [number, number]>();
  for (const p of parts) {
    const uv = p.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      const k = `${Math.floor(u * 8)},${Math.floor(v * 4)}`;
      const s = sums.get(k) ?? [0, 0];
      s[0] += v * 4 - Math.floor(v * 4); s[1]++;
      sums.set(k, s);
    }
  }
  const refV = new Map([...sums].map(([k, [s, n]]) => [k, s / n]));

  // head: hide baked eyes and brows by pointing their uvs at plain face skin
  const headGeo = head.geometry.clone();
  const pos = headGeo.attributes.position as THREE.BufferAttribute;
  const uv = headGeo.attributes.uv as THREE.BufferAttribute;
  const cellOf = (i: number) => [Math.floor(uv.getX(i) * 8), Math.floor(uv.getY(i) * 4)];
  let fu = 0, fv = 0, fn = 0;
  for (let i = 0; i < pos.count; i++) {
    const [c, r] = cellOf(i);
    if (c === 0 && r === 0 && pos.getZ(i) > 0.4 && pos.getY(i) > 1.55 && pos.getY(i) < 1.75 && Math.abs(pos.getX(i)) < 0.25) {
      fu += uv.getX(i); fv += uv.getY(i); fn++;
    }
  }
  if (fn) { fu /= fn; fv /= fn; } else { fu = 0.05; fv = 0.1; }
  const idx = headGeo.index;
  const tri = idx ? idx.count / 3 : pos.count / 3;
  const vi = (t: number, k: number) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
  for (let t = 0; t < tri; t++) {
    const v = [vi(t, 0), vi(t, 1), vi(t, 2)];
    const cells = v.map(cellOf);
    const isEye = cells.every(([c, r]) => c === CELL.eyes[0] && r === CELL.eyes[1]);
    const isBrow = cells.every(([c, r]) => c === 1 && r === 0) && v.every((i) =>
      pos.getZ(i) > 0.41 && pos.getY(i) > 1.5 && pos.getY(i) < 1.745 && Math.abs(pos.getX(i)) < 0.33);
    if (isEye || isBrow) for (const i of v) uv.setXY(i, fu, fv);
  }
  uv.needsUpdate = true;
  // the baked eyes sit in deep sockets: pull them up to the face surface so no socket walls show
  const nrm = headGeo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ex = (Math.abs(x) - 0.17) / 0.12, ey = (y - 1.605) / 0.085;
    if (z < 0.3 || ex * ex + ey * ey > 1) continue; // inside an eye socket (any cell: eye disc + walls)
    const ax = Math.max(0, Math.abs(x) - 0.2), fz = 0.446 - 9 * ax * ax;
    if (z > fz - 0.002) continue;
    pos.setZ(i, fz);
    _v1.set(Math.sign(x) * 18 * ax, 0, 1).normalize();
    nrm.setXYZ(i, _v1.x, _v1.y, _v1.z);
    if (Math.floor(uv.getX(i) * 8) !== 1) uv.setXY(i, fu, fv);
  }
  pos.needsUpdate = true;
  nrm.needsUpdate = true;

  // face decal conformed to the head front, moved into head-bone space
  const probe = new THREE.Mesh(headGeo);
  probe.updateMatrixWorld(true);
  const faceGeo = new DecalGeometry(probe, new THREE.Vector3(0, 1.54, 0.42), new THREE.Euler(), new THREE.Vector3(0.6, 0.6, 0.44));
  const fp = faceGeo.attributes.position as THREE.BufferAttribute, fnrm = faceGeo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < fp.count; i++) {
    fp.setXYZ(i, fp.getX(i) + fnrm.getX(i) * 0.005, fp.getY(i) + fnrm.getY(i) * 0.005, fp.getZ(i) + fnrm.getZ(i) * 0.005);
  }
  const bi = head.skeleton.bones.indexOf(headBone);
  if (bi >= 0) faceGeo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(head.skeleton.boneInverses[bi], head.bindMatrix));
  faceGeo.computeBoundingSphere();

  // outline shells: split normals crack an inverted hull, so weld by position and smooth
  const shells = new Map<string, THREE.BufferGeometry>();
  for (const p of parts) {
    const src = p === head ? headGeo : p.geometry;
    const g = new THREE.BufferGeometry();
    for (const a of ['position', 'skinIndex', 'skinWeight']) if (src.attributes[a]) g.setAttribute(a, src.attributes[a]);
    if (src.index) g.setIndex(src.index);
    const w = mergeVertices(g, 1e-4);
    w.computeVertexNormals();
    if (p === head && w.index) {
      // no shell over the face front: the recessed eye sockets and the nose would draw ink rings through it
      const wp = w.attributes.position as THREE.BufferAttribute, wi = w.index;
      const keep: number[] = [];
      for (let t = 0; t < wi.count; t += 3) {
        const a = wi.getX(t), b = wi.getX(t + 1), c = wi.getX(t + 2);
        const cx = (wp.getX(a) + wp.getX(b) + wp.getX(c)) / 3, cy = (wp.getY(a) + wp.getY(b) + wp.getY(c)) / 3, cz = (wp.getZ(a) + wp.getZ(b) + wp.getZ(c)) / 3;
        if (!(cz > 0.2 && Math.abs(cx) < 0.3 && cy > 1.26 && cy < 1.8)) keep.push(a, b, c);
      }
      w.setIndex(keep);
    }
    shells.set(p.name, w);
  }

  shared = { upper, lower, headGeo, faceGeo, refV, shells };
  return shared;
}

function skinnedParts(o: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  o.traverse((c) => { if ((c as THREE.SkinnedMesh).isSkinnedMesh) out.push(c as THREE.SkinnedMesh); });
  return out;
}

// ---------------------------------------------------------------- animation layer (weights normalized per layer)

interface Act { a: THREE.AnimationAction; w: number; t: number; loop: boolean }
class Layer {
  readonly acts = new Map<string, Act>();
  constructor(mixer: THREE.AnimationMixer, clips: Map<string, THREE.AnimationClip>) {
    for (const [k, c] of clips) {
      const a = mixer.clipAction(c);
      const loop = CLIPS[k][2];
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = true;
      this.acts.set(k, { a, w: 0, t: 0, loop });
    }
    const idle = this.acts.get('idle');
    if (idle) { idle.w = 1; idle.a.play(); }
  }
  clear() { for (const s of this.acts.values()) s.t = 0; }
  want(k: string, w = 1) { const s = this.acts.get(k); if (s) s.t += w; }
  restart(k: string, time = 0) {
    const s = this.acts.get(k);
    if (!s) return;
    s.a.reset();
    s.a.time = time;
    s.a.play();
  }
  speed(k: string, ts: number) { const s = this.acts.get(k); if (s) s.a.timeScale = ts; }
  step(dt: number) {
    let sum = 0;
    for (const s of this.acts.values()) {
      const d = s.t - s.w;
      s.w = Math.abs(d) <= dt * FADE ? s.t : s.w + Math.sign(d) * dt * FADE;
      sum += s.w;
    }
    for (const s of this.acts.values()) {
      if (s.w <= 0) { if (s.a.isScheduled()) s.a.stop(); continue; }
      if (!s.a.isScheduled()) s.a.play();
      s.a.setEffectiveWeight(s.w / sum);
    }
  }
}

// ---------------------------------------------------------------- helpers (module scratch, no per-frame allocs)

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _v7 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _qm = new THREE.Quaternion();
const _qmi = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qid = new THREE.Quaternion(), _qp = new THREE.Quaternion();
const _e = new THREE.Euler();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a: number, b: number, k: number, dt: number) => b + (a - b) * Math.exp(-k * dt);

/** rotate a bone by a model-space rotation (modelQ / modelQ^-1 must be current) */
function rotModel(bone: THREE.Object3D, q: THREE.Quaternion) {
  _q1.copy(_qm).multiply(q).multiply(_qmi);         // -> world
  bone.parent!.getWorldQuaternion(_q2);
  _qp.copy(_q2).invert();
  _q1.premultiply(_qp).multiply(_q2);               // -> parent space
  bone.quaternion.premultiply(_q1);
}
function rotAxis(bone: THREE.Object3D, axis: THREE.Vector3, angle: number) {
  if (angle === 0) return;
  rotModel(bone, _qa.setFromAxisAngle(axis, angle));
}
/** world-space rotation from a to b applied to a bone, blended by weight */
function rotWorldTo(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, weight: number) {
  _qa.setFromUnitVectors(from, to);
  if (weight < 1) _qa.slerpQuaternions(_qid, _qa.clone(), weight);
  bone.parent!.getWorldQuaternion(_q2);
  _qp.copy(_q2).invert();
  bone.getWorldQuaternion(_q3);
  bone.quaternion.copy(_qp.multiply(_qa).multiply(_q3));
}

interface Arm { upper: THREE.Bone; lower: THREE.Bone; wrist: THREE.Bone; hand: THREE.Bone; slot: THREE.Object3D; axis: 'x' | 'y' | 'z'; side: 1 | -1 }

// ---------------------------------------------------------------- factory

export function createSitter(look: SitterLook): SitterModelApi {
  if (!hasModel('sitter')) throw new Error('sitter model not loaded');
  const model = cloneModel('sitter');
  const S = prepare(model);
  const info = modelInfo('sitter');

  const root = new THREE.Group();
  root.name = 'sitter';
  const squash = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.position.y = HIP;
  model.position.y = -HIP;
  root.add(squash);
  squash.add(tilt);
  tilt.add(model);

  const bone = (n: string) => model.getObjectByName(n) as THREE.Bone;
  const bones: THREE.Bone[] = [];
  model.traverse((o) => { if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone); });
  // pure animated pose from the last mixer.update. The mixer only writes values that changed, so we restore this
  // (not the rest pose) before each update, then snapshot again before the procedural pass.
  const animPose = bones.map((b) => [b.position.clone(), b.quaternion.clone(), b.scale.clone()] as const);
  const B = {
    hips: bone('hips'), spine: bone('spine'), chest: bone('chest'), head: bone(info?.nodes?.headBone ?? 'head'),
    legL: bone('upperlegl'), legR: bone('upperlegr'), shinL: bone('lowerlegl'), shinR: bone('lowerlegr'),
  };
  const mkArm = (s: 'l' | 'r'): Arm => {
    const upper = bone(`upperarm${s}`), lower = bone(`lowerarm${s}`);
    const p = lower.position, ax = Math.abs(p.x) > Math.abs(p.y) ? (Math.abs(p.x) > Math.abs(p.z) ? 'x' : 'z') : Math.abs(p.y) > Math.abs(p.z) ? 'y' : 'z';
    return { upper, lower, wrist: bone(`wrist${s}`), hand: bone(`hand${s}`), slot: model.getObjectByName(`handslot${s}`) ?? bone(`hand${s}`), axis: ax, side: s === 'l' ? 1 : -1 };
  };
  const armL = mkArm('l'), armR = mkArm('r');
  const missing = [...Object.entries(B), ...['upper', 'lower', 'wrist', 'hand'].flatMap((k) => [[`${k}L`, armL[k as keyof Arm]], [`${k}R`, armR[k as keyof Arm]]])]
    .filter(([, b]) => !b).map(([k]) => k);
  if (missing.length) throw new Error(`sitter rig is missing bones: ${missing.join(', ')}`); // registry falls back to the placeholder

  // materials: one per instance, palette per look (cached), outlines on every skinned part
  const parts = skinnedParts(model);
  const baseMat = parts[0].material as THREE.MeshToonMaterial;
  const mat = baseMat.clone();
  const refV = (c: Cell) => S.refV.get(`${c[0]},${c[1]}`) ?? 0.4;
  let owner = false; // owners (end show) carry no sitter tools
  const applyLook = (l: SitterLook) => {
    if (baseMat.map) mat.map = paletteFor(baseMat.map, l, refV);
    owner = OWNER_LOOKS.some((o) => o.name === l.name || (o.skin === l.skin && o.hair === l.hair && o.shirt === l.shirt));
  };
  applyLook(look);
  for (const p of parts) {
    p.material = mat;
    p.frustumCulled = false;
    if (p.name === (info?.nodes?.head ?? 'Rogue_Head')) p.geometry = S.headGeo;
    const shell = new THREE.SkinnedMesh(S.shells.get(p.name) ?? p.geometry, outlineMaterial(OUTLINE / (info?.scale[1] ?? 0.8)));
    shell.name = 'outline';
    shell.bind(p.skeleton, p.bindMatrix);
    shell.frustumCulled = false;
    shell.castShadow = false;
    shell.raycast = () => {};
    p.parent!.add(shell);
  }

  // face
  const face = new SitterFaceDecal(S.faceGeo);
  B.head.add(face.mesh);
  let browColor = '';
  const setBrow = (l: SitterLook) => { browColor = '#' + new THREE.Color(l.hair).lerp(new THREE.Color('#2b1d18'), 0.35).getHexString(); };
  setBrow(look);

  // tools: holders live in model space (tilt) and follow the hands, so they never inherit arm stretch
  const holder = () => { const g = new THREE.Group(); tilt.add(g); return g; };
  const bottleH = holder(), bagH = holder(), phoneH = holder();
  const sprayNozzle = new THREE.Object3D();
  sprayNozzle.name = 'sprayNozzle';
  let bottle: THREE.Object3D | null = null, bag: THREE.Object3D | null = null;
  if (hasModel('sprayBottle')) {
    bottle = cloneModel('sprayBottle');
    bottle.position.set(0, 0.0, 0.045);   // grip at the neck: body below the mitten, trigger head above it
    bottle.scale.setScalar(1.5);           // toy-sized for the chunky mittens
    bottle.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.Material).name === 'spray_bottle') m.material = waterBottleMat(m.material as THREE.MeshToonMaterial);
    });
    bottleH.add(bottle);
  }
  sprayNozzle.position.set(0, 0.155, 0.15);
  bottleH.add(sprayNozzle);
  if (hasModel('treatBag')) {
    bag = cloneModel('treatBag');
    bag.position.set(0, -0.12, 0.03);
    bag.scale.setScalar(1.25);
    bagH.add(bag);
  }
  bagH.visible = false;
  if (hasModel('phone')) {
    const ph = cloneModel('phone');
    ph.rotation.x = -Math.PI / 2; // upright, screen toward the face
    ph.scale.setScalar(1.5);
    ph.position.set(0, 0.1, 0.03); // sticks up out of the mitten
    phoneH.add(ph);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#fff6d8', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(0.26);
  glow.position.set(0.02, 0.2, 0.05);
  phoneH.add(glow);
  phoneH.visible = false;

  const holdAnchor = new THREE.Object3D();
  holdAnchor.name = 'holdAnchor';
  tilt.add(holdAnchor);

  // ---------------------------------------------------------------- animation state
  const mixer = new THREE.AnimationMixer(model);
  const lower = new Layer(mixer, S.lower), upper = new Layer(mixer, S.upper);
  let anim: Anim = 'idle', animT = 0, time = 0;
  let sq = 0, sqV = 0, wasGrounded = true, airVy = 0;
  let recoil = 0, carryW = 0, phoneW = 0, flailW = 0, sprayW = 0, treatW = 0, wagW = 0;
  let headYaw = 0, headPitch = 0, lookX = 0, lookY = 0;
  let blinkT = 2 + Math.random() * 3, blinkDur = 0, jitter = 0, jitterT = 0;
  let slipKick = false, clapHit = [false, false], handSq = 0;
  const sitDownDur = S.lower.get('sitDown')?.duration ?? 1;

  function enter(a: Anim) {
    animT = 0;
    switch (a) {
      case 'jump': lower.restart('jump'); upper.restart('jump'); break;
      case 'land': lower.restart('land'); upper.restart('land'); break;
      case 'stunned': lower.restart('hit'); upper.restart('hit'); break;
      case 'despair': lower.restart('sitDown'); upper.restart('sitDown'); break;
      case 'grabReach':
        for (const L of [lower, upper]) { const s = L.acts.get('pickup'); s?.a.setLoop(THREE.LoopOnce, 1); L.restart('pickup', 0.2); }
        break;
      case 'scoop':
        for (const L of [lower, upper]) { L.acts.get('pickup')?.a.setLoop(THREE.LoopRepeat, Infinity); L.restart('pickup', 0.3); }
        break;
      case 'clean': lower.restart('crouch', 0.55); upper.restart('crouch', 0.55); break;
      case 'spray': recoil = 1; break;
      case 'slip': slipKick = false; break;
      case 'clap': clapHit = [false, false]; break;
    }
  }

  function loco(L: Layer, speed: number) {
    const idle = 1 - smooth(0.15, 0.7, speed);
    const run = smooth(3.3, 4.4, speed);
    L.want('idle', idle);
    L.want('walk', (1 - idle) * (1 - run));
    L.want('run', (1 - idle) * run);
    L.speed('walk', clamp(speed / WALK_REF, 0.7, 2.4));
    L.speed('run', clamp(speed / RUN_REF, 0.8, 2.3));
  }

  // two-bone IK toward a target in feet space (model space, y from the floor), with up to `stretch` noodle-arm lengthening
  function ik(arm: Arm, target: THREE.Vector3, pole: THREE.Vector3, w: number, stretch = 1.3) {
    if (w <= 0.001) return;
    const T = tilt.localToWorld(_v4.copy(target).setY(target.y - HIP));
    const P = tilt.localToWorld(_v5.copy(pole).setY(pole.y - HIP));
    const Sx = arm.upper.getWorldPosition(_v1);
    const E = arm.lower.getWorldPosition(_v2);
    const W = arm.wrist.getWorldPosition(_v3);
    let a = Sx.distanceTo(E), b = E.distanceTo(W);
    const d = Sx.distanceTo(T);
    if (d > (a + b) * 0.98 && stretch > 1) {
      const s = 1 + (Math.min(d / ((a + b) * 0.98), stretch) - 1) * w;
      arm.upper.scale[arm.axis] *= s;
      a *= s; b *= s;
      arm.lower.getWorldPosition(E);
      arm.wrist.getWorldPosition(W);
    }
    const dc = clamp(d, Math.abs(a - b) + 1e-3, (a + b) * 0.999);
    const dir = _v6.subVectors(T, Sx).normalize();
    const n = _v7.subVectors(P, Sx);
    n.addScaledVector(dir, -n.dot(dir));
    if (n.lengthSq() < 1e-8) n.set(0, -1, 0);
    n.normalize();
    const cosA = clamp((a * a + dc * dc - b * b) / (2 * a * dc), -1, 1);
    const Ed = _v5.copy(Sx).addScaledVector(dir, a * cosA).addScaledVector(n, a * Math.sqrt(1 - cosA * cosA));
    // upper: current elbow dir -> desired elbow dir
    rotWorldTo(arm.upper, E.sub(Sx).normalize(), Ed.sub(Sx).normalize(), w);
    // lower: current wrist dir -> target dir
    arm.lower.getWorldPosition(E);
    arm.wrist.getWorldPosition(W);
    rotWorldTo(arm.lower, W.sub(E).normalize(), T.sub(E).normalize(), w);
  }

  const handPos = (arm: Arm, out: THREE.Vector3) => tilt.worldToLocal(arm.slot.getWorldPosition(out));
  const toolAt = (h: THREE.Object3D, arm: Arm) => handPos(arm, h.position);

  // carry / toss targets (model space, right hand)
  const CARRY = new THREE.Vector3(-0.56, 1.1, 0.42);
  const TOSS = [CARRY, new THREE.Vector3(-0.34, 0.5, -0.08), new THREE.Vector3(-0.3, 1.2, 0.5), new THREE.Vector3(-0.26, 1.34, 0.42)];
  const TOSS_T = [0, 0.12, 0.26, 0.4];
  const target = new THREE.Vector3(), pole = new THREE.Vector3(), tmpT = new THREE.Vector3();

  function update(dt: number, s: SitterVisualState) {
    dt = Math.min(dt, 0.1);
    time += dt;
    if (s.anim !== anim) { anim = s.anim; enter(anim); } else animT += dt;

    // ------------------------------------------------ mixer layers
    for (let i = 0; i < bones.length; i++) {
      const [p, q, sc] = animPose[i];
      bones[i].position.copy(p); bones[i].quaternion.copy(q); bones[i].scale.copy(sc);
    }
    lower.clear(); upper.clear();
    const both = (k: string) => { lower.want(k); upper.want(k); };
    switch (anim) {
      case 'jump': both('jump'); break;
      case 'fall': case 'slip': both('fall'); break;
      case 'land': both('land'); break;
      case 'stunned': both('hit'); break;
      case 'celebrate': both('cheer'); break;
      case 'despair': both(animT < sitDownDur - 0.12 ? 'sitDown' : 'sitIdle'); break;
      case 'grabReach': both('pickup'); lower.speed('pickup', 1.8); upper.speed('pickup', 1.8); break;
      case 'scoop': both('pickup'); lower.speed('pickup', 1.1); upper.speed('pickup', 1.1); break;
      case 'clean': both('crouch'); lower.speed('crouch', 0); upper.speed('crouch', 0); break;
      case 'interact': both('interact'); break;
      default: loco(lower, s.speed); loco(upper, s.speed);
    }
    lower.step(dt); upper.step(dt);
    for (const [k, la] of lower.acts) { // keep shared clips in phase across layers
      const ua = upper.acts.get(k);
      if (ua && la.w > 0 && ua.w > 0) ua.a.time = la.a.time;
    }
    mixer.update(dt);
    for (let i = 0; i < bones.length; i++) {
      const [p, q, sc] = animPose[i];
      p.copy(bones[i].position); q.copy(bones[i].quaternion); sc.copy(bones[i].scale);
    }

    // ------------------------------------------------ body: squash, slip tilt
    if (!s.grounded) airVy = Math.min(airVy, s.vy);
    if (s.grounded && !wasGrounded && airVy < -1.2) sqV += Math.min(2, -airVy * 0.4);
    if (s.grounded) airVy = 0;
    wasGrounded = s.grounded;
    const sqTarget = !s.grounded && anim !== 'slip' ? (s.vy > 0 ? -0.07 : -0.03) : 0;
    let slipTheta = 0, slipLift = 0;
    if (anim === 'slip') {
      const t = animT;
      if (t < 0.25) { const k = t / 0.25; slipTheta = -1.5 * k * k; slipLift = -0.2 * k * k; }
      else if (t < 0.9) { slipTheta = -1.5 + Math.sin(t * 20) * 0.04; slipLift = -0.22; if (!slipKick) { slipKick = true; sqV += 2.4; } }
      else { const k = smooth(0.9, 1.2, t); slipTheta = -1.5 * (1 - k) + Math.sin(k * Math.PI) * 0.25; slipLift = -0.22 * (1 - k) + Math.sin(k * Math.PI) * 0.12; }
    }
    sqV += ((sqTarget - sq) * 190 - sqV * 13) * dt;
    sq = clamp(sq + sqV * dt, -0.25, 0.3);
    squash.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    tilt.rotation.x = slipTheta;
    tilt.position.set(0, HIP + slipLift, -slipTheta * 0.12);
    tilt.updateMatrixWorld(true);
    tilt.getWorldQuaternion(_qm);
    _qmi.copy(_qm).invert();

    // ------------------------------------------------ spine + head
    const carrying = s.carrying && anim !== 'toss' && anim !== 'slip' && anim !== 'despair' && anim !== 'celebrate' && anim !== 'stunned';
    carryW = damp(carryW, carrying ? 1 : 0, 14, dt);
    const elev = clamp(0.2 - s.aimPitch, -0.6, 0.8);
    let lean = 0;
    if (anim === 'spray') lean += -elev * 0.25 - recoil * 0.08;
    lean += -0.14 * carryW;
    const panicRun = s.face === 'panic' && s.speed > 2.5 && !carrying && (anim === 'idle' || anim === 'walk' || anim === 'run');
    if (panicRun) lean += 0.12;
    if (anim === 'toss') lean += animT < 0.14 ? -0.15 * smooth(0, 0.12, animT) : 0.2 * smooth(0.12, 0.26, animT) * (1 - smooth(0.3, 0.4, animT));
    rotAxis(B.spine, X, lean);
    if (carryW > 0.01) { // hold it out to the side and lean away from it
      rotAxis(B.spine, Y, -0.28 * carryW);
      rotAxis(B.spine, Z, -0.09 * carryW);
    }

    // head: look target (world) or the carried cat, else forward
    let wantYaw = 0, wantPitch = 0;
    const look = s.lookAt ?? (carryW > 0.5 ? holdAnchor.getWorldPosition(_v1).add(_v2.set(0, -0.15, 0)) : null);
    if (look) {
      const hp = tilt.worldToLocal(B.head.getWorldPosition(_v2));
      const lp = tilt.worldToLocal(_v3.copy(look));
      lp.sub(hp);
      wantYaw = clamp(Math.atan2(lp.x, lp.z), -1.1, 1.1);
      wantPitch = clamp(-Math.atan2(lp.y, Math.hypot(lp.x, lp.z)), -0.6, 0.6);
    } else if (anim === 'idle') {
      wantYaw = Math.sin(time * 0.37) * Math.sin(time * 0.23) * 0.35; // idle glance
    }
    if (anim === 'despair') { wantPitch = 0.45; wantYaw = Math.sin(time * 1.8) * 0.3; }
    if (anim === 'slip') { wantYaw = 0; wantPitch = -0.3; }
    headYaw = damp(headYaw, wantYaw, 8, dt);
    headPitch = damp(headPitch, wantPitch, 8, dt);
    _q1.setFromEuler(_e.set(headPitch * 0.75, headYaw * 0.8, anim === 'stunned' ? Math.sin(time * 11) * 0.22 : 0, 'YXZ'));
    rotModel(B.head, _q3.copy(_q1));
    // walk head bob
    const walkS = lower.acts.get('walk'), runS = lower.acts.get('run');
    if (walkS && walkS.w > 0.2) rotAxis(B.head, X, Math.sin((walkS.a.time / walkS.a.getClip().duration) * Math.PI * 4) * 0.05 * walkS.w);
    if (runS && runS.w > 0.2) rotAxis(B.head, X, Math.sin((runS.a.time / runS.a.getClip().duration) * Math.PI * 4) * 0.07 * runS.w);

    // ------------------------------------------------ arms
    recoil *= Math.exp(-dt * 9);
    // spray: right arm straight out along the aim, kicked up by the recoil
    sprayW = damp(sprayW, anim === 'spray' ? 1 : 0, anim === 'spray' ? 30 : 7, dt);
    if (sprayW > 0.01) {
      target.set(-0.32, 0.94 + Math.sin(elev) * 0.5 + recoil * 0.07, -0.02 + Math.cos(elev) * 0.48 - recoil * 0.1);
      pole.set(-0.9, 0.3, -0.4);
      ik(armR, target, pole, sprayW, 1.25);
    }
    // treats: bag held up by the face and shaken hard
    treatW = damp(treatW, anim === 'shakeTreats' ? 1 : 0, 14, dt);
    if (treatW > 0.01) {
      target.set(-0.46, 1.16 + Math.sin(time * 48) * 0.04, 0.3); // out to the side: visible past the head
      pole.set(-0.9, -0.3, -0.3);
      ik(armR, target, pole, treatW, 1.35);
    }
    if (anim === 'clean') {
      rotAxis(armR.upper, X, Math.sin(time * 10) * 0.3);
      rotAxis(armR.upper, Z, Math.cos(time * 10) * 0.3);
    }
    // panic flail: both hands up over the head, waving
    flailW = damp(flailW, panicRun ? 1 : 0, 8, dt);
    if (flailW > 0.01) {
      for (const arm of [armL, armR]) {
        const ph = time * 15 + (arm.side > 0 ? 0 : 2.2);
        target.set(arm.side * (0.42 + Math.cos(ph) * 0.08), 1.62 + Math.sin(ph) * 0.14, 0.1);
        pole.set(arm.side * 1.2, 1.0, -0.4);
        ik(arm, target, pole, flailW, 1.4);
      }
    }
    // carry: right arm out front at (noodle) arm's length, holding the cat up like evidence
    if (carryW > 0.01) {
      const ws = lower.acts.get('walk');
      const bob = ws && ws.w > 0 ? Math.sin((ws.a.time / ws.a.getClip().duration) * Math.PI * 4) * 0.025 * ws.w : 0;
      target.copy(CARRY).add(_v1.set(Math.sin(time * 1.3) * 0.015, bob + Math.sin(time * 2.1) * 0.01, 0));
      pole.copy(target).add(_v1.set(-0.6, -1, -0.4));
      ik(armR, target, pole, carryW, 1.45);
      // every few seconds the free hand wags the spray bottle at the cat
      const c = time % 3.4;
      wagW = carryW * smooth(0, 0.18, c) * (1 - smooth(0.95, 1.2, c)) * (1 - phoneW);
      if (wagW > 0.01) {
        target.set(0.1 + Math.sin(time * 15) * 0.05, 1.06, 0.38);
        pole.set(0.9, -0.2, -0.3);
        ik(armL, target, pole, wagW, 1.35);
      }
    } else wagW = 0;
    if (anim === 'toss') {
      const t = Math.min(animT, 0.4);
      let i = 0;
      while (i < TOSS_T.length - 2 && t > TOSS_T[i + 1]) i++;
      const k = smooth(TOSS_T[i], TOSS_T[i + 1], t);
      tmpT.lerpVectors(TOSS[i], TOSS[i + 1], k);
      pole.copy(tmpT).add(_v1.set(-0.7, -0.6, -0.5));
      ik(armR, tmpT, pole, 1 - smooth(0.3, 0.45, animT), 1.3);
    }
    // clap: both mittens in front of the face, contact at 0.15 s and 0.3 s
    if (anim === 'clap') {
      const t = animT;
      const w = smooth(0, 0.07, t) * (1 - smooth(0.4, 0.5, t));
      const sep = t < 0.15 ? 0.17 - 0.135 * smooth(0.06, 0.15, t) : t < 0.3 ? 0.035 + 0.115 * Math.sin(((t - 0.15) / 0.15) * Math.PI) : 0.035;
      for (const [i, at] of [0.15, 0.3].entries()) if (!clapHit[i] && t >= at) { clapHit[i] = true; handSq = 1; }
      for (const arm of [armL, armR]) {
        target.set(arm.side * sep, 1.0, 0.4);
        pole.set(arm.side * 0.9, 0.2, -0.3);
        ik(arm, target, pole, w, 1.45);
      }
    }
    handSq *= Math.exp(-dt * 16);
    // phone flashlight: left hand up in front of the chest, screen toward the face
    phoneW = damp(phoneW, s.flashlight && anim !== 'clap' && anim !== 'slip' ? 1 : 0, 10, dt);
    if (phoneW > 0.01) {
      target.set(0.2, 1.02 + elev * 0.12, 0.34);
      pole.set(0.9, 0.3, -0.3);
      ik(armL, target, pole, phoneW, 1.3);
    }
    // slip: windmill, then legs kick in the air, then scramble
    if (anim === 'slip') {
      const t = animT;
      const flail = t < 0.9 ? 1 : 1 - smooth(0.9, 1.15, t);
      for (const arm of [armL, armR]) { // windmill: hands circle beside the body
        const ph = t * (t < 0.25 ? 26 : 16) + (arm.side > 0 ? 0 : Math.PI);
        target.set(arm.side * 0.5, 1.12 + Math.sin(ph) * 0.3, Math.cos(ph) * 0.3);
        pole.set(arm.side * 1.2, 1.0, -0.6);
        ik(arm, target, pole, flail, 1.35);
      }
      const shoot = t < 0.3 ? smooth(0, 0.22, t) : 1 - smooth(0.3, 0.45, t); // feet shoot forward
      const kick = smooth(0.2, 0.32, t) * (1 - smooth(0.85, 1.05, t));    // then bicycle in the air
      for (const [leg, shin, ph] of [[B.legL, B.shinL, 0], [B.legR, B.shinR, Math.PI]] as const) {
        rotAxis(leg, X, -shoot * 0.9 - kick * (1.15 + Math.sin(t * 22 + ph) * 0.5));
        rotAxis(shin, X, kick * (0.55 + Math.sin(t * 22 + ph + 1.3) * 0.55));
      }
    }
    if (handSq > 0.01) {
      for (const arm of [armL, armR]) arm.hand.scale.multiplyScalar(1 + handSq * 0.18);
    }

    // ------------------------------------------------ tools
    const treats = anim === 'shakeTreats';
    const leftBusy = phoneW > 0.5;
    const bottleArm = carrying || treats || anim === 'toss' ? (leftBusy ? null : armL) : armR;
    const bottleOn = !!bottle && bottleArm !== null && anim !== 'clap' && !owner;
    bottleH.visible = bottleOn;
    if (bottleOn) {
      toolAt(bottleH, bottleArm!);
      const aim = anim === 'spray' ? elev + recoil * 0.6 : 0;
      bottleH.quaternion.setFromEuler(_e.set(-aim - wagW * 0.5, bottleArm === armL ? 0.3 - wagW * 1.1 : 0, 0));
      bottleH.scale.set(1, 1 - recoil * 0.12, 1);
    } else {
      bottleH.position.set(0.15, 0.95, 0.25); // keep the nozzle somewhere sane while hidden
    }
    bagH.visible = treats && !!bag && !owner;
    if (bagH.visible) {
      toolAt(bagH, armR);
      bagH.quaternion.setFromEuler(_e.set(Math.sin(time * 42) * 0.25, 0, Math.sin(time * 21) * 0.2));
    }
    phoneH.visible = phoneW > 0.3 && !owner;
    if (phoneH.visible) {
      toolAt(phoneH, armL);
      phoneH.quaternion.setFromEuler(_e.set(-elev * 0.5, -0.15, 0));
      glow.material.opacity = 0.65 + Math.sin(time * 9) * 0.05;
    }
    handPos(armR, holdAnchor.position);

    // ------------------------------------------------ face
    if ((blinkT -= dt) <= 0) { blinkDur = 0.12; blinkT = 1.8 + Math.random() * 3.5; }
    blinkDur -= dt;
    if ((jitterT -= dt) <= 0) { jitter++; jitterT = 1 / 14; }
    lookX = damp(lookX, clamp(headYaw / 1.1, -1, 1), 10, dt);   // viewer's right = character's left (+X)
    lookY = damp(lookY, clamp(-headPitch / 0.6, -1, 1), 10, dt);
    face.set({ face: s.face, blink: blinkDur > 0 ? 1 : 0, lx: lookX, ly: lookY, brow: browColor, jitter });
  }

  /** test hook (preview / console), not part of the contract */
  const debug = () => ({
    anim, animT, sq, carryW, flailW, headYaw, headPitch,
    hand: holdAnchor.position.toArray().map((v) => +v.toFixed(3)),
    weights: [...lower.acts, ...upper.acts].filter(([, a]) => a.w > 0).map(([k, a]) => `${k}:${a.w.toFixed(2)}`),
  });
  const api: SitterModelApi & { debug: typeof debug } = {
    root, holdAnchor, sprayNozzle, debug,
    setLook(l: SitterLook) { applyLook(l); setBrow(l); },
    update,
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      face.dispose();
      mat.dispose();
      (glow.material as THREE.SpriteMaterial).dispose();
      root.removeFromParent();
    },
  };
  return api;
}

let bottleMat: THREE.MeshToonMaterial | null = null;
/** the downloaded bottle is pale green; tint it water blue so it reads as a spray bottle at a glance */
function waterBottleMat(src: THREE.MeshToonMaterial) {
  bottleMat ??= Object.assign(src.clone(), { name: 'spray_bottle_blue' });
  bottleMat.color.set('#7cc7ea');
  return bottleMat;
}

let glowTexture: THREE.Texture | null = null;
function glowTex(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,240,1)');
  r.addColorStop(0.25, 'rgba(255,245,200,0.6)');
  r.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}
