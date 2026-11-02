/**
 * Physical definition of every dynamic prop. The sim builds Rapier colliders from this,
 * and props.ts builds meshes that MATCH these dimensions.
 * Prop mesh origin = center of the collider shape (NOT the bottom).
 * box: half = [hx, hy, hz].  cyl: radius r, halfHeight hh (axis = Y).  sphere: radius r.
 * Hand-held things are ~1.3-1.5x real size (salmon, package, pillow 1x): next to the chunky chibi hands and the
 * 0.45 m cube cat, true-size mugs and phones read as specks from the third-person camera.
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
  mug:        { shape: 'cyl', r: 0.076, hh: 0.072, mass: 0.3, breaksInto: 'shards', fallenMess: 1 },
  glass:      { shape: 'cyl', r: 0.074, hh: 0.088, mass: 0.2, breaksInto: 'shards', fallenMess: 1 },
  plate:      { shape: 'cyl', r: 0.137, hh: 0.018, mass: 0.4, breaksInto: 'shards', fallenMess: 1 },
  vase:       { shape: 'cyl', r: 0.096, hh: 0.168, mass: 0.8, breaksInto: 'shards', fallenMess: 1.5 },
  book:       { shape: 'box', half: [0.098, 0.13, 0.033], mass: 0.5, fallenMess: 1 },
  remote:     { shape: 'box', half: [0.047, 0.0145, 0.116], mass: 0.15, fallenMess: 0.5 },
  plantPot:   { shape: 'cyl', r: 0.098, hh: 0.126, mass: 1.0, breaksInto: 'soil', fallenMess: 1.5 },
  frame:      { shape: 'box', half: [0.12, 0.156, 0.096], mass: 0.3, breaksInto: 'shards', fallenMess: 1 },
  wineBottle: { shape: 'cyl', r: 0.072, hh: 0.18, mass: 1.0, breaksInto: 'shards', fallenMess: 1.5 },
  cerealBox:  { shape: 'box', half: [0.12, 0.18, 0.042], mass: 0.4, breaksInto: 'food', fallenMess: 1 },
  toyMouse:   { shape: 'box', half: [0.046, 0.027, 0.08], mass: 0.05, fallenMess: 0 },
  yarn:       { shape: 'sphere', r: 0.09, mass: 0.1, fallenMess: 0 },
  phone:      { shape: 'box', half: [0.046, 0.0065, 0.098], mass: 0.2, fallenMess: 1 },
  candle:     { shape: 'cyl', r: 0.063, hh: 0.081, mass: 0.2, fallenMess: 0.5 },
  tpRoll:     { shape: 'cyl', r: 0.074, hh: 0.068, mass: 0.1, fallenMess: 0.5 },
  salmon:     { shape: 'box', half: [0.14, 0.06, 0.18], mass: 0.8, fallenMess: 2, special: true },
  package:    { shape: 'box', half: [0.25, 0.125, 0.2], mass: 2.0, fallenMess: 0, special: true },
  pillow:     { shape: 'box', half: [0.3, 0.09, 0.23], mass: 0.5, fallenMess: 1 },
  bowl:       { shape: 'cyl', r: 0.108, hh: 0.055, mass: 0.3, breaksInto: 'shards', fallenMess: 1 },
  shoe:       { shape: 'box', half: [0.06, 0.0825, 0.169], mass: 0.4, fallenMess: 0.5 },
  sock:       { shape: 'box', half: [0.0915, 0.0515, 0.145], mass: 0.05, fallenMess: 0.5 },
  cucumber:   { shape: 'box', half: [0.029, 0.029, 0.15], mass: 0.2, fallenMess: 0.5 },
  lamp:       { shape: 'cyl', r: 0.11, hh: 0.23, mass: 1.5, breaksInto: 'shards', fallenMess: 1.5 },
  trophy:     { shape: 'cyl', r: 0.09, hh: 0.13, mass: 0.8, fallenMess: 1 },
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
