/** Bathtub: cats turn the tap on, the tub fills (20 s), then overflows into puddles. 20 s of overflow = FLOOD. */
import type { Vec3 } from '../../shared/contracts';
import { defineInteractable } from './registry';
import { disaster, floorSpots, jitter, r2 } from './common';

const FILL = 20, OVERFLOW = 20, PUDDLE_EVERY = 4, DRAIN = 40;
type S = { running: boolean; water: number; overflow: number; puddleT: number; flooded: boolean; spots: Vec3[]; by?: string };

defineInteractable<S>({
  id: 'tubFaucet',
  spot: 'tubFaucet',
  state: () => ({ running: false, water: 0, overflow: 0, puddleT: 1, flooded: false, spots: [] }),
  onRoundStart(ctx, s) {
    ctx.setWorld('tub.running', false);
    ctx.setWorld('tub.water', 0);
    ctx.setWorld('flood', 0);
    s.spots = floorSpots(ctx, ['bathroom', 'hallway'], ctx.spot('tubFaucet').pos, 9);
  },
  tick(ctx, s, dt) {
    const sp = ctx.spot('tubFaucet');
    if (!s.running) {
      // plug leaks: an off tap slowly gives the sitter back the fill time
      if (!s.flooded && s.water > 0) { s.water = Math.max(0, s.water - dt / DRAIN); ctx.setWorld('tub.water', r2(s.water)); }
      return;
    }
    s.water = Math.min(1, s.water + dt / FILL);
    ctx.setWorld('tub.water', r2(s.water));
    if (s.water >= 1) {
      s.overflow += dt;
      ctx.setWorld('flood', r2(Math.min(1, s.overflow / OVERFLOW)));
      if ((s.puddleT -= dt) <= 0) {
        s.puddleT = PUDDLE_EVERY;
        // spreads from the bathroom out into the hallway as it goes on
        const k = Math.max(2, Math.ceil(s.spots.length * Math.min(1, 0.25 + s.overflow / OVERFLOW)));
        const base = s.spots[Math.floor(ctx.rng() * Math.min(k, s.spots.length))] ?? sp.pos;
        ctx.addMess('puddle', jitter(ctx, base, 0.35), { by: s.by });
        ctx.sound('splash', base, { volume: 0.5 });
      }
    }
    const prog = (s.water * FILL + s.overflow) / (FILL + OVERFLOW);
    ctx.alert('flood', true, s.water >= 1 ? 'The tub is overflowing' : 'The tub is running', sp.pos, prog);
    if (s.overflow >= OVERFLOW && !s.flooded) {
      s.flooded = true;
      s.running = false;
      ctx.setWorld('tub.running', false);
      ctx.setWorld('flood', 1);
      ctx.loop('tub', 'waterRun', false);
      ctx.alert('flood', false);
      disaster(ctx, 'tubFaucet', 'FLOOD', 15);
    }
  },
  uses: [
    {
      role: 'cat', mode: 'minigame', minigame: 'faucet', time: 8, alert: 'Bathtub', anim: 'interact', face: 'focused',
      label: 'Run a bath', undo: 'Tighten the tap',
      check: (ctx, s) => !s.running && !s.flooded,
      onComplete(ctx, s, ch) {
        const p = ctx.spot('tubFaucet').pos;
        s.running = true;
        s.by = ch.id;
        ctx.setWorld('tub.running', true);
        ctx.loop('tub', 'waterRun', true, p);
        ctx.sound('splash', p);
        ctx.toast('The tub is running', 'sitter', 'bad');
      },
    },
    {
      role: 'sitter', mode: 'hold', time: 1.5, anim: 'interact', label: 'Turn off the tap',
      check: (ctx, s) => s.running,
      onComplete(ctx, s) {
        s.running = false;
        ctx.setWorld('tub.running', false);
        ctx.loop('tub', 'waterRun', false);
        ctx.alert('flood', false);
        ctx.sound('clink', ctx.spot('tubFaucet').pos);
      },
    },
  ],
});
