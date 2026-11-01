import { defineInteractable } from './registry';
import { disaster, r2 } from './common';

const KEY = 'i:laptop:0';
export const DELIVERY_DELAY = 15;

defineInteractable({
  id: 'laptop',
  spot: 'laptop',
  state: () => ({ ordered: false, order: 'catnip' as 'catnip' | 'wetFood', workers: 0 }),
  onRoundStart(ctx, s) {
    s.order = ctx.rng() < 0.5 ? 'catnip' : 'wetFood';
    ctx.setWorld('laptop.screen', 'idle');
    ctx.setWorld('laptop.progress', 0);
    ctx.setWorld('laptop.order', s.order);
    ctx.setWorld('delivery.at', 0); // read by frontDoor.ts
  },
  tick(ctx, s) {
    if (s.ordered) return;
    ctx.setWorld('laptop.progress', r2(ctx.progress(KEY)));
    ctx.setWorld('laptop.screen', s.workers > 0 ? 'hacking' : 'idle');
  },
  uses: [
    {
      role: 'cat', mode: 'minigame', minigame: 'laptop', time: 15, shared: true, alert: 'Laptop', anim: 'type', face: 'focused',
      label: 'Order something', undo: 'Close the laptop',
      check: (ctx, s) => !s.ordered,
      minigameData: (ctx, s) => ({ order: s.order }),
      onStart(ctx, s) {
        if (s.workers++ === 0) ctx.loop('laptop', 'typing', true, ctx.spot('laptop').pos);
      },
      onStop(ctx, s) {
        if (--s.workers <= 0) { s.workers = 0; ctx.loop('laptop', 'typing', false); }
      },
      onComplete(ctx, s) {
        const p = ctx.spot('laptop').pos;
        s.ordered = true;
        ctx.setWorld('laptop.screen', 'ordered');
        ctx.setWorld('laptop.progress', 1);
        ctx.setWorld('delivery.at', ctx.time + DELIVERY_DELAY);
        ctx.sound('ding', p);
        ctx.sound('buzz', p, { volume: 0.6 });
        disaster(ctx, 'laptop', 'CARD CHARGED', 12);
      },
    },
  ],
});
