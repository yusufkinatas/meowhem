/**
 * The end show (ADDENDUM section 5): freeze + shutter, the owners in the doorway, a walkthrough of the damage
 * (cats win) or the "did they eat?" kitchen tableau (sitter wins), then the fridge-door results board.
 * Purely client-side, driven by phase 'ended' + Results. Space or a click skips to the board after 1.2 s.
 */
import * as THREE from 'three';
import type { AudioApi, CatVisualState, LevelData, Role, SitterModelApi, SitterVisualState, Spot, SpotId, Vec3 } from '../shared/contracts';
import { createSitterModel } from '../registry';
// owners: the sitter agent's two owner looks (pure data, ADDENDUM 5.1)
import { OWNER_LOOKS } from '../models/sitter/looks';
import { cloneModel, hasModel } from '../assets/loader';
import { rayDist, type RAPIER } from '../core/physics';
import type { Results } from '../core/types';
import type { Views } from './view';
import type { FpsCamera } from './camera';
import type { Renderer } from './renderer';

const BUBBLES: Record<string, string> = {
  laptop: 'did someone order something', tubFaucet: 'why is the floor wet', tpRoll: 'that was a new roll',
  sofa: 'the sofa.', salmon: "where's dinner", fishTank: 'where are the fish', curtains: 'the curtains?',
};
const FORFEIT_LINES = ['The sitter has left the building.', 'The cats wandered off.'];
const T_FREEZE = 1.2, T_REVEAL = 3.0, CUT = 1.5, TABLEAU_CATS = 2.0, TABLEAU_SITTER = 2.5;

export interface ShowCtx {
  level: LevelData;
  world: RAPIER.World;
  views: Views;
  camera: FpsCamera;
  renderer: Renderer;
  audio: AudioApi;
  root: HTMLElement;
  myId: string;
  myRole: Role;
  /** where my eye was (not the spot cam's position, when a minigame was open) */
  eye: THREE.Vector3;
  isHost: boolean;
  online: boolean;
  onAgain(): void;
  onLobby(): void;
}

interface Shot { pos: THREE.Vector3; target: THREE.Vector3; fov: number; bubble?: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const V = (p: Vec3, dy = 0) => new THREE.Vector3(p[0], p[1] + dy, p[2]);
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const fwdV = (yaw: number) => new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));

export class EndShow {
  t = 0;
  results: Results | null = null;
  boardShown = false;
  private winner: Role;
  private owners: SitterModelApi[] = [];
  private bubble: HTMLDivElement;
  private board: HTMLDivElement;
  private shots: { start: number; shot: Shot }[] = [];
  private tableauAt = Infinity;
  private endAt = Infinity;
  private shuttered = false;
  private planned = false;
  private door: { plane: THREE.Vector3; f: THREE.Vector3; side: THREE.Vector3; floor: number; yaw: number };
  private meowStep = -1;
  private bag: { obj: THREE.Object3D; owner: THREE.Object3D } | null = null;
  private onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter') this.skip(); };
  private onClick = () => this.skip();

  constructor(private c: ShowCtx, provisional: Role) {
    this.winner = provisional;
    // the freeze frame: my character (visible again) from behind (the sitter over her right shoulder), looking the
    // way I was looking; from the front with a wall at its back
    const eye = c.eye, cat = c.myRole === 'cat';
    const lf = fwdV(c.camera.yaw), rt = new THREE.Vector3(-lf.z, 0, lf.x).multiplyScalar(cat ? 0 : 0.7);
    const room = (d: number) => rayDist(c.world, [eye.x, eye.y + 0.35, eye.z], [lf.x * d, 0, lf.z * d], 2.2);
    const s = room(-1) >= 1.2 || room(-1) >= room(1) ? -1 : 1;
    const pos = this.clampCam(eye, eye.clone().addScaledVector(lf, s * (cat ? 1.4 : 2.1)).add(rt).setY(eye.y + 0.35));
    c.camera.fixed = { pos, target: s < 0 ? eye.clone().addScaledVector(lf, 1.5).add(rt).setY(eye.y - 0.1) : eye, fov: 60 };
    c.audio.setMusic('off');
    c.root.classList.add('show-on');
    this.bubble = document.createElement('div');
    this.bubble.className = 'owner-bubble';
    this.board = document.createElement('div');
    this.board.className = 'fridge-wrap';
    c.root.append(this.bubble, this.board);
    addEventListener('keydown', this.onKey, true);
    addEventListener('pointerdown', this.onClick, true);

    // the front door frame: plane of the door, facing into the house is -f
    const spot = this.spot('frontDoor');
    const floor = spot ? spot.pos[1] : 0;
    const yaw = spot?.facing ?? 0;
    const f = fwdV(yaw);
    const from = spot ? V(spot.pos) : this.roomCenter('hallway');
    const dd = rayDist(c.world, [from.x, floor + 1.0, from.z], [f.x, 0, f.z], 3);
    const plane = from.clone().addScaledVector(f, dd >= 3 ? 0.7 : dd);
    plane.y = floor;
    this.door = { plane, f, side: new THREE.Vector3(f.z, 0, -f.x), floor, yaw };
    this.makeOwners();
  }

