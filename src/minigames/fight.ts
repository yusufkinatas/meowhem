import type { MinigameHost } from '../shared/contracts';
import { type Game, type Finish, frame, el, img, place, furOf, pop, shake, burst, fake, gate, rand, clamp, OTHER_FUR } from './kit';

// ADDENDUM 4.8: 1.5 s staredown (any key = flinch marker 0.001), then 2.5 s brawl (Space = 0.025 each).
// The host compares totals and decides; finish('win' | 'lose' | 'off') shows the result.
const STARE = 1.5, BRAWL = 2.5, FLINCH = 0.001, HIT = 0.025;
const L = { x: 200, y: 150 }, R = { x: 620, y: 150 }, FACE = 170;

export function fight(host: MinigameHost): Game {
  const name = String(host.data?.opponent ?? '').slice(0, 18);
  const f = frame(host, 'fight', name, [[['Space'], '']]);
  const { stage } = f;
  const mine = furOf(host), theirs = furOf(host, 'opponentFur', OTHER_FUR);

  el('div', 'ft-floor', stage);
  const me = place(img('pouting_cat', 'ft-cat me', stage), L.x - FACE / 2, L.y - FACE / 2, FACE, FACE);
  const them = place(img('pouting_cat', 'ft-cat them', stage), R.x - FACE / 2, R.y - FACE / 2, FACE, FACE);
  const growl = el('div', 'ft-growl', stage);
  const growlFill = el('i', '', growl);
  const tug = el('div', 'ft-tug', stage);
  tug.style.background = `linear-gradient(90deg, ${mine} 0 50%, ${theirs} 50% 100%)`;
  const ball = el('div', 'ft-ball', tug);
  ball.style.background = `radial-gradient(circle at 36% 30%, #fff9, transparent 40%), radial-gradient(circle at 70% 65%, ${theirs} 0 28%, transparent 30%), ${mine}`;
  ball.style.outlineColor = mine;
  const fx = el('div', 'ft-fx', stage);

  const cap = gate(12);
  let t = 0, flinched = false, m = 0, fightT = 0, result: Finish | null = null, botT = 0, lunge = 0;
  f.sound('hiss');
  f.dim('Space', true);

  function flinch(): void {
    if (flinched) return;
    flinched = true;
    f.report(FLINCH);
    me.animate({ translate: ['0 0', '0 -18px', '0 0'], scale: ['1', '1.08 .92', '1'] }, { duration: 260, easing: 'ease-out' });
  }

  function hit(): void {
    if (!cap()) return;
    f.report(HIT);
    m = clamp(m + 0.07, -1, 1);
    lunge = 1;
    const x = 410 + rand(-50, 50), y = 150 + rand(-50, 40);
    burst(fx, x, y, { asset: Math.random() < 0.6 ? 'collision' : 'anger_symbol', n: 1, size: 70, spread: 30, up: 10, fall: 0, ms: 380 });
    if (Math.random() < 0.3) burst(fx, x, y, { cls: 'ft-tuft', n: 2, size: 16, spread: 120, fall: 80 });
    shake(stage, 4, 140);
  }

  function show(r: Finish): void {
    result = r;
    f.dim('Space', true);
    if (r === 'off') {
      // nobody moved: both look away
      me.classList.add('away');
      them.classList.add('away');
      growl.classList.add('off');
      return;
    }
    const win = r === 'win';
    m = win ? 1 : -1;
    const w = win ? L : R, lo = win ? R : L;
    place(img('crown', 'ft-crown', stage), w.x - 46, w.y - FACE / 2 - 70, 92, 92);
    place(img('dizzy', 'ft-dizzy', stage), lo.x - 50, lo.y - FACE / 2 - 60, 100, 100);
    pop(win ? me : them, 1.2);
    if (win) f.sound('ding');
  }

  return {
    update(dt) {
      f.tick(dt);
      t += dt;
      const brawl = t >= STARE && !result;
      growlFill.style.width = `${clamp(t / STARE) * 100}%`;
      growl.classList.toggle('done', t >= STARE);
      f.dim('Space', !brawl);
      if (brawl) {
        fightT -= dt;
        if (fightT < 0) { fightT = 0.45; f.sound('fight', { volume: 0.7 }); }
        // the other cat pushes back (the host knows the real totals)
        m = clamp(m - dt * rand(0.1, 0.45), -1, 1);
      }
      lunge = Math.max(0, lunge - dt * 6);
      const shiver = t < STARE ? Math.sin(t * 50) * 1.5 : 0;
      me.style.translate = `${lunge * 40 + shiver}px 0`;
      them.style.translate = `${brawl ? -Math.abs(Math.sin(t * 9)) * 26 : -shiver}px 0`;
      ball.style.left = `${50 + m * 46}%`;
      if (t > STARE + BRAWL + 1 && !result) f.dim('Space', true);
    },
    key(e, down) {
      if (!down || e.repeat || result) return true;
      if (t < STARE) { flinch(); return true; }
      if (e.code !== 'Space') return false;
      f.flash('Space');
      if (t < STARE + BRAWL) hit();
      return true;
    },
    bot(dt) {
      if (t < STARE) return;
      botT -= dt;
      if (botT > 0) return;
      botT = rand(0.1, 0.16);
      this.key(fake('Space'), true);
    },
    finish(r) { f.finish(); show(r); },
    dispose: () => f.dispose(),
  };
}
