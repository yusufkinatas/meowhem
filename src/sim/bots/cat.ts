/**
 * Cat bots: personalities (DESIGN 6), difficulty (ADDENDUM 3.3) and the M18 behaviors.
 * One goal at a time, re-decided every `react` seconds; a Walker drives the path.
 */
import type { BoxCollider, DoorDef, LevelData, RoomId, Vec3 } from '../../shared/contracts';
import { MESS_WEIGHTS, PROP_DEFS } from '../../shared/propDefs';
import { add, clamp, distXZ, facingDot, fwd, yawTo } from '../../core/math';
import { doorBox } from '../../core/physics';
import type { CharState } from '../../core/types';
import type { PropView } from '../interactables/types';
import { registerBotBrain, type BotBrain, type BotBrainOpts, type BotIntent, type BotOption, type BotWorldView } from './types';
import { BOT_DIFF, type BotDiff } from './difficulty';
import { grabbableFrom, navNodes, reachFrom, reachPath, standNodes } from './nav';
import { CFG, scaleFor } from '../../config';
import { Walker } from './walker';

type Pers = 'goblin' | 'gremlin' | 'opportunist' | 'sleepy';
const PERS: Pers[] = ['goblin', 'gremlin', 'opportunist', 'sleepy'];
const WEIGHT: Record<Pers, { disaster: number; knock: number; mischief: number; loaf: number; idle: number }> = {
  goblin: { disaster: 3, knock: 0.7, mischief: 0.5, loaf: 0.2, idle: 0.25 },
  gremlin: { disaster: 1.1, knock: 2.6, mischief: 1, loaf: 0.3, idle: 0.35 },
  opportunist: { disaster: 2, knock: 1.6, mischief: 0.6, loaf: 0.3, idle: 0.3 },
  sleepy: { disaster: 0.8, knock: 0.5, mischief: 0.8, loaf: 2.4, idle: 0.8 },
};
/** how much a cat use is worth to a bot (permanent points, roughly) */
const VALUE: Record<string, number> = {
  laptop: 12, tubFaucet: 15, tpRoll: 8, sofa: 8, curtains: 10, fishTank: 9, salmon: 9, fuseBox: 6, frontDoor: 7,
  pillow: 3, plant: 3, laundry: 2.5, window: 2.5, foodBowl: 2, sink: 1.5, tv: 3, shoes: 0.6,
};
/** bot seconds per use at 1x (Use.time), for "can I finish before the sitter gets here" */
const WORK_T: Record<string, number> = { laptop: 15, tubFaucet: 8, tpRoll: 11, sofa: 6, curtains: 11, fishTank: 14, frontDoor: 5, fuseBox: 1.5, carrier: 3.5, hideout: 5 };
const interKey = (k: string) => k.split(':')[1] ?? '';
/** never chosen as goals (scratchPost: they never use it; the rest are handled by dedicated behaviors) */
const NEVER = new Set(['scratchPost', 'litterBox', 'carrier', 'hideout', 'bathroomDoor', 'bedroomDoor', 'officeDoor']);
const SHARED = new Set(['laptop', 'tpRoll', 'sofa', 'frontDoor']);
const INNOCENT_ROOMS: RoomId[] = ['kitchen', 'office', 'living'];

type GoalKind = 'use' | 'knock' | 'push' | 'loaf' | 'wander' | 'stare' | 'flee' | 'innocent' | 'perch' | 'beg' | 'hall' | 'zoom' | 'treat' | 'hairball' | 'poopSpot';
interface Goal {
  k: GoalKind;
  until: number;
  key?: string;
  at?: Vec3;
  prop?: number;
  face?: number;
  look?: Vec3;
  started?: boolean;
  arrived?: boolean;
  t?: number;          // generic timer (meows, sit time)
  alt?: Vec3;          // zoom: second room, innocent: the perch to return to
  resume?: number;     // innocent: time to climb back
  guard?: boolean;     // loaf: sitting on the running tap so the sitter can't turn it off (stays put)
  since?: number;      // knock/push: when we got there (give up if it never works out)
}
interface DoorState { id: DoorDef['id']; phase: 'yowl' | 'hang' | 'sit' | 'block'; t: number; meowT: number }

// staring at nothing: shared so a second idle cat can join the same corner
const stares = new Map<string, { level: LevelData; p: Vec3; until: number }>();

const head = (c: Readonly<CharState>, h = 1.6): Vec3 => [c.p[0], c.p[1] + h, c.p[2]];
const lift = (kind: PropView['kind']) => { const d = PROP_DEFS[kind]; return d.shape === 'box' ? d.half![1] : d.shape === 'cyl' ? d.hh! : d.r!; };

/** the furniture top a prop rests on, the outward direction of its nearest edge, and where a cat stands to push it off */
export function propEdge(level: LevelData, pr: PropView): { dist: number; out: Vec3; top: number; stand: Vec3 } | null {
  const bottom = pr.p[1] - lift(pr.kind);
  let best: { dist: number; out: Vec3; top: number; stand: Vec3 } | null = null;
  for (const b of level.colliders as BoxCollider[]) {
    if (b.tag === 'floor' || b.tag === 'rug' || b.tag === 'wall' || b.tag === 'catOnly') continue;
    const top = b.center[1] + b.half[1];
    if (Math.abs(top - bottom) > 0.08 || b.half[0] > 3 || b.half[2] > 3) continue;
    const r = b.rotY ?? 0, dx = pr.p[0] - b.center[0], dz = pr.p[2] - b.center[2];
    const lx = dx * Math.cos(r) - dz * Math.sin(r), lz = dx * Math.sin(r) + dz * Math.cos(r);
    if (Math.abs(lx) > b.half[0] + 0.02 || Math.abs(lz) > b.half[2] + 0.02) continue;
    const edges: [number, number, number][] = [[b.half[0] - lx, 1, 0], [b.half[0] + lx, -1, 0], [b.half[2] - lz, 0, 1], [b.half[2] + lz, 0, -1]];
    edges.sort((a, c) => a[0] - c[0]);
    const [d, ox, oz] = edges[0];
    const out: Vec3 = [ox * Math.cos(r) + oz * Math.sin(r), 0, -ox * Math.sin(r) + oz * Math.cos(r)];
    // stand 0.38 m inward of the prop, kept on the surface
    const inset = (h: number, v: number) => (h < 0.16 ? 0 : clamp(v, -h + 0.13, h - 0.13));
    const sx = inset(b.half[0], lx - ox * 0.38), sz = inset(b.half[2], lz - oz * 0.38);
    const stand: Vec3 = [b.center[0] + sx * Math.cos(r) + sz * Math.sin(r), top, b.center[2] - sx * Math.sin(r) + sz * Math.cos(r)];
    if (!best || d < best.dist) best = { dist: d, out, top, stand };
  }
  return best;
}

