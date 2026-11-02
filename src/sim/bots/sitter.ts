/**
 * Sitter bot (DESIGN 6 + ADDENDUM M18): grabs the cat doing the most damage, jails or tosses it, fixes hazards,
 * cleans the heaviest mess, undoes, claps, sprays, shakes treats, puts on Cat TV.
 */
import type { DoorDef, RoomId, Vec3 } from '../../shared/contracts';
import { PROP_DEFS } from '../../shared/propDefs';
import { CFG } from '../../config';
import { add, distXZ, facingDot, fwd, yawTo } from '../../core/math';
import { doorBox } from '../../core/physics';
import type { CharState } from '../../core/types';
import { registerBotBrain, type BotBrain, type BotBrainOpts, type BotIntent, type BotOption, type BotWorldView } from './types';
import { BOT_DIFF, type BotDiff } from './difficulty';
import { standNodes } from './nav';
import { Walker } from './walker';

const DISASTERS = new Set(['laptop', 'tubFaucet', 'tpRoll', 'sofa', 'curtains', 'fishTank', 'hideout', 'fuseBox', 'frontDoor', 'carrier']);
const SLIPPY = new Set(['puddle', 'hairball', 'fish', 'food', 'catnip']);
const TOSS_ROOMS: { door: DoorDef['id']; room: RoomId }[] = [
  { door: 'bathroomDoor', room: 'bathroom' }, { door: 'officeDoor', room: 'office' }, { door: 'bedroomDoor', room: 'bedroom' },
];

type Cat = Readonly<CharState>;
interface Task {
  k: 'grab' | 'use' | 'clean' | 'patrol' | 'wait';
  until: number;
  score: number;
  id?: string;       // grab: cat id
  key?: string;      // use / clean key
  at?: Vec3;
  range?: number;
  started?: boolean;
  t0?: number;
}
interface Toss { door: DoorDef['id']; room: RoomId; stand: Vec3; inside: Vec3; phase: 'go' | 'thrown' | 'close'; t: number }

const interKey = (k: string) => k.split(':')[1] ?? '';
/** progress readable from world keys until the sim fills BotOption.progress */
const UNDO_PROGRESS: Record<string, (v: BotWorldView) => number> = {
  laptop: (v) => Number(v.world['laptop.progress'] ?? 0.5), tpRoll: (v) => Number(v.world['tp.unrolled'] ?? 0.5),
  curtains: (v) => Number(v.world['curtains.climb'] ?? 0.5), pillow: (v) => Number(v.world['pillow.knead'] ?? 0.5),
};

class SitterBrain implements BotBrain {
  private D: BotDiff;
  private w = new Walker();
  private task: Task | null = null;
  private toss: Toss | null = null;
  private decideT = 0;
  private missT = 0;
  private ignore = new Map<string, number>();
  /** task keys that failed (unreachable, refused) recently */
  private bad = new Map<string, number>();
  private chaseBest = Infinity;
  private chaseT = 0;
  private sprayT = 0;
  private holdT = 0;
  private inRangeT = 0;
  /** last time each cat was noticed (human-like awareness: room, distance, alerts) */
  private seen = new Map<string, number>();
  private lastAt = new Map<string, Vec3>();
  /** a disaster just landed: stared at it, now busy with the mess for a while */
  private shockSeen = false;
  private messy = 0;

  constructor(o: BotBrainOpts) { this.D = BOT_DIFF[o.difficulty]; }

  think(v: BotWorldView, dt: number): BotIntent {
    const me = v.self, out: BotIntent = {};
    if (me.frozen || me.forced || v.time < this.D.sReact * 2) return out; // a beat to look around at the start
    if (v.time - Number(v.world['scratchPost.t'] ?? -99) < 1) return out; // even the sitter stops and looks
    this.missT -= dt;
    this.sprayT -= dt;
    if (me.holding) { this.holdT += dt; return this.carry(v, dt, out); }
    this.holdT = 0;
    if (this.toss) return this.afterToss(v, out);
    // a disaster landed: sometimes it just stands there, then gets busy with the damage instead of the cats
    if (me.st.shock && !this.shockSeen) {
      this.shockSeen = true;
      if (v.rng() < this.D.sDistract) { this.start(v, { k: 'wait', score: 99, until: v.time + 0.8 + v.rng() * 0.8 }); this.messy = v.time + 6 + v.rng() * 6; }
    } else if (!me.st.shock) this.shockSeen = false;
    if ((this.decideT -= dt) <= 0) {
      this.decideT = this.D.sReact * (0.6 + v.rng() * 0.8);
      this.decide(v);
    }
    this.reflexes(v, out);
    return this.run(v, dt, out);
  }

