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
  // sitter bot
  grab: number;
  aimDeg: number;
  undo: boolean;
  clap: boolean;
  toss: boolean;
}

export const BOT_DIFF: Record<Difficulty, BotDiff> = {
  kitten: { work: 1.4, react: 0.8, flee: 3, treats: 0.85, hypno: 10, noodle: 0.5, wiggle: 4, flinch: 0.85, brawl: 4, innocence: 1, slowPush: 0.2, grab: 0.5, aimDeg: 12, undo: false, clap: false, toss: true },
  houseCat: { work: 1.15, react: 0.5, flee: 4.5, treats: 0.6, hypno: 7, noodle: 0.3, wiggle: 6, flinch: 0.7, brawl: 6, innocence: 0.8, slowPush: 0.4, grab: 0.7, aimDeg: 7, undo: true, clap: true, toss: true },
  feral: { work: 1.0, react: 0.25, flee: 6, treats: 0.35, hypno: 4, noodle: 0.1, wiggle: 7.5, flinch: 0.5, brawl: 8, innocence: 0.5, slowPush: 0.7, grab: 0.9, aimDeg: 3, undo: true, clap: true, toss: true },
};
