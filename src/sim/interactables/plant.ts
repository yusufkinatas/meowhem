import { add, fwd } from '../../core/math';
import { defineInteractable } from './registry';

defineInteractable({
  id: 'plant',
  spot: 'plant',
  state: () => ({ soil: [] as number[] }),
  onRoundStart(ctx) { ctx.setWorld('plant.dug', 0); },
  onMessCleaned(ctx, s, m) {
    s.soil = s.soil.filter((id) => id !== m.id);
    if (!s.soil.length) ctx.setWorld('plant.dug', 0);
  },
  uses: [
    {
      role: 'cat', mode: 'hold', time: 3, anim: 'dig', face: 'happy', label: 'Dig in the plant',
      check: (ctx, s) => (s.soil.length ? 'Already dug up' : true),
      onStart(ctx) { ctx.sound('dig', ctx.spot('plant').pos); },
      onComplete(ctx, s, ch) {
        const sp = ctx.spot('plant');
        for (let i = 0; i < 2; i++) {
          const p = add(sp.pos, fwd(sp.facing + Math.PI + (i - 0.5) * 1.2), 0.35 + ctx.rng() * 0.3);
          s.soil.push(ctx.addMess('soil', p, { by: ch.id }));
        }
        ctx.setWorld('plant.dug', 1);
        ctx.fx('dust', sp.pos, { color: '#7a5236' });
        ctx.sound('dig', sp.pos);
      },
    },
  ],
});