  // ------------------------------------------------------------------ choosing what to do
  private decide(v: BotWorldView) {
    const me = v.self;
    const cands: Task[] = [];
    const near = (p: Vec3) => 1 + distXZ(me.p, p) / 6;
    const cats = v.chars.filter((c) => c.role === 'cat');
    const myRoom = v.roomAt(me.p);
    for (const c of cats) {
      if (c.st.caged) { this.lastAt.delete(c.id); continue; } // in the carrier: nothing to check on over there
      // a person only knows about cats they can see or hear, plus the alerts on the HUD
      const alerting = (c.work && DISASTERS.has(interKey(c.work.key))) || c.item === 'salmon';
      if (alerting || v.roomAt(c.p) === myRoom || distXZ(c.p, me.p) < this.D.sHear) { this.seen.set(c.id, v.time); this.lastAt.set(c.id, [...c.p]); }
      if (v.time - (this.seen.get(c.id) ?? -99) > 4) continue;
      if (!this.grabbable(v, c) || (this.ignore.get(c.id) ?? 0) > v.time) continue;
      const k = c.work ? interKey(c.work.key) : '';
      // a person goes after the cat doing damage; an idle cat only when it's right there, and not in the first moments
      if (!c.work && !c.item && (distXZ(c.p, me.p) > 6 || v.time < this.D.sGrace)) continue;
      let u = c.work && DISASTERS.has(k) ? 9 + 8 * c.work.progress : c.work ? 3.5 : 0.8;
      if (c.item === 'salmon') u = 10;
      if (c.loaf && v.mess.some((m) => distXZ(m.p, c.p) < 0.6)) u = Math.max(u, 3.5); // sitting on the mess
      if (c.st.eating) u += 4; // treat freeze: free grab
      if (c.p[1] > 0.5 && v.props.some((p) => !p.fallen && distXZ(p.p, c.p) < 0.8)) u = Math.max(u, 2.8); // about to sweep a surface
      if (v.time < this.messy && !alerting) u *= 0.4;
      cands.push({ k: 'grab', id: c.id, score: u / near(c.p), until: v.time + 9 });
    }
    for (const o of v.options) {
      if (!o.ok || (this.bad.get(o.key) ?? 0) > v.time) continue;
      const s = this.optionScore(v, o, cats);
      if (s > 0) cands.push({ k: 'use', key: o.key, at: o.at, range: o.range, score: s / near(o.at), until: v.time + 14 });
    }
    for (const m of v.mess) {
      if (m.p[1] > 1.2 || (this.bad.get(`clean:${m.id}`) ?? 0) > v.time) continue;
      cands.push({ k: 'clean', key: `clean:${m.id}`, at: m.p, score: ((m.w * 1.1 + 0.4) * (v.time < this.messy ? 1.5 : 1)) / near(m.p), until: v.time + 12 });
    }
    for (const p of v.props) {
      if (!p.fallen || p.special || p.p[1] > 1.2 || (this.bad.get(`tidy:${p.id}`) ?? 0) > v.time) continue;
      const w = PROP_DEFS[p.kind].fallenMess;
      if (w > 0) cands.push({ k: 'clean', key: `tidy:${p.id}`, at: p.p, score: (w + 0.3) / near(p.p), until: v.time + 10 });
    }
    let best: Task | null = null;
    for (const t of cands) if (!best || t.score > best.score) best = t;
    const cur = this.task;
    if (cur && v.time < cur.until && best && !(best.score > cur.score * 1.3 && best.key !== cur.key)) {
      // keep the current task; refresh its score
      const same = cands.find((t) => t.k === cur.k && t.key === cur.key && t.id === cur.id);
      if (same) { cur.score = same.score; return; }
      if (cur.k === 'clean' && cur.started) return;
    }
    if (!best) { this.patrol(v); return; }
    if (cur && best.k === cur.k && best.key === cur.key && best.id === cur.id) return;
    this.start(v, best);
  }

