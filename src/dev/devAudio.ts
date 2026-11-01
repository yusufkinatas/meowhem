/** Silent audio stub implementing AudioApi. Swapped for src/audio in registry. */
import type { AudioApi } from '../shared/contracts';

export function createDevAudio(): AudioApi {
  return { unlock() {}, play() {}, loop() {}, setListener() {}, setMusic() {}, setMasterVolume() {} };
}
