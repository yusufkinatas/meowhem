import type { DoorDef } from '../../shared/contracts';
import { CFG } from '../../config';
import { distXZ } from '../../core/math';
import { doorBox } from '../../core/physics';
import { defineInteractable } from './registry';
import type { SimContext } from './types';

const IDS: DoorDef['id'][] = ['bathroomDoor', 'bedroomDoor', 'officeDoor'];

function blocked(ctx: SimContext, id: DoorDef['id']) {
  const d = ctx.level.doors.find((x) => x.id === id);
  if (!d) return true;
  const c = doorBox(d).center;
  return ctx.chars().some((ch) => distXZ(ch.p, c) < d.width / 2 + 0.25 && !ch.forced);
}

for (const id of IDS) {
  defineInteractable({
    id,
    spot: id,
    uses: [
      {
        role: 'sitter', mode: 'instant', label: (ctx) => (ctx.doorOpen(id) ? 'Close the door' : 'Open the door'),
        check: (ctx) => (!ctx.level.doors.some((d) => d.id === id) ? false : ctx.doorOpen(id) && blocked(ctx, id) ? 'Someone is in the doorway' : true),
        onComplete(ctx) { ctx.setDoor(id, !ctx.doorOpen(id)); },
      },
      {
        // cats hang on the handle until it gives
        role: 'cat', mode: 'hold', time: CFG.door.catOpen, anim: 'hangDoor', label: 'Hang on the handle',
        check: (ctx) => ctx.level.doors.some((d) => d.id === id) && !ctx.doorOpen(id),
        onComplete(ctx) { ctx.setDoor(id, true); },
      },
    ],
  });
}
