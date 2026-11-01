import type { CatLook, PlayerId, Role } from '../shared/contracts';
import type { Action, GameConfig, GameEvent, LobbyState, MoveMsg, Snapshot } from '../core/types';

/** 2: v2 actions (toss, clap, push), Snapshot.overtime, Results receipt/disasters */
export const PROTOCOL_VERSION = 2;

/** client -> host */
export type C2H =
  | { t: 'hello'; name: string; look: CatLook; v: number }
  | { t: 'pref'; role?: Role; look?: CatLook; name?: string }
  | { t: 'move'; m: MoveMsg }
  | { t: 'act'; act: Action }
  | { t: 'ping' };

/** host -> client */
export type H2C =
  | { t: 'welcome'; id: PlayerId }
  | { t: 'lobby'; lobby: LobbyState }
  | { t: 'start'; cfg: GameConfig }
  | { t: 'snap'; s: Snapshot }
  | { t: 'ev'; ev: GameEvent[] }
  | { t: 'toLobby' }
  | { t: 'bye'; reason: string }
  | { t: 'ping' };