class CatBrain implements BotBrain {
  private D: BotDiff;
  private pers: Pers;
  private W: (typeof WEIGHT)[Pers];
  private w = new Walker();
  private goal: Goal | null = null;
  private door: DoorState | null = null;
  private decideT = 0;
  private idleSince = 0;
  private bad = new Map<string, number>();
  private looking = false;
  private prevLeft = Infinity;
  private carWatch = false;
  private zoomUntil = 0;
  // forced-state memory
  private forcedKind = '';
  private forcedT = 0;
  private noodleFor = 0;
  private hissed = false;
  private flinchAt = -1;
  private treatRoll: boolean | null = null;
  private innocenceRoll: boolean | null = null;
  private sitterRoom: RoomId | null = null;
  private pushRolled = new Set<number>();
  private hissCd = 0;
  /** the disaster we were chased off (progress is kept, so go back when the coast is clear) */
  private resume: { key: string; until: number } | null = null;
  /** the sitter just turned the tap off: not worth running straight back */
  private tapWas = false;
  private tapCool = 0;
  private swipeT = 0;
  private meowT = 0;
  /** when the sitter started coming at us (-1 = not), we bolt one reaction time later */
  private threatAt = -1;
  private fledAt = -99;

  constructor(private o: BotBrainOpts) {
    this.D = BOT_DIFF[o.difficulty];
    this.pers = PERS[o.index % PERS.length];
    this.W = WEIGHT[this.pers];
  }

  think(v: BotWorldView, dt: number): BotIntent {
    const me = v.self, out: BotIntent = {};
    const sitter = v.chars.find((c) => c.role === 'sitter');
    this.timeline(v);
    if (me.forced) return this.forced(v, dt, out);
    this.forcedKind = '';
    if (me.st.hairball) { const r = this.nearestRug(v); if (r) out.moveTo = r.c; return out; }
    if (me.frozen) return out;
    this.swipeT -= dt;
    this.meowT -= dt;

    // the first scratching-post use of the round: everyone stops and stares for 1 s
    const sp = Number(v.world['scratchPost.t'] ?? -99);
    if (v.time - sp < 1 && v.world['scratchPost.by'] !== me.id) return out;

    this.watchSitter(v, sitter);
    if ((this.decideT -= dt) <= 0) {
      this.decideT = this.D.react * (0.6 + v.rng() * 0.8);
      this.decide(v, sitter);
    }
    this.run(v, dt, out, sitter);
    if (this.hissBack(v)) out.hiss = true;
    return out;
  }

  // ------------------------------------------------------------------ forced states
  private forced(v: BotWorldView, dt: number, out: BotIntent): BotIntent {
    const me = v.self, st = me.st, D = this.D;
    this.w.stop();
    this.goal = null;
    this.door = null;
    const kind = me.grabbedBy ? 'grab' : st.caged ? 'cage' : st.hypnotized ? 'tv' : st.fight ? 'fight' : 'other';
    if (kind !== this.forcedKind) {
      this.forcedKind = kind;
      this.forcedT = 0;
      this.hissed = false;
      this.noodleFor = kind === 'grab' && v.rng() < D.noodle ? 2 + v.rng() * 2 : 0;
      this.flinchAt = kind === 'fight' && v.rng() < D.flinch ? 0.2 + v.rng() * 1.1 : -1;
    }
    this.forcedT += dt;
    const rate = (r: number) => v.rng() < r * dt;
    if (kind === 'grab') {
      if (st.limp) return out;
      // noodle: no wiggles for a while (the sim turns it into noodle after 2 s), then wiggle out
      if (this.forcedT < (st.limp ?? 0) + 1 + this.noodleFor && this.noodleFor > 0) return out;
      out.mash = rate(D.wiggle);
      if (!this.hissed && me.mash >= 0.5) { out.hiss = true; this.hissed = true; }
    } else if (kind === 'cage') out.mash = rate(D.wiggle);
    else if (kind === 'tv') out.mash = this.forcedT > D.hypno && rate(8);
    else if (kind === 'fight') {
      const stare = 1.5;
      if (this.forcedT < stare) out.mash = this.flinchAt >= 0 && this.forcedT >= this.flinchAt && (this.flinchAt = -1, true);
      else out.mash = rate(D.brawl);
    }
    return out;
  }

  // ------------------------------------------------------------------ timeline beats (1:00 zoomies, 0:08 car)
  private timeline(v: BotWorldView) {
    const tap = v.world['tub.running'] === true;
    if (this.tapWas && !tap && v.world['done.tubFaucet'] !== true) this.tapCool = v.time + 35 + v.rng() * 20;
    this.tapWas = tap;
    const t = v.timeLeft, prev = this.prevLeft;
    this.prevLeft = t;
    if (prev > 60 && t <= 60) this.zoomUntil = v.time + 10;
    if (prev > 8 && t <= 8 && v.rng() < 0.5) this.carWatch = true;
  }

