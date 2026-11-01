import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, paw, furOf, pop, shake, burst, tap, rand, clamp } from './kit';

const SW = 820, SH = 430;
const SY = 228;            // paw shadow height on the water
const RX = 62, RY = 46;    // strike zone
const KINDS = ['fish', 'tropical_fish', 'blowfish'];

interface Fish { e: HTMLImageElement; x: number; y: number; vx: number; base: number; amp: number; ph: number; size: number; dart: number }

export function fishing(host: MinigameHost): Game {
  const f = frame(host, 'fishing', 'Fish tank', [[['A', 'D'], 'move'], [['Space'], 'swipe']]);
  const { stage } = f;
  const fur = furOf(host);

  const floor = el('div', 'fs-floor', stage);
  for (const [a, x, y, s, r] of [
    ['rock', 30, 300, 120, -10], ['spiral_shell', 640, 340, 70, 20], ['rock', 700, 20, 90, 30],
    ['leafy_green', -20, 0, 170, 140], ['herb', 690, 250, 150, -60], ['leafy_green', 380, 350, 120, -20],
  ] as const) {
    const d = place(img(a, 'fs-decor', floor), x, y, s, s);
    d.style.rotate = `${r}deg`;
  }
  el('div', 'fs-tint', stage);
  el('div', 'fs-caustics', stage);
  const fishLayer = el('div', 'fs-fishes', stage);
  const ring = el('div', 'fs-ring', stage);
  const shadow = el('div', 'fs-shadow', stage);
  const pawEl = paw('beans', fur, 'fs-paw');
  stage.appendChild(pawEl);
  el('div', 'fs-glass', stage);
  const tally = el('div', 'fs-tally', stage);
  const slots = KINDS.map((k) => img(k, 'fs-slot', tally));
  const drops = el('div', 'fs-drops', stage);

  const fishes: Fish[] = KINDS.map((k, i) => {
    const size = k === 'blowfish' ? 84 : 96;
    const e = img(k, 'fs-fish', fishLayer);
    e.style.width = e.style.height = `${size}px`;
    return { e, size, x: rand(100, 700), y: 0, vx: (i % 2 ? 1 : -1) * rand(90, 150), base: 140 + i * 70, amp: rand(40, 70), ph: rand(0, 6), dart: 0 };
  });

  let px = SW / 2, vxIn = 0, t = 0, strikeT = -1, cool = 0, caught = 0, botAim = SW / 2;
  const held = new Set<string>();

  const inZone = (fi: Fish) => ((fi.x - px) / RX) ** 2 + ((fi.y - SY) / RY) ** 2 < 1;

  function strike(): void {
    if (cool > 0) return;
    cool = 0.6;
    strikeT = 0;
    pawEl.animate({ translate: ['0 0', '0 46px', '0 46px', '0 0'], scale: ['1', '0.84', '0.84', '1'] },
      { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1)' });
  }

  function impact(): void {
    f.sound('splash');
    ripple(px, SY);
    const hit = fishes.find(inZone);
    burst(stage, px, SY, { asset: 'droplet', n: hit ? 8 : 6, size: 22, spread: 110, up: 50, fall: 40 });
    if (hit) {
      fishes.splice(fishes.indexOf(hit), 1);
      caught++;
      host.progress(1 / 3);
      flip(hit);
      f.sound('pop');
    } else {
      shake(stage, 5);
      for (const fi of fishes) if (Math.abs(fi.x - px) < 200) { fi.vx = Math.sign(fi.x - px || 1) * 260; fi.dart = 0.8; }
      for (let i = 0; i < 3; i++) screenDrop();
    }
  }

  function flip(fi: Fish): void {
    const side = fi.x < SW / 2 ? -1 : 1;
    fi.e.classList.add('caught');
    fi.e.animate(
      [{ transform: `translate(${fi.x - fi.size / 2}px,${fi.y - fi.size / 2}px) rotate(0deg) scale(1)` },
        { transform: `translate(${fi.x + side * 120 - fi.size / 2}px,${fi.y - 200}px) rotate(${side * 300}deg) scale(1.7)`, offset: 0.45 },
        { transform: `translate(${fi.x + side * 330 - fi.size / 2}px,${SH + 80}px) rotate(${side * 620}deg) scale(1.9)` }],
      { duration: 900, easing: 'cubic-bezier(.3,.5,.5,1)', fill: 'forwards' },
    ).onfinish = () => fi.e.remove();
    const slot = slots[caught - 1];
    slot?.classList.add('got');
    if (slot) pop(slot, 1.5);
  }

  function ripple(x: number, y: number): void {
    const r = place(el('div', 'fs-ripple', stage), x - 60, y - 40, 120, 80);
    r.animate({ transform: ['scale(.2)', 'scale(1.8)'], opacity: [0.9, 0] }, { duration: 700, easing: 'ease-out' }).onfinish = () => r.remove();
  }

  function screenDrop(): void {
    const s = rand(40, 80);
    const d = place(img('droplet', 'fs-sdrop', drops), rand(40, SW - 100), rand(20, SH - 160), s, s);
    d.animate({ translate: ['0 0', `0 ${rand(60, 140)}px`], opacity: [0.85, 0.85, 0] }, { duration: rand(1400, 2200), easing: 'ease-in' }).onfinish = () => d.remove();
  }

  return {
    update(dt) {
      const p = f.tick();
      t += dt;
      cool -= dt;
      // another cat may have caught some
      while (fishes.length > 3 - Math.min(3, Math.floor(p * 3 + 0.01)) && fishes.length) { const fi = fishes.pop()!; caught++; flip(fi); }
      px = clamp(px + vxIn * dt * 420, 70, SW - 70);
      for (const fi of fishes) {
        fi.dart = Math.max(0, fi.dart - dt);
        if (!fi.dart) fi.vx += (Math.sign(fi.vx) * 120 - fi.vx) * dt * 1.5;
        fi.x += fi.vx * dt;
        if (fi.x < 60 || fi.x > SW - 60) { fi.vx = -fi.vx; fi.x = clamp(fi.x, 60, SW - 60); }
        fi.y = fi.base + Math.sin(t * 0.9 + fi.ph) * fi.amp;
        const flipX = fi.vx > 0 ? -1 : 1;
        fi.e.style.transform = `translate(${fi.x - fi.size / 2}px,${fi.y - fi.size / 2}px) scaleX(${flipX}) rotate(${Math.sin(t * 8 + fi.ph) * 6}deg)`;
      }
      const hot = fishes.some(inZone);
      ring.classList.toggle('hot', hot);
      ring.style.transform = shadow.style.transform = `translate(${px}px,${SY}px)`;
      pawEl.style.left = `${px - 75}px`;
      pawEl.style.top = `${SY - 30 + Math.sin(t * 3) * 6}px`;
      if (strikeT >= 0) {
        strikeT += dt;
        if (strikeT >= 0.11) { strikeT = -1; impact(); }
      }
      if (p >= 0.999 && !tally.classList.contains('done')) { tally.classList.add('done'); f.sound('ding'); }
    },
    key(e, down) {
      const l = e.code === 'KeyA' || e.code === 'ArrowLeft', r = e.code === 'KeyD' || e.code === 'ArrowRight';
      if (l || r) {
        if (down) held.add(e.code); else held.delete(e.code);
        vxIn = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
        if (down) f.flash(e.code);
        return true;
      }
      if (tap(e, down, 'Space')) { f.flash('Space'); strike(); return true; }
      return e.code === 'Space';
    },
    mouse(e) {
      const r = stage.getBoundingClientRect();
      if (e.type === 'mousemove') px = clamp(((e.clientX - r.left) / r.width) * SW, 70, SW - 70);
      if (e.type === 'mousedown') strike();
    },
    bot(dt) {
      // follow the fish closest to the shadow line, swipe when it's in the ring
      const target = fishes.reduce<Fish | null>((b, fi) => (!b || Math.abs(fi.y - SY) < Math.abs(b.y - SY) ? fi : b), null);
      if (target) botAim = target.x + target.vx * 0.15;
      px += clamp(botAim - px, -380 * dt, 380 * dt);
      if (fishes.some(inZone) && Math.random() < dt * 6) strike();
    },
    dispose: () => f.dispose(),
  };
}
