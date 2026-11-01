/**
 * World visual keys (DESIGN.md 11 + ADDENDUM 2.0 / M22) on top of the real downloaded models the layout
 * placed (LevelRefs). Each feature is built independently: a missing ref or a throwing feature only
 * disables that feature. setVisual is idempotent and cheap; animation runs in update().
 */
import * as THREE from 'three';
import type { WorldVisualValue } from '../shared/contracts';
import type { LevelRefs, WorldVisuals } from './refs';
import type { Builder, Ctx, Feature } from './visuals/kit';
import { aquarium, catTree, curtains, headlights, livingWindow, plant, sofa, tv } from './visuals/living';
import { bathtub, flood, litter, toiletPaper } from './visuals/wet';
import { carrier, doneMarks, doorScratches, foodBowl, frontDoor, fuseBox, kitchenDecals, laptop, lights, pillow } from './visuals/home';

const BUILDERS: Record<string, Builder> = {
  lights, fuseBox, sofa, tv, aquarium, curtains, livingWindow, catTree, plant, headlights,
  bathtub, flood, toiletPaper, litter, frontDoor, doorScratches, kitchenDecals, foodBowl, carrier, laptop, pillow, doneMarks,
};

export function createWorldVisuals(refs: LevelRefs): WorldVisuals {
  const world = new THREE.Group();
  world.name = 'world-visuals';
  refs.group.add(world);
  const ctx: Ctx = {
    refs, world, floorY: refs.floorY,
    obj: (k) => refs.objects.get(k),
    room: (id) => refs.rooms.find((r) => r.id === id),
  };
  const keys = new Map<string, ((v: WorldVisualValue) => void)[]>();
  const updates: { name: string; fn: NonNullable<Feature['update']> }[] = [];
  const tvs: NonNullable<Feature['tv']>[] = [];
  for (const [name, build] of Object.entries(BUILDERS)) {
    try {
      const f = build(ctx);
      if (!f) continue;
      for (const [k, fn] of Object.entries(f.keys ?? {})) keys.set(k, [...(keys.get(k) ?? []), fn]);
      if (f.update) updates.push({ name, fn: f.update });
      if (f.tv) tvs.push(f.tv);
    } catch (err) {
      console.warn(`[visuals] ${name} disabled`, err);
    }
  }
  const last = new Map<string, WorldVisualValue>();
  return {
    setVisual(key, value) {
      if (last.get(key) === value) return;
      last.set(key, value);
      for (const fn of keys.get(key) ?? []) {
        try { fn(value); } catch (err) { console.warn(`[visuals] ${key}`, err); }
      }
    },
    update(dt, time) {
      for (let i = updates.length - 1; i >= 0; i--) {
        try { updates[i].fn(dt, time); } catch (err) { console.warn(`[visuals] ${updates[i].name} update disabled`, err); updates.splice(i, 1); }
      }
    },
    setTvTexture(tex) { for (const fn of tvs) fn(tex); },
  };
}
