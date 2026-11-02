/**
 * Client game: owns the local character's motion (zero-latency, local static world), sends transforms
 * + actions to the host, renders everything from snapshots/events, runs HUD, minigames, spot cam,
 * hitstop and the end show. The host's own player uses this exact class through a loopback link.
 */
import * as THREE from 'three';
import type { AudioApi, CatModelApi, CatTvApi, FxApi, LevelData, MinigameApi, MinigameHost, MinigameKind, RoomId, Role, SoundName, SpotId, TvShow, Vec3, WorldVisualValue } from '../shared/contracts';
import { CFG } from '../config';
import { createFx, createCatTv, openMinigame } from '../registry';
import { buildStaticWorld, lineOfSight, rayDist, type StaticWorld } from '../core/physics';
import { CharMotion } from '../core/charMotion';
import { clamp, damp, distXZ, wrapAngle } from '../core/math';
import type { Action, CharState, GameConfig, GameEvent, Results, Snapshot } from '../core/types';
import type { H2C, C2H } from '../net/protocol';
import type { ClientLink } from '../net/transport';
import type { Renderer } from './renderer';
import type { Input } from './input';
import { FpsCamera } from './camera';
import { ViewModel } from './viewmodel';
import { Views, catVisual, sitterVisual, type CharView } from './view';
import { Hud } from './hud';
import { EndShow } from './endShow';
import { spawnYaw } from '../sim/sim';

export interface ClientOpts {
  link: ClientLink;
  myId: string;
  cfg: GameConfig;
  level: LevelData;
  isHost: boolean;
  online: boolean;
  audio: AudioApi;
  renderer: Renderer;
  input: Input;
  ui: HTMLElement;
  onLeave(): void;
  onAgain(): void;
  onLobby(): void;
}

/** minigame -> the spot whose spot cam it uses */
const MG_SPOT: Partial<Record<MinigameKind, SpotId>> = {
  laptop: 'laptop', faucet: 'tubFaucet', tpSpin: 'tpRoll', fishing: 'fishTank', climb: 'curtains', knead: 'pillow', openBox: 'frontDoor', birdWatch: 'window',
};
/** spot cam per spot (ADDENDUM M23): back, up, target height above the spot, target ahead, sideways (so the cat doesn't block it) */
const SPOT_CAM: Partial<Record<SpotId, [number, number, number, number, number]>> = {
  tubFaucet: [0.9, 1.1, 0.6, 0.35, 0.25], curtains: [2.2, 1.0, 1.3, 0.15, 0.3], fishTank: [0.6, 1.35, 1.0, 0.45, 0.2],
  window: [1.2, 0.8, 0.9, 0.5, 0.3], laptop: [0.9, 0.85, 0.2, 0.35, 0.6],
};
const HOLD_PUSH = 0.25, HOLD_HAIRBALL = 0.6, HITSTOP = 0.08;

const v3 = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
/** the held cat's hull, [right, up, ahead] of its scruff (m): it is 0.3 wide, hangs 0.5 below, 0.2 toward me and away */
const HOLD_PROBES = [[0, 0.1, 0.2], [0.15, -0.25, 0], [-0.15, -0.25, 0], [0, -0.5, -0.19], [0, -0.5, 0.2], [0.15, -0.45, -0.1], [-0.15, -0.45, -0.1]] as const;
const UP: [number, number, number] = [0, 1, 0];

export class ClientGame {
  readonly views: Views;
  readonly hud: Hud;
  readonly fx: FxApi;
  readonly tv: CatTvApi;
  readonly camera: FpsCamera;
  readonly sw: StaticWorld;
  readonly motion: CharMotion;
  snap: Snapshot | null = null;
  me: CharState | null = null;
  world: Record<string, WorldVisualValue> = {};
  results: Results | null = null;
  show: EndShow | null = null;
  private offset: number | null = null;
  private mg: { key: string; kind: MinigameKind; api: MinigameApi; el: HTMLElement; mode?: string } | null = null;
  private tpSeen = 0;
  private moveAcc = 0;
  private loaf = false;
  private time = 0;
  private music = '';
  private heads = new Map<string, THREE.Vector3>();
  private localGest: { g: string | null; t: number } = { g: null, t: 0 };
  private lmb = { held: false, t: 0, push: false };
  private rKey = { held: false, t: 0, hairball: false };
  private hitstop = 0;
  private frozenRt = 0;
  private prevHolding: string | null = null;
  private prevGrabbed: string | null = null;
  private wetSeen = new Map<string, number>();
  private lastSprayAt = -9;
  private hissAt = -9;
  private myFur: string;
  private faded = new Set<string>();
  private pullAt = new THREE.Vector3();
  private eye = new THREE.Vector3();
  private vm: ViewModel;
  /** caged: the eye sits just outside the carrier door, looking out */
  private cageOut = new THREE.Vector3(0, 0, 1);
  private caged = false;
  /** carried: which way round the sitter the eye sits (offset from in front, rad), and the eased offset from her */
  private carryK = 0;
  /** (as angle round her, distance from her axis, height above her feet) */
  private carryOff: THREE.Vector3 | null = null;
  /** fight spot cam: which side of the line between the cats it looks from (rad off straight behind me) */
  private fightSide = 1;
  /** my held cat in view: its view, scale, last spot; then the short glide out of view when it leaves my hands */
  private held: { v: CharView; k: number; at: THREE.Vector3; sc: THREE.Vector3 } | null = null;
  private drop: { v: CharView; k: number; from: THREE.Vector3; sc: THREE.Vector3; yaw: number; rel: number; t: number } | null = null;
  private fadeMats = new WeakMap<THREE.Mesh, { orig: THREE.Material | THREE.Material[]; ghost: THREE.Material | THREE.Material[] }>();
  fps = 0;
  /** tests: treat the pointer as locked */
  forceLocked = false;

