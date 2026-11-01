/** The expensive scratching post. It exists. Bots never use it. The first use of the round makes every bot nearby stop and stare. */
import { add, dist } from '../../core/math';
import { defineInteractable } from './registry';

defineInteractable({
  id: 'scratchPost',
  spot: 'scratchPost',
  state: () => ({ used: false, starers: [] as string[], until: 0 }),
  onRoundStart(ctx) { ctx.setWorld('scratchPost.t', -99); },
  tick(ctx, s) {
    if (!s.starers.length || ctx.time < s.until) return;
    for (const id of s.starers) { const c = ctx.char(id); if (c) c.lookAt = null; }
    s.starers = [];
  },
  uses: [
    {
      role: 'cat', mode: 'hold', time: 2, anim: 'scratch', face: 'happy', label: 'Scratch the post',
      onStart(ctx) { ctx.loop('scratchPost', 'scratch', true, ctx.spot('scratchPost').pos); },
      onStop(ctx) { ctx.loop('scratchPost', 'scratch', false); },
      onComplete(ctx, s, ch) {
        ctx.stat(ch.id, 'scratchPostUses', 1);
        if (s.used) return;
        s.used = true;
        s.until = ctx.time + 1;
        ctx.setWorld('scratchPost.t', Math.round(ctx.time * 100) / 100); // bots read this and stop for 1 s
        ctx.setWorld('scratchPost.by', ch.id);
        const head = add(ch.p, [0, 0.3, 0]);
        for (const c of ctx.chars()) {
          if (!c.bot || c.id === ch.id || dist(c.p, ch.p) > 10) continue;
          c.lookAt = head;
          s.starers.push(c.id);
        }
      },
    },
  ],
});
