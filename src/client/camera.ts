/** Third-person camera: orbit with pointer lock, per-role framing, wall collision against static colliders. */
import * as THREE from 'three';
import type { Role } from '../shared/contracts';
import { CFG } from '../config';
import { clamp, damp } from '../core/math';
import type { RAPIER } from '../core/physics';
import { rayDist } from '../core/physics';

export class TpsCamera {
  yaw = 0;
  pitch = 0.25;
  private dist = 2;
  readonly forward = new THREE.Vector3(0, 0, 1);
  private pivot = new THREE.Vector3();
  wobble = 0;
  private t = 0;
  /** extra look target (Cat TV pulls the camera toward the screen) */
  pull: THREE.Vector3 | null = null;

  constructor(readonly cam: THREE.PerspectiveCamera) {}

  look(dx: number, dy: number, sens = 0.0024) {
    this.yaw -= dx * sens;
    this.pitch = clamp(this.pitch + dy * sens, -0.9, 1.25);
  }

  update(dt: number, target: THREE.Vector3, role: Role, world: RAPIER.World) {
    this.t += dt;
    const c = CFG.camera[role];
    if (this.pull) {
      const want = Math.atan2(this.pull.x - target.x, this.pull.z - target.z);
      this.yaw += Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)) * Math.min(1, dt * 2);
    }
    const wob = this.wobble ? Math.sin(this.t * 2.3) * 0.06 * this.wobble : 0;
    const yaw = this.yaw + wob, pitch = this.pitch + (this.wobble ? Math.cos(this.t * 1.7) * 0.04 * this.wobble : 0);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    this.forward.set(Math.sin(yaw) * cp, -sp, Math.cos(yaw) * cp);
    // pivot: above the character, shifted right for an over-shoulder sitter view
    const rx = -Math.cos(yaw), rz = Math.sin(yaw);
    this.pivot.set(target.x + rx * c.shoulder, target.y + c.height, target.z + rz * c.shoulder);
    // keep the shoulder offset inside walls too
    if (c.shoulder > 0) {
      const head: [number, number, number] = [target.x, target.y + c.height, target.z];
      const s = rayDist(world, head, [rx, 0, rz], c.shoulder + 0.15);
      if (s < c.shoulder + 0.15) this.pivot.set(target.x + rx * Math.max(0, s - 0.15), target.y + c.height, target.z + rz * Math.max(0, s - 0.15));
    }
    const back: [number, number, number] = [-this.forward.x, -this.forward.y, -this.forward.z];
    const hit = rayDist(world, [this.pivot.x, this.pivot.y, this.pivot.z], back, c.dist + 0.2);
    const want = clamp(hit - 0.2, c.minDist, c.dist);
    this.dist = want < this.dist ? want : damp(this.dist, want, 4, dt);
    this.cam.position.set(this.pivot.x + back[0] * this.dist, this.pivot.y + back[1] * this.dist, this.pivot.z + back[2] * this.dist);
    if (this.cam.position.y < 0.08) this.cam.position.y = 0.08;
    this.cam.lookAt(this.pivot.x + this.forward.x, this.pivot.y + this.forward.y, this.pivot.z + this.forward.z);
    const fov = c.fov;
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
  }
}