  constructor(readonly o: ClientOpts) {
    const r = o.renderer;
    r.scene.add(o.level.group);
    // shadows cover the whole house
    const box = new THREE.Box3();
    for (const room of o.level.rooms) box.expandByPoint(v3(room.min)).expandByPoint(v3(room.max));
    if (!box.isEmpty()) r.fitShadow(box);
    r.dusk = 0;
    this.views = new Views(r.scene, o.cfg.players);
    this.fx = createFx(r.scene);
    this.tv = createCatTv();
    o.level.setTvTexture(this.tv.texture);
    this.camera = new FpsCamera(r.camera);
    this.sw = buildStaticWorld(o.level);
    const mine = o.cfg.players.find((p) => p.id === o.myId)!;
    this.myFur = mine.look.furColor;
    const spawn = mine.role === 'sitter' ? o.level.spawns.sitter : o.level.spawns.cats[o.cfg.players.filter((p) => p.role === 'cat').indexOf(mine) % o.level.spawns.cats.length];
    this.motion = new CharMotion(this.sw.world, mine.role, spawn, spawnYaw(o.level, mine.role, spawn));
    this.camera.yaw = this.motion.yaw;
    this.vm = new ViewModel(r.camera, mine.role === 'cat', this.myFur);
    const carrier = o.level.spots.find((s) => s.id === 'carrier');
    if (carrier) this.cageOut.set(-Math.sin(carrier.facing), 0, -Math.cos(carrier.facing));
    this.hud = new Hud(o.ui, o.cfg.players, o.myId, o.online);
    this.hud.canSee = (a, b) => lineOfSight(this.sw.world, [a.x, a.y, a.z], [b.x, b.y, b.z]);
    for (const s of o.level.spots) this.hud.spotRoom.set(s.id, s.room);
    this.hud.onLeave = () => o.onLeave();
    this.hud.onResume = () => o.input.lock();
    o.audio.setMusic('game');
    r.prewarm(mine.role === 'sitter'); // shaders now, not on the first blackout
  }

  get role(): Role { return this.motion.role; }

  send(m: C2H) { this.o.link.send(m); }
  act(a: Action) { this.send({ t: 'act', act: a }); }

  handle(m: H2C) {
    if (m.t === 'snap') this.onSnap(m.s);
    else if (m.t === 'ev') for (const e of m.ev) this.onEvent(e);
  }

  private onSnap(s: Snapshot) {
    const now = performance.now() / 1000;
    const off = s.t - now;
    if (this.offset === null || Math.abs(off - this.offset) > 0.5) this.offset = off;
    else this.offset += (off - this.offset) * 0.05;
    if (s.mess) this.views.syncMess(s.mess);
    if (s.world) for (const k in s.world) this.applyWorld(k, s.world[k]);
    this.views.ingest(s.t, s.chars, s.props);
    this.snap = s;
    this.me = s.chars.find((c) => c.id === this.o.myId) ?? null;
    if (this.me) this.detectHits(s, this.me);
    if (s.phase === 'ended' && !this.show) this.startShow();
  }

  private applyWorld(k: string, v: WorldVisualValue) {
    if (this.world[k] === v) return;
    this.world[k] = v;
    const L = this.o.level;
    if (k === 'frontDoor.open' && this.show) return; // the end show drives the door
    if (k.startsWith('door.')) {
      const id = k.slice(5) as 'bathroomDoor' | 'bedroomDoor' | 'officeDoor';
      L.setDoorOpen(id, Number(v));
      this.sw.setDoor(id, Number(v) > 0.5);
    } else L.setVisual(k, v);
    if (k === 'time.dusk') this.o.renderer.dusk = clamp(Number(v) || 0, 0, 1);
    if (k === 'tv.on') this.tv.setOn(!!v);
    if (k === 'tv.show') this.tv.setShow(v as TvShow);
  }

  private onEvent(e: GameEvent) {
    const follow = (id?: string) => (id ? this.views.chars.get(id)?.root : undefined);
    switch (e.e) {
      case 'fx': {
        // my own spray: from the bottle where I see it now (the host's nozzle lags a running sitter by a few frames: she
        // ran into her own cloud). It rides along with me (follow), so walking never catches up with it either
        let p = v3(e.p);
        // (a splash on my own cat: at my eye, a tenth of a metre below it)
        const own = e.kind === 'spray' ? e.follow === this.o.myId : e.kind === 'splash' && p.distanceTo(this.o.renderer.camera.position) < 0.3;
        if (own && e.kind === 'spray') {
          const cam = this.o.renderer.camera, c = cam.position, v = _a.set(0.21, -0.14, -0.4).applyQuaternion(cam.quaternion), l = v.length();
          const k = clamp((rayDist(this.sw.world, [c.x, c.y, c.z], [v.x / l, v.y / l, v.z / l], l) - 0.05) / l, 0, 1); // (point-blank at a wall: not in it)
          p = v3([c.x + v.x * k, c.y + v.y * k, c.z + v.z * k]);
        }
        this.fx.spawn(e.kind, p, { dir: e.dir ? v3(e.dir) : undefined, color: e.color, scale: e.scale, duration: e.dur, follow: follow(e.follow), own });
        break;
      }
      case 'text': this.fx.text(e.text, v3(e.p), { color: e.color, size: e.size, follow: follow(e.follow) }); break;
      case 'sound':
        if (e.name === 'win' || e.name === 'lose') break; // the end show plays these with the board
        this.o.audio.play(e.name, { pos: e.p, pitch: e.pitch, volume: e.vol });
        break;
      case 'loop': this.o.audio.loop(e.id, e.name, e.on, { pos: e.p, volume: e.vol }); break;
      case 'toast': this.hud.toast(e.text, e.tone); break;
      case 'popup': if (!this.show) this.hud.popup(e.text, e.color); break;
      case 'mgOpen': if (!this.show) this.openMg(e.key, e.kind, e.data); break;
      case 'mgClose': {
        if (this.mg?.key !== e.key) break;
        // end beat (P3): let the panel play its finish before it goes, when the host says how it ended
        const x = e as { done?: boolean; result?: 'win' | 'lose' | 'off' };
        const fin = (this.mg.api as { finish?(r: string): void }).finish;
        if ((x.done || x.result) && fin) {
          const mg = this.mg;
          try { fin.call(mg.api, x.result ?? 'done'); } catch (err) { console.error(err); }
          this.mg = null;
          this.o.input.intercept = null;
          this.camera.spot = null;
          setTimeout(() => { try { mg.api.dispose(); } catch { /* already gone */ } mg.el.remove(); }, x.result ? 900 : 500);
        } else this.closeMg();
        break;
      }
      case 'push': if (e.id === this.o.myId) this.motion.impulse(e.v); break;
      case 'propGone': this.views.removeProp(e.id); break;
      case 'tvShow': this.tv.setShow(e.show); break;
      case 'results':
        this.results = e.results;
        if (!this.show) this.startShow();
        this.show!.setResults(e.results);
        break;
    }
  }