  private optionScore(v: BotWorldView, o: BotOption, cats: Cat[]): number {
    const me = v.self, D = this.D, catNear = (r: number) => cats.some((c) => distXZ(c.p, o.at) < r);
    if (o.key.startsWith('u:')) {
      // M18: undo when it's > 0.3 along, no cat within 4 m, and it's within 6 m (no crossing the house for it)
      if (!D.undo || catNear(4) || distXZ(me.p, o.at) > 6) return 0;
      const p = o.progress ?? UNDO_PROGRESS[o.interactable]?.(v) ?? 0.5;
      return p < D.sUndoAt ? 0 : 6 + 7 * p;
    }
    switch (o.label) {
      case 'Turn off the tap': return 9 + (Number(v.world.flood ?? 0) > 0 ? 7 : 0);
      case 'Reset the breaker': return 9;
      case 'Return to sender': return catNear(2.5) ? 9 : 3.5;
      case 'Put dinner back': return 4.5;
      case 'Shake the bowl': return distXZ(me.p, o.at) < 3 ? 6 : 0;
      case 'Refill the spray bottle': return me.ammo <= 0 ? 5 : me.ammo <= 1 ? 2.5 : 0;
      case 'Scoop the litter box': { const f = Number(v.world['litter.fill'] ?? 0); return f >= 1 ? 8 : f >= 0.5 ? 2 : 0.4; }
      case 'Put on Cat TV': {
        const tv = cats.filter((c) => !c.forced && distXZ(c.p, o.at) < 9).length;
        return tv >= 2 ? 7 : tv >= 1 && cats.some((c) => c.work && distXZ(c.p, o.at) < 9) ? 5 : 0;
      }
    }
    return 0;
  }

  private grabbable(v: BotWorldView, c: Cat): boolean {
    if (c.grabbedBy || c.st.caged || c.st.fight || (c.st.grabImmune ?? 0) > 0.6) return false;
    if (c.p[1] - v.self.p[1] > 1.35) return false;
    const hide = v.level.spots.find((s) => s.id === 'hideout');
    if (hide && c.p[1] < 0.3 && distXZ(c.p, hide.pos) < hide.radius) return false; // under the bed
    return true;
  }

  private start(v: BotWorldView, t: Task) {
    this.task = t;
    this.chaseBest = Infinity;
    this.chaseT = 0;
    if (t.at) this.w.go(v, t.at, 14);
    else this.w.stop();
  }

  private patrol(v: BotWorldView) {
    // go check where a cat was last noticed, else walk to another room and look around
    const nodes = standNodes(v.nav, 'sitter');
    let at: Vec3 | undefined;
    // check where a cat was last heard of, not stalk one that's in plain view
    const recent = [...this.lastAt.entries()].filter(([id, p]) => { const ago = v.time - (this.seen.get(id) ?? -99); return ago > 2 && ago < 15 && distXZ(p, v.self.p) > 2; });
    if (recent.length && v.rng() < 0.45) {
      const p = recent[Math.floor(v.rng() * recent.length)][1];
      at = nodes.reduce((b, n) => (distXZ(n, p) < distXZ(b, p) ? n : b), nodes[0] ?? p);
    } else {
      const rooms = v.level.rooms.filter((r) => r.id !== v.roomAt(v.self.p));
      const r = rooms[Math.floor(v.rng() * rooms.length)];
      const inRoom = r ? nodes.filter((n) => v.roomAt(n) === r.id) : nodes;
      at = inRoom[Math.floor(v.rng() * inRoom.length)];
    }
    if (!at) return;
    this.start(v, { k: 'patrol', at, score: 0.5, until: v.time + 8 });
  }

