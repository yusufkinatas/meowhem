/**
 * Host-authoritative simulation: Rapier world with dynamic props, characters (bots simulated here,
 * players follow their owner's transforms), mess, meter, statuses, actions, interactions, bots.
 * Implements SimContext so interactable content talks to it directly.
 */
import type {
  DoorDef, FxKind, LevelData, MessKind, PropKind, Role, RoomId, SoundName, Spot, SpotId, Vec3, WorldVisualValue,
} from '../shared/contracts';
import { PROP_DEFS, MESS_WEIGHTS, type PropDef } from '../shared/propDefs';
import { CFG } from '../config';
import { RAPIER, buildStaticWorld, groups, G, yawQuat, lineOfSight, rayDist, type StaticWorld } from '../core/physics';
import { CharMotion, type MotionInput } from '../core/charMotion';
import { add, clamp, dist, distXZ, facingDot, fwd, makeRng, r3, rv, yawTo } from '../core/math';
import type {
  Action, Alert, CharState, GameConfig, GameEvent, Mess, MoveMsg, Phase, PlayerInfo, PropSnap, Results, Snapshot, StatusKey, Stats,
} from '../core/types';
import type { Char, PropView, SimContext } from './interactables/types';
import { Interactions } from './interact';
import { buildResults, emptyStats } from './awards';
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
  cagePos: Vec3 | null;
  lastPos: Vec3;
  pitch: number;
  intent: BotIntent;
  jumpHeld: boolean;
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
}

type Target = string | undefined; // player id, 'sitter' | 'cat', or everyone

/** sitter faces the cats, cats face the sitter */
export function spawnYaw(level: LevelData, role: Role, p: Vec3): number {
  const cs = level.spawns.cats;
  const t: Vec3 = role === 'sitter' && cs.length ? [cs.reduce((a, c) => a + c[0], 0) / cs.length, 0, cs.reduce((a, c) => a + c[2], 0) / cs.length] : level.spawns.sitter;
  return yawTo(p, t);
}

const FIGHT_SKILL = { kitten: 0.7, houseCat: 1, feral: 1.3 };

