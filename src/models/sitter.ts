/** STUB: replaced by the sitter-model agent (KayKit Rogue + clips + face). */
import type { SitterLook, SitterModelApi } from '../shared/contracts';
import { createDevSitter } from '../dev/devModels';

export function createSitter(look: SitterLook): SitterModelApi {
  return createDevSitter(look);
}