  private startShow() {
    this.closeMg();
    this.o.input.unlock();
    this.camera.spot = null;
    if (this.lmb.push) this.act({ a: 'push', on: false });
    this.lmb.held = this.lmb.push = false;
    // the freeze frame shows my held cat back in my hand, at its own size
    const mine = this.views.chars.get(this.o.myId);
    for (const x of [this.held, this.drop]) if (x) { x.v.root.scale.setScalar(1); x.v.root.position.copy(x.v.pos); if (mine && this.me?.holding === x.v.id) this.views.attachToHand(x.v, mine); }
    this.held = this.drop = null;
    const provisional: Role = this.results?.winner ?? ((this.snap?.meter ?? 0) >= 100 ? 'cat' : 'sitter');
    this.show = new EndShow({
      level: this.o.level, world: this.sw.world, views: this.views, camera: this.camera, renderer: this.o.renderer, audio: this.o.audio,
      root: this.hud.root, myId: this.o.myId, myRole: this.role, isHost: this.o.isHost, online: this.o.online, eye: this.eye.clone(),
      onAgain: () => this.o.onAgain(), onLobby: () => this.o.onLobby(),
    }, provisional);
  }

  // ---------------------------------------------------------------- minigames
  private openMg(key: string, kind: MinigameKind, data?: Record<string, unknown>) {
    this.closeMg();
    const box = document.createElement('div');
    box.className = 'mg-container';
    this.hud.mgRoot.appendChild(box);
    const strip = kind === 'escape';
    let sum = 0;
    const host: MinigameHost = {
      container: box,
      progress: (d) => {
        if (d <= 0) return;
        sum += d;
        if (!strip) { this.act({ a: 'mg', key, delta: d }); return; }
        // escape strip: wiggle units (M23). The hiss goes through {a:'hiss'} instead (+4 once per grab, host side).
        if (this.time - this.hissAt < 0.05 && d > 3 / 20) return;
        this.act({ a: 'mash', n: d * 20 });
      },
      getProgress: () => (kind === 'fight' ? Math.min(1, sum / 1.5) : strip ? this.me?.mash ?? 0 : this.me?.work?.key === key ? this.me.work.progress : 0),
      exit: () => { if (!strip) { this.act({ a: 'mgExit', key }); this.closeMg(); } },
      sound: ((n: SoundName, o?: { pitch?: number; volume?: number }) => this.o.audio.play(n, o)) as MinigameHost['sound'],
      danger: () => this.danger(),
      data: strip ? { fur: this.myFur, limp: CFG.grab.limp, ...data } : { fur: this.myFur, ...data },
    };
    let api: MinigameApi;
    try { api = openMinigame(kind, host); } catch (err) {
      console.error('[client] minigame failed', kind, err);
      box.remove();
      if (!strip) this.act({ a: 'mgExit', key });
      return;
    }
    this.mg = { key, kind, api, el: box, mode: data?.mode as string | undefined };
    if (!strip) this.o.input.unlock();
    this.o.input.intercept = (ev, down) => {
      if (strip && down && !ev.repeat && ev.code === 'KeyR') { this.hissAt = this.time; this.act({ a: 'hiss' }); }
      return api.key(ev, down);
    };
    const mouse = (ev: MouseEvent) => api.mouse?.(ev);
    for (const t of ['mousedown', 'mouseup', 'mousemove', 'click', 'wheel'] as const) box.addEventListener(t, mouse as EventListener);
    // spot cam
    const spotId = strip || kind === 'fight' ? undefined : MG_SPOT[kind];
    const spot = spotId ? this.o.level.spots.find((s) => s.id === spotId) : undefined;
    if (spot) {
      const [back, up, ty, ahead, side] = SPOT_CAM[spot.id] ?? [1.25, 0.95, 0.35, 0.35, 0.3];
      const f = new THREE.Vector3(Math.sin(spot.facing), 0, Math.cos(spot.facing));
      const r = new THREE.Vector3(-f.z, 0, f.x);
      const lowSpot = spot.pos[1] < 0.3;
      // laptop and tank targets sit on furniture: lift them when the spot is on the floor
      const tyy = spot.id === 'laptop' && lowSpot ? 0.95 : spot.id === 'fishTank' && !lowSpot ? 0.35 : ty;
      this.camera.spot = {
        pos: v3(spot.pos).addScaledVector(f, -back).addScaledVector(r, side).setY(spot.pos[1] + up),
        target: v3(spot.pos).addScaledVector(f, ahead).setY(spot.pos[1] + tyy),
      };
    }
  }

  closeMg() {
    if (!this.mg) return;
    try { this.mg.api.dispose(); } catch (e) { console.error(e); }
    this.mg.el.remove();
    this.mg = null;
    this.o.input.intercept = null;
    this.camera.spot = null;
  }

  /** M23: 0 = no sitter threat, 1 = sitter close */
  private danger(): number {
    const snap = this.snap, me = this.me;
    if (!snap || !me) return 0;
    const s = snap.chars.find((c) => c.role === 'sitter');
    if (!s || s.st.stunned || s.st.slip || (s.holding && s.holding !== me.id)) return 0;
    const p = this.motion.pos;
    const d = Math.hypot(p[0] - s.p[0], p[1] - s.p[1], p[2] - s.p[2]);
    return clamp((8 - d) / 5.5, 0, 1);
  }