const ROOM_NAMES: Record<RoomId, string> = {
  living: 'Living room', kitchen: 'Kitchen', bathroom: 'Bathroom', bedroom: 'Bedroom', office: 'Office', hallway: 'Hallway',
};

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
  phase: Phase = 'countdown';
  countdown: number = CFG.round.countdown;
  time = 0;
  timeLeft: number;
  hostT = 0;
  meter = 0;
  permanent = 0;
  messVer = 1;
  worldVer = 1;
  results: Results | null = null;
  private endT = 0;
  private winner: Role | null = null;
  private forfeit: string | undefined;
  private nextPropId = 1;
  private nextMessId = 1;
  private keys: Record<string, WorldVisualValue> = {};
  private alerts = new Map<string, Alert>();
  private penalties = new Map<string, number>();
  private rugs: { c: Vec3; h: Vec3; r: number }[];
  private meowLog: { t: number; p: Vec3 }[] = [];
  private fights: { a: string; b: string; t: number; sa: number; sb: number; key: string; p: Vec3 }[] = [];
  private lastFullProps = -99;
  private sentMessVer = 0;
  private sentWorldVer = 0;

  constructor(readonly level: LevelData, readonly cfg: GameConfig) {
    this.rng = makeRng(cfg.seed);
    this.timeLeft = cfg.roundSeconds;
    this.sw = buildStaticWorld(level);
    this.world = this.sw.world;
    this.rugs = level.colliders.filter((b) => b.tag === 'rug').map((b) => ({ c: b.center, h: b.half, r: b.rotY ?? 0 }));
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
    const s: CharState = {
      id: info.id, role: info.role, name: info.name, bot: info.bot,
      p: [...spawn], yaw: spawnYaw(this.level, info.role, spawn), v: [0, 0, 0], g: true, tp: 0,
      sprint: false, charge: 0, loaf: false, look: [0, 0, 1],
      forced: false, frozen: true, mul: 1, st: {}, grabbedBy: null, holding: null, item: null,
      work: null, prompt: null, gest: null, gestT: 0, poop: this.rng() * 0.3, desperate: 0, stamina: 1,
      ammo: CFG.spray.ammo, cd: {}, mash: 0, lookAt: null,
    };
    let h = 0;
    for (const ch of info.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const c: SimChar = {
      s, info, motion: new CharMotion(this.world, info.role, spawn, s.yaw),
      brain: info.bot ? createBotBrain({ id: info.id, role: info.role, index, difficulty: this.cfg.botDifficulty, rng: makeRng(this.cfg.seed + index * 977) }) : null,
      poopRate: 1 / (CFG.poop.fillMin + this.rng() * (CFG.poop.fillMax - CFG.poop.fillMin)),
      lastHiss: -99, cageCut: 0, cagePos: null, lastPos: [...spawn], pitch: 0.85 + (h % 100) / 250, intent: {}, jumpHeld: false,
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
    s.loaf = m.loaf && s.role === 'cat';
    c.motion.follow(s.p, s.yaw);
  }

  action(id: string, act: Action) {
    const c = this.byId.get(id);
    if (!c) return;
    const s = c.s;
    if (act.a === 'mash') return this.mash(c, act.n ?? 1);
    if (act.a === 'mg') {
      const f = this.fights.find((x) => x.key === act.key);
      if (f) {
        if (f.a === id) f.sa += Math.max(0, Math.min(0.25, act.delta));
        else if (f.b === id) f.sb += Math.max(0, Math.min(0.25, act.delta));
        return;
      }
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
    if (this.phase !== 'playing' || s.forced) {
      if (act.a === 'hiss' && s.grabbedBy) this.mash(c, CFG.grab.hissBonus);
      return;
    }
    if (act.a === 'meow') return this.meow(c);
    if (act.a === 'hiss') return this.hiss(c);
    if (s.frozen) return;
    if (act.a === 'swipe') return this.swipe(c);
    if (act.a === 'spray') return this.spray(c, act.dir);
    if (act.a === 'treats') return this.treats(c);
    if (act.a === 'hairball') return this.hairball(c);
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
    } else if (this.phase === 'ended') {
      this.endT += dt;
      this.setWorld('frontDoor.open', clamp(this.endT / 1.5, 0, 1));
      if (!this.results && this.endT > CFG.round.endDelay) this.finish();
    }
    const playing = this.phase === 'playing';

    for (const c of this.chars) this.updateChar(c, dt, playing);
    this.world.step();
    this.updateProps(dt, playing);
    if (playing) {
      this.interactions.tick(dt);
      this.updateRules(dt);
    }
    this.updateMeter();
    if (playing) {
      if (this.meter >= 100) this.end('cat');
      else if (this.timeLeft <= 0) this.end('sitter');
    }
    for (const c of this.chars) {
      const b = this.interactions.best(c);
      c.s.prompt = b ? { key: b.key, label: b.label, ok: b.ok, hold: b.use.mode !== 'instant', progress: this.interactions.progress.get(b.pkey) ?? 0 } : null;
    }
  }

  private flags(c: SimChar, playing: boolean) {
    const s = c.s, st = s.st;
    s.forced = !!s.grabbedBy || !!st.caged || !!st.hypnotized || !!st.fight;
    s.frozen = !playing || s.forced || !!st.stunned || !!st.eating || !!st.hairball || !!st.flehmen || !!st.dizzy;
    let m = 1;
    if (s.role === 'cat') {
      if (st.wet) m *= CFG.spray.wetMul;
      if (s.poop >= 1) m *= CFG.poop.desperateMul;
      if (st.zoomies) m *= CFG.poop.zoomiesMul;
      if (st.catnip) m *= CFG.buffs.catnipMove;
      if (s.item) m *= 0.9;
    } else if (s.holding) m *= CFG.grab.carryMul;
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

    // forced positions
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
    m.step(dt, inp, { mul: s.mul, frozen: s.frozen, inSun: this.inSun(s.p) });
    s.p = [...m.pos];
    s.yaw = m.yaw;
    s.v = [...m.vel];
    s.g = m.grounded;
    s.sprint = m.sprinting;
    s.charge = m.charge;
    s.stamina = m.stamina / (s.role === 'cat' ? CFG.cat.stamina : CFG.sitter.stamina);
    if (s.role === 'sitter') s.look = fwd(s.yaw);
    if (intent.loaf !== undefined) s.loaf = intent.loaf && s.role === 'cat';
    if (Math.hypot(s.v[0], s.v[2]) > 0.5) s.loaf = false;
  }

  private applyIntent(c: SimChar, it: BotIntent) {
    const id = c.s.id;
    if (it.mash) this.action(id, { a: 'mash' });
    if (it.interact === null && c.s.work) this.interactions.stop(c, false);
    else if (it.interact) this.interactions.start(c, it.interact);
    if (it.swipe) this.action(id, { a: 'swipe' });
    if (it.spray) this.action(id, { a: 'spray', dir: it.spray });
    if (it.meow) this.action(id, { a: 'meow' });
    if (it.hiss) this.action(id, { a: 'hiss' });
    if (it.hairball) this.action(id, { a: 'hairball' });
    if (it.treats) this.action(id, { a: 'treats' });
  }

  inSun(p: Vec3) {
    return this.level.sunPatches.some((sp) => distXZ(p, sp.center) < sp.radius && Math.abs(p[1] - sp.center[1]) < 0.6);
  }

  private statusExpired(c: SimChar, k: StatusKey) {
    const s = c.s;
    if (k === 'caged') this.uncage(s);
    else if (k === 'hypnotized') { s.lookAt = null; s.tp++; }
    else if (k === 'fight') s.tp++;
    else if (k === 'treat') s.lookAt = null;
    else if (k === 'hairball') {
      const p = add(s.p, fwd(s.yaw), 0.3);
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

  private eyeCheck(pr: SimProp, who: SimChar | null) {
    if (pr.eyeMul > 1) return;
    if (who && (pr.seen || this.sitterSees(who.s))) {
      pr.eyeMul = 2;
      this.popup('EYE CONTACT', undefined, '#ff7a59');
      this.text('x2', pr.p, '#ff7a59');
      this.stat(who.s.id, 'eyeContacts', 1);
    }
  }

  private onFallen(pr: SimProp) {
    pr.fallen = true;
    const who = this.culprit(pr);
    this.eyeCheck(pr, who);
    if (who) {
      this.stat(who.s.id, 'knocked', 1);
      this.stat(who.s.id, 'messCaused', pr.def.fallenMess * pr.eyeMul);
    }
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
    if (who) {
      this.stat(who.s.id, 'knocked', 1);
      this.stat(who.s.id, 'broken', 1);
    }
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

  private onRugAt(p: Vec3) {
    return this.rugs.some(({ c, h, r }) => {
      const dx = p[0] - c[0], dz = p[2] - c[2];
      const lx = dx * Math.cos(r) - dz * Math.sin(r), lz = dx * Math.sin(r) + dz * Math.cos(r);
      return Math.abs(lx) <= h[0] && Math.abs(lz) <= h[2] && Math.abs(p[1] - c[1]) < 0.4;
    });
  }

  addMess(kind: MessKind, p: Vec3, opts: { by?: string; scale?: number; mul?: number; yaw?: number } = {}): number {
    const id = this.nextMessId++;
    const pos: Vec3 = [r3(p[0]), r3(this.surfaceY(p) + 0.005), r3(p[2])];
    const onRug = this.onRugAt(pos);
    const w = MESS_WEIGHTS[kind] * (opts.mul ?? 1) * (kind === 'hairball' && onRug ? 2 : 1);
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

  addPermanent(points: number, label: string, by?: string) {
    this.permanent += points;
    this.popup(`${label}  +${points}%`, undefined, '#e05a47');
    if (by) { this.stat(by, 'disasterPoints', points); this.stat(by, 'messCaused', points); }
    for (const c of this.chars) if (c.s.role === 'sitter') this.give(c.s, 'panic', 1.6);
    this.sound('alarm');
  }

  setPenalty(key: string, points: number) {
    if (points) this.penalties.set(key, points);
    else this.penalties.delete(key);
  }

  private updateMeter() {
    let m = this.permanent;
    for (const x of this.mess.values()) m += x.w;
    for (const p of this.props.values()) if (p.fallen) m += p.def.fallenMess * p.eyeMul;
    for (const v of this.penalties.values()) m += v;
    this.meter = clamp(m, 0, 100);
  }

  // ------------------------------------------------------------------ actions
  private gesture(c: SimChar, g: CharState['gest'], t = 0.5) {
    c.s.gest = g;
    c.s.gestT = t;
  }

  private swipe(c: SimChar) {
    const s = c.s, P = CFG.props;
    if (s.role !== 'cat' || s.cd.swipe) return;
    s.cd.swipe = P.swipeCooldown;
    s.loaf = false;
    this.gesture(c, 'swipe', 0.35);
    const seen = this.sitterSees(s);
    const f = fwd(s.yaw);
    const chest: Vec3 = [s.p[0], s.p[1] + 0.2, s.p[2]];
    let hit = false;
    for (const pr of this.props.values()) {
      const dy = pr.p[1] - s.p[1];
      if (dy < -0.25 || dy > 0.9) continue;
      const d = distXZ(chest, pr.p);
      if (d > P.swipeRange || (d > 0.2 && facingDot(s.yaw, chest, pr.p) < 0.35)) continue;
      const m = pr.def.mass;
      const k = P.swipeSpeed * (0.85 + this.rng() * 0.3);
      pr.body.applyImpulse({ x: f[0] * k * m, y: P.swipeUp * m, z: f[2] * k * m }, true);
      pr.body.applyTorqueImpulse({ x: (this.rng() - 0.5) * m * 0.05, y: (this.rng() - 0.5) * m * 0.05, z: (this.rng() - 0.5) * m * 0.05 }, true);
      pr.touchBy = s.id;
      pr.touchT = this.hostT;
      pr.seen = seen;
      hit = true;
    }
    for (const o of this.chars) {
      if (o === c || o.s.forced || dist(o.s.p, s.p) > 0.8 || facingDot(s.yaw, s.p, o.s.p) < 0.4) continue;
      this.push(o, [f[0] * 2.5, 1.8, f[2] * 2.5]);
      if (o.s.role === 'cat') this.fx('exclaim', add(o.s.p, [0, 0.6, 0]));
      hit = true;
    }
    this.sound(hit ? 'whoosh' : 'whoosh', s.p, { volume: 0.35, pitch: 1.3 });
  }

  /** knockback; owner-simulated chars get it as an event */
  push(c: SimChar, v: Vec3) {
    if (c.brain) c.motion.impulse(v);
    else this.emit({ e: 'push', id: c.s.id, v }, c.s.id);
  }

  private spray(c: SimChar, dir: Vec3) {
    const s = c.s, S = CFG.spray;
    if (s.role !== 'sitter' || s.cd.spray || s.holding) return;
    if (s.ammo <= 0) {
      this.sound('buzz', s.p, { volume: 0.4 });
      this.toast('Out of water. Refill at the kitchen sink.', s.id, 'bad');
      s.cd.spray = 1;
      return;
    }
    s.ammo--;
    s.cd.spray = S.cooldown;
    this.gesture(c, 'spray', 0.35);
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const d: Vec3 = [dir[0] / l, dir[1] / l, dir[2] / l];
    const nozzle: Vec3 = add(add(s.p, [0, 1.25, 0]), [d[0], 0, d[2]], 0.45);
    this.fx('spray', nozzle, { dir: d });
    this.sound('spray', nozzle);
    const cos = Math.cos((S.coneDeg * Math.PI) / 180);
    for (const o of this.chars) {
      if (o.s.role !== 'cat' || o.s.st.caged || o.s.grabbedBy) continue;
      const t: Vec3 = [o.s.p[0], o.s.p[1] + 0.2, o.s.p[2]];
      // horizontal cone (the bottle arcs; cats are low), generous vertical band
      const tx = t[0] - s.p[0], tz = t[2] - s.p[2], ty = t[1] - nozzle[1];
      const tl = Math.hypot(tx, tz), dl = Math.hypot(d[0], d[2]) || 1;
      if (tl > S.range + 0.3 || ty > 0.8 || ty < -1.9) continue;
      if (tl > 0.5 && (tx * d[0] + tz * d[2]) / (tl * dl) < cos) continue;
      if (!this.lineOfSight(nozzle, t)) continue;
      this.give(o.s, 'stunned', S.stun);
      this.give(o.s, 'wet', S.wet);
      if (o.s.item) this.dropItem(o.s);
      this.interactions.stop(o, false);
      o.s.loaf = false;
      this.fx('splash', t);
      this.sound('yowl', t, { pitch: o.pitch });
      this.stat(s.id, 'sprayHits', 1);
      if (o.s.st.hypnotized) delete o.s.st.hypnotized;
    }
  }

  private treats(c: SimChar) {
    const s = c.s, T = CFG.treats;
    if (s.role !== 'sitter' || s.cd.treats) return;
    s.cd.treats = T.cooldown;
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
    this.sound(loud ? 'meowLong' : this.rng() < 0.5 ? 'meow' : 'mrrp', s.p, { pitch: c.pitch * (s.st.catnip ? 1.3 : 1) });
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

  private startFight(a: SimChar, b: SimChar) {
    const F = CFG.fight;
    const p: Vec3 = [(a.s.p[0] + b.s.p[0]) / 2, Math.min(a.s.p[1], b.s.p[1]), (a.s.p[2] + b.s.p[2]) / 2];
    const key = `fight:${Math.floor(this.hostT * 1000)}`;
    for (const [x, y] of [[a, b], [b, a]] as const) {
      this.interactions.stop(x, false);
      x.s.st.fight = F.lock;
      x.s.p = add(p, fwd(yawTo(p, x.s.p)), 0.25);
      x.s.yaw = yawTo(x.s.p, p);
      if (x.s.item) this.dropItem(x.s);
      if (!x.s.bot) this.emit({ e: 'mgOpen', key, kind: 'fight', data: { opponent: y.s.name } }, x.s.id);
    }
    this.fights.push({ a: a.s.id, b: b.s.id, t: F.lock, sa: 0, sb: 0, key, p });
    this.fx('fightCloud', p, { duration: F.lock, scale: 1 });
    this.sound('fight', p);
  }

  private hairball(c: SimChar) {
    const s = c.s;
    if (s.role !== 'cat' || s.cd.hairball || s.work) return;
    if (this.chars.some((o) => o !== c && o.s.role === 'cat' && dist(o.s.p, s.p) < CFG.fight.range)) return;
    s.cd.hairball = CFG.hairball.cooldown;
    s.st.hairball = CFG.hairball.hack;
    s.loaf = false;
    this.sound('hairball', s.p, { pitch: c.pitch });
  }

  private mash(c: SimChar, n: number) {
    const s = c.s;
    this.gesture(c, 'mash', 0.25);
    if (s.grabbedBy) {
      if (s.st.limp) return;
      s.mash += n / CFG.grab.escapePresses;
      if (s.mash >= 1) {
        const h = this.byId.get(s.grabbedBy);
        if (h) {
          this.releaseHeld(h.s);
          this.give(h.s, 'stunned', 0.3);
          this.toast(`${s.name} wiggled free`, h.s.id, 'bad');
        }
        this.sound('hiss', s.p, { pitch: c.pitch });
      }
    } else if (s.st.caged) {
      if (c.cageCut < CFG.carrier.mashMaxCut) {
        const cut = Math.min(CFG.carrier.mashCut * n, CFG.carrier.mashMaxCut - c.cageCut);
        c.cageCut += cut;
        s.st.caged = Math.max(0.01, s.st.caged - cut);
      }
      s.mash = 1 - s.st.caged / CFG.carrier.time;
      if (this.rng() < 0.3) this.sound('cageClose', s.p, { volume: 0.3, pitch: 1.4 });
    } else if (s.st.hypnotized) {
      s.mash += n / CFG.tv.mash;
      if (s.mash >= 1) { delete s.st.hypnotized; s.lookAt = null; s.tp++; s.mash = 0; this.fx('exclaim', add(s.p, [0, 0.6, 0])); }
    }
  }

  grab(sitter: SimChar, cat: SimChar) {
    const s = cat.s;
    if (s.grabbedBy || s.st.caged || sitter.s.holding) return;
    this.interactions.stop(cat, false);
    this.interactions.stop(sitter, false);
    if (s.item) this.dropItem(s);
    s.grabbedBy = sitter.s.id;
    s.st.limp = CFG.grab.limp;
    delete s.st.hypnotized;
    delete s.st.treat;
    s.lookAt = null;
    s.loaf = false;
    s.mash = 0;
    sitter.s.holding = s.id;
    this.sound('pickup', s.p);
    this.stat(sitter.s.id, 'catsGrabbed', 1);
    this.stat(s.id, 'timesGrabbed', 1);
  }

  releaseHeld(sitter: Char) {
    const cat = sitter.holding ? this.byId.get(sitter.holding) : null;
    sitter.holding = null;
    if (!cat) return;
    const s = cat.s;
    s.grabbedBy = null;
    s.mash = 0;
    delete s.st.limp;
    const chest: Vec3 = [sitter.p[0], sitter.p[1] + 0.4, sitter.p[2]];
    const f = fwd(sitter.yaw);
    const room = rayDist(this.world, chest, f, 0.8);
    s.p = [sitter.p[0] + f[0] * Math.max(0, room - 0.25), sitter.p[1] + 0.05, sitter.p[2] + f[2] * Math.max(0, room - 0.25)];
    s.tp++;
    s.st.grabImmune = CFG.grab.immunity;
    this.byId.get(sitter.id)!.s.gest = 'drop';
    this.sound('drop', s.p, { volume: 0.5 });
  }

  cage(cat: Char, seconds: number) {
    const c = this.byId.get(cat.id);
    if (!c) return;
    const holder = cat.grabbedBy ? this.byId.get(cat.grabbedBy) : null;
    if (holder) { holder.s.holding = null; cat.grabbedBy = null; this.stat(holder.s.id, 'catsJailed', 1); }
    const sp = this.level.spots.find((x) => x.id === 'carrier');
    const base = sp ? sp.pos : cat.p;
    c.cagePos = sp ? add(base, fwd(sp.facing), 0.45) : [...base];
    c.cageCut = 0;
    cat.st.caged = seconds;
    delete cat.st.limp;
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
    cat.mash = 0;
    cat.st.grabImmune = CFG.grab.immunity;
    c.cagePos = null;
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
    if (c) this.interactions.stop(c, false);
    cat.st.hypnotized = seconds;
    cat.lookAt = lookAt;
    cat.mash = 0;
    cat.loaf = false;
  }

  // ------------------------------------------------------------------ rules
  private updateRules(dt: number) {
    const T = CFG.treats;
    const sitter = this.chars.find((c) => c.s.role === 'sitter');
    for (const c of this.chars) {
      const s = c.s;
      const moved = distXZ(s.p, c.lastPos);
      c.lastPos = [...s.p];
      if (s.role !== 'cat') continue;
      if (s.sprint && moved < 1) this.stat(s.id, 'zoomDist', moved);
      if (s.loaf) this.stat(s.id, 'loafTime', dt);
      if (s.st.caged) this.stat(s.id, 'timeCaged', dt);
      // poop need
      if (s.poop < 1) {
        s.poop = Math.min(1, s.poop + dt * c.poopRate);
        if (s.poop >= 1) { this.toast('Gotta go. Litter box is in the bathroom.', s.id, 'info'); this.fx('sweat', add(s.p, [0, 0.6, 0]), { follow: s.id }); }
      } else s.desperate += dt;
      // treats
      if (s.st.treat && sitter) {
        s.lookAt = add(sitter.s.p, [0, 1.5, 0]);
        if (distXZ(s.p, sitter.s.p) < T.eatRange && !s.forced) {
          delete s.st.treat;
          s.lookAt = null;
          this.give(s, 'fed', T.fed);
          s.st.eating = T.freeze;
          this.interactions.stop(c, false);
          this.sound('crunch', s.p);
          this.fx('hearts', add(s.p, [0, 0.5, 0]));
          this.stat(s.id, 'treatsEaten', 1);
        }
      }
    }
    // fights
    for (const f of [...this.fights]) {
      const a = this.byId.get(f.a), b = this.byId.get(f.b);
      if (!a || !b) { this.fights.splice(this.fights.indexOf(f), 1); continue; }
      for (const [x, k] of [[a, 'sa'], [b, 'sb']] as const) {
        // players earn ~1 per fight from the minigame (src/minigames/fight.ts: 1/26 per mash)
        if (x.s.bot) f[k] += dt * (0.15 + this.rng() * 0.3) * FIGHT_SKILL[this.cfg.botDifficulty];
      }
      f.t -= dt;
      if (f.t > 0 && a.s.st.fight && b.s.st.fight) continue;
      this.fights.splice(this.fights.indexOf(f), 1);
      const aw = f.sa === f.sb ? this.rng() < 0.5 : f.sa > f.sb;
      const [w, l] = aw ? [a, b] : [b, a];
      for (const x of [a, b]) {
        delete x.s.st.fight;
        x.s.tp++;
        if (!x.s.bot) this.emit({ e: 'mgClose', key: f.key }, x.s.id);
      }
      if (w.s.st.fight === undefined && !w.s.grabbedBy) {
        this.give(w.s, 'crown', CFG.fight.crown);
        this.give(l.s, 'dizzy', CFG.fight.dizzy);
        this.stat(w.s.id, 'fightsWon', 1);
        this.text(`${w.s.name} wins`, add(f.p, [0, 0.8, 0]), '#ffd166');
      }
      for (let i = 0; i < 2; i++) this.addMess('fur', add(f.p, [(this.rng() - 0.5) * 0.8, 0, (this.rng() - 0.5) * 0.8]), { by: w.s.id });
      this.fx('furPoof', f.p);
    }
  }

  private end(winner: Role, forfeit?: string) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.winner = winner;
    this.forfeit = forfeit;
    this.endT = 0;
    this.interactions.stopAll();
    for (const f of this.fights) for (const id of [f.a, f.b]) this.emit({ e: 'mgClose', key: f.key }, id);
    this.fights = [];
    this.sound('carArrive');
    this.popup(winner === 'cat' && !forfeit ? 'TOTAL CHAOS' : forfeit ? 'ROUND OVER' : 'THE OWNERS ARE HOME', undefined, winner === 'cat' ? '#e05a47' : '#4caf7a');
  }

  private finish() {
    this.sound(this.winner === 'cat' ? 'lose' : 'win');
    this.results = buildResults(this.winner ?? 'sitter', this.meter, this.timeLeft,
      this.chars.map((c) => ({ id: c.s.id, name: c.s.name, role: c.s.role, bot: c.s.bot, stats: this.stats[c.s.id] })), this.forfeit);
    this.emit({ e: 'results', results: this.results });
  }

  dispose() { this.world.free(); }

  /** debug: end now */
  forceEnd(winner: Role) { this.end(winner); this.endT = CFG.round.endDelay; }

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
    const snap: Snapshot = {
      t: r3(this.hostT), phase: this.phase, countdown: r3(this.countdown), timeLeft: r3(this.timeLeft),
      meter: r3(this.meter), permanent: this.permanent,
      chars: this.chars.map((c) => ({ ...c.s, p: rv(c.s.p), v: rv(c.s.v), yaw: r3(c.s.yaw) })),
      props,
      messVer: this.messVer, mess: full || this.messVer !== this.sentMessVer ? this.messes() : undefined,
      worldVer: this.worldVer, world: full || this.worldVer !== this.sentWorldVer ? { ...this.keys } : undefined,
      alerts: [...this.alerts.values()],
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
  give(ch: Char, st: StatusKey, seconds: number) { ch.st[st] = Math.max(ch.st[st] ?? 0, 0) + seconds; }
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
  stat(id: string, key: keyof Stats, n: number) { const s = this.stats[id]; if (s) s[key] += n; }
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
  alert(id: string, on: boolean, label?: string, p?: Vec3) {
    if (!on) { this.alerts.delete(id); return; }
    const pos = p ?? this.alerts.get(id)?.p ?? [0, 0, 0];
    const room = this.roomAt(pos);
    this.alerts.set(id, { id, label: label ?? this.alerts.get(id)?.label ?? id, room, roomName: this.roomName(room), p: rv(pos) });
  }
  progress(key: string) { return this.interactions.progress.get(key) ?? 0; }
  setProgress(key: string, v: number) { this.interactions.progress.set(key, v); }
}


function makeContext(sim: Sim): SimContext {
  return {
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
    addPermanent: (pts, label, by) => sim.addPermanent(pts, label, by),
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
    alert: (id, on, l, p) => sim.alert(id, on, l, p),
    progress: (k) => sim.progress(k),
    setProgress: (k, v) => sim.setProgress(k, v),
  };
}
