/**
 * MEOWHEM shared contracts. These are the seams between modules built in parallel.
 * Do NOT change an existing signature without updating every implementer.
 * Adding optional fields / new union members is fine.
 *
 * Conventions: meters, Y up, a model's root origin is at its feet, the model faces +Z.
 * yaw = rotation around Y; yaw 0 faces +Z; forward = (sin(yaw), 0, cos(yaw)).
 */
import type * as THREE from 'three';

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Role = 'sitter' | 'cat';
export type PlayerId = string;

// ---------------------------------------------------------------- customization
export type FurPattern = 'solid' | 'tabby' | 'tuxedo' | 'calico' | 'siamese' | 'tortie';
export type CatAccessory = 'none' | 'bell' | 'bow' | 'bandana' | 'tinyHat' | 'glasses' | 'flowerCrown' | 'cone';

export interface CatLook {
  name: string;
  pattern: FurPattern;
  furColor: string;        // primary CSS hex, e.g. '#f2a65a'
  secondaryColor: string;  // pattern / patches color
  eyeColor: string;
  accessory: CatAccessory;
  chonk: number;           // 0 = slim, 1 = absolute unit
}

export interface SitterLook {
  name: string;
  skin: string;
  hair: string;
  shirt: string;
}

// ---------------------------------------------------------------- character models
export type CatAnim =
  | 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'land'
  | 'sit' | 'loaf' | 'sleep' | 'crouch' | 'pounceCharge'
  | 'swipe' | 'scratch' | 'poop' | 'eat' | 'type' | 'dig' | 'knead' | 'climb' | 'interact'
  | 'carryMouth'   // walking while holding something in the mouth (salmon, toy)
  | 'hairball'     // the hack-hack-hack animation
  | 'grabbed'      // held by the scruff: limp, legs dangling
  | 'caged' | 'stunned' | 'hypnotized' | 'fight' | 'hangDoor'
  | 'tap'          // slow push: one paw reaches forward low and slow
  | 'groom';       // sit, lick a raised paw, wipe the face

export type CatFace =
  | 'neutral' | 'happy' | 'smug' | 'angry' | 'shock' | 'sad' | 'derp'
  | 'sleepy' | 'blep' | 'flehmen' | 'love' | 'focused' | 'unimpressed';

export interface CatVisualState {
  anim: CatAnim;
  face: CatFace;
  speed: number;            // horizontal speed m/s (drives gait)
  vy: number;               // vertical velocity (squash/stretch)
  grounded: boolean;
  wet: number;              // 0..1, sprayed with water (droopy, darker, smaller fluff)
  puffed: boolean;          // hiss: fur puffs up, back arches
  high: boolean;            // catnip: wobbly, derpy, rainbow-ish
  talk: 'meow' | 'hiss' | 'purr' | 'chirp' | null; // mouth pose this frame
  lookAt?: THREE.Vector3 | null;  // world point the head tries to look at
  dizzy?: boolean;          // lost a fight: stars / spiral eyes
  pounceCharge?: number;    // 0..1 while charging a pounce (butt wiggle intensity)
  wiggle?: number;          // 0..1 struggle intensity while grabbed/caged
  carrying?: 'salmon' | 'toyMouse' | 'sock' | null;
  noodle?: boolean;         // held and gone boneless (purring)
  tossed?: boolean;         // airborne after a toss or slip launch
  ceiling?: number;         // free height above the feet in m (under the bed, a table), omitted when > ~1 m
}

export interface SitterVisualState {
  anim: 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'land' | 'carry' | 'spray' | 'clean'
      | 'interact' | 'shakeTreats' | 'stunned' | 'grabReach' | 'celebrate' | 'despair' | 'scoop'
      | 'slip' | 'toss' | 'clap';
  face: 'neutral' | 'angry' | 'panic' | 'smug' | 'tired' | 'shock' | 'happy' | 'gag';
  speed: number;
  vy: number;
  grounded: boolean;
  carrying: boolean;        // holding a cat by the scruff
  flashlight: boolean;      // blackout: phone flashlight on
  aimPitch: number;         // radians, camera pitch, for spray/arm aim
  lookAt?: THREE.Vector3 | null;
}

export interface CatModelApi {
  readonly root: THREE.Group;
  setLook(look: CatLook): void;
  update(dt: number, s: CatVisualState): void;
  /** world-space point at the top of the neck, where a hand grabs the scruff */
  readonly scruffAnchor: THREE.Object3D;
  /** where a carried item (salmon) attaches */
  readonly mouthAnchor: THREE.Object3D;
  dispose(): void;
}