  // ------------------------------------------------------------------ decisions
  private decide(v: BotWorldView, sitter: Readonly<CharState> | undefined) {
    const me = v.self, g = this.goal;
    const working = !!me.work;
    const workingAlert = working && this.optionFor(v, me.work!.key)?.alert;
    if (workingAlert && me.work!.progress > 0.05) this.resume = { key: me.work!.key, until: v.time + 40 };
    // just wiggled free / out of the carrier: put distance between us first
    if (sitter && (me.st.grabImmune ?? 0) > 2 && g?.k !== 'flee' && distXZ(sitter.p, me.p) < 5) return this.flee(v, sitter);
    const minigame = me.work?.mode === 'minigame';

    // carrying dinner: under the bed, now
    if (me.item === 'salmon' && g?.k !== 'use') {
      const eat = v.options.find((o) => o.interactable === 'hideout' && o.ok);
      if (eat) return this.setUse(v, eat, 20);
    }
    // counter innocence: off the counter and sitting nicely (fleeing is watchSitter's job)
    if (sitter && g?.k !== 'flee' && this.innocence(v, sitter, !!workingAlert)) return;
    // up where the sitter can't reach while it's around: stay put
    if (sitter && me.g && me.p[1] - sitter.p[1] > 1.45 && distXZ(sitter.p, me.p) < this.D.flee + 1.5 && !working && (!g || g.k === 'flee' || g.k === 'wander' || (g.at && g.at[1] < me.p[1] - 0.5))) {
      this.goal = { k: 'loaf', at: [...me.p], until: v.time + 1.5 + v.rng() * 2, arrived: true };
      this.w.stop();
      return;
    }
    if (g?.k === 'flee') {
      // still being chased at the end of a run: keep going
      if (sitter && v.time > g.until - 0.6 && this.threat(v, sitter)) this.flee(v, sitter);
      return;
    }
    if (this.goal?.k === 'innocent' || this.goal?.k === 'perch') return;
    // 0:08: some of them go sit by the front door
    if (this.carWatch && !minigame && g?.k !== 'hall') return this.hall(v);
    if (g?.k === 'hall') return;
    // 1:00 evening zoomies
    if (v.time < this.zoomUntil && !minigame && g?.k !== 'zoom') return this.zoom(v);
    if (g?.k === 'zoom') return;
    // treats: the bag works (often)
    if (me.st.treat && sitter) {
      if (this.treatRoll === null) this.treatRoll = v.rng() < this.D.treats;
      if (this.treatRoll && g?.k !== 'treat' && !minigame && distXZ(sitter.p, me.p) < 9) { this.goal = { k: 'treat', until: v.time + 6 }; this.w.stop(); return; }
    } else this.treatRoll = null;
    if (g?.k === 'treat') return;
    // a friend in the carrier
    // a friend in the carrier: one rescuer at a time, and only while the sitter isn't standing guard
    const free = v.options.find((o) => o.interactable === 'carrier' && o.ok && (this.bad.get(o.key) ?? 0) < v.time);
    const helper = free && v.chars.some((c) => c.id !== me.id && c.role === 'cat' && !c.st.caged && distXZ(c.p, free.at) < 2.5 && distXZ(me.p, free.at) > 2.5);
    if (free && !helper && (!sitter || distXZ(sitter.p, free.at) > 5) && !(g?.k === 'use' && g.key === free.key) && !workingAlert) return this.setUse(v, free, 14);
    // the litter box: fresh box rush, or just needing to go
    const box = v.options.find((o) => o.interactable === 'litterBox' && o.label !== 'Go right here' && o.ok);
    const here = v.options.find((o) => o.interactable === 'litterBox' && o.label === 'Go right here' && o.ok);
    // just ran from the sitter and it's still by the box: wait it out
    const hot = !!box && !!sitter && v.time - this.fledAt < 6 && distXZ(sitter.p, box.at) < Math.max(3, this.D.flee * 0.7);
    const rush = box && !hot && (this.bad.get(box.key) ?? 0) < v.time && (v.world['litter.fresh'] === true ? me.poop >= 0.5 : me.poop >= 0.8);
    if (here && (this.pers !== 'gremlin' || g?.k === 'poopSpot' || g?.k === 'loaf')) { if (!(g?.k === 'use' && g.key === here.key)) return this.setUse(v, here, 6); return; }
    if (rush && !(g?.k === 'use' && g.key === box!.key) && !minigame) return this.setUse(v, box!, 18);
    if (me.poop >= 1 && !box && !here && this.pers === 'gremlin' && g?.k !== 'poopSpot') return this.poopSpot(v);

    // keep the current goal while it lasts
    if (g && v.time < g.until) return;
    if (working) return;
    this.pick(v, sitter);
  }

  /** coming at me with intent: close, or closing in fast within my flee radius */
  private threat(v: BotWorldView, s: Readonly<CharState>): boolean {
    const me = v.self;
    if (s.holding || s.st.stunned || s.st.slip || s.forced) return false;
    if (Math.abs(s.p[1] - me.p[1]) > 1.45) return false; // out of reach up here
    const d = distXZ(s.p, me.p);
    if (d < 1.7) return true;
    if (d > this.D.flee) return false;
    // heading at me, not just passing by (a sitter rounding furniture toward me still counts up close)
    const sp = Math.hypot(s.v[0], s.v[2]);
    if (sp < 0.8) return facingDot(s.yaw, s.p, me.p) > 0.9 && d < this.D.flee * 0.45;
    const heading = (s.v[0] * (me.p[0] - s.p[0]) + s.v[2] * (me.p[2] - s.p[2])) / (d * sp);
    return heading > (d < 3 ? 0.5 : 0.85);
  }

  /** every tick: notice the sitter coming (one reaction time), then run. Mid-disaster and nearly done: finish it. */
  private watchSitter(v: BotWorldView, s: Readonly<CharState> | undefined) {
    const me = v.self, g = this.goal;
    const kittenSits = this.o.difficulty === 'kitten' && g?.k === 'innocent'; // Kitten keeps sitting nicely and gets picked up
    const guarding = g?.guard && g.arrived && v.world['tub.running'] === true; // sitting on the tap: let it come
    if (!s || g?.k === 'flee' || kittenSits || guarding || !this.threat(v, s)) { this.threatAt = -1; return; }
    // mid-disaster: running away hands the sitter a free Undo, so keep at it while it's still a couple of steps off,
    // and to the end if it finishes before the sitter's hand gets here
    const w = me.work, d = distXZ(s.p, me.p);
    if (w && this.optionFor(v, w.key)?.alert && d > 2.3) {
      const left = (1 - w.progress) * (WORK_T[interKey(w.key)] ?? 8) * this.D.work * scaleFor(v.chars.filter((c) => c.role === 'cat').length).work;
      if (w.progress > 0.85 || left < Math.max(0, d - CFG.grab.range) / CFG.sitter.sprint + 0.4 || d > 3.2) return;
    }
    // already on edge (just ran): no second reaction time
    if (this.threatAt < 0) this.threatAt = v.time + (v.time - this.fledAt < 2.5 ? 0 : this.D.react * (0.6 + v.rng() * 0.8));
    if (v.time >= this.threatAt) { this.threatAt = -1; this.flee(v, s); }
  }