  /** escape strip while grabbed / caged / hypnotized, opened client-side */
  private syncStrip(me: CharState, playing: boolean) {
    const mode = !playing ? null : me.grabbedBy ? 'grab' : me.st.caged ? 'cage' : me.st.hypnotized ? 'tv' : null;
    const open = this.mg?.kind === 'escape';
    if (mode && (!this.mg || (open && this.mg.mode !== mode))) this.openMg('escape', 'escape', { mode });
    else if (!mode && open) this.closeMg();
  }

  // ---------------------------------------------------------------- hitstop (M23)
  private detectHits(s: Snapshot, me: CharState) {
    let hit = false;
    if (me.holding && !this.prevHolding) hit = true;
    if (me.grabbedBy && !this.prevGrabbed) hit = true;
    this.prevHolding = me.holding;
    this.prevGrabbed = me.grabbedBy;
    for (const c of s.chars) {
      if (c.role !== 'cat') continue;
      const w = c.st.wet ?? 0, prev = this.wetSeen.get(c.id) ?? 0;
      if (w > prev + 0.5 && (c.id === me.id || (this.role === 'sitter' && this.time - this.lastSprayAt < 0.8))) hit = true;
      this.wetSeen.set(c.id, w);
    }
    if (hit && s.phase === 'playing') { this.hitstop = HITSTOP; this.camera.kick = -2; }
  }

  /** render time on the host clock */
  private renderT() {
    return (this.offset ?? 0) + performance.now() / 1000 - CFG.interpDelay;
  }

  private roomAt(p: Vec3): RoomId | null {
    for (const r of this.o.level.rooms) if (p[0] >= r.min[0] && p[0] <= r.max[0] && p[2] >= r.min[2] && p[2] <= r.max[2]) return r.id;
    return null;
  }

