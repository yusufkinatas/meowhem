import { CFG } from '../../config';
import { defineInteractable } from './registry';

defineInteractable({
  id: 'carrier',
  spot: 'carrier',
  onRoundStart(ctx) {
    ctx.setWorld('carrier.occupied', false);
    ctx.setWorld('carrier.closed', false);
  },
  tick(ctx) {
    const occupied = ctx.chars('cat').some((c) => (c.st.caged ?? 0) > 0);
    ctx.setWorld('carrier.occupied', occupied);
    ctx.setWorld('carrier.closed', occupied);
  },
  uses: [
    {
      role: 'sitter', mode: 'instant', priority: 10, range: 1.6,
      label: (ctx, s, ch) => `Time-out for ${ctx.char(ch.holding ?? '')?.name ?? 'the cat'}`,
      check: (ctx, s, ch) => !ch.holding ? false : ctx.chars('cat').some((c) => c.st.caged) ? 'Carrier is occupied' : true,
      onComplete(ctx, s, ch) {
        const cat = ctx.char(ch.holding ?? '');
        if (!cat) return;
        ctx.cage(cat, CFG.carrier.time);
        ctx.sound('cageClose', ctx.spot('carrier').pos);
        ctx.give(ch, 'smug', 2);
        ctx.toast('Time-out. Mash to rattle the door.', cat.id, 'bad');
      },
    },
    {
      role: 'cat', mode: 'hold', time: CFG.carrier.unlatch, anim: 'interact', label: 'Unlatch the carrier',
      check: (ctx, s, ch) => !ch.st.caged && ctx.chars('cat').some((c) => c.id !== ch.id && c.st.caged),
      onComplete(ctx, s, ch) {
        for (const c of ctx.chars('cat')) if (c.st.caged) ctx.uncage(c);
        ctx.fx('confetti', ctx.spot('carrier').pos);
      },
    },
  ],
});
