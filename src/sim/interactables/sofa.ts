import { defineInteractable } from './registry';

const STAGES = 3;

defineInteractable({
  id: 'sofa',
  spot: 'sofa',
  state: () => ({ stage: 0, workers: 0 }),
  onRoundStart(ctx) { ctx.setWorld('sofa.shred', 0); },
  uses: [
    {
      role: 'cat', mode: 'hold', time: 6, shared: true, alert: 'Sofa', anim: 'scratch', face: 'focused',
      label: (ctx, s) => `Scratch the sofa (${s.stage + 1}/${STAGES})`,
      check: (ctx, s) => s.stage < STAGES,
      onStart(ctx, s) {
        if (s.workers++ === 0) ctx.loop('sofa', 'scratch', true, ctx.spot('sofa').pos);
      },
      onStop(ctx, s) {
        if (--s.workers <= 0) { s.workers = 0; ctx.loop('sofa', 'scratch', false); }
      },
      onComplete(ctx, s, ch) {
        s.stage++;
        ctx.setWorld('sofa.shred', s.stage);
        ctx.fx('scratchMarks', ctx.spot('sofa').pos);
        ctx.addPermanent(4, s.stage === STAGES ? 'Sofa: ruined' : 'Sofa scratched', ch.id);
      },
    },
  ],
});
