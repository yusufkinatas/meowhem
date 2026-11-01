/** Bird watching: success = Focused. Every pounce, good or early, leaves a nose print on the glass. */
import { add } from '../../core/math';
import { defineInteractable } from './registry';
import type { Char, SimContext } from './types';

const AGAIN = 20, FOCUSED = 20;
type S = { smudges: number; readyAt: number; watching: number; prev: Map<string, number> };

function smudge(ctx: SimContext, s: S) {
  s.smudges = Math.min(8, s.smudges + 1);
  ctx.setWorld('window.smudges', s.smudges);
  ctx.sound('thud', ctx.spot('window').pos, { volume: 0.5 });
}
const key = (ch: Char) => `i:window:0@${ch.id}`;

defineInteractable<S>({
  id: 'window',
  spot: 'window',
  state: () => ({ smudges: 0, readyAt: 0, watching: 0, prev: new Map() }),
  onRoundStart(ctx) {
    ctx.setWorld('window.smudges', 0);
    ctx.setWorld('window.birds', false);
  },
  uses: [
    {
      role: 'cat', mode: 'minigame', minigame: 'birdWatch', time: 10, anim: 'crouch', face: 'focused',
      label: 'Watch the birds',
      check: (ctx, s) => ctx.time >= s.readyAt || 'Birds are gone',
      onStart(ctx, s, ch) {
        s.prev.set(ch.id, ctx.progress(key(ch)));
        if (s.watching++ === 0) ctx.setWorld('window.birds', true);
        ctx.loop(`chatter:${ch.id}`, 'chatter', true, ch.p);
        // bots get impatient sometimes and bonk the glass early
        if (ch.bot && ctx.rng() < 0.25) smudge(ctx, s);
      },
      onStop(ctx, s, ch) {
        ctx.loop(`chatter:${ch.id}`, 'chatter', false);
        if (--s.watching <= 0) { s.watching = 0; ctx.setWorld('window.birds', false); }
      },
      onProgress(ctx, s, ch, p) {
        // birdWatch reports a tiny marker delta (< 0.0004) on an early pounce (P3)
        const d = p - (s.prev.get(ch.id) ?? 0);
        s.prev.set(ch.id, p);
        if (d > 0 && d < 0.0004 && p < 1) smudge(ctx, s);
      },
      onComplete(ctx, s, ch) {
        s.prev.set(ch.id, 0);
        s.readyAt = ctx.time + AGAIN;
        ctx.give(ch, 'focused', FOCUSED);
        ctx.fx('exclaim', add(ch.p, [0, 0.6, 0]));
        smudge(ctx, s);
      },
    },
  ],
});