  frame(dt: number) {
    const inp = this.o.input;
    inp.beginFrame();
    this.time += dt;
    this.fps += ((dt > 0 ? 1 / dt : 60) - this.fps) * 0.05;
    const snap = this.snap, me = this.me;
    if (!snap || !me) { inp.endFrame(); return; }
    const locked = inp.locked || this.forceLocked;
    const playing = snap.phase === 'playing';
    const strip = this.mg?.kind === 'escape';
    const control = playing && (!this.mg || strip) && !this.show;
    const role = this.role;
    this.syncStrip(me, playing && !this.show);

    if (inp.locked) this.camera.look(inp.mouseDX, inp.mouseDY);
    if (inp.pressed.has('Mouse0') && !inp.locked && (!this.mg || strip) && !this.show) inp.lock();

    // ---------------------------------------------------------------- controls
    let mx = 0, mz = 0;
    if (control) {
      const f = (inp.down.has('KeyW') ? 1 : 0) - (inp.down.has('KeyS') ? 1 : 0);
      const r = (inp.down.has('KeyD') ? 1 : 0) - (inp.down.has('KeyA') ? 1 : 0);
      const y = this.camera.yaw;
      mx = f * Math.sin(y) - r * Math.cos(y);
      mz = f * Math.cos(y) + r * Math.sin(y);
      const l = Math.hypot(mx, mz);
      if (l > 1) { mx /= l; mz /= l; }
    }
    const moving = mx * mx + mz * mz > 0.01;
    if (me.forced) {
      // fallback when the escape strip could not open
      if (!this.mg) {
        for (const k of ['Space', 'KeyE', 'KeyW', 'KeyA', 'KeyS', 'KeyD']) if (inp.pressed.has(k)) this.act({ a: 'mash' });
        if (inp.pressed.has('KeyR') && role === 'cat') this.act({ a: 'hiss' });
      }
      this.releaseHolds();
    } else if (control) {
      if (role === 'cat') this.catButtons(inp, locked, dt, me);
      else this.sitterButtons(inp, locked, me);
      if (inp.pressed.has('KeyE') && me.prompt?.ok) this.act({ a: 'interact', on: true, key: me.prompt.key });
      if (inp.pressed.has('KeyQ')) this.act(role === 'cat' ? { a: 'meow' } : { a: 'treats' });
      if (role === 'cat' && inp.pressed.has('KeyF') && this.motion.grounded) this.loaf = !this.loaf;
    } else this.releaseHolds();
    if (inp.released.has('KeyE')) this.act({ a: 'interact', on: false });
    if (moving || inp.down.has('Space') || me.frozen || me.forced || me.st.noLoaf) this.loaf = false;

    // ---------------------------------------------------------------- local motion
    if (me.tp !== this.tpSeen) {
      this.tpSeen = me.tp;
      // ?autobot resyncs the bot-driven player every snapshot: only a real jump cuts the camera there
      const far = !this.o.cfg.autobot?.includes(this.o.myId) || Math.hypot(me.p[0] - this.motion.pos[0], me.p[1] - this.motion.pos[1], me.p[2] - this.motion.pos[2]) > 0.5;
      this.motion.teleport(me.p, me.yaw);
      if (far) this.camera.snap();
    }
    if (me.forced) this.motion.teleport(me.p, me.yaw);
    else {
      // FPS: you face where you look (WASD strafes), except standing still in a hold interaction (remote players see
      // you face the thing) and the hairball creep (it steers on its own)
      const work = !moving && me.work?.yaw !== undefined;
      if (control && !work && !me.st.hairball) this.motion.yaw = this.camera.yaw;
      const faceYaw = work ? me.work!.yaw! : control ? this.motion.yaw : null;
      this.motion.step(Math.min(dt, 1 / 30), { moveX: mx, moveZ: mz, faceYaw, sprint: control && (inp.down.has('ShiftLeft') || inp.down.has('ShiftRight')), jumpHeld: control && inp.down.has('Space') },
        { s: me, mul: me.mul, frozen: me.frozen || !control, inSun: this.o.level.sunPatches.some((s) => distXZ(this.motion.pos, s.center) < s.radius && Math.abs(this.motion.pos[1] - s.center[1]) < 0.6) });
      this.sw.world.step();
    }
    this.moveAcc += dt;
    if (this.moveAcc >= 1 / CFG.moveHz && !this.show) this.sendMove();

    // ---------------------------------------------------------------- views
    if (this.hitstop > 0) this.hitstop -= dt;
    const adt = this.hitstop > 0 ? 0 : dt;
    const rt = this.hitstop > 0 ? this.frozenRt : (this.frozenRt = this.renderT());
    const dark = this.world.lights === false;
    if (!this.show) this.updateChars(snap, adt, rt, dark);
    for (const v of this.views.chars.values()) {
      let h = this.heads.get(v.id);
      if (!h) { h = new THREE.Vector3(); this.heads.set(v.id, h); }
      this.views.headOf(v, h);
    }
    this.views.updateProps(rt);
    if (this.localGest.t > 0) this.localGest.t -= dt;

    // ---------------------------------------------------------------- world, camera, light
    const R = this.o.renderer;
    this.o.level.update(dt, this.time);
    this.tv.update(dt);
    this.show?.update(dt);
    const myView = this.views.chars.get(this.o.myId)!;
    this.camera.wobble = damp(this.camera.wobble, me.st.catnip ? 1 : 0, 3, dt);
    // hypnotized: turn toward the TV. Carried: face the sitter holding you. Caged: start looking out of the carrier
    const holder = me.grabbedBy ? this.views.chars.get(me.grabbedBy) : undefined;
    this.camera.pull = me.st.hypnotized && me.lookAt ? v3(me.lookAt) : holder ? this.pullAt.copy(holder.pos).setY(holder.pos.y + CFG.camera.sitter.eye) : null;
    if (me.st.caged && !this.caged) { this.camera.yaw = Math.atan2(this.cageOut.x, this.cageOut.z); this.camera.pitch = 0.1; }
    this.caged = !!me.st.caged;
    this.fightCam(me, snap, myView);
    // the eye: on the capsule axis
    const eye = this.eye.copy(myView.pos);
    if (!holder) this.carryOff = null;
    if (holder && myView.cat) this.carriedEye(holder, myView.cat, eye, dt);
    else if (me.st.caged) { eye.addScaledVector(this.cageOut, 0.29); eye.y += CFG.camera.cat.caged; } // just outside the carrier door
    else eye.y += role === 'cat' ? CFG.camera.cat.eye : CFG.camera.sitter.eye;
    const mv = this.motion, forced = !!me.forced;
    this.camera.update(dt, eye, {
      role, speed: forced ? 0 : Math.hypot(mv.vel[0], mv.vel[2]), grounded: forced || (mv.grounded && mv.vel[1] < 0.5), landed: forced ? 0 : mv.landed, sprint: mv.sprinting,
      charge: role === 'cat' && !forced ? mv.charge : 0, low: this.loaf,
    }, this.sw.world);
    // first person: my own model only shows in the end show and fades in as the spot cam pulls away from the eye. At the
    // eye it is nothing but its shadow (fully faded: no colour, no depth, the shadow pass still draws it)
    const away = this.show ? 9 : R.camera.position.distanceTo(eye);
    this.fadeView(myView, clamp((away - 0.3) / 0.8, 0, 1));
    if (role === 'sitter' && me.holding && !this.show) this.holdInView(me.holding, dt);
    else if (this.held) { const h = this.held; this.held = null; this.drop?.v.root.scale.setScalar(1); this.drop = { v: h.v, k: h.k, from: h.at, sc: h.sc, yaw: this.camera.yaw + Math.PI, rel: snap.t, t: -1 }; }
    // (shut in the carrier: a cut once it leaves my hand. The cage loaf gliding down from where the big cat hung reads as a pop)
    const drop = this.drop;
    if (drop && rt >= drop.rel && snap.chars.find((c) => c.id === drop.v.id)?.st.caged) { drop.v.root.scale.setScalar(1); this.drop = null; }
    if (this.drop && !this.show) {
      // let go (tossed, put down): it stays where it hung in view, facing me, until the interpolated track reaches the
      // release (before that it is still in her hand there), then leaves from there along its real path: the offset and
      // the turn ease out, it grows back to size
      const d = this.drop, hold = rt < d.rel;
      if (!hold && d.t < 0) {
        // (from now on: the offset from its real path. Out of the hang its body is no longer pinned under the scruff and
        // springs up round its root: offset so the scruff starts where it hung, the body never jumps at the camera)
        const real = _b.copy(d.v.root.position), ry = d.v.root.rotation.y, cp = R.camera.position;
        d.v.root.position.copy(d.from).add(cp);
        d.v.root.rotation.y = d.yaw;
        d.v.root.updateMatrixWorld(true);
        d.from.add(cp).add(d.sc).add(cp).sub(d.v.cat!.scruffAnchor.getWorldPosition(_c)).sub(real); // (now in world space)
        d.v.root.position.copy(real);
        d.v.root.rotation.y = ry;
        d.t = 0;
      }
      const u = Math.min(1, d.t / 0.3), a = hold ? 1 : 1 - u * u * (3 - 2 * u);
      if (!hold) d.t += dt;
      if (hold) d.v.root.position.copy(d.from).add(R.camera.position); else d.v.root.position.addScaledVector(d.from, a);
      d.v.root.rotation.y += wrapAngle(d.yaw - d.v.root.rotation.y) * a;
      // (grown back only as far as it is from the eye: by a wall the toss comes straight back at it, and it stays shrunk
      // while it passes my face, a little past the glide, then grows back over half a second wherever it came to rest)
      const shrink = 1 - Math.max(d.k, d.v.root.position.distanceTo(R.camera.position));
      const sc = Math.min(1 + (d.k - 1) * a, 1 - shrink * (1 - clamp((d.t - 1.5) / 0.5, 0, 1)));
      d.v.root.scale.setScalar(sc);
      if (a === 0 && sc === 1) this.drop = null;
    }
    this.vm.carry(role === 'cat' && (me.item === 'salmon' || me.item === 'toyMouse' || me.item === 'sock') ? me.item : null);
    this.vm.update(dt, playing && !this.show && !this.mg && this.camera.spotT === 0 && !me.holding && !me.grabbedBy && !me.st.caged, this.camera, this.lmb.push);
    // anyone else the camera ends up inside (the cat's eye between the sitter's legs): see-through, not a wall of jeans
    const cp = R.camera.position, F = R.camera.getWorldDirection(_c), T = Math.tan(THREE.MathUtils.degToRad(R.camera.fov / 2));
    for (const v of this.views.chars.values()) {
      if (v === myView) continue;
      const cat = v.info.role === 'cat', r = cat ? 0.22 : 0.34, lo = v.pos.y + r, hi = v.pos.y + (cat ? 0.45 : 1.75) - r;
      const d = Math.hypot(cp.x - v.pos.x, cp.y - clamp(cp.y, lo, hi), cp.z - v.pos.z) - r;
      let a = clamp(d / 0.1, 0.12, 1);
      if (cat && role === 'sitter') {
        // a cat on a perch in her face (the cat tree top): see-through by how far it covers the crosshair, its half size
        // less its centre's distance from the view axis in half screen heights (a cat beside her covers none of it).
        // Only once it all but fills the view (centred, under ~0.5 m): a cat on a counter at grab range stays solid. Gone,
        // not a ghost filling the view, once all but at the eye (tossed into the door right in front of her, it bounces
        // back through her face). All as drawn: the one just let go of is still shrunk toward the eye
        const sc = v.root.scale.x, q = _b.copy(v.root.position).setY(v.root.position.y + 0.22 * sc).sub(cp), z = q.dot(F);
        const cover = z > 0.05 ? (0.3 * sc - Math.sqrt(Math.max(0, q.lengthSq() - z * z))) / (z * T) : 0;
        a = Math.min(clamp((q.length() / sc - 0.3) / 0.2, 0, 1), clamp(1 - (cover - 0.85) / 0.35, 0.25, 1));
      }
      this.fadeView(v, this.show || v.id === me.holding ? 1 : a);
    }
    R.setLook(dt, !dark || !!this.show, role, !!me.st.catnip && !this.show); // the owners switch the lights on for the end show, the trip ends
    if (role === 'sitter' && R.flashlight.visible) {
      // phone in the right hand: a little right of and below the eye, pointing where the crosshair is
      const y = this.camera.yaw;
      R.flashlight.position.copy(R.camera.position).add(_b.set(-Math.cos(y) * 0.2, -0.25, Math.sin(y) * 0.2));
      // (aimed at what the crosshair is on, at any distance: the fuse box right in front of you too)
      const c = R.camera.position, F = this.camera.forward;
      R.flashlight.target.position.copy(c).addScaledVector(F, Math.max(0.4, rayDist(this.sw.world, [c.x, c.y, c.z], [F.x, F.y, F.z], 8)));
      R.flashlight.target.updateMatrixWorld();
    }
    this.fx.update(dt, R.camera);
    this.o.audio.setListener([R.camera.position.x, R.camera.position.y, R.camera.position.z], this.camera.yaw);
    if (!this.show) {
      const ot = (snap.overtime ?? 0) > 0;
      const music = !playing ? 'game' : me.st.catnip ? 'catnip' : ot || snap.meter > 75 || snap.timeLeft < 60 ? 'tense' : 'game';
      if (music !== this.music) { this.music = music; this.o.audio.setMusic(music); }
    }

    // ---------------------------------------------------------------- hud + minigame
    this.hud.world = this.world;
    if (!this.show) {
      this.hud.update(snap, { ...me, stamina: this.motion.stamina / (role === 'cat' ? CFG.cat.stamina : CFG.sitter.stamina) }, R.camera, this.camera.yaw, {
        locked, mgOpen: !!this.mg && !strip, stripOpen: strip, tab: inp.down.has('Tab'), ended: !!this.results, dark, heads: this.heads,
        room: this.roomAt(this.motion.pos),
      });
    }
    this.mg?.api.update(dt);
    inp.endFrame();
  }

