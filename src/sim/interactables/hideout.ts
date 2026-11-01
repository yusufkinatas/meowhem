/** Under the bed: the sitter can't reach. Dinner gets eaten here. 6 s of hiding and the cat gets bored and slides out (10 s re-entry cooldown). */
import type { Vec3 } from '../../shared/contracts';
import { distXZ, yawTo } from '../../core/math';
import { defineInteractable } from './registry';
import { disaster } from './common';
import type { Char, SimContext } from './types';

const CAP = 6, REENTRY = 10;
type S = { t: Map<string, number>, until: Map<string, number> };

const under = (ctx: SimContext, c: Char) => {
  const sp = ctx.spot('hideout');
  return !c.forced && c.p[1] < 0.3 && distXZ(c.p, sp.pos) < sp.radius;
};

function slideOut(ctx: SimContext, c: Char) {
  const sp = ctx.spot('hideout');
  const room = sp.room;
  let best: Vec3 | null = null, bd = Infinity;
  for (const n of ctx.level.nav.nodes) {
    const d = distXZ(n.pos, sp.pos);
    if (n.pos[1] > 0.2 || d < sp.radius + 0.5 || ctx.roomAt(n.pos) !== room) continue;
    if (d < bd) { bd = d; best = n.pos; }
  }
  const p: Vec3 = best ?? [sp.pos[0] - Math.sin(sp.facing) * (sp.radius + 0.6), 0, sp.pos[2] - Math.cos(sp.facing) * (sp.radius + 0.6)];
  ctx.cancelWork(c);
  ctx.teleport(c, [p[0], 0.02, p[2]], yawTo(sp.pos, p));
  ctx.fx('dust', p, { scale: 0.6 });
}

defineInteractable<S>({
  id: 'hideout',
  spot: 'hideout',
  state: () => ({ t: new Map(), until: new Map() }),
  tick(ctx, s, dt) {
    for (const c of ctx.chars('cat')) {
      if (!under(ctx, c)) { s.t.delete(c.id); continue; }
      if (ctx.time < (s.until.get(c.id) ?? 0)) { slideOut(ctx, c); continue; }
      ctx.give(c, 'hidden', 0.3 - (c.st.hidden ?? 0));
      if (c.work?.key.startsWith('i:hideout:')) continue; // eating isn't boredom
      const t = (s.t.get(c.id) ?? 0) + dt;
      s.t.set(c.id, t);
      if (t >= CAP) {
        s.t.delete(c.id);
        s.until.set(c.id, ctx.time + REENTRY);
        slideOut(ctx, c);
      }
    }
  },
  uses: [
    {
      role: 'cat', mode: 'hold', time: 5, alert: 'Under the bed', anim: 'eat', face: 'happy', label: 'Eat dinner',
      check: (ctx, s, ch) => ch.item === 'salmon',
      onStart(ctx, s, ch) { ctx.loop(`eat:${ch.id}`, 'crunch', true, ctx.spot('hideout').pos); },
      onStop(ctx, s, ch) { ctx.loop(`eat:${ch.id}`, 'crunch', false); },
      onComplete(ctx, s, ch) {
        ctx.setItem(ch, null);
        ctx.sound('gulp', ch.p);
        s.t.set(ch.id, CAP - 1.5); // full and done: out soon
        disaster(ctx, 'salmon', 'DINNER', 10);
      },
    },
  ],
});
