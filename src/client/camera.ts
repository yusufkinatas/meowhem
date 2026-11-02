/**
 * First-person camera for both roles. The eye rides the capsule axis (CFG.camera eye heights), so it is always
 * inside the collision capsule: it never clips a wall or the furniture the character fits under. Horizontal
 * follows exactly; vertical eases autosteps (lag capped in the air, so jumps and falls track), a subtle head bob
 * and landing dip, a sprint FOV ease, look pulls (Cat TV, the sitter holding
 * you), the minigame spot cam blend (ADDENDUM M23), an FOV punch for hitstop and a hard override for the end show.
 */
import * as THREE from 'three';
import type { Role } from '../shared/contracts';
import { CFG } from '../config';
import { clamp, damp, wrapAngle } from '../core/math';
import { rayDist, type RAPIER } from '../core/physics';

const smooth = (t: number) => t * t * (3 - 2 * t);
const PITCH = 1.45;

export interface EyeState {
  role: Role;
  /** ground speed (m/s) for the head bob */
  speed: number;
  grounded: boolean;
  /** landing impact speed this frame (CharMotion.landed) */
  landed: number;
  sprint: boolean;
  /** cat: pounce charge 0..1 (crouch, FOV squeeze, a butt wiggle at full) */
  charge: number;
  /** cat: loafing (lying down, the eye settles lower) */
  low: boolean;
}

export class FpsCamera {
  yaw = 0;
  /** positive = looking down */
  pitch = 0;
  readonly forward = new THREE.Vector3(0, 0, 1);
  wobble = 0;
  /** look target the view eases toward (Cat TV, the sitter holding you) */
  pull: THREE.Vector3 | null = null;
  /** minigame spot cam target; null eases back */
  spot: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  /** end show: hard override, no smoothing */
  fixed: { pos: THREE.Vector3; target: THREE.Vector3; fov?: number } | null = null;
  /** FOV punch in degrees, decays on its own */
  kick = 0;
  /** spot cam blend 0..1 */
  spotT = 0;
  /** head bob phase (rad) and weight, for the viewmodel sway */
  bob = 0;
  bobK = 0;

  private eye = new THREE.Vector3();
  private cut = true;
  private t = 0;
  private dip = 0;
  private dipV = 0;
  private sprintK = 0;
  private crouch = 0;
  private pulled = false;
  private pullYaw = 0;
  private pullPitch = 0;
  private level = 0;
  private lastSpot = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private tmp = new THREE.Vector3();
  private tmpLook = new THREE.Vector3();

  constructor(readonly cam: THREE.PerspectiveCamera) {}

  look(dx: number, dy: number, sens = CFG.camera.sens) {
    // a stray pointer-lock spike (Chrome reports one now and then) must not spin the view
    const k = Math.min(1, 600 / (Math.abs(dx) + Math.abs(dy) || 1));
    this.yaw -= dx * k * sens;
    this.pitch = clamp(this.pitch + dy * k * sens, -PITCH, PITCH);
  }

  /** next update starts on the eye, no easing (after a teleport or a cut) */
  snap() { this.cut = true; this.dip = this.dipV = this.crouch = 0; }

