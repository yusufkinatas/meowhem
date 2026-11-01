import { add } from '../../core/math';
import { defineInteractable } from './registry';
import { jitter, maxProgress, r2 } from './common';

const AGAIN = 45;

defineInteractable({
  id: 'pillow',
  spot: 'pillow',
  state: () => ({ readyAt: 0, flat: 0 }),
  onRoundStart(ctx) { ctx.setWorld('pillow.knead', 0); },
  tick(ctx, s, dt) {
    s.flat = Math.max(0, s.flat - dt / AGAIN);
    ctx.setWorld('pillow.knead', r2(Math.max(s.flat, maxProgress(ctx, 'pillow'))));
  },
  uses: [
    {
      role: 'cat', mode: 'minigame', minigame: 'knead', time: 10, anim: 'knead', face: 'happy',
      label: 'Make biscuits', undo: 'Fluff the pillow',
      // on the bed, not under it
      check: (ctx, s, ch) => (ch.p[1] < ctx.spot('pillow').pos[1] - 0.3 ? false : ctx.time >= s.readyAt || 'Still flat'),
      onStart(ctx, s, ch) { ctx.loop(`purr:${ch.id}`, 'purr', true, ch.p); },
      onStop(ctx, s, ch) { ctx.loop(`purr:${ch.id}`, 'purr', false); },
      onComplete(ctx, s, ch) {
        const sp = ctx.spot('pillow');
        s.readyAt = ctx.time + AGAIN;
        s.flat = 1;
        for (let i = 0; i < 2; i++) ctx.addMess('fur', jitter(ctx, sp.pos, 0.35), { by: ch.id });
        ctx.fx('furPoof', add(sp.pos, [0, 0.2, 0]));
      },
    },
  ],
});
