/**
 * Host-authoritative simulation: Rapier world with dynamic props, characters (bots simulated here,
 * players follow their owner's transforms), mess, meter, statuses, actions, interactions, bots.
 * Implements SimContext so interactable content talks to it directly.
 */
import type {
  DoorDef, FxKind, LevelData, MessKind, PropKind, Role, RoomId, SoundName, Spot, SpotId, Vec3, WorldVisualValue,
} from '../shared/contracts';
import { PROP_DEFS, MESS_WEIGHTS, type PropDef } from '../shared/propDefs';
import { CFG, scaleFor, type ScaleRow } from '../config';
import { RAPIER, buildStaticWorld, groups, G, yawQuat, lineOfSight, rayDist, type StaticWorld } from '../core/physics';
import { CharMotion, type MotionInput } from '../core/charMotion';
import { add, clamp, dist, distXZ, facingDot, fwd, makeRng, r3, rv, yawTo } from '../core/math';
import type {
  Action, Alert, CharState, GameConfig, GameEvent, Mess, MoveMsg, Phase, PlayerInfo, PropSnap, Results, Snapshot, StatusKey, Stats,
} from '../core/types';
import type { Char, PropView, SimContext } from './interactables/types';
import { Interactions } from './interact';
import { buildResults, emptyStats, type Disaster } from './awards';
import { createBotBrain, type BotBrain, type BotIntent, type BotWorldView, type BotOption } from './bots/types';

// bot brains self-register (placeholder + whatever later agents add)
import.meta.glob('./bots/*.ts', { eager: true });

export interface SimChar {
  s: CharState;
  info: PlayerInfo;
  motion: CharMotion;
  brain: BotBrain | null;
  poopRate: number;
  lastHiss: number;
  cageCut: number;
  cageTotal: number;
  cagePos: Vec3 | null;
  cageMeows: number;
  lastPos: Vec3;
  pitch: number;
  intent: BotIntent;
  jumpHeld: boolean;
  // v2
  hissUsed: boolean;     // grab hiss bonus spent for this grab
  wiggleT: number;       // last wiggle (or limp end) while held: noodle after 2 s of nothing
  tossT: number;         // last launch (toss / slip)
  airSeen: boolean;      // the host saw it airborne since the launch
  bounced: boolean;
  pushOn: boolean;
  tapT: number;
  pushLook: boolean;
  eyeLog: number[];
  noBlock: { p: Vec3; until: number }[];
  panicOn: boolean;
  sweatT: number;
  emptyToastT: number;
}

export interface SimProp extends PropView {
  id: number;
  kind: PropKind;
  def: PropDef;
  body: RAPIER.RigidBody;
  p: Vec3;
  q: [number, number, number, number];
  home: Vec3;
  homeRot: number;
  lift: number;
  fallen: boolean;
  special: boolean;
  restT: number;
  prevVy: number;
  touchBy: string | null;
  touchT: number;
  seen: boolean;
  eyeMul: number;
  sent: number[] | null;
  pushBy: string | null;
  pushT: number;
  fightBy: [string, string] | null;
}

interface Fight {
  a: string; b: string; key: string;
  t: number;              // elapsed
  sa: number; sb: number; // brawl presses
  fa: boolean; fb: boolean; // flinched in the staredown
  brawl: boolean;
  p: Vec3;                // cloud center
  head: number;
  turnT: number;
  hit: Set<number>;
}

type Target = string | undefined; // player id, 'sitter' | 'cat', or everyone

/** sitter faces the cats, cats face the sitter */
export function spawnYaw(level: LevelData, role: Role, p: Vec3): number {
  const cs = level.spawns.cats;
  const t: Vec3 = role === 'sitter' && cs.length ? [cs.reduce((a, c) => a + c[0], 0) / cs.length, 0, cs.reduce((a, c) => a + c[2], 0) / cs.length] : level.spawns.sitter;
  return yawTo(p, t);
}

const ROOM_NAMES: Record<RoomId, string> = {
  living: 'Living room', kitchen: 'Kitchen', bathroom: 'Bathroom', bedroom: 'Bedroom', office: 'Office', hallway: 'Hallway',
};
const SLIPPY_MESS = new Set<MessKind>(['puddle', 'hairball', 'fish', 'food', 'catnip']);
const SLIPPY_PROP = new Set<PropKind>(['toyMouse', 'yarn']);
const HARD_PROP = new Set<PropKind>(['mug', 'glass', 'plate', 'vase', 'wineBottle', 'bowl', 'lamp', 'trophy', 'frame', 'candle', 'phone', 'remote']);
/** popup label -> disaster spot (ADDENDUM 1.6) */
const LABEL_SPOT: [RegExp, SpotId][] = [
  [/CARD/i, 'laptop'], [/FLOOD/i, 'tubFaucet'], [/ROLL/i, 'tpRoll'], [/SOFA/i, 'sofa'],
  [/DINNER/i, 'salmon'], [/TANK/i, 'fishTank'], [/CURTAIN/i, 'curtains'],
];
const METER_MARKS = [60, 120, 180, 240, 300];

export class Sim {
  readonly sw: StaticWorld;
  readonly world: RAPIER.World;
  readonly chars: SimChar[] = [];
  readonly byId = new Map<string, SimChar>();
  readonly props = new Map<number, SimProp>();
  readonly mess = new Map<number, Mess>();
  readonly interactions: Interactions;
  /** what interactable content sees */
  readonly ctx: SimContext;
  readonly rng: () => number;
  readonly stats: Record<string, Stats> = {};
  readonly out: { ev: GameEvent; to: Target }[] = [];
  /** cats in the round (bots included), fixed at round start */
  readonly n: number;
  readonly sc: ScaleRow;
  phase: Phase = 'countdown';
  countdown: number = CFG.round.countdown;
  time = 0;
  timeLeft: number;
  hostT = 0;
  meter = 0;
  permanent = 0;
  messVer = 1;
  worldVer = 1;
  /** seconds of overtime left (0 = none) */
  overtime = 0;
  hadOvertime = false;
  results: Results | null = null;
  readonly disasters: Disaster[] = [];
  readonly meterAt: Record<number, number> = {};
  private endT = 0;
  private keysT = 0;
  private winner: Role | null = null;
  private forfeit: string | undefined;
  private nextPropId = 1;
  private nextMessId = 1;
  private keys: Record<string, WorldVisualValue> = {};
  private alerts = new Map<string, Alert>();
  private penalties = new Map<string, number>();
  private rugs: { c: Vec3; h: Vec3; r: number }[];
  private soft: { c: Vec3; h: Vec3; r: number }[];
  private meowLog: { t: number; p: Vec3 }[] = [];
  private fights: Fight[] = [];
  private later: { t: number; fn: () => void }[] = [];
  private lastFullProps = -99;
  private sentMessVer = 0;
  private sentWorldVer = 0;

  constructor(readonly level: LevelData, readonly cfg: GameConfig) {
    this.rng = makeRng(cfg.seed);
    this.timeLeft = cfg.roundSeconds;
    this.n = Math.max(1, cfg.players.filter((p) => p.role === 'cat').length);
    this.sc = scaleFor(this.n);
    this.sw = buildStaticWorld(level);
    this.world = this.sw.world;
    const boxes = (tag: string) => level.colliders.filter((b) => b.tag === tag).map((b) => ({ c: b.center, h: b.half, r: b.rotY ?? 0 }));
    this.rugs = boxes('rug');
    this.soft = boxes('soft');
    let catIdx = 0;
    cfg.players.forEach((info, i) => {
      const spawn = info.role === 'sitter' ? level.spawns.sitter : level.spawns.cats[catIdx++ % Math.max(1, level.spawns.cats.length)] ?? level.spawns.sitter;
      this.addChar(info, spawn, i);
    });
    for (const sp of level.props) this.spawnProp(sp.kind, sp.pos, sp.rotY ?? 0);
    for (const d of level.doors) this.keys[`door.${d.id}`] = 1;
    this.keys.lights = true;
    this.ctx = makeContext(this);
    this.interactions = new Interactions(this);
    this.interactions.roundStart();
  }

