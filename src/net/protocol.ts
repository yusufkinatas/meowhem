import type { CatLook, PlayerId, Role } from '../shared/contracts';
import type { Action, GameConfig, GameEvent, LobbyState, MoveMsg, Snapshot } from '../core/types';

export const PROTOCOL_VERSION = 1;

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