  // ------------------------------------------------------------------ quick reactions: clap, spray, treats
  private reflexes(v: BotWorldView, out: BotIntent) {
    const me = v.self, D = this.D;
    let target: Cat | null = null, td = Infinity;
    for (const c of v.chars) {
      if (c.role !== 'cat' || c.forced || !c.work || !DISASTERS.has(interKey(c.work.key))) continue;
      const d = distXZ(me.p, c.p);
      if (d < td) { td = d; target = c; }
    }
    if (!target) return;
    if (D.clap && td < CFG.clap.range && !me.cd.clap && !target.loaf) out.clap = true;
    else if (td > 1.4 && td < CFG.spray.range && me.ammo > 0 && !me.cd.spray && this.sprayT <= 0 && Math.abs(target.p[1] - me.p[1]) < 1.6) {
      out.spray = this.aim(v, target);
      out.faceYaw = yawTo(me.p, target.p);
      this.sprayT = 0.6;
    } else if (!me.cd.treats && td > 6 && td < CFG.treats.range && v.rng() < 0.3) {
      out.treats = true;
      this.start(v, { k: 'wait', score: 3, until: v.time + 2.5 });
    }
  }

  private aim(v: BotWorldView, c: Cat): Vec3 {
    const me = v.self;
    const err = ((v.rng() * 2 - 1) * this.D.aimDeg * Math.PI) / 180;
    const nz: Vec3 = [me.p[0], me.p[1] + 1.25, me.p[2]];
    const dx = c.p[0] - nz[0], dy = c.p[1] + 0.2 - nz[1], dz = c.p[2] - nz[2];
    const yaw = Math.atan2(dx, dz) + err, h = Math.hypot(dx, dz);
    return [Math.sin(yaw) * h, dy + (v.rng() - 0.5) * h * 0.1, Math.cos(yaw) * h];
  }

