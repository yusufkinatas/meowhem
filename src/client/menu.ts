/** DOM menus: loading, title (name, cat look, modes), join, lobby. */
import type { CatLook, Role, SoundName } from '../shared/contracts';
import { CFG } from '../config';
import type { Difficulty, LobbyState } from '../core/types';
import { COAT_PRESETS, EYE_COLORS, PATTERNS, bindSettings, settingsHtml, type Profile } from '../core/profile';
import { CAT_ACCESSORIES } from '../registry';
import { CatPreview } from './catPreview';

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
  readonly preview = new CatPreview();
  sfx: ((n: SoundName) => void) | null = null;

  constructor(parent: HTMLElement, private profile: Profile, private onProfile: (p: Profile) => void) {
    this.root.className = 'menu';
    parent.appendChild(this.root);
    this.preview.onMeow = () => this.sfx?.('mrrp');
  }

  hide() { this.root.style.display = 'none'; this.root.innerHTML = ''; }
  private show(html: string) { this.root.style.display = 'flex'; this.root.innerHTML = html; }

  loading(p: number, text = 'Tidying up the house') {
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
    const accs = CAT_ACCESSORIES.length ? CAT_ACCESSORIES : (['none'] as CatLook['accessory'][]);
    if (!accs.includes(p.look.accessory)) p.look = { ...p.look, accessory: 'none' };
    const coats = COAT_PRESETS.map((c, i) => `<button class="swatch ${c.fur === p.look.furColor ? 'on' : ''}" data-coat="${i}" title="${c.name}" aria-label="${c.name}" style="--a:${c.fur};--b:${c.sec}"></button>`).join('');
    const pats = PATTERNS.map((x) => `<button class="chip-btn ${x === p.look.pattern ? 'on' : ''}" data-pat="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('');
    const eyes = EYE_COLORS.map((x) => `<button class="swatch eye ${x === p.look.eyeColor ? 'on' : ''}" data-eye="${x}" aria-label="Eyes" style="--a:${x};--b:${x}"></button>`).join('');
    const accHtml = accs.map((x) => `<button class="chip-btn ${x === p.look.accessory ? 'on' : ''}" data-acc="${x}">${ACC_NAMES[x] ?? x}</button>`).join('');
    const diffs = DIFF.map(([v, n]) => `<option value="${v}" ${v === this.solo.difficulty ? 'selected' : ''}>${n}</option>`).join('');
    const lens = CFG.round.options.map((s) => `<option value="${s}" ${s === this.solo.seconds ? 'selected' : ''}>${s / 60} min</option>`).join('');
    const k = (x: string) => `<kbd class="cap${x.length > 2 ? ' wide' : ''}">${x}</kbd>`;
    this.show(`<div class="card title">
      <div class="title-head"><div class="logo">MEOWHEM</div>
      <div class="tagline">One catsitter. Up to four cats. The owners are on their way.</div></div>
      <div class="cols three">
        <div class="col pv-col"><div class="preview-box"><div class="pv-host"></div><div class="pv-tip">Drag to turn</div></div>
          <label>Name<input id="m-name" maxlength="16" placeholder="Mochi" value="${esc(p.name)}"></label></div>
        <div class="col opts">
          <div class="opt"><span class="opt-l">Coat</span><div class="swatches">${coats}</div></div>
          <div class="opt"><span class="opt-l">Pattern</span><div class="chip-row">${pats}</div></div>
          <div class="opt"><span class="opt-l">Eyes</span><div class="swatches">${eyes}</div></div>
          ${accs.length > 1 ? `<div class="opt"><span class="opt-l">Wearing</span><div class="chip-row">${accHtml}</div></div>` : ''}
          <div class="opt"><span class="opt-l">Build</span><div class="build"><span>Slim</span><input id="m-chonk" type="range" min="0" max="1" step="0.1" value="${p.look.chonk}"><span>Round</span></div></div>
        </div>
        <div class="col play">
          <button class="btn big primary" data-a="soloCat"><b>Play as a cat</b><small>Against a bot catsitter</small></button>
          <button class="btn big" data-a="soloSitter"><b>Play as the catsitter</b><small>Against bot cats</small></button>
          <div class="pair small"><label>Bots<select id="m-diff">${diffs}</select></label><label>Round<select id="m-len">${lens}</select></label></div>
          <div class="sep"></div>
          <button class="btn big" data-a="host"><b>Host online game</b><small>Up to five friends</small></button>
          <div class="join"><input id="m-code" maxlength="4" placeholder="CODE" autocomplete="off"><button class="btn" data-a="join">Join</button></div>
        </div>
      </div>
      <div class="controls-hint">
        <div><span class="who">Cat</span>${k('WASD')} move ${k('Shift')} zoom ${k('Space')} jump, hold to pounce ${k('LMB')} swipe ${k('E')} paw ${k('Q')} meow ${k('R')} hiss, hold for a hairball ${k('F')} loaf</div>
        <div><span class="who">Sitter</span>${k('LMB')} spray, or throw a held cat ${k('E')} grab, clean ${k('R')} clap ${k('Q')} treats</div>
        ${settingsHtml()}
      </div>
    </div>`);
    const $ = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    bindSettings(this.root);
    this.preview.mount($('.pv-host'), { ...p.look, name: p.name || 'Cat' });
    const save = (poke = false) => {
      p.name = $<HTMLInputElement>('#m-name').value.trim().slice(0, 16);
      p.look = { ...p.look, name: p.name || 'Cat', chonk: Number($<HTMLInputElement>('#m-chonk').value) };
      this.solo.difficulty = $<HTMLSelectElement>('#m-diff').value as Difficulty;
      this.solo.seconds = Number($<HTMLSelectElement>('#m-len').value);
      this.onProfile(p);
      if (poke) this.preview.setLook(p.look);
    };
    this.root.querySelectorAll('input[id],select').forEach((x) => x.addEventListener('change', () => save(x.id === 'm-chonk')));
    $<HTMLInputElement>('#m-chonk').addEventListener('input', () => save(true));
    $<HTMLInputElement>('#m-code').addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      t.value = t.value.toUpperCase().replace(/[^A-Z]/g, '');
    });
    $<HTMLInputElement>('#m-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') { save(); h.join($<HTMLInputElement>('#m-code').value); } });
    const pickIn = (attr: string, apply: (v: string) => void) => this.root.querySelectorAll<HTMLButtonElement>(`[data-${attr}]`).forEach((b) => b.addEventListener('click', () => {
      apply(b.dataset[attr]!);
      this.root.querySelectorAll(`[data-${attr}]`).forEach((x) => x.classList.toggle('on', x === b));
      this.sfx?.('uiClick');
      save(true);
    }));
    pickIn('coat', (v) => { const c = COAT_PRESETS[Number(v)]; p.look = { ...p.look, furColor: c.fur, secondaryColor: c.sec }; });
    pickIn('pat', (v) => { p.look = { ...p.look, pattern: v as CatLook['pattern'] }; });
    pickIn('eye', (v) => { p.look = { ...p.look, eyeColor: v }; });
    pickIn('acc', (v) => { p.look = { ...p.look, accessory: v as CatLook['accessory'] }; });
    this.root.querySelector('.play')!.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (!a) return;
      save();
      this.sfx?.('uiClick');
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
    const row = (name: string, role: string, tags: string, look?: CatLook) => `<div class="player ${role}"><span class="badge">${role === 'sitter' ? 'Sitter' : 'Cat'}</span>${look ? `<span class="coat-dot" style="--a:${look.furColor};--b:${look.secondaryColor}"></span>` : ''}<span class="pname">${esc(name)}</span>${tags}</div>`;
    const tag = (id: string) => `${id === myId ? '<small class="you">you</small>' : ''}${id === l.hostId ? '<small>host</small>' : ''}`;
    let list = sitter ? row(sitter.name, 'sitter', tag(sitter.id)) : row('Bot sitter', 'sitter', '<small>bot</small>');
    list += cats.map((p) => row(p.name, 'cat', tag(p.id), p.look)).join('');
    for (let i = cats.length; i < 4; i++) list += l.fillBots ? row('Bot cat', 'cat bot', '<small>bot</small>') : `<div class="player empty">Empty</div>`;
    const dis = isHost ? '' : 'disabled';
    const diffs = DIFF.map(([v, n]) => `<option value="${v}" ${v === l.botDifficulty ? 'selected' : ''}>${n}</option>`).join('');
    const lens = CFG.round.options.map((s) => `<option value="${s}" ${s === l.roundSeconds ? 'selected' : ''}>${s / 60} min</option>`).join('');
    this.show(`<div class="card lobby">
      <div class="logo small">MEOWHEM</div>
      <div class="code-row"><div><div class="lbl">Room code</div><div class="code">${esc(l.code)}</div><div class="code-hint">Friends type this under Join on the title screen.</div></div><button class="btn" data-a="copy">Copy</button></div>
      <div class="cols">
        <div class="col"><div class="players">${list}</div>
          <div class="pair"><button class="btn ${me?.role === 'sitter' ? 'primary' : ''}" data-a="sitter">Play as Sitter</button><button class="btn ${me?.role === 'cat' ? 'primary' : ''}" data-a="cat">Play as Cat</button></div>
        </div>
        <div class="col">
          <label class="check"><input type="checkbox" id="l-fill" ${l.fillBots ? 'checked' : ''} ${dis}> Fill empty cat slots with bots</label>
          <label>Bot difficulty<select id="l-diff" ${dis}>${diffs}</select></label>
          <label>Round length<select id="l-len" ${dis}>${lens}</select></label>
          ${isHost ? '<button class="btn big primary" data-a="start">Start</button>' : '<div class="wait">Waiting for the host to start</div>'}
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