  /**
   * Run where the sitter can't follow in time: a Dijkstra over the cat graph that only expands nodes the cat reaches
   * before the sitter can stand within grab range of them (the sitter's own Dijkstra, doors cost it a moment).
   * Best: perches above its reach, under the bed, another room, far ahead of it. Cornered: the least bad node.
   */
  private flee(v: BotWorldView, s: Readonly<CharState>) {
    const me = v.self, nav = v.nav, { pos } = navNodes(nav), near = grabbableFrom(nav);
    const opts = { doorOpen: (id: DoorDef['id']) => v.doorOpen(id), roomAt: (q: Vec3) => v.roomAt(q), colliders: v.level.colliders };
    const sr = reachFrom(nav, s.p, { role: 'sitter', ...opts, maxD: 30 });
    const hide = v.level.spots.find((x) => x.id === 'hideout');
    const SIT = CFG.sitter.sprint, CAT = CFG.cat.sprint * 0.92, GR = CFG.grab.range;
    // seconds until the sitter can grab a cat standing on node i
    const sitterT = (i: number) => {
      if (hide && distXZ(pos[i], hide.pos) < hide.radius && pos[i][1] < 0.3) return Infinity; // under the bed
      let d = Infinity;
      for (const j of near[i]) d = Math.min(d, sr ? sr.d[j] : distXZ(pos[j], s.p));
      return Math.max(0, d - GR) / SIT;
    };
    const st = new Float64Array(pos.length).fill(-1);
    const T = (i: number) => (st[i] < 0 ? (st[i] = sitterT(i)) : st[i]);
    // lead = how much sooner the cat gets somewhere than the sitter's hand. Keep about the lead we have now.
    const startNode = reachFrom(nav, me.p, { role: 'cat', ...opts, maxD: 0 })?.start ?? -1;
    const L0 = startNode >= 0 ? Math.min(T(startNode), 0.4) : 0;
    const lead = (i: number, d: number) => T(i) - d / CAT;
    const cr = reachFrom(nav, me.p, { role: 'cat', ...opts, throughDoors: false, maxD: 14, keep: (i, d) => lead(i, d) >= L0 - 0.2 });
    const sroom = v.roomAt(s.p);
    let best = -1, bs = -Infinity, least = -1, ls = -Infinity;
    if (cr) for (let i = 0; i < pos.length; i++) {
      const d = cr.d[i];
      if (d === Infinity) continue;
      const l = Math.min(lead(i, d), 3);
      if (d > 1.6 && l > ls) { ls = l; least = i; }
      if ((d < 2 && T(i) !== Infinity) || l < L0 - 0.2) continue;
      const score = l * 2 + (T(i) === Infinity ? 6 : pos[i][1] > 0.5 ? 0.6 : 0) + (v.roomAt(pos[i]) !== sroom ? 1 : 0) - d * 0.08 + v.rng();
      if (score > bs) { bs = score; best = i; }
    }
    if (best < 0) best = least; // nearly cornered: the least bad place we can reach
    let at: Vec3 | null = null, path;
    if (cr && best >= 0) { at = pos[best]; path = reachPath(nav, cr, best); }
    else {
      // cornered: anywhere 2 to 6 m off that puts more room between us (past it if need be)
      const any = reachFrom(nav, me.p, { role: 'cat', ...opts, throughDoors: false, maxD: 6 });
      let bd = -Infinity;
      if (any) for (let i = 0; i < pos.length; i++) {
        const d = any.d[i];
        if (d < 2 || d === Infinity) continue;
        const sc = distXZ(pos[i], s.p) + (T(i) === Infinity ? 5 : 0) + v.rng();
        if (sc > bd) { bd = sc; at = pos[i]; path = reachPath(nav, any, i); }
      }
    }
    if (!at) return;
    this.fledAt = v.time;
    this.goal = { k: 'flee', until: v.time + 2 + v.rng() * 1.5, at };
    this.w.go(v, at, 6, path);
    this.lookAt(v, null);
  }

  private innocence(v: BotWorldView, s: Readonly<CharState>, busy: boolean): boolean {
    const me = v.self, room = v.roomAt(me.p), sroom = v.roomAt(s.p);
    const entered = sroom !== this.sitterRoom && sroom === room;
    this.sitterRoom = sroom;
    const g = this.goal;
    if (g?.k === 'innocent') {
      if (v.time > g.until || (g.at && v.roomAt(g.at) !== room)) { this.goal = null; return false; } // moved, or bored of it
      const near = sroom === room || distXZ(s.p, me.p) < 6;
      if (near) g.resume = undefined;
      else if (g.resume === undefined) g.resume = v.time + 2 + v.rng() * 2;
      else if (v.time > g.resume && g.alt) {
        this.goal = { k: 'perch', until: v.time + 8, at: g.alt };
        this.w.go(v, g.alt, 8);
        this.lookAt(v, null);
      }
      return true;
    }
    if (me.p[1] < 0.5 || !me.g || busy || !room || !INNOCENT_ROOMS.includes(room)) { if (me.g) this.innocenceRoll = null; return false; }
    const d = distXZ(s.p, me.p);
    const trig = entered || (d < 5 && (sroom === room || v.sitterSees(me.id))) || (s.gest === 'clap' && d < 6);
    if (!trig) { if (sroom !== room && d > 6) this.innocenceRoll = null; return false; }
    if (this.innocenceRoll === null) this.innocenceRoll = v.rng() < this.D.innocence;
    if (!this.innocenceRoll) return false;
    // hop down to the nearest floor spot and sit there looking innocent
    let seat: Vec3 | null = null, bd = 2.6;
    for (const n of standNodes(v.nav, 'sitter')) {
      const dd = distXZ(n, me.p);
      if (dd < bd && v.roomAt(n) === room) { bd = dd; seat = n; }
    }
    if (!seat) { const f = fwd(yawTo(s.p, me.p) + Math.PI); seat = [me.p[0] + f[0] * 0.6, 0, me.p[2] + f[2] * 0.6]; }
    this.goal = { k: 'innocent', until: v.time + 12 + v.rng() * 6, at: seat, alt: [...me.p] };
    this.w.go(v, seat, 4);
    return true;
  }