  // ------------------------------------------------------------------ running a task
  private run(v: BotWorldView, dt: number, out: BotIntent): BotIntent {
    const me = v.self, t = this.task;
    if (!t) { this.patrol(v); return out; }
    if (v.time > t.until) return this.done(out);
    const walk = (arrive: number) => {
      const st = this.w.target ? this.w.step(v, dt, out, arrive) : 'arrived';
      if (st === 'door') { this.openDoor(v, out, this.w.door!); return false; }
      if (st === 'failed') { this.fail(v, out); return false; }
      this.sprint(v, out);
      return st === 'arrived';
    };
    switch (t.k) {
      case 'grab': {
        const c = v.chars.find((x) => x.id === t.id);
        if (!c || !this.grabbable(v, c)) return this.done(out);
        const d = distXZ(me.p, c.p);
        // give up on a chase that goes nowhere
        if (d < this.chaseBest - 0.3) { this.chaseBest = d; this.chaseT = 0; }
        else if ((this.chaseT += dt) > (c.work ? 2 : 1) * this.D.sChase) { this.ignore.set(c.id, v.time + 6); return this.done(out); }
        if (d < CFG.grab.range - 0.25 && Math.abs(c.p[1] - me.p[1]) < 1.35) {
          // in reach but the grab keeps not happening (wedged, refused): try someone else
          if ((this.inRangeT += dt) > 2.5) { this.inRangeT = 0; this.ignore.set(c.id, v.time + 4); return this.done(out); }
          out.faceYaw = yawTo(me.p, c.p);
          if (d > 0.6) out.moveTo = c.p;
          if (this.missT <= 0 && facingDot(me.yaw, me.p, c.p) > 0.6) {
            // keeps rounds close: sloppy while the house is still fine (full D.grab from 50%), and with only one or two cats to watch
            const few = Math.min(1, 0.4 + 0.15 * v.chars.filter((x) => x.role === 'cat').length);
            if (v.rng() < this.D.grab * few * Math.min(1, 0.6 + 0.8 * v.meter / 100)) out.interact = `grab:${c.id}`;
            else this.missT = this.D.sFumble * (0.7 + v.rng() * 0.6); // fumbled it
          }
          return out;
        }
        this.inRangeT = 0;
        // re-plan when the cat has moved away from where we're heading
        if (!this.w.target || distXZ(this.w.target, c.p) > 1.2) this.w.go(v, c.p, 10);
        if (d < 3 && Math.abs(c.p[1] - me.p[1]) < 0.6) { out.moveTo = c.p; this.sprint(v, out); }
        else walk(0.6);
        if (d < 3.5) out.faceYaw = undefined;
        return out;
      }
      case 'use': {
        if (me.work?.key === t.key) { t.started = true; out.interact = t.key; return out; }
        if (t.started) return this.done(out);
        const o = v.options.find((x) => x.key === t.key);
        if (!o || !o.ok) return this.done(out);
        const inRange = distXZ(me.p, o.at) < Math.min(o.range * 0.85, 1.1) && Math.abs(me.p[1] - o.at[1]) < 1.2;
        if (inRange || walk(Math.min(o.range * 0.7, 0.8))) {
          this.w.stop();
          out.interact = t.key;
          if (t.t0 === undefined) t.t0 = v.time;
          else if (v.time - t.t0 > 0.8 && !me.work) { if (!o.key.startsWith('i:') || o.label.startsWith('Turn')) this.bad.set(t.key!, v.time + 3); return this.done(out); } // instant use, or it refused
        }
        return out;
      }
      case 'clean': {
        if (me.work?.key === t.key) { t.started = true; out.interact = t.key; return out; }
        const gone = t.key!.startsWith('clean:') ? !v.mess.some((m) => `clean:${m.id}` === t.key) : !v.props.some((p) => `tidy:${p.id}` === t.key && p.fallen);
        if (gone || t.started) return this.done(out);
        const inRange = distXZ(me.p, t.at!) < CFG.interact.cleanRange * 0.85;
        if (inRange || walk(0.8)) {
          this.w.stop();
          out.interact = t.key;
          out.faceYaw = yawTo(me.p, t.at!);
          if (t.t0 === undefined) t.t0 = v.time;
          else if (v.time - t.t0 > 1 && !me.work) return this.fail(v, out); // someone's sitting on it, or out of reach
        }
        return out;
      }
      case 'wait': return out;
      case 'patrol': default:
        if (walk(0.8)) return this.done(out);
        return out;
    }
  }

  private fail(v: BotWorldView, out: BotIntent): BotIntent {
    const t = this.task;
    if (t?.key) this.bad.set(t.key, v.time + 12);
    if (t?.id) this.ignore.set(t.id, v.time + 6);
    return this.done(out);
  }

  private done(out: BotIntent): BotIntent {
    this.task = null;
    this.w.stop();
    this.decideT = Math.min(this.decideT, 0.1);
    out.interact = null;
    return out;
  }

  private sprint(v: BotWorldView, out: BotIntent) {
    const me = v.self;
    const far = this.w.left(v) > 2.5 || this.task?.k === 'grab';
    if (!far || me.stamina < 0.2) return;
    // Feral watches its feet, Kitten runs through everything
    if (this.D.aimDeg <= 3 && v.mess.some((m) => SLIPPY.has(m.kind) && distXZ(m.p, me.p) < 1.6)) return;
    out.sprint = true;
  }

  private openDoor(v: BotWorldView, out: BotIntent, id: DoorDef['id']) {
    const o = v.options.find((x) => x.interactable === id && x.label === 'Open the door');
    const spot = v.level.spots.find((s) => s.id === id);
    if (!o || !spot) return;
    if (distXZ(v.self.p, o.at) < Math.min(o.range * 0.9, 1.2)) out.interact = o.key;
    else out.moveTo = o.at;
  }

