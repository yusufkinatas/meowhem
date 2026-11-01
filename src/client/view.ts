/**
 * Client entity views: character models, props, mess. Remote entities are interpolated ~100 ms behind.
 * Visual states (anim/face) are derived from replicated character state.
 */
import * as THREE from 'three';
import type {
  CatAnim, CatFace, CatModelApi, CatVisualState, MessKind, PropKind, SitterModelApi, SitterVisualState, Vec3,
} from '../shared/contracts';
import { createCatModel, createSitterModel, createPropMesh, createMessMesh } from '../registry';
import { lerpAngle } from '../core/math';
import type { CharState, Mess, PlayerInfo, PropSnap } from '../core/types';

interface Sample { t: number; p: Vec3; r: number[] }

/** tiny per-entity sample buffer */
class Track {
  s: Sample[] = [];
  push(t: number, p: Vec3, r: number[]) {
    const last = this.s[this.s.length - 1];
    if (last && t <= last.t) { last.p = p; last.r = r; return; }
    this.s.push({ t, p, r });
    if (this.s.length > 8) this.s.shift();
  }
  /** writes position into outP, returns rotation (yaw or quat) */
  sample(rt: number, outP: THREE.Vector3, yawMode: boolean): number[] {
    const s = this.s;
    if (!s.length) return [0];
    if (rt <= s[0].t || s.length === 1) { outP.set(...s[0].p); return s[0].r; }
    for (let i = s.length - 1; i > 0; i--) {
      const a = s[i - 1], b = s[i];
      if (rt >= a.t) {
        if (rt >= b.t) { outP.set(...b.p); return b.r; }
        const k = (rt - a.t) / (b.t - a.t);
        outP.set(a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k);
        if (yawMode) return [lerpAngle(a.r[0], b.r[0], k)];
        _qa.set(a.r[0], a.r[1], a.r[2], a.r[3]).slerp(_qb.set(b.r[0], b.r[1], b.r[2], b.r[3]), k);
        return [_qa.x, _qa.y, _qa.z, _qa.w];
      }
    }
    outP.set(...s[s.length - 1].p);
    return s[s.length - 1].r;
  }
}
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

export interface CharView {
  id: string;
  info: PlayerInfo;
  cat: CatModelApi | null;
  sitter: SitterModelApi | null;
  root: THREE.Group;
  track: Track;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  yaw: number;
  speed: number;
  vy: number;
  grounded: boolean;
  head: THREE.Vector3;
}

export function catVisual(s: CharState, speed: number, vy: number, grounded: boolean): CatVisualState {
  const st = s.st;
  let anim: CatAnim = 'idle';
  if (s.grabbedBy) anim = 'grabbed';
  else if (st.caged) anim = 'caged';
  else if (st.fight) anim = 'fight';
  else if (st.hypnotized) anim = 'hypnotized';
  else if (st.stunned) anim = 'stunned';
  else if (st.hairball) anim = 'hairball';
  else if (st.eating) anim = 'eat';
  else if (s.work?.anim) anim = s.work.anim as CatAnim;
  else if (s.charge > 0) anim = 'pounceCharge';
  else if (!grounded) anim = vy > 0 ? 'jump' : 'fall';
  else if (s.gest === 'swipe') anim = 'swipe';
  else if (st.sleep && speed < 0.25) anim = 'sleep';
  else if (s.loaf) anim = st.sleep ? 'sleep' : 'loaf';
  else if (speed > 4) anim = 'run';
  else if (speed > 0.25) anim = s.item ? 'carryMouth' : 'walk';
  else if (st.treat) anim = 'sit';
  let face: CatFace = 'neutral';
  if (s.gest === 'hiss') face = 'angry';
  else if (s.grabbedBy) face = 'unimpressed';
  else if (st.flehmen) face = 'flehmen';
  else if (st.catnip) face = 'derp';
  else if (st.stunned || st.fight) face = 'shock';
  else if (st.hypnotized) face = 'love';
  else if (s.work?.face) face = s.work.face as CatFace;
  else if (s.charge > 0) face = 'focused';
  else if (st.wet) face = 'sad';
  else if (st.crown) face = 'smug';
  else if (st.treat || st.eating || st.fed) face = 'happy';
  else if (s.loaf) face = 'sleepy';
  const talk = s.gest === 'meow' ? 'meow' : s.gest === 'hiss' ? 'hiss' : s.loaf && st.fed ? 'purr' : null;
  return {
    anim, face, speed, vy, grounded,
    wet: Math.min(1, (st.wet ?? 0) / 2),
    puffed: s.gest === 'hiss' || !!st.fight,
    high: !!st.catnip,
    talk,
    lookAt: s.lookAt ? new THREE.Vector3(...s.lookAt) : null,
    dizzy: !!st.dizzy,
    pounceCharge: s.charge,
    wiggle: s.gest === 'mash' ? 1 : 0,
    carrying: s.item === 'salmon' || s.item === 'toyMouse' || s.item === 'sock' ? s.item : null,
  };
}

