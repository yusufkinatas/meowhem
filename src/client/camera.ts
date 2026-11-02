/**
 * Third-person camera tuned for a small house with 2.6 m ceilings: orbit with pointer lock, per-role framing
 * (CFG.camera: cat low and centred, sitter over the right shoulder), sphere-cast collision, a pivot that sinks
 * under the ceiling when looking down (the view always points exactly where the crosshair aims), a lookahead
 * that eases the boom in before a doorway, a counter edge or a wall cuts it, a fade for the local character
 * when the camera is squeezed against it, carried-cat framing, the minigame spot cam blend (ADDENDUM M23),
 * an FOV punch for hitstop and a hard override for the end show.
 */
import * as THREE from 'three';
import type { DoorDef, Role } from '../shared/contracts';
import { CFG } from '../config';
import { clamp, damp } from '../core/math';
import { RAPIER, LOS_QUERY, rayDist } from '../core/physics';

export type CamMode = 'normal' | 'carried' | 'holding';

interface Frame { dist: number; height: number; shoulder: number; fov: number }
const RADIUS = 0.1; // camera ball: covers the near plane (0.05 m, corners ~0.085 m) with a little margin
const FEET = 0.18; // probe for the floor the character will land on
/**
 * boom options [elevation scale, pivot sink steps, min elevation (sine), pivot rise (m)], most preferred first:
 * sinking keeps the view exact, flattening is the fallback. The cat also climbs over a sofa back or the washer
 * right behind it (it has no crosshair, its view aims at the cat).
 */
