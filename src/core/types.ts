/** Game-state types shared by sim (host), net and client. Plain JSON-able data only. */
import type {
  CatLook, Role, PlayerId, Vec3, Quat, MessKind, PropKind, FxKind, SoundName, MinigameKind,
  WorldVisualValue, RoomId, TvShow, SpotId,
} from '../shared/contracts';

export type Difficulty = 'kitten' | 'houseCat' | 'feral';
export type Phase = 'lobby' | 'countdown' | 'playing' | 'ended';

export interface PlayerInfo {
  id: PlayerId;
  name: string;
  role: Role;
  look: CatLook;
  bot: boolean;
  connected: boolean;
}

export interface LobbyState {
  code: string;
  hostId: PlayerId;
  players: PlayerInfo[];
  fillBots: boolean;
  botDifficulty: Difficulty;
  roundSeconds: number;
}

export interface GameConfig {
  roundSeconds: number;
  botDifficulty: Difficulty;
  players: PlayerInfo[]; // final roster incl. bots
  seed: number;
}

/** Timed statuses, seconds left. Missing = 0. */
export type StatusKey =
  | 'stunned' | 'wet' | 'hypnotized' | 'fed' | 'catnip' | 'zoomies' | 'grabImmune' | 'dizzy'
  | 'crown' | 'eating' | 'caged' | 'focused' | 'flehmen' | 'hairball' | 'fight' | 'treat'
  | 'tired' | 'sleep' | 'limp' | 'gag' | 'smug' | 'panic' | 'stink'
  | 'hidden' // hidden: name tag hidden (sitting in the delivery box)
  | 'noodle' | 'tossed' | 'slip' | 'slipImmune' | 'noLoaf' | 'pushMode';

export type Gesture = 'swipe' | 'spray' | 'treats' | 'meow' | 'hiss' | 'mash' | 'drop' | null;

export interface Work {
  key: string;
  label: string;
  progress: number;      // 0..1 (shared progress when shared)
  mode: 'hold' | 'minigame' | 'instant';
  anim?: string;         // CatAnim / SitterAnim to show
  face?: string;
  yaw?: number;          // face this way while working
}

export interface Prompt {
  key: string;
  label: string;
  ok: boolean;           // false = shown greyed out (reason in label)
  hold: boolean;         // hold E vs tap E
  progress: number;
}

export interface CharState {
  id: PlayerId;
  role: Role;
  name: string;
  bot: boolean;
  // motion (owner-simulated)
  p: Vec3;
  yaw: number;
  v: Vec3;
  g: boolean;
  tp: number;            // teleport counter: owner snaps to p when it changes
  sprint: boolean;
  charge: number;        // 0..1 pounce charge
  loaf: boolean;
  look: Vec3;            // camera forward (sitter eye contact)
  // host flags
  forced: boolean;       // position comes from host (grabbed, caged, hypnotized, fight)
  frozen: boolean;       // no move input (stunned, eating, hairball)
  mul: number;           // move speed multiplier
  st: Partial<Record<StatusKey, number>>;
  grabbedBy: PlayerId | null;
  holding: PlayerId | null;   // sitter: cat held by the scruff
  item: PropKind | null;      // cat: item carried in mouth
  work: Work | null;
  prompt: Prompt | null;
  gest: Gesture;
  gestT: number;
  poop: number;          // 0..1 need
  desperate: number;     // seconds at 100%
  stamina: number;       // 0..1 (reported by owner)
  ammo: number;          // sitter spray ammo
  cd: Partial<Record<'treats' | 'hairball' | 'spray' | 'swipe' | 'meow' | 'clap', number>>;
  mash: number;          // 0..1 escape progress (grabbed / caged / hypnotized)
  lookAt: Vec3 | null;   // head target (treat bag, TV)
}

export type PropSnap = [id: number, kind: PropKind, x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number, fallen: 0 | 1];

export interface Mess {
  id: number;
  kind: MessKind;
  p: Vec3;
  yaw: number;
  scale: number;
  onRug: boolean;
  w: number;             // weight in meter points
  by?: PlayerId;
}

export interface Alert {
  id: string;
  label: string;
  room: RoomId | null;
  roomName: string;
  p: Vec3;
  progress?: number;     // 0..1, the disaster's progress ring
}

export interface Snapshot {
  t: number;
  phase: Phase;
  countdown: number;
  timeLeft: number;
  meter: number;
  permanent: number;
  chars: CharState[];
  props: PropSnap[];         // changed props (full list every ~2 s)
  messVer: number;
  mess?: Mess[];             // full list when messVer changed
  worldVer: number;
  world?: Record<string, WorldVisualValue>;
  alerts: Alert[];
  overtime?: number;         // seconds of overtime left, 0/undefined = none
}

export type Award = { title: string; desc: string; playerId: PlayerId; name: string; role: Role };

export interface Results {
  winner: Role;
  headline: string;
  sub: string;
  meter: number;
  awards: Award[];
  players: { id: PlayerId; name: string; role: Role; bot: boolean; stats: Stats }[];
  receipt?: { label: string; value: string }[];
  disasters?: { key: string; label: string; points: number; spot: SpotId | null }[];
  overtime?: boolean;
}

export interface Stats {
  knocked: number; messCaused: number; eyeContacts: number; poops: number; poopsOutside: number;
  timeCaged: number; fightsWon: number; zoomDist: number; tidied: number; cleaned: number;
  catsGrabbed: number; catsJailed: number; sprayHits: number; hairballs: number; rugHairballs: number; loafTime: number;
  disasterPoints: number; meows: number; timesGrabbed: number; treatsEaten: number; broken: number;
  escapes: number; noodleTime: number; blockTime: number; slowPushes: number; scratchPostUses: number;
  standoffs: number; treatsIgnored: number; doorsOpened: number; doorsUsed: number; carryTime: number;
  tosses: number; slips: number; undos: number;
}

export type GameEvent =
  | { e: 'fx'; kind: FxKind; p: Vec3; dir?: Vec3; color?: string; scale?: number; dur?: number; follow?: string }
  | { e: 'text'; text: string; p: Vec3; color?: string; size?: number; follow?: string }
  | { e: 'sound'; name: SoundName; p?: Vec3; pitch?: number; vol?: number }
  | { e: 'loop'; id: string; name: SoundName; on: boolean; p?: Vec3; vol?: number }
  | { e: 'toast'; text: string; tone?: 'good' | 'bad' | 'info' }
  | { e: 'popup'; text: string; color?: string }
  | { e: 'mgOpen'; key: string; kind: MinigameKind; data?: Record<string, unknown> }
  | { e: 'mgClose'; key: string }
  | { e: 'push'; id: PlayerId; v: Vec3 }
  | { e: 'propGone'; id: number }
  | { e: 'tvShow'; show: TvShow }
  | { e: 'results'; results: Results };

/** client -> host gameplay actions */
export type Action =
  | { a: 'swipe' }
  | { a: 'spray'; dir: Vec3 }
  | { a: 'interact'; on: boolean; key?: string }
  | { a: 'meow' }
  | { a: 'hiss' }
  | { a: 'hairball' }
  | { a: 'treats' }
  | { a: 'mash'; n?: number }
  | { a: 'mg'; key: string; delta: number }
  | { a: 'mgExit'; key: string }
  | { a: 'toss'; dir: Vec3 }
  | { a: 'clap' }
  | { a: 'push'; on: boolean };

export interface MoveMsg {
  p: Vec3; yaw: number; v: Vec3; g: boolean; tp: number;
  sprint: boolean; charge: number; loaf: boolean; look: Vec3; stamina: number;
}