  // ------------------------------------------------------------------ holding a cat: carrier, or toss into a room and shut the door
  private carry(v: BotWorldView, dt: number, out: BotIntent): BotIntent {
    const me = v.self;
    const held = v.chars.find((c) => c.id === me.holding);
    const jail = v.options.find((o) => o.interactable === 'carrier' && o.ok && o.key.startsWith('i:'));
    if (jail && distXZ(me.p, jail.at) < 8.5 && !this.toss) {
      if (distXZ(me.p, jail.at) < Math.min(jail.range * 0.85, 1.3)) { out.interact = jail.key; this.w.stop(); return out; }
      if (!this.w.target || distXZ(this.w.target, jail.at) > 0.5) this.w.go(v, jail.at, 8);
      const st = this.w.step(v, dt, out, 0.9);
      if (st === 'door') this.openDoor(v, out, this.w.door!);
      return out;
    }
    if (!this.toss) this.toss = this.planToss(v);
    const t = this.toss;
    if (!t) { if (this.holdT > 1.5) out.interact = 'drop'; return out; }
    const urgent = (held?.mash ?? 0) > 0.8;
    const d = distXZ(me.p, t.stand);
    if (!v.doorOpen(t.door)) { this.openDoor(v, out, t.door); return out; }
    if (t.phase === 'go' && (d < 0.5 || (urgent && distXZ(me.p, t.inside) < 4))) {
      out.faceYaw = yawTo(me.p, t.inside);
      if (facingDot(me.yaw, me.p, t.inside) > 0.85 || urgent) {
        const f = fwd(yawTo(me.p, t.inside));
        out.toss = [f[0], 0.35, f[2]];
        t.phase = 'thrown';
        t.t = v.time;
      }
      return out;
    }
    if (t.phase === 'thrown') {
      // toss not available (or refused): put the cat down facing into the room
      out.faceYaw = yawTo(me.p, t.inside);
      if (v.time - t.t > 0.4) out.interact = 'drop';
      return out;
    }
    if (!this.w.target || distXZ(this.w.target, t.stand) > 0.3) this.w.go(v, t.stand, 10);
    const st = this.w.step(v, dt, out, 0.4);
    if (st === 'door') this.openDoor(v, out, this.w.door!);
    if (st === 'failed') { this.toss = null; out.interact = 'drop'; }
    return out;
  }

  private planToss(v: BotWorldView): Toss | null {
    const me = v.self;
    if (!this.D.toss) return null;
    let best: Toss | null = null, bs = Infinity;
    TOSS_ROOMS.forEach((r, i) => {
      const d = v.level.doors.find((x) => x.id === r.door);
      const room = v.level.rooms.find((x) => x.id === r.room);
      if (!d || !room) return;
      const c = doorBox(d).center;
      const n = fwd(d.closedYaw); // panel normal
      const mid: Vec3 = [(room.min[0] + room.max[0]) / 2, 0, (room.min[2] + room.max[2]) / 2];
      const into = Math.sign((mid[0] - c[0]) * n[0] + (mid[2] - c[2]) * n[2]) || 1;
      const inside = add([c[0], 0, c[2]], n, into * 1.6);
      const stand = add([c[0], 0, c[2]], n, -into * 0.9);
      const score = distXZ(me.p, stand) + i * 1.5;
      if (score < bs) { bs = score; best = { door: r.door, room: r.room, stand, inside, phase: 'go', t: v.time }; }
    });
    return best;
  }

  /** after a toss: shut the door once the cat is in there */
  private afterToss(v: BotWorldView, out: BotIntent): BotIntent {
    const t = this.toss!;
    if (t.phase !== 'close') { t.phase = 'close'; t.t = v.time; }
    const o = v.options.find((x) => x.interactable === t.door && x.label === 'Close the door');
    if (v.time - t.t > 4 || !v.doorOpen(t.door)) { this.toss = null; return out; }
    const cat = v.chars.find((c) => c.role === 'cat' && v.roomAt(c.p) === t.room && !c.st.caged);
    if (!cat || !o) return out;
    if (!o.ok) return out; // someone's in the way: wait
    if (distXZ(v.self.p, o.at) < Math.min(o.range * 0.9, 1.2)) { out.interact = o.key; this.toss = null; }
    else out.moveTo = o.at;
    return out;
  }
}

registerBotBrain('sitter', (o) => new SitterBrain(o), 10);
