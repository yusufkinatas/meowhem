import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, paw, furOf, pop, burst, fake, tap, LEFT, RIGHT, rand, clamp } from './kit';

const SWATS = 44;
// roll_of_paper.svg drawn at W px; the hanging sheet's bottom edge spans units 5..23 at y 29.5
const W = 200, X0 = 300, Y0 = 12, U = W / 32;
const SHEET = { x: X0 + 5.2 * U, w: 17.6 * U, y: Y0 + 29.2 * U };
const FLOOR = 430;
const HIT = { x: X0 + 13 * U, y: Y0 + 14 * U };

export function tpSpin(host: MinigameHost): Game {
  const f = frame(host, 'tpSpin', 'Unroll', [[['A', '←'], 'left paw'], [['D', '→'], 'right paw'], [[], 'alternate, fast']]);
  const { stage } = f;
  const fur = furOf(host);

  place(el('div', 'tp-plate', stage), X0 + 27 * U, Y0 + 6 * U, 46, 78);
  place(el('div', 'tp-arm', stage), X0 + 24 * U, Y0 + 10.4 * U, 62, 16);
  const roll = place(img('roll_of_paper', 'tp-roll', stage), X0, Y0, W, W);
  const strip = place(el('div', 'tp-strip', stage), SHEET.x, SHEET.y, SHEET.w, 0);
  const pile = el('div', 'tp-pile', stage);
  const mound = place(el('div', 'tp-mound', pile), SHEET.x + SHEET.w / 2 - 230, FLOOR - 110, 460, 170);
  const loops: HTMLElement[] = [];
  // the sheet folds over itself into a heap: stacked, skewed paper folds, a few sliding off
  for (let i = 0; i < 26; i++) {
    const w = SHEET.w * rand(0.95, 1.35), h = rand(20, 26);
    const slide = i % 5 === 4 ? rand(80, 170) * (Math.random() < 0.5 ? -1 : 1) : rand(-40, 40) * (1 + i / 14);
    const x = SHEET.x + SHEET.w / 2 + slide - w / 2;
    const y = FLOOR - 24 - i * 6.5 - (Math.abs(slide) > 60 ? -i * 4 : 0);
    const e = place(el('div', 'tp-loop', pile), x, y, w, h);
    e.style.rotate = `${rand(-12, 12) + (Math.abs(slide) > 60 ? Math.sign(slide) * 18 : 0)}deg`;
    loops.push(e);
  }
  const arcs = [place(el('div', 'tp-arc', stage), X0 - 34, Y0 + 30, 60, 120), place(el('div', 'tp-arc r', stage), X0 + W - 20, Y0 + 30, 60, 120)];

  const paws = [paw('beans', fur, 'tp-paw'), paw('beans', fur, 'tp-paw')];
  const home = [{ x: 190, y: 255, r: 22 }, { x: 630, y: 255, r: -22 }];
  paws.forEach((p, i) => { stage.appendChild(p); place(p, home[i].x - 70, home[i].y, 140, 196); p.style.rotate = `${home[i].r}deg`; });

  let last = -1, roll_v = 0, scroll = 0, shown = 0, botT = 0, botSide = 0, combo = 0, idle = 0;

  function swat(i: number): void {
    const dx = HIT.x - home[i].x, dy = HIT.y - home[i].y;
    paws[i].animate({ translate: ['0 0', `${dx * 0.7}px ${dy * 0.7}px`, '0 0'], scale: ['1', '0.9', '1'] },
      { duration: 200, easing: 'cubic-bezier(.3,.8,.4,1)' });
    const good = i !== last;
    last = i;
    roll_v += good ? 1 : 0.3;
    roll.animate({ rotate: ['0deg', `${i ? -4 : 4}deg`, '0deg'], translate: ['0 0', '0 5px', '0 0'] }, { duration: 180 });
    arcs[i].classList.remove('on');
    void arcs[i].offsetWidth;
    arcs[i].classList.add('on');
    if (!good) return;
    combo++;
    idle = 0;
    host.progress(1 / SWATS);
    f.sound(combo % 3 ? 'whoosh' : 'paperRip');
    burst(stage, HIT.x + rand(-30, 30), SHEET.y, { cls: 'tp-bit', n: 3, size: 16, spread: 70, up: 10, fall: 120, ms: 900 });
  }

  return {
    update(dt) {
      const p = f.tick();
      idle += dt;
      if (idle > 0.6) combo = 0;
      roll_v *= Math.exp(-dt * 3);
      scroll += roll_v * dt * 260;
      strip.style.backgroundPositionY = `${scroll}px`;
      const len = clamp(p / 0.35) * (FLOOR - SHEET.y);
      strip.style.height = `${len}px`;
      const want = Math.floor(clamp((p - 0.3) / 0.7) * loops.length);
      mound.style.transform = `scale(${clamp((p - 0.3) / 0.7)})`;
      while (shown < want) { loops[shown].classList.add('on'); pop(loops[shown], 1.15); shown++; }
      if (p >= 0.999 && !roll.classList.contains('done')) {
        roll.classList.add('done');
        f.sound('paperRip');
        burst(stage, SHEET.x + SHEET.w / 2, 300, { cls: 'tp-bit', n: 16, size: 22, spread: 260, up: 120, fall: 200, ms: 1300 });
      }
    },
    key(e, down) {
      const l = LEFT.includes(e.code), r = RIGHT.includes(e.code);
      if (!l && !r) return false;
      if (tap(e, down, ...LEFT, ...RIGHT)) { f.flash(e.code); swat(l ? 0 : 1); }
      return true;
    },
    bot(dt) {
      botT -= dt;
      if (botT > 0) return;
      botT = rand(0.14, 0.26);
      botSide = Math.random() < 0.94 ? botSide ^ 1 : botSide;
      this.key(fake(botSide ? 'KeyD' : 'KeyA'), true);
    },
    dispose: () => f.dispose(),
  };
}
