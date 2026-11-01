import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, paw, furOf, pop, shake, burst, fake, rand, pick } from './kit';

const C = { x: 410, y: 225 };
const MASH = ['KeyA', 'KeyD', 'Space'];
const DIRS = [
  { code: 'ArrowLeft', label: '←', x: -1, y: 0 }, { code: 'ArrowRight', label: '→', x: 1, y: 0 },
  { code: 'ArrowUp', label: '↑', x: 0, y: -1 }, { code: 'ArrowDown', label: '↓', x: 0, y: 1 },
];
const PER_MASH = 1 / 26, PER_DIR = 0.1, PROMPT_TIME = 1.1;

export function fight(host: MinigameHost): Game {
  const f = frame(host, 'fight', 'Scrap', [[['A', 'D', 'Space'], 'scrap'], [['←↑→↓'], 'on cue']]);
  const { stage } = f;
  const fur = furOf(host);
  const opponent = String(host.data?.opponent ?? 'Someone').slice(0, 16);

  el('div', 'ft-rug', stage);
  const vs = el('div', 'ft-vs', stage);
  vs.textContent = `vs ${opponent}`;
  const shadow = place(el('div', 'ft-shadow', stage), C.x - 230, 340, 460, 60);
  const cloud = place(el('div', 'ft-cloud', stage), C.x, C.y, 0, 0);
  const puffs = [[-120, -40, 230], [100, -60, 240], [0, -120, 220], [-60, 60, 250], [110, 60, 230], [-10, 0, 280], [-170, 30, 170], [180, 0, 170]]
    .map(([x, y, s], i) => {
      const e = place(img(i % 3 === 2 ? 'dashing_away' : 'cloud', 'ft-puff', cloud), x - s / 2, y - s / 2, s, s);
      return { e, x, y, ph: rand(0, 6) };
    });
  const pops = el('div', 'ft-pops', stage);
  const prompt = el('div', 'ft-prompt', stage);
  const cap = el('div', 'mg-kbd ft-cap', prompt);
  const timer = el('div', 'ft-timer', prompt);

  let t = 0, wob = 0, nextPrompt = 1.4, dir: (typeof DIRS)[number] | null = null, promptT = 0, stun = 0, botT = 0;

  function popOut(kind: 'paw' | 'me' | 'them' | 'star', dizzy = false): void {
    const a = rand(0, Math.PI * 2);
    const r = kind === 'star' ? rand(140, 200) : rand(120, 160);
    const x = C.x + Math.cos(a) * r * 1.2, y = C.y + Math.sin(a) * r * 0.75;
    let e: HTMLElement;
    if (kind === 'paw') {
      e = paw(Math.random() < 0.5 ? 'beans' : 'back', Math.random() < 0.5 ? fur : '#9C8FA8', 'ft-paw', 'short');
      pops.appendChild(e);
      place(e, x - 45, y - 60, 90, 126);
      e.style.rotate = `${(a * 180) / Math.PI + 90}deg`;
    } else {
      const s = kind === 'star' ? 50 : 120;
      e = place(img(kind === 'me' ? 'pouting_cat' : kind === 'them' ? 'cat_with_wry_smile' : 'star', 'ft-face', pops), x - s / 2, y - s / 2, s, s);
      if (kind === 'them') e.style.filter = 'hue-rotate(-30deg) saturate(.55) brightness(1.05)';
      if (dizzy) {
        const d = place(img('dizzy', 'ft-dizzy', pops), x - 40, y - s / 2 - 50, 80, 80);
        d.animate({ opacity: [1, 1, 0], rotate: ['0deg', '360deg'] }, { duration: 900 }).onfinish = () => d.remove();
      }
    }
    e.animate({ scale: ['.2', '1.1', '1', '.2'], opacity: [0, 1, 1, 0] }, { duration: dizzy ? 900 : 420, easing: 'ease-out' }).onfinish = () => e.remove();
  }

  function mash(code: string): void {
    if (stun > 0) return;
    f.flash(code);
    wob = 1;
    host.progress(PER_MASH);
    f.sound(Math.random() < 0.6 ? 'fight' : 'hiss');
    popOut(pick(['paw', 'paw', 'me', 'them', 'star'] as const));
    if (Math.random() < 0.3) burst(stage, C.x + rand(-120, 120), C.y + rand(-60, 60), { cls: 'ft-tuft', n: 2, size: 18, spread: 140, fall: 80 });
  }

  function answer(code: string): void {
    if (!dir || stun > 0) return;
    f.flash(code);
    if (code === dir.code) {
      host.progress(PER_DIR);
      burst(stage, C.x + dir.x * 170, C.y + dir.y * 110, { asset: 'collision', n: 3, size: 80, spread: 60 });
      popOut('them', true);
      shake(stage, 10, 300);
      f.sound('thud');
    } else {
      stun = 0.45;
      popOut('me', true);
      shake(stage, 6, 250);
    }
    dir = null;
    prompt.classList.remove('on');
  }

  return {
    update(dt) {
      const p = f.tick();
      t += dt;
      stun = Math.max(0, stun - dt);
      wob = Math.max(0, wob - dt * 5);
      cloud.style.transform = `rotate(${Math.sin(t * 2) * 6}deg) scale(${1 + wob * 0.08 + Math.sin(t * 9) * 0.015})`;
      for (const pf of puffs) pf.e.style.transform = `translate(${Math.sin(t * 7 + pf.ph) * 8}px,${Math.cos(t * 6 + pf.ph) * 8}px) rotate(${Math.sin(t * 3 + pf.ph) * 10}deg)`;
      shadow.style.scale = `${1 + Math.sin(t * 9) * 0.03}`;
      if (Math.random() < dt * 3) popOut(pick(['paw', 'star'] as const));
      if (p >= 0.999) {
        if (!cloud.classList.contains('gone')) {
          cloud.classList.add('gone');
          prompt.classList.remove('on');
          f.sound('ding');
          const me = place(img('pouting_cat', 'ft-winner', stage), C.x - 80, C.y - 60, 160, 160);
          place(img('crown', 'ft-crown', stage), C.x - 45, C.y - 140, 90, 90);
          pop(me, 1.3);
          burst(stage, C.x, C.y, { asset: 'star', n: 8, size: 40, spread: 220 });
        }
        return;
      }
      nextPrompt -= dt;
      if (!dir && nextPrompt <= 0) {
        dir = pick(DIRS);
        promptT = PROMPT_TIME;
        nextPrompt = rand(1.6, 2.6);
        cap.textContent = dir.label;
        place(prompt, C.x + dir.x * 270 - 45, C.y + dir.y * 150 - 45);
        prompt.classList.add('on');
        pop(prompt, 1.3);
      }
      if (dir) {
        promptT -= dt;
        timer.style.setProperty('--t', `${Math.max(0, promptT / PROMPT_TIME) * 360}deg`);
        if (promptT <= 0) { dir = null; prompt.classList.remove('on'); }
      }
    },
    key(e, down) {
      const isDir = DIRS.some((d) => d.code === e.code);
      if (!isDir && !MASH.includes(e.code)) return false;
      if (down && !e.repeat) (isDir ? answer : mash)(e.code);
      return true;
    },
    bot(dt) {
      botT -= dt;
      if (dir && promptT < PROMPT_TIME - 0.35) { this.key(fake(dir.code), true); return; }
      if (botT > 0) return;
      botT = rand(0.1, 0.18);
      this.key(fake(pick(MASH)), true);
    },
    dispose: () => f.dispose(),
  };
}