  update(dt: number, eye: THREE.Vector3, s: EyeState, world: RAPIER.World) {
    this.t += dt;
    const cam = this.cam;
    this.kick = damp(this.kick, 0, 9, dt);
    if (this.fixed) {
      cam.position.copy(this.fixed.pos);
      cam.lookAt(this.fixed.target);
      if (cam.view?.enabled) cam.clearViewOffset();
      this.setFov(this.fixed.fov ?? 55);
      this.cut = true;
      return;
    }
    if (this.pull) {
      const dx = this.pull.x - eye.x, dz = this.pull.z - eye.z, k = Math.min(1, dt * 3), m = 3.5 * dt;
      const wy = Math.atan2(dx, dz), wp = clamp(-Math.atan2(this.pull.y - eye.y, Math.hypot(dx, dz)), -PITCH, PITCH);
      // the target moving round the eye (the sitter turning with you in hand) carries the view along exactly...
      if (this.pulled && Math.abs(wrapAngle(wy - this.pullYaw)) < 0.5) {
        this.yaw += wrapAngle(wy - this.pullYaw);
        this.pitch = clamp(this.pitch + wp - this.pullPitch, -PITCH, PITCH);
      }
      this.pullYaw = wy;
      this.pullPitch = wp;
      // ...and only the rest (where you were looking, mouse look) eases over, never faster than a calm pan
      this.yaw += clamp(wrapAngle(wy - this.yaw) * k, -m, m);
      this.pitch += clamp((wp - this.pitch) * k, -m, m);
      this.pulled = true;
    } else if (this.pulled) { this.pulled = false; this.level = 0.6; }
    // a pull just ended (put down, tossed, caged, the TV off): ease back to level, not stuck staring at the ceiling
    if (this.level > 0) { this.level -= dt; this.pitch = damp(this.pitch, 0.05, 6, dt); }
    const yaw = this.yaw + (this.wobble ? Math.sin(this.t * 2.3) * 0.06 * this.wobble : 0);
    const pitch = this.pitch + (this.wobble ? Math.cos(this.t * 1.7) * 0.04 * this.wobble : 0);
    const cp = Math.cos(pitch);
    this.forward.set(Math.sin(yaw) * cp, -Math.sin(pitch), Math.cos(yaw) * cp);

    // eye: exact sideways; an autostep up eases, everything else (jumps, falls, landings) tracks within a few cm
    const E = this.eye;
    if (this.cut || E.distanceToSquared(eye) > 4) E.copy(eye);
    else {
      E.x = eye.x; E.z = eye.z;
      const step = s.grounded && eye.y > E.y, lag = step ? 0.4 : s.role === 'cat' ? 0.05 : 0.1;
      E.y = clamp(damp(E.y, eye.y, step ? 16 : 30, dt), eye.y - lag, eye.y + lag);
    }
    this.cut = false;

    // head bob (by ground speed, the cat's is smaller and quicker) and a landing dip
    const cat = s.role === 'cat';
    const sp = s.grounded ? s.speed : 0;
    this.bobK = damp(this.bobK, clamp(sp / (cat ? CFG.cat.walk : CFG.sitter.walk), 0, 1.4), 8, dt);
    this.bob += dt * sp * (cat ? 3.4 : 2.3);
    if (s.landed) this.dipV -= Math.min(s.landed, 8) * (cat ? 0.08 : 0.15);
    const h = Math.min(dt, 1 / 30); // (semi-implicit spring, stable at any frame rate)
    this.dipV += (-this.dip * 120 - this.dipV * 18) * h;
    this.dip += this.dipV * h;
    const amp = this.bobK * (cat ? 0.008 : 0.022);
    this.crouch = damp(this.crouch, s.low ? 0.13 : s.charge * 0.08, 10, dt);
    const side = Math.sin(this.bob) * amp * 0.5 + Math.sin(this.t * 17) * 0.006 * s.charge ** 3;
    const pos = cam.position.set(E.x - Math.cos(yaw) * side, E.y + Math.sin(this.bob * 2) * amp + this.dip - this.crouch, E.z + Math.sin(yaw) * side);
    const look = this.tmpLook.copy(pos).add(this.forward);

    // spot cam blend (eases in 0.35 s, out 0.25 s)
    if (this.spot) { this.lastSpot.pos.copy(this.spot.pos); this.lastSpot.target.copy(this.spot.target); }
    this.spotT = clamp(this.spotT + (this.spot ? dt / 0.35 : -dt / 0.25), 0, 1);
    if (this.spotT > 0) {
      const k = smooth(this.spotT), S = this.lastSpot;
      const d = this.tmp.subVectors(S.pos, S.target);
      const len = d.length();
      d.divideScalar(len || 1);
      // a wall between the target and the spot position pulls the camera in; a target inside the prop
      // (the curtain fabric) does not drag the camera into it
      const hit = rayDist(world, [S.target.x, S.target.y, S.target.z], [d.x, d.y, d.z], len);
      const ok = hit < 0.05 ? len : Math.min(len, hit - 0.13);
      pos.lerp(d.multiplyScalar(ok).add(S.target), k);
      look.lerp(S.target, k);
    }
    cam.lookAt(look);
    // wide screens: keep the horizontal view under ~96 degrees (past that the room edges stretch)
    this.sprintK = damp(this.sprintK, s.sprint ? 1 : 0, 4, dt);
    const base = Math.min(CFG.camera[s.role].fov, 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(48)) / cam.aspect)));
    this.setFov(base + 5 * this.sprintK - 7 * s.charge + this.kick);
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
