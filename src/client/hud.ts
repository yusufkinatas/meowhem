/** DOM HUD overlay. Touches the DOM only when values change. */
import * as THREE from 'three';
import type { RoomId, Role } from '../shared/contracts';
import { scaleFor } from '../config';
import type { Alert, CharState, PlayerInfo, Snapshot } from '../core/types';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const kc = (k: string) => `<kbd class="cap${k.length > 2 ? ' wide' : ''}">${k}</kbd>`;
const RING = 2 * Math.PI * 9;

/** status chips: one plain word plus seconds (ADDENDUM 1.1) */
const BUFFS: [keyof CharState['st'], string, string][] = [
  ['fed', 'Fed', 'good'], ['catnip', 'Catnip', 'good'], ['zoomies', 'Zoomies', 'good'], ['focused', 'Focused', 'good'],
  ['crown', 'Crown', 'good'], ['wet', 'Wet', 'bad'], ['dizzy', 'Dizzy', 'bad'],
];

/** the cat to-do list (ADDENDUM 1.6), crossed out by done.<spot> */
const TODO: [string, string][] = [
  ['laptop', 'Order something online'], ['tubFaucet', 'Run a bath'], ['tpRoll', 'Unroll the toilet paper'],
  ['sofa', 'Scratch the good sofa'], ['salmon', 'Dinner'], ['fishTank', 'Go fishing'], ['curtains', 'Take down the curtains'],
];
// one hand-drawn scribble, stretched over each line
const SCRIBBLE = 'M2 13 C 20 6, 30 16, 48 9 S 80 15, 98 8 S 130 16, 150 9 S 182 14, 198 10 M6 10 C 40 14, 70 7, 100 12 S 160 8, 196 13';

export class Hud {
  readonly root = el('div', 'hud');
  readonly mgRoot = el('div', 'mg-root');
  private meterFill = el('div', 'meter-fill');
  private meterText = el('div', 'meter-text');
  private meter = el('div', 'meter');
  private timer = el('div', 'timer');
  private timerSub = el('div', 'timer-sub');
  private panel = el('div', 'panel');
  private alerts = el('div', 'alerts');
  private todo = el('div', 'todo');
  private markers = el('div', 'markers');
  private tags = el('div', 'tags');
  private prompt = el('div', 'prompt');
  private toasts = el('div', 'toasts');
  private popups = el('div', 'popups');
  private mash = el('div', 'mash');
  private roleCard = el('div', 'rolecard');
  private crosshair = el('div', 'crosshair');
  private board = el('div', 'board');
  readonly lockHint = el('div', 'lockhint');
  private cache = new Map<string, string>();
  private lastMeter = 0;
  private lastPhase = '';
  private goUntil = 0;
  private markerEls = new Map<string, HTMLElement>();
  private tagEls = new Map<string, HTMLElement>();
  private todoEls = new Map<string, HTMLElement>();
  private ammoMax: number;
  /** spot id -> room (for the to-do wobble), set by the client */
  spotRoom = new Map<string, RoomId>();
  onLeave: (() => void) | null = null;
  onResume: (() => void) | null = null;
  /** client's current world keys (set by the client) */
  world: Record<string, unknown> = {};

