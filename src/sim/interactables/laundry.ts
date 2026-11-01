/** Nap in the clean laundry: fur on the laundry, the cat sleeps until it moves. */
import { add, fwd } from '../../core/math';
import { defineInteractable } from './registry';
import { jitter } from './common';

const AGAIN = 30;

defineInteractable({
  id: 'laundry',
  spot: 'laundry',
  state: () => ({ readyAt: 0, sleepers: new Set<string>() }),
  tick(ctx, s) {
    for (const id of s.sleepers) {
      const c = ctx.char(id);
      if (!c || !c.st.sleep) { s.sleepers.delete(id); continue; }
      if (Math.hypot(c.v[0], c.v[2]) > 0.4 || c.forced) { ctx.clear(c, 'sleep'); s.sleepers.delete(id); }
    }
  },
  uses: [
    {
      role: 'cat', mode: 'hold', time: 3, anim: 'loaf', face: 'sleepy', label: 'Nap in the laundry',
      check: (ctx, s) => ctx.time >= s.readyAt || 'Still warm',
      onComplete(ctx, s, ch) {
        const sp = ctx.spot('laundry');
        const top = add(sp.pos, fwd(sp.facing), 0.5);
        s.readyAt = ctx.time + AGAIN;
        for (let i = 0; i < 2; i++) ctx.addMess('fur', jitter(ctx, [top[0], sp.pos[1] + 0.6, top[2]], 0.2), { by: ch.id });
        ctx.give(ch, 'sleep', 30);
        s.sleepers.add(ch.id);
        ctx.fx('zzz', add(ch.p, [0, 0.4, 0]), { follow: ch.id, duration: 4 });
      },
    },
  ],
});
