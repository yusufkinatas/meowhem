/** ADDENDUM 3.3 bot difficulty table. */
import type { Difficulty } from '../../core/types';

export interface BotDiff {
  /** minigame / hold time multiplier on Use.time (applied by the sim, see REQUESTS) */
  work: number;
  react: number;
  flee: number;
  treats: number;
  hypno: number;
  noodle: number;
  wiggle: number;
  flinch: number;
  brawl: number;
  innocence: number;
  slowPush: number;
  /** how keen cat bots are on knocking things off (a Kitten house stays tidier) */
  knock: number;
  /** how often cat bots nap, wander or stare at nothing instead of doing something (Kitten: a lot) */
  lazy: number;
  // sitter bot
  /** grab success per try once in reach (x0.6 while the meter is low, full from 50%) */
  grab: number;
  aimDeg: number;
  undo: boolean;
  clap: boolean;
  toss: boolean;
  /** seconds between sitter decisions (a person's reaction time) */
  sReact: number;
  /** round start: seconds before it goes after a cat that isn't doing damage */
  sGrace: number;
  /** notices cats through walls within this radius (else same room, or the HUD alerts) */
  sHear: number;
  /** gives up a chase that isn't closing in after this many seconds (x2 for a cat on a disaster) */
  sChase: number;
  /** seconds lost after a fumbled grab */
  sFumble: number;
  /** undo only past this progress */
  sUndoAt: number;
  /** chance a landed disaster (or a fresh mess next to it) pulls it off what it was doing */
  sDistract: number;
}

/** a player's bot teammates always play this (the menu difficulty is for the opponents) */
export const TEAMMATE: Difficulty = 'houseCat';

export const BOT_DIFF: Record<Difficulty, BotDiff> = {
  kitten: { work: 1.4, react: 0.8, flee: 3, treats: 0.85, hypno: 10, noodle: 0.5, wiggle: 4, flinch: 0.85, brawl: 4, innocence: 1, slowPush: 0.2, knock: 0.6, lazy: 5, grab: 0.18, aimDeg: 12, undo: false, clap: false, toss: true, sReact: 1.4, sGrace: 25, sHear: 2, sChase: 1.5, sFumble: 2.6, sUndoAt: 1, sDistract: 0.8 },
  houseCat: { work: 1.15, react: 0.5, flee: 4.5, treats: 0.6, hypno: 7, noodle: 0.3, wiggle: 6, flinch: 0.7, brawl: 6, innocence: 0.8, slowPush: 0.4, knock: 1, lazy: 1, grab: 0.38, aimDeg: 7, undo: true, clap: true, toss: true, sReact: 0.75, sGrace: 12, sHear: 3.5, sChase: 2.3, sFumble: 1.7, sUndoAt: 0.5, sDistract: 0.4 },
  feral: { work: 1.1, react: 0.25, flee: 3.2, treats: 0.35, hypno: 4, noodle: 0.1, wiggle: 7.5, flinch: 0.5, brawl: 8, innocence: 0.5, slowPush: 0.7, knock: 1.0, lazy: 0.8, grab: 0.6, aimDeg: 3, undo: true, clap: true, toss: true, sReact: 0.4, sGrace: 6, sHear: 6, sChase: 3.2, sFumble: 1.0, sUndoAt: 0.35, sDistract: 0.1 },
};
