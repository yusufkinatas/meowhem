/**
 * Interactable content API. One file per interactable in this folder calls defineInteractable().
 * See README.md for a full example. Everything here runs on the host only.
 */
import type {
  CatAnim, LevelData, MessKind, MinigameKind, PropKind, Role, RoomId, SitterVisualState, SoundName,
  Spot, SpotId, FxKind, Vec3, WorldVisualValue, DoorDef,
} from '../../shared/contracts';
import type { CharState, Difficulty, Mess, StatusKey, Stats } from '../../core/types';

/** Characters are plain mutable state objects (also what the snapshot sends). */
export type Char = CharState;

export interface PropView {
  readonly id: number;
  readonly kind: PropKind;
  readonly p: Vec3;
  readonly home: Vec3;
  readonly fallen: boolean;
  readonly special: boolean;
}

export interface SimContext {
  /** seconds since the round started (0 during countdown) */
  readonly time: number;
  readonly timeLeft: number;
  readonly level: LevelData;
  /** bot difficulty of this round (optional until P1 wires it; default 'houseCat') */
  readonly difficulty?: Difficulty;
  /** cat count 1..4, fixed at round start (P1) */
  readonly n?: number;
  rng(): number;
  spot(id: SpotId): Spot;
  roomAt(p: Vec3): RoomId | null;
  roomName(room: RoomId | null): string;

  // characters
  chars(role?: Role): readonly Char[];
  char(id: string): Char | undefined;
  /** add seconds to a timed status (stunned, fed, catnip, zoomies, focused, flehmen, sleep...) */
  give(ch: Char, status: StatusKey, seconds: number): void;
  clear(ch: Char, status: StatusKey): void;
  /** item carried in the mouth (salmon, sock...). null drops nothing, use dropItem to drop it as a prop. */
  setItem(ch: Char, item: PropKind | null): void;
  /** drop the carried item as a dynamic prop at the char's feet; returns the prop id */
  dropItem(ch: Char): number | null;
  /** put a cat in the carrier at `at` for `seconds` */
  cage(cat: Char, seconds: number): void;
  uncage(cat: Char): void;
  /** hypnotize a cat (Cat TV): it sits facing `lookAt` until the time runs out or it mashes out */
  hypnotize(cat: Char, seconds: number, lookAt: Vec3): void;
  /** move a character (owner snaps to it), e.g. a bored cat sliding out from under the bed */
  teleport(ch: Char, p: Vec3, yaw?: number): void;
  /** release a held cat (sitter) */
  releaseHeld(sitter: Char): void;
  stat(playerId: string, key: keyof Stats, add: number): void;
  workMul(ch: Char): number;
  /** sitter is looking at this char (eye contact rules) */
  sitterSees(ch: Char): boolean;
  lineOfSight(a: Vec3, b: Vec3): boolean;
  /** interrupt whatever this char is doing */
  cancelWork(ch: Char): void;

  // mess + meter
  addMess(kind: MessKind, p: Vec3, opts?: { by?: string; scale?: number; mul?: number; yaw?: number }): number;
  removeMess(id: number): void;
  messes(): readonly Mess[];
  /** permanent disaster points (never cleanable). Shows a popup with the label. spot = receipt/end-show key (sim infers it
   *  from the running interactable when omitted) and the sim splits disasterPoints over every cat that worked on it. */
  addPermanent(points: number, label: string, by?: string, spot?: SpotId): void;
  /** ongoing meter contribution while set (e.g. full litter box = 4). 0 removes it. */
  setPenalty(key: string, points: number): void;

  // world state
  setWorld(key: string, value: WorldVisualValue): void;
  world(key: string): WorldVisualValue | undefined;
  isDark(): boolean;
  setDoor(id: DoorDef['id'], open: boolean): void;
  doorOpen(id: DoorDef['id']): boolean;