  // ------------------------------------------------------------------ setup
  private addChar(info: PlayerInfo, spawn: Vec3, index: number) {
    const auto = !!this.cfg.autobot?.includes(info.id);
    const bot = info.bot || auto;
    const s: CharState = {
      id: info.id, role: info.role, name: info.name, bot,
      p: [...spawn], yaw: spawnYaw(this.level, info.role, spawn), v: [0, 0, 0], g: true, tp: 0,
      sprint: false, charge: 0, loaf: false, look: [0, 0, 1],
      forced: false, frozen: true, mul: 1, st: {}, grabbedBy: null, holding: null, item: null,
      work: null, prompt: null, gest: null, gestT: 0, poop: this.rng() * 0.3, desperate: 0, stamina: 1,
      ammo: this.sc.ammo, cd: {}, mash: 0, lookAt: null,
    };
    let h = 0;
    for (const ch of info.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const c: SimChar = {
      s, info, motion: new CharMotion(this.world, info.role, spawn, s.yaw),
      brain: bot ? createBotBrain({ id: info.id, role: info.role, index, difficulty: this.cfg.botDifficulty, rng: makeRng(this.cfg.seed + index * 977) }) : null,
      poopRate: 1 / (CFG.poop.fillMin + this.rng() * (CFG.poop.fillMax - CFG.poop.fillMin)),
      lastHiss: -99, cageCut: 0, cageTotal: 1, cagePos: null, cageMeows: 0, lastPos: [...spawn], pitch: 0.85 + (h % 100) / 250,
      intent: {}, jumpHeld: false,
      hissUsed: false, wiggleT: 0, tossT: -99, airSeen: false, bounced: false, pushOn: false, tapT: 0, pushLook: false,
      eyeLog: [], noBlock: [], panicOn: false, sweatT: 0, emptyToastT: -99,
    };
    this.chars.push(c);
    this.byId.set(info.id, c);
    this.stats[info.id] = emptyStats();
  }

  /** a disconnected cat keeps playing as a bot */
  convertToBot(id: string) {
    const c = this.byId.get(id);
    if (!c || c.brain) return;
    if (c.s.role === 'sitter') {
      this.end('cat', 'The sitter left early. The house is all yours.');
      return;
    }
    c.s.bot = true;
    c.info = { ...c.info, bot: true, connected: false };
    c.brain = createBotBrain({ id, role: c.s.role, index: this.chars.indexOf(c), difficulty: this.cfg.botDifficulty, rng: makeRng(this.cfg.seed + 31) });
    this.interactions.stop(c, false);
    this.setPush(c, false);
    this.toast(`${c.s.name} left. A bot took over.`, undefined, 'info');
  }

  // ------------------------------------------------------------------ net input
  onMove(id: string, m: MoveMsg) {
    const c = this.byId.get(id);
    if (!c || c.brain) return;
    const s = c.s;
    s.look = m.look;
    s.stamina = clamp(m.stamina, 0, 1);
    if (s.forced || m.tp !== s.tp) return;
    s.p = m.p;
    s.yaw = m.yaw;
    s.v = m.v;
    s.g = m.g;
    s.sprint = m.sprint;
    s.charge = m.charge;
    s.loaf = m.loaf && s.role === 'cat' && !s.st.noLoaf;
    c.motion.follow(s.p, s.yaw);
  }

  action(id: string, act: Action) {
    const c = this.byId.get(id);
    if (!c) return;
    const s = c.s;
    if (act.a === 'mash') return this.mash(c, clamp(act.n ?? 1, 0, 5));
    if (act.a === 'mg') {
      const f = this.fights.find((x) => x.key === act.key);
      if (f) return this.fightInput(f, id, act.delta);
      if (act.key.startsWith('escape')) return this.mash(c, clamp(act.delta * 20, 0, 5));
      return this.interactions.mg(c, act.key, act.delta);
    }
    if (act.a === 'mgExit') {
      if (this.interactions.active.get(id)?.key === act.key) this.interactions.stop(c, false);
      return;
    }
    if (act.a === 'interact') {
      if (!act.on) {
        const k = this.interactions.active.get(id);
        if (k && k.use.mode === 'hold') this.interactions.stop(c, false);
        return;
      }
      if (act.key) this.interactions.start(c, act.key);
      return;
    }
    if (act.a === 'push' && !act.on) return this.setPush(c, false);
    if (this.phase !== 'playing') return;
    if (act.a === 'meow') return this.meow(c);
    if (s.forced) {
      if (act.a === 'hiss' && s.grabbedBy) this.grabbedHiss(c);
      return;
    }
    if (act.a === 'hiss') return this.hiss(c);
    if (s.frozen || s.st.hairball) return;
    if (act.a === 'hairball') return this.hairball(c);
    if (act.a === 'swipe') return this.swipe(c);
    if (act.a === 'spray') return this.spray(c, act.dir);
    if (act.a === 'treats') return this.treats(c);
    if (act.a === 'toss') return this.toss(c, act.dir);
    if (act.a === 'clap') return this.clap(c);
    if (act.a === 'push') return this.setPush(c, true);
  }

  // ------------------------------------------------------------------ main step
  step(dt: number) {
    this.hostT += dt;
    if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (Math.ceil(this.countdown) !== before && this.countdown > 0) this.sound('countdown');
      if (this.countdown <= 0) {
        this.phase = 'playing';
        this.sound('go');
        this.setWorld('frontDoor.open', 0);
      }
    } else if (this.phase === 'playing') {
      this.time += dt;
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      for (const m of METER_MARKS) if (this.meterAt[m] === undefined && this.time >= m) this.meterAt[m] = Math.round(this.meter);
    } else if (this.phase === 'ended') {
      this.endT += dt;
      if (!this.results && this.endT >= CFG.round.endDelay) this.finish();
    }
    const playing = this.phase === 'playing';
    if (this.later.length) {
      const due = this.later.filter((l) => (l.t -= dt) <= 0);
      if (due.length) { this.later = this.later.filter((l) => l.t > 0); for (const l of due) l.fn(); }
    }

    for (const c of this.chars) this.updateChar(c, dt, playing);
    this.world.step();
    this.updateProps(dt, playing);
    if (playing) {
      this.interactions.tick(dt);
      this.updateRules(dt);
    }
    this.updateMeter();
    if (playing) this.updateEnd(dt);
    for (const c of this.chars) {
      const b = this.interactions.best(c);
      c.s.prompt = b ? { key: b.key, label: b.label, ok: b.ok, hold: b.use.mode !== 'instant', progress: this.interactions.progress.get(b.pkey) ?? 0 } : null;
    }
  }

  /** M11: timer, overtime, meter */
  private updateEnd(dt: number) {
    const O = CFG.overtime;
    if (this.meter >= 100) return this.end('cat');
    if (this.overtime > 0) {
      this.overtime = Math.max(0, this.overtime - dt);
      if ((this.keysT -= dt) <= 0) {
        this.keysT = O.keysEvery;
        this.sound('keys', this.spotPos('frontDoor') ?? undefined);
      }
      if (this.meter < O.threshold || this.overtime <= 0) { this.overtime = 0; this.end('sitter'); }
      return;
    }
    if (this.timeLeft > 0) return;
    if (this.meter >= O.threshold && !this.hadOvertime) {
      this.hadOvertime = true;
      this.overtime = O.max;
      this.keysT = 0;
    } else this.end('sitter');
  }

  private flags(c: SimChar, playing: boolean) {
    const s = c.s, st = s.st;
    s.forced = !!s.grabbedBy || !!st.caged || !!st.hypnotized || !!st.fight;
    s.frozen = !playing || s.forced || !!st.stunned || !!st.eating || !!st.flehmen || !!st.dizzy || !!st.slip || !!st.tossed;
    let m = 1;
    if (s.role === 'cat') {
      if (st.wet) m *= CFG.spray.wetMul;
      if (s.poop >= 1) m *= CFG.poop.desperateMul;
      if (st.zoomies) m *= CFG.poop.zoomiesMul;
      if (st.catnip) m *= CFG.buffs.catnipMove;
      if (s.item) m *= 0.9;
      if (st.pushMode) m *= CFG.push.speedMul;
      // fallback for an owner controller without creep mode: the hack is a crawl
      if (st.hairball) m *= CFG.hairball.creep / CFG.cat.walk;
    } else {
      const S = CFG.sitter;
      m *= s.sprint ? this.sc.sitterSprint / S.sprint : this.sc.sitterWalk / S.walk;
      if (s.holding) {
        m *= CFG.grab.carryMul;
        if (s.sprint) m *= S.walk / S.sprint; // carrying is a walk even if the controller still sprints
        if (this.byId.get(s.holding)?.s.st.noodle) m *= CFG.grab.noodleCarry;
      }
    }
    s.mul = m;
  }

  private updateChar(c: SimChar, dt: number, playing: boolean) {
    const s = c.s, st = s.st;
    for (const k in st) {
      const key = k as StatusKey;
      const v = (st[key] ?? 0) - dt;
      if (v > 0) { st[key] = v; continue; }
      delete st[key];
      this.statusExpired(c, key);
    }
    for (const k in s.cd) {
      const key = k as keyof CharState['cd'];
      s.cd[key] = Math.max(0, (s.cd[key] ?? 0) - dt);
      if (!s.cd[key]) delete s.cd[key];
    }
    if (s.gestT > 0 && (s.gestT -= dt) <= 0) s.gest = null;
    this.flags(c, playing);

    // forced positions (fights are placed by updateFights)
    if (s.grabbedBy) {
      const h = this.byId.get(s.grabbedBy);
      if (h) {
        s.p = add(add(h.s.p, fwd(h.s.yaw), 0.5), [0, 0.75, 0]);
        s.yaw = h.s.yaw + Math.PI;
      }
    } else if (st.caged && c.cagePos) {
      s.p = [...c.cagePos];
    }
    if (s.forced) {
      s.v = [0, 0, 0];
      s.loaf = false;
      s.charge = 0;
      if (st.hypnotized && s.lookAt) s.yaw = yawTo(s.p, s.lookAt);
      c.motion.follow(s.p, s.yaw);
      return;
    }
    if (!c.brain) return; // players: owner sends transforms

    // bots: think + drive the shared controller + actions
    const intent: BotIntent = playing ? c.brain.think(this.botView(c), dt) : {};
    c.intent = intent;
    this.applyIntent(c, intent);
    const inp: MotionInput = { moveX: 0, moveZ: 0, faceYaw: intent.faceYaw ?? null, sprint: !!intent.sprint, jumpHeld: !!intent.jump };
    if (intent.moveTo) {
      const dx = intent.moveTo[0] - s.p[0], dz = intent.moveTo[2] - s.p[2];
      const l = Math.hypot(dx, dz);
      const k = l > 0.05 ? Math.min(1, l / 0.4) / l : 0;
      inp.moveX = dx * k;
      inp.moveZ = dz * k;
    } else if (intent.move) {
      inp.moveX = intent.move[0];
      inp.moveZ = intent.move[1];
    }
    if (s.work?.yaw !== undefined && Math.abs(inp.moveX) + Math.abs(inp.moveZ) < 0.01) inp.faceYaw = s.work.yaw;
    const m = c.motion;
    m.step(dt, inp, { mul: s.mul, frozen: s.frozen, inSun: this.inSun(s.p), s });
    s.p = [...m.pos];
    s.yaw = m.yaw;
    s.v = [...m.vel];
    s.g = m.grounded;
    s.sprint = m.sprinting;
    s.charge = m.charge;
    s.stamina = m.stamina / (s.role === 'cat' ? CFG.cat.stamina : CFG.sitter.stamina);
    if (s.role === 'sitter') s.look = fwd(s.yaw);
    if (intent.loaf !== undefined) s.loaf = intent.loaf && s.role === 'cat' && !st.noLoaf;
    if (Math.hypot(s.v[0], s.v[2]) > 0.5) s.loaf = false;
  }

