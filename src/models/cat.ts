/** STUB: replaced by the cat-model agent (Kenney Cube Pets cat + expressive face + procedural anims). */
import type { CatLook, CatModelApi } from '../shared/contracts';
import { createDevCat } from '../dev/devModels';

export function createCat(look: CatLook): CatModelApi {
  return createDevCat(look);
}