  private updateChars(snap: Snapshot, dt: number, rt: number, dark: boolean) {
    let held: [CharView, CharView] | null = null;
    for (const s of snap.chars) {
      const v = this.views.chars.get(s.id);
      if (!v) continue;
      const mine = s.id === this.o.myId;
      if (mine && !s.forced) {
        _a.set(this.motion.pos[0], this.motion.pos[1], this.motion.pos[2]);
        this.views.place(v, dt, _a, this.motion.yaw, this.motion.vel);
      } else {
        const r = v.track.sample(rt, _a, true);
        this.views.place(v, dt, _a, r[0], null);
      }
      // (my cat just let go of: until the interpolated track reaches the release it is still pinned in my hand in view,
      // so it keeps hanging there; the toss pose and its somersault start when it leaves)
      const pinned = !s.grabbedBy && (this.held?.v === v || (this.drop?.v === v && rt < this.drop.rel));
      const vis: CharState = mine
        ? { ...s, loaf: this.loaf, charge: this.motion.charge, gest: (this.localGest.t > 0 ? this.localGest.g : s.gest) as CharState['gest'], st: this.lmb.push ? { ...s.st, pushMode: 1 } : s.st }
        : pinned ? { ...s, grabbedBy: this.o.myId, st: { ...s.st, tossed: 0 } } : s;
      const grounded = mine ? this.motion.grounded : s.g;
      if (v.cat) {
        const cv = catVisual(vis, v.speed, v.vy, grounded);
        // free height over the cat (under the bed, a table): over its middle and its head, so a hat never pokes the edge first
        const p = v.pos, fx = Math.sin(v.yaw) * 0.18, fz = Math.cos(v.yaw) * 0.18;
        const up = Math.min(rayDist(this.sw.world, [p.x, p.y + 0.05, p.z], UP, 1), rayDist(this.sw.world, [p.x + fx, p.y + 0.05, p.z + fz], UP, 1));
        if (up < 0.95) cv.ceiling = up + 0.05;
        v.cat.update(dt, cv);
      }
      if (v.sitter) {
        const heldCat = s.holding ? snap.chars.find((c) => c.id === s.holding) : undefined;
        v.sitter.update(dt, sitterVisual(vis, v.speed, v.vy, grounded, { meter: snap.meter, ended: null, dark, aimPitch: mine ? this.camera.pitch : 0, heldNoodle: !!heldCat?.st.noodle }));
      }
      if (s.grabbedBy) { const h = this.views.chars.get(s.grabbedBy); if (h) held = [v, h]; }
    }
    // (my own held cat goes in front of the camera instead: holdInView, after the camera moved)
    if (held && held[1].id !== this.o.myId) this.views.attachToHand(held[0], held[1]);
  }

