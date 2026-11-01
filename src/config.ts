/** v1 tuning (DESIGN.md section 3). Playtest and tweak here. */
export const CFG = {
  tick: 1 / 60,
  snapHz: 20,
  moveHz: 30,
  interpDelay: 0.1,
  gravity: 10,

  round: { seconds: 360, options: [180, 360, 540], countdown: 3, endDelay: 3 },

  cat: {
    walk: 3.2, sprint: 5.8, stamina: 4, staminaRegen: 1, regenDelay: 1,
    jumpV: 4.8, chargeTime: 0.8, chargeThreshold: 0.16, pounceV: 6, pounceFwd: 3.5,
    radius: 0.17, halfHeight: 0.05, step: 0.14,
  },
  sitter: {
    walk: 3.0, sprint: 5.2, stamina: 5, staminaRegen: 1, regenDelay: 1,
    jumpV: 2.83, radius: 0.28, halfHeight: 0.595, step: 0.3,
  },

  grab: { range: 1.4, coneDeg: 70, limp: 0.8, escapePresses: 14, hissBonus: 4, carryMul: 0.9, immunity: 3 },
  carrier: { time: 20, unlatch: 2.5, mashCut: 0.25, mashMaxCut: 8 },
  spray: { ammo: 8, range: 3.5, coneDeg: 25, stun: 1.0, wet: 5, wetMul: 0.6, refill: 2, cooldown: 0.35 },
  tv: { cooldown: 75, duration: 15, range: 9, mash: 10 },
  treats: { cooldown: 40, range: 14, prompt: 6, eatRange: 1.5, fed: 20, freeze: 1.2 },
  poop: {
    fillMin: 50, fillMax: 70, desperateMul: 0.8, anywhereAfter: 15, hold: 2,
    zoomies: 5, zoomiesMul: 1.3, boxCapacity: 4, fullPenalty: 4, scoop: 2.5, litterKickChance: 0.5,
  },
  hairball: { cooldown: 60, hack: 2, doubleTap: 0.35 },
  blackout: { flip: 1.5, reset: 2, cooldown: 45, catWorkMul: 1.15 },
  buffs: {
    fedWork: 1.25, fedTime: 30, catnipMove: 1.25, catnipWork: 1.25, catnipTime: 25,
    sunRegenMul: 3, focusedWork: 1.15, sinkFed: 10,
  },
  fight: { window: 1.5, range: 2, lock: 4, crown: 10, dizzy: 1.5 },
  eye: { dot: 0.9, range: 12 },
  door: { catOpen: 2 },
  props: {
    breakSpeed: 2.6, fallenDrop: 0.3, restSpeed: 0.15, restTime: 0.4, tidyTime: 1,
    swipeRange: 0.85, swipeSpeed: 2.8, swipeUp: 1.3, swipeCooldown: 0.45, touchMemory: 4,
  },
  interact: { range: 1.2, cleanRange: 1.15, sitBlockRange: 0.55 },
  meow: { spamCount: 4, spamWindow: 5, spamRange: 4 },
  camera: {
    cat: { dist: 2.1, height: 0.5, shoulder: 0.0, fov: 70, minDist: 0.4 },
    sitter: { dist: 3.0, height: 1.6, shoulder: 0.5, fov: 65, minDist: 0.6 },
  },
  /** ADDENDUM §3.2: indexed by cat count (bots included), fixed at round start. Index 0 unused. */
  scale: [
    null,
    { clutter: 1.0, work: 0.85, carrierTime: 18, unlatch: 3.0, carrierCap: 1, sitterWalk: 3.0, sitterSprint: 5.2, ammo: 6, tv: 90, treats: 45, clap: 6, undo: 2.0, litter: 4 },
    { clutter: 0.75, work: 1.0, carrierTime: 20, unlatch: 3.0, carrierCap: 1, sitterWalk: 3.0, sitterSprint: 5.2, ammo: 8, tv: 75, treats: 40, clap: 6, undo: 2.0, litter: 4 },
    { clutter: 0.6, work: 1.2, carrierTime: 22, unlatch: 3.5, carrierCap: 2, sitterWalk: 3.1, sitterSprint: 5.4, ammo: 10, tv: 65, treats: 35, clap: 5, undo: 1.5, litter: 5 },
    { clutter: 0.5, work: 1.4, carrierTime: 25, unlatch: 4.0, carrierCap: 2, sitterWalk: 3.2, sitterSprint: 5.5, ammo: 10, tv: 60, treats: 30, clap: 4, undo: 1.5, litter: 6 },
  ],
} as const;

export interface ScaleRow {
  clutter: number; work: number; carrierTime: number; unlatch: number; carrierCap: number; sitterWalk: number;
  sitterSprint: number; ammo: number; tv: number; treats: number; clap: number; undo: number; litter: number;
}
/** scaling row for n cats (clamped 1..4) */
export const scaleFor = (n: number): ScaleRow => CFG.scale[Math.min(4, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4] as ScaleRow;
