/**
 * Physical definition of every dynamic prop. The sim builds Rapier colliders from this,
 * and props.ts builds meshes that MATCH these dimensions.
 * Prop mesh origin = center of the collider shape (NOT the bottom).
 * box: half = [hx, hy, hz].  cyl: radius r, halfHeight hh (axis = Y).  sphere: radius r.
 */
import type { PropKind, MessKind } from './contracts';

export interface PropDef {
  shape: 'box' | 'cyl' | 'sphere';
  half?: [number, number, number];
  r?: number;
  hh?: number;
  mass: number;
  /** shatters when it hits the floor hard enough; leaves this mess */
  breaksInto?: MessKind;
  /** mess weight while knocked onto the floor and not tidied (DESIGN.md: "fallen prop") */
  fallenMess: number;
  /** special props are handled by interactables, not by generic knock/tidy logic */
  special?: boolean;
}

export const PROP_DEFS: Record<PropKind, PropDef> = {
  mug:        { shape: 'cyl', r: 0.045, hh: 0.05, mass: 0.3, breaksInto: 'shards', fallenMess: 1 },
  glass:      { shape: 'cyl', r: 0.055, hh: 0.065, mass: 0.2, breaksInto: 'shards', fallenMess: 1 },
  plate:      { shape: 'cyl', r: 0.11, hh: 0.012, mass: 0.4, breaksInto: 'shards', fallenMess: 1 },
  vase:       { shape: 'cyl', r: 0.085, hh: 0.15, mass: 0.8, breaksInto: 'shards', fallenMess: 1.5 },
  book:       { shape: 'box', half: [0.075, 0.1, 0.025], mass: 0.5, fallenMess: 1 },
  remote:     { shape: 'box', half: [0.033, 0.01, 0.08], mass: 0.15, fallenMess: 0.5 },
  plantPot:   { shape: 'cyl', r: 0.07, hh: 0.09, mass: 1.0, breaksInto: 'soil', fallenMess: 1.5 },
  frame:      { shape: 'box', half: [0.1, 0.13, 0.08], mass: 0.3, breaksInto: 'shards', fallenMess: 1 },
  wineBottle: { shape: 'cyl', r: 0.06, hh: 0.15, mass: 1.0, breaksInto: 'shards', fallenMess: 1.5 },
  cerealBox:  { shape: 'box', half: [0.1, 0.15, 0.035], mass: 0.4, breaksInto: 'food', fallenMess: 1 },
  toyMouse:   { shape: 'box', half: [0.03, 0.02, 0.05], mass: 0.05, fallenMess: 0 },
  yarn:       { shape: 'sphere', r: 0.06, mass: 0.1, fallenMess: 0 },
  phone:      { shape: 'box', half: [0.035, 0.005, 0.075], mass: 0.2, fallenMess: 1 },
  candle:     { shape: 'cyl', r: 0.047, hh: 0.06, mass: 0.2, fallenMess: 0.5 },
  tpRoll:     { shape: 'cyl', r: 0.055, hh: 0.05, mass: 0.1, fallenMess: 0.5 },
  salmon:     { shape: 'box', half: [0.14, 0.06, 0.18], mass: 0.8, fallenMess: 2, special: true },
  package:    { shape: 'box', half: [0.25, 0.125, 0.2], mass: 2.0, fallenMess: 0, special: true },
  pillow:     { shape: 'box', half: [0.3, 0.09, 0.23], mass: 0.5, fallenMess: 1 },
  bowl:       { shape: 'cyl', r: 0.08, hh: 0.035, mass: 0.3, breaksInto: 'shards', fallenMess: 1 },
  shoe:       { shape: 'box', half: [0.05, 0.05, 0.13], mass: 0.4, fallenMess: 0.5 },
  sock:       { shape: 'box', half: [0.065, 0.035, 0.1], mass: 0.05, fallenMess: 0.5 },
  cucumber:   { shape: 'box', half: [0.025, 0.025, 0.1], mass: 0.2, fallenMess: 0.5 },
  lamp:       { shape: 'cyl', r: 0.095, hh: 0.2, mass: 1.5, breaksInto: 'shards', fallenMess: 1.5 },
  trophy:     { shape: 'cyl', r: 0.07, hh: 0.1, mass: 0.8, fallenMess: 1 },
};

/** Mess weights in percentage points of the Mess meter while the mess exists (cleanable). */
export const MESS_WEIGHTS: Record<MessKind, number> = {
  shards: 3,
  poop: 6,
  hairball: 3,   // doubled when it lands on a rug (cat owners know)
  soil: 3,
  fur: 1.5,
  puddle: 2,
  litter: 1,
  tp: 2,
  fish: 2,
  catnip: 2,
  food: 2,
};

/** Seconds of "hold E" for the sitter to clean each mess kind at 1x speed. */
export const CLEAN_TIME: Record<MessKind, number> = {
  shards: 2.0, poop: 2.5, hairball: 1.5, soil: 2.0, fur: 1.0, puddle: 2.0,
  litter: 1.0, tp: 1.5, fish: 1.5, catnip: 1.5, food: 1.5,
};
