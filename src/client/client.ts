/**
 * Client game: owns the local character's motion (zero-latency, local static world), sends transforms
 * + actions to the host, renders everything from snapshots/events, runs HUD, minigames, spot cam,
 * hitstop and the end show. The host's own player uses this exact class through a loopback link.
 */
import * as THREE from 'three';
import type { AudioApi, CatTvApi, FxApi, LevelData, MinigameApi, MinigameHost, MinigameKind, RoomId, Role, SoundName, SpotId, TvShow, Vec3, WorldVisualValue } from '../shared/contracts';
import { CFG } from '../config';
import { createFx, createCatTv, openMinigame } from '../registry';
import { buildStaticWorld, type StaticWorld } from '../core/physics';
import { CharMotion } from '../core/charMotion';
import { clamp, distXZ } from '../core/math';
import type { Action, CharState, GameConfig, GameEvent, Results, Snapshot } from '../core/types';
import type { H2C, C2H } from '../net/protocol';
import type { ClientLink } from '../net/transport';
import type { Renderer } from './renderer';
import type { Input } from './input';
import { TpsCamera } from './camera';
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
  tubFaucet: [0.9, 1.1, 0.6, 0.35, 0.25], curtains: [2.2, 1.0, 1.3, 0.35, 0.3], fishTank: [0.6, 1.35, 1.0, 0.45, 0.2],
  window: [1.2, 0.8, 0.9, 0.5, 0.3], laptop: [0.9, 0.85, 0.2, 0.35, 0.6],
};
const HOLD_PUSH = 0.25, HOLD_HAIRBALL = 0.6, HITSTOP = 0.08;

const v3 = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);
const _a = new THREE.Vector3();

