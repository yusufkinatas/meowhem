/** Shared bits for the minigame overlays: docked panel / slim strip, danger indicator, sprites, paws, juice. */
import type { MinigameApi, MinigameHost, SoundName } from '../shared/contracts';

/** How the host ended a minigame (see REQUESTS: mgClose done/result). */
export type Finish = 'done' | 'win' | 'lose' | 'off';
/** A minigame instance. `bot` drives the preview's auto-demo, `finish` is called by the host before a delayed close. */
export type Game = MinigameApi & { bot?(dt: number): void; finish?(r: Finish): void };
export interface SoundOpts { pitch?: number; volume?: number }

const urls = import.meta.glob('./assets/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const asset = (name: string): string => urls[`./assets/${name}.svg`] ?? '';

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
export const now = (): number => performance.now() / 1000;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: Element | null, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

/** An art sprite from ./assets (Fluent Emoji, MIT). */
export function img(name: string, cls = '', parent?: Element | null): HTMLImageElement {
  const e = el('img', `mg-sprite ${cls}`, parent);
  e.src = asset(name);
  e.draggable = false;
  e.alt = '';
  return e;
}

export function place<T extends HTMLElement>(e: T, x: number, y: number, w?: number, h?: number): T {
  e.style.left = `${x}px`;
  e.style.top = `${y}px`;
  if (w !== undefined) e.style.width = `${w}px`;
  if (h !== undefined) e.style.height = `${h}px`;
  return e;
}

// ---------------------------------------------------------------- juice (individual `scale` / `translate` props
// so it never fights a positioning `transform`)
export function pop(e: Element, s = 1.25, ms = 240): void {
  e.animate({ scale: ['1', `${s}`, '1'] }, { duration: ms, easing: 'cubic-bezier(.2,1.6,.4,1)' });
}
export function squash(e: Element, ms = 200): void {
  e.animate({ scale: ['1 1', '1.18 0.8', '0.94 1.08', '1 1'] }, { duration: ms, easing: 'ease-out' });
}
export function shake(e: Element, px = 8, ms = 280): void {
  const k = [0, 1, -0.8, 0.6, -0.4, 0.2, 0].map((f, i) => `${f * px * (i % 2 ? 1 : -1)}px ${f * px * 0.4}px`);
  e.animate({ translate: k }, { duration: ms, easing: 'linear' });
}

export interface BurstOpts {
  asset?: string;       // sprite name, or
  cls?: string;         // a texture bit (paper scrap, fur tuft, cardboard crumb)
  n?: number;
  size?: number;
  spread?: number;      // px radius
  up?: number;          // extra upward kick px
  fall?: number;        // gravity drop px
  ms?: number;
  spin?: number;        // deg
}
/** Throwaway particles flying out of (x, y) inside `parent`. */
export function burst(parent: HTMLElement, x: number, y: number, o: BurstOpts = {}): void {
  const n = o.n ?? 6, size = o.size ?? 40, spread = o.spread ?? 90, ms = o.ms ?? 650;
  for (let i = 0; i < n; i++) {
    const e = o.asset ? img(o.asset, 'mg-bit', parent) : el('div', `mg-bit ${o.cls ?? ''}`, parent);
    const s = size * rand(0.7, 1.15);
    place(e, x - s / 2, y - s / 2, s, s);
    const a = rand(0, Math.PI * 2), r = spread * rand(0.5, 1);
    const dx = Math.cos(a) * r, dy = Math.sin(a) * r * 0.7 - (o.up ?? 30);
    const spin = (o.spin ?? 220) * rand(-1, 1);
    e.animate(
      [
        { transform: 'translate(0,0) rotate(0deg) scale(.4)', opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) rotate(${spin * 0.6}deg) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx * 1.2}px,${dy + (o.fall ?? 60)}px) rotate(${spin}deg) scale(.8)`, opacity: 0 },
      ],
      { duration: ms * rand(0.8, 1.2), easing: 'cubic-bezier(.15,.7,.4,1)' },
    ).onfinish = () => e.remove();
  }
}

/** Synthetic key event for the preview bot. */
export const fake = (code: string, down = true): KeyboardEvent =>
  new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code === 'Space' ? ' ' : code.replace(/^Key/, '').toLowerCase() });

/** Fresh (non auto-repeat) press of one of `codes`. */
export const tap = (e: KeyboardEvent, down: boolean, ...codes: string[]): boolean => down && !e.repeat && codes.includes(e.code);
export const LEFT = ['KeyA', 'ArrowLeft'];
export const RIGHT = ['KeyD', 'ArrowRight'];
/** -1 left paw, 1 right paw, 0 neither (A/D, arrows mirror) */
export const side = (code: string): -1 | 0 | 1 => (LEFT.includes(code) ? -1 : RIGHT.includes(code) ? 1 : 0);

/** Event-rate cap: returns true at most `perSec` times per second (sliding 1 s window, so chords still pass). */
export function gate(perSec: number, windowed = false): () => boolean {
  const ts: number[] = [];
  let last = -1e9;
  return () => {
    const t = performance.now();
    if (!windowed) {
      if (t - last < 1000 / perSec) return false;
      last = t;
      return true;
    }
    while (ts.length && t - ts[0] > 1000) ts.shift();
    if (ts.length >= perSec) return false;
    ts.push(t);
    return true;
  };
}

// ---------------------------------------------------------------- frame
export interface Frame {
  root: HTMLElement;
  panel: HTMLElement;
  stage: HTMLElement;
  /** once per frame: fits the panel, danger, bar, flushes streamed progress. Returns progress (never goes down). */
  tick(dt: number): number;
  /** light the hint keycap for this key code */
  flash(code: string): void;
  /** dim a hint keycap */
  dim(code: string, on: boolean): void;
  /** light a hint keycap (the expected key) */
  light(code: string, on: boolean): void;
  sound(name: SoundName, opts?: SoundOpts): void;
  /** send progress now (split into <= 0.25 messages, the host's per-message cap) */
  report(d: number): void;
  /** accumulate continuous progress, sent at ~10 Hz */
  stream(d: number): void;
  /** mistakes: lock input for `sec` (never costs progress) */
  lock(sec: number): void;
  locked(): boolean;
  /** seconds since the local player last reported progress */
  idle(): number;
  /** other cats working on the same bar right now (host hint if given, else a guess) */
  helpers(): number;
  /** host says it's over: freeze at 100% and dim */
  finish(): void;
  readonly finished: boolean;
  dispose(): void;
}

export interface FrameOpts {
  slim?: boolean;
  /** extra tick marks on the progress bar (0..1) */
  ticks?: number[];
  /** the bar shows 1 - progress (time left in the carrier) */
  invert?: boolean;
}

const BASE_W = 860, BASE_H = 580;

/**
 * Docked panel (bottom half, the 3D spot cam shows above) or slim strip (`escape`).
 * hints: [[keys, label]], keys are display labels ('A', 'D', '←', 'Space').
 */
export function frame(host: MinigameHost, kind: string, title: string, hints: [string[], string][], opts: FrameOpts = {}): Frame {
  const slim = !!opts.slim;
  const root = el('div', `mg-overlay mg-${kind}${slim ? ' mg-slim' : ''}`, host.container);
  const fit = el('div', 'mg-fit', root);
  const panel = el('div', 'mg-panel', fit);
  let stage: HTMLElement;
  let hintRow: HTMLElement, bar: HTMLElement;
  if (slim) {
    stage = panel;
    hintRow = el('div', 'mg-hints', panel);
    bar = el('div', 'mg-bar', panel);
  } else {
    const head = el('div', 'mg-head', panel);
    el('div', 'mg-title', head, title);
    el('div', 'mg-esc', head, '<span class="mg-kbd sm">Esc</span> leave');
    stage = el('div', 'mg-stage', panel);
    const foot = el('div', 'mg-foot', panel);
    hintRow = el('div', 'mg-hints', foot);
    bar = el('div', 'mg-bar', foot);
  }
  const fill = el('i', '', bar);
  for (const t of opts.ticks ?? []) el('b', 'mg-tick', bar).style.left = `${t * 100}%`;
  const caps = new Map<string, HTMLElement[]>();
  for (const [keys, label] of hints) {
    const h = el('div', 'mg-hint', hintRow);
    keys.forEach((k, i) => {
      if (i) el('span', 'mg-or', h, '/');
      const cap = el('span', 'mg-kbd', h, k);
      for (const code of CODE[k] ?? [`Key${k}`]) caps.set(code, [...(caps.get(code) ?? []), cap]);
    });
    if (label) el('span', 'mg-hint-label', h, label);
  }

  // danger indicator: nothing / cat_face / weary_cat shaking + orange border pulse
  const danger = slim ? null : el('div', 'mg-danger', panel);
  if (danger) { img('cat_face', 'mg-d1', danger); img('weary_cat', 'mg-d2', danger); }
  let dangerLvl = -1;

  let lastW = 0, lastH = 0, shown = -1, best = 0;
  let acc = 0, flushT = 0, lockT = 0, lastMine = -99, finished = false;
  let seenP = 0, othersT = 0;
  const sounded = new Map<string, number>();
  // the host caps one message at 0.25, so bigger steps (a 0.334 catch) go out in chunks
  const send = (d: number) => {
    if (!(d > 0)) return;
    lastMine = now();
    for (; d > 1e-6; d -= 0.25) host.progress(Math.min(0.25, d));
  };

  const f: Frame = {
    root, panel, stage,
    get finished() { return finished; },
    tick(dt) {
      const w = host.container.clientWidth, h = host.container.clientHeight;
      if (w !== lastW || h !== lastH) {
        lastW = w; lastH = h;
        const docked = Math.min(1.15, (w * 0.92) / BASE_W, (h * 0.5) / BASE_H);
        // the strip keeps the panel's scale but stays readable on small screens
        fit.style.scale = `${slim ? Math.min((w * 0.92) / BASE_W, Math.max(0.8, docked)) : docked}`;
      }
      flushT += dt;
      if (acc > 0 && (acc >= 0.03 || flushT >= 0.1)) { send(acc); acc = 0; flushT = 0; }
      lockT = Math.max(0, lockT - dt);
      panel.classList.toggle('locked', lockT > 0);
      const raw = clamp(host.getProgress());
      // someone else is adding while we're not: show their paws
      if (raw > seenP + 0.002 && f.idle() > 0.35) othersT = 0.6;
      othersT = Math.max(0, othersT - dt);
      seenP = Math.max(seenP, raw);
      best = finished ? 1 : Math.max(best, raw);
      if (Math.abs(best - shown) > 0.0005) {
        shown = best;
        fill.style.width = `${(opts.invert ? 1 - best : best) * 100}%`;
        panel.classList.toggle('done', best >= 0.999);
      }
      if (danger) {
        const d = finished || best >= 0.999 ? 0 : clamp(host.danger?.() ?? 0);
        const lvl = d >= 0.75 ? 2 : d >= 0.35 ? 1 : 0;
        if (lvl !== dangerLvl) {
          dangerLvl = lvl;
          danger.dataset.lvl = String(lvl);
          panel.classList.toggle('alarm', lvl === 2);
          if (lvl) pop(danger, 1.3);
        }
      }
      return best;
    },
    flash(code) {
      for (const c of caps.get(code) ?? []) {
        c.classList.remove('on');
        void c.offsetWidth;
        c.classList.add('on');
      }
    },
    dim(code, on) { for (const c of caps.get(code) ?? []) c.classList.toggle('dim', on); },
    light(code, on) { for (const c of caps.get(code) ?? []) c.classList.toggle('lit', on); },
    sound(name, o) {
      // light throttle so mashing doesn't machine-gun the same sample
      const t = performance.now();
      if (t - (sounded.get(name) ?? 0) < 70) return;
      sounded.set(name, t);
      // ponytail: contract sound() has no opts yet (REQUESTS P3->P1/P5); extra arg is ignored until forwarded
      (host.sound as ((n: SoundName, o?: SoundOpts) => void) | undefined)?.(name, o);
    },
    report: send,
    stream(d) { if (d > 0) { acc += d; lastMine = now(); } },
    lock(sec) { lockT = Math.max(lockT, sec); },
    locked: () => lockT > 0 || finished,
    idle: () => now() - lastMine,
    helpers() {
      const n = host.data?.helpers;
      if (typeof n === 'function') return Number(n()) || 0;
      return othersT > 0 ? 1 : 0;
    },
    finish() {
      if (finished) return;
      finished = true;
      if (acc > 0) { send(acc); acc = 0; }
    },
    dispose() {
      root.remove();
    },
  };
  return f;
}

const CODE: Record<string, string[]> = {
  '←': ['ArrowLeft'], '→': ['ArrowRight'], '↑': ['ArrowUp'], '↓': ['ArrowDown'], Space: ['Space'], Esc: ['Escape'],
  Enter: ['Enter', 'NumpadEnter'], LMB: ['Mouse0'], 'A–Z': ['Letters'], Wheel: ['Wheel'],
};

// ---------------------------------------------------------------- paws
/** Fluent paw-print geometry (toes + pad) from paw_prints.svg, used for the toe beans. */
const TOES = [
  'M5.94 9.31C5.94 7.69 4.76 7.48 4.1 7.48 3.53 7.48 2.4 7.7 2.4 9.31 2.4 10.92 3.43 11.56 4.1 11.56 4.77 11.56 5.94 10.94 5.94 9.31Z',
  'M9.57 7.27C9.57 5.65 8.39 5.45 7.73 5.45 7.16 5.45 6.02 5.66 6.02 7.27 6.02 8.89 7.05 9.52 7.73 9.52 8.4 9.52 9.57 8.9 9.57 7.27Z',
  'M13.94 7.27C13.94 5.65 12.76 5.45 12.1 5.45 11.53 5.45 10.4 5.66 10.4 7.27 10.4 8.89 11.43 9.52 12.1 9.52 12.77 9.52 13.94 8.9 13.94 7.27Z',
  'M17.49 9.31C17.49 7.69 16.31 7.48 15.65 7.48 15.08 7.48 13.94 7.7 13.94 9.31 13.94 10.92 14.98 11.56 15.65 11.56 16.32 11.56 17.49 10.94 17.49 9.31Z',
];
const PAD = 'M14.93 15.45C14.93 12.53 13.04 10 9.94 10 6.85 10 4.99 12.47 4.99 15.45 4.99 17.94 7.95 17.94 9.94 17.94 12.15 17.94 14.93 17.86 14.93 15.45Z';
const SIL = 'M24 134C24 120 22 108 19 100 10 90 5 76 6 60 7 48 9 40 12 35 8 27 12 18 21 17 25 9 33 6 40 10 44 5 56 5 60 10 67 6 75 9 79 17 88 18 92 27 88 35 91 40 93 48 94 60 95 76 90 90 81 100 78 108 76 120 76 134';
/** long: the arm runs on below the element (never shows a cut); short: a rounded wrist for pokes */
const ARM = { long: 'M24 520L', short: 'M' }, END = { long: 'L76 520Z', short: 'C64 146 36 146 24 134Z' };

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

let uid = 0;
export const DEFAULT_FUR = '#FFB23F';
export const OTHER_FUR = '#B9A6C9';
/**
 * A big fluffy cat paw (bottom = wrist, 100x140 viewBox). 'beans' shows the pink toe beans,
 * 'back' the furry top with toe creases; add class `claws` to the element to unsheathe.
 */
export function paw(sideName: 'beans' | 'back', fur = DEFAULT_FUR, cls = '', arm: 'long' | 'short' = 'long'): HTMLElement {
  const id = `mgp${++uid}`;
  const light = mix(fur, '#FFF4DA', 0.55), mid = mix(fur, '#7A3410', 0.12), dark = mix(fur, '#7A3410', 0.28), crease = mix(fur, '#7A3410', 0.45);
  const beans = sideName === 'beans'
    ? `<g transform="translate(11 4) scale(3.92)">
        ${TOES.map((d) => `<path d="${d}" fill="url(#${id}b)"/>`).join('')}
        <path d="${PAD}" fill="url(#${id}b)" filter="url(#${id}i)"/>
        <ellipse cx="8.6" cy="12.4" rx="2.2" ry="1.1" fill="#fff" opacity=".55" filter="url(#${id}s)"/>
        ${[[3.6, 8.4], [7.2, 6.3], [11.6, 6.3], [15.1, 8.4]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx=".75" ry=".45" fill="#fff" opacity=".6" filter="url(#${id}s)"/>`).join('')}
      </g>`
    : `<g stroke="${crease}" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".5">
        <path d="M28 21C30 27 30 32 29 36"/><path d="M50 12C50 20 50 26 50 31"/><path d="M72 21C70 27 70 32 71 36"/></g>`;
  const e = el('div', `mg-paw ${cls}`);
  e.innerHTML = `<svg viewBox="0 -8 100 142" preserveAspectRatio="xMidYMax meet">
    <defs>
      <radialGradient id="${id}f" gradientUnits="userSpaceOnUse" cx="42" cy="34" r="150"><stop offset="0" stop-color="${light}"/><stop offset=".38" stop-color="${fur}"/><stop offset=".8" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
      <radialGradient id="${id}b" cx=".38" cy=".32" r=".7"><stop offset="0" stop-color="#FFC4D2"/><stop offset=".6" stop-color="#F98DA9"/><stop offset="1" stop-color="#E26585"/></radialGradient>
      <linearGradient id="${id}c" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#EDE3DC"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient>
      <filter id="${id}i" x="-20%" y="-20%" width="140%" height="140%"><feOffset dx=".15" dy=".25" in="SourceAlpha"/><feGaussianBlur stdDeviation=".45"/><feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1"/><feColorMatrix values="0 0 0 0 .55 0 0 0 0 .18 0 0 0 0 .3 0 0 0 .7 0"/><feComposite in2="SourceGraphic" operator="over"/></filter>
      <filter id="${id}r" filterUnits="userSpaceOnUse" x="-10" y="-20" width="120" height="560"><feOffset dx="-2" dy="-3" in="SourceAlpha"/><feGaussianBlur stdDeviation="3"/><feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1"/><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .22 0 0 0 0 .08 0 0 0 .45 0"/><feComposite in2="SourceGraphic" operator="over"/></filter>
      <filter id="${id}s"><feGaussianBlur stdDeviation=".35"/></filter>
    </defs>
    <g class="mg-claws" fill="url(#${id}c)" stroke="#CBB8AD" stroke-width=".6">
      <path d="M13 24C12 18 13 13 16 9 16 14 18 18 20 21Z"/><path d="M31 13C30 7 32 2 35-1 35 4 36 8 38 11Z"/>
      <path d="M69 13C70 7 68 2 65-1 65 4 64 8 62 11Z"/><path d="M87 24C88 18 87 13 84 9 84 14 82 18 80 21Z"/></g>
    <path d="${ARM[arm]}${SIL.slice(1)}${END[arm]}" fill="url(#${id}f)" filter="url(#${id}r)"/>
    <g fill="${fur}">
      <path d="M8 74C3 74 1 70 1 67 4 69 6 69 7 68Z"/><path d="M92 74C97 74 99 70 99 67 96 69 94 69 93 68Z"/>
      <path d="M13 90C8 92 5 89 4 86 7 87 9 87 11 85Z"/><path d="M87 90C92 92 95 89 96 86 93 87 91 87 89 85Z"/></g>
    ${beans}
  </svg>`;
  return e;
}

const hex = (v: unknown): string | null => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
/** Fur colour the host may pass in data.fur (CSS hex). */
export const furOf = (host: MinigameHost, key = 'fur', fallback = DEFAULT_FUR): string => hex(host.data?.[key]) ?? fallback;
