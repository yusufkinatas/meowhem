import { defineInteractable } from './registry';
import { scale } from './common';
import type { SimContext } from './types';

const caged = (ctx: SimContext) => ctx.chars('cat').filter((c) => (c.st.caged ?? 0) > 0);

const def = defineInteractable({
  id: 'carrier',
  spot: 'carrier',
  onRoundStart(ctx) {
    ctx.setWorld('carrier.occupied', false);
    ctx.setWorld('carrier.closed', false);
    def.uses[1].time = scale(ctx).unlatch; // ADDENDUM 3.2 scales the unlatch hold
  },
  tick(ctx) {
    const occupied = caged(ctx).length > 0;
    // a cat sitting on the basket: the lids swing shut under it (open, they stand up in a V right where it sits)
    const sp = ctx.spot('carrier'), cx = sp.pos[0] + Math.sin(sp.facing) * 0.45, cz = sp.pos[2] + Math.cos(sp.facing) * 0.45;
    const sat = ctx.chars('cat').some((c) => !c.st.caged && c.p[1] > 0.25 && Math.abs(c.p[0] - cx) < 0.36 && Math.abs(c.p[2] - cz) < 0.36);
    ctx.setWorld('carrier.occupied', occupied);
    ctx.setWorld('carrier.closed', occupied || sat);
  },
  uses: [
    {
      role: 'sitter', mode: 'instant', priority: 10, range: 1.6,
      label: (ctx, s, ch) => `Time-out for ${ctx.char(ch.holding ?? '')?.name ?? 'the cat'}`,
      check: (ctx, s, ch) => (!ch.holding ? false : caged(ctx).length >= scale(ctx).carrierCap ? 'Carrier is full' : true),
      onComplete(ctx, s, ch) {
        const cat = ctx.char(ch.holding ?? '');
        if (!cat) return;
        ctx.cage(cat, scale(ctx).carrierTime);
        ctx.sound('cageClose', ctx.spot('carrier').pos);
        ctx.give(ch, 'smug', 2);
        ctx.toast('Time-out. A / D to rattle the door.', cat.id, 'bad');
        for (const c of ctx.chars('cat')) if (c.id !== cat.id) ctx.toast(`${cat.name} is in the carrier`, c.id, 'info');
      },
    },
    {
      role: 'cat', mode: 'hold', time: 3, anim: 'interact', alert: "Someone's opening the carrier",
      label: (ctx) => `Free ${caged(ctx)[0]?.name ?? 'them'}`,
      check: (ctx, s, ch) => !ch.st.caged && caged(ctx).some((c) => c.id !== ch.id),
      onComplete(ctx) {
        for (const c of caged(ctx)) ctx.uncage(c);
        ctx.fx('confetti', ctx.spot('carrier').pos);
      },
    },
  ],
});
