import './minigames.css';
import type { MinigameHost, MinigameKind } from '../shared/contracts';
import type { Game } from './kit';
import { laptop } from './laptop';
import { faucet } from './faucet';
import { tpSpin } from './tpSpin';
import { fishing } from './fishing';
import { climb } from './climb';
import { knead } from './knead';
import { escape } from './escape';
import { fight } from './fight';
import { openBox } from './openBox';
import { birdWatch } from './birdWatch';

const GAMES: Record<MinigameKind, (host: MinigameHost) => Game> = {
  laptop, faucet, tpSpin, fishing, climb, knead, escape, fight, openBox, birdWatch,
};

/** Opens a DOM overlay minigame inside host.container. Esc always exits; input stops once progress hits 1. */
export function openMinigame(kind: MinigameKind, host: MinigameHost): Game {
  const g = GAMES[kind](host);
  const done = () => host.getProgress() >= 0.999;
  return {
    update: (dt) => g.update(Math.min(dt, 0.1)),
    key(e, down) {
      if (e.code === 'Escape') {
        if (down) host.exit();
        return true;
      }
      return done() ? true : g.key(e, down);
    },
    mouse: (e) => { if (!done()) g.mouse?.(e); },
    dispose: () => g.dispose(),
    bot: (dt) => { if (!done()) g.bot?.(dt); },
  };
}
