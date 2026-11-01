/** The half-empty bowl counts as empty (ADDENDUM M16). Shaking it makes it full again, as far as the cats are concerned. */
import { CFG } from '../../config';
import { defineInteractable } from './registry';
import type { SimContext } from './types';

type S = { fill: number; shaken: boolean };
const sync = (ctx: SimContext, s: S) => {
  ctx.setWorld('foodBowl.fill', s.fill);
  ctx.setWorld('foodBowl.shaken', s.shaken);
};

defineInteractable<S>({
  id: 'foodBowl',
  spot: 'foodBowl',
  state: () => ({ fill: 1, shaken: false }),
  onRoundStart(ctx, s) { sync(ctx, s); },
  uses: [
    {
      role: 'cat', mode: 'hold', time: 4, anim: 'eat', face: 'happy', label: 'Eat',
      check: (ctx, s) => s.fill > 0.5 || (s.shaken && s.fill > 0) || 'Empty',
      onStart(ctx, s, ch) { ctx.loop(`bowl:${ch.id}`, 'crunch', true, ctx.spot('foodBowl').pos); },
      onStop(ctx, s, ch) { ctx.loop(`bowl:${ch.id}`, 'crunch', false); },
      onComplete(ctx, s, ch) {
        s.fill = Math.max(0, s.fill - 0.25);
        s.shaken = false;
        sync(ctx, s);
        ctx.give(ch, 'fed', CFG.buffs.fedTime);
        ctx.sound('gulp', ch.p);
      },
    },
    {
      role: 'sitter', mode: 'hold', time: 0.6, anim: 'interact', label: 'Shake the bowl', priority: 1,
      check: (ctx, s) => s.fill > 0 && s.fill <= 0.5 && !s.shaken,
      onComplete(ctx, s) {
        s.shaken = true;
        sync(ctx, s);
        ctx.sound('treatShake', ctx.spot('foodBowl').pos, { pitch: 0.8 });
      },
    },
    {
      role: 'sitter', mode: 'hold', time: 1.5, anim: 'interact', label: 'Refill the bowl',
      check: (ctx, s) => s.fill < 1,
      onComplete(ctx, s) {
        s.fill = 1;
        s.shaken = false;
        sync(ctx, s);
        ctx.sound('treatShake', ctx.spot('foodBowl').pos, { pitch: 0.6 });
      },
    },
  ],
});
