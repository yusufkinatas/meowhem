/**
 * The ONLY place that imports concrete asset modules. Everything else codes against contracts.ts.
 * Every factory falls back to the src/dev placeholder if the real module throws, and
 * ?dev=cat,sitter,level,props (or ?dev=all) forces placeholders for debugging.
 */
import type * as THREE from 'three';
import type {
  AudioApi, CatLook, CatModelApi, CatTvApi, FxApi, LevelData, MessKind, MinigameApi, MinigameHost, MinigameKind,
  PropKind, SitterLook, SitterModelApi,
} from './shared/contracts';
import { createDevCat, createDevSitter, createDevProp, createDevMess } from './dev/devModels';
import { buildDevLevel } from './dev/devLevel';
import { createFx as createRealFx } from './fx/fx';
import { createAudio as createRealAudio } from './audio/audio';
import { createCatTv as createRealTv } from './tv/catTv';
import { openMinigame as openRealMinigame } from './minigames';
import { loadAssets } from './assets/loader';
import { createCat } from './models/cat';
import { createSitter } from './models/sitter';
import { createProp, createMess } from './models/props';
import { buildHouse } from './world/level';

const devFlags = new Set((new URLSearchParams(location.search).get('dev') ?? '').split(','));
const forceDev = (k: string) => devFlags.has(k) || devFlags.has('all');
const warned = new Set<string>();
function safe<T>(key: string, real: () => T, dev: () => T): T {
  if (forceDev(key)) return dev();
  try {
    return real();
  } catch (err) {
    if (!warned.has(key)) { warned.add(key); console.error(`[registry] ${key} failed, using placeholder`, err); }
    return dev();
  }
}

/** must resolve before any factory below is called */
export async function preloadAssets(onProgress?: (p01: number) => void): Promise<void> {
  return loadAssets(onProgress);
}

export const createCatModel = (look: CatLook): CatModelApi => safe('cat', () => createCat(look), () => createDevCat(look));
export const createSitterModel = (look: SitterLook): SitterModelApi => safe('sitter', () => createSitter(look), () => createDevSitter(look));
export const buildLevel = (): LevelData => safe('level', () => buildHouse(), () => buildDevLevel());
export const createPropMesh = (kind: PropKind): THREE.Object3D => safe('props', () => createProp(kind), () => createDevProp(kind));
export const createMessMesh = (kind: MessKind): THREE.Object3D => safe('props', () => createMess(kind), () => createDevMess(kind));
export const createFx = (scene: THREE.Scene): FxApi => createRealFx(scene);
export const createAudio = (): AudioApi => createRealAudio();
export const createCatTv = (): CatTvApi => createRealTv();
export const openMinigame = (kind: MinigameKind, host: MinigameHost): MinigameApi => openRealMinigame(kind, host);