  // props
  spawnProp(kind: PropKind, p: Vec3, rotY?: number): number;
  removeProp(id: number): void;
  props(kind?: PropKind): readonly PropView[];
  /** teleport a prop (e.g. back home) and put it to sleep */
  moveProp(id: number, p: Vec3, rotY?: number): void;

  // feedback (all replicated to clients)
  fx(kind: FxKind, p: Vec3, opts?: { dir?: Vec3; color?: string; scale?: number; duration?: number; follow?: string }): void;
  sound(name: SoundName, p?: Vec3, opts?: { pitch?: number; volume?: number }): void;
  loop(id: string, name: SoundName, on: boolean, p?: Vec3): void;
  /** small side notification. to = role, player id, or everyone */
  toast(text: string, to?: Role | string, tone?: 'good' | 'bad' | 'info'): void;
  /** big centered popup ("EYE CONTACT", "FLOOD") */
  popup(text: string, to?: Role | string, color?: string): void;
  /** floating world-space text */
  text(text: string, p: Vec3, color?: string): void;
  /** sitter HUD alert (room name + marker through walls). Same id updates it. progress = 0..1 ring (ADDENDUM 2.0). */
  alert(id: string, on: boolean, label?: string, p?: Vec3, progress?: number): void;

  /** raw progress store (keys are interaction keys) */
  progress(key: string): number;
  setProgress(key: string, v: number): void;
}

/** One way a role can use an interactable. */
export interface Use<S> {
  role: Role;
  /** prompt text, e.g. "Scratch the sofa" (shown as "[E] Scratch the sofa") */
  label: string | ((ctx: SimContext, s: S, ch: Char) => string);
  mode: 'hold' | 'minigame' | 'instant';
  /** hold: seconds at 1x. minigame: seconds a bot needs (players: progress comes from the minigame). */
  time?: number;
  minigame?: MinigameKind;
  minigameData?(ctx: SimContext, s: S, ch: Char): Record<string, unknown>;
  /** several chars add into one progress bar */
  shared?: boolean;
  /** keep progress when interrupted (default true) */
  keepProgress?: boolean;
  /** sitter HUD alert while someone works on it. string = alert label */
  alert?: boolean | string;
  /** apply work speed multipliers (fed, catnip, dark). default true */
  workSpeed?: boolean;
  anim?: CatAnim | SitterVisualState['anim'];
  face?: string;
  /** interaction range around the anchor (default spot.radius) */
  range?: number;
  /** higher wins when several prompts are in range (default 0, grab = 3, carrier jail = 10) */
  priority?: number;
  /** dynamic anchor instead of the spot (e.g. a dropped salmon). null = not offered. */
  at?(ctx: SimContext, s: S, ch: Char): Vec3 | null;
  /** true = available, false = hidden, string = shown greyed out with this reason */
  check?(ctx: SimContext, s: S, ch: Char): boolean | string;
  onStart?(ctx: SimContext, s: S, ch: Char): void;
  onProgress?(ctx: SimContext, s: S, ch: Char, progress: number): void;
  onStop?(ctx: SimContext, s: S, ch: Char, completed: boolean): void;
  onComplete(ctx: SimContext, s: S, ch: Char): void;
  /** the sitter's Undo reset this use's progress to 0 (ch = the sitter) */
  onUndo?(ctx: SimContext, s: S, ch: Char): void;
  /** cat uses only: label of the sitter's generic Undo for this use (ADDENDUM M6), e.g. "Close the laptop" */
  undo?: string;
}

export interface InteractableDef<S = Record<string, never>> {
  id: string;
  /** anchor spot (uses may override with `at`) */
  spot?: SpotId;
  /** fresh per-round state */
  state?(): S;
  uses: Use<S>[];
  onRoundStart?(ctx: SimContext, s: S): void;
  /** every sim tick while playing (timers, floods, deliveries) */
  tick?(ctx: SimContext, s: S, dt: number): void;
  /** a mess was cleaned by the sitter (fish back into the tank...) */
  onMessCleaned?(ctx: SimContext, s: S, mess: Mess, by: Char): void;
}