const BOOM_SHAPES: [number, number, number, number][] = [[1, 0, 0, 0], [1, 1, 0, 0], [1, 2, 0, 0], [0.5, 1, 0, 0], [0, 1, 0, 0], [0, 2, 0, 0]];
// (the last one goes nearly straight up: against a wall, the camera looks down on the cat the way Stray does)
const CAT_SHAPES: [number, number, number, number][] = [...BOOM_SHAPES, [1, 0, 0.5, 0.45], [1, 0, 0.75, 0.45], [1, 0, 1.3, 0.5], [1, 0, 3, 0]];
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const _left = new THREE.Vector3();
const _from: [number, number, number] = [0, 0, 0];
const _dir: [number, number, number] = [0, 0, 0];

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
  /** opacity for the local character: the camera squeezed against it fades it instead of hiding it */
  fade = 1;
  /** camera inside the character's head: the client hides the local model (last resort) */
  tooClose = false;
  /** dev: last frame's internals (debug overlay / QA probes) */
  readonly dbg: Record<string, number> = {};

  private dist = 2;
  /** next update starts framed (after a teleport or a cut), no easing */
  private cut = true;
  private t = 0;
  private spotT = 0;
  private lastSpot = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private pivot = new THREE.Vector3();
  private smoothT = new THREE.Vector3();
  private hasT = false;
  private ball: RAPIER.Ball | null = null;
  private feet: RAPIER.Ball | null = null;
  private tmpPos = new THREE.Vector3();
  private tmpLook = new THREE.Vector3();
  private tmpBack = new THREE.Vector3();
  private tmpBack0 = new THREE.Vector3();
  private elev = 1;
  private climb = 0;
  private hop = 0;
  private drop = 0;
  private headUp = 0;
  private hasUp = false;
  private tmpProbe = new THREE.Vector3();
  private tmpProbeA = new THREE.Vector3();
  private tmpCam = new THREE.Vector3();
  private tmpHE = new THREE.Vector3();
  private tmpEye = new THREE.Vector3();
  /** last frame's camera position (before the spot cam blend) and whether it is valid */
  private lastPos = new THREE.Vector3();
  private hasPos = false;
  private rise = 0;
  private lift = 0;
  private sh = 0;
  private lastL = 2;
  private lastYaw = 0;
  private yawRate = 0;
  private tmpR = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private sideWant = NaN;
  // velocity lookahead: booms are also judged from where the character will be in 0.4 s (dropped to the floor it
  // will land on), so a door jamb, a lintel or a counter edge eases the camera in before it cuts the boom
  private lastT = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private ahead = new THREE.Vector3();
  private headAhead = new THREE.Vector3();
  private hasLast = false;

  /** door openings (planes): the boom only passes through one behind the character while it walks through */
  private doors: { z: boolean; at: number; a: number; b: number; side: number; crossT: number; near: boolean }[] = [];

  constructor(readonly cam: THREE.PerspectiveCamera, doors: readonly DoorDef[] = []) {
    for (const d of doors) {
      const dx = Math.cos(d.closedYaw) * d.width, dz = -Math.sin(d.closedYaw) * d.width;
      const z = Math.abs(dx) > Math.abs(dz), a0 = z ? d.hinge[0] : d.hinge[2], a1 = a0 + (z ? dx : dz);
      this.doors.push({ z, at: z ? d.hinge[2] : d.hinge[0], a: Math.min(a0, a1), b: Math.max(a0, a1), side: 0, crossT: -9, near: false });
    }
  }

  /**
   * the boom from pivot p along b, cut at a door opening it would pass through into the next room: standing a
   * step in front of a doorway the camera would otherwise hang in the next room, framing you in a door jamb.
   * Free while you walk through (near the opening, just crossed it, or judged from beyond it).
   */
  private doorCut(p: THREE.Vector3, b: THREE.Vector3, f: number, T: THREE.Vector3): number {
    for (const d of this.doors) {
      if (d.near || this.t - d.crossT < 1.5) continue;
      const pc = d.z ? p.z : p.x, bc = d.z ? b.z : b.x, gap = d.at - pc;
      if (bc * gap <= 0 || Math.sign((d.z ? T.z : T.x) - d.at) !== Math.sign(-gap)) continue;
      const t = gap / bc, x = d.z ? p.x + b.x * t : p.z + b.z * t;
      if (t > f + RADIUS || x < d.a - RADIUS || x > d.b + RADIUS) continue;
      f = Math.min(f, Math.max(0, t - (0.075 + RADIUS + 0.03) / Math.abs(bc)));
    }
    return f;
  }

  /**
   * through a doorway: the boom may reach past the wall only as far as the room it has in the opening allows
   * (metres per metre of clearance, continuous), so a turn or a curve through the door brings the camera in
   * smoothly instead of a jamb cutting it. On the move, or turning with the doorway some way off (the jamb
   * swings past fast then), it follows close behind through the door; standing or turning on the spot it may
   * reach further. moving: 0..1, sh: the pivot's sideways offset.
   */
  private doorSlot(p: THREE.Vector3, b: THREE.Vector3, f: number, moving: number, sh: number): number {
    for (const d of this.doors) {
      const pc = d.z ? p.z : p.x, bc = d.z ? b.z : b.x;
      if (Math.abs(bc) < 1e-3) continue;
      // both faces of the wall; t < 0: the doorway is still ahead of the pivot (the line extended forward)
      const t0 = (d.at - 0.075 - pc) / bc, t1 = (d.at + 0.075 - pc) / bc;
      const tLo = Math.min(t0, t1), tHi = Math.max(t0, t1);
      let clr = Infinity;
      for (const t of tHi > 0 ? [Math.max(0, tLo), tHi] : [tHi]) {
        const x = d.z ? p.x + b.x * t : p.z + b.z * t;
        clr = Math.min(clr, x - d.a - RADIUS, d.b - x - RADIUS);
      }
      // past the doorway (or in it) the limit is measured from where the boom enters the wall (through the wall
      // beside the opening instead, the sphere cast has it). Walking up to a doorway it already applies, relaxed
      // by the way still to go and by how far the line misses the opening, so it never starts with a jump.
      const miss = Math.max(0, -clr);
      if (tLo >= f || (tHi > 0 ? miss > 0.05 : miss > 0.6)) continue;
      const base = tHi > 0 ? Math.max(0, tLo) : 1.5 * -tHi;
      const k = 1.5 + 2 * clamp(1 - moving - Math.abs(this.yawRate) * (Math.abs(tHi > 0 ? tLo : tHi) + Math.abs(sh) + 0.1) * 2, 0, 1);
      f = Math.min(f, base + 0.05 + k * Math.max(0, clr) + 4 * miss);
    }
    return f;
  }


  look(dx: number, dy: number, sens = CFG.camera.sens) {
    // a stray pointer-lock spike (Chrome reports one now and then) must not spin the view
    const k = Math.min(1, 600 / (Math.abs(dx) + Math.abs(dy) || 1));
    this.yaw -= dx * k * sens;
    this.pitch = clamp(this.pitch + dy * k * sens, -0.85, 1.2);
  }

  /** snap smoothing (after a teleport or a cut) */
  snap() {
    this.hasT = false; this.hasLast = false; this.hasUp = false; this.hasPos = false; this.cut = true;
    for (const d of this.doors) { d.side = 0; d.crossT = -9; } // a teleport is not walking through a door
  }

  /** free distance along dir from o, for a small sphere (walls, doors, furniture); feet: a character-wide one */
  private cast(world: RAPIER.World, o: THREE.Vector3, dir: THREE.Vector3, max: number, feet = false): number {
    this.ball ??= new RAPIER.Ball(RADIUS);
    this.feet ??= new RAPIER.Ball(FEET);
    const hit = world.castShape({ x: o.x, y: o.y, z: o.z }, { x: 0, y: 0, z: 0, w: 1 }, { x: dir.x, y: dir.y, z: dir.z }, feet ? this.feet : this.ball, 0, max, false, undefined, LOS_QUERY);
    return hit ? hit.time_of_impact : max;
  }

  /**
   * sets this.pivot for a shoulder offset and returns the free boom length behind it. With los, a boom whose
   * camera could not see the character is cut back (a shoulder pivot can peek through a doorway the
   * character is standing beside: the camera would sit in the next room looking at a door jamb).
   */
  private boom(world: RAPIER.World, head: THREE.Vector3, right: THREE.Vector3, back: THREE.Vector3, shoulder: number, dist: number, los = true): number {
    const dir = shoulder >= 0 ? right : _left.copy(right).negate();
    const a = Math.abs(shoulder);
    const sh = a > 0 ? Math.max(0, Math.min(a, this.cast(world, head, dir, a + RADIUS) - 0.04)) : 0;
    this.pivot.copy(head).addScaledVector(dir, sh);
    let f = this.cast(world, this.pivot, back, dist + 0.1) - 0.04;
    if (los) f = this.doorCut(this.pivot, back, f, this.smoothT);
    // (a few steps in, each to where the last blocked sight line was cut)
    for (let i = 0; los && sh > 0.1 && f > 0.3 && i < 3; i++) {
      const q = this.seen(world, head, right, this.tmpCam.copy(this.pivot).addScaledVector(back, f));
      if (q >= 1) break;
      f *= q;
    }
    return f;
  }

  /** share of the way from the character (both sides of its head) to a camera point that is clear: 1 = in view */
  private seen(world: RAPIER.World, from: THREE.Vector3, right: THREE.Vector3, to: THREE.Vector3): number {
    let q = 1;
    for (const o of [-0.18, 0.18]) {
      _from[0] = from.x + right.x * o; _from[1] = from.y; _from[2] = from.z + right.z * o;
      const dx = to.x - _from[0], dy = to.y - _from[1], dz = to.z - _from[2], len = Math.hypot(dx, dy, dz);
      if (len < 0.3) continue;
      _dir[0] = dx / len; _dir[1] = dy / len; _dir[2] = dz / len;
      const hit = rayDist(world, _from, _dir, len);
      if (hit < len - 0.05) q = Math.min(q, Math.max(0.2, hit / len));
    }
    return q;
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
      this.fade = 1;
      return;
    }
    const C = CFG.camera;
    const c: Frame = this.mode === 'normal' ? C[role] : C[this.mode];
    // looking up from a low camera: past this the cat drops out of the bottom of the frame
    if (role === 'cat') this.pitch = Math.max(this.pitch, -0.5);
    const entered = this.mode !== this.lastMode;
    this.lastMode = this.mode;
    // just grabbed: cut to the carried framing (a swoop up from the floor passes through the sitter's face)
    if (entered && this.mode === 'carried') this.snap();
    if (this.hasLast && dt > 0) {
      const k = Math.min(1, dt * 8);
      this.vel.x += ((target.x - this.lastT.x) / dt - this.vel.x) * k;
      this.vel.z += ((target.z - this.lastT.z) / dt - this.vel.z) * k;
      if (this.vel.lengthSq() > 100) this.vel.setScalar(0); // teleport, not motion
    } else this.vel.setScalar(0);
    this.lastT.copy(target);
    this.hasLast = true;
    this.ahead.set(this.vel.x * 0.4, 0, this.vel.z * 0.4);
    if (this.pull) {
      const want = Math.atan2(this.pull.x - target.x, this.pull.z - target.z);
      if (entered && this.mode === 'carried') this.yaw = want;
      // eased, and never faster than a calm pan (a sitter spinning round with you in hand must not whip the view)
      else this.yaw += clamp(Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)) * Math.min(1, dt * 2), -2.2 * dt, 2.2 * dt);
    }
    const wob = this.wobble ? Math.sin(this.t * 2.3) * 0.06 * this.wobble : 0;
    const yaw = this.yaw + wob, pitch = this.pitch + (this.wobble ? Math.cos(this.t * 1.7) * 0.04 * this.wobble : 0);
    if (!this.cut && dt > 0) this.yawRate += (Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw)) / dt - this.yawRate) * Math.min(1, dt * 12);
    else this.yawRate = 0;
    this.lastYaw = yaw;
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
    for (const d of this.doors) {
      const g = (d.z ? T.z : T.x) - d.at, s = Math.sign(g), w = d.z ? T.x : T.z;
      if (d.side && s && s !== d.side && w > d.a - 0.5 && w < d.b + 0.5) d.crossT = this.t;
      if (s) d.side = s;
      d.near = Math.abs(g) < 0.6 && w > d.a - 0.6 && w < d.b + 0.6;
    }

    // pivot: above the character, shifted to a shoulder, kept inside walls. Under a low ceiling (bed, table,
    // carrier lid) it drops so the boom starts in free space. The probe starts on the capsule axis, where the
    // camera ball always fits (a low start overlaps a plant pot or a chair beside the sitter).
    const base = Math.min(role === 'sitter' ? 0.9 : 0.2, c.height);
    const head = this.tmpLook.set(T.x, T.y + base, T.z);
    const up = clamp(this.cast(world, head, UP, c.height - base + 0.05) - 0.05, 0, c.height - base);
    // a ceiling appearing drops the pivot at once; leaving one (out from under the bed) lifts it gently
    this.headUp = up < this.headUp || !this.hasUp ? up : damp(this.headUp, up, 5, dt);
    this.hasUp = true;
    head.y += this.headUp;
    // looking down under the room ceiling: the pivot sinks (down to the sitter's chest, the cat's back) before
    // the boom gets shorter, so the view still turns down and the camera never has to flatten (which would aim
    // the view somewhere the crosshair is not). Past that the boom shortens along the view.
    const roof = C.ceiling - RADIUS - 0.04;
    const pitchSink = (y: number) => (sp > 0 ? clamp(y + c.dist * sp - roof, 0, Math.max(0, Math.min(role === 'sitter' ? 0.45 : 0.25, y - T.y - 0.15))) : 0);
    const budget = (y: number, by: number) =>
      Math.max(0.3, Math.min(c.dist, by > 0.03 ? (roof - y) / by : by < -0.03 ? (y - 0.12) / -by : c.dist));
    head.y -= pitchSink(head.y);
    const right = this.tmpPos.set(-Math.cos(yaw), 0, Math.sin(yaw));
    const lookahead = this.ahead.lengthSq() > 0.01;
    if (lookahead) {
      // where the character will be: only as far as its body can go (walking into a shelf must not put the
      // probe inside it), on the floor it will land on (running off the counter), at the pivot height the
      // ceiling there allows (so a hood ahead is seen coming)
      const al = this.ahead.length();
      const ha = this.headAhead.copy(this.ahead).divideScalar(al);
      const free = Math.max(0, this.cast(world, this.tmpProbe.set(T.x, T.y + base, T.z), ha, al) - 0.02);
      ha.multiplyScalar(free).add(this.tmpProbe);
      // (as wide as a paw stance: a cat running along the counter's front edge is still on the counter)
      const fall = this.cast(world, ha, DOWN, T.y + base, true) - (base - FEET);
      if (fall > 0.15) ha.y -= fall;
      ha.y += clamp(this.cast(world, ha, UP, c.height - base + 0.05) - 0.05, 0, c.height - base);
      ha.y -= pitchSink(ha.y);
    }
    const back0 = this.tmpBack0.copy(this.forward).negate();
    const back = this.tmpBack, probe = this.tmpProbe, probeA = this.tmpProbeA;
    // squeezed: a wall close behind cuts the boom
    const sq = this.cut ? 0 : clamp(1 - this.dist / this.lastL, 0, 1);
    this.rise = damp(this.rise, sq, 6, dt);
    // shoulder: right, centre or left (side is the sign), judged with the exact offset and the boom shape the
    // camera is using. The centred cat camera has the same options a hand's width out: it slides past a
    // cooker hood or a cabinet edge it would otherwise graze.
    const over = c.shoulder > 0;
    // over the shoulder: looking down at the floor steps further out (the crosshair clear of her feet); a short
    // boom (a wall close behind) narrows it, so she stays in the left of the frame, not beside the lens.
    // (carried: wider, a three-quarter view of the sitter beats her face filling the lens in a tight spot)
    const full = over ? Math.min(c.shoulder + (role === 'sitter' ? 0.35 * clamp((sp - 0.35) / 0.45, 0, 1) : 0), this.cut ? 9 : 0.25 + 0.3 * this.dist) : this.mode === 'carried' ? 0.8 : 0.3;
    const shapes = role === 'cat' ? CAT_SHAPES : BOOM_SHAPES;
    const catEye = this.tmpEye.set(T.x, T.y + 0.25, T.z);
    const rise = (h: THREE.Vector3, r: number) => (r > 0.005 ? Math.min(r, Math.max(0, this.cast(world, h, UP, r + 0.05) - 0.05)) : 0);
    const shape = (out: THREE.Vector3, bx: number, by: number, bz: number, e: number, climb: number) => out.set(bx, climb > 0 ? Math.max(by * e, climb) : by * e, bz).normalize();
    const sink = role === 'sitter' ? 0.3 : 0.12;
    const sinkBy = (y: number, n: number) => Math.min(n * sink, Math.max(0, y - T.y - 0.15));
    shape(back, back0.x, back0.y, back0.z, this.elev, this.climb);
    const hE = this.tmpHE.copy(head), hA = probeA.copy(this.headAhead);
    hE.y -= sinkBy(hE.y, this.drop);
    hA.y -= sinkBy(hA.y, this.drop);
    const L0 = budget(hE.y, back.y);
    let side = 0, best = -1, cur = -1;
    const reach = (h: THREE.Vector3, s: number, r = right) => (Math.abs(s) < 1e-3 ? 0 : Math.max(0, this.cast(world, h, s > 0 ? r : _left.copy(r).negate(), Math.abs(s) + RADIUS) - 0.04));
    // (the door slot: standing still the camera may reach well past a doorway, on the move it stays close)
    const moving = Math.hypot(this.vel.x, this.vel.z) / 1.5;
    for (const s of [1, 0, -1]) {
      // (in a doorway the shoulder pivot sits by the jamb and gets almost no slot: the centre wins there)
      let f = this.boom(world, hE, right, back, s * full, L0);
      f = this.doorSlot(this.pivot, back, f, moving, Math.hypot(this.pivot.x - hE.x, this.pivot.z - hE.z));
      if (lookahead) f = Math.min(f, this.boom(world, hA, right, back, s * full, L0));
      // (over the shoulder, the offset a side really gets counts too, for a boom worth having: a wall on her
      // right squeezing the right shoulder under ~3/4 puts her spray arm on the crosshair, the left one is better)
      f += over ? (s === 1 ? 0.25 : s === 0 ? 0.1 : 0) + (s ? (reach(hE, s * full) / full) * Math.min(1, f / 1.2) : 0) : s === 0 ? 0.25 : 0;
      if (s === this.sideWant) cur = f;
      if (f > best + 0.001) { best = f; side = s; }
    }
    // hysteresis: only change shoulders for a clearly better boom (no flip-flopping between equal options)
    // (0.12 is below the shoulder biases' gaps, so a free default shoulder always wins back)
    if (cur >= 0 && best - cur < 0.12) side = this.sideWant;
    this.sideWant = side;
    // turning: judge things 0.2 s further round too, so panning past a door jamb or a shelf eases the camera in
    const turn = clamp(this.yawRate * 0.2, -0.6, 0.6), turning = Math.abs(turn) > 0.03;
    const r2 = this.tmpR.set(-Math.cos(yaw + turn), 0, Math.sin(yaw + turn));
    const shT = side * Math.min(full, reach(head, side * full));
    // boom shape: under a door lintel, a cooker hood or the bed edge the pivot sinks (camera drops) instead of
    // snapping in, flattening only as a fallback. The first fully free shape wins (the ceiling is already in the
    // budget, so looking down never counts as blocked), judged now and ahead, then eased.
    let pick = 0, pickF = -1;
    for (let i = 0; i < shapes.length; i++) {
      const [e, dn, cl, hp] = shapes[i];
      if (cl > 0 && pickF > 0.9) break; // (climbing is for a boom that is really stuck, not a bit short)
      shape(back, back0.x, back0.y, back0.z, e, cl);
      // judged at the pivot's target height (not the eased one), so a pivot still rising out from under
      // a hood is not declared free just before it rises into it
      probe.copy(head).y += up - this.headUp;
      probe.y -= sinkBy(probe.y, dn);
      probe.y += rise(probe, hp);
      const L = budget(probe.y, back.y);
      let f = this.boom(world, probe, right, back, shT, L);
      // (a climbed boom must still see the cat over the sofa back: as far out as the cat can be seen from)
      for (let k = 0; cl > 0 && f > 0.3 && k < 3; k++) {
        const q = this.seen(world, catEye, right, this.tmpCam.copy(this.pivot).addScaledVector(back, f));
        if (q >= 1) break;
        f *= q;
      }
      if (lookahead) {
        // 0.4 s ahead and halfway there: a lintel the trailing camera is about to pass under shows up in between
        probeA.copy(this.headAhead).y -= sinkBy(this.headAhead.y, dn);
        probeA.y += rise(probeA, hp);
        f = Math.min(f, this.boom(world, probeA, right, back, shT, L));
        probeA.lerp(probe, 0.5);
        f = Math.min(f, this.boom(world, probeA, right, back, shT, L));
      }
      if (f > pickF + 0.15) { pick = i; pickF = f; }
      if (f >= L - 0.02) break;
    }
    this.elev = damp(this.elev, shapes[pick][0], 6, dt);
    this.drop = damp(this.drop, shapes[pick][1], 6, dt);
    this.climb = damp(this.climb, shapes[pick][2], 6, dt);
    shape(back, back0.x, back0.y, back0.z, this.elev, this.climb);
    this.hop = damp(this.hop, shapes[pick][3], 6, dt);
    head.y -= Math.min(this.drop * sink, Math.max(0, head.y - T.y - 0.15));
    if (lookahead) this.headAhead.y -= Math.min(this.drop * sink, Math.max(0, this.headAhead.y - T.y - 0.15));
    // (climbing: the pivot rises first, so the boom clears a sofa back right behind the cat; the aim stays low)
    const hop = rise(head, this.hop);
    head.y += hop;
    if (lookahead) this.headAhead.y += rise(this.headAhead, this.hop);
    const L = budget(head.y, back.y);
    this.lastL = L;
    // the pivot's sideways reach: a door jamb ahead takes it in early and smoothly (only a wall right beside
    // the head cuts it at once), so walking into a doorway never slides the view sideways in one frame
    const s0 = side * full;
    let shWant = Math.sign(s0) * Math.min(Math.abs(s0), reach(head, s0));
    if (lookahead) shWant = Math.sign(s0) * Math.min(Math.abs(shWant), reach(this.headAhead, s0));
    if (turning) shWant = Math.sign(s0) * Math.min(Math.abs(shWant), reach(head, s0, r2));
    this.sh = this.cut ? shWant : clamp(damp(this.sh, shWant, 8, dt), this.sh - 6 * dt, this.sh + 6 * dt);
    this.sh = Math.sign(this.sh) * Math.min(Math.abs(this.sh), reach(head, this.sh));
    const shoulder = this.sh;
    // soft limits (eased in, never snapped): the boom 0.4 s ahead, and the character's head must stay in
    // view (a shoulder pivot can peek past a door jamb the character is standing behind)
    let soft = L;
    // (ahead, with the shoulder the camera is heading for: it will have moved to the centre by then)
    if (lookahead) soft = Math.min(soft, this.boom(world, this.headAhead, right, back, side * Math.min(full, reach(this.headAhead, side * full)), L) + 0.05);
    // (and turning: the boom 0.2 s further round, from here and from where the character will be by then, so a
    // curve through a doorway is seen coming)
    if (turning) {
      const b2 = shape(this.tmpB, -Math.sin(yaw + turn) * cp, sp, -Math.cos(yaw + turn) * cp, this.elev, this.climb);
      soft = Math.min(soft, this.boom(world, head, r2, b2, shoulder, L) + 0.05);
      if (lookahead) soft = Math.min(soft, this.boom(world, probe.copy(head).lerp(this.headAhead, 0.5), r2, b2, shoulder, L) + 0.05);
    }
    const free = this.boom(world, head, right, back, shoulder, L, false);
    const pos = cam.position.copy(this.pivot).addScaledVector(back, Math.max(0, free));
    // (the cat camera too: climbed over a sofa back or a washer, the cat must not be behind it)
    if (Math.abs(shoulder) > 0.1 || role === 'cat') soft = Math.min(soft, free * this.seen(world, this.tmpProbe.set(T.x, T.y + (role === 'cat' ? 0.25 : 1.4), T.z), right, pos));
    const slot = this.doorSlot(this.pivot, back, L, moving, shoulder);
    soft = Math.min(soft, this.doorCut(this.pivot, back, free, T), slot);
    // never past the wall: a wall cut is instant, the soft limits ease in, everything eases back out
    const hard = clamp(free, 0, L);
    Object.assign(this.dbg, { hard, soft, L, side, pick, turn, sh: shoulder, slot });
    const want = Math.max(0, Math.min(hard, soft));
    if (this.cut) this.dist = want; // just cut: start framed
    else if (want < this.dist) {
      let d = Math.max(damp(this.dist, want, 25, dt), this.dist - 11 * dt);
      if (d > hard) {
        // a jamb or a shelf edge cuts the boom: the camera still eases in (over a frame or two) when it can get
        // there from last frame's spot without passing through anything, i.e. its sight line only grazes the
        // edge. Into a wall, or after a big swing, it snaps.
        const c0 = this.tmpCam.copy(this.pivot).addScaledVector(back, d);
        c0.y += this.lift;
        const mv = this.tmpProbe.subVectors(c0, this.lastPos), ml = mv.length();
        const graze = this.hasPos && d - hard < 0.6 && ml < 0.4 && (ml < 1e-4 || this.cast(world, this.lastPos, mv.divideScalar(ml), ml) >= ml);
        d = graze ? Math.min(d, Math.max(hard, this.dist - 11 * dt)) : hard;
      }
      this.dist = d;
    } else this.dist = damp(this.dist, want, 4, dt);
    pos.copy(this.pivot).addScaledVector(back, this.dist);
    // squeezed, the cat camera rises a little (the sitter would drop out of the bottom of the frame, her narrower
    // shoulder keeps the lens off her head instead); capped by a cabinet or the ceiling above at once
    const lift = role === 'cat' ? this.rise * 0.2 : 0;
    const room = lift > 0.001 ? Math.max(0, this.cast(world, pos, UP, lift + 0.1) - 0.1) : 0;
    this.lift = Math.min(damp(this.lift, lift, 6, dt), room);
    pos.y += this.lift;
    this.lastPos.copy(pos);
    this.hasPos = true;
    // The sitter's view points along yaw/pitch (the crosshair is where the spray and the toss go); a flattened
    // boom (passing under a lintel or a hood) aims back toward the pivot so she stays in the shot. The cat has no
    // crosshair: its view aims just past its own head (the same view with a free boom), and down at the cat when
    // squeezed, so a camera over it, climbing over a sofa back or flattened under the bed keeps the cat in shot.
    const look = this.tmpLook;
    if (role === 'cat') {
      look.copy(this.pivot).addScaledVector(this.forward, 0.5);
      look.y -= hop;
      look.lerp(this.tmpB.set(T.x, T.y + 0.2, T.z), 0.6 * this.rise);
    } else {
      look.copy(pos).addScaledVector(this.forward, this.elev);
      if (this.elev < 0.99) look.add(this.tmpB.copy(this.pivot).add(this.forward).sub(pos).normalize().multiplyScalar(1 - this.elev));
    }
    // squeezed against the character (distance from the lens to its body, a capsule as wide as the chibi head or
    // the cat with its ears): fade it; hide it only with the lens inside it (ears across the screen otherwise)
    const [r, top] = role === 'cat' ? [0.26, 0.52] : [0.3, 1.76];
    const gap = Math.hypot(pos.x - T.x, pos.y - clamp(pos.y, T.y + r, T.y + top - r), pos.z - T.z) - r;
    // (the sitter also fades out with a short boom: her chibi head would fill half the frame and cover the
    // crosshair; Fortnite does the same against a wall)
    const boomK = role === 'sitter' ? smooth(clamp((this.dist - 0.45) / 0.75, 0, 1)) : 1;
    this.fade = this.spotT > 0 ? 1 : Math.min(0.35 + 0.65 * smooth(clamp((gap - 0.06) / 0.4, 0, 1)), boomK);
    this.tooClose = this.spotT === 0 && (gap < 0.06 || this.fade < 0.08);

    this.cut = false;
    // spot cam blend (eases in 0.35 s, out 0.25 s)
    if (this.spot) { this.lastSpot.pos.copy(this.spot.pos); this.lastSpot.target.copy(this.spot.target); }
    this.spotT = clamp(this.spotT + (this.spot ? dt / 0.35 : -dt / 0.25), 0, 1);
    if (this.spotT > 0) {
      const k = smooth(this.spotT), S = this.lastSpot;
      const d = this.tmpPos.subVectors(S.pos, S.target);
      const len = d.length();
      d.divideScalar(len || 1);
      // a wall between the target and the spot position pulls the camera in; a target inside the prop
      // (the curtain fabric) does not drag the camera into it
      const hit = this.cast(world, S.target, d, len);
      const ok = hit < 0.05 ? len : Math.min(len, hit - 0.03);
      const sx = S.target.x + d.x * ok, sy = S.target.y + d.y * ok, sz = S.target.z + d.z * ok;
      pos.set(pos.x + (sx - pos.x) * k, pos.y + (sy - pos.y) * k, pos.z + (sz - pos.z) * k);
      look.lerp(S.target, k);
    }
    if (pos.y < 0.08) pos.y = 0.08;
    cam.lookAt(look);
    // wide screens: keep the horizontal view under ~96 degrees (past that the room edges stretch)
    this.setFov(Math.min(c.fov, 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(48)) / cam.aspect))) + this.kick);
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
