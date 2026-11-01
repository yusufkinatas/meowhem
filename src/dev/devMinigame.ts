/** Generic placeholder minigame: mash SPACE to fill the bar. Swapped for src/minigames in registry. */
import type { MinigameApi, MinigameHost, MinigameKind } from '../shared/contracts';

export function openDevMinigame(kind: MinigameKind, host: MinigameHost): MinigameApi {
  const box = document.createElement('div');
  box.className = 'dev-mg';
  box.innerHTML = `<div class="dev-mg-title"></div><div class="dev-mg-bar"><i></i></div><div class="dev-mg-hint">Mash <b>SPACE</b> &middot; Esc to stop</div>`;
  box.querySelector('.dev-mg-title')!.textContent = kind === 'fight' ? `Fight ${String(host.data?.opponent ?? '')}!` : kind;
  host.container.appendChild(box);
  const bar = box.querySelector('i') as HTMLElement;
  return {
    update() { bar.style.width = `${Math.round(host.getProgress() * 100)}%`; },
    key(e, down) {
      if (e.code === 'Escape' && down) { host.exit(); return true; }
      if (e.code === 'Space') { if (down && !e.repeat) host.progress(0.06); return true; }
      return false;
    },
    dispose() { box.remove(); },
  };
}
