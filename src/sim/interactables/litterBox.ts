import { CFG } from '../../config';
import { add, fwd } from '../../core/math';
import { defineInteractable } from './registry';
import { scale } from './common';
import type { Char, SimContext } from './types';

const P = CFG.poop;
const FRESH = 10, FRESH_ZOOMIES = 7;
type S = { fill: number; cap: number; freshUntil: number };

const fresh = (ctx: SimContext, s: S) => ctx.time < s.freshUntil;

function relieve(ctx: SimContext, ch: Char, zoomies: number) {
  ch.poop = 0;
  ch.desperate = 0;
  ctx.give(ch, 'zoomies', zoomies);
  ctx.stat(ch.id, 'poops', 1);
  ctx.fx('dust', ch.p);
}

defineInteractable<S>({
  id: 'litterBox',
  spot: 'litterBox',
  state: () => ({ fill: 0, cap: P.boxCapacity, freshUntil: -1 }),
  onRoundStart(ctx, s) {
    s.cap = scale(ctx).litter;
    ctx.setWorld('litter.fill', 0);
    ctx.setWorld('litter.stink', false);
    ctx.setWorld('litter.fresh', false);
  },
  tick(ctx, s) {
    const full = s.fill >= s.cap;
    ctx.setWorld('litter.fill', Math.round((s.fill / s.cap) * 100) / 100);
    ctx.setWorld('litter.stink', full);
    ctx.setWorld('litter.fresh', fresh(ctx, s)); // bots rush a fresh box
    ctx.setPenalty('litterFull', full ? P.fullPenalty : 0);
  },
  uses: [
    {
      role: 'cat', mode: 'hold', time: P.hold, anim: 'poop', face: 'focused', label: 'Use the litter box',
      // right after a scoop, half a need is enough
      check: (ctx, s, ch) => (ch.poop < (fresh(ctx, s) ? 0.5 : 0.75) ? false : s.fill >= s.cap ? 'The box is full' : true),
      onComplete(ctx, s, ch) {
        s.fill++;
        relieve(ctx, ch, fresh(ctx, s) ? FRESH_ZOOMIES : P.zoomies);
        ctx.sound('plop', ch.p);
        if (ctx.rng() < P.litterKickChance) {
          const sp = ctx.spot('litterBox');
          ctx.addMess('litter', add(sp.pos, fwd(sp.facing + Math.PI + (ctx.rng() - 0.5)), 0.5), { by: ch.id });
        }
        if (s.fill >= s.cap) ctx.toast('The litter box is full', 'sitter', 'bad');
      },
    },
    {
      // box full, or held it too long: anywhere goes
      role: 'cat', mode: 'hold', time: P.hold, anim: 'poop', face: 'focused', label: 'Go right here', priority: -3,
      at: (ctx, s, ch) => (ch.poop >= 1 && (s.fill >= s.cap || ch.desperate >= P.anywhereAfter) ? ch.p : null),
      onComplete(ctx, s, ch) {
        ctx.addMess('poop', ch.p, { by: ch.id });
        ctx.fx('stink', ch.p, { duration: 6 });
        ctx.sound('plop', ch.p);
        ctx.stat(ch.id, 'poopsOutside', 1);
        relieve(ctx, ch, P.zoomies);
      },
    },
    {
      role: 'sitter', mode: 'hold', time: P.scoop, anim: 'scoop', face: 'gag', label: 'Scoop the litter box',
      check: (ctx, s) => s.fill > 0,
      onComplete(ctx, s, ch) {
        s.fill = 0;
        s.freshUntil = ctx.time + FRESH;
        ctx.fx('sparkle', ctx.spot('litterBox').pos);
        ctx.stat(ch.id, 'cleaned', 1);
      },
    },
  ],
});