  private applyIntent(c: SimChar, it: BotIntent) {
    const id = c.s.id;
    const x = it as BotIntent & { push?: boolean; clap?: boolean; toss?: Vec3 };
    if (it.mash) this.action(id, { a: 'mash' });
    if (it.interact === null && c.s.work) this.interactions.stop(c, false);
    else if (it.interact) this.interactions.start(c, it.interact);
    if (it.swipe) this.action(id, { a: 'swipe' });
    if (it.spray) this.action(id, { a: 'spray', dir: it.spray });
    if (it.meow) this.action(id, { a: 'meow' });
    if (it.hiss) this.action(id, { a: 'hiss' });
    if (it.hairball) this.action(id, { a: 'hairball' });
    if (it.treats) this.action(id, { a: 'treats' });
    if (x.toss) this.action(id, { a: 'toss', dir: x.toss });
    if (x.clap) this.action(id, { a: 'clap' });
    if (!!x.push !== c.pushOn) this.action(id, { a: 'push', on: !!x.push });
  }

  inSun(p: Vec3) {
    return this.level.sunPatches.some((sp) => distXZ(p, sp.center) < sp.radius && Math.abs(p[1] - sp.center[1]) < 0.6);
  }

  private statusExpired(c: SimChar, k: StatusKey) {
    const s = c.s;
    if (k === 'caged') this.uncage(s);
    else if (k === 'hypnotized') { s.lookAt = null; s.tp++; }
    else if (k === 'fight') s.tp++;
    else if (k === 'treat') {
      s.lookAt = null;
      if (!s.st.caged && !s.grabbedBy && !s.st.eating) this.stat(s.id, 'treatsIgnored', 1); // M17
    }
    else if (k === 'noodle') this.loop(`purr:${s.id}`, 'purr', false);
    else if (k === 'hairball') {
      // grabbed mid-hack: it lands at the sitter's feet
      const h = s.grabbedBy ? this.byId.get(s.grabbedBy) : null;
      const p = h ? add(h.s.p, fwd(h.s.yaw), 0.3) : add(s.p, fwd(s.yaw), 0.3);
      if (h) this.give(h.s, 'gag', 1.5);
      const id = this.addMess('hairball', p, { by: s.id });
      const m = this.mess.get(id);
      this.stat(s.id, 'hairballs', 1);
      if (m?.onRug) { this.stat(s.id, 'rugHairballs', 1); this.text('on the rug', m.p, '#e3a13b'); }
      this.sound('plop', p);
    }
  }

