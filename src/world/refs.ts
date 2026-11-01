/**
 * Seam between the level LAYOUT (src/world/level.ts, builds the house) and the WORLD VISUALS
 * (src/world/visuals.ts, implements every world visual key). Built in parallel by two agents.
 */
import type * as THREE from 'three';
import type { RoomDef, Spot, SpotId, WorldVisualValue } from '../shared/contracts';

/**
 * Objects the layout MUST register in LevelRefs.objects (the placed wrapper Group returned by
 * cloneModel(key), positioned in the house). Visuals look these up by key and decorate/animate them.
 */
export type RefKey =
  | 'sofa' | 'tv' | 'laptop' | 'aquarium' | 'curtains' | 'litterBox' | 'carrier' | 'foodBowl'
  | 'fridge' | 'stove' | 'catTree' | 'livingWindow' | 'frontDoor' | 'bedPillow' | 'bigPlant'
  | 'fuseBox' | 'tpHolder' | 'bathtub' | 'bed' | 'laundryBasket'
  | 'bathroomDoor' | 'bedroomDoor' | 'officeDoor'   // door LEAF groups (they rotate)
  | 'livingRug' | 'bedroomRug';

export interface LevelRefs {
  /** the level's root group (add any extra visuals here) */
  group: THREE.Group;
  objects: Map<RefKey, THREE.Object3D>;
  spots: Map<SpotId, Spot>;
  rooms: RoomDef[];
  /** room floor rectangles, y = floor height (flood sheet uses bathroom + hallway) */
  floorY: number;
  /** lamp shade / bulb meshes with emissive materials (blackout turns them off) */
  lampMeshes: THREE.Mesh[];
  /** non-shadow point/spot lights placed by the layout (blackout turns them off) */
  houseLights: THREE.Light[];
}

export interface WorldVisuals {
  setVisual(key: string, value: WorldVisualValue): void;
  update(dt: number, time: number): void;
  setTvTexture(tex: THREE.Texture | null): void;
}
