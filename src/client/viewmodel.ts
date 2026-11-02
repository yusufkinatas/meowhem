/**
 * First-person presence: the sitter's spray bottle, the cat's front paw and what it carries in its mouth. Parented to
 * the camera and kept within reach of the eye (inside the collision capsule), so it never pokes into a wall and needs
 * no second render pass.
 */
import * as THREE from 'three';
import { cloneModel, hasModel } from '../assets/loader';
import { waterBottleMat } from '../models/sitter';
import { addOutline, toon } from '../shared/toon';
import { clamp, damp, wrapAngle } from '../core/math';
import type { FpsCamera } from './camera';

/** a chibi paw from a few round parts (forearm along +y, toes at the top, beans on the -z palm) */
function makePaw(fur: string): THREE.Object3D {
  const g = new THREE.Group(), furMat = toon(fur), pink = toon('#f2a0ae');
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, p: [number, number, number], s: [number, number, number] = [1, 1, 1], line = 0.0012) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...p);
    m.scale.set(...s);
    if (line) addOutline(m, line / Math.max(...s));
    g.add(m);
  };
  part(new THREE.CapsuleGeometry(0.0115, 0.06, 4, 12), furMat, [0, 0, 0]);
  const ball = new THREE.SphereGeometry(0.017, 16, 12);
  part(ball, furMat, [0, 0.048, -0.002], [1.12, 0.95, 0.8]);
  const toe = new THREE.SphereGeometry(0.0068, 10, 8);
  for (const [x, y] of [[-0.0135, 0.059], [-0.0047, 0.066], [0.0047, 0.066], [0.0135, 0.059]]) part(toe, furMat, [x, y, -0.001], [1, 1, 0.9], 0.0009);
  const bean = new THREE.SphereGeometry(0.0036, 8, 6);
  for (const [x, y] of [[-0.0125, 0.058], [-0.0045, 0.064], [0.0045, 0.064], [0.0125, 0.058]]) part(bean, pink, [x, y, -0.0065], [1, 1, 0.5], 0);
  part(new THREE.SphereGeometry(0.0075, 10, 8), pink, [0, 0.044, -0.0125], [1.3, 1, 0.45], 0);
  return g;
}

export class ViewModel {
  private root = new THREE.Group();
  private item = new THREE.Group();
  private mouth = new THREE.Group();
  private mouthKey: string | null = null;
  /** spray recoil / swipe: 1 at the start, runs down to 0 */
  private kickT = 0;
  private reach = 0;
  private up = 0;
  private sx = 0;
  private sy = 0;
  private lastYaw = NaN;
  private lastPitch = 0;

  constructor(cam: THREE.Camera, private cat: boolean, fur: string) {
    let obj: THREE.Object3D | null = null;
    if (!cat && hasModel('sprayBottle')) {
      obj = cloneModel('sprayBottle');
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && (m.material as THREE.Material).name === 'spray_bottle') m.material = waterBottleMat(m.material as THREE.MeshToonMaterial);
      });
      obj.scale.setScalar(0.3); // ~7 cm tall at 0.2 m: reads like a full-size bottle in the hand
      obj.rotation.set(0.12, Math.PI + 0.25, 0); // nozzle forward (-Z), turned a little toward the crosshair
      obj.position.set(0, -0.005, 0); // (the model's origin is at the trigger head)
    } else if (cat) (obj = makePaw(fur)).scale.setScalar(0.85);
    cam.add(this.root, this.mouth);
    this.root.visible = this.mouth.visible = false;
    if (!obj) return;
    obj.traverse((o) => { o.castShadow = false; o.frustumCulled = false; });
    this.item.add(obj);
    this.root.add(this.item);
  }

  /** spray (sitter) or swipe (cat) */
  kick() { this.kickT = 1; }

  /** cat: the salmon / toy mouse / sock in your mouth, low in the middle of the view */
  carry(key: string | null) {
    if (key === this.mouthKey) return;
    this.mouthKey = key;
    this.mouth.clear();
    if (!key || !hasModel(key)) return;
    const o = cloneModel(key);
    o.scale.multiplyScalar(key === 'salmon' ? 0.2 : 0.28); // (real size, a tenth of a metre from the eye: scaled down)
    o.rotation.set(0.5, Math.PI / 2, 0);
    o.position.set(0, -0.052, -0.11);
    o.traverse((m) => { m.castShadow = false; m.frustumCulled = false; });
    this.mouth.add(o);
  }

  update(dt: number, show: boolean, c: FpsCamera, push = false) {
    const yawRate = dt > 0 && !isNaN(this.lastYaw) ? wrapAngle(c.yaw - this.lastYaw) / dt : 0;
    const pitchRate = dt > 0 ? (c.pitch - this.lastPitch) / dt : 0;
    this.lastYaw = c.yaw; this.lastPitch = c.pitch;
    // sway: lags the look a little, bobs with the steps
    this.sx = damp(this.sx, clamp(yawRate * 0.004, -0.02, 0.02), 10, dt);
    this.sy = damp(this.sy, clamp(pitchRate * 0.004, -0.015, 0.015), 10, dt);
    const bx = Math.sin(c.bob) * c.bobK * (this.cat ? 0.004 : 0.006), by = -Math.abs(Math.cos(c.bob)) * c.bobK * (this.cat ? 0.004 : 0.007);
    this.mouth.visible = show && this.mouth.children.length > 0;
    this.mouth.position.set(this.sx * 0.5 + bx, this.sy * 0.5 + by, 0);
    this.kickT = Math.max(0, this.kickT - dt / (this.cat ? 0.3 : 0.25));
    this.reach = damp(this.reach, push ? 1 : 0, 10, dt);
    // the paw only shows while it works; the bottle is always in hand
    const active = this.cat ? Math.max(this.reach, this.kickT > 0 ? 1 : 0) : 1;
    this.up = damp(this.up, show ? active : 0, this.cat ? 30 : 10, dt);
    this.root.visible = this.up > 0.02;
    if (!this.root.visible) return;
    const I = this.item, low = 1 - this.up;
    if (this.cat) {
      // swipe: raised from the lower right and swept across to the left; push: reaching forward, pads down, low right
      // (clear of the E prompt in the bottom centre)
      const p = this.kickT > 0 ? 1 - this.kickT : 0, sw = Math.sin(p * Math.PI);
      I.position.set(0.045 - 0.06 * p + 0.01 * this.reach + this.sx + bx, -0.075 + 0.025 * sw + 0.024 * this.reach - 0.07 * low + this.sy + by, -0.1 - 0.01 * this.reach);
      I.rotation.set(-0.9 - 0.45 * this.reach + 0.2 * sw, 0, (this.kickT > 0 ? 0.5 - 0.9 * p : 0.25) * (1 - this.reach));
    } else {
      const k = this.kickT * this.kickT;
      I.position.set(0.09 + this.sx + bx, -0.078 - 0.1 * low + this.sy + by, -0.185 + 0.025 * k);
      I.rotation.set(0.3 * k, 0, 0);
    }
  }

  dispose() { this.root.removeFromParent(); this.mouth.removeFromParent(); }
}