  setResults(r: Results) {
    this.results = r;
    this.winner = r.winner;
    if (FORFEIT_LINES.includes(r.headline) || (r as { forfeit?: unknown }).forfeit) this.showBoard();
  }

  private spot(id: SpotId): Spot | undefined { return this.c.level.spots.find((s) => s.id === id); }
  private roomCenter(id: string): THREE.Vector3 {
    const r = this.c.level.rooms.find((x) => x.id === id) ?? this.c.level.rooms[0];
    return new THREE.Vector3((r.min[0] + r.max[0]) / 2, r.min[1], (r.min[2] + r.max[2]) / 2);
  }

  /** keep a camera position on the target's side of walls */
  private clampCam(target: THREE.Vector3, pos: THREE.Vector3): THREE.Vector3 {
    const d = pos.clone().sub(target);
    const len = d.length();
    if (len < 0.01) return pos;
    d.divideScalar(len);
    const free = rayDist(this.c.world, [target.x, target.y, target.z], [d.x, d.y, d.z], len);
    return target.clone().addScaledVector(d, Math.max(0.4, Math.min(len, free - 0.15)));
  }

  private makeOwners() {
    const { plane, f, side, yaw } = this.door;
    OWNER_LOOKS.forEach((look, i) => {
      let m: SitterModelApi;
      try { m = createSitterModel(look); } catch { return; }
      m.root.position.copy(plane).addScaledVector(f, 0.45).addScaledVector(side, i === 0 ? -0.4 : 0.4);
      m.root.rotation.y = yaw + Math.PI;
      this.c.views.group.add(m.root);
      if (i === 1 && hasModel('groceryBag')) {
        try {
          const bag = cloneModel('groceryBag');
          if (hasModel('baguette')) {
            const b = cloneModel('baguette');
            b.position.set(0.02, 0.2, 0.02);
            b.rotation.set(-1.15, 0.2, 0.15);
            bag.add(b);
          }
          // hangs from the left hand (idle arms hang at hip height, so it is in the hips-down shot)
          const hand = m.root.getObjectByName('handslotl') ?? m.holdAnchor;
          hand.add(bag);
          this.bag = { obj: bag, owner: m.root };
        } catch (e) { console.warn('[endShow] grocery bag', e); }
      }
      this.owners.push(m);
    });
  }

  /** build the shot list once the winner is known */
  private plan() {
    this.planned = true;
    const { plane, f, floor } = this.door;
    const r = this.results;
    if (this.winner === 'cat') {
      const list: { key: string; pts: number; spot: SpotId | null; order: number }[] = [];
      (r?.disasters ?? []).forEach((d, i) => {
        const e = list.find((x) => x.key === d.key);
        if (e) { e.pts += d.points; e.order = i; } else list.push({ key: d.key, pts: d.points, spot: d.spot, order: i });
      });
      list.sort((a, b) => b.pts - a.pts || b.order - a.order);
      let t = T_REVEAL;
      for (const d of list.slice(0, 3)) {
        const shot = this.disasterShot(d.key, d.spot);
        if (shot) { this.shots.push({ start: t, shot }); t += CUT; }
      }
      if (!this.shots.length) { this.shots.push({ start: t, shot: this.roomShot() }); t += CUT; }
      this.tableauAt = t;
      this.endAt = t + TABLEAU_CATS;
      // wide hallway shot from the doorway (the owners' view)
      const row = plane.clone().addScaledVector(f, -1.5);
      this.shots.push({ start: t, shot: {
        pos: this.clampCam(row.clone().setY(floor + 0.5), plane.clone().addScaledVector(f, -0.12).setY(floor + 1.2)),
        target: row.clone().addScaledVector(f, -0.5).setY(floor + 0.45), fov: 62,
      } });
    } else {
      this.tableauAt = T_REVEAL;
      this.endAt = T_REVEAL + TABLEAU_SITTER;
      const k = this.kitchen();
      this.shots.push({ start: T_REVEAL, shot: { pos: k.cam, target: k.row.clone().setY(k.row.y + 0.72), fov: 56, bubble: 'did they eat?' } });
    }
  }

