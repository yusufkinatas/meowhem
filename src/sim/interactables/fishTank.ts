/** Paw-fishing: every third of progress lands a flopping fish on the floor. Sitter cleaning a fish puts it back. Empty tank = +10. */
import { add } from '../../core/math';
import { defineInteractable } from './registry';
import { behind, disaster } from './common';
import type { Char, SimContext } from './types';

type S = { fish: number; done: boolean; prev: Map<string, number> };
const key = (ch: Char) => `i:fishTank:0@${ch.id}`;

function land(ctx: SimContext, s: S, ch: Char) {
  if (s.fish <= 0 || s.done) return;
  s.fish--;
  ctx.setWorld('tank.fish', s.fish);
  const p = behind(ctx, 'fishTank', 0.7 + ctx.rng() * 0.5, 1.4);
  ctx.addMess('fish', p, { by: ch.id });
  ctx.fx('splash', add(ctx.spot('fishTank').pos, [0, 0.35, 0]));
  ctx.sound('splash', p);
  if (s.fish === 0) {
    s.done = true;
    disaster(ctx, 'fishTank', 'EMPTY TANK', 10);
  }
}

defineInteractable<S>({
  id: 'fishTank',
  spot: 'fishTank',
  state: () => ({ fish: 3, done: false, prev: new Map() }),
  onRoundStart(ctx) { ctx.setWorld('tank.fish', 3); },
  onMessCleaned(ctx, s, m) {
    if (m.kind !== 'fish' || s.done || s.fish >= 3) return;
    s.fish++;
    ctx.setWorld('tank.fish', s.fish);
    ctx.sound('plop', ctx.spot('fishTank').pos);
  },
  uses: [
    {
      role: 'cat', mode: 'minigame', minigame: 'fishing', time: 14, alert: 'Fish tank', anim: 'swipe', face: 'focused',
      label: 'Go fishing',
      check: (ctx, s) => !s.done,
      onStart(ctx, s, ch) { s.prev.set(ch.id, ctx.progress(key(ch))); },
      onProgress(ctx, s, ch, p) {
        const prev = s.prev.get(ch.id) ?? 0;
        s.prev.set(ch.id, p);
        for (let n = Math.floor(p * 3 + 1e-6) - Math.floor(prev * 3 + 1e-6); n > 0; n--) land(ctx, s, ch);
      },
      onComplete(ctx, s, ch) { s.prev.set(ch.id, 0); },
    },
  ],
});