  // ------------------------------------------------------------------ props
  spawnProp(kind: PropKind, p: Vec3, rotY = 0): number {
    const def = PROP_DEFS[kind];
    const lift = def.shape === 'box' ? def.half![1] : def.shape === 'cyl' ? def.hh! : def.r!;
    const id = this.nextPropId++;
    // PropSpawn.pos is the resting contact point; the body origin is the collider center
    const home: Vec3 = [p[0], p[1] + lift + 0.004, p[2]];
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(home[0], home[1], home[2]).setRotation(yawQuat(rotY))
        .setLinearDamping(0.15).setAngularDamping(0.4).setCcdEnabled(true).setSleeping(true),
    );
    const cd = def.shape === 'box' ? RAPIER.ColliderDesc.cuboid(def.half![0], def.half![1], def.half![2])
      : def.shape === 'cyl' ? RAPIER.ColliderDesc.cylinder(def.hh!, def.r!) : RAPIER.ColliderDesc.ball(def.r!);
    this.world.createCollider(cd.setMass(def.mass).setFriction(0.6).setRestitution(0.15).setCollisionGroups(groups(G.PROP, 0xffff)), body);
    const q = yawQuat(rotY);
    const pr: SimProp = {
      id, kind, def, body, p: [...home], q: [q.x, q.y, q.z, q.w], home, homeRot: rotY, lift, fallen: false,
      special: !!def.special, restT: 0, prevVy: 0, touchBy: null, touchT: -99, seen: false, eyeMul: 1, sent: null,
      pushBy: null, pushT: -99, fightBy: null,
    };
    this.props.set(id, pr);
    return id;
  }

  removeProp(id: number) {
    const pr = this.props.get(id);
    if (!pr) return;
    this.world.removeRigidBody(pr.body);
    this.props.delete(id);
    this.emit({ e: 'propGone', id });
  }

  moveProp(id: number, p: Vec3, rotY = 0) {
    const pr = this.props.get(id);
    if (!pr) return;
    const t = { x: p[0], y: p[1] + pr.lift + 0.004, z: p[2] };
    pr.body.setTranslation(t, false);
    pr.body.setRotation(yawQuat(rotY), false);
    pr.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    pr.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
    pr.body.sleep();
    pr.fallen = false;
    pr.eyeMul = 1;
    pr.restT = 0;
    pr.prevVy = 0;
    pr.pushBy = null;
    pr.fightBy = null;
  }

  propList(kind?: PropKind) {
    const out: SimProp[] = [];
    for (const p of this.props.values()) if (!kind || p.kind === kind) out.push(p);
    return out;
  }

  private updateProps(dt: number, playing: boolean) {
    const P = CFG.props;
    for (const pr of [...this.props.values()]) {
      const b = pr.body;
      const t = b.translation(), r = b.rotation();
      pr.p[0] = t.x; pr.p[1] = t.y; pr.p[2] = t.z;
      pr.q[0] = r.x; pr.q[1] = r.y; pr.q[2] = r.z; pr.q[3] = r.w;
      if (t.y < -3) { this.moveProp(pr.id, [pr.home[0], pr.home[1] - pr.lift, pr.home[2]], pr.homeRot); continue; }
      if (b.isSleeping()) { pr.prevVy = 0; pr.restT += dt; }
      else {
        const v = b.linvel();
        // breakables shatter on a hard floor impact
        if (playing && pr.def.breaksInto && pr.prevVy < -P.breakSpeed && v.y > pr.prevVy * 0.35 && t.y - pr.lift < 0.15) {
          this.shatter(pr);
          continue;
        }
        pr.prevVy = v.y;
        const sp = Math.hypot(v.x, v.y, v.z);
        pr.restT = sp < P.restSpeed ? pr.restT + dt : 0;
      }
      if (!playing || pr.special || pr.restT < P.restTime) continue;
      const below = pr.p[1] < pr.home[1] - P.fallenDrop;
      if (below && !pr.fallen) this.onFallen(pr);
      else if (!below && pr.fallen) { pr.fallen = false; pr.eyeMul = 1; }
    }
  }

  private culprit(pr: SimProp): SimChar | null {
    if (pr.touchBy && this.hostT - pr.touchT < CFG.props.touchMemory) return this.byId.get(pr.touchBy) ?? null;
    let best: SimChar | null = null, bd = 2;
    for (const c of this.chars) {
      if (c.s.role !== 'cat') continue;
      const d = dist(c.s.p, pr.home);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  /** M12: x2 at most 3 times per cat per rolling 10 s, fight knocks never count */
  private eyeCheck(pr: SimProp, who: SimChar | null) {
    if (pr.eyeMul > 1 || !who || pr.fightBy) return;
    if (!pr.seen && !this.sitterSees(who.s)) return;
    const E = CFG.eye;
    who.eyeLog = who.eyeLog.filter((t) => this.hostT - t < E.window);
    if (who.eyeLog.length >= E.max) return;
    who.eyeLog.push(this.hostT);
    pr.eyeMul = 2;
    this.popup('EYE CONTACT', undefined, '#ff7a59');
    this.text('x2', pr.p, '#ff7a59');
    this.stat(who.s.id, 'eyeContacts', 1);
  }

  /** knock credit: the culprit, both fighters for a brawl knock, slow-push stat */
  private knocked(pr: SimProp, who: SimChar | null, broke: boolean) {
    const ids = pr.fightBy && this.hostT - pr.touchT < CFG.props.touchMemory ? pr.fightBy : who ? [who.s.id] : [];
    for (const id of ids) {
      this.stat(id, 'knocked', 1);
      if (broke) this.stat(id, 'broken', 1);
    }
    if (pr.pushBy && this.hostT - pr.pushT < CFG.push.knockWindow) this.stat(pr.pushBy, 'slowPushes', 1);
  }

  private onFallen(pr: SimProp) {
    pr.fallen = true;
    const who = this.culprit(pr);
    this.eyeCheck(pr, who);
    this.knocked(pr, who, false);
    if (who) this.stat(who.s.id, 'messCaused', pr.def.fallenMess * pr.eyeMul * this.sc.clutter);
    if (pr.def.fallenMess > 0) this.sound('thud', pr.p, { volume: 0.6 });
  }

  private shatter(pr: SimProp) {
    const who = this.culprit(pr);
    this.eyeCheck(pr, who);
    const p: Vec3 = [pr.p[0], pr.p[1], pr.p[2]];
    this.removeProp(pr.id);
    const kind = pr.def.breaksInto!;
    this.addMess(kind, p, { by: who?.s.id, mul: pr.eyeMul });
    this.fx('shatter', p, { color: kind === 'soil' ? '#7a5236' : kind === 'food' ? '#e9c46a' : undefined });
    this.sound(kind === 'shards' ? 'shatter' : 'thud', p);
    this.knocked(pr, who, true);
  }

  tidyProp(id: number, by: SimChar) {
    const pr = this.props.get(id);
    if (!pr) return;
    this.fx('poof', pr.p);
    this.moveProp(id, [pr.home[0], pr.home[1] - pr.lift - 0.004, pr.home[2]], pr.homeRot);
    this.fx('sparkle', pr.home);
    this.sound('pop', pr.home);
    this.stat(by.s.id, 'tidied', 1);
  }

  // ------------------------------------------------------------------ mess
  private surfaceY(p: Vec3): number {
    const d = rayDist(this.world, [p[0], p[1] + 0.35, p[2]], [0, -1, 0], 4);
    return d < 4 ? p[1] + 0.35 - d : 0;
  }

  private inBoxes(p: Vec3, boxes: { c: Vec3; h: Vec3; r: number }[], top = false) {
    return boxes.some(({ c, h, r }) => {
      const dx = p[0] - c[0], dz = p[2] - c[2];
      const lx = dx * Math.cos(r) - dz * Math.sin(r), lz = dx * Math.sin(r) + dz * Math.cos(r);
      if (Math.abs(lx) > h[0] + 0.05 || Math.abs(lz) > h[2] + 0.05) return false;
      return top ? Math.abs(p[1] - (c[1] + h[1])) < 0.3 : Math.abs(p[1] - c[1]) < 0.4;
    });
  }

  addMess(kind: MessKind, p: Vec3, opts: { by?: string; scale?: number; mul?: number; yaw?: number } = {}): number {
    const id = this.nextMessId++;
    const pos: Vec3 = [r3(p[0]), r3(this.surfaceY(p) + 0.005), r3(p[2])];
    const onRug = this.inBoxes(pos, this.rugs);
    // M1: every cleanable mess weight scales with the cat count
    const w = MESS_WEIGHTS[kind] * (opts.mul ?? 1) * (kind === 'hairball' && onRug ? 2 : 1) * this.sc.clutter;
    this.mess.set(id, { id, kind, p: pos, yaw: r3(opts.yaw ?? this.rng() * Math.PI * 2), scale: opts.scale ?? 1, onRug, w, by: opts.by });
    this.messVer++;
    if (opts.by) this.stat(opts.by, 'messCaused', w);
    return id;
  }

  removeMess(id: number) {
    if (this.mess.delete(id)) this.messVer++;
  }

  messes() { return [...this.mess.values()]; }

  cleanMess(id: number, by: SimChar) {
    const m = this.mess.get(id);
    if (!m) return;
    this.removeMess(id);
    this.fx('sparkle', m.p);
    this.sound('pop', m.p);
    this.stat(by.s.id, 'cleaned', 1);
    this.interactions.messCleaned(m, by);
  }

  addPermanent(points: number, label: string, by?: string, spot?: SpotId) {
    this.permanent += points;
    this.popup(`${label}  +${points}%`, undefined, '#e05a47');
    // credit: `by`, else every cat that worked the running interactable, split evenly
    const ids = by ? [by] : this.interactions.credit();
    for (const id of ids) { this.stat(id, 'disasterPoints', points / ids.length); this.stat(id, 'messCaused', points / ids.length); }
    for (const c of this.chars) if (c.s.role === 'sitter') this.give(c.s, 'shock', 1);
    this.sound('alarm');
    const sp = spot ?? LABEL_SPOT.find(([re]) => re.test(label))?.[1] ?? this.interactions.currentSpot();
    this.disasters.push({ key: sp ?? label.toLowerCase(), label, points, spot: sp ?? null, t: this.time });
  }

  setPenalty(key: string, points: number) {
    if (points) this.penalties.set(key, points);
    else this.penalties.delete(key);
  }

  /** returns the unclamped sum */
  private updateMeter() {
    let m = this.permanent;
    for (const x of this.mess.values()) m += x.w;
    for (const p of this.props.values()) if (p.fallen) m += p.def.fallenMess * p.eyeMul * this.sc.clutter;
    for (const v of this.penalties.values()) m += v;
    this.meter = clamp(m, 0, 100);
    return m;
  }

  // ------------------------------------------------------------------ actions
  private gesture(c: SimChar, g: CharState['gest'], t = 0.5) {
    c.s.gest = g;
    c.s.gestT = t;
  }

  /** props a paw in front of the cat reaches (the v1 swipe rule) */
  private reach(s: CharState, out: SimProp[]) {
    const P = CFG.props;
    const chest: Vec3 = [s.p[0], s.p[1] + 0.2, s.p[2]];
    for (const pr of this.props.values()) {
      const dy = pr.p[1] - s.p[1];
      if (dy < -0.25 || dy > 0.9) continue;
      const d = distXZ(chest, pr.p);
      if (d > P.swipeRange || (d > 0.2 && facingDot(s.yaw, chest, pr.p) < 0.35)) continue;
      out.push(pr);
    }
    return out;
  }

  private swipe(c: SimChar) {
    const s = c.s, P = CFG.props;
    if (s.role !== 'cat' || s.cd.swipe) return;
    s.cd.swipe = P.swipeCooldown;
    s.loaf = false;
    this.gesture(c, 'swipe', 0.35);
    const seen = this.sitterSees(s);
    const f = fwd(s.yaw);
    for (const pr of this.reach(s, [])) {
      const m = pr.def.mass;
      const k = P.swipeSpeed * (0.85 + this.rng() * 0.3);
      pr.body.applyImpulse({ x: f[0] * k * m, y: P.swipeUp * m, z: f[2] * k * m }, true);
      pr.body.applyTorqueImpulse({ x: (this.rng() - 0.5) * m * 0.05, y: (this.rng() - 0.5) * m * 0.05, z: (this.rng() - 0.5) * m * 0.05 }, true);
      pr.touchBy = s.id;
      pr.touchT = this.hostT;
      pr.seen = seen;
      pr.fightBy = null;
    }
    for (const o of this.chars) {
      if (o === c || o.s.forced || dist(o.s.p, s.p) > 0.8 || facingDot(s.yaw, s.p, o.s.p) < 0.4) continue;
      this.push(o, [f[0] * 2.5, 1.8, f[2] * 2.5]);
      if (o.s.role === 'cat') this.fx('exclaim', add(o.s.p, [0, 0.6, 0]));
    }
    this.sound('whoosh', s.p, { volume: 0.35, pitch: 1.3 });
  }

  /** M8: slow push mode on/off */
  private setPush(c: SimChar, on: boolean) {
    const s = c.s;
    if (on) {
      if (s.role !== 'cat' || c.pushOn || s.work) return;
      c.pushOn = true;
      c.tapT = 0.2;
      s.loaf = false;
      s.st.pushMode = 0.3;
      return;
    }
    if (!c.pushOn) return;
    c.pushOn = false;
    delete s.st.pushMode;
    if (c.pushLook) { s.lookAt = null; c.pushLook = false; }
  }

  private updatePush(c: SimChar, dt: number, sitter: SimChar | undefined) {
    const s = c.s, P = CFG.push;
    if (s.forced || s.frozen || s.work || s.st.hairball) return this.setPush(c, false);
    s.st.pushMode = 0.3;
    const seen = !!sitter && this.sitterSees(s);
    if ((c.tapT -= dt) <= 0) {
      c.tapT = P.tapEvery;
      this.gesture(c, 'tap', 0.3);
      let best: SimProp | null = null, bd = 9;
      for (const pr of this.reach(s, [])) { const d = distXZ(s.p, pr.p); if (d < bd && !pr.special) { bd = d; best = pr; } }
      if (best) {
        const f = fwd(s.yaw), v = best.body.linvel();
        best.body.setLinvel({ x: v.x + f[0] * P.tapSpeed, y: v.y, z: v.z + f[2] * P.tapSpeed }, true);
        best.touchBy = s.id;
        best.touchT = this.hostT;
        best.pushBy = s.id;
        best.pushT = this.hostT;
        best.seen = seen;
        best.fightBy = null;
        if (HARD_PROP.has(best.kind)) this.sound('clink', best.p, { volume: 0.25 });
      }
    }
    // stare at the sitter between taps
    const look = seen && s.gest !== 'tap';
    if (look) { s.lookAt = add(sitter!.s.p, [0, 1.6, 0]); c.pushLook = true; }
    else if (c.pushLook) { s.lookAt = null; c.pushLook = false; }
  }

  /** knockback; owner-simulated chars get it as an event */
  push(c: SimChar, v: Vec3) {
    if (c.brain) c.motion.impulse(v);
    else this.emit({ e: 'push', id: c.s.id, v }, c.s.id);
  }

  private nozzle(s: CharState, d: Vec3): Vec3 {
    return add(add(s.p, [0, 1.25, 0]), [d[0], 0, d[2]], 0.45);
  }

  private spray(c: SimChar, dir: Vec3) {
    const s = c.s, S = CFG.spray;
    if (s.role !== 'sitter' || s.cd.spray || s.holding) return;
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const d: Vec3 = [dir[0] / l, dir[1] / l, dir[2] / l];
    const nozzle = this.nozzle(s, d);
    s.cd.spray = S.cooldown;
    this.gesture(c, 'spray', 0.35);
    if (s.ammo <= 0) return this.emptySpray(c, d, nozzle);
    s.ammo--;
    this.fx('spray', nozzle, { dir: d });
    this.sound('spray', nozzle);
    const cos = Math.cos((S.coneDeg * Math.PI) / 180);
    const cloud = new Set<string>(); // fighters already soaked through their cloud
    for (const o of this.chars) {
      if (o.s.role !== 'cat' || o.s.st.caged || o.s.grabbedBy || cloud.has(o.s.id)) continue;
      const t: Vec3 = [o.s.p[0], o.s.p[1] + 0.2, o.s.p[2]];
      // horizontal cone (the bottle arcs; cats are low), generous vertical band
      const tx = t[0] - s.p[0], tz = t[2] - s.p[2], ty = t[1] - nozzle[1];
      const tl = Math.hypot(tx, tz), dl = Math.hypot(d[0], d[2]) || 1;
      if (tl > S.range + 0.3 || ty > 0.8 || ty < -1.9) continue;
      if (tl > 0.5 && (tx * d[0] + tz * d[2]) / (tl * dl) < cos) continue;
      if (!this.lineOfSight(nozzle, t)) continue;
      this.stat(s.id, 'sprayHits', 1);
      this.fx('splash', t);
      const f = o.s.st.fight ? this.fights.find((x) => x.a === o.s.id || x.b === o.s.id) : null;
      if (f) { cloud.add(f.a).add(f.b); this.fightSprayed(f); continue; }
      this.give(o.s, 'stunned', S.stun);
      this.give(o.s, 'wet', S.wet);
      this.give(o.s, 'noLoaf', S.noLoaf);
      if (o.s.item) this.dropItem(o.s);
      this.interactions.stop(o, false);
      this.setPush(o, false);
      o.s.loaf = false;
      this.sound('yowl', t, { pitch: o.pitch });
      if (o.s.st.hypnotized) delete o.s.st.hypnotized;
    }
  }

  /** M7: the bottle is empty and everyone saw it */
  private emptySpray(c: SimChar, d: Vec3, nozzle: Vec3) {
    const s = c.s, E = CFG.emptySpray;
    this.sound('spray', nozzle, { pitch: 0.55, volume: 0.35 });
    this.fx('splash', nozzle, { scale: 0.25 });
    const cos = Math.cos((E.coneDeg / 2 * Math.PI) / 180);
    for (const o of this.chars) {
      if (o.s.role !== 'cat' || distXZ(o.s.p, s.p) > E.range) continue;
      if (facingDot(Math.atan2(d[0], d[2]), s.p, o.s.p) < cos) continue;
      this.give(o.s, 'smug', E.smug);
    }
    if (this.hostT - c.emptyToastT >= E.toastEvery) {
      c.emptyToastT = this.hostT;
      this.toast('Out of water. Refill at the kitchen sink.', s.id, 'bad');
    }
  }

  private treats(c: SimChar) {
    const s = c.s, T = CFG.treats;
    if (s.role !== 'sitter' || s.cd.treats) return;
    s.cd.treats = this.sc.treats;
    this.gesture(c, 'treats', 1);
    this.sound('treatShake', s.p);
    this.fx('noteMusic', add(s.p, [0, 1.9, 0]));
    for (const o of this.chars) {
      if (o.s.role !== 'cat' || dist(o.s.p, s.p) > T.range) continue;
      o.s.st.treat = T.prompt;
      o.s.lookAt = add(s.p, [0, 1.5, 0]);
      this.fx('question', add(o.s.p, [0, 0.65, 0]), { follow: o.s.id });
    }
  }

  private meow(c: SimChar) {
    const s = c.s;
    if (s.role !== 'cat' || s.cd.meow) return;
    s.cd.meow = s.st.catnip ? 0.2 : 0.45;
    this.gesture(c, 'meow', 0.5);
    const loud = this.rng() < 0.3;
    // the carrier song: each meow while caged a little lower
    const sad = s.st.caged ? Math.max(CFG.meow.cagePitchMin, CFG.meow.cagePitch ** ++c.cageMeows) : 1;
    this.sound(loud ? 'meowLong' : this.rng() < 0.5 ? 'meow' : 'mrrp', s.p, { pitch: c.pitch * (s.st.catnip ? 1.3 : 1) * sad });
    this.text(loud ? 'MEOW' : this.rng() < 0.5 ? 'mrrp' : 'meow', add(s.p, [0, 0.7, 0]), '#ffffff');
    this.stat(s.id, 'meows', 1);
    const sitter = this.chars.find((x) => x.s.role === 'sitter');
    if (!sitter) return;
    if (dist(sitter.s.p, s.p) < CFG.meow.spamRange) this.meowLog.push({ t: this.hostT, p: s.p });
    this.meowLog = this.meowLog.filter((m) => this.hostT - m.t < CFG.meow.spamWindow);
    if (this.meowLog.length >= CFG.meow.spamCount) this.give(sitter.s, 'tired', 3);
  }

  private hiss(c: SimChar) {
    const s = c.s, F = CFG.fight;
    if (s.role !== 'cat') return;
    this.gesture(c, 'hiss', 0.8);
    this.sound('hiss', s.p, { pitch: c.pitch });
    s.loaf = false;
    for (const o of this.chars) {
      if (o === c || o.s.role !== 'cat' || o.s.forced || this.hostT - o.lastHiss > F.window || dist(o.s.p, s.p) > F.range) continue;
      o.lastHiss = -99;
      c.lastHiss = -99;
      return this.startFight(c, o);
    }
    c.lastHiss = this.hostT;
  }

  /** M2: hiss while held = +4 wiggles, once per grab */
  private grabbedHiss(c: SimChar) {
    const s = c.s;
    this.gesture(c, 'hiss', 0.8);
    this.sound('hiss', s.p, { pitch: c.pitch });
    if (c.hissUsed) return;
    c.hissUsed = true;
    delete s.st.noodle;
    c.wiggleT = Math.max(c.wiggleT, this.hostT);
    this.addEscape(c, CFG.grab.hissBonus);
  }

  // ------------------------------------------------------------------ fights (M10)
  private startFight(a: SimChar, b: SimChar) {
    const F = CFG.fight;
    const p: Vec3 = [(a.s.p[0] + b.s.p[0]) / 2, Math.min(a.s.p[1], b.s.p[1]), (a.s.p[2] + b.s.p[2]) / 2];
    const key = `fight:${Math.floor(this.hostT * 1000)}`;
    for (const [x, y] of [[a, b], [b, a]] as const) {
      this.interactions.stop(x, false);
      this.setPush(x, false);
      x.s.st.fight = F.lock + 1; // ended by the fight itself
      x.s.p = add(p, fwd(yawTo(p, x.s.p)), 0.25);
      x.s.yaw = yawTo(x.s.p, p);
      if (x.s.item) this.dropItem(x.s);
      if (!x.s.bot) this.emit({ e: 'mgOpen', key, kind: 'fight', data: { opponent: y.s.name } }, x.s.id);
      this.fx('anger', add(x.s.p, [0, 0.6, 0]), { follow: x.s.id });
    }
    this.fights.push({ a: a.s.id, b: b.s.id, key, t: 0, sa: 0, sb: 0, fa: false, fb: false, brawl: false, p, head: this.rng() * Math.PI * 2, turnT: F.turnEvery, hit: new Set() });
  }

  /** staredown input = flinch, brawl input = presses (flinchers x0.75) */
  private fightInput(f: Fight, id: string, delta: number) {
    const F = CFG.fight;
    const a = id === f.a;
    if (!a && id !== f.b) return;
    if (!f.brawl) { if (a) f.fa = true; else f.fb = true; return; }
    const d = clamp(delta, 0, 0.25) * ((a ? f.fa : f.fb) ? F.flinchMul : 1);
    if (a) f.sa += d; else f.sb += d;
  }

  private endFight(f: Fight) {
    this.fights.splice(this.fights.indexOf(f), 1);
    for (const id of [f.a, f.b]) {
      const x = this.byId.get(id);
      if (!x) continue;
      delete x.s.st.fight;
      x.s.tp++;
      if (!x.s.bot) this.emit({ e: 'mgClose', key: f.key }, id);
    }
  }

  private fightSprayed(f: Fight) {
    this.endFight(f);
    for (const id of [f.a, f.b]) { const x = this.byId.get(id); if (x) this.give(x.s, 'wet', CFG.spray.wet); }
    this.fx('splash', add(f.p, [0, 0.3, 0]), { scale: 1.5 });
  }

  private updateFights(dt: number) {
    const F = CFG.fight;
    for (const f of [...this.fights]) {
      const a = this.byId.get(f.a), b = this.byId.get(f.b);
      if (!a || !b || !a.s.st.fight || !b.s.st.fight) { this.endFight(f); continue; }
      f.t += dt;
      if (!f.brawl && f.t >= F.stare) {
        if (!f.fa && !f.fb) {
          // the staredown that never turns into a fight
          this.endFight(f);
          for (const x of [a, b]) { this.gesture(x, 'groom', F.groom); this.stat(x.s.id, 'standoffs', 1); }
          continue;
        }
        f.brawl = true;
        this.addMess('fur', f.p, { by: f.a });
        this.fx('fightCloud', f.p, { duration: F.lock - F.stare, scale: 1, follow: f.a });
        this.sound('fight', f.p);
      }
      if (f.brawl) {
        // rolling cloud: drifts, turns every 0.8 s, bounces off walls
        if ((f.turnT -= dt) <= 0) { f.turnT = F.turnEvery; f.head = this.rng() * Math.PI * 2; }
        const h = fwd(f.head);
        if (rayDist(this.world, [f.p[0], f.p[1] + 0.15, f.p[2]], h, 0.45) < 0.45) f.head += Math.PI + (this.rng() - 0.5) * 1.2;
        else {
          f.p = add(f.p, h, F.drift * dt);
          f.p[1] = this.surfaceY(f.p);
        }
        const spin = f.t * 7;
        for (const [x, k] of [[a, 0], [b, Math.PI]] as const) {
          x.s.p = add(f.p, fwd(spin + k), 0.22);
          x.s.yaw = yawTo(x.s.p, f.p);
        }
        const c: Vec3 = [f.p[0], f.p[1] + 0.15, f.p[2]];
        for (const pr of this.props.values()) {
          if (f.hit.has(pr.id) || pr.special || dist(pr.p, c) > F.propRange) continue;
          f.hit.add(pr.id);
          const dx = pr.p[0] - c[0], dz = pr.p[2] - c[2], l = Math.hypot(dx, dz) || 1;
          pr.body.setLinvel({ x: (dx / l) * F.propOut, y: F.propUp, z: (dz / l) * F.propOut }, true);
          pr.touchBy = f.a;
          pr.touchT = this.hostT;
          pr.fightBy = [f.a, f.b];
          pr.seen = false;
        }
      }
      if (f.t < F.lock) continue;
      this.endFight(f);
      const aw = f.sa === f.sb ? this.rng() < 0.5 : f.sa > f.sb;
      const [w, l] = aw ? [a, b] : [b, a];
      this.give(w.s, 'crown', F.crown);
      this.give(l.s, 'dizzy', F.dizzy);
      this.stat(w.s.id, 'fightsWon', 1);
      this.text(`${w.s.name} wins`, add(f.p, [0, 0.8, 0]), '#ffd166');
      this.addMess('fur', f.p, { by: f.b });
      this.fx('furPoof', f.p);
    }
  }

  // ------------------------------------------------------------------ hairball (M9)
  private hairball(c: SimChar) {
    const s = c.s, H = CFG.hairball;
    if (s.role !== 'cat' || s.cd.hairball || s.work) return;
    s.cd.hairball = H.cooldown;
    s.st.hairball = H.hack;
    s.loaf = false;
    this.setPush(c, false);
    this.sound('hairball', undefined, { volume: 0.7, pitch: c.pitch });
    this.sound('hairball', s.p, { volume: 1, pitch: c.pitch });
  }

  // ------------------------------------------------------------------ grab, escape, toss (M2, M3)
  private mash(c: SimChar, n: number) {
    const s = c.s;
    if (s.st.fight) {
      const f = this.fights.find((x) => x.a === s.id || x.b === s.id);
      if (f) this.fightInput(f, s.id, CFG.fight.press * Math.max(1, n));
      return;
    }
    if (n <= 0) return;
    this.gesture(c, 'mash', 0.25);
    if (s.grabbedBy) {
      if (s.st.limp) return;
      if (s.st.noodle) { n = Math.max(n, CFG.grab.noodleExit); delete s.st.noodle; this.loop(`purr:${s.id}`, 'purr', false); }
      c.wiggleT = this.hostT;
      this.addEscape(c, n);
    } else if (s.st.caged) {
      const max = CFG.carrier.mashMaxCut * c.cageTotal;
      if (c.cageCut < max) {
        const cut = Math.min(CFG.carrier.mashCut * n, max - c.cageCut);
        c.cageCut += cut;
        s.st.caged = Math.max(0.01, s.st.caged - cut);
      }
      s.mash = clamp(1 - s.st.caged / c.cageTotal, 0, 1);
      if (this.rng() < 0.3) this.sound('cageOpen', s.p, { volume: 0.3, pitch: 1.5 });
    } else if (s.st.hypnotized) {
      s.mash += n / CFG.tv.mash;
      if (s.mash >= 1) { delete s.st.hypnotized; s.lookAt = null; s.tp++; s.mash = 0; this.fx('exclaim', add(s.p, [0, 0.6, 0])); }
    }
  }

  private addEscape(c: SimChar, n: number) {
    const s = c.s;
    s.mash += n / CFG.grab.escapePresses;
    if (s.mash < 1 || !s.grabbedBy) return;
    const h = this.byId.get(s.grabbedBy);
    if (h) {
      this.releaseHeld(h.s);
      this.give(h.s, 'stunned', 0.3);
      this.toast(`${s.name} wiggled free`, h.s.id, 'bad');
    }
    this.stat(s.id, 'escapes', 1);
    this.sound('hiss', s.p, { pitch: c.pitch });
  }

  grab(sitter: SimChar, cat: SimChar) {
    const s = cat.s;
    if (s.grabbedBy || s.st.caged || sitter.s.holding) return;
    this.interactions.stop(cat, false);
    this.interactions.stop(sitter, false);
    this.setPush(cat, false);
    if (s.item) this.dropItem(s);
    // M12: grabbed off something it was sitting on: can't block that spot again for a while
    if (s.loaf) cat.noBlock.push({ p: [...s.p], until: this.hostT + CFG.grab.reblock });
    s.grabbedBy = sitter.s.id;
    s.st.limp = CFG.grab.limp;
    delete s.st.hypnotized;
    delete s.st.treat;
    delete s.st.tossed;
    s.lookAt = null;
    s.loaf = false;
    s.mash = 0;
    cat.hissUsed = false;
    cat.wiggleT = this.hostT + CFG.grab.limp;
    sitter.s.holding = s.id;
    this.sound('pickup', s.p);
    this.stat(sitter.s.id, 'catsGrabbed', 1);
    this.stat(s.id, 'timesGrabbed', 1);
  }

  /** let go of the held cat; returns it (or null) */
  private letGo(sitter: Char): SimChar | null {
    const cat = sitter.holding ? this.byId.get(sitter.holding) ?? null : null;
    sitter.holding = null;
    if (!cat) return null;
    const s = cat.s;
    s.grabbedBy = null;
    s.mash = 0;
    delete s.st.limp;
    if (s.st.noodle) { delete s.st.noodle; this.loop(`purr:${s.id}`, 'purr', false); }
    s.st.grabImmune = CFG.grab.immunity;
    return cat;
  }

  releaseHeld(sitter: Char) {
    const cat = this.letGo(sitter);
    if (!cat) return;
    const s = cat.s;
    const chest: Vec3 = [sitter.p[0], sitter.p[1] + 0.4, sitter.p[2]];
    const f = fwd(sitter.yaw);
    const room = rayDist(this.world, chest, f, 0.8);
    s.p = [sitter.p[0] + f[0] * Math.max(0, room - 0.25), sitter.p[1] + 0.05, sitter.p[2] + f[2] * Math.max(0, room - 0.25)];
    s.tp++;
    if (cat.brain) cat.motion.teleport(s.p, s.yaw);
    const h = this.byId.get(sitter.id);
    if (h) this.gesture(h, 'drop', 0.4);
    this.sound('drop', s.p, { volume: 0.5 });
  }

  /** throw the held cat from the hand with velocity v (toss, slip launch) */
  private launch(sitter: SimChar, v: Vec3) {
    const cat = this.letGo(sitter.s);
    if (!cat) return null;
    const s = cat.s, h = sitter.s;
    const f = fwd(h.yaw);
    const room = rayDist(this.world, [h.p[0], h.p[1] + 0.75, h.p[2]], f, 0.8);
    const hand = add(add(h.p, f, Math.max(0, Math.min(0.5, room - 0.22))), [0, 0.75, 0]);
    this.teleport(s, hand, h.yaw);
    s.st.tossed = CFG.toss.maxAir;
    cat.tossT = this.hostT;
    cat.airSeen = false;
    cat.bounced = false;
    this.push(cat, v);
    return cat;
  }

  private toss(c: SimChar, dir: Vec3) {
    const s = c.s, T = CFG.toss;
    if (s.role !== 'sitter' || !s.holding) return;
    let hx = dir[0], hz = dir[2];
    const hl = Math.hypot(hx, hz);
    if (hl < 1e-3) { [hx, , hz] = fwd(s.yaw); } else { hx /= hl; hz /= hl; }
    const pitch = clamp((Math.atan2(dir[1], hl) * 180) / Math.PI, T.pitchMin, T.pitchMax);
    s.yaw = Math.atan2(hx, hz);
    const cat = this.launch(c, [hx * T.fwd, T.up + (pitch / T.pitchMax) * T.pitchUp, hz * T.fwd]);
    if (!cat) return;
    this.gesture(c, 'toss', T.anim);
    this.sound('whoosh', s.p);
    this.stat(s.id, 'tosses', 1);
    this.after(0.25, () => this.sound('meowShort', cat.s.p, { pitch: 1.2 }));
  }

  /** M3 landing: stun, no loaf, one bounce on soft colliders */
  private updateTossed(c: SimChar) {
    const s = c.s, T = CFG.toss;
    if (!s.g) c.airSeen = true;
    if (!c.airSeen || !s.g || this.hostT - c.tossT < 0.15) return;
    if (!c.bounced && this.inBoxes(s.p, this.soft, true)) {
      c.bounced = true;
      c.airSeen = false;
      c.tossT = this.hostT;
      this.push(c, [s.v[0] * 0.3, T.bounce, s.v[2] * 0.3]);
      this.sound('land', s.p, { pitch: 1.4, volume: 0.6 });
      return;
    }
    delete s.st.tossed;
    this.give(s, 'stunned', T.stun);
    this.give(s, 'noLoaf', T.noLoaf);
    s.loaf = false;
    this.sound('land', s.p);
    this.fx('dust', s.p, { scale: 0.6 });
  }

  // ------------------------------------------------------------------ sitter verbs (M4, M5)
  private slip(c: SimChar, m: Mess | null) {
    const s = c.s, S = CFG.slip;
    this.interactions.stop(c, false);
    this.give(s, 'slip', S.time);
    this.give(s, 'slipImmune', S.time + S.immune);
    this.fx('stars', add(s.p, [0, 0.9, 0]), { duration: S.time, follow: s.id }); // over the body: it's lying down
    this.sound('whoosh', s.p);
    this.after(0.25, () => this.sound('thud', s.p));
    this.stat(s.id, 'slips', 1);
    if (m?.kind === 'hairball') { m.scale *= S.smear; this.messVer++; }
    if (s.holding) {
      const f = fwd(s.yaw);
      this.launch(c, [f[0] * S.launchFwd, S.launchUp, f[2] * S.launchFwd]);
    }
  }

  private slipCheck(c: SimChar) {
    const s = c.s, S = CFG.slip;
    if (!s.g || !s.sprint || s.forced || s.st.slip || s.st.slipImmune || Math.hypot(s.v[0], s.v[2]) <= S.speed) return;
    const near = (p: Vec3) => distXZ(p, s.p) < S.range && Math.abs(p[1] - s.p[1]) < 0.3;
    for (const m of this.mess.values()) if (SLIPPY_MESS.has(m.kind) && near(m.p)) return this.slip(c, m);
    for (const pr of this.props.values()) if (pr.fallen && SLIPPY_PROP.has(pr.kind) && near([pr.p[0], pr.p[1] - pr.lift, pr.p[2]])) return this.slip(c, null);
  }

  private clap(c: SimChar) {
    const s = c.s, C = CFG.clap;
    if (s.role !== 'sitter' || s.cd.clap || s.holding) return;
    s.cd.clap = this.sc.clap;
    this.gesture(c, 'clap', C.anim);
    const eye: Vec3 = [s.p[0], s.p[1] + 1.5, s.p[2]];
    this.sound('clap', eye);
    for (const o of this.chars) {
      const st = o.s.st;
      if (o.s.role !== 'cat' || o.s.loaf || o.s.grabbedBy || st.caged || st.hypnotized || st.fight) continue;
      if (dist(o.s.p, s.p) > C.range || !this.lineOfSight(eye, [o.s.p[0], o.s.p[1] + 0.25, o.s.p[2]])) continue;
      this.interactions.stop(o, false);
      this.setPush(o, false);
      this.give(o.s, 'shock', C.shock);
      this.fx('exclaim', add(o.s.p, [0, 0.6, 0]), { follow: o.s.id });
    }
  }

  cage(cat: Char, seconds: number) {
    const c = this.byId.get(cat.id);
    if (!c) return;
    const holder = cat.grabbedBy ? this.byId.get(cat.grabbedBy) : null;
    if (holder) { this.letGo(holder.s); this.stat(holder.s.id, 'catsJailed', 1); }
    const sp = this.level.spots.find((x) => x.id === 'carrier');
    const base = sp ? sp.pos : cat.p;
    c.cagePos = sp ? add(base, fwd(sp.facing), 0.45) : [...base];
    c.cageCut = 0;
    c.cageTotal = Math.max(1, seconds);
    c.cageMeows = 0;
    cat.st.caged = seconds;
    delete cat.st.grabImmune;
    cat.mash = 0;
    cat.p = [...c.cagePos];
    cat.tp++;
  }

  uncage(cat: Char) {
    const c = this.byId.get(cat.id);
    if (!c || !c.cagePos) return;
    delete cat.st.caged;
    const sp = this.level.spots.find((x) => x.id === 'carrier');
    cat.p = sp ? [...sp.pos] : cat.p;
    cat.tp++;
    if (c.brain) c.motion.teleport(cat.p, cat.yaw);
    cat.mash = 0;
    cat.st.grabImmune = CFG.grab.immunity;
    c.cagePos = null;
    c.cageMeows = 0;
    this.sound('cageOpen', cat.p);
  }

  teleport(ch: Char, p: Vec3, yaw?: number) {
    const c = this.byId.get(ch.id);
    if (!c) return;
    ch.p = [...p];
    if (yaw !== undefined) ch.yaw = yaw;
    ch.tp++;
    c.motion.teleport(ch.p, ch.yaw);
  }

  hypnotize(cat: Char, seconds: number, lookAt: Vec3) {
    if (cat.grabbedBy || cat.st.caged || cat.st.fight) return;
    const c = this.byId.get(cat.id);
    if (c) { this.interactions.stop(c, false); this.setPush(c, false); }
    cat.st.hypnotized = seconds;
    cat.lookAt = lookAt;
    cat.mash = 0;
    cat.loaf = false;
  }

  // ------------------------------------------------------------------ rules
  private updateRules(dt: number) {
    const T = CFG.treats, G2 = CFG.grab;
    const sitter = this.chars.find((c) => c.s.role === 'sitter');
    for (const c of this.chars) {
      const s = c.s, st = s.st;
      const moved = distXZ(s.p, c.lastPos);
      c.lastPos = [...s.p];
      if (s.role === 'sitter') {
        if (s.holding) this.stat(s.id, 'carryTime', dt);
        this.slipCheck(c);
        this.updatePanic(c, dt);
        continue;
      }
      if (s.sprint && moved < 1) this.stat(s.id, 'zoomDist', moved);
      if (s.loaf) { this.stat(s.id, 'loafTime', dt); if (this.blocking(s)) this.stat(s.id, 'blockTime', dt); }
      if (st.caged) this.stat(s.id, 'timeCaged', dt);
      if (st.tossed) this.updateTossed(c);
      if (c.pushOn) this.updatePush(c, dt, sitter);
      if (c.noBlock.length) c.noBlock = c.noBlock.filter((b) => b.until > this.hostT);
      // noodle: held, limp over, no wiggle for 2 s
      if (s.grabbedBy && !st.limp && this.hostT - c.wiggleT >= G2.noodleAfter) {
        if (!st.noodle) this.loop(`purr:${s.id}`, 'purr', true, s.p);
        st.noodle = 0.25;
      }
      if (st.noodle) this.stat(s.id, 'noodleTime', dt);
      // poop need
      if (s.poop < 1) {
        s.poop = Math.min(1, s.poop + dt * c.poopRate);
        if (s.poop >= 1) { this.toast('Gotta go. Litter box is in the bathroom.', s.id, 'info'); this.fx('sweat', add(s.p, [0, 0.6, 0]), { follow: s.id }); }
      } else s.desperate += dt;
      // treats
      if (st.treat && sitter) {
        s.lookAt = add(sitter.s.p, [0, 1.5, 0]);
        if (distXZ(s.p, sitter.s.p) < T.eatRange && !s.forced) {
          delete st.treat;
          s.lookAt = null;
          this.give(s, 'fed', T.fed);
          st.eating = T.freeze;
          this.interactions.stop(c, false);
          this.setPush(c, false);
          this.sound('crunch', s.p);
          this.fx('hearts', add(s.p, [0, 0.5, 0]));
          this.stat(s.id, 'treatsEaten', 1);
        }
      }
    }
    this.updateFights(dt);
  }

  /** M7 panic: meter >= 80 until it drops below 78 */
  private updatePanic(c: SimChar, dt: number) {
    const P = CFG.panic, s = c.s;
    if (!c.panicOn && this.meter >= P.on) { c.panicOn = true; c.sweatT = 0; }
    else if (c.panicOn && this.meter < P.off) c.panicOn = false;
    if (!c.panicOn) return;
    s.st.panic = 0.3;
    if ((c.sweatT -= dt) <= 0) { c.sweatT = P.sweatEvery; this.fx('sweat', add(s.p, [0, 1.9, 0]), { follow: s.id }); }
  }

  /** a loafing cat is sitting on a mess, a fallen prop or a spot */
  private blocking(s: CharState) {
    const R = CFG.interact.sitBlockRange;
    const near = (p: Vec3) => distXZ(p, s.p) < R && Math.abs(p[1] - s.p[1]) < 0.8;
    for (const m of this.mess.values()) if (near(m.p)) return true;
    for (const sp of this.level.spots) if (near(sp.pos)) return true;
    for (const pr of this.props.values()) if (pr.fallen && near(pr.p)) return true;
    return false;
  }

  private after(t: number, fn: () => void) { this.later.push({ t, fn }); }

  private spotPos(id: SpotId): Vec3 | null { return this.level.spots.find((x) => x.id === id)?.pos ?? null; }

  private end(winner: Role, forfeit?: string) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.winner = winner;
    this.forfeit = forfeit;
    this.endT = 0;
    this.interactions.stopAll();
    for (const c of this.chars) { this.setPush(c, false); this.loop(`purr:${c.s.id}`, 'purr', false); }
    for (const f of [...this.fights]) this.endFight(f);
    this.sound('door');
    if (forfeit) this.popup('ROUND OVER', undefined, winner === 'cat' ? '#e05a47' : '#4caf7a');
  }

  private finish() {
    const fallen = [...this.props.values()].filter((p) => p.fallen && p.def.fallenMess > 0);
    this.results = buildResults({
      winner: this.winner ?? 'sitter', meter: this.meter, timeLeft: this.timeLeft, forfeit: this.forfeit, overtime: this.hadOvertime,
      players: this.chars.map((c) => ({ id: c.s.id, name: c.s.name, role: c.s.role, bot: c.s.bot, stats: this.stats[c.s.id] })),
      disasters: this.disasters, mess: this.messes(),
      fallen: { count: fallen.length, points: fallen.reduce((a, p) => a + p.def.fallenMess * p.eyeMul * this.sc.clutter, 0) },
      penalties: [...this.penalties],
    });
    this.emit({ e: 'results', results: this.results });
  }

  /** M14 balance line */
  balance() {
    const sum = (k: keyof Stats) => this.chars.reduce((a, c) => a + (this.stats[c.s.id]?.[k] ?? 0), 0);
    return {
      n: this.n, difficulty: this.cfg.botDifficulty, winner: this.winner, endTime: Math.round(this.time), overtime: this.hadOvertime,
      meter: Math.round(this.meter), meterAt: this.meterAt,
      permanents: this.disasters.map((d) => `${d.key}@${Math.round(d.t)}`),
      grabs: sum('catsGrabbed'), jails: sum('catsJailed'), undos: sum('undos'), tosses: sum('tosses'), slips: sum('slips'),
    };
  }

  dispose() { this.world.free(); }

  /** debug: end now */
  forceEnd(winner: Role) { this.end(winner); this.endT = CFG.round.endDelay; }

  /** integrator / test helpers (window.__game.sim.dbg) */
  readonly dbg = {
    sitter: () => this.chars.find((c) => c.s.role === 'sitter') ?? null,
    cat: (id?: string) => (id ? this.byId.get(id) : this.chars.find((c) => c.s.role === 'cat')) ?? null,
    grab: (catId?: string) => { const s = this.dbg.sitter(), c = this.dbg.cat(catId); if (s && c) { delete c.s.st.grabImmune; this.grab(s, c); } },
    noodle: () => { const s = this.dbg.sitter(); const c = s?.s.holding ? this.byId.get(s.s.holding) : null; if (c) { delete c.s.st.limp; c.wiggleT = this.hostT - 10; } },
    toss: (dir?: Vec3) => { const s = this.dbg.sitter(); if (s) this.toss(s, dir ?? fwd(s.s.yaw)); },
    slip: () => { const s = this.dbg.sitter(); if (s) this.slip(s, null); },
    clap: () => { const s = this.dbg.sitter(); if (s) { delete s.s.cd.clap; this.clap(s); } },
    meter: (v: number) => { this.permanent += v - this.updateMeter(); this.updateMeter(); },
    overtime: (meter = 92, at = 5) => { this.timeLeft = at; this.dbg.meter(meter); },
    hairball: (catId?: string) => { const c = this.dbg.cat(catId); if (c) { delete c.s.cd.hairball; this.hairball(c); } },
    push: (on = true, catId?: string) => { const c = this.dbg.cat(catId); if (c) this.setPush(c, on); },
    fight: (a?: string, b?: string) => {
      const cats = this.chars.filter((c) => c.s.role === 'cat');
      const x = a ? this.byId.get(a) : cats[0], y = b ? this.byId.get(b) : cats[1];
      if (x && y && x !== y) this.startFight(x, y);
    },
    fights: () => this.fights,
  };

  // ------------------------------------------------------------------ bots
  private botView(c: SimChar): BotWorldView {
    const options: BotOption[] = [];
    for (const k of this.interactions.candidates(c, true, false)) {
      options.push({
        key: k.key, label: k.label, ok: k.ok, at: k.anchor, range: k.range, spot: k.spot?.id ?? null,
        room: this.roomAt(k.anchor), interactable: k.def?.id ?? '', alert: !!k.use.alert,
      });
    }
    return {
      self: c.s,
      chars: this.chars.map((x) => x.s),
      options,
      prompt: c.s.prompt,
      mess: this.messes(),
      props: this.propList(),
      level: this.level,
      nav: this.level.nav,
      world: this.keys,
      time: this.time,
      timeLeft: this.timeLeft,
      meter: this.meter,
      difficulty: this.cfg.botDifficulty,
      doorOpen: (id) => this.doorOpen(id),
      roomAt: (p) => this.roomAt(p),
      sitterSees: (id) => { const x = this.byId.get(id); return !!x && this.sitterSees(x.s); },
      rng: this.rng,
    };
  }

  // ------------------------------------------------------------------ snapshot / events
  emit(ev: GameEvent, to?: Target) { this.out.push({ ev, to }); }

  snapshot(): Snapshot {
    const full = this.hostT - this.lastFullProps > 2;
    if (full) this.lastFullProps = this.hostT;
    const props: PropSnap[] = [];
    for (const pr of this.props.values()) {
      const cur = [r3(pr.p[0]), r3(pr.p[1]), r3(pr.p[2]), r3(pr.q[0]), r3(pr.q[1]), r3(pr.q[2]), r3(pr.q[3])];
      const changed = !pr.sent || cur.some((v, i) => Math.abs(v - pr.sent![i]) > 0.002);
      if (!full && !changed) continue;
      pr.sent = cur;
      props.push([pr.id, pr.kind, cur[0], cur[1], cur[2], cur[3], cur[4], cur[5], cur[6], pr.fallen ? 1 : 0]);
    }
    // ?autobot: the owner's client snaps its own view to the host every snapshot
    if (this.cfg.autobot) for (const id of this.cfg.autobot) { const c = this.byId.get(id); if (c) c.s.tp++; }
    const snap: Snapshot = {
      t: r3(this.hostT), phase: this.phase, countdown: r3(this.countdown), timeLeft: r3(this.timeLeft),
      meter: r3(this.meter), permanent: this.permanent,
      chars: this.chars.map((c) => ({ ...c.s, p: rv(c.s.p), v: rv(c.s.v), yaw: r3(c.s.yaw) })),
      props,
      messVer: this.messVer, mess: full || this.messVer !== this.sentMessVer ? this.messes() : undefined,
      worldVer: this.worldVer, world: full || this.worldVer !== this.sentWorldVer ? { ...this.keys } : undefined,
      alerts: [...this.alerts.values()],
      overtime: r3(this.overtime),
    };
    this.sentMessVer = this.messVer;
    this.sentWorldVer = this.worldVer;
    return snap;
  }

  // ------------------------------------------------------------------ SimContext backing
  spot(id: SpotId): Spot {
    const s = this.level.spots.find((x) => x.id === id);
    if (!s) throw new Error(`level has no spot ${id}`);
    return s;
  }
  roomAt(p: Vec3): RoomId | null {
    for (const r of this.level.rooms) if (p[0] >= r.min[0] && p[0] <= r.max[0] && p[2] >= r.min[2] && p[2] <= r.max[2]) return r.id;
    return null;
  }
  roomName(room: RoomId | null) {
    return room ? this.level.rooms.find((r) => r.id === room)?.name ?? ROOM_NAMES[room] : 'Somewhere';
  }
  give(ch: Char, st: StatusKey, seconds: number) {
    ch.st[st] = Math.max(ch.st[st] ?? 0, 0) + seconds;
    if (st === 'noLoaf') ch.loaf = false;
  }
  /** end a status now (runs its expiry effects: uncage, un-hypnotize...) */
  clear(ch: Char, st: StatusKey) {
    const c = this.byId.get(ch.id);
    if (!ch.st[st]) return;
    delete ch.st[st];
    if (c) this.statusExpired(c, st);
  }
  setItem(ch: Char, item: PropKind | null) { ch.item = item; }
  dropItem(ch: Char): number | null {
    if (!ch.item) return null;
    const kind = ch.item;
    ch.item = null;
    return this.spawnProp(kind, add(ch.p, fwd(ch.yaw), 0.3), ch.yaw);
  }
  stat(id: string, key: keyof Stats, n: number) { const s = this.stats[id]; if (s) s[key] = (s[key] ?? 0) + n; }
  workMul(ch: Char) {
    const c = this.byId.get(ch.id);
    return c ? this.interactions.workMul(c, { role: ch.role, label: '', mode: 'hold', onComplete() {} }) : 1;
  }
  sitterSees(ch: Char): boolean {
    const sitter = this.chars.find((c) => c.s.role === 'sitter');
    if (!sitter || sitter.s.id === ch.id) return false;
    const eye: Vec3 = [sitter.s.p[0], sitter.s.p[1] + 1.6, sitter.s.p[2]];
    const t: Vec3 = [ch.p[0], ch.p[1] + 0.25, ch.p[2]];
    const d = dist(eye, t);
    if (d > CFG.eye.range || d < 0.01) return false;
    const L = sitter.s.look, ll = Math.hypot(L[0], L[1], L[2]) || 1;
    const dot = (L[0] * (t[0] - eye[0]) + L[1] * (t[1] - eye[1]) + L[2] * (t[2] - eye[2])) / (ll * d);
    return dot > CFG.eye.dot && this.lineOfSight(eye, t);
  }
  lineOfSight(a: Vec3, b: Vec3) { return lineOfSight(this.world, a, b); }
  cancelWork(ch: Char) { const c = this.byId.get(ch.id); if (c) this.interactions.stop(c, false); }
  setWorld(key: string, value: WorldVisualValue) {
    if (this.keys[key] === value) return;
    this.keys[key] = value;
    this.worldVer++;
  }
  worldKey(key: string) { return this.keys[key]; }
  isDark() { return this.keys.lights === false; }
  setDoor(id: DoorDef['id'], open: boolean) {
    this.sw.setDoor(id, open);
    this.setWorld(`door.${id}`, open ? 1 : 0);
    const d = this.level.doors.find((x) => x.id === id);
    if (d) this.sound('door', d.hinge);
  }
  doorOpen(id: DoorDef['id']) { return this.keys[`door.${id}`] !== 0; }
  fx(kind: FxKind, p: Vec3, o: { dir?: Vec3; color?: string; scale?: number; duration?: number; follow?: string } = {}) {
    this.emit({ e: 'fx', kind, p: rv(p), dir: o.dir, color: o.color, scale: o.scale, dur: o.duration, follow: o.follow });
  }
  sound(name: SoundName, p?: Vec3, o: { pitch?: number; volume?: number } = {}) {
    this.emit({ e: 'sound', name, p: p ? rv(p) : undefined, pitch: o.pitch, vol: o.volume });
  }
  loop(id: string, name: SoundName, on: boolean, p?: Vec3) { this.emit({ e: 'loop', id, name, on, p }); }
  toast(text: string, to?: Role | string, tone?: 'good' | 'bad' | 'info') { this.emit({ e: 'toast', text, tone }, to); }
  popup(text: string, to?: Role | string, color?: string) { this.emit({ e: 'popup', text, color }, to); }
  text(text: string, p: Vec3, color?: string) { this.emit({ e: 'text', text, p: rv(p), color }); }
  alert(id: string, on: boolean, label?: string, p?: Vec3, progress?: number) {
    if (!on) { this.alerts.delete(id); return; }
    const prev = this.alerts.get(id);
    const pos = p ?? prev?.p ?? [0, 0, 0];
    const room = this.roomAt(pos);
    const a: Alert = { id, label: label ?? prev?.label ?? id, room, roomName: this.roomName(room), p: rv(pos) };
    const pr = progress ?? prev?.progress;
    if (pr !== undefined) a.progress = r3(clamp(pr, 0, 1));
    this.alerts.set(id, a);
  }
  progress(key: string) { return this.interactions.progress.get(key) ?? 0; }
  setProgress(key: string, v: number) { this.interactions.progress.set(key, v); }
}