export function sitterVisual(s: CharState, speed: number, vy: number, grounded: boolean, ctx: { meter: number; ended: 'win' | 'lose' | null; dark: boolean; aimPitch: number }): SitterVisualState {
  const st = s.st;
  let anim: SitterVisualState['anim'] = 'idle';
  if (ctx.ended) anim = ctx.ended === 'win' ? 'celebrate' : 'despair';
  else if (st.stunned) anim = 'stunned';
  else if (s.gest === 'spray') anim = 'spray';
  else if (s.gest === 'treats') anim = 'shakeTreats';
  else if (s.holding) anim = 'carry';
  else if (s.work?.anim) anim = s.work.anim as SitterVisualState['anim'];
  else if (!grounded) anim = vy > 0 ? 'jump' : 'fall';
  else if (st.panic) anim = 'despair';
  else if (speed > 3.6) anim = 'run';
  else if (speed > 0.25) anim = 'walk';
  let face: SitterVisualState['face'] = 'neutral';
  if (ctx.ended) face = ctx.ended === 'win' ? 'happy' : 'shock';
  else if (s.work?.face) face = s.work.face as SitterVisualState['face'];
  else if (st.panic) face = 'panic';
  else if (st.smug) face = 'smug';
  else if (st.tired) face = 'tired';
  else if (s.gest === 'spray') face = 'angry';
  else if (st.stunned) face = 'shock';
  else if (ctx.meter > 75) face = 'panic';
  return {
    anim, face, speed, vy, grounded, carrying: !!s.holding, flashlight: ctx.dark, aimPitch: ctx.aimPitch,
    lookAt: null,
  };
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Views {
  readonly chars = new Map<string, CharView>();
  readonly props = new Map<number, { obj: THREE.Object3D; track: Track; kind: PropKind; fallen: boolean }>();
  readonly mess = new Map<number, { obj: THREE.Object3D; m: Mess }>();
  readonly group = new THREE.Group();

  constructor(scene: THREE.Scene, roster: PlayerInfo[]) {
    scene.add(this.group);
    for (const info of roster) {
      const cat = info.role === 'cat' ? createCatModel(info.look) : null;
      const sitter = info.role === 'sitter' ? createSitterModel({ name: info.name, skin: '#f1c7a5', hair: '#5a3b2a', shirt: '#e0785c' }) : null;
      const root = (cat?.root ?? sitter!.root) as THREE.Group;
      this.group.add(root);
      this.chars.set(info.id, {
        id: info.id, info, cat, sitter, root, track: new Track(), pos: new THREE.Vector3(), prev: new THREE.Vector3(),
        yaw: 0, speed: 0, vy: 0, grounded: true, head: new THREE.Vector3(),
      });
    }
  }

  ingest(t: number, chars: CharState[], props: PropSnap[]) {
    for (const s of chars) this.chars.get(s.id)?.track.push(t, s.p, [s.yaw]);
    for (const p of props) {
      let v = this.props.get(p[0]);
      if (!v) {
        const obj = createPropMesh(p[1]);
        this.group.add(obj);
        v = { obj, track: new Track(), kind: p[1], fallen: false };
        this.props.set(p[0], v);
      }
      v.track.push(t, [p[2], p[3], p[4]], [p[5], p[6], p[7], p[8]]);
      v.fallen = p[9] === 1;
    }
  }

  removeProp(id: number) {
    const v = this.props.get(id);
    if (!v) return;
    v.obj.removeFromParent();
    this.props.delete(id);
  }

  syncMess(list: Mess[]) {
    const keep = new Set(list.map((m) => m.id));
    for (const [id, v] of this.mess) if (!keep.has(id)) { v.obj.removeFromParent(); this.mess.delete(id); }
    for (const m of list) {
      if (this.mess.has(m.id)) continue;
      const obj = createMessMesh(m.kind as MessKind);
      obj.position.set(...m.p);
      obj.rotation.y = m.yaw;
      obj.scale.setScalar(m.scale);
      this.group.add(obj);
      this.mess.set(m.id, { obj, m });
    }
  }

  updateProps(rt: number) {
    for (const v of this.props.values()) {
      const r = v.track.sample(rt, v.obj.position, false);
      if (r.length === 4) v.obj.quaternion.set(r[0], r[1], r[2], r[3]);
    }
  }

  /** place a char view (pos/yaw already decided), derive speeds */
  place(v: CharView, dt: number, pos: THREE.Vector3, yaw: number, vel: Vec3 | null) {
    v.prev.copy(v.pos);
    v.pos.copy(pos);
    v.yaw = yaw;
    if (vel) { v.speed = Math.hypot(vel[0], vel[2]); v.vy = vel[1]; }
    else if (dt > 0) {
      _v.subVectors(v.pos, v.prev);
      const sp = Math.hypot(_v.x, _v.z) / dt;
      v.speed += (Math.min(sp, 9) - v.speed) * Math.min(1, dt * 10);
      v.vy += (_v.y / dt - v.vy) * Math.min(1, dt * 10);
    }
    v.root.position.copy(pos);
    v.root.rotation.y = yaw;
  }

  /** attach a carried cat so its scruff anchor sits in the sitter's hand */
  attachToHand(cat: CharView, sitter: CharView) {
    if (!cat.cat || !sitter.sitter) return;
    sitter.root.updateMatrixWorld(true);
    sitter.sitter.holdAnchor.getWorldPosition(_w);
    cat.root.rotation.y = sitter.yaw + Math.PI;
    cat.root.position.set(0, 0, 0);
    cat.root.updateMatrixWorld(true);
    cat.cat.scruffAnchor.getWorldPosition(_v);
    cat.root.position.copy(_w).sub(_v);
    cat.pos.copy(cat.root.position);
  }

  headOf(v: CharView, out: THREE.Vector3) {
    return out.copy(v.pos).setY(v.pos.y + (v.info.role === 'cat' ? 0.55 : 1.95));
  }

  dispose() {
    for (const v of this.chars.values()) { v.cat?.dispose(); v.sitter?.dispose(); }
    this.group.removeFromParent();
  }
}