  private hall(v: BotWorldView) {
    this.carWatch = false;
    const fd = v.level.spots.find((x) => x.id === 'frontDoor');
    if (!fd) return;
    const back = add(fd.pos, fwd(fd.facing + Math.PI), 1.4 + v.rng() * 0.8);
    const side = add(back, fwd(fd.facing + Math.PI / 2), (v.rng() - 0.5) * 1.2);
    this.goal = { k: 'hall', until: v.time + 12, at: [side[0], 0, side[2]], look: add(add(fd.pos, fwd(fd.facing), 0.5), [0, 1, 0]) };
    this.w.go(v, this.goal.at!, 8);
  }

  private zoom(v: BotWorldView) {
    const floor = standNodes(v.nav, 'sitter');
    const a = floor[Math.floor(v.rng() * floor.length)], b = floor[Math.floor(v.rng() * floor.length)];
    if (!a || !b) return;
    this.goal = { k: 'zoom', until: this.zoomUntil, at: a, alt: b };
    this.w.go(v, a, 6);
  }

  private poopSpot(v: BotWorldView) {
    const ids = ['pillow', 'sofa', 'laundry', 'shoes'];
    const sp = v.level.spots.filter((s) => ids.includes(s.id));
    const s = sp[Math.floor(v.rng() * sp.length)];
    if (!s) return;
    this.goal = { k: 'poopSpot', until: v.time + 25, at: s.pos };
    this.w.go(v, s.pos);
  }

  private setUse(v: BotWorldView, o: BotOption, budget: number) {
    this.goal = { k: 'use', key: o.key, at: o.at, until: v.time + budget };
    this.door = null;
    this.w.go(v, o.at);
  }

  // ------------------------------------------------------------------ choosing a goal
  private pick(v: BotWorldView, s: Readonly<CharState> | undefined) {
    const me = v.self, W = this.W, t = v.time;
    const cands: { score: number; set: () => void }[] = [];
    const travel = (p: Vec3) => distXZ(me.p, p) + Math.abs(p[1] - me.p[1]) * 2;
    const sitterF = (p: Vec3) => {
      if (!s) return 1.2;
      const f = clamp((distXZ(p, s.p) - 2) / 6, 0.12, 1.4);
      return this.pers === 'opportunist' ? f * f : f;
    };
    const ok = (key: string) => (this.bad.get(key) ?? 0) < t;
    const others = v.chars.filter((c) => c.role === 'cat' && c.id !== me.id);
    // nothing right under the sitter's hands (while they're free)
    const tooClose = (p: Vec3) => !!s && !s.holding && !s.st.stunned && distXZ(p, s.p) < 3.5 && Math.abs(p[1] - s.p[1]) < 1.45;

    for (const o of v.options) {
      if (!o.ok || NEVER.has(o.interactable) || !ok(o.key) || (tooClose(o.at) && o.interactable !== 'litterBox')) continue;
      const base = VALUE[o.interactable] ?? 2;
      if (o.interactable === 'window' && me.st.focused) continue;
      if ((o.interactable === 'foodBowl' || o.interactable === 'sink') && me.st.fed) continue;
      if (o.interactable === 'shoes' && v.rng() > 0.15) continue;
      if (o.interactable === 'salmon' && me.item) continue;
      const busy = others.some((c) => c.work?.key === o.key || (c.work && c.work.key.startsWith(`i:${o.interactable}:`)));
      let mul = o.alert || base >= 5 ? W.disaster : W.mischief;
      if (this.resume && this.resume.key === o.key && this.resume.until > t) mul *= 2.5;
      if (busy) mul *= SHARED.has(o.interactable) ? 1.6 : 0.25;
      if (o.interactable === 'fuseBox' && v.world.lights === false) continue;
      if (o.interactable === 'tubFaucet' && t < this.tapCool) mul *= 0.25;
      const score = (base * mul * sitterF(o.at)) / (1 + travel(o.at) / 7);
      cands.push({ score, set: () => this.setUse(v, o, 10 + 25) });
    }
    // knock things off
    let n = 0;
    for (const pr of v.props) {
      if (pr.fallen || pr.special || pr.home[1] < 0.3 || pr.p[1] < 0.3 || !ok(`p${pr.id}`) || tooClose(pr.p)) continue;
      const d = travel(pr.p);
      if (d > 14 || n++ > 60) continue;
      const def = PROP_DEFS[pr.kind];
      const val = def.fallenMess + (def.breaksInto ? MESS_WEIGHTS[def.breaksInto] * 0.8 : 0);
      // sweeping the surface you're already on is cheap
      const here = Math.abs(pr.p[1] - me.p[1]) < 0.35 && distXZ(pr.p, me.p) < 1.8 ? 2 : 1;
      const score = (val * W.knock * 1.6 * here * (0.4 + sitterF(pr.p) * 0.6)) / (1 + d / 5);
      cands.push({ score, set: () => this.knockGoal(v, pr) });
    }
    // loaf on things (Sleepy: on the mess the sitter needs to clean)
    const best = [...v.mess].sort((a, b) => b.w - a.w)[0];
    if (best && distXZ(best.p, me.p) < 10) cands.push({ score: (W.loaf * (1 + best.w / 3)) / (1 + travel(best.p) / 6), set: () => this.loafGoal(v, best.p, 8 + v.rng() * 8) });
    const pkgOpen = v.world['package.open'] === true && v.props.find((p) => p.kind === 'package');
    if (pkgOpen) cands.push({ score: 2.2 / (1 + travel(pkgOpen.p) / 8), set: () => this.loafGoal(v, pkgOpen.p, 8 + v.rng() * 8) });
    // the tap is running: someone sits on it (the sitter has to pick them up first)
    const tub = v.level.spots.find((x) => x.id === 'tubFaucet');
    if (tub && v.world['tub.running'] === true && !others.some((c) => c.loaf && distXZ(c.p, tub.pos) < 0.7)) {
      const k = this.pers === 'sleepy' ? 2 : this.pers === 'goblin' ? 1.4 : 0.8;
      cands.push({ score: (10 * k * W.disaster) / (1 + travel(tub.pos) / 7), set: () => { this.loafGoal(v, tub.pos, 45); this.goal!.guard = true; } });
    }
    const sun = v.level.sunPatches[0];
    if (sun) cands.push({ score: (W.loaf * 0.9) / (1 + travel(sun.center) / 8), set: () => this.loafGoal(v, sun.center, 6 + v.rng() * 10) });
    const lb = v.level.spots.find((x) => x.id === 'litterBox');
    if (lb && Number(v.world['litter.fill'] ?? 0) > 0.4) cands.push({ score: (W.loaf * 1.2) / (1 + travel(lb.pos) / 6), set: () => this.loafGoal(v, lb.pos, 8 + v.rng() * 6) });
    // hairball, aimed at the rug
    if (!me.cd.hairball && !me.item) {
      const rug = this.nearestRug(v);
      if (rug) cands.push({ score: W.mischief * 1.4 / (1 + travel(rug.c) / 6), set: () => this.hairballGoal(v, rug) });
    }
    // begging at the half-empty bowl
    const bowl = v.level.spots.find((x) => x.id === 'foodBowl');
    if (bowl && s && !me.st.fed && Number(v.world['foodBowl.fill'] ?? 1) <= 0.5 && v.world['foodBowl.shaken'] !== true && distXZ(s.p, me.p) < 12 && v.rng() < 0.25) {
      cands.push({ score: 3, set: () => this.begGoal(v, bowl.pos, s) });
    }
    // idle: wander or stare at nothing
    cands.push({ score: W.idle, set: () => this.idleGoal(v) });

    let pickc = cands[0], ps = -Infinity;
    for (const c of cands) {
      const sc = c.score * (0.6 + v.rng() * 0.8);
      if (sc > ps) { ps = sc; pickc = c; }
    }
    this.door = null;
    this.lookAt(v, null);
    pickc.set();
  }