export interface SitterModelApi {
  readonly root: THREE.Group;
  setLook(look: SitterLook): void;
  update(dt: number, s: SitterVisualState): void;
  /** a carried cat is positioned so that its scruffAnchor sits here */
  readonly holdAnchor: THREE.Object3D;
  /** spray bottle nozzle, spray FX origin */
  readonly sprayNozzle: THREE.Object3D;
  dispose(): void;
}

// ---------------------------------------------------------------- props & mess
export type PropKind =
  | 'mug' | 'glass' | 'plate' | 'vase' | 'book' | 'remote' | 'plantPot' | 'frame'
  | 'wineBottle' | 'cerealBox' | 'toyMouse' | 'yarn' | 'phone' | 'candle' | 'tpRoll'
  | 'salmon' | 'package' | 'pillow' | 'bowl' | 'shoe' | 'sock' | 'cucumber' | 'lamp' | 'trophy';

export type MessKind =
  | 'shards' | 'poop' | 'hairball' | 'soil' | 'fur' | 'puddle' | 'litter' | 'tp' | 'fish' | 'catnip' | 'food';

// ---------------------------------------------------------------- level
export type RoomId = 'living' | 'kitchen' | 'bathroom' | 'bedroom' | 'office' | 'hallway';

/** Interaction anchor ids. See DESIGN.md "Interactables". Levels must provide all of these. */
export type SpotId =
  | 'laptop' | 'tubFaucet' | 'tpRoll' | 'sofa' | 'salmon' | 'hideout' | 'fishTank' | 'curtains'
  | 'pillow' | 'litterBox' | 'plant' | 'foodBowl' | 'fuseBox' | 'carrier' | 'tv' | 'sink'
  | 'frontDoor' | 'shoes' | 'window' | 'laundry' | 'scratchPost' | 'bathroomDoor' | 'bedroomDoor' | 'officeDoor';

export interface BoxCollider {
  center: Vec3;
  half: Vec3;
  rotY?: number;
  /** 'floor' | 'wall' | 'furniture' | 'catOnly' ... free-form, optional */
  tag?: string;
}

export interface PropSpawn { kind: PropKind; pos: Vec3; rotY?: number }

export interface Spot {
  id: SpotId;
  pos: Vec3;        // where the character should stand / sit to interact (feet position)
  radius: number;   // interaction range from pos
  facing: number;   // yaw the character faces while interacting
  room: RoomId;
}

export interface DoorDef {
  id: 'bathroomDoor' | 'bedroomDoor' | 'officeDoor';
  hinge: Vec3;      // hinge position at floor level
  width: number;
  height: number;
  closedYaw: number;
  openYaw: number;
}

export interface RoomDef { id: RoomId; name: string; min: Vec3; max: Vec3 }

export interface NavNode { id: number; pos: Vec3 }
export interface NavLink {
  a: number; b: number;
  /** jump: needs a jump to go a->b (bidirectional, jump up / drop down). */
  kind: 'walk' | 'jump';
  catOnly?: boolean;      // sitter cannot use (too small / too high / under bed)
  door?: DoorDef['id'];   // blocked while that door is closed
}

/** Named visual states the game sim drives (via snapshot.world). See DESIGN.md "World visual keys". */
export type WorldVisualValue = number | string | boolean;

export interface LevelData {
  group: THREE.Group;                // all static visuals (walls, furniture, decor)
  colliders: BoxCollider[];          // static physics
  props: PropSpawn[];                // dynamic physics props spawned by the sim
  spots: Spot[];
  doors: DoorDef[];
  rooms: RoomDef[];
  nav: { nodes: NavNode[]; links: NavLink[] };
  spawns: { sitter: Vec3; cats: Vec3[]; sitterYaw?: number; catYaws?: number[] };
  sunPatches: { center: Vec3; radius: number }[];
  /** door meshes are owned by the level; the sim calls this when doors change */
  setDoorOpen(id: DoorDef['id'], open01: number): void;
  /** apply a world visual key (e.g. 'tub.water' = 0.6). Unknown keys are ignored. */
  setVisual(key: string, value: WorldVisualValue): void;
  /** per-frame animation (fish swimming, water ripple, lamp flicker). */
  update(dt: number, time: number): void;
  /** the TV screen mesh's material map is set to this when available */
  setTvTexture(tex: THREE.Texture | null): void;
}

// ---------------------------------------------------------------- fx
export type FxKind =
  | 'shatter' | 'dust' | 'fightCloud' | 'stink' | 'sparkle' | 'splash' | 'spray' | 'hearts'
  | 'zzz' | 'question' | 'exclaim' | 'confetti' | 'furPoof' | 'catnipHaze' | 'poof' | 'stars'
  | 'tpBurst' | 'scratchMarks' | 'noteMusic' | 'anger' | 'sweat' | 'ding';

