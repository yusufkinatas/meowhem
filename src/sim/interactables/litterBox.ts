import { CFG } from '../../config';
import { add, fwd } from '../../core/math';
import { defineInteractable } from './registry';
import type { Char, SimContext } from './types';

const P = CFG.poop;

function relieve(ctx: SimContext, ch: Char) {
  ch.poop = 0;
  ch.desperate = 0;
  ctx.give(ch, 'zoomies', P.zoomies);
  ctx.stat(ch.id, 'poops', 1);
  ctx.fx('dust', ch.p);
}

defineInteractable({
  id: 'litterBox',
  spot: 'litterBox',
  state: () => ({ fill: 0 }),
  onRoundStart(ctx) {
    ctx.setWorld('litter.fill', 0);
    ctx.setWorld('litter.stink', false);
  },
  tick(ctx, s) {
    const full = s.fill >= P.boxCapacity;
    ctx.setWorld('litter.fill', s.fill / P.boxCapacity);
    ctx.setWorld('litter.stink', full);
    ctx.setPenalty('litterFull', full ? P.fullPenalty : 0);
  },
  uses: [
    {
      role: 'cat', mode: 'hold', time: P.hold, anim: 'poop', face: 'focused', label: 'Use the litter box',
      check: (ctx, s, ch) => (ch.poop < 0.75 ? false : s.fill >= P.boxCapacity ? 'The box is full' : true),
      onComplete(ctx, s, ch) {
        s.fill++;
        relieve(ctx, ch);
        ctx.sound('plop', ch.p);
        if (ctx.rng() < P.litterKickChance) {
          const sp = ctx.spot('litterBox');
          ctx.addMess('litter', add(sp.pos, fwd(sp.facing + Math.PI + (ctx.rng() - 0.5)), 0.5), { by: ch.id });
        }
        if (s.fill >= P.boxCapacity) ctx.toast('The litter box is full', 'sitter', 'bad');
      },
    },
    {
      // box full, or held it too long: anywhere goes
      role: 'cat', mode: 'hold', time: P.hold, anim: 'poop', face: 'focused', label: 'Go right here', priority: -1,
      at: (ctx, s, ch) => (ch.poop >= 1 && (s.fill >= P.boxCapacity || ch.desperate >= P.anywhereAfter) ? ch.p : null),
      onComplete(ctx, s, ch) {
        ctx.addMess('poop', ch.p, { by: ch.id });
        ctx.fx('stink', ch.p, { duration: 6 });
        ctx.sound('plop', ch.p);
        ctx.stat(ch.id, 'poopsOutside', 1);
        relieve(ctx, ch);
      },
    },
    {
      role: 'sitter', mode: 'hold', time: P.scoop, anim: 'scoop', face: 'gag', label: 'Scoop the litter box',
      check: (ctx, s) => s.fill > 0,
      onComplete(ctx, s, ch) {
        s.fill = 0;
        ctx.fx('sparkle', ctx.spot('litterBox').pos);
        ctx.stat(ch.id, 'cleaned', 1);
      },
    },
  ],
});