  private knockGoal(v: BotWorldView, pr: PropView) {
    const e = propEdge(v.level, pr);
    const out = e?.out ?? fwd(yawTo(v.self.p, pr.p));
    const stand: Vec3 = e?.stand ?? [pr.p[0] - out[0] * 0.38, pr.p[1], pr.p[2] - out[2] * 0.38];
    // watched and right at the edge: the slow push, staring back
    const watched = v.sitterSees(v.self.id);
    if (e && e.dist < 0.12 + 0.06 && watched && !this.pushRolled.has(pr.id)) {
      this.pushRolled.add(pr.id);
      if (v.rng() < this.D.slowPush) {
        this.goal = { k: 'push', prop: pr.id, at: stand, face: Math.atan2(out[0], out[2]), until: v.time + 9 };
        this.w.go(v, stand, 7);
        return;
      }
    }
    this.goal = { k: 'knock', prop: pr.id, at: stand, face: Math.atan2(out[0], out[2]), until: v.time + 14 };
    this.w.go(v, stand, 10);
  }

  private loafGoal(v: BotWorldView, p: Vec3, sec: number) {
    this.goal = { k: 'loaf', at: [...p], until: v.time + sec + 6 };
    this.w.go(v, p, 8);
  }

  private hairballGoal(v: BotWorldView, rug: { c: Vec3; h: Vec3 }) {
    const a = v.rng() * Math.PI * 2;
    const at: Vec3 = this.pers === 'gremlin' ? [...v.self.p] : [rug.c[0] + Math.sin(a) * (rug.h[0] + 0.4), 0, rug.c[2] + Math.cos(a) * (rug.h[2] + 0.4)];
    this.goal = { k: 'hairball', at, until: v.time + 12 };
    this.w.go(v, at, 9);
  }

  private begGoal(v: BotWorldView, bowl: Vec3, s: Readonly<CharState>) {
    const f = fwd(yawTo(bowl, s.p));
    this.goal = { k: 'beg', at: [bowl[0] + f[0] * 0.8, 0, bowl[2] + f[2] * 0.8], until: v.time + 8 + 6 };
    this.w.go(v, this.goal.at!, 8);
  }

  private idleGoal(v: BotWorldView) {
    const me = v.self;
    const room = v.level.rooms.find((r) => r.id === v.roomAt(me.p));
    // join another cat's stare
    for (const [id, st] of stares) {
      if (id === this.o.id || st.level !== v.level || st.until < v.time || st.until - v.time > 3.2) continue;
      const other = v.chars.find((c) => c.id === id);
      if (other && distXZ(other.p, me.p) < 4 && v.rng() < 0.5) {
        this.goal = { k: 'stare', until: st.until, look: st.p, t: 0 };
        this.w.stop();
        return;
      }
    }
    if (room && v.time - this.idleSince > 2 && v.rng() < 0.12) {
      // the empty upper corner of the room
      const cx = v.rng() < 0.5 ? room.min[0] + 0.15 : room.max[0] - 0.15, cz = v.rng() < 0.5 ? room.min[2] + 0.15 : room.max[2] - 0.15;
      const p: Vec3 = [cx, 2.3, cz];
      this.goal = { k: 'stare', until: v.time + 3, look: p, t: 0, face: v.rng() < 0.5 ? 1 : -1 };
      stares.set(this.o.id, { level: v.level, p, until: v.time + 3 });
      this.w.stop();
      return;
    }
    const nodes = standNodes(v.nav, 'cat').filter((n) => distXZ(n, me.p) < 7);
    const n = nodes[Math.floor(v.rng() * nodes.length)];
    if (!n) { this.goal = { k: 'loaf', at: [...me.p], until: v.time + 4 }; return; }
    this.goal = { k: 'wander', at: n, until: v.time + 9 };
    this.idleSince = v.time;
    this.w.go(v, n, 8);
  }

