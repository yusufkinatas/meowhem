/**
 * Third-person camera tuned for the house: orbit with pointer lock, per-role framing (cat low and close,
 * sitter over the shoulder), sphere-cast wall collision so tight doorways don't clip, carried-cat framing,
 * a minigame spot cam blend (ADDENDUM M23), an FOV punch for hitstop, and a hard override for the end show.
 */
import * as THREE from 'three';
import type { Role } from '../shared/contracts';
import { clamp, damp } from '../core/math';
import { RAPIER, LOS_QUERY } from '../core/physics';

export type CamMode = 'normal' | 'carried' | 'holding';

interface Frame { dist: number; height: number; shoulder: number; fov: number; minDist: number }
const FRAMES: Record<Role | 'carried' | 'holding', Frame> = {
  cat: { dist: 1.75, height: 0.42, shoulder: 0.1, fov: 70, minDist: 0.32 },
  sitter: { dist: 2.95, height: 1.62, shoulder: 0.55, fov: 64, minDist: 0.45 },
  // my cat dangling from the sitter's hand: pull back so the sitter is in the shot too
  carried: { dist: 2.5, height: 0.25, shoulder: 0, fov: 66, minDist: 0.4 },
  // sitter holding a cat at arm's length
  holding: { dist: 3.2, height: 1.6, shoulder: 0.6, fov: 66, minDist: 0.45 },
};
const RADIUS = 0.14;
const UP = new THREE.Vector3(0, 1, 0);
const _left = new THREE.Vector3();

const smooth = (t: number) => t * t * (3 - 2 * t);

export class TpsCamera {
  yaw = 0;
  pitch = 0.22;
  readonly forward = new THREE.Vector3(0, 0, 1);
  wobble = 0;
  /** extra look target (Cat TV pulls the camera toward the screen) */
  pull: THREE.Vector3 | null = null;
  mode: CamMode = 'normal';
  /** minigame spot cam target; null eases back */
  spot: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  /** end show: hard override, no collision, no smoothing */
  fixed: { pos: THREE.Vector3; target: THREE.Vector3; fov?: number } | null = null;
  /** FOV punch in degrees, decays on its own */
  kick = 0;
  /** camera is jammed against the character (client hides the local model) */
  tooClose = false;

  private dist = 2;
  private t = 0;
  private spotT = 0;
  private lastSpot = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private pivot = new THREE.Vector3();
  private smoothT = new THREE.Vector3();
  private hasT = false;
  private ball: RAPIER.Ball | null = null;
  private tmpPos = new THREE.Vector3();
  private tmpLook = new THREE.Vector3();
  private tmpBack = new THREE.Vector3();
  private side = 0;

  constructor(readonly cam: THREE.PerspectiveCamera) {}

  look(dx: number, dy: number, sens = 0.0024) {
    this.yaw -= dx * sens;
    this.pitch = clamp(this.pitch + dy * sens, -0.85, 1.2);
  }

  /** snap smoothing (after a teleport or a cut) */
  snap() { this.hasT = false; }

  /** free distance along dir from o, for a small sphere (walls, doors, furniture) */
  private cast(world: RAPIER.World, o: THREE.Vector3, dir: THREE.Vector3, max: number): number {
    this.ball ??= new RAPIER.Ball(RADIUS);
    const hit = world.castShape({ x: o.x, y: o.y, z: o.z }, { x: 0, y: 0, z: 0, w: 1 }, { x: dir.x, y: dir.y, z: dir.z }, this.ball, 0, max, false, undefined, LOS_QUERY);
    return hit ? hit.time_of_impact : max;
  }

  /** sets this.pivot for a shoulder offset and returns the free boom length behind it */
  private boom(world: RAPIER.World, head: THREE.Vector3, right: THREE.Vector3, back: THREE.Vector3, shoulder: number, dist: number): number {
    const dir = shoulder >= 0 ? right : _left.copy(right).negate();
    const a = Math.abs(shoulder);
    const sh = a > 0 ? Math.max(0, Math.min(a, this.cast(world, head, dir, a + RADIUS) - 0.04)) : 0;
    this.pivot.copy(head).addScaledVector(dir, sh);
    return this.cast(world, this.pivot, back, dist + 0.1) - 0.04;
  }

