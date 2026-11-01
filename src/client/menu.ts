/** DOM menus: loading, title (name, cat look, modes), join, lobby. */
import type { CatLook, Role } from '../shared/contracts';
import { CFG } from '../config';
import type { Difficulty, LobbyState } from '../core/types';
import { ACCESSORIES, COAT_PRESETS, PATTERNS, type Profile } from '../core/profile';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const ACC_NAMES: Record<string, string> = { none: 'Nothing', bell: 'Bell collar', bow: 'Bow', bandana: 'Bandana', tinyHat: 'Tiny hat', glasses: 'Glasses', flowerCrown: 'Flower crown', cone: 'The cone' };
const DIFF: [Difficulty, string][] = [['kitten', 'Kitten'], ['houseCat', 'House Cat'], ['feral', 'Feral']];

export interface TitleHandlers {
  soloSitter(): void;
  soloCat(): void;
  host(): void;
  join(code: string): void;
}

export interface LobbyHandlers {
  role(r: Role): void;
  options(o: Partial<Pick<LobbyState, 'fillBots' | 'botDifficulty' | 'roundSeconds'>>): void;
  start(): void;
  leave(): void;
}

export class Menu {
  readonly root = document.createElement('div');
  solo = { difficulty: 'houseCat' as Difficulty, seconds: CFG.round.seconds as number };

  constructor(parent: HTMLElement, private profile: Profile, private onProfile: (p: Profile) => void) {
    this.root.className = 'menu';
    parent.appendChild(this.root);
  }

  hide() { this.root.style.display = 'none'; this.root.innerHTML = ''; }
  private show(html: string) { this.root.style.display = 'flex'; this.root.innerHTML = html; }

  loading(p: number, text = 'Tidying up the house...') {
    if (!this.root.querySelector('.loading')) {
      this.show(`<div class="card loading"><div class="logo">MEOWHEM</div><div class="bar"><i></i></div><div class="sub"></div></div>`);
    }
    (this.root.querySelector('.loading .bar i') as HTMLElement).style.width = `${Math.round(p * 100)}%`;
    (this.root.querySelector('.loading .sub') as HTMLElement).textContent = text;
  }

  message(title: string, sub: string) {
    this.show(`<div class="card"><div class="logo small">MEOWHEM</div><h2>${esc(title)}</h2><p class="sub">${esc(sub)}</p></div>`);
  }

  error(msg: string) {
    const e = document.createElement('div');
    e.className = 'menu-error';
    e.textContent = msg;
    document.body.appendChild(e);
    setTimeout(() => e.remove(), 4500);
  }

