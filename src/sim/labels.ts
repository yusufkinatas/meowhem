import type { MessKind, PropKind } from '../shared/contracts';

export const CLEAN_LABEL: Record<MessKind, string> = {
  shards: 'Sweep up the shards', poop: 'Clean up the poop', hairball: 'Pick up the hairball',
  soil: 'Sweep up the soil', fur: 'Lint-roll the fur', puddle: 'Mop the puddle', litter: 'Sweep up the litter',
  tp: 'Roll up the paper', fish: 'Rescue the fish', catnip: 'Vacuum the catnip', food: 'Sweep up the cereal',
};

export const PROP_NAME: Record<PropKind, string> = {
  mug: 'mug', glass: 'glass', plate: 'plate', vase: 'vase', book: 'book', remote: 'remote', plantPot: 'plant pot',
  frame: 'picture frame', wineBottle: 'wine bottle', cerealBox: 'cereal box', toyMouse: 'toy mouse', yarn: 'yarn',
  phone: 'phone', candle: 'candle', tpRoll: 'toilet paper', salmon: 'salmon', package: 'package', pillow: 'pillow',
  bowl: 'bowl', shoe: 'shoe', sock: 'sock', cucumber: 'cucumber', lamp: 'lamp', trophy: 'trophy',
};