  // ------------------------------------------------------------------ running the goal
  private run(v: BotWorldView, dt: number, out: BotIntent, s: Readonly<CharState> | undefined): BotIntent {
    const me = v.self, g = this.goal;
    if (!g) { out.interact = me.work ? undefined : null; return out; }
    if (v.time > g.until && g.k !== 'innocent') return g.k === 'use' || g.k === 'knock' || g.k === 'push' ? this.fail(v, out) : this.done(v, out);
    if (this.door) return this.doorman(v, dt, out);

    const walk = (arrive = 0.35) => {
      if (g.arrived) return true;
      const st = this.w.target ? this.w.step(v, dt, out, arrive) : 'arrived';
      if (st === 'door') { this.door = { id: this.w.door!, phase: 'yowl', t: v.time + 1.5 + v.rng() * 3, meowT: 0 }; return false; }
      if (st === 'failed') { this.fail(v); return false; }
      if (st === 'arrived') { g.arrived = true; return true; }
      // sprint when it's far, fleeing or zooming (Sleepy never runs)
      const far = this.w.left(v) > 5;
      out.sprint = (g.k === 'flee' && me.stamina > 0.02) || (this.pers !== 'sleepy' && me.stamina > 0.35 && (g.k === 'zoom' || (far && me.stamina > 0.7 && v.rng() < 0.5)));
      if (this.pers === 'gremlin' || g.k === 'zoom') this.swipeInPath(v, out);
      return false;
    };

    switch (g.k) {
      case 'use': {
        const o = this.optionFor(v, g.key!);
        if (me.work?.key === g.key) { g.started = true; out.interact = g.key; return out; }
        if (g.started) return this.done(v, out); // finished or interrupted
        if (!o || !o.ok) return this.fail(v, out);
        if (g.at && distXZ(g.at, o.at) > 0.5) { g.at = o.at; g.arrived = false; this.w.go(v, o.at); }
        const inRange = distXZ(me.p, o.at) < Math.min(o.range * 0.8, 0.9) && Math.abs(me.p[1] - o.at[1]) < 0.8;
        if (inRange || walk(Math.min(o.range * 0.6, 0.4))) {
          if (inRange) { this.w.stop(); g.arrived = true; }
          out.interact = g.key;
          if (!g.t) g.t = v.time;
          else if (v.time - g.t > 1.5 && !me.work) { this.bad.set(g.key!, v.time + 6); return this.done(v, out); } // can't start it from here
        }
        return out;
      }
      case 'knock': case 'push': {
        const pr = v.props.find((p) => p.id === g.prop);
        if (!pr || pr.fallen || pr.p[1] < pr.home[1] - 0.25) return this.done(v, out);
        if (!walk(0.25) && distXZ(me.p, pr.p) > 0.6) return out;
        this.w.stop();
        g.arrived = true;
        g.since ??= v.time;
        if (v.time - g.since > 6) { this.bad.set(`p${pr.id}`, v.time + 20); return this.done(v, out); } // out of reach after all
        out.faceYaw = g.face ?? yawTo(me.p, pr.p);
        const d = distXZ(me.p, pr.p);
        if (d > 0.5) out.moveTo = [pr.p[0] - Math.sin(out.faceYaw) * 0.3, pr.p[1], pr.p[2] - Math.cos(out.faceYaw) * 0.3];
        if (g.k === 'push') {
          out.push = d < 0.6;
          if (s && v.sitterSees(me.id)) this.lookAt(v, head(s));
          if (g.t === undefined) g.t = v.time;
          if (v.time - g.t > 5) { out.push = false; return this.done(v, out); }
        } else if (d < 0.75 && this.swipeT <= 0 && facingDot(me.yaw, me.p, pr.p) > 0.5) {
          out.swipe = true;
          this.swipeT = 0.55 + v.rng() * 0.3;
          if (v.rng() < 0.15) out.meow = true;
          if (g.t === undefined) g.t = v.time;
          if (v.time - g.t > 4) { this.bad.set(`p${pr.id}`, v.time + 20); return this.done(v, out); }
        }
        return out;
      }
      case 'loaf': case 'poopSpot': {
        if (g.guard && v.world['tub.running'] !== true) return this.done(v, out);
        if (!walk(0.3)) return out;
        out.loaf = true;
        if (v.rng() < 0.004) out.meow = true;
        return out;
      }
      case 'flee': {
        if (s && distXZ(s.p, me.p) > this.D.flee + 2.5) return this.done(v, out);
        if (walk(0.5)) return this.done(v, out);
        out.sprint = me.stamina > 0.02;
        return out;
      }
      case 'innocent': {
        if (!walk(0.3)) return out;
        if (s) { out.faceYaw = yawTo(me.p, s.p); this.lookAt(v, head(s)); }
        return out;
      }
      case 'perch': {
        if (walk(0.3)) { this.goal = null; this.decideT = 0; }
        return out;
      }
      case 'hall': {
        if (!walk(0.5)) return out;
        out.faceYaw = yawTo(me.p, g.look!);
        this.lookAt(v, g.look!);
        return out;
      }
      case 'zoom': {
        if (walk(0.8)) { const nx = g.alt!; g.alt = g.at; g.at = nx; g.arrived = false; this.w.go(v, nx, 6); }
        out.sprint = me.stamina > 0.05;
        return out;
      }
      case 'treat': {
        if (!s || !me.st.treat) return this.done(v, out);
        out.moveTo = s.p;
        return out;
      }
      case 'beg': {
        if (!walk(0.3)) return out;
        if (!s || me.st.fed || v.world['foodBowl.shaken'] === true) return this.done(v, out);
        out.faceYaw = yawTo(me.p, s.p);
        this.lookAt(v, head(s));
        if (this.meowT <= 0) { out.meow = true; this.meowT = 2.5; }
        return out;
      }
      case 'hairball': {
        if (!walk(0.4)) return out;
        const rug = this.nearestRug(v);
        if (rug) out.faceYaw = yawTo(me.p, rug.c);
        if (!me.cd.hairball && !v.chars.some((c) => c.id !== me.id && c.role === 'cat' && distXZ(c.p, me.p) < 2.1)) out.hairball = true;
        return this.done(v, out);
      }
      case 'stare': {
        g.t = (g.t ?? 0) + dt;
        const drift = Math.sin(g.t * 0.9) * 0.2 * (g.face ?? 1);
        const p: Vec3 = [g.look![0] + drift, g.look![1], g.look![2] - drift];
        out.faceYaw = yawTo(me.p, p);
        this.lookAt(v, p);
        return out;
      }
      case 'wander': default: {
        if (walk(0.5)) {
          if (v.rng() < 0.03) out.meow = true;
          return this.done(v, out);
        }
        return out;
      }
    }
  }