  title(h: TitleHandlers) {
    const p = this.profile;
    const coats = COAT_PRESETS.map((c, i) => `<button class="swatch ${c.fur === p.look.furColor ? 'on' : ''}" data-coat="${i}" title="${c.name}" style="--a:${c.fur};--b:${c.sec}"></button>`).join('');
    const pats = PATTERNS.map((x) => `<option value="${x}" ${x === p.look.pattern ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('');
    const accs = ACCESSORIES.map((x) => `<option value="${x}" ${x === p.look.accessory ? 'selected' : ''}>${ACC_NAMES[x]}</option>`).join('');
    const diffs = DIFF.map(([v, n]) => `<option value="${v}" ${v === this.solo.difficulty ? 'selected' : ''}>${n}</option>`).join('');
    const lens = CFG.round.options.map((s) => `<option value="${s}" ${s === this.solo.seconds ? 'selected' : ''}>${s / 60} min</option>`).join('');
    this.show(`<div class="card title">
      <div class="logo">MEOWHEM</div>
      <div class="tagline">One catsitter. Up to four cats. The owners are on their way.</div>
      <div class="cols">
        <div class="col">
          <label>Your name<input id="m-name" maxlength="16" placeholder="Mochi" value="${esc(p.name)}"></label>
          <label>Coat</label><div class="swatches">${coats}</div>
          <div class="pair"><label>Pattern<select id="m-pattern">${pats}</select></label>
          <label>Accessory<select id="m-acc">${accs}</select></label></div>
        </div>
        <div class="col">
          <button class="btn big primary" data-a="soloSitter">Solo: Catsitter vs bot cats</button>
          <button class="btn big" data-a="soloCat">Solo: Cat vs bot sitter</button>
          <div class="pair small"><label>Bots<select id="m-diff">${diffs}</select></label><label>Round<select id="m-len">${lens}</select></label></div>
          <div class="sep"></div>
          <button class="btn big" data-a="host">Host online game</button>
          <div class="join"><input id="m-code" maxlength="4" placeholder="CODE" autocomplete="off"><button class="btn" data-a="join">Join</button></div>
        </div>
      </div>
      <div class="controls-hint">WASD move &middot; Shift sprint &middot; Space jump (hold to pounce) &middot; Mouse click swipe / spray &middot; E interact &middot; Q meow / treats &middot; R hiss &middot; F loaf</div>
    </div>`);
    const $ = <T extends HTMLElement>(s: string) => this.root.querySelector(s) as T;
    const save = () => {
      p.name = $<HTMLInputElement>('#m-name').value.trim().slice(0, 16);
      p.look = { ...p.look, name: p.name || 'Cat', pattern: $<HTMLSelectElement>('#m-pattern').value as CatLook['pattern'], accessory: $<HTMLSelectElement>('#m-acc').value as CatLook['accessory'] };
      this.solo.difficulty = $<HTMLSelectElement>('#m-diff').value as Difficulty;
      this.solo.seconds = Number($<HTMLSelectElement>('#m-len').value);
      this.onProfile(p);
    };
    this.root.querySelectorAll('input,select').forEach((x) => x.addEventListener('change', save));
    $<HTMLInputElement>('#m-code').addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      t.value = t.value.toUpperCase().replace(/[^A-Z]/g, '');
    });
    $<HTMLInputElement>('#m-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') { save(); h.join($<HTMLInputElement>('#m-code').value); } });
    this.root.querySelectorAll<HTMLButtonElement>('[data-coat]').forEach((b) => b.addEventListener('click', () => {
      const c = COAT_PRESETS[Number(b.dataset.coat)];
      p.look = { ...p.look, furColor: c.fur, secondaryColor: c.sec };
      this.root.querySelectorAll('[data-coat]').forEach((x) => x.classList.toggle('on', x === b));
      save();
    }));
    this.root.querySelector('.cols')!.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (!a) return;
      save();
      if (a === 'soloSitter') h.soloSitter();
      else if (a === 'soloCat') h.soloCat();
      else if (a === 'host') h.host();
      else if (a === 'join') h.join($<HTMLInputElement>('#m-code').value);
    });
  }

  lobby(l: LobbyState, myId: string, h: LobbyHandlers) {
    const isHost = myId === l.hostId;
    const me = l.players.find((p) => p.id === myId);
    const cats = l.players.filter((p) => p.role === 'cat');
    const sitter = l.players.find((p) => p.role === 'sitter');
    const row = (name: string, role: string, tags: string) => `<div class="player ${role}"><span class="badge">${role === 'sitter' ? 'Sitter' : 'Cat'}</span><span class="pname">${esc(name)}</span>${tags}</div>`;
    const tag = (id: string) => `${id === myId ? '<small class="you">you</small>' : ''}${id === l.hostId ? '<small>host</small>' : ''}`;
    let list = sitter ? row(sitter.name, 'sitter', tag(sitter.id)) : row('Bot sitter', 'sitter', '<small>bot</small>');
    list += cats.map((p) => row(p.name, 'cat', tag(p.id))).join('');
    for (let i = cats.length; i < 4; i++) list += l.fillBots ? row('Bot cat', 'cat bot', '<small>bot</small>') : `<div class="player empty">Empty</div>`;
    const dis = isHost ? '' : 'disabled';
    const diffs = DIFF.map(([v, n]) => `<option value="${v}" ${v === l.botDifficulty ? 'selected' : ''}>${n}</option>`).join('');
    const lens = CFG.round.options.map((s) => `<option value="${s}" ${s === l.roundSeconds ? 'selected' : ''}>${s / 60} min</option>`).join('');
    this.show(`<div class="card lobby">
      <div class="logo small">MEOWHEM</div>
      <div class="code-row"><div><div class="lbl">Room code</div><div class="code">${esc(l.code)}</div></div><button class="btn" data-a="copy">Copy</button></div>
      <div class="cols">
        <div class="col"><div class="players">${list}</div>
          <div class="pair"><button class="btn ${me?.role === 'sitter' ? 'primary' : ''}" data-a="sitter">Play as Sitter</button><button class="btn ${me?.role === 'cat' ? 'primary' : ''}" data-a="cat">Play as Cat</button></div>
        </div>
        <div class="col">
          <label class="check"><input type="checkbox" id="l-fill" ${l.fillBots ? 'checked' : ''} ${dis}> Fill empty cat slots with bots</label>
          <label>Bot difficulty<select id="l-diff" ${dis}>${diffs}</select></label>
          <label>Round length<select id="l-len" ${dis}>${lens}</select></label>
          ${isHost ? '<button class="btn big primary" data-a="start">Start</button>' : '<div class="wait">Waiting for the host to start...</div>'}
          <button class="btn" data-a="leave">Leave</button>
        </div>
      </div>
    </div>`);
    const $ = <T extends HTMLElement>(s: string) => this.root.querySelector(s) as T;
    if (isHost) {
      $<HTMLInputElement>('#l-fill').addEventListener('change', (e) => h.options({ fillBots: (e.target as HTMLInputElement).checked }));
      $<HTMLSelectElement>('#l-diff').addEventListener('change', (e) => h.options({ botDifficulty: (e.target as HTMLSelectElement).value as Difficulty }));
      $<HTMLSelectElement>('#l-len').addEventListener('change', (e) => h.options({ roundSeconds: Number((e.target as HTMLSelectElement).value) }));
    }
    this.root.querySelector('.lobby')!.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (a === 'copy') {
        navigator.clipboard?.writeText(l.code).catch(() => {});
        (e.target as HTMLElement).textContent = 'Copied';
      } else if (a === 'sitter' || a === 'cat') h.role(a);
      else if (a === 'start') h.start();
      else if (a === 'leave') h.leave();
    });
  }
}
