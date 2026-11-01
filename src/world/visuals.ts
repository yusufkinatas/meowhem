/** STUB: replaced by the world-visuals agent. Implements every world visual key on top of LevelRefs. */
import type { LevelRefs, WorldVisuals } from './refs';

export function createWorldVisuals(_refs: LevelRefs): WorldVisuals {
  return { setVisual() {}, update() {}, setTvTexture() {} };
}
