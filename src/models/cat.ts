/** STUB: replaced by the cat-model agent (Kenney Cube Pets cat + expressive face + procedural anims). */
import type { CatAccessory, CatLook, CatModelApi } from '../shared/contracts';
import { createDevCat } from '../dev/devModels';

export function createCat(look: CatLook): CatModelApi {
  return createDevCat(look);
}

/** accessories this model actually supports (menus show only these) */
export const CAT_ACCESSORIES: CatAccessory[] = ['none'];
