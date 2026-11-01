/** Small helpers shared by interactable files (no defineInteractable here). */
import type { RoomId, SpotId, Vec3 } from '../../shared/contracts';
import { scaleFor, type ScaleRow } from '../../config';
import { add, distXZ, fwd } from '../../core/math';
import type { SimContext } from './types';

/** ADDENDUM 3.2 row for this round's cat count (bots included) */
export const scale = (ctx: SimContext): ScaleRow => scaleFor(ctx.n ?? ctx.chars('cat').length);

export const r2 = (v: number) => Math.round(v * 50) / 50;

/** a disaster's permanent lands: popup `LABEL  +N%` and the even split over its workers happen in the sim; sets `done.<spot>` */
export function disaster(ctx: SimContext, spot: SpotId, label: string, points: number) {
  ctx.setWorld(`done.${spot}`, true);
  ctx.addPermanent(points, label, undefined, spot);
}

/** highest per-cat progress of a non-shared use (e.g. the cat furthest up the curtains) */
export function maxProgress(ctx: SimContext, id: string, use = 0): number {
  let m = 0;
  for (const c of ctx.chars('cat')) m = Math.max(m, ctx.progress(`i:${id}:${use}@${c.id}`));
  return m;
}

/** floor nav nodes in these rooms, nearest to `near` first (fallback: a ring around `near`) */
export function floorSpots(ctx: SimContext, rooms: RoomId[], near: Vec3, maxD = 8): Vec3[] {
  const out = ctx.level.nav.nodes
    .map((n) => n.pos)
    .filter((p) => p[1] < 0.2 && distXZ(p, near) < maxD && rooms.includes(ctx.roomAt(p) as RoomId))
    .sort((a, b) => distXZ(a, near) - distXZ(b, near));
  if (out.length) return out;
  return [0, 1, 2, 3, 4, 5].map((i) => add([near[0], 0, near[2]], fwd(i), 0.8 + (i % 2) * 0.6));
}

/** random point within r of p (same height) */
export const jitter = (ctx: SimContext, p: Vec3, r: number): Vec3 => {
  const a = ctx.rng() * Math.PI * 2, d = Math.sqrt(ctx.rng()) * r;
  return [p[0] + Math.sin(a) * d, p[1], p[2] + Math.cos(a) * d];
};

/** a point on the floor behind the spot (where things fall when knocked off it) */
export const behind = (ctx: SimContext, spot: SpotId, d: number, spread = 0.6): Vec3 => {
  const sp = ctx.spot(spot);
  const p = add(sp.pos, fwd(sp.facing + Math.PI + (ctx.rng() - 0.5) * spread), d);
  return [p[0], Math.max(0.05, sp.pos[1] * 0.2), p[2]];
};
