/** Fake-host harness: ?kind=fishing&demo=1&cycle=0&mode=cage&opponent=Mochi&help=1 */
import type { MinigameKind, MinigameHost } from '../src/shared/contracts';
import { openMinigame } from '../src/minigames/index';

const KINDS: MinigameKind[] = ['laptop', 'faucet', 'tpSpin', 'fishing', 'climb', 'knead', 'escape', 'fight', 'openBox', 'birdWatch'];
const q = new URLSearchParams(location.search);
const bar = document.getElementById('bar')!;
const game = document.getElementById('game')!;

let kind = (q.get('kind') as MinigameKind) || 'laptop';
let demo = q.get('demo') === '1';
let cycle = q.get('cycle') !== '0';
let help = q.get('help') === '1'; // another cat chips in (shared progress)
let mode = q.get('mode') || 'grab';
let progress = 0;
let doneAt = 0;
let startedAt = 0;
let api: ReturnType<typeof openMinigame> | null = null;

const btn = (label: string, onClick: () => void, on = false) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = on ? 'on' : '';
  b.onclick = (e) => { (e.currentTarget as HTMLElement).blur(); onClick(); };
  bar.appendChild(b);
  return b;
};
const sep = () => bar.appendChild(Object.assign(document.createElement('span'), { className: 'sep' }));

function renderBar(): void {
  bar.innerHTML = '';
  for (const k of KINDS) btn(k, () => start(k), k === kind);
  sep();
  btn(demo ? 'auto-demo: on' : 'auto-demo: off', () => { demo = !demo; renderBar(); }, demo);
  btn(help ? 'other cat: helping' : 'other cat: away', () => { help = !help; renderBar(); }, help);
  if (kind === 'escape') btn(`mode: ${mode}`, () => { mode = mode === 'grab' ? 'cage' : 'grab'; start(kind); });
  btn('restart', () => start(kind));
  sep();
  bar.insertAdjacentHTML('beforeend', '<div id="prog"><i></i></div><span id="pct"></span><span id="log"></span>');
}

function start(k: MinigameKind): void {
  api?.dispose();
  kind = k;
  progress = 0;
  doneAt = 0;
  startedAt = performance.now();
  delete document.body.dataset.done;
  renderBar();
  const host: MinigameHost = {
    container: game,
    progress: (d) => { progress = Math.min(1, progress + Math.max(0, d)); },
    getProgress: () => progress,
    exit: () => { api?.dispose(); api = null; log('exit()'); },
    sound: (name) => log(`sound: ${name}`),
    data: { mode, opponent: q.get('opponent') || 'Mochi', order: q.get('order') || 'catnip', fur: q.get('fur') || undefined },
  };
  api = openMinigame(k, host);
}

function log(s: string): void {
  const l = document.getElementById('log');
  if (l) l.textContent = s;
}

addEventListener('keydown', (e) => { if (api?.key(e, true)) e.preventDefault(); });
addEventListener('keyup', (e) => { if (api?.key(e, false)) e.preventDefault(); });
for (const t of ['mousedown', 'mousemove', 'mouseup'] as const) addEventListener(t, (e) => api?.mouse?.(e));

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (api) {
    if (help && progress < 0.999) progress = Math.min(1, progress + dt * 0.02);
    if (demo) api.bot?.(dt);
    api.update(dt);
    const i = document.querySelector<HTMLElement>('#prog i');
    if (i) i.style.width = `${progress * 100}%`;
    const pct = document.getElementById('pct');
    if (pct) pct.textContent = `${Math.round(progress * 100)}%`;
    if (progress >= 0.999 && !doneAt) { doneAt = now; document.body.dataset.done = ((now - startedAt) / 1000).toFixed(1); }
    if (doneAt && demo && cycle && now - doneAt > 1800) start(KINDS[(KINDS.indexOf(kind) + 1) % KINDS.length]);
  }
  requestAnimationFrame(frame);
}
start(kind);
requestAnimationFrame(frame);
