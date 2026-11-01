import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, paw, furOf, pop, burst, fake, gate, tap, rand, clamp, OTHER_FUR } from './kit';

// ADDENDUM 4.3: each pull +2.2 rad/s (cap 14), friction 3 rad/s², progress = spin x 0.011 per second
const KICK = 2.2, MAX_SPIN = 14, FRICTION = 3, RATE = 0.011, RIP = 0.03, RIP_GAP = 0.12;
// roll_of_paper.svg drawn W px; the hanging sheet's bottom edge spans units 5.2..22.8 at y 29.2
const W = 230, X0 = 300, Y0 = -12, U = W / 32;
const SHEET = { x: X0 + 5.2 * U, w: 17.6 * U, y: Y0 + 29.2 * U };
const PULL = ['KeyS', 'ArrowDown'];

export function tpSpin(host: MinigameHost): Game {
  const f = frame(host, 'tpSpin', 'Unroll it', [[['S', '↓', 'Wheel'], 'pull']]);
  const { stage } = f;
  const fur = furOf(host);
  const mid = SHEET.x + SHEET.w / 2;

  const roll = place(img('roll_of_paper', 'tp-roll', stage), X0, Y0, W, W);
  const strip = place(el('div', 'tp-strip', stage), SHEET.x, SHEET.y - 2, SHEET.w, 460);
  const arcs = [place(el('div', 'tp-arc', stage), X0 - 26, Y0 + 50, 60, 120), place(el('div', 'tp-arc r', stage), X0 + W - 30, Y0 + 50, 60, 120)];
  // the pile: paper folds heaped up, growing past the bottom edge
  const pile = el('div', 'tp-pile', stage);
  const folds: HTMLElement[] = [];
  const mound = place(el('div', 'tp-mound', pile), mid - 260, 250, 520, 240);
  for (let i = 0; i < 54; i++) {
    // loops of streamer heaped into a mound
    const r = i / 54, w = rand(70, 130), h = w * rand(0.45, 0.8);
    const x = mid - w / 2 + rand(-1, 1) * 280 * (1 - r * 0.78);
    const e = place(el('div', 'tp-fold', pile), x, 420 - r * 220 + rand(-10, 10) - h / 2, w, h);
    e.style.rotate = `${rand(-40, 40) + (Math.random() < 0.35 ? 180 : 0)}deg`;
    folds.push(e);
  }
  const me = paw('back', fur, 'tp-paw claws');
  stage.appendChild(me);
  place(me, mid - 62, 236, 124, 174);
  const buddy = paw('back', OTHER_FUR, 'tp-paw tp-buddy claws');
  stage.appendChild(buddy);
  place(buddy, mid + 60, 250, 110, 154);
  buddy.style.rotate = '-24deg';

  const cap = gate(1 / 0.06);
  let spin = 0, scroll = 0, lastPull = -9, lastRip = -9, shown = 0, whooshT = 0, buddyT = 0, botT = 0, gone = false, t = 0;

  function pull(): void {
    if (f.locked() || !cap()) return;
    if (t - lastPull < RIP_GAP && t - lastRip > 1) {
      lastRip = t;
      f.report(RIP);
      f.sound('paperRip');
      burst(stage, mid + rand(-30, 30), 300, { cls: 'tp-bit', n: 5, size: 26, spread: 160, up: 60, fall: 180, ms: 1100 });
    }
    lastPull = t;
    spin = Math.min(MAX_SPIN, spin + KICK);
    me.animate({ translate: ['0 0', '0 54px', '0 0'], scale: ['1', '.94 1.04', '1'] }, { duration: 230, easing: 'cubic-bezier(.3,.8,.4,1)' });
    roll.animate({ translate: ['0 0', '0 6px', '0 0'] }, { duration: 160 });
  }

  const wheel = (e: WheelEvent) => { if (e.deltaY) { f.flash('Wheel'); pull(); } };
  host.container.addEventListener('wheel', wheel, { passive: true });

  return {
    update(dt) {
      const p = f.tick(dt);
      t += dt;
      spin = Math.max(0, spin - FRICTION * dt);
      if (p < 0.999) f.stream(spin * RATE * dt);
      scroll += spin * 42 * dt;
      strip.style.backgroundPositionY = `${scroll}px`;
      roll.style.rotate = `${Math.sin(t * spin * 2) * spin * 0.12}deg`;
      for (const a of arcs) a.style.opacity = `${clamp((spin - 6) / 6) * (0.6 + Math.sin(t * 30) * 0.3)}`;
      whooshT -= dt;
      if (spin > 8 && whooshT < 0) { whooshT = 0.5; f.sound('whoosh', { volume: 0.4 }); }
      const want = Math.floor(clamp(p * 1.05) * folds.length);
      while (shown < want) { folds[shown].classList.add('on'); pop(folds[shown], 1.12, 180); shown++; }
      pile.style.translate = `0 ${-p * 40}px`;
      mound.style.scale = `${clamp(p * 1.1)}`;
      // another cat pulling too
      if (f.helpers() > 0 && p < 0.999) {
        buddyT -= dt;
        buddy.classList.add('on');
        if (buddyT < 0) { buddyT = rand(0.3, 0.5); buddy.animate({ translate: ['0 0', '0 46px', '0 0'] }, { duration: 240 }); }
      } else buddy.classList.remove('on');
      if (p >= 0.999 && !gone) {
        gone = true;
        f.sound('paperRip');
        strip.classList.add('cut');
        roll.animate({ translate: ['0 0', '80px 40px', '640px 300px'], rotate: ['0deg', '200deg', '900deg'], scale: ['1', '.62', '.5'] },
          { duration: 1100, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' });
        burst(stage, mid, 260, { cls: 'tp-bit', n: 14, size: 24, spread: 280, up: 120, fall: 220, ms: 1300 });
      }
    },
    key(e, down) {
      if (!PULL.includes(e.code)) return false;
      if (tap(e, down, ...PULL)) { f.flash(e.code); pull(); }
      return true;
    },
    bot(dt) {
      botT -= dt;
      if (botT > 0) return;
      // steady pulls with the odd quick double for a rip
      const dbl = t - lastRip > 1.2 && Math.random() < 0.3;
      botT = dbl ? 0.08 : rand(0.26, 0.34);
      this.key(fake('KeyS'), true);
    },
    finish() { f.finish(); },
    dispose: () => { host.container.removeEventListener('wheel', wheel); f.dispose(); },
  };
}
