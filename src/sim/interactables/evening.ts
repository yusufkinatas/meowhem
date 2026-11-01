/** Evening timeline (ADDENDUM M15). Times are time-left values, same for every round length. No uses, only tick. */
import type { Vec3 } from '../../shared/contracts';
import { add, fwd } from '../../core/math';
import { defineInteractable } from './registry';
import type { SimContext } from './types';

type S = { prev: number; steps: number[]; look: Vec3 | null; lookUntil: number };
const door = (ctx: SimContext): Vec3 => { const sp = ctx.spot('frontDoor'); return add(sp.pos, fwd(sp.facing), 0.5); };

defineInteractable<S>({
  id: 'evening',
  state: () => ({ prev: Infinity, steps: [], look: null, lookUntil: 0 }),
  onRoundStart(ctx, s) {
    s.prev = ctx.timeLeft;
    ctx.setWorld('time.dusk', 0);
    ctx.setWorld('owners.headlights', false);
  },
  tick(ctx, s) {
    const t = ctx.timeLeft, prev = s.prev;
    s.prev = t;
    const at = (T: number) => prev > T && t <= T;
    ctx.setWorld('time.dusk', Math.round(Math.min(1, Math.max(0, (90 - t) / 60)) * 50) / 50);
    if (at(60)) for (const c of ctx.chars('cat')) ctx.give(c, 'zoomies', 10);
    if (at(30)) {
      ctx.setWorld('owners.headlights', true);
      ctx.sound('carArrive', undefined, { volume: 0.45 });
    }
    if (at(10)) ctx.sound('door', door(ctx), { pitch: 0.75, volume: 0.6 });
    if (at(8)) {
      // cats hear the car first
      s.look = add(door(ctx), [0, 1.0, 0]);
      s.lookUntil = ctx.time + 1;
      for (const c of ctx.chars('cat')) if (!c.st.hypnotized && !c.st.treat) c.lookAt = s.look;
    }
    if (at(5)) for (let i = 0; i < 4; i++) s.steps.push(ctx.time + i * 0.45);
    if (at(3)) ctx.sound('keys', door(ctx));
    while (s.steps.length && ctx.time >= s.steps[0]) { s.steps.shift(); ctx.sound('step', door(ctx), { volume: 0.5 }); }
    if (s.look && ctx.time >= s.lookUntil) {
      for (const c of ctx.chars('cat')) if (c.lookAt === s.look) c.lookAt = null;
      s.look = null;
    }
  },
  uses: [],
});
