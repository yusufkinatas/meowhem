import { defineInteractable } from './registry';
import { disaster } from './common';

const STAGES = 3;

defineInteractable({
  id: 'sofa',
  spot: 'sofa',
  state: () => ({ stage: 0, workers: 0 }),
  onRoundStart(ctx) { ctx.setWorld('sofa.shred', 0); },
  uses: [
    {
      role: 'cat', mode: 'hold', time: 6, shared: true, alert: 'Sofa', anim: 'scratch', face: 'focused',
      label: 'Scratch the sofa', undo: 'Flip the cushion', // undo resets only the current stage
      check: (ctx, s) => s.stage < STAGES,
      onStart(ctx, s) {
        if (s.workers++ === 0) ctx.loop('sofa', 'scratch', true, ctx.spot('sofa').pos);
      },
      onStop(ctx, s) {
        if (--s.workers <= 0) { s.workers = 0; ctx.loop('sofa', 'scratch', false); }
      },
      onComplete(ctx, s) {
        s.stage++;
        ctx.setWorld('sofa.shred', s.stage);
        ctx.fx('scratchMarks', ctx.spot('sofa').pos);
        const label = `SOFA ${s.stage}/${STAGES}`;
        if (s.stage === STAGES) disaster(ctx, 'sofa', label, 4);
        else ctx.addPermanent(4, label, undefined, 'sofa');
      },
    },
  ],
});