  private disasterShot(key: string, spotId: SpotId | null): Shot | null {
    const s = this.spot((spotId ?? key) as SpotId);
    if (!s) return null;
    const f = fwdV(s.facing);
    const bubble = BUBBLES[key] ?? BUBBLES[s.id];
    if (s.id === 'tubFaucet') {
      // the flood, seen from the bathroom doorway
      const door = this.spot('bathroomDoor');
      const target = V(s.pos, 0.3);
      if (door) {
        const pos = V(door.pos, 1.5);
        pos.addScaledVector(pos.clone().sub(target).setY(0).normalize(), 0.4);
        return { pos: this.clampCam(target, pos), target, fov: 60, bubble };
      }
    }
    const back = s.id === 'curtains' ? 3.0 : 2.2, up = s.id === 'curtains' ? 1.5 : 1.4, ty = s.id === 'curtains' ? 1.0 : 0.5;
    const target = V(s.pos, ty);
    const pos = V(s.pos, up).addScaledVector(f, -back);
    return { pos: this.clampCam(target, pos), target, fov: 58, bubble };
  }

  /** no permanents: the room with the most mess weight */
  private roomShot(): Shot {
    const rooms = this.c.level.rooms;
    const w = new Map<string, { w: number; c: THREE.Vector3 }>();
    for (const { m } of this.c.views.mess.values()) {
      const r = rooms.find((x) => m.p[0] >= x.min[0] && m.p[0] <= x.max[0] && m.p[2] >= x.min[2] && m.p[2] <= x.max[2]);
      if (!r) continue;
      const e = w.get(r.id) ?? { w: 0, c: new THREE.Vector3() };
      e.w += m.w;
      e.c.addScaledVector(V(m.p), m.w);
      w.set(r.id, e);
    }
    let best = 'living', bw = -1;
    for (const [id, e] of w) if (e.w > bw) { bw = e.w; best = id; }
    const room = rooms.find((x) => x.id === best) ?? rooms[0];
    const e = w.get(room.id);
    const target = e && e.w > 0 ? e.c.divideScalar(e.w) : this.roomCenter(room.id);
    target.y = room.min[1] + 0.25;
    // the corner farthest from the mess, inset, near the ceiling
    let pos = new THREE.Vector3(), far = -1;
    for (const x of [room.min[0] + 0.45, room.max[0] - 0.45]) for (const z of [room.min[2] + 0.45, room.max[2] - 0.45]) {
      const d = (x - target.x) ** 2 + (z - target.z) ** 2;
      if (d > far) { far = d; pos = new THREE.Vector3(x, room.min[1] + Math.min(2.0, room.max[1] - room.min[1] - 0.35), z); }
    }
    return { pos: this.clampCam(target, pos), target, fov: 62, bubble: 'what happened in here' };
  }

  private kitchen() {
    const bowl = this.spot('foodBowl');
    const p = bowl ? V(bowl.pos) : this.roomCenter('kitchen');
    const fb = fwdV(bowl?.facing ?? 0);
    const row = p.clone().addScaledVector(fb, -0.3);
    const cam = this.clampCam(row.clone().setY(row.y + 0.7), row.clone().addScaledVector(fb, -3.0).setY(row.y + 1.35));
    const freeBack = rayDist(this.c.world, [row.x, row.y + 1.0, row.z], [fb.x, 0, fb.z], 2);
    const side = new THREE.Vector3(fb.z, 0, -fb.x);
    const sitter = freeBack > 1.1
      ? row.clone().addScaledVector(fb, Math.min(0.9, freeBack - 0.45))
      : row.clone().addScaledVector(side, 1.05).addScaledVector(fb, -0.15);
    return { row, cam, fb, side, sitter, yaw: (bowl?.facing ?? 0) + Math.PI };
  }

