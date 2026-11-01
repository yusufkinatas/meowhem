/** DOM HUD overlay. Touches the DOM only when values change. */
import * as THREE from 'three';
import type { Role } from '../shared/contracts';
import { CFG } from '../config';
import type { Alert, CharState, PlayerInfo, Results, Snapshot, Stats } from '../core/types';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

const BUFFS: [keyof CharState['st'], string, string][] = [
  ['fed', 'Fed', 'good'], ['catnip', 'Catnip', 'good'], ['zoomies', 'Zoomies', 'good'], ['focused', 'Focused', 'good'],
  ['crown', 'Champion', 'good'], ['wet', 'Wet', 'bad'], ['dizzy', 'Dizzy', 'bad'], ['grabImmune', 'Slippery', 'good'],
];

export class Hud {
  readonly root = el('div', 'hud');
  readonly mgRoot = el('div', 'mg-root');
  private meterFill = el('div', 'meter-fill');
  private meterText = el('div', 'meter-text');
  private meter = el('div', 'meter');
  private timer = el('div', 'timer');
  private panel = el('div', 'panel');
  private alerts = el('div', 'alerts');
  private markers = el('div', 'markers');
  private tags = el('div', 'tags');
  private prompt = el('div', 'prompt');
  private toasts = el('div', 'toasts');
  private popups = el('div', 'popups');
  private mash = el('div', 'mash');
  private countdown = el('div', 'countdown');
  private crosshair = el('div', 'crosshair');
  private board = el('div', 'board');
  readonly lockHint = el('div', 'lockhint');
  private end = el('div', 'endscreen');
  private cache = new Map<string, string>();
  private lastMeter = 0;
  private lastPhase = '';
  private goUntil = 0;
  private markerEls = new Map<string, HTMLElement>();
  private tagEls = new Map<string, HTMLElement>();
  onLeave: (() => void) | null = null;
  onAgain: (() => void) | null = null;
  onResume: (() => void) | null = null;

