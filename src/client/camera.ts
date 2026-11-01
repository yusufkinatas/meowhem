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

interface Frame { dist: number; height: number; shoulder: number; fov: number }
const FRAMES: Record<Role | 'carried' | 'holding', Frame> = {
  cat: { dist: 1.75, height: 0.42, shoulder: 0, fov: 70 }, // centred: the cat is small, a shoulder only adds side probes
  sitter: { dist: 2.95, height: 1.62, shoulder: 0.55, fov: 64 },
  // my cat dangling from the sitter's hand: pull back so the sitter is in the shot too
  carried: { dist: 2.5, height: 0.25, shoulder: 0, fov: 66 },
  // sitter holding a cat at arm's length
  holding: { dist: 3.2, height: 1.6, shoulder: 0.6, fov: 66 },
};
const RADIUS = 0.14;
/** boom options [elevation scale, pivot sink steps], most preferred first */
const BOOM_SHAPES: [number, number][] = [[1, 0], [0.5, 0], [0, 0], [0, 1], [-0.5, 1], [0, 2], [-0.5, 2]];
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
  private lastMode: CamMode = 'normal';
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
  private tmpBack0 = new THREE.Vector3();
  private elev = 1;
  private drop = 0;
  private headUp = 0;
  private hasUp = false;
  private tmpProbe = new THREE.Vector3();
  private tmpProbeA = new THREE.Vector3();
  private rise = 0;
  private side = 0;
  private sideWant = NaN;
  // velocity lookahead: score shoulders by where the head will be in 0.4 s, so a doorway jamb is avoided
  // before it blocks the boom (no 2 m snap when walking through a 1 m door)
  private lastT = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private ahead = new THREE.Vector3();
  private headAhead = new THREE.Vector3();
  private hasLast = false;

  constructor(readonly cam: THREE.PerspectiveCamera) {}

  look(dx: number, dy: number, sens = 0.0024) {
    this.yaw -= dx * sens;
    this.pitch = clamp(this.pitch + dy * sens, -0.85, 1.2);
  }

  /** snap smoothing (after a teleport or a cut) */
  snap() { this.hasT = false; this.hasLast = false; this.hasUp = false; }

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
    if (this.hasLast && dt > 0) {
      const k = Math.min(1, dt * 8);
      this.vel.x += ((target.x - this.lastT.x) / dt - this.vel.x) * k;
      this.vel.z += ((target.z - this.lastT.z) / dt - this.vel.z) * k;
      if (this.vel.lengthSq() > 100) this.vel.setScalar(0); // teleport, not motion
    }
    this.lastT.copy(target);
    this.hasLast = true;
    this.ahead.set(this.vel.x * 0.4, 0, this.vel.z * 0.4);
    const entered = this.mode !== this.lastMode;
    this.lastMode = this.mode;
    if (this.pull) {
      const want = Math.atan2(this.pull.x - target.x, this.pull.z - target.z);
      // just grabbed: cut straight to the sitter's face (a slow swing passes through the sitter's head)
      if (entered && this.mode === 'carried') this.yaw = want;
      else this.yaw += Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)) * Math.min(1, dt * 2);
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
    // under a low ceiling (bed, table, carrier lid) the pivot drops so the boom starts in free space
    // the probe starts on the character's capsule axis, where the camera ball always fits (a low start
    // overlaps a plant pot or a chair beside the sitter and pins the pivot at knee height)
    const base = Math.min(role === 'sitter' ? 0.9 : 0.2, c.height);
    const head = this.tmpLook.set(T.x, T.y + base, T.z);
    const up = Math.max(0, Math.min(c.height - base, this.cast(world, head, UP, c.height - base + 0.05) - 0.05));
    // a ceiling appearing drops the pivot at once; leaving one (out from under the bed) lifts it gently
    this.headUp = up < this.headUp || !this.hasUp ? up : damp(this.headUp, up, 5, dt);
    this.hasUp = true;
    head.y += this.headUp;
    const right = this.tmpPos.set(-Math.cos(yaw), 0, Math.sin(yaw));
    const lookahead = this.ahead.lengthSq() > 0.01;
    let upA = up;
    if (lookahead) {
      // where the character will be: only as far as its body can go (walking into a shelf must not put the
      // probe inside it), at the pivot height the ceiling there allows (so a hood ahead is seen coming)
      const al = this.ahead.length();
      const ha = this.headAhead.copy(this.ahead).divideScalar(al);
      const free = Math.max(0, this.cast(world, this.tmpProbe.set(T.x, T.y + base, T.z), ha, al) - 0.02);
      ha.multiplyScalar(free).add(this.tmpProbe);
      upA = Math.max(0, Math.min(c.height - base, this.cast(world, ha, UP, c.height - base + 0.05) - 0.05));
      ha.y += upA;
    }
    // boom shape: under a door lintel, a cooker hood or the bed edge the boom flattens and the pivot sinks
    // (camera drops) instead of snapping in. Options in order of preference, the first fully free one wins,
    // judged now and 0.4 s ahead, then eased, so the camera starts dropping before the lintel blocks it.
    const back0 = this.tmpBack0.copy(this.forward).negate();
    const back = this.tmpBack, probe = this.tmpProbe, probeA = this.tmpProbeA;
    const sink = role === 'sitter' ? 0.3 : 0.12;
    let elevWant = 1, dropWant = 0, bestF = -1;
    for (const [e, dn] of BOOM_SHAPES) {
      back.set(back0.x, back0.y * e, back0.z).normalize();
      // judged at the pivot's target height (not the eased one), so a pivot still rising out from under
      // a hood is not declared free just before it rises into it
      probe.copy(head).y += up - this.headUp - Math.min(dn * sink, up + base - 0.15);
      let f = this.boom(world, probe, right, back, this.side, c.dist);
      if (lookahead) {
        probeA.copy(this.headAhead).y -= Math.min(dn * sink, upA + base - 0.15);
        f = Math.min(f, this.boom(world, probeA, right, back, this.side, c.dist));
      }
      if (f > bestF + 0.15) { bestF = f; elevWant = e; dropWant = dn; }
      if (f >= c.dist - 0.02) break;
    }
    this.elev = damp(this.elev, elevWant, 6, dt);
    this.drop = damp(this.drop, dropWant, 6, dt);
    back.set(back0.x, back0.y * this.elev, back0.z).normalize();
    head.y -= Math.min(this.drop * sink, this.headUp + base - 0.15);
    if (lookahead) this.headAhead.y -= Math.min(this.drop * sink, upA + base - 0.15);
    let side = c.shoulder;
    if (c.shoulder > 0) {
      let best = -1, cur = -1;
      for (const s of [c.shoulder, 0, -c.shoulder]) {
        let f = this.boom(world, head, right, back, s, c.dist);
        if (lookahead) f = Math.min(f, this.boom(world, this.headAhead, right, back, s, c.dist));
        f += s === c.shoulder ? 0.25 : s === 0 ? 0.1 : 0;
        if (s === this.sideWant) cur = f;
        if (f > best + 0.001) { best = f; side = s; }
      }
      // hysteresis: only change shoulders for a clearly better boom (no flip-flopping between equal options)
      // (0.12 is below the shoulder biases' gaps, so a free default shoulder always wins back)
      if (cur >= 0 && best - cur < 0.12) side = this.sideWant;
      this.sideWant = side;
    } else this.sideWant = side;
    this.side = damp(this.side, side, 5, dt);
    const free = this.boom(world, head, right, back, this.side, c.dist);
    // never past the wall: backed into one, the camera sits at the head and tooClose hides the model
    const want = clamp(free, 0, c.dist);
    this.dist = want < this.dist ? want : damp(this.dist, want, 4, dt);
    // squeezed against a wall: rise a little and look over the head instead of into it
    const squeeze = clamp(1 - this.dist / c.dist, 0, 1);
    const pos = cam.position.copy(this.pivot).addScaledVector(back, this.dist);
    this.rise = damp(this.rise, squeeze * (role === 'cat' ? 0.25 : 0.55) * this.elev, 6, dt);
    if (this.rise > 0.001) pos.y += Math.min(this.rise, Math.max(0, this.cast(world, pos, UP, this.rise + 0.1) - 0.1));
    const look = this.tmpLook.copy(this.pivot).add(this.forward);
    // jammed against the character's big head: the client hides the local model
    // (measured to the head itself: on a shoulder the pivot sits 0.55 m to the side of it)
    const hx = pos.x - T.x, hy = pos.y - T.y - (role === 'cat' ? 0.3 : 1.4), hz = pos.z - T.z;
    this.tooClose = this.spotT === 0 && (pos.distanceTo(this.pivot) < (role === 'cat' ? 0.42 : 0.95) || Math.hypot(hx, hy, hz) < (role === 'cat' ? 0.45 : 0.85));

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