  /** keep the bag upright, unscaled, handles in the hand, whatever the hand bone does */
  private hangBag(bag: THREE.Object3D, owner: THREE.Object3D) {
    const parent = bag.parent;
    if (!parent) return;
    owner.updateMatrixWorld(true);
    parent.matrixWorld.decompose(_p, _q, _s);
    bag.scale.set(1 / (_s.x || 1), 1 / (_s.y || 1), 1 / (_s.z || 1));
    bag.quaternion.copy(_q).invert().multiply(owner.quaternion);
    // bag origin is at its bottom: drop it so the top sits in the hand
    _p.set(0, -0.32, 0).applyQuaternion(owner.quaternion);
    bag.position.copy(_p).applyQuaternion(_q.invert()).divide(_s);
  }

  skip() {
    if (this.t < T_FREEZE || this.boardShown) return;
    if (!this.planned && this.results) this.plan();
    if (this.endAt < Infinity) this.t = Math.max(this.t, this.endAt);
    this.showBoard();
  }

  /** returns true while characters belong to the show (client must not drive them) */
  update(dt: number) {
    const c = this.c;
    // wait for results at the reveal (they normally arrive 0.2 s after the end)
    if (this.t + dt >= T_REVEAL && !this.results) this.t = Math.min(this.t + dt, T_REVEAL - 0.001);
    else this.t += dt;
    const t = this.t;
    if (!this.shuttered && t >= 0.3) { this.shuttered = true; c.audio.play('shutter', { volume: 0.9 }); c.renderer.flash(120); }
    if (this.results && !this.planned && t >= T_REVEAL - 0.5) this.plan();

    // door: 0 -> 1 over 1 s from the reveal
    c.level.setVisual('frontDoor.open', t < T_FREEZE ? 0 : Math.min(1, (t - T_FREEZE) / 1.0));
    const ownerFace: SitterVisualState['face'] = this.winner === 'cat' ? 'shock' : 'neutral';
    this.owners.forEach((o) => o.update(t < T_FREEZE ? 0 : dt, {
      anim: 'idle', face: ownerFace, speed: 0, vy: 0, grounded: true, carrying: false, flashlight: false, aimPitch: 0,
    }));
    if (this.bag) this.hangBag(this.bag.obj, this.bag.owner);

    // camera
    if (t >= T_FREEZE && t < T_REVEAL) {
      const { plane, f, floor } = this.door;
      const pos = plane.clone().addScaledVector(f, -1.1).setY(floor + 0.3);
      c.camera.fixed = { pos, target: pos.clone().add(f), fov: 52 };
      this.say('');
    } else if (t >= T_REVEAL) {
      let cur: { start: number; shot: Shot } | null = null;
      for (const s of this.shots) if (t >= s.start) cur = s;
      if (cur) {
        c.camera.fixed = { pos: cur.shot.pos, target: cur.shot.target, fov: cur.shot.fov };
        const typed = cur.shot.bubble ? cur.shot.bubble.slice(0, Math.max(0, Math.floor((t - cur.start - 0.2) * 40))) : '';
        this.say(this.boardShown ? '' : typed);
      }
    }

    // characters: frozen until the tableau, then posed
    if (t >= this.tableauAt) this.poseTableau(dt);
    if (t >= this.endAt) this.showBoard();
    return true;
  }

  private say(text: string) {
    if (this.bubble.textContent === text) return;
    this.bubble.textContent = text;
    this.bubble.classList.toggle('on', !!text);
  }

  private poseTableau(dt: number) {
    const { views } = this.c;
    const cats = [...views.chars.values()].filter((v) => v.cat);
    const sitters = [...views.chars.values()].filter((v) => v.sitter);
    const n = cats.length;
    const catWin = this.winner === 'cat';
    let row: THREE.Vector3, side: THREE.Vector3, catYaw: number, sitterPos: THREE.Vector3, sitterYaw: number;
    if (catWin) {
      const { plane, f, side: s, yaw } = this.door;
      row = plane.clone().addScaledVector(f, -1.5);
      side = s; catYaw = yaw; sitterPos = row.clone().addScaledVector(f, -1.0); sitterYaw = yaw;
    } else {
      const k = this.kitchen();
      row = k.row; side = k.side; catYaw = k.yaw; sitterPos = k.sitter; sitterYaw = k.yaw;
    }
    const step = Math.floor((this.t - this.tableauAt) / 0.7);
    if (!catWin && step !== this.meowStep && n) {
      this.meowStep = step;
      const v = cats[step % n];
      this.c.audio.play(step % 3 === 2 ? 'meowLong' : 'meow', { pos: [v.pos.x, v.pos.y + 0.3, v.pos.z], pitch: 0.95 + (step % n) * 0.06 });
    }
    cats.forEach((v, i) => {
      v.root.position.copy(row).addScaledVector(side, (i - (n - 1) / 2) * 0.42);
      v.root.rotation.y = catYaw;
      v.pos.copy(v.root.position);
      const meowing = !catWin && step % n === i && (this.t - this.tableauAt) % 0.7 < 0.4;
      const s: CatVisualState = {
        anim: 'sit', face: catWin ? 'happy' : 'sad', speed: 0, vy: 0, grounded: true, wet: 0, puffed: false, high: false,
        talk: meowing ? 'meow' : null, lookAt: null, dizzy: false, pounceCharge: 0, wiggle: 0, carrying: null,
      };
      v.cat!.update(dt, s);
    });
    for (const v of sitters) {
      v.root.position.copy(sitterPos);
      v.root.rotation.y = sitterYaw;
      v.pos.copy(sitterPos);
      v.sitter!.update(dt, {
        anim: catWin ? 'despair' : 'celebrate', face: catWin ? 'panic' : 'smug', speed: 0, vy: 0, grounded: true,
        carrying: false, flashlight: false, aimPitch: 0,
      });
    }
  }