  /**
   * the local sitter's held cat: the hand anchor is below a first-person view, so the cat dangles in front of the
   * camera instead (lower right, facing me, following the look). With no room (a wall, a counter) the whole cat shrinks
   * toward the eye: the same picture at a smaller scale, so it never pokes into anything or fills the view.
   */
  private holdInView(id: string, dt: number) {
    const v = this.views.chars.get(id);
    if (!v?.cat) return;
    const cp = this.o.renderer.camera.position, y = this.camera.yaw, p = this.camera.pitch * 0.8, rx = -Math.cos(y), rz = Math.sin(y);
    // (the scruff a little above eye level: the face and front paws hang into the lower right of the view)
    const to = _a.set(Math.sin(y) * Math.cos(p) * 0.7 + rx * 0.24, -Math.sin(p) * 0.7 + 0.06, Math.cos(y) * Math.cos(p) * 0.7 + rz * 0.24);
    // a ray to each point of its hull
    let k = 1;
    for (const [s, up, ahead] of HOLD_PROBES) {
      const l = _c.set(to.x + rx * s + rz * ahead, to.y + up, to.z + rz * s - rx * ahead).length();
      _c.divideScalar(l);
      k = Math.min(k, rayDist(this.sw.world, [cp.x, cp.y, cp.z], [_c.x, _c.y, _c.z], l + 0.1) / (l + 0.1));
    }
    const h = (this.held ??= { v, k, at: new THREE.Vector3(), sc: new THREE.Vector3() });
    if (h.v !== v) { h.v.root.scale.setScalar(1); h.v = v; }
    h.k = Math.max(0.15, Math.min(k, damp(h.k, k, 6, dt)));
    v.root.scale.setScalar(h.k);
    v.root.rotation.y = y + Math.PI;
    v.root.position.set(0, 0, 0);
    v.root.updateMatrixWorld(true);
    v.cat.scruffAnchor.getWorldPosition(_b);
    h.sc.copy(to).multiplyScalar(h.k); // (at, sc: from the eye, so a let go of cat keeps hanging in view while I run on)
    v.root.position.copy(h.sc).add(cp).sub(_b);
    v.pos.copy(v.root.position);
    h.at.copy(v.root.position).sub(cp);
  }

  /**
   * carried: the eye in front of the sitter, a little left of the arm that holds me (her face reads past it), swaying
   * with her hand. A wall in the way moves it round her, never into her.
   */
  private carriedEye(h: CharView, cat: CatModelApi, eye: THREE.Vector3, dt: number) {
    cat.mouthAnchor.getWorldPosition(eye);
    eye.y += 0.3; // (about her hand: she holds you up like evidence)
    const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw), dx = eye.x - h.pos.x, dz = eye.z - h.pos.z;
    const lf = Math.max(0, dx * fx + dz * fz) + 0.6, lr = (dz * fx - dx * fz) * 0.2; // her forward / right, pulled to her middle
    let R = Math.hypot(lf, lr), best = -1, bestK = 0;
    const a0 = h.yaw - Math.atan2(lr, lf), o: Vec3 = [h.pos.x, eye.y, h.pos.z];
    // (round her back only when nothing in front has room, the corner she grabbed you in: never sticky, so the eye
    // comes back in front as soon as she turns to the room)
    for (const k of [Math.abs(this.carryK) < 2 ? this.carryK : 0, 0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
      const free = rayDist(this.sw.world, o, [Math.sin(a0 + k), 0, Math.cos(a0 + k)], R + 0.15);
      if (free > best) { best = free; bestK = k; }
      if (free >= R + 0.12) break;
    }
    this.carryK = bestK;
    R = Math.max(0.45, Math.min(R, best - 0.12));
    // eased relative to her and round her, never through her (a corner sends it round her back): the hand's sway and
    // her turns soften, her walking never drags the eye into her
    if (!this.carryOff) { const p = _c.copy(this.o.renderer.camera.position).sub(h.pos); this.carryOff = new THREE.Vector3(Math.atan2(p.x, p.z), Math.hypot(p.x, p.z), p.y); } // (from where the eye was when she picked me up)
    const O = this.carryOff, k = 1 - Math.exp(-10 * dt);
    O.x += wrapAngle(a0 + bestK - O.x) * k;
    O.y += (R - O.y) * k;
    O.z += (eye.y - h.pos.y - O.z) * k;
    // (on the way round, short of a wall: squeezed in between, still outside her)
    const ux = Math.sin(O.x), uz = Math.cos(O.x), r = Math.max(0.3, Math.min(O.y, rayDist(this.sw.world, [h.pos.x, h.pos.y + O.z, h.pos.z], [ux, 0, uz], O.y + 0.1) - 0.1));
    eye.set(h.pos.x + ux * r, h.pos.y + O.z, h.pos.z + uz * r);
  }

  /** a cat fight: face the other cat, then watch the brawl from behind me and off to the side with more room (the spot
   *  cam, framed over the docked panel), so my own cat never hides the other one */
  private fightCam(me: CharState, snap: Snapshot, myView: CharView) {
    if (this.mg?.kind !== 'fight' || !me.st.fight) return;
    const foe = snap.chars.find((c) => c.id !== me.id && c.st.fight && distXZ(c.p, me.p) < 1.5);
    const b = foe && this.views.chars.get(foe.id)?.pos, a = myView.pos;
    if (!b) return;
    const S0 = this.camera.spot ? null : (this.camera.spot = { pos: new THREE.Vector3(), target: new THREE.Vector3() });
    const S = this.camera.spot!;
    S.target.addVectors(a, b).multiplyScalar(0.5).y += 0.45; // (aimed over them: the panel frames the top half)
    if (S0) {
      this.camera.yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const room = (k: number) => rayDist(this.sw.world, [S.target.x, S.target.y, S.target.z], [-Math.sin(this.camera.yaw + k), 0, -Math.cos(this.camera.yaw + k)], 1.6);
      this.fightSide = room(1.2) >= room(-1.2) ? 1.2 : -1.2;
    }
    const y = this.camera.yaw + this.fightSide;
    S.pos.set(S.target.x - Math.sin(y) * 1.6, S.target.y + 0.45, S.target.z - Math.cos(y) * 1.6);
  }

