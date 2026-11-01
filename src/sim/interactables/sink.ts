import { CFG } from '../../config';
import { defineInteractable } from './registry';

defineInteractable({
  id: 'sink',
  spot: 'sink',
  uses: [
    {
      role: 'sitter', mode: 'hold', time: CFG.spray.refill, anim: 'interact', label: 'Refill the spray bottle',
      check: (ctx, s, ch) => (ch.ammo >= CFG.spray.ammo ? 'Bottle is full' : true),
      onStart(ctx) { ctx.loop('sinkTap', 'waterRun', true, ctx.spot('sink').pos); },
      onStop(ctx) { ctx.loop('sinkTap', 'waterRun', false); },
      onComplete(ctx, s, ch) {
        ch.ammo = CFG.spray.ammo;
        ctx.sound('ding', ch.p);
        ctx.toast('Spray bottle refilled', ch.id, 'good');
      },
    },
    {
      // they prefer the tap over the bowl
      role: 'cat', mode: 'hold', time: 2, anim: 'eat', face: 'happy', label: 'Drink from the tap',
      check: (ctx, s, ch) => !ch.st.fed || 'Not thirsty',
      onStart(ctx) { ctx.loop('sinkTap', 'waterRun', true, ctx.spot('sink').pos); },
      onStop(ctx) { ctx.loop('sinkTap', 'waterRun', false); },
      onComplete(ctx, s, ch) {
        ctx.give(ch, 'fed', CFG.buffs.sinkFed);
        ctx.sound('gulp', ch.p);
      },
    },
  ],
});