export interface FxOptions {
  dir?: THREE.Vector3;
  color?: string;
  scale?: number;
  duration?: number;     // seconds (looping fx like fightCloud / stink / zzz)
  follow?: THREE.Object3D; // stick to an object
  own?: boolean;          // seen from the eye: my own spray (a small nozzle puff), a splash on my own cat (no puffs)
}

export interface FxApi {
  spawn(kind: FxKind, pos: THREE.Vector3, opts?: FxOptions): void;
  /** floating world-space text, e.g. "+6% EYE CONTACT" or "MEOW" */
  text(text: string, pos: THREE.Vector3, opts?: { color?: string; size?: number; duration?: number; follow?: THREE.Object3D }): void;
  update(dt: number, camera: THREE.Camera): void;
  dispose(): void;
}

// ---------------------------------------------------------------- audio
export type SoundName =
  | 'meow' | 'meowShort' | 'meowLong' | 'chirp' | 'mrrp' | 'hiss' | 'purr' | 'yowl'
  | 'shatter' | 'thud' | 'clink' | 'plop' | 'spray' | 'doorbell' | 'typing' | 'scratch'
  | 'splash' | 'waterRun' | 'flush' | 'pickup' | 'drop' | 'whoosh' | 'fight' | 'ding' | 'buzz'
  | 'breaker' | 'tvOn' | 'treatShake' | 'crunch' | 'hairball' | 'cageClose' | 'cageOpen'
  | 'paperRip' | 'dig' | 'step' | 'land' | 'uiClick' | 'uiHover' | 'countdown' | 'go'
  | 'win' | 'lose' | 'carArrive' | 'alarm' | 'pop' | 'gulp' | 'chatter' | 'door'
  | 'clap' | 'keys' | 'shutter';

export interface AudioApi {
  /** must be called from a user gesture before sounds play */
  unlock(): void;
  play(name: SoundName, opts?: { pos?: Vec3; pitch?: number; volume?: number }): void;
  /** looping positional sounds (purr, water running, typing). id is caller-chosen. */
  loop(id: string, name: SoundName, on: boolean, opts?: { pos?: Vec3; volume?: number }): void;
  setListener(pos: Vec3, yaw: number): void;
  setMusic(mode: 'off' | 'menu' | 'game' | 'tense' | 'catnip'): void;
  setMasterVolume(v: number): void;
}

// ---------------------------------------------------------------- cat tv
export type TvShow = 'birds' | 'rickAndMeowty' | 'planetMearth' | 'cucumber' | 'laserDot' | 'cookingShow';
export interface CatTvApi {
  readonly texture: THREE.Texture;
  setOn(on: boolean): void;
  setShow(show: TvShow): void;
  update(dt: number): void;
}

// ---------------------------------------------------------------- minigames (DOM overlays)
export type MinigameKind =
  | 'laptop'      // goofy paw typing, orders stuff online
  | 'faucet'      // turn the bathtub tap
  | 'tpSpin'      // spin the toilet paper roll
  | 'fishing'     // paw-fish in the fish tank (timing)
  | 'climb'       // climb the curtains (alternate paws, don't slip)
  | 'knead'       // make biscuits on the pillow (rhythm)
  | 'escape'      // wiggle out of the scruff hold / carrier (mash)
  | 'fight'       // hiss duel cloud fight (both cats)
  | 'openBox'     // claw open the delivery package
  | 'birdWatch';  // chatter at birds through the window

export interface MinigameHost {
  /** fullscreen overlay root to render into; the minigame owns its children */
  container: HTMLElement;
  /** report work done; 1.0 total = interaction complete. Host applies speed multipliers. */
  progress(delta: number): void;
  /** current authoritative progress 0..1 (may be shared with other cats) */
  getProgress(): number;
  /** player wants out (Esc / moved). Host closes the minigame. */
  exit(): void;
  /** optional sound hook */
  sound?(name: SoundName): void;
  /** extra context, e.g. { opponent: 'Mochi' } for fights, { order: 'catnip' } */
  data?: Record<string, unknown>;
  /** 0 = no sitter threat, 1 = sitter within ~2.5 m (danger indicator) */
  danger?(): number;
}

export interface MinigameApi {
  update(dt: number): void;
  /** keyboard events while open; return true if consumed */
  key(e: KeyboardEvent, down: boolean): boolean;
  /** mouse events while open (pointer is unlocked during minigames) */
  mouse?(e: MouseEvent): void;
  dispose(): void;
}
