/** Shared bits for the minigame overlays: panel frame, sprites, paws, juice. */
import type { MinigameApi, MinigameHost, SoundName } from '../shared/contracts';

/** A minigame instance. `bot` is only used by the preview's auto-demo. */
export type Game = MinigameApi & { bot?(dt: number): void };

const urls = import.meta.glob('./assets/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const asset = (name: string): string => urls[`./assets/${name}.svg`] ?? '';

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

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

// ---------------------------------------------------------------- juice (uses individual `scale` / `translate` props
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
  cls?: string;         // a CSS-drawn bit (paper scrap, fur tuft...)
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

/** Floating text puff ("ek ek", "mrrp"). */
export function puff(parent: HTMLElement, x: number, y: number, text: string, cls = ''): void {
  const e = place(el('div', `mg-puff ${cls}`, parent, text), x, y);
  e.animate(
    [
      { transform: 'translate(-50%,0) scale(.5)', opacity: 0 },
      { transform: 'translate(-50%,-14px) scale(1.1)', opacity: 1, offset: 0.25 },
      { transform: `translate(calc(-50% + ${rand(-20, 20)}px),-60px) scale(1)`, opacity: 0 },
    ],
    { duration: 900, easing: 'ease-out' },
  ).onfinish = () => e.remove();
}

/** Synthetic key event for the preview bot. */
export const fake = (code: string): KeyboardEvent => new KeyboardEvent('keydown', { code, key: code.replace(/^Key/, '').toLowerCase() });

/** Fresh (non auto-repeat) press of one of `codes`. */
export const tap = (e: KeyboardEvent, down: boolean, ...codes: string[]): boolean => down && !e.repeat && codes.includes(e.code);
export const LEFT = ['KeyA', 'ArrowLeft'];
export const RIGHT = ['KeyD', 'ArrowRight'];

// ---------------------------------------------------------------- frame
export interface Frame {
  root: HTMLElement;
  panel: HTMLElement;
  stage: HTMLElement;
  /** call once per frame: fits the panel, updates the bar, returns current progress */
  tick(): number;
  /** light the hint keycap for this key code */
  flash(code: string): void;
  sound(name: SoundName): void;
  dispose(): void;
}

const BASE_W = 860, BASE_H = 580;

/**
 * hints: [[keys, label]], keys are display labels ('A', 'D', '←', 'Space').
 * codes map display labels to KeyboardEvent.code for flashing.
 */
export function frame(host: MinigameHost, kind: string, title: string, hints: [string[], string][]): Frame {
  const root = el('div', `mg-overlay mg-${kind}`, host.container);
  const fit = el('div', 'mg-fit', root);
  const panel = el('div', 'mg-panel', fit);
  const head = el('div', 'mg-head', panel);
  el('div', 'mg-title', head, title);
  el('div', 'mg-esc', head, '<span class="mg-kbd sm">Esc</span> leave');
  const stage = el('div', 'mg-stage', panel);
  const foot = el('div', 'mg-foot', panel);
  const hintRow = el('div', 'mg-hints', foot);
  const caps = new Map<string, HTMLElement[]>();
  for (const [keys, label] of hints) {
    const h = el('div', 'mg-hint', hintRow);
    keys.forEach((k, i) => {
      if (i) el('span', 'mg-or', h, '/');
      const cap = el('span', 'mg-kbd', h, k);
      const code = CODE[k] ?? `Key${k}`;
      caps.set(code, [...(caps.get(code) ?? []), cap]);
    });
    el('span', 'mg-hint-label', h, label);
  }
  const bar = el('div', 'mg-bar', foot);
  const fill = el('i', '', bar);

  let lastW = 0, lastH = 0, lastP = -1;
  const sounded = new Map<string, number>();
  return {
    root, panel, stage,
    tick() {
      const w = host.container.clientWidth, h = host.container.clientHeight;
      if (w !== lastW || h !== lastH) {
        lastW = w; lastH = h;
        fit.style.scale = `${Math.min(1.15, (w * 0.9) / BASE_W, (h * 0.86) / BASE_H)}`;
      }
      const p = clamp(host.getProgress());
      if (Math.abs(p - lastP) > 0.0005) {
        lastP = p;
        fill.style.width = `${p * 100}%`;
        panel.classList.toggle('done', p >= 0.999);
      }
      return p;
    },
    flash(code) {
      for (const c of caps.get(code) ?? []) {
        c.classList.remove('on');
        void c.offsetWidth;
        c.classList.add('on');
      }
    },
    sound(name) {
      // light throttle so mashing doesn't machine-gun the same sample
      const now = performance.now();
      if (now - (sounded.get(name) ?? 0) < 70) return;
      sounded.set(name, now);
      host.sound?.(name);
    },
    dispose() { root.remove(); },
  };
}

const CODE: Record<string, string> = {
  '←': 'ArrowLeft', '→': 'ArrowRight', '↑': 'ArrowUp', '↓': 'ArrowDown', Space: 'Space', Esc: 'Escape',
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
/**
 * A big fluffy cat paw (bottom = wrist, 100x140 viewBox). 'beans' shows the pink toe beans,
 * 'back' the furry top with toe creases; add class `claws` to the element to unsheathe.
 */
export function paw(side: 'beans' | 'back', fur = DEFAULT_FUR, cls = '', arm: 'long' | 'short' = 'long'): HTMLElement {
  const id = `mgp${++uid}`;
  const light = mix(fur, '#FFF4DA', 0.55), mid = mix(fur, '#7A3410', 0.12), dark = mix(fur, '#7A3410', 0.28), crease = mix(fur, '#7A3410', 0.45);
  const beans = side === 'beans'
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

/** Fur colour the host may pass in data.fur (CSS hex). */
export const furOf = (host: MinigameHost): string => {
  const f = host.data?.fur;
  return typeof f === 'string' && /^#[0-9a-f]{6}$/i.test(f) ? f : DEFAULT_FUR;
};
