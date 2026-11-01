import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, paw, furOf, pop, shake, burst, fake, tap, LEFT, RIGHT, rand, clamp } from './kit';

const GRABS = 16;
const H = 1300, VIEW = 430;     // curtain strip height vs visible stage
const T = 0.62, LATE = 0.14;    // cue period, grace after the beat
const PX = [318, 502];          // paw x

export function climb(host: MinigameHost): Game {
  const f = frame(host, 'climb', 'Up the curtains', [[['A', '←'], 'left paw'], [['D', '→'], 'right paw'], [[], 'on the ring']]);
  const { stage } = f;
  const fur = furOf(host);

  const strip = place(el('div', 'cl-strip', stage), 0, 0, 820, H);
  el('div', 'cl-fabric', strip);
  el('div', 'cl-light', strip);
  const rod = place(el('div', 'cl-rod', strip), -20, 38, 860, 26);
  for (let i = 0; i < 9; i++) place(el('div', 'cl-ring', strip), 30 + i * 96, 30, 30, 44);
  el('div', 'cl-floor', strip);
  const marks = el('div', 'cl-marks', strip);

  const paws = PX.map((x) => {
    const p = paw('back', fur, 'cl-paw claws');
    stage.appendChild(p);
    place(p, x - 70, 0, 140, 196);
    return p;
  });
  const rings = PX.map((x) => place(el('div', 'cl-cue', stage), x - 50, 0, 100, 100));
  const meter = el('div', 'cl-meter', stage);
  img('cat_face', 'cl-me', meter);
  const face = meter.lastElementChild as HTMLElement;

  let next = 0, cueT = 0, debt = 0, slipV = 0, view = 0, botT = 0;
  const pawY = [210, 170];

  function grab(i: number): void {
    const ok = i === next && cueT >= T * 0.55 && cueT <= T + LATE;
    if (!ok) return slip();
    if (debt > 0) debt = Math.max(0, debt - 1 / GRABS);
    else host.progress(1 / GRABS);
    pawY[i] = 120;
    pawY[i ^ 1] = 230;
    paws[i].animate({ scale: ['1', '1.12', '0.95', '1'] }, { duration: 220, easing: 'ease-out' });
    scratch(PX[i], 150, 18);
    f.sound('scratch');
    pop(rings[i], 1.3);
    next = i ^ 1;
    cueT = 0;
  }

  function slip(): void {
    debt = Math.min(host.getProgress(), debt + 0.05);
    slipV = 1;
    shake(stage, 9, 360);
    f.sound('scratch');
    for (const x of PX) scratch(x, 140, 90);
    paws.forEach((p) => p.animate({ translate: ['0 0', '0 26px', '0 -6px', '0 0'], rotate: ['0deg', '-6deg', '5deg', '0deg'] }, { duration: 380 }));
    burst(stage, 410, 200, { cls: 'cl-thread', n: 5, size: 18, spread: 120, up: -40, fall: 100 });
    face.animate({ scale: ['1', '1.4', '1'] }, { duration: 300 });
    cueT = 0;
  }

  /** claw marks stay on the fabric, in strip coordinates */
  function scratch(x: number, yScreen: number, len: number): void {
    const y = yScreen - view;
    const m = place(el('div', 'cl-mark', marks), x - 26, y, 52, len);
    m.animate({ opacity: [0, 1] }, { duration: 120 });
    if (marks.childElementCount > 60) marks.firstElementChild?.remove();
  }

  return {
    update(dt) {
      const p = f.tick();
      cueT += dt;
      if (cueT > T + LATE) cueT = 0; // missed the beat: same paw, no penalty
      const h = clamp(p - debt);
      const target = -(H - VIEW) * (1 - h);
      view += (target - view) * Math.min(1, dt * (slipV > 0 ? 14 : 6));
      slipV = Math.max(0, slipV - dt * 3);
      strip.style.transform = `translateY(${view}px)`;
      paws.forEach((pw, i) => {
        pawY[i] += ((i === next ? 230 : 150) - pawY[i]) * Math.min(1, dt * 5);
        pw.style.top = `${pawY[i]}px`;
      });
      rings.forEach((r, i) => {
        const on = i === next && p < 0.999;
        const s = 2.4 - 1.4 * clamp(cueT / T);
        r.style.opacity = on ? `${clamp(cueT / 0.15)}` : '0';
        r.style.top = `${pawY[i] + 10}px`;
        r.style.transform = `scale(${s})`;
        r.classList.toggle('hot', cueT >= T * 0.55);
      });
      face.style.bottom = `${8 + h * 300}px`;
      if (p >= 0.999 && !rod.classList.contains('down')) {
        rod.classList.add('down');
        f.sound('thud');
        burst(stage, 410, 80, { asset: 'collision', n: 3, size: 70, spread: 160 });
      }
    },
    key(e, down) {
      const l = LEFT.includes(e.code), r = RIGHT.includes(e.code);
      if (!l && !r) return false;
      if (tap(e, down, ...LEFT, ...RIGHT)) { f.flash(e.code); grab(l ? 0 : 1); }
      return true;
    },
    bot(dt) {
      botT -= dt;
      if (cueT > T * rand(0.8, 0.95) && botT <= 0) {
        botT = 0.2;
        const side = Math.random() < 0.93 ? next : next ^ 1;
        this.key(fake(side ? 'KeyD' : 'KeyA'), true);
      }
    },
    dispose: () => f.dispose(),
  };
}