  constructor(parent: HTMLElement, private roster: PlayerInfo[], private myId: string) {
    this.meter.append(this.meterFill, el('div', 'meter-ticks', '<i></i><i></i><i></i>'), this.meterText);
    const top = el('div', 'hud-top');
    const clock = el('div', 'clock');
    clock.append(this.timer, this.timerSub);
    top.append(this.meter, clock);
    this.prompt.innerHTML = `<div class="key"><svg viewBox="0 0 44 44"><circle class="ring-bg" cx="22" cy="22" r="19"/><circle class="ring" cx="22" cy="22" r="19"/></svg><span>E</span></div><div class="label"></div>`;
    this.lockHint.innerHTML = `<div class="card"><div class="lh-title">Paused</div><div class="lh-sub">Click to look around. Esc frees the mouse.</div><div class="row"><button class="btn primary" data-a="resume">Resume</button><button class="btn" data-a="leave">Leave game</button></div></div>`;
    this.lockHint.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (a === 'leave') this.onLeave?.();
      else if (a === 'resume' || e.target === this.lockHint) this.onResume?.();
    });
    this.todo.innerHTML = `<div class="todo-title">To do</div>` + TODO.map(([k, label]) =>
      `<div class="todo-item" data-k="${k}"><span>${label}</span><svg viewBox="0 0 200 20" preserveAspectRatio="none"><path d="${SCRIBBLE}"/></svg></div>`).join('');
    this.todo.querySelectorAll<HTMLElement>('.todo-item').forEach((e) => this.todoEls.set(e.dataset.k!, e));
    this.ammoMax = scaleFor(roster.filter((p) => p.role === 'cat').length).ammo;
    this.root.append(this.tags, this.markers, top, this.panel, this.alerts, this.todo, this.prompt, this.toasts, this.popups, this.mash,
      this.roleCard, this.crosshair, this.board, this.mgRoot, this.lockHint);
    parent.appendChild(this.root);
  }

  private set(key: string, v: string, apply: (v: string) => void) {
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    apply(v);
  }

  update(snap: Snapshot, me: CharState, cam: THREE.PerspectiveCamera, camYaw: number, extras: {
    locked: boolean; mgOpen: boolean; stripOpen: boolean; tab: boolean; ended: boolean; dark: boolean;
    heads: Map<string, THREE.Vector3>; room: RoomId | null;
  }) {
    const role: Role = me.role;
    // meter
    const m = Math.round(snap.meter);
    this.set('meter', String(m), () => {
      this.meterFill.style.width = `${Math.min(100, snap.meter)}%`;
      this.meterFill.style.background = m < 40 ? 'var(--mess-low)' : m < 75 ? 'var(--mess-mid)' : 'var(--mess-high)';
      this.meterText.innerHTML = `Mess <b>${m}%</b>`;
      if (m > this.lastMeter) { this.meter.classList.remove('bump'); void this.meter.offsetWidth; this.meter.classList.add('bump'); }
      this.meter.classList.toggle('danger', m >= 75);
      this.lastMeter = m;
    });
    // timer, overtime
    const ot = (snap.overtime ?? 0) > 0;
    this.set('timer', `${mmss(snap.timeLeft)}|${ot}`, () => {
      this.timer.textContent = ot ? '0:00' : mmss(snap.timeLeft);
      this.timer.classList.toggle('low', !ot && snap.timeLeft < 60 && snap.phase === 'playing');
      this.timer.classList.toggle('overtime', ot);
      this.timerSub.textContent = ot ? "They're looking for their keys." : '';
      this.timerSub.style.display = ot ? 'block' : 'none';
    });

    // countdown role card
    if (snap.phase === 'playing' && this.lastPhase === 'countdown') this.goUntil = performance.now() + 700;
    this.lastPhase = snap.phase;
    const cd = snap.phase === 'countdown' ? String(Math.max(1, Math.ceil(snap.countdown))) : performance.now() < this.goUntil ? 'Go' : '';
    this.set('cd', `${cd}|${role}`, () => {
      if (!cd) { this.roleCard.classList.remove('show'); return; }
      const cat = role === 'cat';
      this.roleCard.innerHTML = `<div class="rc-card ${role}">
        <div class="rc-role">${cat ? 'You are a cat' : 'You are the catsitter'}</div>
        <div class="rc-keys">${cat
          ? `${kc('LMB')}<span>Swipe</span>${kc('Space')}<span>Jump</span>${kc('E')}<span>Paw</span>`
          : `${kc('LMB')}<span>Spray</span>${kc('E')}<span>Grab</span>${kc('R')}<span>Clap</span>`}</div>
        <div class="rc-line">${cat ? 'Get it to 100% before the owners are home.' : 'Keep it under 100% until the owners are home.'}</div>
        <div class="rc-count${cd === 'Go' ? ' go' : ''}">${cd}</div></div>`;
      this.roleCard.classList.add('show');
    });

    // role panel
    this.set('panel', this.panelHtml(me), (v) => { this.panel.innerHTML = v; });
    this.set('panelHide', String(extras.stripOpen), (v) => this.panel.classList.toggle('hidden', v === 'true'));

    // prompt
    const p = me.prompt;
    const working = me.work;
    const label = working ? working.label : p ? p.label : '';
    const ok = working ? true : !!p?.ok;
    const showPrompt = !!label && snap.phase === 'playing' && !extras.mgOpen && !me.forced;
    this.set('prompt', `${showPrompt}|${label}|${ok}|${p?.hold}`, () => {
      this.prompt.style.display = showPrompt ? 'flex' : 'none';
      (this.prompt.querySelector('.label') as HTMLElement).textContent = label;
      this.prompt.classList.toggle('disabled', !ok);
      this.prompt.classList.toggle('tap', !!p && !p.hold && !working);
    });
    const prog = working ? working.progress : p?.progress ?? 0;
    this.set('ring', prog.toFixed(3), () => {
      (this.prompt.querySelector('.ring') as SVGCircleElement).style.strokeDashoffset = String(119.4 * (1 - prog));
    });

    // mash bar: only a fallback when the escape strip could not open
    let mash = '';
    if (!extras.stripOpen && !extras.mgOpen) {
      if (me.grabbedBy) mash = me.st.limp ? 'Scruffed' : 'A / D to wiggle';
      else if (me.st.caged) mash = `Time-out ${Math.ceil(me.st.caged)} s. A / D to rattle the door.`;
      else if (me.st.hypnotized) mash = 'A / D to look away';
      else if (me.st.fight) mash = 'Space';
    }
    this.set('mash', mash, (v) => { this.mash.style.display = v ? 'block' : 'none'; this.mash.innerHTML = `<div class="mash-label">${esc(v)}</div><div class="bar"><i></i></div>`; });
    if (mash) (this.mash.querySelector('i') as HTMLElement).style.width = `${Math.round(me.mash * 100)}%`;

    this.crosshair.style.display = role === 'sitter' && extras.locked && snap.phase === 'playing' ? 'block' : 'none';
    this.set('lock', String(!extras.locked && !extras.mgOpen && !extras.ended && snap.phase === 'playing'), (v) => this.lockHint.classList.toggle('show', v === 'true'));

    // to-do list (cats), alerts (sitter)
    const showTodo = role === 'cat' && !extras.mgOpen && snap.phase !== 'ended';
    this.set('todoShow', String(showTodo), (v) => this.todo.classList.toggle('show', v === 'true'));
    if (role === 'cat') {
      for (const [k, e] of this.todoEls) {
        const done = !!this.world[`done.${k}`];
        this.set(`todo.${k}`, `${done}|${this.spotRoom.get(k) === extras.room}`, () => {
          e.classList.toggle('done', done);
          e.classList.toggle('here', !done && !!extras.room && this.spotRoom.get(k) === extras.room);
        });
      }
    }
    this.updateAlerts(role === 'sitter' && snap.phase === 'playing' ? snap.alerts : [], me, cam, camYaw);
    this.updateTags(snap, me, cam, extras.heads, role === 'sitter' && extras.dark);

    // scoreboard
    this.board.style.display = extras.tab ? 'block' : 'none';
    if (extras.tab) this.set('board', this.boardHtml(snap), (v) => { this.board.innerHTML = v; });
  }

  private panelHtml(me: CharState): string {
    if (me.role === 'sitter') {
      const max = Math.max(this.ammoMax, me.ammo);
      const drops = Array.from({ length: max }, (_, i) => `<i class="${i < me.ammo ? 'on' : ''}"></i>`).join('');
      const tvCd = Math.ceil(Number(this.world['tv.cd'] ?? 0));
      const cd = (v: number | undefined) => { const s = Math.ceil(v ?? 0); return s > 0 ? `<span class="cd">${s} s</span>` : '<span class="ready">Ready</span>'; };
      const held = me.holding ? this.roster.find((r) => r.id === me.holding)?.name ?? 'a cat' : '';
      return `<div class="pn-title">Catsitter</div>
        <div class="row"><span class="lbl">${kc('LMB')} Spray</span><span class="drops">${drops}</span></div>
        <div class="row"><span class="lbl">${kc('R')} Clap</span>${cd(me.cd.clap)}</div>
        <div class="row"><span class="lbl">${kc('Q')} Treats</span>${cd(me.cd.treats)}</div>
        <div class="row"><span class="lbl">Cat TV</span>${cd(tvCd)}</div>
        ${held ? `<div class="hint">Holding ${esc(held)}. ${kc('LMB')} toss, carrier in the kitchen.</div>` : ''}`;
    }
    const buffs = BUFFS.filter(([k]) => (me.st[k] ?? 0) > 0).map(([k, n, tone]) => `<span class="chip ${tone}">${n} ${Math.ceil(me.st[k] ?? 0)}</span>`).join('');
    const poop = Math.round(me.poop * 100);
    return `<div class="pn-title">${esc(me.name)}</div>
      <div class="row"><span class="lbl">Zoomies</span><span class="bar"><i style="width:${Math.round(me.stamina * 100)}%"></i></span></div>
      <div class="row"><span class="lbl">Litter</span><span class="bar ${poop >= 100 ? 'urgent' : ''}"><i class="poop" style="width:${poop}%"></i></span></div>
      ${me.poop >= 1 ? '<div class="hint">Litter box. Bathroom. Now.</div>' : ''}
      ${buffs ? `<div class="chips">${buffs}</div>` : ''}`;
  }

  private boardHtml(snap: Snapshot): string {
    const rows = snap.chars.map((c) => `<tr class="${c.id === this.myId ? 'me' : ''}"><td>${esc(c.name)}${c.bot ? ' <small>bot</small>' : ''}</td><td>${c.role === 'sitter' ? 'Sitter' : 'Cat'}</td></tr>`).join('');
    return `<div class="board-title">Keep it under 100% until the owners are home.</div><table>${rows}</table>`;
  }

  private updateAlerts(alerts: Alert[], me: CharState, cam: THREE.PerspectiveCamera, camYaw: number) {
    const sig = alerts.map((a) => `${a.id}|${a.label}|${a.roomName}|${a.progress !== undefined}`).join(',');
    this.set('alerts', sig, () => {
      this.alerts.innerHTML = alerts.map((a) => `<div class="alert" data-id="${esc(a.id)}">${a.progress !== undefined
        ? `<svg class="aring" viewBox="0 0 24 24"><circle class="bg" cx="12" cy="12" r="9"/><circle class="fg" cx="12" cy="12" r="9" stroke-dasharray="${RING.toFixed(2)}"/></svg>` : ''}<span class="arrow">&#10148;</span><b>${esc(a.label)}</b><span class="room">${esc(a.roomName)}</span></div>`).join('');
    });
    for (const a of alerts) {
      const row = this.alerts.querySelector(`[data-id="${CSS.escape(a.id)}"]`) as HTMLElement | null;
      if (!row) continue;
      const ang = Math.atan2(a.p[0] - me.p[0], a.p[2] - me.p[2]) - camYaw;
      (row.querySelector('.arrow') as HTMLElement).style.transform = `rotate(${(-ang * 180) / Math.PI - 90}deg)`;
      if (a.progress !== undefined) this.set(`ar.${a.id}`, a.progress.toFixed(2), () => {
        (row.querySelector('.fg') as SVGCircleElement).style.strokeDashoffset = String(RING * (1 - Math.min(1, a.progress!)));
      });
    }
    // through-wall markers
    const seen = new Set<string>();
    const w = window.innerWidth, h = window.innerHeight;
    for (const a of alerts) {
      seen.add(a.id);
      let m = this.markerEls.get(a.id);
      if (!m) { m = el('div', 'marker', '<i></i>'); this.markers.appendChild(m); this.markerEls.set(a.id, m); }
      _p.set(a.p[0], a.p[1] + 0.6, a.p[2]).project(cam);
      const behind = _p.z > 1;
      let x = (_p.x * 0.5 + 0.5) * w, y = (-_p.y * 0.5 + 0.5) * h;
      if (behind) { x = w - x; y = h - 40; }
      x = Math.max(30, Math.min(w - 30, x));
      y = Math.max(80, Math.min(h - 30, y));
      m.style.transform = `translate(${x}px, ${y}px)`;
    }
    for (const [id, m] of this.markerEls) if (!seen.has(id)) { m.remove(); this.markerEls.delete(id); }
  }

  private updateTags(snap: Snapshot, me: CharState, cam: THREE.PerspectiveCamera, heads: Map<string, THREE.Vector3>, hideCats: boolean) {
    const w = window.innerWidth, h = window.innerHeight;
    for (const c of snap.chars) {
      let t = this.tagEls.get(c.id);
      if (!t) { t = el('div', `tag ${c.role}`); t.textContent = c.name; this.tags.appendChild(t); this.tagEls.set(c.id, t); }
      const head = heads.get(c.id);
      const hidden = c.id === me.id || !head || (hideCats && c.role === 'cat') || !!c.st.hidden || snap.phase === 'ended';
      if (hidden) { t.style.display = 'none'; continue; }
      _p.copy(head).project(cam);
      const d = cam.position.distanceTo(head);
      if (_p.z > 1 || d > 14) { t.style.display = 'none'; continue; }
      t.style.display = 'block';
      t.style.transform = `translate(-50%, -100%) translate(${(_p.x * 0.5 + 0.5) * w}px, ${(-_p.y * 0.5 + 0.5) * h}px)`;
      t.style.opacity = String(Math.max(0.25, 1 - d / 14));
    }
  }

  toast(text: string, tone: 'good' | 'bad' | 'info' = 'info') {
    const t = el('div', `toast ${tone}`);
    t.textContent = text;
    this.toasts.prepend(t);
    while (this.toasts.children.length > 4) this.toasts.lastElementChild?.remove();
    setTimeout(() => t.classList.add('out'), 2800);
    setTimeout(() => t.remove(), 3400);
  }

  popup(text: string, color?: string) {
    const p = el('div', 'popup');
    p.textContent = text;
    if (color) p.style.color = color;
    this.popups.appendChild(p);
    setTimeout(() => p.remove(), 1700);
  }

  dispose() { this.root.remove(); }
}
const _p = new THREE.Vector3();
