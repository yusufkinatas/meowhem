/**
 * Bot brain API. A brain reads a world view and returns an intent each tick. The sim feeds the
 * intent through the same character controller + action path humans use.
 * Register a brain with registerBotBrain(role, factory, priority) from any file in src/sim/bots/
 * (loaded eagerly); the highest priority per role wins, the placeholder registers priority 0.
 */
import type { LevelData, RoomId, Role, SpotId, Vec3, WorldVisualValue, DoorDef } from '../../shared/contracts';
import type { CharState, Difficulty, Mess, Prompt } from '../../core/types';
import type { PropView } from '../interactables/types';

export interface BotOption {
  key: string;           // pass as intent.interact to start it (must be in range)
  label: string;
  ok: boolean;           // false = currently unavailable (label holds the reason)
  at: Vec3;              // where to stand
  range: number;
  spot: SpotId | null;
  room: RoomId | null;
  interactable: string;  // InteractableDef id
  alert: boolean;        // it is a "disaster" (sitter gets alerted)
  /** current progress of this use 0..1 when the sim provides it (undo decisions) */
  progress?: number;
}

export interface BotWorldView {
  readonly self: Readonly<CharState>;
  readonly chars: readonly Readonly<CharState>[];
  /** interactable uses for my role, availability ignoring range */
  readonly options: readonly BotOption[];
  /** best interaction in range right now (same as a player's HUD prompt) */
  readonly prompt: Prompt | null;
  readonly mess: readonly Mess[];
  readonly props: readonly PropView[];
  readonly level: LevelData;
  readonly nav: LevelData['nav'];
  readonly world: Readonly<Record<string, WorldVisualValue>>;
  readonly time: number;
  readonly timeLeft: number;
  readonly meter: number;
  readonly difficulty: Difficulty;
  doorOpen(id: DoorDef['id']): boolean;
  roomAt(p: Vec3): RoomId | null;
  /** is the sitter looking at this char right now */
  sitterSees(id: string): boolean;
  rng(): number;
}

export interface BotIntent {
  /** world-space xz direction, length <= 1 */
  move?: [number, number];
  /** steer straight toward this point (overrides move); slows down on arrival */
  moveTo?: Vec3 | null;
  faceYaw?: number | null;
  sprint?: boolean;
  /** space held this tick (cat: hold then release = pounce; a single tick = jump) */
  jump?: boolean;
  swipe?: boolean;
  /** sitter: spray in this world direction */
  spray?: Vec3;
  /** start/keep holding this interaction key; null stops; undefined keeps the current one */
  interact?: string | null;
  /** minigame-mode interactions progress automatically for bots at their `time` rate */
  meow?: boolean;
  hiss?: boolean;
  hairball?: boolean;
  treats?: boolean;
  loaf?: boolean;
  /** escape mash (grabbed, caged, hypnotized, fight: flinch in the staredown, a press in the brawl) */
  mash?: boolean;
  /** cat: slow push held while true (ADDENDUM M8) */
  push?: boolean;
  /** sitter: clap (M5) */
  clap?: boolean;
  /** sitter: toss the held cat in this direction (M3) */
  toss?: Vec3;
}

export interface BotBrain {
  think(view: BotWorldView, dt: number): BotIntent;
}

export interface BotBrainOpts {
  id: string;
  role: Role;
  index: number;
  difficulty: Difficulty;
  rng: () => number;
}

export type BotBrainFactory = (opts: BotBrainOpts) => BotBrain;

const factories: { role: Role; priority: number; make: BotBrainFactory }[] = [];

export function registerBotBrain(role: Role, make: BotBrainFactory, priority = 0) {
  factories.push({ role, priority, make });
}

export function createBotBrain(opts: BotBrainOpts): BotBrain {
  const best = factories.filter((f) => f.role === opts.role).sort((a, b) => b.priority - a.priority)[0];
  if (!best) return { think: () => ({}) };
  return best.make(opts);
}
