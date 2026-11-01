import { add } from '../../core/math';
import { defineInteractable } from './registry';
import { disaster, jitter, r2 } from './common';

const KEY = 'i:tpRoll:0';

defineInteractable({
  id: 'tpRoll',
  spot: 'tpRoll',
  state: () => ({ done: false }),
  onRoundStart(ctx) {
    ctx.setWorld('tp.unrolled', 0);
    ctx.setWorld('tp.avalanche', false);
  },
  tick(ctx, s) {
    if (!s.done) ctx.setWorld('tp.unrolled', r2(ctx.progress(KEY)));
  },
  uses: [
    {
      role: 'cat', mode: 'minigame', minigame: 'tpSpin', time: 11, shared: true, alert: 'Toilet paper', anim: 'swipe', face: 'happy',
      label: 'Unroll it', undo: 'Roll the paper back',
      check: (ctx, s) => !s.done,
      onComplete(ctx, s, ch) {
        const sp = ctx.spot('tpRoll');
        s.done = true;
        ctx.setWorld('tp.unrolled', 1);
        ctx.setWorld('tp.avalanche', true);
        for (let i = 0; i < 3; i++) ctx.addMess('tp', jitter(ctx, [sp.pos[0], 0.05, sp.pos[2]], 0.9), { by: ch.id });
        ctx.fx('tpBurst', add(sp.pos, [0, 0.4, 0]));
        ctx.sound('paperRip', sp.pos);
        disaster(ctx, 'tpRoll', 'THE WHOLE ROLL', 8);
      },
    },
  ],
});
