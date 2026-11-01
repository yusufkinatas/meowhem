/** Delivery: the laptop order arrives here. Cats open it (catnip party or wet food), the sitter can send it back. */
import type { Vec3 } from '../../shared/contracts';
import { CFG } from '../../config';
import { add, distXZ, fwd } from '../../core/math';
import { defineInteractable } from './registry';
import type { SimContext } from './types';

const KEY = 'i:frontDoor:0';
type S = { pkg: number; delivered: boolean; opened: boolean };

const pkgPos = (ctx: SimContext, s: S): Vec3 | null => ctx.props('package').find((p) => p.id === s.pkg)?.p ?? null;

defineInteractable<S>({
  id: 'frontDoor',
  spot: 'frontDoor',
  state: () => ({ pkg: -1, delivered: false, opened: false }),
  onRoundStart(ctx) {
    ctx.setWorld('package.open', false);
  },
  tick(ctx, s) {
    const at = Number(ctx.world('delivery.at') ?? 0);
    if (!s.delivered && at > 0 && ctx.time >= at) {
      s.delivered = true;
      const sp = ctx.spot('frontDoor');
      const p = add(sp.pos, fwd(sp.facing), 0.35);
      s.pkg = ctx.spawnProp('package', p, sp.facing);
      ctx.sound('doorbell', p);
      ctx.toast('Package at the front door', undefined, 'info');
    }
    const p = pkgPos(ctx, s);
    if (!p) { ctx.alert('delivery', false); return; }
    if (!s.opened) {
      ctx.alert('delivery', true, 'Package at the front door', p, ctx.progress(KEY));
      return;
    }
    // the box beats the contents: a cat loafing in it loses its name tag
    for (const c of ctx.chars('cat')) {
      if (c.loaf && distXZ(c.p, p) < 0.45 && Math.abs(c.p[1] - p[1]) < 0.5) ctx.give(c, 'hidden', 0.3 - (c.st.hidden ?? 0));
    }
  },
  uses: [
    {
      role: 'cat', mode: 'minigame', minigame: 'openBox', time: 5, shared: true, anim: 'scratch', face: 'focused',
      label: 'Open the box', undo: 'Tape it back up', range: 0.9,
      at: (ctx, s) => (s.opened ? null : pkgPos(ctx, s)),
      minigameData: (ctx) => ({ order: ctx.world('laptop.order') }),
      onComplete(ctx, s, ch) {
        const p = pkgPos(ctx, s) ?? ch.p;
        s.opened = true;
        ctx.setWorld('package.open', true);
        ctx.alert('delivery', false);
        ctx.sound('pop', p);
        if (ctx.world('laptop.order') === 'wetFood') {
          for (const c of ctx.chars('cat')) ctx.give(c, 'fed', CFG.buffs.fedTime);
          ctx.fx('hearts', add(p, [0, 0.4, 0]));
          ctx.sound('gulp', p);
        } else {
          for (const c of ctx.chars('cat')) ctx.give(c, 'catnip', CFG.buffs.catnipTime);
          ctx.addMess('catnip', add(p, fwd(ctx.rng() * 6.28), 0.4), { by: ch.id });
          ctx.fx('catnipHaze', add(p, [0, 0.3, 0]), { duration: 4 });
        }
      },
    },
    {
      role: 'sitter', mode: 'hold', time: 3, anim: 'interact', label: 'Return to sender', range: 1.1,
      at: (ctx, s) => (s.opened ? null : pkgPos(ctx, s)),
      onComplete(ctx, s) {
        const p = pkgPos(ctx, s);
        ctx.removeProp(s.pkg);
        s.pkg = -1;
        ctx.alert('delivery', false);
        ctx.sound('door', ctx.spot('frontDoor').pos, { volume: 0.6 });
        if (p) ctx.fx('poof', p);
      },
    },
  ],
});