  private done(v: BotWorldView, out: BotIntent): BotIntent {
    this.goal = null;
    this.w.stop();
    this.door = null;
    this.lookAt(v, null);
    this.idleSince = v.time;
    this.decideT = Math.min(this.decideT, 0.15);
    if (!v.self.work) out.interact = null;
    out.push = false;
    return out;
  }

  private fail(v: BotWorldView, out: BotIntent = {}): BotIntent {
    const g = this.goal;
    if (g?.key) this.bad.set(g.key, v.time + 10);
    if (g?.prop !== undefined) this.bad.set(`p${g.prop}`, v.time + 15);
    return this.done(v, out);
  }

  // ------------------------------------------------------------------ the doorman
  private doorman(v: BotWorldView, dt: number, out: BotIntent): BotIntent {
    const me = v.self, ds = this.door!, g = this.goal!;
    const def = v.level.doors.find((d) => d.id === ds.id);
    const spot = v.level.spots.find((s) => s.id === ds.id);
    if (!def || !spot) { this.door = null; return out; }
    const center = doorBox(def).center;
    const doorway: Vec3 = [center[0], 0, center[2]];
    const open = v.doorOpen(ds.id);
    if (ds.phase === 'yowl' || ds.phase === 'hang') {
      if (open) { ds.phase = 'sit'; ds.t = v.time + 1.5 + v.rng(); out.interact = null; return out; }
      const near = distXZ(me.p, doorway) < 1.0;
      if (!near) { out.moveTo = doorway; return out; }
      out.faceYaw = yawTo(me.p, doorway);
      this.lookAt(v, [center[0], 1.0, center[2]]);
      if (ds.phase === 'yowl') {
        if ((ds.meowT -= dt) <= 0) { out.meow = true; ds.meowT = 3; }
        if (v.time > ds.t) ds.phase = 'hang';
      } else {
        const o = v.options.find((x) => x.interactable === ds.id && x.key.startsWith('i:'));
        if (!o || !o.ok) { this.bad.set(g.key ?? `p${g.prop}`, v.time + 12); return this.done(v, out); } // mouth full or gone
        out.interact = o.key;
      }
      g.until = Math.max(g.until, v.time + 3);
      return out;
    }
    if (ds.phase === 'sit') {
      out.interact = me.work ? undefined : null;
      out.faceYaw = yawTo(me.p, doorway);
      this.lookAt(v, [center[0], 0.6, center[2]]);
      g.until = Math.max(g.until, v.time + 3);
      if (v.time < ds.t) return out;
      const r = v.rng();
      if (r < 0.4) { this.bad.set(g.key ?? `p${g.prop}`, v.time + 15); return this.done(v, out); } // never mind
      if (r < 0.7) { ds.phase = 'block'; ds.t = v.time + 3; return out; }
      this.door = null;
      this.lookAt(v, null);
      if (this.goal?.at) this.w.go(v, this.goal.at);
      return out;
    }
    // standing in the doorway, exactly where the door would close
    out.moveTo = distXZ(me.p, doorway) > 0.15 ? doorway : null;
    g.until = Math.max(g.until, v.time + 2);
    if (v.time > ds.t) { this.door = null; this.lookAt(v, null); if (this.goal?.at) this.w.go(v, this.goal.at); }
    return out;
  }

  // ------------------------------------------------------------------ small bits
  /** hiss back at a cat that hisses nearby (fights, for comedy), or rarely start one when bored */
  private hissBack(v: BotWorldView): boolean {
    const me = v.self;
    if (me.work?.mode === 'minigame' || this.hissCd > v.time) return false;
    for (const c of v.chars) {
      if (c.id === me.id || c.role !== 'cat' || c.forced || distXZ(c.p, me.p) > 1.9) continue;
      const idle = this.goal?.k === 'wander' || this.goal?.k === 'stare' || !this.goal;
      if (c.gest === 'hiss' || (idle && !c.work && v.rng() < 0.0006)) {
        this.hissCd = v.time + 3;
        return v.rng() < (c.gest === 'hiss' ? 0.35 : 1);
      }
    }
    return false;
  }

  private swipeInPath(v: BotWorldView, out: BotIntent) {
    if (this.swipeT > 0) return;
    const me = v.self;
    for (const pr of v.props) {
      if (pr.fallen || pr.special) continue;
      const dy = pr.p[1] - me.p[1];
      if (dy < -0.2 || dy > 0.6 || distXZ(me.p, pr.p) > 0.7 || facingDot(me.yaw, me.p, pr.p) < 0.5) continue;
      out.swipe = true;
      this.swipeT = 0.5;
      return;
    }
  }

  private nearestRug(v: BotWorldView): { c: Vec3; h: Vec3 } | null {
    let best: { c: Vec3; h: Vec3 } | null = null, bd = this.pers === 'gremlin' ? Infinity : 3 + 2.5;
    for (const b of v.level.colliders) {
      if (b.tag !== 'rug') continue;
      const d = distXZ(b.center, v.self.p) - Math.max(b.half[0], b.half[2]);
      if (d < bd) { bd = d; best = { c: b.center, h: b.half }; }
    }
    return best;
  }

  private optionFor(v: BotWorldView, key: string) { return v.options.find((o) => o.key === key); }

  /** head target; never fights the sim's own (treats, TV, the car at 0:08, the scratching post) */
  private lookAt(v: BotWorldView, p: Vec3 | null) {
    const me = v.self as CharState;
    if (me.st.treat || me.st.hypnotized || (v.timeLeft <= 8.05 && v.timeLeft > 7) || v.time - Number(v.world['scratchPost.t'] ?? -99) < 1) return;
    if (p) { me.lookAt = p; this.looking = true; }
    else if (this.looking) { me.lookAt = null; this.looking = false; }
  }
}

registerBotBrain('cat', (o) => new CatBrain(o), 10);