  // ---------------------------------------------------------------- verbs
  private catButtons(inp: Input, locked: boolean, dt: number, me: CharState) {
    // LMB: tap = swipe on release, hold >= 0.25 s = slow push mode (M8)
    // (the host ignores both while frozen or coughing: stunned, dizzy, eating, flying after a toss. No paw then either)
    const free = !me.frozen && !me.st.hairball;
    if (inp.pressed.has('Mouse0') && locked) this.lmb = { held: true, t: 0, push: false };
    if (this.lmb.held) {
      if (inp.down.has('Mouse0')) {
        this.lmb.t += dt;
        if (!this.lmb.push && free && this.lmb.t >= HOLD_PUSH) { this.lmb.push = true; this.act({ a: 'push', on: true }); this.loaf = false; }
      } else {
        this.lmb.held = false;
        if (this.lmb.push) { this.lmb.push = false; this.act({ a: 'push', on: false }); }
        // (not in its cooldown, the host ignores it: no paw either. The local gesture covers the snapshot's lag)
        else if (free && !((me.cd.swipe ?? 0) > 0) && !(this.localGest.g === 'swipe' && this.localGest.t > 0)) {
          // swipe where the camera looks: snap the body around first so the host sees the new facing
          this.motion.yaw = this.camera.yaw;
          this.sendMove();
          this.act({ a: 'swipe' });
          this.gest('swipe', 0.35);
          this.vm.kick();
          this.loaf = false;
        }
      }
    }
    // R: tap = hiss on release, hold 0.6 s = hairball (M9)
    if (inp.pressed.has('KeyR')) this.rKey = { held: true, t: 0, hairball: false };
    if (this.rKey.held) {
      if (inp.down.has('KeyR')) {
        this.rKey.t += dt;
        if (!this.rKey.hairball && this.rKey.t >= HOLD_HAIRBALL) { this.rKey.hairball = true; this.act({ a: 'hairball' }); this.loaf = false; }
      } else {
        this.rKey.held = false;
        if (!this.rKey.hairball) { this.act({ a: 'hiss' }); this.gest('hiss', 0.5); this.loaf = false; }
      }
    }
  }

  private sitterButtons(inp: Input, locked: boolean, me: CharState) {
    if (inp.pressed.has('Mouse0') && locked) {
      const F = this.camera.forward;
      if (me.holding) { this.act({ a: 'toss', dir: [F.x, F.y, F.z] }); this.gest('toss', 0.4); }
      // (the host ignores a spray in its cooldown: no recoil then either)
      else if (this.time - this.lastSprayAt >= CFG.spray.cooldown + 0.01) { this.act({ a: 'spray', dir: [F.x, F.y, F.z] }); this.lastSprayAt = this.time; this.vm.kick(); }
    }
    if (inp.pressed.has('KeyR') && !((me.cd.clap ?? 0) > 0)) { this.act({ a: 'clap' }); this.gest('clap', 0.5); }
  }

  /** control lost mid-hold: end push mode, forget half-held keys */
  private releaseHolds() {
    if (this.lmb.push) this.act({ a: 'push', on: false });
    this.lmb.held = this.lmb.push = false;
    this.rKey.held = false;
  }

  private gest(g: string, t: number) { this.localGest = { g, t }; }

  /** a character the camera is squeezed against or inside: see-through instead of gone (hiding it is the last resort) */
  private fadeView(v: CharView, a: number) {
    const on = a < 0.99;
    if (!on && !this.faded.has(v.id)) return;
    if (on) this.faded.add(v.id); else this.faded.delete(v.id);
    v.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      let f = this.fadeMats.get(m);
      if (!on) { if (f && m.material === f.ghost) m.material = f.orig; return; }
      if (!f || (m.material !== f.ghost && m.material !== f.orig)) {
        // per-mesh clones: materials are shared between characters and props (toon cache, outlines)
        const ghost = (src: THREE.Material) => {
          const g = src.clone();
          g.transparent = true;
          g.userData.opacity = src.opacity;
          g.userData.depthWrite = src.depthWrite;
          if (g.side === THREE.BackSide) g.visible = false; // outline shells read as a dark blob through the body
          else g.side = THREE.FrontSide; // (double-sided KayKit parts: the inside of the face shows through the back of the head)
          return g;
        };
        f = { orig: m.material, ghost: Array.isArray(m.material) ? m.material.map(ghost) : ghost(m.material) };
        this.fadeMats.set(m, f);
      }
      m.material = f.ghost;
      for (const g of Array.isArray(f.ghost) ? f.ghost : [f.ghost]) {
        g.opacity = a * (g.userData.opacity as number);
        g.colorWrite = a > 0;
        g.depthWrite = a > 0 && (g.userData.depthWrite as boolean);
      }
    });
  }

  private sendMove() {
    this.moveAcc = 0;
    const m = this.motion, F = this.camera.forward;
    const maxSt = this.role === 'cat' ? CFG.cat.stamina : CFG.sitter.stamina;
    this.send({ t: 'move', m: {
      p: [m.pos[0], m.pos[1], m.pos[2]], yaw: m.yaw, v: [m.vel[0], m.vel[1], m.vel[2]], g: m.grounded, tp: this.tpSeen,
      sprint: m.sprinting, charge: m.charge, loaf: this.loaf, look: [F.x, F.y, F.z], stamina: m.stamina / maxSt,
    } });
  }

  private disposed = false;
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.closeMg();
    this.show?.dispose();
    this.vm.dispose();
    this.views.dispose();
    this.fx.dispose();
    this.hud.dispose();
    this.o.level.group.removeFromParent();
    this.o.level.setTvTexture(null);
    this.sw.world.free();
    this.o.renderer.setFilter('');
    this.o.renderer.flashlight.visible = false;
    this.o.renderer.dusk = 0;
  }
}