export class ClientGame {
  readonly views: Views;
  readonly hud: Hud;
  readonly fx: FxApi;
  readonly tv: CatTvApi;
  readonly camera: TpsCamera;
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
    this.camera = new TpsCamera(r.camera);
    this.sw = buildStaticWorld(o.level);
    const mine = o.cfg.players.find((p) => p.id === o.myId)!;
    this.myFur = mine.look.furColor;
    const spawn = mine.role === 'sitter' ? o.level.spawns.sitter : o.level.spawns.cats[o.cfg.players.filter((p) => p.role === 'cat').indexOf(mine) % o.level.spawns.cats.length];
    this.motion = new CharMotion(this.sw.world, mine.role, spawn, spawnYaw(o.level, mine.role, spawn));
    this.camera.yaw = this.motion.yaw;
    this.hud = new Hud(o.ui, o.cfg.players, o.myId);
    for (const s of o.level.spots) this.hud.spotRoom.set(s.id, s.room);
    this.hud.onLeave = () => o.onLeave();
    this.hud.onResume = () => o.input.lock();
    o.audio.setMusic('game');
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
      case 'fx': this.fx.spawn(e.kind, v3(e.p), { dir: e.dir ? v3(e.dir) : undefined, color: e.color, scale: e.scale, duration: e.dur, follow: follow(e.follow) }); break;
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
    const provisional: Role = this.results?.winner ?? ((this.snap?.meter ?? 0) >= 100 ? 'cat' : 'sitter');
    this.show = new EndShow({
      level: this.o.level, world: this.sw.world, views: this.views, camera: this.camera, renderer: this.o.renderer, audio: this.o.audio,
      root: this.hud.root, myId: this.o.myId, myRole: this.role, isHost: this.o.isHost, online: this.o.online,
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
      this.motion.teleport(me.p, me.yaw);
      this.camera.snap();
    }
    if (me.forced) this.motion.teleport(me.p, me.yaw);
    else {
      const faceYaw = role === 'sitter' && me.gest === 'spray' ? this.camera.yaw : !moving && me.work?.yaw !== undefined ? me.work.yaw : null;
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
    this.o.level.update(dt, this.time);
    this.tv.update(dt);
    this.show?.update(dt);
    const myView = this.views.chars.get(this.o.myId)!;
    this.camera.wobble = me.st.catnip ? 1 : 0;
    // hypnotized: turn toward the TV. Carried: swing around to the front, so the sitter holding you is in the shot
    const holder = me.grabbedBy ? this.views.chars.get(me.grabbedBy) : undefined;
    this.camera.pull = me.st.hypnotized && me.lookAt ? v3(me.lookAt) : holder ? holder.pos : null;
    this.camera.mode = me.grabbedBy ? 'carried' : role === 'sitter' && me.holding ? 'holding' : 'normal';
    this.camera.update(dt, myView.pos, role, this.sw.world);
    myView.root.visible = !this.camera.tooClose || !!this.show;
    const R = this.o.renderer;
    R.setLook(dt, !dark || !!this.show, role, !!me.st.catnip); // the owners switch the lights on for the end show
    if (role === 'sitter' && R.flashlight.visible) {
      // phone in the right hand, pointing where the crosshair is
      const y = this.camera.yaw;
      R.flashlight.position.set(myView.pos.x - Math.cos(y) * 0.28, myView.pos.y + 1.3, myView.pos.z + Math.sin(y) * 0.28);
      R.flashlight.target.position.copy(R.camera.position).addScaledVector(this.camera.forward, 8);
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
      const vis: CharState = mine
        ? { ...s, loaf: this.loaf, charge: this.motion.charge, gest: (this.localGest.t > 0 ? this.localGest.g : s.gest) as CharState['gest'], st: this.lmb.push ? { ...s.st, pushMode: 1 } : s.st }
        : s;
      const grounded = mine ? this.motion.grounded : s.g;
      if (v.cat) v.cat.update(dt, catVisual(vis, v.speed, v.vy, grounded));
      if (v.sitter) {
        const heldCat = s.holding ? snap.chars.find((c) => c.id === s.holding) : undefined;
        v.sitter.update(dt, sitterVisual(vis, v.speed, v.vy, grounded, { meter: snap.meter, ended: null, dark, aimPitch: mine ? this.camera.pitch : 0, heldNoodle: !!heldCat?.st.noodle }));
      }
      if (s.grabbedBy) { const h = this.views.chars.get(s.grabbedBy); if (h) held = [v, h]; }
    }
    if (held) this.views.attachToHand(held[0], held[1]);
  }

  // ---------------------------------------------------------------- verbs
  private catButtons(inp: Input, locked: boolean, dt: number, me: CharState) {
    // LMB: tap = swipe on release, hold >= 0.25 s = slow push mode (M8)
    if (inp.pressed.has('Mouse0') && locked) this.lmb = { held: true, t: 0, push: false };
    if (this.lmb.held) {
      if (inp.down.has('Mouse0')) {
        this.lmb.t += dt;
        if (!this.lmb.push && this.lmb.t >= HOLD_PUSH) { this.lmb.push = true; this.act({ a: 'push', on: true }); this.loaf = false; }
      } else {
        this.lmb.held = false;
        if (this.lmb.push) { this.lmb.push = false; this.act({ a: 'push', on: false }); }
        else {
          // swipe where the camera looks: snap the body around first so the host sees the new facing
          this.motion.yaw = this.camera.yaw;
          this.sendMove();
          this.act({ a: 'swipe' });
          this.gest('swipe', 0.35);
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
    void me;
  }

  private sitterButtons(inp: Input, locked: boolean, me: CharState) {
    if (inp.pressed.has('Mouse0') && locked) {
      const F = this.camera.forward;
      if (me.holding) { this.act({ a: 'toss', dir: [F.x, F.y, F.z] }); this.gest('toss', 0.4); }
      else { this.act({ a: 'spray', dir: [F.x, F.y, F.z] }); this.lastSprayAt = this.time; }
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
    this.views.dispose();
    this.fx.dispose();
    this.hud.dispose();
    this.o.level.group.removeFromParent();
    this.o.level.setTvTexture(null);
    this.sw.world.free();
    this.o.renderer.canvas.style.filter = '';
    this.o.renderer.flashlight.visible = false;
    this.o.renderer.dusk = 0;
  }
}
