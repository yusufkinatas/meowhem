/** The owner's dinner: cats carry it off in their mouth (eaten under the bed, see hideout.ts), the sitter puts it back. */
import type { Vec3 } from '../../shared/contracts';
import { PROP_DEFS } from '../../shared/propDefs';
import { distXZ } from '../../core/math';
import { defineInteractable } from './registry';
import type { PropView, SimContext } from './types';

type S = { home: Vec3 | null; rot: number };
const loose = (ctx: SimContext): PropView | undefined => ctx.props('salmon')[0];
const away = (s: S, p: PropView) => !s.home || distXZ(p.p, s.home) > 0.25 || p.p[1] < s.home[1] - 0.2;

defineInteractable<S>({
  id: 'salmon',
  spot: 'salmon',
  state: () => ({ home: null, rot: 0 }),
  onRoundStart(ctx, s) {
    const sp = ctx.level.props.find((p) => p.kind === 'salmon');
    s.home = sp ? [...sp.pos] : [...ctx.spot('salmon').pos];
    s.rot = sp?.rotY ?? 0;
  },
  tick(ctx) {
    if (ctx.world('done.salmon')) { ctx.alert('salmon', false); return; }
    const thief = ctx.chars('cat').find((c) => c.item === 'salmon');
    if (thief) ctx.alert('salmon', true, 'Someone took dinner', thief.p, ctx.progress(`i:hideout:0@${thief.id}`));
    else ctx.alert('salmon', false);
  },
  uses: [
    {
      role: 'cat', mode: 'hold', time: 1, anim: 'eat', face: 'smug', label: 'Take dinner', range: 0.75,
      at: (ctx) => loose(ctx)?.p ?? null,
      check: (ctx, s, ch) => !ch.item && !ctx.world('done.salmon'),
      onComplete(ctx, s, ch) {
        const p = loose(ctx);
        if (!p) return;
        ctx.removeProp(p.id);
        ctx.setItem(ch, 'salmon');
        ctx.sound('pickup', ch.p);
      },
    },
    {
      role: 'sitter', mode: 'hold', time: 1, anim: 'clean', label: 'Put dinner back', range: 1.1,
      at: (ctx, s) => { const p = loose(ctx); return p && away(s, p) ? p.p : null; },
      onComplete(ctx, s, ch) {
        const p = loose(ctx);
        if (!p || !s.home) return;
        ctx.fx('poof', p.p);
        ctx.moveProp(p.id, s.home, s.rot);
        ctx.fx('sparkle', [s.home[0], s.home[1] + PROP_DEFS.salmon.half![1], s.home[2]]);
        ctx.sound('pop', s.home);
        ctx.stat(ch.id, 'tidied', 1);
      },
    },
  ],
});
