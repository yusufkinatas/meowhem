import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, paw, furOf, pop, shake, burst, fake, gate, tap, rand } from './kit';

// ADDENDUM 4.2: bat the handle. +0.025 per tap, at most one every 0.12 s.
const PER_TAP = 0.025, DROP_AFTER = 0.8;
// potable_water.svg: viewBox 17 x 12 units starting at (9.4, 4.2), drawn TW px wide
const TW = 270, TX = 300, TY = 8, U = TW / 17;
const tp = (x: number, y: number) => ({ x: TX + (x - 9.4) * U, y: TY + (y - 4.2) * U });
const PIVOT = tp(19.36, 8.0), HANDLE = tp(19.36, 6.2), SPOUT = tp(12.36, 15.0);
// bathtub_empty.svg (32 units), its own little tap cropped off; rim at 49 % of its height
const BW = 430, BX = SPOUT.x - BW * 0.47, RIM = 292, BY = RIM - BW * 0.49;
const HOME = { x: 690, y: 236, r: -22 };

export function faucet(host: MinigameHost): Game {
  const f = frame(host, 'faucet', 'Run a bath', [[['Space', 'LMB'], 'bat the handle']]);
  const { stage } = f;
  const fur = furOf(host);

  const tub = place(img('bathtub_empty', 'fc-tub', stage), BX, BY, BW, BW);
  const stream = place(el('div', 'fc-stream', stage), SPOUT.x - 15, SPOUT.y - 4, 30, RIM - SPOUT.y + 24);
  const foam = [0, 1, 2, 3, 4].map((i) => place(img('bubbles', 'fc-foam', stage), BX + 70 + i * 60 + rand(-8, 8), RIM - 72 + rand(-6, 6), 84, 84));
  stage.appendChild(tub);
  place(img('potable_water', 'fc-tap', stage), TX, TY, TW, 12 * U);
  const handle = place(img('potable_water', 'fc-tap fc-handle', stage), TX, TY, TW, 12 * U);
  handle.style.transformOrigin = `${PIVOT.x - TX}px ${PIVOT.y - TY}px`;
  const drop = place(img('droplet', 'fc-drop', stage), SPOUT.x - 15, SPOUT.y - 6, 30, 30);
  const glass = el('div', 'fc-glass', stage);
  const p1 = paw('beans', fur, 'fc-paw');
  stage.appendChild(p1);
  place(p1, HOME.x - 70, HOME.y, 140, 196);
  p1.style.rotate = `${HOME.r}deg`;

  const cap = gate(1 / 0.12);
  let ang = 0, angV = 0, caught = false, idle = 9, sputtered = false, gushed = false, dripT = 0, botT = 0;

  function swat(): void {
    if (f.locked()) return;
    if (!cap()) return;
    idle = 0;
    const p = host.getProgress();
    p1.animate({ translate: ['0 0', `${(HANDLE.x - HOME.x) * 0.9}px ${(HANDLE.y - HOME.y + 40) * 0.9}px`, '0 0'], rotate: [`${HOME.r}deg`, `${HOME.r + 12}deg`, `${HOME.r}deg`] },
      { duration: 210, easing: 'cubic-bezier(.3,.8,.4,1)' });
    if (!caught) {
      // the handle had dropped back: this tap only re-catches it
      caught = true;
      angV -= 140;
      f.sound('clink', { pitch: 0.7 });
      return;
    }
    angV -= 260;
    f.report(PER_TAP);
    f.sound('clink', { pitch: 0.9 + p * 0.7 });
    burst(stage, HANDLE.x, HANDLE.y, { cls: 'fc-spark', n: 3, size: 10, spread: 40, up: 16 });
  }

  function sputter(): void {
    sputtered = true;
    f.sound('splash');
    f.lock(0.3);
    burst(stage, SPOUT.x, SPOUT.y + 8, { asset: 'droplet', n: 10, size: 26, spread: 150, up: 40, fall: 60, ms: 800 });
    for (let i = 0; i < 5; i++) {
      const s = rand(38, 70);
      const d = place(img('droplet', 'fc-sdrop', glass), rand(40, 760), rand(10, 260), s, s);
      d.animate({ translate: ['0 0', `0 ${rand(60, 140)}px`], opacity: [0.9, 0.9, 0] }, { duration: rand(1300, 2100), easing: 'ease-in' }).onfinish = () => d.remove();
    }
    p1.animate({ translate: ['0 0', '40px 70px', '0 0'], rotate: [`${HOME.r}deg`, `${HOME.r + 25}deg`, `${HOME.r}deg`] }, { duration: 320, easing: 'ease-out' });
  }

  function gush(): void {
    gushed = true;
    f.sound('waterRun');
    stream.classList.add('on');
    drop.classList.remove('on');
    foam.forEach((b, i) => setTimeout(() => { b.classList.add('on'); pop(b, 1.3); }, 120 + i * 90));
    burst(stage, SPOUT.x, RIM - 10, { asset: 'droplet', n: 12, size: 24, spread: 180, up: 70, fall: 50, ms: 900 });
    p1.animate({ translate: ['0 0', '120px 200px'], rotate: [`${HOME.r}deg`, `${HOME.r + 40}deg`] }, { duration: 260, easing: 'ease-in', fill: 'forwards' });
    shake(p1, 10, 400);
  }

  return {
    update(dt) {
      const p = f.tick(dt);
      idle += dt;
      if (caught && idle > DROP_AFTER && !gushed) { caught = false; angV += 90; }
      const target = gushed ? -75 : caught ? -(14 + p * 56) : 0;
      angV += ((target - ang) * 90 - angV * 11) * dt;
      ang += angV * dt;
      handle.style.rotate = `${ang}deg`;
      if (p >= 0.4 && !gushed) drop.classList.add('on');
      drop.style.scale = `${0.7 + Math.min(1, p) * 0.5 + Math.sin(performance.now() / 90) * 0.06}`;
      if (p >= 0.7 && !sputtered) sputter();
      if (p >= 0.7 && !gushed) {
        dripT -= dt;
        if (dripT < 0) {
          dripT = rand(0.35, 0.7);
          const d = place(img('droplet', 'fc-fall', stage), SPOUT.x - 10, SPOUT.y + 4, 20, 20);
          d.animate({ translate: ['0 0', `0 ${RIM - SPOUT.y - 20}px`], scale: ['.6', '1'] }, { duration: 380, easing: 'ease-in' }).onfinish = () => d.remove();
        }
      }
      if (p >= 0.999 && !gushed) gush();
    },
    key(e, down) {
      if (e.code !== 'Space') return false;
      if (tap(e, down, 'Space')) { f.flash('Space'); swat(); }
      return true;
    },
    mouse(e) {
      if (e.type === 'mousedown' && e.button === 0) { f.flash('Mouse0'); swat(); }
    },
    bot(dt) {
      botT -= dt;
      if (botT > 0) return;
      botT = rand(0.16, 0.2);
      this.key(fake('Space'), true);
    },
    finish() { f.finish(); },
    dispose: () => f.dispose(),
  };
}
