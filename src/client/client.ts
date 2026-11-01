/**
 * Client game: owns the local character's motion (zero-latency, local static world), sends transforms
 * + actions to the host, renders everything from snapshots/events, runs HUD and minigames.
 * The host's own player uses this exact class through a loopback link.
 */
import * as THREE from 'three';
import type { AudioApi, CatTvApi, FxApi, LevelData, MinigameApi, MinigameHost, MinigameKind, TvShow, Vec3, WorldVisualValue } from '../shared/contracts';
import { CFG } from '../config';
import { createFx, createCatTv, openMinigame } from '../registry';
import { buildStaticWorld, type StaticWorld } from '../core/physics';
import { CharMotion } from '../core/charMotion';
import { distXZ } from '../core/math';
import type { Action, CharState, GameConfig, GameEvent, Results, Snapshot } from '../core/types';
import type { H2C, C2H } from '../net/protocol';
import type { ClientLink } from '../net/transport';
import type { Renderer } from './renderer';
import type { Input } from './input';
import { TpsCamera } from './camera';
import { Views, catVisual, sitterVisual, type CharView } from './view';
import { Hud } from './hud';
import { spawnYaw } from '../sim/sim';

export interface ClientOpts {
  link: ClientLink;
  myId: string;
  cfg: GameConfig;
  level: LevelData;
  isHost: boolean;
  audio: AudioApi;
  renderer: Renderer;
  input: Input;
  ui: HTMLElement;
  onLeave(): void;
  onAgain(): void;
}

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
  private offset: number | null = null;
  private mg: { key: string; kind: MinigameKind; api: MinigameApi; el: HTMLElement } | null = null;
  private tpSeen = 0;
  private moveAcc = 0;
  private loaf = false;
  private time = 0;
  private music = '';
  private heads = new Map<string, THREE.Vector3>();
  private localGest: { g: CharState['gest']; t: number } = { g: null, t: 0 };
  fps = 0;
  /** tests: treat the pointer as locked */
  forceLocked = false;

  constructor(readonly o: ClientOpts) {
    const r = o.renderer;
    r.scene.add(o.level.group);
    this.views = new Views(r.scene, o.cfg.players);
    this.fx = createFx(r.scene);
    this.tv = createCatTv();
    o.level.setTvTexture(this.tv.texture);
    this.camera = new TpsCamera(r.camera);
    this.sw = buildStaticWorld(o.level);
    const mine = o.cfg.players.find((p) => p.id === o.myId)!;
    const spawn = mine.role === 'sitter' ? o.level.spawns.sitter : o.level.spawns.cats[o.cfg.players.filter((p) => p.role === 'cat').indexOf(mine) % o.level.spawns.cats.length];
    this.motion = new CharMotion(this.sw.world, mine.role, spawn, spawnYaw(o.level, mine.role, spawn));
    this.camera.yaw = this.motion.yaw;
    this.hud = new Hud(o.ui, o.cfg.players, o.myId);
    this.hud.onLeave = () => o.onLeave();
    this.hud.onAgain = () => o.onAgain();
    this.hud.onResume = () => o.input.lock();
    o.audio.setMusic('game');
  }

  get role() { return this.motion.role; }

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
  }

  private applyWorld(k: string, v: WorldVisualValue) {
    if (this.world[k] === v) return;
    this.world[k] = v;
    const L = this.o.level;
    if (k.startsWith('door.')) {
      const id = k.slice(5) as 'bathroomDoor' | 'bedroomDoor' | 'officeDoor';
      L.setDoorOpen(id, Number(v));
      this.sw.setDoor(id, Number(v) > 0.5);
    } else L.setVisual(k, v);
    if (k === 'tv.on') this.tv.setOn(!!v);
    if (k === 'tv.show') this.tv.setShow(v as TvShow);
  }

  private onEvent(e: GameEvent) {
    const follow = (id?: string) => (id ? this.views.chars.get(id)?.root : undefined);
    switch (e.e) {
      case 'fx': this.fx.spawn(e.kind, v3(e.p), { dir: e.dir ? v3(e.dir) : undefined, color: e.color, scale: e.scale, duration: e.dur, follow: follow(e.follow) }); break;
      case 'text': this.fx.text(e.text, v3(e.p), { color: e.color, size: e.size, follow: follow(e.follow) }); break;
      case 'sound': this.o.audio.play(e.name, { pos: e.p, pitch: e.pitch, volume: e.vol }); break;
      case 'loop': this.o.audio.loop(e.id, e.name, e.on, { pos: e.p, volume: e.vol }); break;
      case 'toast': this.hud.toast(e.text, e.tone); break;
      case 'popup': this.hud.popup(e.text, e.color); break;
      case 'mgOpen': this.openMg(e.key, e.kind, e.data); break;
      case 'mgClose': if (this.mg?.key === e.key) this.closeMg(); break;
      case 'push': if (e.id === this.o.myId) this.motion.impulse(e.v); break;
      case 'propGone': this.views.removeProp(e.id); break;
      case 'tvShow': this.tv.setShow(e.show); break;
      case 'results':
        this.results = e.results;
        this.closeMg();
        this.o.input.unlock();
        this.hud.showResults(e.results, this.o.isHost, this.role);
        break;
    }
  }

  private openMg(key: string, kind: MinigameKind, data?: Record<string, unknown>) {
    this.closeMg();
    const box = document.createElement('div');
    box.className = 'mg-container';
    this.hud.mgRoot.appendChild(box);
    let sum = 0;
    const host: MinigameHost = {
      container: box,
      progress: (d) => { sum += d; this.act({ a: 'mg', key, delta: d }); },
      getProgress: () => (kind === 'fight' ? Math.min(1, sum / 1.5) : this.me?.work?.key === key ? this.me.work.progress : 0),
      exit: () => { this.act({ a: 'mgExit', key }); this.closeMg(); },
      sound: (n) => this.o.audio.play(n),
      data,
    };
    const api = openMinigame(kind, host);
    this.mg = { key, kind, api, el: box };
    this.o.input.unlock();
    this.o.input.intercept = (ev, down) => api.key(ev, down);
    const mouse = (ev: MouseEvent) => api.mouse?.(ev);
    for (const t of ['mousedown', 'mouseup', 'mousemove', 'click'] as const) box.addEventListener(t, mouse);
  }

  closeMg() {
    if (!this.mg) return;
    this.mg.api.dispose();
    this.mg.el.remove();
    this.mg = null;
    this.o.input.intercept = null;
  }

  /** render time on the host clock */
  private renderT() {
    return (this.offset ?? 0) + performance.now() / 1000 - CFG.interpDelay;
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
    const control = playing && !this.mg && !this.results;
    const role = this.role;

    if (inp.locked) this.camera.look(inp.mouseDX, inp.mouseDY);
    if (inp.pressed.has('Mouse0') && !inp.locked && !this.mg && !this.results) inp.lock();

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
      for (const k of ['Space', 'KeyE', 'KeyW', 'KeyA', 'KeyS', 'KeyD']) if (inp.pressed.has(k) && !this.mg) this.act({ a: 'mash' });
      if (inp.pressed.has('KeyR') && role === 'cat') this.act({ a: 'hiss' });
    } else if (control) {
      if (inp.pressed.has('Mouse0') && locked) {
        if (role === 'cat') {
          // swipe where the camera looks: snap the body around first so the host sees the new facing
          this.motion.yaw = this.camera.yaw;
          this.sendMove();
          this.act({ a: 'swipe' });
          this.gest('swipe', 0.35);
          this.loaf = false;
        }
        else this.act({ a: 'spray', dir: [this.camera.forward.x, this.camera.forward.y, this.camera.forward.z] });
      }
      if (inp.pressed.has('KeyE') && me.prompt?.ok) this.act({ a: 'interact', on: true, key: me.prompt.key });
      if (inp.pressed.has('KeyQ')) this.act(role === 'cat' ? { a: 'meow' } : { a: 'treats' });
      if (role === 'cat' && inp.pressed.has('KeyR')) {
        this.act(inp.doubleTapped.has('KeyR') ? { a: 'hairball' } : { a: 'hiss' });
        this.loaf = false;
      }
      if (role === 'cat' && inp.pressed.has('KeyF') && this.motion.grounded) this.loaf = !this.loaf;
    }
    if (inp.released.has('KeyE')) this.act({ a: 'interact', on: false });
    if (moving || inp.down.has('Space') || me.frozen || me.forced) this.loaf = false;

    // ---------------------------------------------------------------- local motion
    if (me.tp !== this.tpSeen) {
      this.tpSeen = me.tp;
      this.motion.teleport(me.p, me.yaw);
    }
    if (me.forced) this.motion.teleport(me.p, me.yaw);
    else {
      const faceYaw = role === 'sitter' && me.gest === 'spray' ? this.camera.yaw : !moving && me.work?.yaw !== undefined ? me.work.yaw : null;
      this.motion.step(Math.min(dt, 1 / 30), { moveX: mx, moveZ: mz, faceYaw, sprint: control && (inp.down.has('ShiftLeft') || inp.down.has('ShiftRight')), jumpHeld: control && inp.down.has('Space') },
        { mul: me.mul, frozen: me.frozen || !control, inSun: this.o.level.sunPatches.some((s) => distXZ(this.motion.pos, s.center) < s.radius && Math.abs(this.motion.pos[1] - s.center[1]) < 0.6) });
      this.sw.world.step();
    }
    this.moveAcc += dt;
    if (this.moveAcc >= 1 / CFG.moveHz) this.sendMove();

    // ---------------------------------------------------------------- views
    const rt = this.renderT();
    const ended = snap.phase === 'ended' ? (this.results ? (this.results.winner === 'sitter' ? 'win' : 'lose') : (snap.meter >= 100 ? 'lose' : 'win')) : null;
    const dark = this.world.lights === false;
    let held: [CharView, CharView] | null = null;
    for (const s of snap.chars) {
      const v = this.views.chars.get(s.id);
      if (!v) continue;
      if (s.id === this.o.myId && !s.forced) {
        _a.set(this.motion.pos[0], this.motion.pos[1], this.motion.pos[2]);
        this.views.place(v, dt, _a, this.motion.yaw, this.motion.vel);
      } else {
        const r = v.track.sample(rt, _a, true);
        this.views.place(v, dt, _a, r[0], null);
      }
      const vis = s.id === this.o.myId ? { ...s, loaf: this.loaf, charge: this.motion.charge, gest: this.localGest.t > 0 ? this.localGest.g : s.gest } : s;
      if (v.cat) v.cat.update(dt, catVisual(vis, v.speed, v.vy, s.id === this.o.myId ? this.motion.grounded : s.g));
      if (v.sitter) v.sitter.update(dt, sitterVisual(vis, v.speed, v.vy, s.id === this.o.myId ? this.motion.grounded : s.g, { meter: snap.meter, ended, dark, aimPitch: this.camera.pitch }));
      if (s.grabbedBy) { const h = this.views.chars.get(s.grabbedBy); if (h) held = [v, h]; }
    }
    if (held) this.views.attachToHand(held[0], held[1]);
    for (const v of this.views.chars.values()) {
      let h = this.heads.get(v.id);
      if (!h) { h = new THREE.Vector3(); this.heads.set(v.id, h); }
      this.views.headOf(v, h);
    }
    this.views.updateProps(rt);
    if (this.localGest.t > 0) this.localGest.t -= dt;

    // ---------------------------------------------------------------- world, camera, look
    this.o.level.update(dt, this.time);
    this.tv.update(dt);
    const myView = this.views.chars.get(this.o.myId)!;
    this.camera.wobble = me.st.catnip ? 1 : 0;
    this.camera.pull = me.st.hypnotized && me.lookAt ? v3(me.lookAt) : null;
    this.camera.update(dt, myView.pos, role, this.sw.world);
    const R = this.o.renderer;
    R.setLook(dt, !dark, role, !!me.st.catnip);
    if (role === 'sitter') {
      R.flashlight.position.set(myView.pos.x, myView.pos.y + 1.55, myView.pos.z);
      R.flashlight.target.position.copy(R.flashlight.position).addScaledVector(this.camera.forward, 5);
    }
    this.fx.update(dt, R.camera);
    this.o.audio.setListener([R.camera.position.x, R.camera.position.y, R.camera.position.z], this.camera.yaw);
    const music = !playing ? 'game' : me.st.catnip ? 'catnip' : snap.meter > 75 || snap.timeLeft < 60 ? 'tense' : 'game';
    if (music !== this.music) { this.music = music; this.o.audio.setMusic(music as 'game'); }

    // ---------------------------------------------------------------- hud + minigame
    this.hud.world = this.world;
    this.hud.update(snap, { ...me, stamina: this.motion.stamina / (role === 'cat' ? CFG.cat.stamina : CFG.sitter.stamina) }, R.camera, this.camera.yaw, {
      work: me.work?.progress ?? 0, locked: locked, mgOpen: !!this.mg, tab: inp.down.has('Tab'), ended: !!this.results, dark, heads: this.heads,
    });
    this.mg?.api.update(dt);
    inp.endFrame();
  }

  private gest(g: CharState['gest'], t: number) { this.localGest = { g, t }; }

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
    this.views.dispose();
    this.fx.dispose();
    this.hud.dispose();
    this.o.level.group.removeFromParent();
    this.o.level.setTvTexture(null);
    this.sw.world.free();
    this.o.renderer.canvas.style.filter = '';
    this.o.renderer.flashlight.visible = false;
  }
}
