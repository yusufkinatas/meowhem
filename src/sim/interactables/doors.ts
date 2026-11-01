import type { DoorDef, Vec3 } from '../../shared/contracts';
import { CFG } from '../../config';
import { distXZ, wrapAngle } from '../../core/math';
import { doorBox } from '../../core/physics';
import { defineInteractable } from './registry';
import type { Char, SimContext } from './types';

const IDS: DoorDef['id'][] = ['bathroomDoor', 'bedroomDoor', 'officeDoor'];
const CAT_R = CFG.cat.radius + 0.05;

const def = (ctx: SimContext, id: DoorDef['id']) => ctx.level.doors.find((x) => x.id === id);

/** does a circle of radius r at p overlap the quarter-disc the panel sweeps through? */
function inSweep(d: DoorDef, p: Vec3, r: number) {
  const qx = p[0] - d.hinge[0], qz = p[2] - d.hinge[2];
  const dist = Math.hypot(qx, qz);
  if (dist < r) return true;
  if (dist > d.width + r) return false;
  const span = wrapAngle(d.openYaw - d.closedYaw);
  const a = wrapAngle(Math.atan2(-qz, qx) - d.closedYaw) * Math.sign(span || 1);
  const m = Math.asin(Math.min(1, r / dist));
  return a > -m && a < Math.abs(span) + m;
}

/** the closed panel's line (where the sitter would get stuck in it) */
function onPanel(d: DoorDef, p: Vec3, r: number) {
  const b = doorBox(d);
  const dx = p[0] - b.center[0], dz = p[2] - b.center[2];
  const c = Math.cos(d.closedYaw), s = Math.sin(d.closedYaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) < b.half[0] + r && Math.abs(lz) < b.half[2] + r;
}

function blocked(ctx: SimContext, d: DoorDef) {
  return ctx.chars().some((ch) => !ch.grabbedBy && !ch.st.caged &&
    (ch.role === 'cat' ? inSweep(d, ch.p, CAT_R) : onPanel(d, ch.p, CFG.sitter.radius)));
}

/** which side of the closed panel a point is on */
const side = (d: DoorDef, p: Vec3) => {
  const b = doorBox(d).center;
  return Math.sign((p[0] - b[0]) * Math.sin(d.closedYaw) + (p[2] - b[2]) * Math.cos(d.closedYaw));
};

type S = { by: string; until: number; sides: Map<string, number> } | null;

for (const id of IDS) {
  defineInteractable<{ watch: S }>({
    id,
    spot: id,
    state: () => ({ watch: null }),
    tick(ctx, s) {
      // Doorman stat: did a cat actually use the door the sitter opened for it
      const w = s.watch, d = def(ctx, id);
      if (!w || !d) return;
      if (ctx.time > w.until) { s.watch = null; return; }
      for (const [cid, sd] of w.sides) {
        const c = ctx.char(cid);
        if (!c || side(d, c.p) === sd || distXZ(c.p, doorBox(d).center) > 2) continue;
        ctx.stat(w.by, 'doorsUsed', 1);
        s.watch = null;
        return;
      }
    },
    uses: [
      {
        role: 'sitter', mode: 'instant', label: (ctx) => (ctx.doorOpen(id) ? 'Close the door' : 'Open the door'),
        check: (ctx) => { const d = def(ctx, id); return !d ? false : ctx.doorOpen(id) && blocked(ctx, d) ? "Someone's in the way" : true; },
        onComplete(ctx, s, ch: Char) {
          const d = def(ctx, id);
          const opening = !ctx.doorOpen(id);
          ctx.setDoor(id, opening);
          if (!opening || !d) return;
          const near = ctx.chars('cat').filter((c) => distXZ(c.p, d.hinge) < 2.5 && !c.forced);
          if (!near.length) return;
          ctx.stat(ch.id, 'doorsOpened', 1);
          s.watch = { by: ch.id, until: ctx.time + 5, sides: new Map(ctx.chars('cat').filter((c) => distXZ(c.p, d.hinge) < 4).map((c) => [c.id, side(d, c.p)])) };
        },
      },
      {
        // cats hang on the handle until it gives
        role: 'cat', mode: 'hold', time: CFG.door.catOpen, anim: 'hangDoor', label: 'Hang on the handle',
        check: (ctx, s, ch) => (!def(ctx, id) || ctx.doorOpen(id) ? false : ch.item ? 'Mouth full' : true),
        onComplete(ctx) { ctx.setDoor(id, true); },
      },
    ],
  });
}
