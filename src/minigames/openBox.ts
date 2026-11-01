import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, paw, furOf, pop, shake, squash, burst, fake, gate, side, rand, clamp, OTHER_FUR } from './kit';

// ADDENDUM 4.9: alternate A/D to rip, +1/12 per alternation (4 per strip), cap 6/s. Space = chew (fun only).
const STEP = 1 / 12, STRIPS = 3;
const BOX = { x: 216, y: 4, w: 390 };
const TAPE = [
  { x: 290, y: 190, w: 244, r: -3 },
  { x: 284, y: 246, w: 256, r: 2 },
  { x: 294, y: 302, w: 236, r: -1 },
];

export function openBox(host: MinigameHost): Game {
  const f = frame(host, 'openBox', 'Open it', [[['A', '←'], 'left paw'], [['D', '→'], 'right paw'], [['Space'], 'chew']]);
  const { stage } = f;
  const fur = furOf(host);
  const prize = host.data?.order === 'wetFood' ? 'canned_food' : 'herb';

  el('div', 'ob-floor', stage);
  const shadow = place(el('div', 'ob-shadow', stage), BOX.x + 30, BOX.y + BOX.w - 60, BOX.w - 60, 54);
  const box = place(el('div', 'ob-box', stage), BOX.x, BOX.y, BOX.w, BOX.w);
  img('package', 'ob-pkg', box);
  const goodie = place(img(prize, 'ob-prize', stage), BOX.x + BOX.w / 2 - 50, BOX.y + 80, 100, 100);
  const strips = TAPE.map((tp) => {
    const s = place(el('div', 'ob-strip', stage), tp.x, tp.y, tp.w, 40);
    s.style.rotate = `${tp.r}deg`;
    const halves = [el('div', 'ob-half l', s), el('div', 'ob-half r', s)];
    return { s, halves, marks: 0, torn: false };
  });
  const paws = [paw('back', fur, 'ob-paw claws'), paw('back', fur, 'ob-paw claws')];
  const home = [{ x: 150, y: 250, r: 24 }, { x: 670, y: 250, r: -24 }];
  paws.forEach((p, i) => { stage.appendChild(p); place(p, home[i].x - 62, home[i].y, 124, 174); p.style.rotate = `${home[i].r}deg`; });
  const buddy = paw('back', OTHER_FUR, 'ob-paw ob-buddy claws');
  stage.appendChild(buddy);
  place(buddy, BOX.x + BOX.w - 40, -60, 110, 154);
  buddy.style.rotate = '200deg';

  const cap = gate(6);
  let last = 0, botT = 0, buddyT = 0, opened = false, t = 0;

  function rip(s: -1 | 1): void {
    const same = s === last;
    last = s;
    if (f.locked()) return;
    const i = s < 0 ? 0 : 1;
    const cur = strips.find((x) => !x.torn) ?? strips[STRIPS - 1];
    const tp = TAPE[strips.indexOf(cur)];
    const tx = tp.x + tp.w * (i ? 0.7 : 0.3), ty = tp.y + 20;
    paws[i].animate(
      { translate: ['0 0', `${(tx - home[i].x) * 0.8}px ${(ty - home[i].y) * 0.8 - 40}px`, `${(tx - home[i].x) * 0.8 + (i ? -60 : 60)}px ${(ty - home[i].y) * 0.8 + 30}px`, '0 0'] },
      { duration: 300, easing: 'cubic-bezier(.3,.8,.4,1)' },
    );
    if (same) { shake(cur.s, 3, 160); return; }
    if (!cap()) return;
    f.report(STEP);
    f.sound('scratch', { volume: 0.7 });
    squash(box, 180);
    burst(stage, tx, ty, { cls: 'ob-bit', n: 3, size: 12, spread: 70, up: 40, fall: 80 });
  }

  function chew(): void {
    // the corner. No progress, just cardboard.
    f.sound('crunch');
    shake(box, 4, 200);
    burst(stage, BOX.x + BOX.w - 40, BOX.y + BOX.w - 90, { cls: 'ob-bit', n: 8, size: 14, spread: 90, up: 30, fall: 120, ms: 900 });
  }

  return {
    update(dt) {
      const p = f.tick(dt);
      t += dt;
      const k = p * STRIPS;
      strips.forEach((st, i) => {
        const a = clamp(k - i);
        const want = Math.min(4, Math.floor(a * 4 + 0.001));
        while (st.marks < want && st.marks < 3) {
          st.marks++;
          const m = place(el('div', 'ob-marks', st.s), 14 + st.marks * 48 + rand(-12, 12), 2, 44, 36);
          m.style.rotate = `${rand(-30, 30)}deg`;
        }
        if (want >= 4 && !st.torn) {
          st.torn = true;
          st.s.classList.add('torn');
          f.sound('paperRip');
          burst(stage, TAPE[i].x + TAPE[i].w / 2, TAPE[i].y + 20, { cls: 'ob-bit tape', n: 6, size: 16, spread: 120, up: 50, fall: 120 });
        }
      });
      if (p < 0.999) box.style.rotate = `${Math.sin(t * 2) * 1}deg`;
      // another cat ripping from the top
      if (f.helpers() > 0 && p < 0.999) {
        buddy.classList.add('on');
        buddyT -= dt;
        if (buddyT < 0) { buddyT = rand(0.3, 0.45); buddy.animate({ translate: ['0 0', '-40px 70px', '0 0'] }, { duration: 260 }); }
      } else buddy.classList.remove('on');
      if (p >= 0.999 && !opened) {
        opened = true;
        box.style.rotate = '0deg';
        box.animate({ translate: ['0 0', '0 -34px', '0 0'], scale: ['1 1', '.95 1.08', '1.06 .94', '1 1'] }, { duration: 480, easing: 'ease-out' });
        shake(shadow, 4);
        f.sound('pop');
        goodie.classList.add('out');
        pop(goodie, 1.2, 300);
      }
    },
    key(e, down) {
      if (e.code === 'Space') { if (down && !e.repeat) { f.flash('Space'); chew(); } return true; }
      const s = side(e.code);
      if (!s) return false;
      if (down && !e.repeat) { f.flash(e.code); rip(s); }
      return true;
    },
    bot(dt) {
      botT -= dt;
      if (botT > 0) return;
      botT = rand(0.3, 0.36);
      this.key(fake(last < 0 ? 'KeyD' : 'KeyA'), true);
    },
    finish() { f.finish(); },
    dispose: () => f.dispose(),
  };
}
