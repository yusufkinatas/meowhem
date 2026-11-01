import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, paw, furOf, pop, shake, burst, fake, tap, rand, clamp } from './kit';

const MASH = ['KeyA', 'KeyD', 'Space', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'];
const LIMP = 0.8;          // real scruff reflex: the cat goes still first
const PRESSES = { grab: 14, cage: 32 };
const HISS_BONUS = 4;

export function escape(host: MinigameHost): Game {
  const cage = host.data?.mode === 'cage';
  const f = frame(host, 'escape', cage ? 'Time-out' : 'Scruffed', cage
    ? [[['A', 'D', 'Space'], 'mash to rattle']]
    : [[['A', 'D', 'Space'], 'wiggle'], [['R'], 'hiss']]);
  const { stage, root } = f;
  root.classList.add(cage ? 'es-cage' : 'es-grab');
  const fur = furOf(host);
  const per = 1 / (cage ? PRESSES.cage : PRESSES.grab);

  let t = 0, swing = 0, swingV = 0, struggle = 0, hissed = false, botT = 0, side = 1;
  const tag = el('div', 'es-tag', stage, cage ? '' : 'limp');
  let cat: HTMLElement;
  let face: HTMLImageElement, faceMad: HTMLImageElement;
  let hand: HTMLImageElement | null = null;
  let door: HTMLElement | null = null;

  if (cage) {
    el('div', 'es-dark', stage);
    cat = place(el('div', 'es-cat', stage), 410 - 150, 70, 300, 300);
    face = img('pouting_cat', 'es-face', cat);
    faceMad = img('weary_cat', 'es-face mad', cat);
    door = place(el('div', 'es-door', stage), 150, 20, 520, 390);
    for (let i = 0; i < 13; i++) place(el('div', 'es-bar', door), 26 + i * 37, 0, 12, 390);
    for (const y of [120, 250]) place(el('div', 'es-rail', door), 0, y, 520, 12);
    el('div', 'es-frame', stage);
    tag.remove();
  } else {
    el('div', 'es-room', stage);
    cat = place(el('div', 'es-cat grabbed', stage), 302, 72, 240, 240);
    face = img('pouting_cat', 'es-face', cat);
    faceMad = img('weary_cat', 'es-face mad', cat);
    hand = place(img('pinching_hand', 'es-hand', stage), 280, -46, 210, 210);
  }

  const caps = [...f.root.querySelectorAll<HTMLElement>('.mg-kbd:not(.sm)')];

  function mash(code: string): void {
    if (!cage && t < LIMP) { shake(tag, 5, 200); return; }
    f.flash(code);
    side = -side;
    swingV += side * rand(5, 8);
    struggle = 1;
    host.progress(per);
    f.sound(cage ? 'cageClose' : Math.random() < 0.5 ? 'meowShort' : 'scratch');
    if (cage) {
      shake(door!, 7, 160);
      cat.animate({ scale: ['1', '1.08', '1'] }, { duration: 160 });
      if (Math.random() < 0.45) pokePaw();
    } else {
      shake(hand!, 6, 180);
      burst(stage, 410 + rand(-60, 60), 260, { cls: 'es-tuft', n: 2, size: 16, spread: 80, up: 10, fall: 120, ms: 900 });
      if (host.getProgress() > 0.5 && Math.random() < 0.3) burst(stage, 380, 70, { asset: 'sweat_droplets', n: 1, size: 40, spread: 40, up: 30 });
    }
  }

  function pokePaw(): void {
    const slot = Math.floor(rand(1, 12));
    const p = paw('beans', fur, 'es-poke', 'short');
    stage.appendChild(p);
    place(p, 150 + 26 + slot * 37 - 40, 210 + rand(-90, 60), 80, 112);
    p.style.rotate = `${rand(-25, 25)}deg`;
    p.animate({ scale: ['.3', '1.05', '1', '.3'], opacity: [0, 1, 1, 0] }, { duration: 520, easing: 'ease-out' }).onfinish = () => p.remove();
  }

  function hiss(): void {
    if (cage || hissed || t < LIMP) return;
    hissed = true;
    f.flash('KeyR');
    host.progress(per * HISS_BONUS);
    f.sound('hiss');
    burst(stage, 500, 150, { asset: 'anger_symbol', n: 1, size: 60, spread: 10, up: 20 });
    pop(cat, 1.15);
    swingV += 10;
    caps.at(-1)?.classList.add('dim');
  }

  return {
    update(dt) {
      const p = f.tick();
      t += dt;
      const limp = !cage && t < LIMP;
      caps.forEach((c, i) => c.classList.toggle('dim', limp || (i === caps.length - 1 && hissed && !cage)));
      if (!cage) {
        tag.textContent = limp ? 'limp' : p >= 0.999 ? '' : 'wiggle';
        tag.classList.toggle('go', !limp);
      }
      // pendulum
      swingV += (-swing * 30 - swingV * (limp ? 2 : 4)) * dt;
      swing += swingV * dt * 10;
      if (limp) swing = Math.sin(t * 2.4) * 4;
      struggle = Math.max(0, struggle - dt * 3);
      faceMad.style.opacity = struggle > 0.3 ? '1' : '0';
      face.style.opacity = struggle > 0.3 ? '0' : '1';
      if (!cage) {
        cat.style.rotate = `${clamp(swing, -40, 40)}deg`;
        cat.style.scale = limp ? `${1 - Math.sin(t * 2.4) * 0.01} ${1.04}` : `${1 + struggle * 0.06}`;
        hand!.style.rotate = `${90 + clamp(swing, -40, 40) * 0.15}deg`;
      }
      if (p >= 0.999 && !stage.classList.contains('free')) {
        stage.classList.add('free');
        f.sound('whoosh');
        if (cage) {
          door!.animate({ transform: ['none', 'perspective(800px) rotateY(-75deg)'] }, { duration: 420, fill: 'forwards', easing: 'cubic-bezier(.3,1.4,.5,1)' });
          door!.style.transformOrigin = '0 50%';
        } else {
          cat.animate({ translate: ['0 0', '0 -30px', '60px 420px'], rotate: ['0deg', '-20deg', '200deg'] }, { duration: 700, fill: 'forwards', easing: 'ease-in' });
          burst(stage, 410, 200, { asset: 'dashing_away', n: 3, size: 80, spread: 120 });
        }
      }
    },
    key(e, down) {
      if (tap(e, down, 'KeyR')) { hiss(); return true; }
      if (!MASH.includes(e.code) && e.code !== 'KeyR') return false;
      if (down && !e.repeat && MASH.includes(e.code)) mash(e.code);
      return true;
    },
    bot(dt) {
      botT -= dt;
      if (botT > 0) return;
      botT = rand(0.09, 0.16);
      this.key(fake(!hissed && !cage && t > 1.5 ? 'KeyR' : Math.random() < 0.5 ? 'KeyA' : 'KeyD'), true);
    },
    dispose: () => f.dispose(),
  };
}
