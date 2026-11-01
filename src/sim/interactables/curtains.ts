import { add } from '../../core/math';
import { defineInteractable } from './registry';
import { disaster, maxProgress, r2 } from './common';

defineInteractable({
  id: 'curtains',
  spot: 'curtains',
  state: () => ({ done: false }),
  onRoundStart(ctx) {
    ctx.setWorld('curtains.climb', 0);
    ctx.setWorld('curtains.down', false);
  },
  tick(ctx, s) {
    if (!s.done) ctx.setWorld('curtains.climb', r2(maxProgress(ctx, 'curtains')));
  },
  uses: [
    {
      role: 'cat', mode: 'minigame', minigame: 'climb', time: 11, alert: 'Curtains', anim: 'climb', face: 'focused',
      label: 'Climb the curtains', undo: 'Straighten the curtains',
      check: (ctx, s) => !s.done,
      onComplete(ctx, s, ch) {
        const sp = ctx.spot('curtains');
        s.done = true;
        ctx.setWorld('curtains.climb', 1);
        ctx.setWorld('curtains.down', true);
        ctx.fx('dust', add(sp.pos, [0, 1.2, 0]), { scale: 1.6 });
        ctx.sound('thud', sp.pos);
        disaster(ctx, 'curtains', 'CURTAINS', 10);
      },
    },
  ],
});
