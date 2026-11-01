import type { MinigameHost } from '../shared/contracts';
import { CFG } from '../config';
import { type Game, frame, img, shake, pop, fake, gate, side, rand } from './kit';

// ADDENDUM 4.7: slim strip. A wiggle = 1/20, a repeated paw 0.25/20, the hiss 4/20 (once).
// The client sends progress as `mash` n = delta x 20 (grab /20, cage -0.25 s each, tv /8).
const W = 1 / 20, NOODLE_AFTER = 2;

export function escape(host: MinigameHost): Game {
  const mode = host.data?.mode === 'cage' ? 'cage' : host.data?.mode === 'tv' ? 'tv' : 'grab';
  const grab = mode === 'grab';
  const limp = grab ? Number(host.data?.limp ?? 1) || 0 : 0;
  // caged: the host only refreshes progress on a wiggle, so the time-left bar drains locally and jumps on wiggles
  const cageTime = Number(host.data?.cageTime) || CFG.carrier.time;
  let served = 0;
  const view: MinigameHost = mode === 'cage' ? { ...host, getProgress: () => served } : host;
  const f = frame(view, 'escape', '', grab ? [[['A', 'D'], 'wiggle'], [['R'], 'hiss']] : [[['A', 'D'], 'wiggle']], { slim: true, invert: mode === 'cage' });
  const { panel, root } = f;
  root.classList.add(`es-${mode}`);
  const hand = grab ? img('pinching_hand', 'es-hand', panel) : null;
  if (grab) img('revolving_hearts', 'es-hearts', panel);

  const cap = gate(12);
  let t = 0, last = 0, lastInput = 0, hissed = false, noodle = false, botT = 0;

  function wiggle(s: -1 | 1): void {
    if (t < limp) return;
    const same = s === last;
    last = s;
    lastInput = t;
    if (!cap()) return;
    if (noodle) {
      // the first key out of a noodle counts 4
      noodle = false;
      root.classList.remove('es-noodle');
      shake(panel, 10, 320);
      f.report(4 * W);
      return;
    }
    f.report(same ? 0.25 * W : W);
    if (mode === 'cage') f.sound('cageOpen', { pitch: 1.5, volume: 0.6 });
    if (hand) { shake(hand, 6, 160); hand.style.rotate = `${rand(-14, 14)}deg`; }
  }

  function hiss(): void {
    if (!grab || hissed) return; // the host takes the hiss even during the limp
    hissed = true;
    lastInput = t;
    noodle = false;
    root.classList.remove('es-noodle');
    f.report(4 * W);
    f.sound('hiss');
    f.dim('KeyR', true);
    if (hand) pop(hand, 1.25);
  }

  return {
    update(dt) {
      if (mode === 'cage') served = Math.min(1, Math.max(served + dt / cageTime, host.getProgress()));
      f.tick(dt);
      t += dt;
      const limpNow = t < limp;
      f.dim('KeyA', limpNow);
      f.dim('KeyD', limpNow);
      f.light('KeyA', !limpNow && last >= 0);
      f.light('KeyD', !limpNow && last < 0);
      if (grab && !noodle && !limpNow && t - Math.max(lastInput, limp) > NOODLE_AFTER) {
        noodle = true;
        root.classList.add('es-noodle');
      }
      if (hand) hand.style.translate = `0 ${Math.sin(t * (noodle ? 2 : 9)) * (noodle ? 4 : 2)}px`;
    },
    key(e, down) {
      if (e.code === 'KeyR') { if (down && !e.repeat) { f.flash('KeyR'); hiss(); } return true; }
      const s = side(e.code);
      if (!s) return false;
      if (down && !e.repeat) { f.flash(e.code); wiggle(s); }
      return true;
    },
    bot(dt) {
      botT -= dt;
      if (botT > 0) return;
      botT = rand(0.12, 0.16);
      if (grab && !hissed && t > limp + 0.6) { this.key(fake('KeyR'), true); return; }
      this.key(fake(last < 0 ? 'KeyD' : 'KeyA'), true);
    },
    finish() { f.finish(); },
    dispose: () => f.dispose(),
  };
}
