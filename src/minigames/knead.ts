import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, paw, furOf, pop, burst, puff, fake, tap, LEFT, RIGHT, rand, clamp } from './kit';

const PX = [300, 520], PY = 150;
const FACES = ['cat_face', 'grinning_cat_with_smiling_eyes', 'smiling_cat_with_heart-eyes'];

export function knead(host: MinigameHost): Game {
  const f = frame(host, 'knead', 'Make biscuits', [[['A', '←'], 'left'], [['D', '→'], 'right'], [[], 'steady rhythm']]);
  const { stage } = f;
  const fur = furOf(host);

  const pillow = place(el('div', 'kn-pillow', stage), 90, 60, 600, 330);
  el('div', 'kn-seam', pillow);
  const dents = el('div', 'kn-dents', pillow);
  const paws = PX.map((x) => {
    const p = paw('back', fur, 'kn-paw');
    stage.appendChild(p);
    place(p, x - 75, PY, 150, 210);
    return p;
  });
  const tags = PX.map((x, i) => place(el('div', 'kn-tag', stage, i ? 'D' : 'A'), x - 17, PY - 46));
  const meter = place(el('div', 'kn-meter', stage), 726, 70, 52, 290);
  const fill = el('i', '', meter);
  const faces = FACES.map((n) => img(n, 'kn-face', stage));

  let last = -1, lastT = 0, t = 0, purr = 0, purrT = 0, botT = 0, botSide = 0;
  const down = [0, 0];

  function press(i: number): void {
    const gap = t - lastT;
    const good = i !== last && gap > 0.16;
    last = i;
    lastT = t;
    down[i] = 1;
    paws[i].animate({ scale: ['1 1', '1.08 0.9', '1 1'] }, { duration: 260, easing: 'ease-out' });
    const dx = PX[i] - 90, dy = PY + 40 - 60;
    const d = place(el('div', 'kn-dent', dents), dx - 70, dy - 40, 140, 100);
    d.animate({ opacity: [0.9, 0], scale: ['1', '1.15'] }, { duration: 1400, easing: 'ease-in' }).onfinish = () => d.remove();
    pillow.animate({ scale: ['1 1', '1.01 0.985', '1 1'] }, { duration: 260 });
    if (!good) {
      purr = Math.max(0, purr - 0.2);
      const snag = place(el('div', 'kn-snag', dents), dx - 12, dy - 50, 24, 16);
      snag.animate({ opacity: [1, 0.5] }, { duration: 2000, fill: 'forwards' });
      return;
    }
    purr = clamp(purr + 0.11);
    host.progress((0.5 + purr) / 20);
    if (Math.random() < 0.35) burst(stage, PX[i], PY + 30, { cls: 'kn-fluff', n: 2, size: 12, spread: 50, up: 40 });
  }

  return {
    update(dt) {
      const p = f.tick();
      t += dt;
      if (t - lastT > 0.9) purr = Math.max(0, purr - dt * 0.3);
      fill.style.height = `${purr * 100}%`;
      const fi = purr < 0.35 ? 0 : purr < 0.75 ? 1 : 2;
      faces.forEach((e, i) => {
        e.style.opacity = i === fi ? '1' : '0';
        e.style.transform = `translate(724px,${20 - purr * 6}px) rotate(${Math.sin(t * 30) * purr * 3}deg)`;
      });
      tags.forEach((g, i) => g.classList.toggle('next', i !== last && p < 0.999));
      paws.forEach((pw, i) => {
        down[i] = Math.max(0, down[i] - dt * 4);
        pw.style.translate = `0 ${down[i] * 16 - (i === last ? 0 : 10)}px`;
      });
      purrT -= dt;
      if (purr > 0.35 && purrT < 0) {
        purrT = 1.4 - purr * 0.6;
        f.sound('purr');
        puff(stage, 750 + rand(-10, 10), 60, purr > 0.75 ? 'prrrr' : 'prr', 'kn-purr');
        if (purr > 0.6) burst(stage, 410 + rand(-150, 150), 120, { asset: 'two_hearts', n: 1, size: 40, spread: 30, up: 90, fall: -40, ms: 1200 });
      }
      if (p >= 0.999 && !pillow.classList.contains('done')) {
        pillow.classList.add('done');
        f.sound('purr');
        burst(stage, 410, 200, { asset: 'revolving_hearts', n: 5, size: 54, spread: 200, up: 60 });
        pop(faces[2], 1.4);
      }
    },
    key(e, down) {
      const l = LEFT.includes(e.code), r = RIGHT.includes(e.code);
      if (!l && !r) return false;
      if (tap(e, down, ...LEFT, ...RIGHT)) { f.flash(e.code); press(l ? 0 : 1); }
      return true;
    },
    bot(dt) {
      botT -= dt;
      if (botT > 0) return;
      botT = rand(0.32, 0.46);
      botSide = Math.random() < 0.95 ? botSide ^ 1 : botSide;
      this.key(fake(botSide ? 'KeyD' : 'KeyA'), true);
    },
    dispose: () => f.dispose(),
  };
}
