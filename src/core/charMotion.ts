/**
 * Kinematic character motion shared by the local player (client world) and host bots (sim world).
 * Bots and humans go through exactly this code.
 */
import type { Role, Vec3 } from '../shared/contracts';
import { CFG } from '../config';
import { RAPIER, CHAR_QUERY, G, groups } from './physics';
import { clamp, damp, dampAngle, lerp } from './math';

export interface MotionInput {
  moveX: number;          // world-space desired direction, length <= 1
  moveZ: number;
  faceYaw: number | null; // desired facing, null = face movement
  sprint: boolean;
  jumpHeld: boolean;      // cat: tap = jump, hold = butt-wiggle charge then pounce on release
}

export interface MotionMods { mul: number; frozen: boolean; inSun: boolean }

export const capsule = (role: Role) => (role === 'cat' ? CFG.cat : CFG.sitter);

export class CharMotion {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly ctrl: RAPIER.KinematicCharacterController;
  pos: Vec3;
  vel: Vec3 = [0, 0, 0];
  yaw: number;
  grounded = true;
  stamina: number;
  charge = 0;
  sprinting = false;
  /** set for one step */
  jumped = false;
  landed = 0;
  private regenWait = 0;
  private holdT = 0;
  private wasHeld = false;
  private coyote = 0;
  private readonly lift: number;

  constructor(private world: RAPIER.World, readonly role: Role, pos: Vec3, yaw = 0) {
    const c = capsule(role);
    this.lift = c.radius + c.halfHeight;
    this.pos = [...pos];
    this.yaw = yaw;
    this.stamina = c.stamina;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos[0], pos[1] + this.lift, pos[2]),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(c.halfHeight, c.radius).setCollisionGroups(groups(G.CHAR, G.PROP)),
      this.body,
    );
    this.ctrl = world.createCharacterController(0.02);
    this.ctrl.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.ctrl.setMinSlopeSlideAngle((35 * Math.PI) / 180);
    this.ctrl.enableAutostep(c.step, 0.08, false);
    this.ctrl.enableSnapToGround(0.12);
    this.ctrl.setSlideEnabled(true);
  }

  teleport(p: Vec3, yaw?: number) {
    this.pos = [...p];
    if (yaw !== undefined) this.yaw = yaw;
    this.vel = [0, 0, 0];
    this.charge = 0;
    this.holdT = 0;
    const t = { x: p[0], y: p[1] + this.lift, z: p[2] };
    this.body.setTranslation(t, true);
    this.body.setNextKinematicTranslation(t);
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  /** kinematic follow (host proxy of a remote/forced character) */
  follow(p: Vec3, yaw: number) {
    this.pos[0] = p[0]; this.pos[1] = p[1]; this.pos[2] = p[2];
    this.yaw = yaw;
    this.body.setNextKinematicTranslation({ x: p[0], y: p[1] + this.lift, z: p[2] });
  }

  /** push from outside (pokes, fight separation) */
  impulse(v: Vec3) {
    this.vel[0] += v[0];
    this.vel[1] += v[1];
    this.vel[2] += v[2];
    if (v[1] > 0) this.grounded = false;
  }

  step(dt: number, inp: MotionInput, mods: MotionMods) {
    const c = capsule(this.role);
    this.jumped = false;
    this.landed = 0;
    let mx = mods.frozen ? 0 : inp.moveX;
    let mz = mods.frozen ? 0 : inp.moveZ;
    const held = !mods.frozen && inp.jumpHeld;
    const moving = mx * mx + mz * mz > 0.01;

    // stamina
    this.sprinting = !mods.frozen && inp.sprint && moving && this.stamina > 0 && this.charge === 0;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - dt);
      this.regenWait = c.regenDelay;
    } else if ((this.regenWait -= dt) <= 0) {
      this.stamina = Math.min(c.stamina, this.stamina + c.staminaRegen * (mods.inSun ? CFG.buffs.sunRegenMul : 1) * dt);
    }

    // jump / pounce
    this.coyote = this.grounded ? 0.1 : this.coyote - dt;
    const canJump = this.grounded || this.coyote > 0;
    if (this.role === 'cat') {
      const cc = CFG.cat;
      if (held && canJump) {
        this.holdT += dt;
        if (this.holdT > cc.chargeThreshold) this.charge = clamp((this.holdT - cc.chargeThreshold) / cc.chargeTime, 0, 1);
      }
      if (!held && this.wasHeld && this.holdT > 0 && canJump) {
        const k = this.charge;
        this.vel[1] = lerp(cc.jumpV, cc.pounceV, k);
        this.vel[0] += Math.sin(this.yaw) * cc.pounceFwd * k;
        this.vel[2] += Math.cos(this.yaw) * cc.pounceFwd * k;
        this.jumped = true;
        this.grounded = false;
        this.coyote = 0;
      }
      if (!held || !canJump) { this.holdT = held ? this.holdT : 0; if (!held) this.charge = 0; }
    } else if (held && !this.wasHeld && canJump) {
      this.vel[1] = c.jumpV;
      this.jumped = true;
      this.grounded = false;
      this.coyote = 0;
    }
    this.wasHeld = held;
    if (this.charge > 0) { mx = 0; mz = 0; }

    // facing
    if (inp.faceYaw !== null && !mods.frozen) this.yaw = dampAngle(this.yaw, inp.faceYaw, 14, dt);
    else if (mx * mx + mz * mz > 0.01) this.yaw = dampAngle(this.yaw, Math.atan2(mx, mz), 12, dt);

    // horizontal
    const speed = (this.sprinting ? c.sprint : c.walk) * mods.mul;
    if (this.grounded) {
      this.vel[0] = damp(this.vel[0], mx * speed, 14, dt);
      this.vel[2] = damp(this.vel[2], mz * speed, 14, dt);
    } else if (mx * mx + mz * mz > 0.01) {
      this.vel[0] = damp(this.vel[0], mx * speed, 2.5, dt);
      this.vel[2] = damp(this.vel[2], mz * speed, 2.5, dt);
    }
    this.vel[1] -= CFG.gravity * dt;

    const want = { x: this.vel[0] * dt, y: this.vel[1] * dt, z: this.vel[2] * dt };
    this.ctrl.computeColliderMovement(this.collider, want, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, CHAR_QUERY[this.role]);
    const m = this.ctrl.computedMovement();
    const wasGrounded = this.grounded;
    this.grounded = this.ctrl.computedGrounded();
    if (this.grounded && this.vel[1] < 0) {
      if (!wasGrounded && this.vel[1] < -2) this.landed = -this.vel[1];
      this.vel[1] = 0;
    }
    if (!this.grounded && this.vel[1] > 0 && m.y < want.y - 1e-4) this.vel[1] = 0; // ceiling
    if (dt > 0) {
      this.vel[0] = m.x / dt;
      this.vel[2] = m.z / dt;
    }
    this.pos[0] += m.x;
    this.pos[1] += m.y;
    this.pos[2] += m.z;
    if (this.pos[1] < -5) this.pos[1] = 0.2; // safety net
    this.body.setNextKinematicTranslation({ x: this.pos[0], y: this.pos[1] + this.lift, z: this.pos[2] });
  }

  dispose() {
    this.world.removeCharacterController(this.ctrl);
    this.world.removeRigidBody(this.body);
  }
}
