import { CFG } from '../../config';
import { defineInteractable } from './registry';

const B = CFG.blackout;

defineInteractable({
  id: 'fuseBox',
  spot: 'fuseBox',
  state: () => ({ cooldown: 0 }),
  onRoundStart(ctx) {
    ctx.setWorld('lights', true);
    ctx.setWorld('fuse.flipped', false);
  },
  tick(ctx, s, dt) { s.cooldown = Math.max(0, s.cooldown - dt); },
  uses: [
    {
      role: 'cat', mode: 'hold', time: B.flip, alert: 'Fuse box', anim: 'interact', face: 'smug', label: 'Flip the breaker',
      check: (ctx, s) => (ctx.isDark() ? false : s.cooldown > 0 ? 'The breaker is still warm' : true),
      onComplete(ctx, s, ch) {
        const p = ctx.spot('fuseBox').pos;
        ctx.setWorld('lights', false);
        ctx.setWorld('fuse.flipped', true);
        ctx.sound('breaker', p);
        ctx.alert('blackout', true, 'Blackout: reset the fuse box', p);
        ctx.popup('BLACKOUT', undefined, '#7f8cff');
      },
    },
    {
      role: 'sitter', mode: 'hold', time: B.reset, anim: 'interact', label: 'Reset the breaker',
      check: (ctx) => ctx.isDark(),
      onComplete(ctx, s) {
        ctx.setWorld('lights', true);
        ctx.setWorld('fuse.flipped', false);
        ctx.sound('breaker', ctx.spot('fuseBox').pos);
        ctx.alert('blackout', false);
        s.cooldown = B.cooldown;
      },
    },
  ],
});
