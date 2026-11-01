import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, paw, furOf, pop, shake, burst, fake, tap, rand, clamp } from './kit';

// ADDENDUM 4.4: top-down tank, paw along the rim, Space dips (0.35 s), catch = +0.334
const SW = 820, SH = 430, SY = 236;          // strike line (the paw's shadow on the water)
const PAW_W = 120, ZONE = 0.3 * PAW_W;       // a fish centre inside the middle 60 % of the paw is caught
const SPEED = 1.6 * SW, DIP = 0.35, CATCH = 0.334;
const MISS_LOCK = 0.5, BLOW_LOCK = 0.6;

interface Fish { e: HTMLImageElement; kind: string; x: number; y: number; vx: number; base: number; amp: number; w: number; ph: number; size: number; dart: number; stare: number; gone: boolean }

export function fishing(host: MinigameHost): Game {
  const f = frame(host, 'fishing', 'Go fishing', [[['A', 'D'], 'move'], [['Space'], 'dip']]);
  const { stage } = f;
  const fur = furOf(host);

  const floor = el('div', 'fs-floor', stage);
  for (const [a, x, y, s, r] of [
    ['rock', 24, 300, 120, -10], ['spiral_shell', 610, 330, 76, 20], ['rock', 700, 14, 90, 30],
    ['leafy_green', -30, -10, 170, 140], ['leafy_green', 690, 250, 150, -60], ['spiral_shell', 300, 18, 54, -30],
  ] as const) place(img(a, 'fs-decor', floor), x, y, s, s).style.rotate = `${r}deg`;
  el('div', 'fs-tint', stage);
  el('div', 'fs-caustics', stage);
  // bubbles rising from behind the rocks
  for (const [x, d] of [[70, 0], [96, 1.6], [770, 0.8], [744, 2.6]] as const) {
    const b = place(img('bubbles', 'fs-bubble', stage), x, SH, 34, 34);
    b.style.animationDelay = `${d}s`;
  }
  const fishLayer = el('div', 'fs-fishes', stage);
  const shadow = el('div', 'fs-shadow', stage);
  const pawEl = paw('back', fur, 'fs-paw');
  stage.appendChild(pawEl);
  pawEl.style.rotate = '180deg';
  el('div', 'fs-glass', stage);
  const tally = el('div', 'fs-tally', stage);
  const slots = ['fish', 'tropical_fish', 'fish'].map((k) => img(k, 'fs-slot', tally));
  const drops = el('div', 'fs-drops', stage);

  const fishes: Fish[] = [];
  function spawn(kind: string, i: number, fromEdge: boolean): void {
    const size = kind === 'blowfish' ? 92 : rand(84, 100);
    const e = img(kind, 'fs-fish', fishLayer);
    e.style.width = e.style.height = `${size}px`;
    const dir = Math.random() < 0.5 ? 1 : -1;
    fishes.push({
      e, kind, size, dart: 0, stare: 0, gone: false,
      x: fromEdge ? (dir > 0 ? -60 : SW + 60) : rand(120, 700), y: SY,
      vx: dir * (kind === 'blowfish' ? rand(50, 70) : rand(95, 150)),
      base: kind === 'blowfish' ? SY + rand(-30, 30) : 110 + (i % 3) * 110, amp: kind === 'blowfish' ? 40 : rand(70, 110),
      w: rand(0.7, 1.1), ph: rand(0, 6),
    });
  }
  ['fish', 'tropical_fish', 'fish', 'blowfish'].forEach((k, i) => spawn(k, i, false));

  let px = SW / 2, vx = 0, t = 0, dipT = -1, misses = 0, botAim = SW / 2, botWait = 0, lit = 0, spawnT = 0;
  const held = new Set<string>();
  const strikeX = () => px;

  function dip(): void {
    if (f.locked() || dipT >= 0) return;
    dipT = 0;
    f.sound('splash');
    pawEl.animate({ translate: ['0 0', '0 34px', '0 0'], scale: ['1', '.88', '1'] }, { duration: DIP * 1000, easing: 'ease-in-out' });
    shadow.animate({ scale: ['1', '.62', '1'], opacity: ['.9', '1', '.9'] }, { duration: DIP * 1000, easing: 'ease-in-out' });
  }

  function bottom(): void {
    const x = strikeX();
    ripple(x, SY);
    let best: Fish | null = null, bd = ZONE;
    for (const fi of fishes) {
      const d = Math.hypot(fi.x - x, fi.y - SY);
      if (!fi.gone && d < bd) { bd = d; best = fi; }
    }
    if (best && best.kind !== 'blowfish') {
      misses = 0;
      best.gone = true;
      f.report(CATCH);
      f.sound('plop');
      burst(stage, x, SY, { asset: 'droplet', n: 8, size: 22, spread: 110, up: 50, fall: 40 });
      flip(best);
      return;
    }
    if (best) {
      // the blowfish: nothing happens, the paw slides off and it just stares
      f.lock(BLOW_LOCK);
      f.sound('pop');
      best.stare = 1.2;
      best.vx = 0;
      pop(best.e, 1.18, 360);
      pawEl.animate({ translate: ['0 34px', `${best.x < x ? 70 : -70}px 20px`, '0 0'], rotate: ['180deg', `${best.x < x ? 194 : 166}deg`, '180deg'] }, { duration: 500, easing: 'ease-out' });
      return;
    }
    misses++;
    f.lock(MISS_LOCK);
    for (const fi of fishes) if (!fi.gone && Math.abs(fi.x - x) < 240) { fi.vx = Math.sign(fi.x - x || 1) * 300; fi.dart = 0.8; }
    burst(stage, x, SY - 30, { asset: 'droplet', n: 6, size: 18, spread: 90, up: 40, fall: 50 });
    if (misses >= 3) {
      // the big disgusted flick
      misses = 0;
      pawEl.animate({ rotate: ['180deg', '158deg', '198deg', '164deg', '192deg', '180deg'], translate: ['0 0', '0 -26px', '0 -10px', '0 -22px', '0 -6px', '0 0'] }, { duration: 1000, easing: 'ease-out' });
      for (let i = 0; i < 6; i++) setTimeout(() => burst(stage, strikeX(), SY - 50, { asset: 'droplet', n: 3, size: 20, spread: 160, up: 80, fall: 60 }), i * 140);
      for (let i = 0; i < 4; i++) screenDrop();
    } else {
      shake(pawEl, 7, 420);
      screenDrop();
    }
  }

  function flip(fi: Fish): void {
    const s = fi.x < SW / 2 ? -1 : 1;
    fi.e.classList.add('caught');
    fi.e.animate(
      [{ transform: `translate(${fi.x - fi.size / 2}px,${fi.y - fi.size / 2}px) rotate(0deg) scale(1)` },
        { transform: `translate(${fi.x + s * 120 - fi.size / 2}px,${fi.y - 190}px) rotate(${s * 300}deg) scale(1.7)`, offset: 0.45 },
        { transform: `translate(${fi.x + s * 360 - fi.size / 2}px,${SH + 90}px) rotate(${s * 640}deg) scale(1.9)` }],
      { duration: 900, easing: 'cubic-bezier(.3,.5,.5,1)', fill: 'forwards' },
    ).onfinish = () => { fi.e.remove(); fishes.splice(fishes.indexOf(fi), 1); };
    spawnT = 1.2;
  }

  function ripple(x: number, y: number): void {
    const r = place(el('div', 'fs-ripple', stage), x - 60, y - 40, 120, 80);
    r.animate({ transform: ['scale(.2)', 'scale(1.8)'], opacity: [0.9, 0] }, { duration: 700, easing: 'ease-out' }).onfinish = () => r.remove();
  }

  function screenDrop(): void {
    const s = rand(40, 76);
    const d = place(img('droplet', 'fs-sdrop', drops), rand(40, SW - 100), rand(20, SH - 160), s, s);
    d.animate({ translate: ['0 0', `0 ${rand(60, 140)}px`], opacity: [0.85, 0.85, 0] }, { duration: rand(1400, 2200), easing: 'ease-in' }).onfinish = () => d.remove();
  }

  return {
    update(dt) {
      const p = f.tick(dt);
      t += dt;
      // the tally follows the shared bar (a teammate's catches count too)
      const want = Math.min(3, Math.floor(p * 3 + 0.01));
      while (lit < want) { slots[lit].classList.add('got'); pop(slots[lit], 1.5); lit++; }
      if (spawnT > 0 && (spawnT -= dt) <= 0 && p < 0.999 && fishes.filter((x) => x.kind !== 'blowfish').length < 3) spawn(Math.random() < 0.5 ? 'fish' : 'tropical_fish', fishes.length, true);
      const input = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      vx += (input * SPEED - vx) * Math.min(1, dt * 14);
      px = clamp(px + vx * dt, 70, SW - 70);
      for (const fi of fishes) {
        if (fi.gone) continue;
        fi.dart = Math.max(0, fi.dart - dt);
        fi.stare = Math.max(0, fi.stare - dt);
        if (fi.stare > 0) { fi.e.style.transform = `translate(${fi.x - fi.size / 2}px,${fi.y - fi.size / 2}px) scale(1.12)`; continue; }
        const cruise = fi.kind === 'blowfish' ? 60 : 120;
        if (!fi.dart) fi.vx += (Math.sign(fi.vx || 1) * cruise - fi.vx) * dt * 1.5;
        fi.x += fi.vx * dt;
        if ((fi.x < 60 && fi.vx < 0) || (fi.x > SW - 60 && fi.vx > 0)) fi.vx = -fi.vx;
        fi.y = fi.base + Math.sin(t * fi.w + fi.ph) * fi.amp;
        fi.e.style.transform = `translate(${fi.x - fi.size / 2}px,${fi.y - fi.size / 2}px) scaleX(${fi.vx > 0 ? -1 : 1}) rotate(${Math.sin(t * 8 + fi.ph) * 6}deg)`;
      }
      shadow.style.transform = `translate(${px}px,${SY}px)`;
      // the paw reaches in from the far rim (arm up, toes down) so it never hides its own shadow
      place(pawEl, px - PAW_W / 2, SY - 196 + Math.sin(t * 3) * 5, PAW_W, 168);
      if (dipT >= 0) {
        const before = dipT;
        dipT += dt;
        if (before < DIP / 2 && dipT >= DIP / 2) bottom();
        if (dipT >= DIP) dipT = -1;
      }
    },
    key(e, down) {
      const lr = ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(e.code);
      if (lr) {
        if (down) { held.add(e.code); if (!e.repeat) f.flash(e.code); } else held.delete(e.code);
        return true;
      }
      if (e.code !== 'Space') return false;
      if (tap(e, down, 'Space')) { f.flash('Space'); dip(); }
      return true;
    },
    mouse(e) {
      const r = stage.getBoundingClientRect();
      if (e.type === 'mousemove') px = clamp(((e.clientX - r.left) / r.width) * SW, 70, SW - 70);
      if (e.type === 'mousedown' && e.button === 0) dip();
    },
    bot(dt) {
      // a human-ish fisher: follow the nearest real fish, dip when it's under the paw, avoid the blowfish
      const real = fishes.filter((fi) => !fi.gone && fi.kind !== 'blowfish');
      const tgt = real.reduce<Fish | null>((b, fi) => (!b || Math.abs(fi.y - SY) < Math.abs(b.y - SY) ? fi : b), null);
      if (tgt) botAim = tgt.x + tgt.vx * 0.2;
      const dx = botAim - px;
      const want = (c: string, on: boolean) => { if (on !== held.has(c)) this.key(fake(c, on), on); };
      want('KeyD', dx > 30);
      want('KeyA', dx < -30);
      botWait -= dt;
      const blow = fishes.some((fi) => fi.kind === 'blowfish' && Math.hypot(fi.x - px, fi.y - SY) < ZONE);
      // human-ish: commits a bit early or late now and then
      const close = tgt && Math.hypot(tgt.x + tgt.vx * rand(-0.5, 0.3) - px, tgt.y - SY) < ZONE * 1.3;
      // ...and sometimes just swipes at nothing, like people do
      if (botWait <= 0 && !blow && (close || Math.random() < dt * 0.5)) { botWait = rand(0.9, 1.5); this.key(fake('Space'), true); }
    },
    finish() { f.finish(); },
    dispose: () => f.dispose(),
  };
}
