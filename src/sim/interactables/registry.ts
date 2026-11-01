import type { InteractableDef } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDef = InteractableDef<any>;
const defs = new Map<string, AnyDef>();

/** Call once at module top level in your interactable file. Same id replaces (HMR safe). */
export function defineInteractable<S>(def: InteractableDef<S>): InteractableDef<S> {
  defs.set(def.id, def as AnyDef);
  return def;
}

export const allInteractables = (): AnyDef[] => [...defs.values()];
