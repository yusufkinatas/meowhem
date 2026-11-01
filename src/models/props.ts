/** STUB: replaced by the world-visuals agent (downloaded prop/mess models, decal fallback). */
import type * as THREE from 'three';
import type { MessKind, PropKind } from '../shared/contracts';
import { createDevProp, createDevMess } from '../dev/devModels';

export function createProp(kind: PropKind): THREE.Object3D {
  return createDevProp(kind);
}
export function createMess(kind: MessKind): THREE.Object3D {
  return createDevMess(kind);
}
