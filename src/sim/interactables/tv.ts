import type { TvShow, Vec3 } from '../../shared/contracts';
import type { Difficulty } from '../../core/types';
import { CFG } from '../../config';
import { add, dist, facingDot, fwd } from '../../core/math';
import { defineInteractable } from './registry';
import { scale } from './common';
import type { SimContext } from './types';

const SHOWS: TvShow[] = ['birds', 'rickAndMeowty', 'planetMearth', 'cucumber', 'laserDot', 'cookingShow'];
/** ADDENDUM 3.3: bots stay hypnotized this long (players: CFG.tv.duration) */
const BOT_HYPNO: Record<Difficulty, number> = { kitten: 10, houseCat: 7, feral: 4 };
const screen = (ctx: SimContext): Vec3 => {
  const sp = ctx.spot('tv');
  return add(add(sp.pos, fwd(sp.facing), 0.8), [0, 0.75, 0]);
};

function turnOff(ctx: SimContext, s: { on: number }) {
  s.on = 0;
  ctx.setWorld('tv.on', false);
  ctx.loop('tv', 'chatter', false);
  for (const c of ctx.chars('cat')) if (c.st.hypnotized) ctx.clear(c, 'hypnotized');
}

defineInteractable({
  id: 'tv',
  spot: 'tv',
  state: () => ({ on: 0, cd: 0 }),
  onRoundStart(ctx) {
    ctx.setWorld('tv.on', false);
    ctx.setWorld('tv.cd', 0);
  },
  tick(ctx, s, dt) {
    s.cd = Math.max(0, s.cd - dt);
    ctx.setWorld('tv.cd', Math.ceil(s.cd));
    if (s.on > 0 && ctx.isDark()) turnOff(ctx, s);
    else if (s.on > 0 && (s.on -= dt) <= 0) turnOff(ctx, s);
  },
  uses: [
    {
      role: 'sitter', mode: 'instant', label: 'Put on Cat TV',
      check: (ctx, s) => (s.on > 0 ? false : ctx.isDark() ? 'No power' : s.cd > 0 ? `Cat TV in ${Math.ceil(s.cd)} s` : true),
      onComplete(ctx, s) {
        const T = CFG.tv, room = ctx.spot('tv').room;
        const botT = BOT_HYPNO[ctx.difficulty ?? 'houseCat'];
        s.on = Math.max(T.duration, botT);
        s.cd = scale(ctx).tv;
        ctx.setWorld('tv.on', true);
        ctx.setWorld('tv.show', SHOWS[Math.floor(ctx.rng() * SHOWS.length)]);
        ctx.sound('tvOn', ctx.spot('tv').pos);
        const scr = screen(ctx);
        for (const c of ctx.chars('cat')) {
          const eye: Vec3 = [c.p[0], c.p[1] + 0.3, c.p[2]];
          if (dist(c.p, scr) > T.range || !ctx.lineOfSight(eye, scr)) continue;
          if (ctx.roomAt(c.p) !== room && facingDot(c.yaw, c.p, scr) <= 0.3) continue;
          ctx.hypnotize(c, c.bot ? botT : T.duration, scr);
          ctx.fx('sparkle', add(c.p, [0, 0.6, 0]), { follow: c.id });
        }
      },
    },
    {
      role: 'cat', mode: 'hold', time: 2, anim: 'loaf', face: 'smug', label: 'Sit on the remote',
      check: (ctx, s, ch) => s.on > 0 && !ch.st.hypnotized,
      onComplete(ctx, s) {
        turnOff(ctx, s);
        ctx.sound('pop', ctx.spot('tv').pos);
      },
    },
  ],
});
