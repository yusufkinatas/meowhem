import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, paw, furOf, pop, shake, burst, fake, tap, LEFT, RIGHT, rand, clamp } from './kit';

const SWATS = 28;
// bathtub_empty.svg is 32 units square, drawn at W px: unit -> stage px
const W = 480, TX = 170, TY = -14, U = W / 32;
const NOZ = { x: TX + 20.55 * U, y: TY + 9.4 * U };
const RIM = TY + 15.6 * U;
const KNOB = { x: TX + 25.1 * U, y: TY + 11.6 * U };

export function faucet(host: MinigameHost): Game {
  const f = frame(host, 'faucet', 'Run a bath', [[['A', '←'], 'left paw'], [['D', '→'], 'right paw'], [[], 'alternate']]);
  const { stage } = f;
  const fur = furOf(host);

  const tub = place(img('bathtub_empty', 'fc-tub', stage), TX, TY, W, W);
  const stream = el('div', 'fc-stream', stage);
  const foam: HTMLImageElement[] = [];
  for (let i = 0; i < 9; i++) {
    const s = rand(70, 110);
    const b = place(img('bubbles', 'fc-foam', stage), TX + 3.6 * U + i * 2.6 * U - s * 0.3 + rand(-8, 8), RIM - s * 0.72 + rand(-6, 10), s, s);
    b.style.rotate = `${rand(-30, 30)}deg`;
    foam.push(b);
  }
  stage.appendChild(tub); // tub in front of foam bottoms
  stage.appendChild(stream);
  const knob = place(el('div', 'fc-knob', stage), KNOB.x - 34, KNOB.y - 34, 68, 68);
  knob.innerHTML = `<svg viewBox="-34 -34 68 68"><defs>
      <linearGradient id="fck" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4F2F7"/><stop offset=".55" stop-color="#B9B5C2"/><stop offset="1" stop-color="#8E8999"/></linearGradient>
      <radialGradient id="fcc" cx=".35" cy=".3"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#C9C5D1"/></radialGradient></defs>
    ${[0, 90, 180, 270].map((a) => `<rect x="-7" y="-31" width="14" height="30" rx="7" fill="url(#fck)" transform="rotate(${a})"/>`).join('')}
    <circle r="13" fill="url(#fcc)"/><circle r="5" fill="#5BB7F0"/></svg>`;

  const paws = [paw('beans', fur, 'fc-paw'), paw('beans', fur, 'fc-paw')];
  const home = [{ x: 560, y: 262, r: -18 }, { x: 700, y: 248, r: -34 }];
  paws.forEach((p, i) => { stage.appendChild(p); place(p, home[i].x - 65, home[i].y, 130, 182); p.style.rotate = `${home[i].r}deg`; });

  let last = -1;
  let angle = 0, spin = 0;
  let dripT = 0, splashT = 0, botT = 0, botSide = 0;
  let flowing = false;
  let shown = 0;

  function swat(i: number): void {
    const p = paws[i];
    const dx = KNOB.x - home[i].x, dy = KNOB.y - home[i].y - 20;
    p.animate({ translate: ['0 0', `${dx * 0.75}px ${dy * 0.75}px`, '0 0'], scale: ['1', '0.92', '1'] },
      { duration: 230, easing: 'cubic-bezier(.3,.8,.4,1)' });
    if (i === last) {
      spin -= 120;
      shake(knob, 4, 200);
      return;
    }
    last = i;
    spin += i === 0 ? 420 : 380;
    host.progress(1 / SWATS);
    f.sound('clink');
    burst(stage, KNOB.x, KNOB.y, { cls: 'fc-spark', n: 4, size: 12, spread: 50, up: 20 });
  }

  return {
    update(dt) {
      const p = f.tick();
      spin *= Math.exp(-dt * 4);
      angle += spin * dt + dt * p * 20;
      knob.style.rotate = `${angle}deg`;
      // drip -> trickle -> stream
      const w = p < 0.12 ? 0 : 4 + p * 26;
      stream.style.cssText = `left:${NOZ.x - w / 2}px;top:${NOZ.y}px;width:${w}px;height:${RIM - NOZ.y + 4}px;opacity:${w ? 0.9 : 0}`;
      if (p >= 0.12 && !flowing) { flowing = true; f.sound('waterRun'); }
      if (p < 0.12) {
        dripT -= dt * (1 + p * 30);
        if (dripT < 0 && p > 0) {
          dripT = 0.7;
          const d = place(img('droplet', 'fc-drop', stage), NOZ.x - 9, NOZ.y, 18, 18);
          d.animate({ transform: ['translateY(0) scale(.6)', `translateY(${RIM - NOZ.y - 12}px) scale(1)`] }, { duration: 420, easing: 'ease-in' })
            .onfinish = () => { d.remove(); burst(stage, NOZ.x, RIM, { asset: 'droplet', n: 3, size: 10, spread: 26, up: 22, fall: 20, ms: 380 }); };
        }
      } else {
        splashT -= dt;
        if (splashT < 0) {
          splashT = 0.16 - p * 0.08;
          burst(stage, NOZ.x, RIM - 4, { asset: 'droplet', n: 2, size: 8 + p * 8, spread: 30 + p * 40, up: 26, fall: 26, ms: 420 });
          if (Math.random() < 0.15) f.sound('splash');
        }
      }
      const want = Math.floor(clamp((p - 0.15) / 0.8) * foam.length + (p >= 0.999 ? 1 : 0));
      while (shown < Math.min(want, foam.length)) { foam[shown].classList.add('on'); pop(foam[shown], 1.2); shown++; }
      if (p >= 0.999 && !tub.classList.contains('full')) {
        tub.classList.add('full');
        f.sound('ding');
        burst(stage, TX + W / 2, RIM - 40, { asset: 'bubbles', n: 6, size: 40, spread: 200, up: 80 });
      }
    },
    key(e, down) {
      const l = LEFT.includes(e.code), r = RIGHT.includes(e.code);
      if (!l && !r) return false;
      if (tap(e, down, ...LEFT, ...RIGHT)) { f.flash(e.code); swat(l ? 0 : 1); }
      return true;
    },
    bot(dt) {
      botT -= dt;
      if (botT > 0) return;
      botT = rand(0.2, 0.34);
      botSide = Math.random() < 0.92 ? botSide ^ 1 : botSide;
      this.key(fake(botSide ? 'KeyD' : 'KeyA'), true);
    },
    dispose: () => f.dispose(),
  };
}
