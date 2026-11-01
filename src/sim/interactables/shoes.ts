import { defineInteractable } from './registry';

defineInteractable({
  id: 'shoes',
  spot: 'shoes',
  uses: [
    {
      role: 'cat', mode: 'hold', time: 1, anim: 'interact', face: 'neutral', label: 'Sniff the shoes',
      check: (ctx, s, ch) => !ch.st.flehmen,
      onComplete(ctx, s, ch) { ctx.give(ch, 'flehmen', 2); },
    },
  ],
});
