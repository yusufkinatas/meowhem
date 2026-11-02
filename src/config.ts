/** Tuning (DESIGN.md section 3 + ADDENDUM v2 section 3). Playtest and tweak here. */
export const CFG = {
  tick: 1 / 60,
  snapHz: 20,
  moveHz: 30,
  interpDelay: 0.1,
  gravity: 10,

  round: { seconds: 360, options: [180, 360, 540], countdown: 3, endDelay: 0.2 },

  cat: {
    walk: 3.2, sprint: 5.8, stamina: 4, staminaRegen: 1, regenDelay: 1,
    jumpV: 4.8, chargeTime: 0.8, chargeThreshold: 0.16, pounceV: 6, pounceFwd: 3.5,
    radius: 0.17, halfHeight: 0.05, step: 0.14,
  },
  sitter: {
    walk: 3.0, sprint: 5.2, stamina: 5, staminaRegen: 1, regenDelay: 1,
    jumpV: 2.83, radius: 0.28, halfHeight: 0.595, step: 0.3,
  },

  grab: {
    range: 1.4, coneDeg: 70, limp: 1.0, escapePresses: 20, hissBonus: 4, carryMul: 1.0, immunity: 3,
    noodleAfter: 2.0, noodleCarry: 0.6, noodleExit: 4, reblock: 15,
  },
  /** mashMaxCut: fraction of the time-out that rattling can cut */
  carrier: { time: 20, unlatch: 2.5, mashCut: 0.25, mashMaxCut: 0.4, mashUnits: 20 },
  spray: { ammo: 8, range: 3.5, coneDeg: 25, stun: 0.7, wet: 5, wetMul: 0.6, refill: 2, cooldown: 0.35, noLoaf: 6 },
  emptySpray: { range: 6, coneDeg: 60, smug: 2, toastEvery: 10 },
  tv: { cooldown: 75, duration: 8, range: 9, mash: 8 },
  treats: { cooldown: 40, range: 14, prompt: 6, eatRange: 1.5, fed: 20, freeze: 1.2 },
  poop: {
    fillMin: 50, fillMax: 70, desperateMul: 0.8, anywhereAfter: 15, hold: 2,
    zoomies: 5, zoomiesMul: 1.3, boxCapacity: 4, fullPenalty: 4, scoop: 2.5, litterKickChance: 0.5,
  },
  hairball: { cooldown: 90, hack: 2, hold: 0.6, creep: 0.3, steerDeg: 100, hearRange: 6 },
  blackout: { flip: 1.5, reset: 2, cooldown: 45, catWorkMul: 1.15 },
  buffs: {
    fedWork: 1.25, fedTime: 30, catnipMove: 1.25, catnipWork: 1.25, catnipTime: 25,
    sunRegenMul: 3, focusedWork: 1.15, sinkFed: 10,
  },
  fight: {
    window: 1.5, range: 2, lock: 4, stare: 1.5, crown: 10, dizzy: 1.5, flinchMul: 0.75, press: 0.025,
    drift: 0.8, turnEvery: 0.8, propRange: 0.6, propOut: 2.5, propUp: 1.5, groom: 1.5,
  },
  eye: { dot: 0.9, range: 12, max: 3, window: 10 },
  door: { catOpen: 2 },
  props: {
    breakSpeed: 2.6, fallenDrop: 0.3, restSpeed: 0.15, restTime: 0.4, tidyTime: 1,
    swipeRange: 0.85, swipeSpeed: 2.8, swipeUp: 1.3, swipeCooldown: 0.45, touchMemory: 4,
  },
  interact: { range: 1.2, cleanRange: 1.15, sitBlockRange: 0.55 },
  meow: { spamCount: 4, spamWindow: 5, spamRange: 4, cagePitch: 0.96, cagePitchMin: 0.75 },
  // v2 sitter verbs + cat moves
  toss: { fwd: 4.5, up: 3.2, pitchMin: -10, pitchMax: 30, pitchUp: 1.5, stun: 0.3, noLoaf: 4, bounce: 2.5, anim: 0.4, maxAir: 3 },
  slip: { speed: 4.0, range: 0.35, time: 1.2, immune: 4, launchFwd: 2.5, launchUp: 3.5, smear: 1.3 },
  clap: { range: 6, anim: 0.5, shock: 0.5 },
  // tapSpeed: the spec says 0.4 m/s for a 4-5 cm slide, but prop friction stops 0.4 after ~1 cm, 0.85 gives ~4.5 cm
  push: { hold: 0.25, speedMul: 0.3, tapEvery: 0.45, tapSpeed: 0.85, knockWindow: 2 },
  // QA: panic keeps its face and sweat but no clean bonus (bot rounds stalled at 80-90%), overtime from 80%
  panic: { on: 80, off: 78, mul: 1.0, sweatEvery: 2.5 },
  overtime: { threshold: 80, max: 15, keysEvery: 3 },
  /** QA: clutter weight starts at from x the scale row and reaches the full row after `over` seconds (time to settle in, a busy finish) */
  clutterRamp: { from: 0.55, over: 150 },
  /** QA: everything above is tuned for 6:00. Mess and disaster points scale by (360 / round seconds) ^ short|long, the clutter
   *  ramp by the length, so 3 and 9 minute rounds stay a contest (all-bot House Cat without it: 3:00 0/12, 9:00 11/12 cat wins) */
  roundLength: { short: 0.9, long: 0.4 },
  /** TPS camera (src/client/camera.ts). dist: boom length, height: pivot above the feet, shoulder: pivot shift to the right, fov: vertical degrees */
  camera: {
    ceiling: 2.6, // the house's ceiling height: looking down sinks the pivot / shortens the boom under it
    sens: 0.0022, // radians per mouse pixel
    cat: { dist: 1.6, height: 0.5, shoulder: 0, fov: 68 }, // centred: the cat is small and there is no crosshair
    sitter: { dist: 2.1, height: 1.4, shoulder: 0.7, fov: 62 }, // over the right shoulder, crosshair clear of the head, head to toe in the lower left
    carried: { dist: 2.5, height: 0.25, shoulder: 0, fov: 66 }, // my cat dangling from the sitter's hand: the sitter is in the shot too
    holding: { dist: 2.4, height: 1.4, shoulder: 0.75, fov: 64 }, // sitter holding a cat at arm's length
  },
  /** ADDENDUM §3.2 rows, retuned in QA from headless all-bot rounds (see design/REQUESTS.md). Indexed by cat count (bots included), fixed at round start. Index 0 unused. */
  scale: [
    null,
    { clutter: 1.6, work: 0.6, carrierTime: 10, unlatch: 3.0, carrierCap: 1, sitterWalk: 3.0, sitterSprint: 5.2, ammo: 6, tv: 90, treats: 45, clap: 6, undo: 2.5, litter: 4 },
    { clutter: 2.6, work: 0.5, carrierTime: 11, unlatch: 3.0, carrierCap: 1, sitterWalk: 3.0, sitterSprint: 5.2, ammo: 8, tv: 75, treats: 40, clap: 6, undo: 3.5, litter: 4 },
    { clutter: 1.3, work: 0.85, carrierTime: 16, unlatch: 3.5, carrierCap: 2, sitterWalk: 3.05, sitterSprint: 5.25, ammo: 10, tv: 65, treats: 35, clap: 5, undo: 2.6, litter: 5 },
    { clutter: 0.9, work: 1.1, carrierTime: 18, unlatch: 4.0, carrierCap: 2, sitterWalk: 3.1, sitterSprint: 5.3, ammo: 10, tv: 60, treats: 30, clap: 4, undo: 2.0, litter: 6 },
  ],
} as const;

export interface ScaleRow {
  clutter: number; work: number; carrierTime: number; unlatch: number; carrierCap: number; sitterWalk: number;
  sitterSprint: number; ammo: number; tv: number; treats: number; clap: number; undo: number; litter: number;
}
/** scaling row for n cats (clamped 1..4) */
export const scaleFor = (n: number): ScaleRow => CFG.scale[Math.min(4, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4] as ScaleRow;