  // ---------------------------------------------------------------- results board (fridge door)
  showBoard() {
    if (this.boardShown) return;
    const r = this.results;
    if (!r) return;
    this.boardShown = true;
    this.say('');
    const c = this.c;
    const won = r.winner === c.myRole;
    c.audio.play(won ? 'win' : 'lose');
    setTimeout(() => { if (this.board.isConnected) c.audio.setMusic('menu'); }, 2800);
    const lines = r.receipt?.length ? r.receipt : [{ label: 'Total', value: `${r.meter}%` }];
    const receipt = lines.map((l) => {
      if (/^-+$/.test(l.label)) return '<div class="rc-rule"></div>';
      const total = /^total$/i.test(l.label);
      return `${total && !r.receipt?.some((x) => /^-+$/.test(x.label)) ? '<div class="rc-rule"></div>' : ''}<div class="rc-line${total ? ' total' : ''}"><span>${esc(l.label)}</span><i></i><b>${esc(l.value)}</b></div>`;
    }).join('');
    const colors = ['#fff1a8', '#ffd6c9', '#d7efc6', '#cfe5f7', '#f4d9f0', '#ffe6b0'];
    const magnets = ['#e07a5f', '#7fb7d9', '#8fb39a', '#f2b544', '#c58fd1', '#e9603f'];
    const notes = r.awards.slice(0, 6).map((a, i) => `<div class="note${a.playerId === c.myId ? ' mine' : ''}" style="--bg:${colors[i % 6]};--mag:${magnets[(i + 2) % 6]};--r:${[-3, 2, -1.5, 3, -2.5, 1][i]}deg;animation-delay:${0.25 + i * 0.12}s">
        <div class="nt-title">${esc(a.title)}</div><div class="nt-name">${esc(a.name)}</div><div class="nt-desc">${esc(a.desc)}</div></div>`).join('');
    const again = c.isHost ? '<button class="btn primary" data-a="again">Again</button>' : '<span class="wait">The host decides what happens next</span>';
    const lobby = `<button class="btn" data-a="lobby">${!c.online ? 'Menu' : c.isHost ? 'Lobby' : 'Leave'}</button>`;
    this.board.innerHTML = `<div class="fridge ${r.winner}">
      <div class="fr-handle"></div>
      <div class="fr-head"><div class="fr-kicker">${r.winner === 'cat' ? 'Cats win' : 'Sitter wins'}</div><h1>${esc(r.headline)}</h1><div class="fr-sub">${esc(r.sub)}</div></div>
      <div class="fr-cols">
        <div class="receipt"><div class="rc-title">DAMAGES</div>${receipt}</div>
        <div class="notes">${notes || '<div class="note empty" style="--bg:#fffaf0;--mag:#c9b8a6;--r:-1deg">Nobody did anything remarkable.</div>'}</div>
      </div>
      <div class="fr-btns">${again}${lobby}</div>
    </div>`;
    this.board.classList.add('on');
    this.board.onclick = (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (a === 'again') c.onAgain();
      if (a === 'lobby') c.onLobby();
    };
  }

  dispose() {
    removeEventListener('keydown', this.onKey, true);
    removeEventListener('pointerdown', this.onClick, true);
    this.c.root.classList.remove('show-on');
    this.bubble.remove();
    this.board.remove();
    for (const o of this.owners) { o.root.removeFromParent(); o.dispose(); }
    this.c.camera.fixed = null;
  }
}