  update(dt: number, target: THREE.Vector3, role: Role, world: RAPIER.World) {
    this.t += dt;
    const cam = this.cam;
    this.kick = damp(this.kick, 0, 9, dt);
    if (this.fixed) {
      cam.position.copy(this.fixed.pos);
      cam.lookAt(this.fixed.target);
      if (cam.view?.enabled) cam.clearViewOffset();
      this.setFov(this.fixed.fov ?? 55);
      this.hasT = false;
      this.tooClose = false;
      return;
    }
    const c = this.mode === 'normal' ? FRAMES[role] : FRAMES[this.mode];
    if (this.pull) {
      const want = Math.atan2(this.pull.x - target.x, this.pull.z - target.z);
      this.yaw += Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)) * Math.min(1, dt * 2);
    }
    const wob = this.wobble ? Math.sin(this.t * 2.3) * 0.06 * this.wobble : 0;
    const yaw = this.yaw + wob, pitch = this.pitch + (this.wobble ? Math.cos(this.t * 1.7) * 0.04 * this.wobble : 0);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    this.forward.set(Math.sin(yaw) * cp, -sp, Math.cos(yaw) * cp);

    // follow target: snappy sideways, softer vertically (jumps and steps don't jolt the view)
    if (!this.hasT || this.smoothT.distanceToSquared(target) > 9) { this.smoothT.copy(target); this.hasT = true; }
    else {
      this.smoothT.x = damp(this.smoothT.x, target.x, 28, dt);
      this.smoothT.z = damp(this.smoothT.z, target.z, 28, dt);
      this.smoothT.y = damp(this.smoothT.y, target.y, role === 'cat' ? 14 : 10, dt);
    }
    const T = this.smoothT;

    // pivot: above the character, shifted to a shoulder, kept inside walls. In a narrow hallway the
    // right shoulder can put the boom straight into a wall: then try the other shoulder / center.
    const head = this.tmpLook.set(T.x, T.y + c.height, T.z);
    const right = this.tmpPos.set(-Math.cos(yaw), 0, Math.sin(yaw));
    const back = this.tmpBack.copy(this.forward).negate();
    let side = c.shoulder;
    if (c.shoulder > 0) {
      let best = -1;
      for (const s of [c.shoulder, 0, -c.shoulder]) {
        const f = this.boom(world, head, right, back, s, c.dist) + (s === c.shoulder ? 0.25 : s === 0 ? 0.1 : 0);
        if (f > best + 0.001) { best = f; side = s; }
      }
    }
    this.side = damp(this.side, side, 5, dt);
    const free = this.boom(world, head, right, back, this.side, c.dist);
    const want = clamp(free, c.minDist, c.dist);
    this.dist = want < this.dist ? want : damp(this.dist, want, 4, dt);
    // squeezed against a wall: rise a little and look over the head instead of into it
    const squeeze = clamp(1 - this.dist / c.dist, 0, 1);
    const pos = cam.position.copy(this.pivot).addScaledVector(back, this.dist);
    const rise = squeeze * (role === 'cat' ? 0.25 : 0.55);
    if (rise > 0.001) pos.y += Math.min(rise, Math.max(0, this.cast(world, pos, UP, rise + 0.1) - 0.1));
    const look = this.tmpLook.copy(this.pivot).add(this.forward);
    // jammed against the character's big head: the client hides the local model
    this.tooClose = this.spotT === 0 && this.mode === 'normal' && pos.distanceTo(this.pivot) < (role === 'cat' ? 0.42 : 0.95);

    // spot cam blend (eases in 0.35 s, out 0.25 s)
    if (this.spot) { this.lastSpot.pos.copy(this.spot.pos); this.lastSpot.target.copy(this.spot.target); }
    this.spotT = clamp(this.spotT + (this.spot ? dt / 0.35 : -dt / 0.25), 0, 1);
    if (this.spotT > 0) {
      const k = smooth(this.spotT), S = this.lastSpot;
      const d = this.tmpPos.subVectors(S.pos, S.target);
      const len = d.length();
      d.divideScalar(len || 1);
      const ok = Math.min(len, this.cast(world, S.target, d, len) - 0.03);
      const sx = S.target.x + d.x * ok, sy = S.target.y + d.y * ok, sz = S.target.z + d.z * ok;
      pos.set(pos.x + (sx - pos.x) * k, pos.y + (sy - pos.y) * k, pos.z + (sz - pos.z) * k);
      look.lerp(S.target, k);
    }
    if (pos.y < 0.08) pos.y = 0.08;
    cam.lookAt(look);
    this.setFov(c.fov + this.kick);
    // the docked minigame panel covers the bottom half: frame the spot in the top half
    const k = smooth(this.spotT) * 0.25;
    if (k > 0.001 || cam.view?.enabled) {
      if (k > 0.001) cam.setViewOffset(1000 * cam.aspect, 1000, 0, 1000 * k, 1000 * cam.aspect, 1000);
      else cam.clearViewOffset();
    }
  }

  private setFov(f: number) {
    if (Math.abs(this.cam.fov - f) > 0.01) { this.cam.fov = f; this.cam.updateProjectionMatrix(); }
  }
}
