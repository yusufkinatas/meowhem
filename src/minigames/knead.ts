import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, paw, furOf, pop, fake, side, rand } from './kit';

// ADDENDUM 4.6: 100 BPM. Odd beats left (A), even beats right (D). Right key within ±150 ms = +1/14.
const BEAT = 0.6, WINDOW = 0.15, STEP = 1 / 14, MISS_LOCK = 0.4, DOZE = 2;
const PX = [262, 558], PY = 150;

export function knead(host: MinigameHost): Game {
  const f = frame(host, 'knead', 'Make biscuits', [[['A', '←'], 'left'], [['D', '→'], 'right'], [[], 'on the beat']]);
  const { stage } = f;
  const fur = furOf(host);

  const pillow = el('div', 'kn-pillow', stage);
  el('div', 'kn-seam', pillow);
  const dents = el('div', 'kn-dents', pillow);
  const paws = PX.map((x) => {
    const p = paw('beans', fur, 'kn-paw');
    stage.appendChild(p);
    place(p, x - 78, PY, 156, 218);
    return p;
  });
  const marker = place(el('div', 'kn-beat', stage), 410 - 46, 196, 92, 92);
  const ring = el('div', 'kn-ring', marker);
  const tags = PX.map((x, i) => place(el('div', 'kn-tag', stage, i ? 'D' : 'A'), x - 22, PY - 58));
  const zzz = place(img('zzz', 'kn-zzz', stage), 560, 40, 110, 110);

  // beat k happens at k * BEAT; k odd -> left
  let t = BEAT * 0.5, scored = -1, streak = 0, lastInput = 0, dozing = false, purrT = 0, checked = 0, botT = 0, drooled = false;
  const beatSide = (k: number) => (k % 2 ? -1 : 1);

  function press(s: -1 | 1): void {
    lastInput = t;
    if (dozing) {
      // this press only wakes it up
      dozing = false;
      zzz.classList.remove('on');
      pop(stage, 1.02, 200);
      return;
    }
    if (f.locked()) return;
    const k = Math.round(t / BEAT);
    const i = s < 0 ? 0 : 1;
    if (Math.abs(t - k * BEAT) > WINDOW || k < 1) return miss(i);
    if (k === scored) {
      // two presses inside one beat: claws out, a thread snags
      streak = 0;
      paws[i].classList.add('claws');
      setTimeout(() => paws[i].classList.remove('claws'), 260);
      f.sound('scratch');
      const sn = place(el('div', 'kn-snag', dents), PX[i] - 14 + rand(-24, 24), PY + 6 + rand(-10, 20), 28, 18);
      sn.animate({ opacity: [1, 0.6] }, { duration: 2000, fill: 'forwards' });
      return;
    }
    if (beatSide(k) !== s) return miss(i);
    scored = k;
    streak++;
    f.report(STEP);
    f.sound('pop', { volume: 0.5 });
    paws[i].animate({ scale: ['1 1', '1.08 .88', '1 1'], translate: ['0 0', '0 14px', '0 0'] }, { duration: 260, easing: 'ease-out' });
    const d = place(el('div', 'kn-dent', dents), PX[i] - 70, PY + 10, 140, 100);
    d.animate({ opacity: [0.9, 0], scale: ['1', '1.15'] }, { duration: 1400, easing: 'ease-in' }).onfinish = () => d.remove();
    pillow.animate({ scale: ['1 1', '1.01 .985', '1 1'] }, { duration: 260 });
    if (streak === 8 && !drooled) {
      drooled = true;
      const dr = place(img('droplet', 'kn-drool', stage), 404, 150, 26, 26);
      dr.animate({ translate: ['0 0', '0 30px', '0 210px'], scale: ['.4', '1', '1'], opacity: [1, 1, 0] }, { duration: 1500, easing: 'ease-in' }).onfinish = () => dr.remove();
    }
  }

  function miss(i: number): void {
    // off-beat or wrong paw: freeze, a side-glance wobble, streak gone
    streak = 0;
    f.lock(MISS_LOCK);
    paws.forEach((p) => p.animate({ rotate: ['0deg', `${i ? 6 : -6}deg`, `${i ? -4 : 4}deg`, '0deg'] }, { duration: MISS_LOCK * 1000, easing: 'ease-in-out' }));
    marker.animate({ translate: ['0 0', '-8px 0', '8px 0', '0 0'] }, { duration: 300 });
  }

  return {
    update(dt) {
      const p = f.tick(dt);
      t += dt;
      // a beat that passed with no press breaks the streak
      const kNow = Math.floor((t - WINDOW) / BEAT);
      if (kNow > checked) { checked = kNow; if (scored < kNow) { streak = 0; drooled = false; } }
      if (!dozing && t - lastInput > DOZE && p < 0.999) { dozing = true; zzz.classList.add('on'); pop(zzz, 1.2); }
      // the beat marker: a ring closing on each beat, the next paw lit
      const k = Math.ceil((t - WINDOW) / BEAT);
      const phase = 1 - (k * BEAT - t) / BEAT;
      ring.style.scale = `${2.2 - 1.2 * Math.min(1, Math.max(0, phase))}`;
      ring.style.opacity = dozing ? '0' : `${Math.min(1, phase * 1.6)}`;
      marker.classList.toggle('hit', Math.abs(t - Math.round(t / BEAT) * BEAT) < 0.07 && !dozing);
      marker.dataset.side = beatSide(k) < 0 ? 'l' : 'r';
      tags.forEach((g, i) => g.classList.toggle('next', !dozing && p < 0.999 && beatSide(k) === (i ? 1 : -1)));
      purrT -= dt;
      if (!dozing && streak > 0 && purrT < 0) { purrT = 1.6; f.sound('purr', { volume: Math.min(1, 0.3 + 0.08 * streak) }); }
      pillow.classList.toggle('done', p >= 0.999);
    },
    key(e, down) {
      const s = side(e.code);
      if (!s) return false;
      if (down && !e.repeat) { f.flash(e.code); press(s); }
      return true;
    },
    bot(dt) {
      // presses near each beat with a little human jitter
      botT -= dt;
      const k = Math.round(t / BEAT);
      const off = t - k * BEAT;
      if (dozing) { this.key(fake('KeyA'), true); return; }
      if (k >= 1 && k !== scored && off > -0.06 && off < 0.08 && botT <= 0) {
        botT = 0.3;
        const s = Math.random() < 0.95 ? beatSide(k) : -beatSide(k);
        this.key(fake(s < 0 ? 'KeyA' : 'KeyD'), true);
      }
    },
    finish() { f.finish(); },
    dispose: () => f.dispose(),
  };
}
