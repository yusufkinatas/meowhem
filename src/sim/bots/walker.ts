/** Path following for bots: waypoints from nav.ts, jump timing, closed doors, stuck detection and unsticking. */
import type { DoorDef, Vec3 } from '../../shared/contracts';
import { distXZ } from '../../core/math';
import type { BotIntent, BotWorldView } from './types';
import { clearXZ, planPath, type PathPt } from './nav';

export type WalkState = 'moving' | 'arrived' | 'failed' | 'door';

export class Walker {
  path: PathPt[] = [];
  i = 0;
  target: Vec3 | null = null;
  /** door blocking the path when step() returned 'door' */
  door: DoorDef['id'] | null = null;
  private best = Infinity;
  private stuck = 0;
  private repaths = 0;
  private side = 0;
  private sideDir: [number, number] = [0, 0];
  private age = 0;
  private budget = 12;
  private jumpT = 0;
  private pounceT = 0;
  private pounceYaw = 0;
  /** watchdog: best remaining distance to the target and when it last improved (catches back-and-forth wedging) */
  private far = Infinity;
  private farT = 0;

  /** path: precomputed waypoints (e.g. the flee search's safe route); replans normally if it gets stuck */
  go(v: BotWorldView, target: Vec3, budget?: number, path?: PathPt[]): boolean {
    this.target = [...target];
    this.age = 0;
    this.repaths = 0;
    this.far = Infinity;
    this.farT = 0;
    this.door = null;
    const ok = path?.length ? this.use(v, path) : this.plan(v);
    const len = this.path.reduce((a, p, k) => a + (k ? distXZ(p.p, this.path[k - 1].p) : distXZ(v.self.p, p.p)), 0);
    this.budget = budget ?? 6 + len / 1.6;
    return ok;
  }

  stop() { this.target = null; this.path = []; }

  private plan(v: BotWorldView): boolean {
    const t = this.target!;
    // plan from where the feet will land (a mid-jump height would pick a surface node behind a wall)
    const from: Vec3 = v.self.g ? v.self.p : [v.self.p[0], Math.max(0, v.self.p[1] - 0.6), v.self.p[2]];
    const sitter = v.self.role === 'cat' ? v.chars.find((c) => c.role === 'sitter' && !c.holding) : undefined;
    const p = planPath(v.nav, from, t, { role: v.self.role, doorOpen: (id) => v.doorOpen(id), roomAt: (q) => v.roomAt(q), colliders: v.level.colliders, danger: sitter?.p });
    return this.use(v, p ?? [{ p: t, jump: t[1] > v.self.p[1] + 0.25 }]) && !!p;
  }

  private use(v: BotWorldView, path: PathPt[]): boolean {
    this.path = path;
    // skip waypoints behind us: start from the closest one
    let bi = 0, bd = Infinity;
    for (let k = 0; k < Math.min(3, this.path.length); k++) {
      const d = distXZ(v.self.p, this.path[k].p) + Math.abs(v.self.p[1] - this.path[k].p[1]) * 2;
      if (d < bd) { bd = d; bi = k; }
    }
    this.i = bi;
    this.best = Infinity;
    this.stuck = 0;
    return true;
  }

  /** drive one tick toward the target. arrive = horizontal arrival radius at the last point */
  step(v: BotWorldView, dt: number, out: BotIntent, arrive = 0.4): WalkState {
    const me = v.self;
    if (!this.target) return 'arrived';
    this.age += dt;
    if (this.age > this.budget) { this.stop(); return 'failed'; }
    const togo = distXZ(me.p, this.target) + Math.abs(me.p[1] - this.target[1]);
    if (togo < this.far - 0.3) { this.far = togo; this.farT = this.age; }
    else if (this.age - this.farT > 4) { this.stop(); return 'failed'; }
    const last = this.path.length - 1;
    // advance past reached waypoints
    while (this.i < last) {
      const wp = this.path[this.i];
      const dy = Math.abs(wp.p[1] - me.p[1]);
      const next = this.path[this.i + 1];
      const reached = distXZ(me.p, wp.p) < 0.4 && dy < 0.45;
      // cut corners on the same level when the next point is already closer
      const skip = !next.jump && !next.door && dy < 0.3 && Math.abs(next.p[1] - me.p[1]) < 0.3 && distXZ(me.p, wp.p) < 0.9 && distXZ(me.p, next.p) < distXZ(wp.p, next.p)
        && clearXZ(v.level.colliders, me.p, next.p, me.role === 'cat' ? 0.15 : 0.26, me.p[1], me.role === 'cat' ? 0.4 : 1.6);
      if (!reached && !skip) break;
      this.i++;
      this.best = Infinity;
      this.stuck = 0;
    }
    const wp = this.path[this.i];
    // partial path: we're as close as the graph gets, the rest is a straight try with a short fuse
    if (wp.partial && this.i === last && this.stuck > 0.8) { this.stop(); return 'failed'; }
    // a closed door ahead
    if (wp.door && !v.doorOpen(wp.door) && this.i > 0) {
      const before = this.path[this.i - 1].p;
      if (distXZ(me.p, before) < 1.2 || distXZ(me.p, wp.p) < 1.6) { this.door = wp.door; return 'door'; }
    }
    this.door = null;
    const d = distXZ(me.p, wp.p);
    const dy = wp.p[1] - me.p[1];
    if (this.i === last && d < arrive && Math.abs(dy) < 0.5) { this.stop(); return 'arrived'; }

    // wedged for real (tossed into a corner, stuck on geometry): charge a pounce and leap out
    if (this.pounceT > 0) {
      this.pounceT -= dt;
      out.faceYaw = this.pounceYaw;
      out.jump = this.pounceT > 0;
      return 'moving';
    }
    if (this.side > 0) {
      this.side -= dt;
      out.move = this.sideDir;
      return 'moving';
    }
    out.moveTo = wp.p;
    // jump up onto things: close enough that the arc lands on top
    this.jumpT -= dt;
    if ((dy > 0.25 || (wp.jump && dy > -0.1)) && me.g && this.jumpT <= 0 && d < (dy > 0.6 ? 0.8 : 1.0)) this.jump(out);

    // stuck detection: no progress toward the current waypoint
    const prog = d + Math.abs(dy);
    if (prog < this.best - 0.08) { this.best = prog; this.stuck = 0; }
    else this.stuck += dt;
    // a jump-up blocked from right here (chair, table leg): jump from where we are instead of pushing
    const jumpWp = wp.jump || dy > 0.25;
    if (this.stuck > (jumpWp && d < 1.5 ? 0.3 : 0.9) && me.g && this.jumpT <= 0 && me.role === 'cat') this.jump(out);
    if (this.stuck > 1.8 && me.g) { // plan from the ground, never mid-jump
      if (++this.repaths > 4) { this.stop(); return 'failed'; }
      if (this.repaths >= 3 && me.role === 'cat') { this.pounceT = 0.9; this.pounceYaw = v.rng() * Math.PI * 2; this.stuck = 0; return 'moving'; }
      // sidestep a little, then plan again from wherever we are
      const a = v.rng() * Math.PI * 2;
      this.sideDir = [Math.sin(a), Math.cos(a)];
      this.side = 0.35 + v.rng() * 0.3;
      this.plan(v);
    }
    return 'moving';
  }

  private jump(out: BotIntent) {
    out.jump = true; // one tick held then released = a plain jump
    this.jumpT = 0.6;
  }

  /** straight-line distance left (cheap) */
  left(v: BotWorldView): number {
    return this.target ? distXZ(v.self.p, this.target) : 0;
  }
}