  constructor(parent: HTMLElement, private roster: PlayerInfo[], private myId: string) {
    this.meter.append(this.meterFill, el('div', 'meter-ticks', '<i></i><i></i><i></i>'), this.meterText);
    const top = el('div', 'hud-top');
    top.append(this.meter, this.timer);
    this.prompt.innerHTML = `<div class="key"><svg viewBox="0 0 44 44"><circle class="ring-bg" cx="22" cy="22" r="19"/><circle class="ring" cx="22" cy="22" r="19"/></svg><span>E</span></div><div class="label"></div>`;
    this.lockHint.innerHTML = `<div class="card"><div class="lh-title">Paused</div><div class="lh-sub">Click to look around. Esc frees the mouse.</div><div class="row"><button class="btn primary" data-a="resume">Resume</button><button class="btn" data-a="leave">Leave game</button></div></div>`;
    this.lockHint.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (a === 'leave') this.onLeave?.();
      else if (a === 'resume' || e.target === this.lockHint) this.onResume?.();
    });
    this.root.append(this.tags, this.markers, top, this.panel, this.alerts, this.prompt, this.toasts, this.popups, this.mash,
      this.countdown, this.crosshair, this.board, this.mgRoot, this.lockHint, this.end);
    parent.appendChild(this.root);
  }

  private set(key: string, v: string, apply: (v: string) => void) {
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    apply(v);
  }

  update(snap: Snapshot, me: CharState, cam: THREE.PerspectiveCamera, camYaw: number, extras: { work: number; locked: boolean; mgOpen: boolean; tab: boolean; ended: boolean; dark: boolean; heads: Map<string, THREE.Vector3> }) {
    const role: Role = me.role;
    // meter
    const m = Math.round(snap.meter);
    this.set('meter', String(m), () => {
      this.meterFill.style.width = `${Math.min(100, snap.meter)}%`;
      this.meterFill.style.background = m < 40 ? 'var(--mess-low)' : m < 75 ? 'var(--mess-mid)' : 'var(--mess-high)';
      this.meterText.innerHTML = `MESS <b>${m}%</b>`;
      if (m > this.lastMeter) { this.meter.classList.remove('bump'); void this.meter.offsetWidth; this.meter.classList.add('bump'); }
      this.meter.classList.toggle('danger', m >= 75);
      this.lastMeter = m;
    });
    this.set('timer', mmss(snap.timeLeft), (v) => { this.timer.textContent = v; this.timer.classList.toggle('low', snap.timeLeft < 60); });

    // countdown
    if (snap.phase === 'playing' && this.lastPhase === 'countdown') this.goUntil = performance.now() + 800;
    this.lastPhase = snap.phase;
    const cd = snap.phase === 'countdown' ? String(Math.max(1, Math.ceil(snap.countdown))) : performance.now() < this.goUntil ? 'GO!' : '';
    this.set('cd', cd, (v) => { this.countdown.textContent = v; this.countdown.style.display = v ? 'block' : 'none'; });

    // role panel
    this.set('panel', this.panelHtml(me, snap), (v) => { this.panel.innerHTML = v; });

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

    // mash bar
    let mash = '';
    if (me.grabbedBy) mash = me.st.limp ? 'Scruffed. Going limp...' : 'Wiggle free! Mash SPACE';
    else if (me.st.caged) mash = `Time-out ${Math.ceil(me.st.caged)} s. Mash SPACE to rattle`;
    else if (me.st.hypnotized) mash = 'Hypnotized. Mash SPACE to snap out';
    else if (me.st.fight && !extras.mgOpen) mash = 'FIGHT! Mash SPACE';
    this.set('mash', mash, (v) => { this.mash.style.display = v ? 'block' : 'none'; this.mash.innerHTML = `<div class="mash-label">${esc(v)}</div><div class="bar"><i></i></div>`; });
    if (mash) (this.mash.querySelector('i') as HTMLElement).style.width = `${Math.round(me.mash * 100)}%`;

    this.crosshair.style.display = role === 'sitter' && extras.locked && snap.phase === 'playing' ? 'block' : 'none';
    this.set('lock', String(!extras.locked && !extras.mgOpen && !extras.ended && snap.phase !== 'ended'), (v) => this.lockHint.classList.toggle('show', v === 'true'));

    // alerts (sitter)
    this.updateAlerts(role === 'sitter' ? snap.alerts : [], me, cam, camYaw);
    this.updateTags(snap, me, cam, extras.heads, role === 'sitter' && extras.dark);

    // scoreboard
    this.board.style.display = extras.tab ? 'block' : 'none';
    if (extras.tab) this.set('board', this.boardHtml(snap), (v) => { this.board.innerHTML = v; });
  }

  private panelHtml(me: CharState, snap: Snapshot): string {
    if (me.role === 'sitter') {
      const drops = Array.from({ length: CFG.spray.ammo }, (_, i) => `<i class="${i < me.ammo ? 'on' : ''}"></i>`).join('');
      const tvCd = Number(this.world['tv.cd'] ?? 0);
      const treat = Math.ceil(me.cd.treats ?? 0);
      const held = me.holding ? this.roster.find((r) => r.id === me.holding)?.name ?? 'a cat' : '';
      return `<div class="pn-title">Catsitter</div>
        <div class="row"><span class="lbl">Spray</span><span class="drops">${drops}</span></div>
        <div class="row"><span class="lbl">Treats <kbd>Q</kbd></span><span class="${treat ? 'cd' : 'ready'}">${treat ? `${treat} s` : 'ready'}</span></div>
        <div class="row"><span class="lbl">Cat TV</span><span class="${tvCd ? 'cd' : 'ready'}">${tvCd ? `${tvCd} s` : 'ready'}</span></div>
        ${held ? `<div class="hint">Holding ${esc(held)}. Carrier in the kitchen = time-out.</div>` : ''}`;
    }
    const buffs = BUFFS.filter(([k]) => (me.st[k] ?? 0) > 0).map(([k, n, tone]) => `<span class="chip ${tone}">${n}</span>`).join('');
    const poop = Math.round(me.poop * 100);
    return `<div class="pn-title">${esc(me.name)}</div>
      <div class="row"><span class="lbl">Zoomies</span><span class="bar"><i style="width:${Math.round(me.stamina * 100)}%"></i></span></div>
      <div class="row"><span class="lbl">Litter</span><span class="bar ${poop >= 100 ? 'urgent' : ''}"><i class="poop" style="width:${poop}%"></i></span></div>
      ${me.poop >= 1 ? '<div class="hint">Gotta go. Litter box is in the bathroom.</div>' : ''}
      ${buffs ? `<div class="chips">${buffs}</div>` : ''}`;
  }

  /** client's current world keys (set by the client) */
  world: Record<string, unknown> = {};

  private boardHtml(snap: Snapshot): string {
    const rows = snap.chars.map((c) => `<tr class="${c.id === this.myId ? 'me' : ''}"><td>${esc(c.name)}${c.bot ? ' <small>bot</small>' : ''}</td><td>${c.role === 'sitter' ? 'Sitter' : 'Cat'}</td></tr>`).join('');
    return `<div class="board-title">House rules: keep it under 100% until the owners are home.</div><table>${rows}</table>`;
  }

  private updateAlerts(alerts: Alert[], me: CharState, cam: THREE.PerspectiveCamera, camYaw: number) {
    const sig = alerts.map((a) => `${a.id}|${a.label}|${a.roomName}`).join(',');
    this.set('alerts', sig, () => {
      this.alerts.innerHTML = alerts.map((a) => `<div class="alert" data-id="${esc(a.id)}"><span class="arrow">&#10148;</span><b>${esc(a.label)}</b><span class="room">${esc(a.roomName)}</span></div>`).join('');
    });
    for (const a of alerts) {
      const row = this.alerts.querySelector(`[data-id="${CSS.escape(a.id)}"] .arrow`) as HTMLElement | null;
      if (row) {
        const ang = Math.atan2(a.p[0] - me.p[0], a.p[2] - me.p[2]) - camYaw;
        row.style.transform = `rotate(${(-ang * 180) / Math.PI - 90}deg)`;
      }
    }
    // through-wall markers
    const seen = new Set<string>();
    const w = window.innerWidth, h = window.innerHeight;
    for (const a of alerts) {
      seen.add(a.id);
      let m = this.markerEls.get(a.id);
      if (!m) { m = el('div', 'marker', '<i></i>'); this.markers.appendChild(m); this.markerEls.set(a.id, m); }
      const v = new THREE.Vector3(a.p[0], a.p[1] + 0.6, a.p[2]).project(cam);
      const behind = v.z > 1;
      let x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
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
      const v = head.clone().project(cam);
      const d = cam.position.distanceTo(head);
      if (v.z > 1 || d > 14) { t.style.display = 'none'; continue; }
      t.style.display = 'block';
      t.style.transform = `translate(-50%, -100%) translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px)`;
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

  showResults(r: Results, isHost: boolean, myRole: Role) {
    const won = r.winner === myRole;
    const awards = r.awards.map((a) => `<div class="award"><div class="aw-title">${esc(a.title)}</div><div class="aw-name">${esc(a.name)}</div><div class="aw-desc">${esc(a.desc)}</div></div>`).join('');
    const statsRow = (s: Stats, role: Role) => role === 'sitter'
      ? `${s.cleaned + s.tidied} cleaned &middot; ${s.catsGrabbed} grabbed &middot; ${s.sprayHits} sprayed`
      : `${Math.round(s.messCaused)} mess &middot; ${s.knocked} knocked &middot; ${s.poops} poops`;
    const players = r.players.map((p) => `<tr><td>${esc(p.name)}${p.bot ? ' <small>bot</small>' : ''}</td><td>${p.role === 'sitter' ? 'Sitter' : 'Cat'}</td><td>${statsRow(p.stats, p.role)}</td></tr>`).join('');
    this.end.innerHTML = `<div class="end-card ${r.winner}">
      <div class="end-kicker">${r.winner === 'cat' ? 'Cats win' : 'Sitter wins'} &middot; ${won ? 'you won' : 'you lost'}</div>
      <h1>${esc(r.headline)}</h1>
      <div class="end-sub">${esc(r.sub)}</div>
      <div class="end-meter"><div style="width:${r.meter}%"></div><span>${r.meter}% mess</span></div>
      <div class="awards">${awards || '<div class="aw-none">No awards. Nobody did anything remarkable.</div>'}</div>
      <table class="end-players">${players}</table>
      <div class="row">${isHost ? '<button class="btn primary" data-a="again">Play again</button>' : '<span class="wait">Waiting for the host...</span>'}<button class="btn" data-a="leave">Back to menu</button></div>
    </div>`;
    this.end.classList.add('show');
    this.end.onclick = (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (a === 'again') this.onAgain?.();
      if (a === 'leave') this.onLeave?.();
    };
  }

  dispose() { this.root.remove(); }
}
