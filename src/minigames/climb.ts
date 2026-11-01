import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, paw, furOf, shake, burst, fake, gate, side, rand, clamp } from './kit';

// ADDENDUM 4.5: alternate A/D (+0.04, cap 4/s). The curtain sways (2.4 s); in an extreme hold Space.
const STEP = 0.04, PERIOD = 2.4, EXTREME = 0.8, SLIP_LOCK = 0.6;
const H = 1400, VIEW = 430;          // curtain strip height vs visible stage
const PX = [330, 490];               // paw x (left, right)

export function climb(host: MinigameHost): Game {
  const f = frame(host, 'climb', 'Climb the curtains', [[['A', '←'], 'left paw'], [['D', '→'], 'right paw'], [['Space'], 'hang on']]);
  const { stage, root } = f;
  const fur = furOf(host);

  const sway = el('div', 'cl-sway', stage);
  const strip = place(el('div', 'cl-strip', sway), -40, 0, 900, H);
  el('div', 'cl-fabric', strip);
  el('div', 'cl-light', strip);
  const marks = el('div', 'cl-marks', strip);
  const paws = PX.map((x) => {
    const p = paw('back', fur, 'cl-paw claws');
    stage.appendChild(p);
    place(p, x - 68, 200, 136, 190);
    return p;
  });
  const gauge = el('div', 'cl-gauge', stage);
  el('i', 'cl-zone l', gauge);
  el('i', 'cl-zone r', gauge);
  const needle = el('b', 'cl-needle', gauge);
  const meter = el('div', 'cl-meter', stage);
  const me = img('cat_face', 'cl-me', meter);

  const cap = gate(4);
  let t = 0, last = 0, space = false, slide = 0, view = -(H - VIEW), botT = 0, over = 0;
  const pawY = [200, 200];
  const swayAt = (tt: number) => Math.sin((tt / PERIOD) * Math.PI * 2);
  const extreme = () => Math.abs(swayAt(t)) > EXTREME;

  function slip(): void {
    f.lock(SLIP_LOCK);
    slide = 0.05;
    f.sound('scratch', { pitch: 1.3 });
    shake(stage, 8, 360);
    for (const x of PX) scratch(x, 230, 80);
    paws.forEach((p, i) => p.animate({ translate: ['0 0', '0 30px', '0 0'], rotate: ['0deg', `${i ? 7 : -7}deg`, '0deg'] }, { duration: 600, easing: 'ease-out' }));
    burst(stage, 410, 260, { cls: 'cl-thread', n: 6, size: 18, spread: 130, up: -30, fall: 110 });
  }

  function grab(s: -1 | 1): void {
    const same = s === last;
    last = s;
    if (f.locked()) return;
    if (extreme()) { if (!space) slip(); return; }
    if (same) { slip(); return; }
    if (!cap()) return;
    const i = s < 0 ? 0 : 1;
    f.report(STEP);
    pawY[i] = 150;
    pawY[i ^ 1] = 236;
    paws[i].animate({ scale: ['1', '1.1', '.96', '1'] }, { duration: 220, easing: 'ease-out' });
    scratch(PX[i], 190, 22);
    f.sound('scratch');
  }

  /** claw marks stay on the fabric (strip coordinates) */
  function scratch(x: number, yScreen: number, len: number): void {
    // beside the paw, where the outer claws dig in (the arm hides the middle)
    const m = place(el('div', 'cl-mark', marks), x + 40 - 24 + (x < 410 ? -66 : 66), yScreen - view, 48, len);
    m.animate({ opacity: [0, 1] }, { duration: 120 });
    if (marks.childElementCount > 50) marks.firstElementChild?.remove();
  }

  return {
    update(dt) {
      const p = f.tick(dt);
      if (p >= 0.999 && !over) {
        // the paws stop. One small meow. Then the whole thing comes down.
        over = t;
        f.sound('meowShort', { pitch: 1.4 });
        setTimeout(() => shake(f.panel, 12, 300), 350);
        setTimeout(() => root.classList.add('cl-fall'), 520);
      }
      if (!over) t += dt;
      const sw = swayAt(t);
      sway.style.transform = `translateX(${sw * 16}px) skewX(${sw * 2.2}deg)`;
      needle.style.left = `${50 + sw * 46}%`;
      const ext = Math.abs(sw) > EXTREME && !over;
      gauge.classList.toggle('hot', ext);
      f.dim('Space', !ext);
      paws.forEach((pw) => pw.classList.toggle('tight', ext && space));
      slide = Math.max(0, slide - dt * (0.05 / SLIP_LOCK));
      const target = -(H - VIEW) * (1 - clamp(p - slide));
      view += (target - view) * Math.min(1, dt * 8);
      strip.style.transform = `translateY(${view}px)`;
      paws.forEach((pw, i) => {
        pawY[i] += (200 - pawY[i]) * Math.min(1, dt * 4);
        pw.style.top = `${pawY[i] + (ext && !space ? Math.sin(t * 40 + i) * 3 : 0)}px`;
      });
      me.style.bottom = `${clamp(p - slide) * 300}px`;
    },
    key(e, down) {
      if (e.code === 'Space') { space = down; if (down && !e.repeat) f.flash('Space'); return true; }
      const s = side(e.code);
      if (!s) return false;
      if (down && !e.repeat) { f.flash(e.code); grab(s); }
      return true;
    },
    bot(dt) {
      // hang on through the extremes, climb steadily in between
      const ext = Math.abs(swayAt(t + 0.08)) > EXTREME || extreme();
      if (ext !== space) this.key(fake('Space', ext), ext);
      botT -= dt;
      if (botT > 0 || ext || f.locked()) return;
      botT = rand(0.26, 0.3);
      const s = Math.random() < 0.96 ? -last || -1 : last || 1;
      this.key(fake(s < 0 ? 'KeyA' : 'KeyD'), true);
    },
    finish() { f.finish(); },
    dispose: () => f.dispose(),
  };
}