function makeContext(sim: Sim): SimContext & { readonly n: number; readonly scale: ScaleRow; readonly difficulty: GameConfig['botDifficulty'] } {
  const ctx: SimContext = {
    get time() { return sim.time; },
    get timeLeft() { return sim.timeLeft; },
    level: sim.level,
    rng: () => sim.rng(),
    spot: (id) => sim.spot(id),
    roomAt: (p) => sim.roomAt(p),
    roomName: (r) => sim.roomName(r),
    chars: (role) => sim.chars.filter((c) => !role || c.s.role === role).map((c) => c.s),
    char: (id) => sim.byId.get(id)?.s,
    give: (ch, st, sec) => sim.give(ch, st, sec),
    clear: (ch, st) => sim.clear(ch, st),
    setItem: (ch, item) => sim.setItem(ch, item),
    dropItem: (ch) => sim.dropItem(ch),
    cage: (cat, sec) => sim.cage(cat, sec),
    uncage: (cat) => sim.uncage(cat),
    hypnotize: (cat, sec, at) => sim.hypnotize(cat, sec, at),
    releaseHeld: (s) => sim.releaseHeld(s),
    teleport: (ch, p, yaw) => sim.teleport(ch, p, yaw),
    stat: (id, k, n) => sim.stat(id, k, n),
    workMul: (ch) => sim.workMul(ch),
    sitterSees: (ch) => sim.sitterSees(ch),
    lineOfSight: (a, b) => sim.lineOfSight(a, b),
    cancelWork: (ch) => sim.cancelWork(ch),
    addMess: (k, p, o) => sim.addMess(k, p, o),
    removeMess: (id) => sim.removeMess(id),
    messes: () => sim.messes(),
    addPermanent: (pts: number, label: string, by?: string, spot?: SpotId) => sim.addPermanent(pts, label, by, spot),
    setPenalty: (k, pts) => sim.setPenalty(k, pts),
    setWorld: (k, v) => sim.setWorld(k, v),
    world: (k) => sim.worldKey(k),
    isDark: () => sim.isDark(),
    setDoor: (id, open) => sim.setDoor(id, open),
    doorOpen: (id) => sim.doorOpen(id),
    spawnProp: (k, p, r) => sim.spawnProp(k, p, r),
    removeProp: (id) => sim.removeProp(id),
    props: (k) => sim.propList(k),
    moveProp: (id, p, r) => sim.moveProp(id, p, r),
    fx: (k, p, o) => sim.fx(k, p, o),
    sound: (n, p, o) => sim.sound(n, p, o),
    loop: (id, n, on, p) => sim.loop(id, n, on, p),
    toast: (t, to, tone) => sim.toast(t, to, tone),
    popup: (t, to, c) => sim.popup(t, to, c),
    text: (t, p, c) => sim.text(t, p, c),
    alert: (id: string, on: boolean, l?: string, p?: Vec3, progress?: number) => sim.alert(id, on, l, p, progress),
    progress: (k) => sim.progress(k),
    setProgress: (k, v) => sim.setProgress(k, v),
  };
  return Object.assign(ctx, { n: sim.n, scale: sim.sc, difficulty: sim.cfg.botDifficulty });
}
