/**
 * Fake-host harness for the docked minigames.
 * ?kind=fishing&demo=1&cycle=0&danger=0.8&work=1.4&order=wetFood&mode=cage&opp=stare&fur=%23888888&help=1&shot=1
 * work = the host's disaster work divisor (CFG.scale[n].work: 0.85 / 1 / 1.2 / 1.4).
 */
import type { MinigameKind, MinigameHost } from '../src/shared/contracts';
import { openMinigame } from '../src/minigames/index';

const KINDS: MinigameKind[] = ['laptop', 'faucet', 'tpSpin', 'fishing', 'climb', 'knead', 'escape', 'fight', 'openBox', 'birdWatch'];
const q = new URLSearchParams(location.search);
const bar = document.getElementById('bar')!;
const game = document.getElementById('game')!;
if (q.get('shot') === '1') document.body.classList.add('shot');

let kind = (q.get('kind') as MinigameKind) || 'laptop';
let demo = q.get('demo') === '1';
let cycle = q.get('cycle') !== '0';
let help = q.get('help') === '1';
let danger = Number(q.get('danger') ?? 0);
let work = Number(q.get('work') ?? 1);
let order = q.get('order') || 'catnip';
let mode = q.get('mode') || 'grab';
let opp = q.get('opp') || 'flinch';           // fight: does the opponent flinch in the staredown?
let fur = q.get('fur') || '#FFB23F';
const FURS: Record<string, string> = { ginger: '#FFB23F', grey: '#8f8a94', black: '#3b3438', cream: '#f3e2c4', brown: '#9a6a44' };

let progress = 0, sum = 0, t = 0, doneAt = 0, startedAt = 0, myFlinch = false, closing = 0, cageCut = 0;
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
function select(label: string, opts: string[], cur: string, set: (v: string) => void): void {
  const l = document.createElement('label');
  l.textContent = label;
  const s = document.createElement('select');
  for (const o of opts) s.add(new Option(o, o, false, o === cur));
  s.onchange = () => { set(s.value); s.blur(); };
  l.appendChild(s);
  bar.appendChild(l);
}

function renderBar(): void {
  bar.innerHTML = '';
  for (const k of KINDS) btn(k, () => start(k), k === kind);
  sep();
  btn(demo ? 'demo: on' : 'demo: off', () => { demo = !demo; renderBar(); }, demo);
  btn(help ? 'other cat: helping' : 'other cat: away', () => { help = !help; renderBar(); }, help);
  select('work ÷', ['0.85', '1', '1.2', '1.4'], String(work), (v) => { work = Number(v); });
  select('order', ['catnip', 'wetFood'], order, (v) => { order = v; start(kind); });
  select('fur', Object.keys(FURS), Object.keys(FURS).find((k) => FURS[k] === fur) ?? 'ginger', (v) => { fur = FURS[v]; start(kind); });
  if (kind === 'escape') select('mode', ['grab', 'cage', 'tv'], mode, (v) => { mode = v; start(kind); });
  if (kind === 'fight') select('opponent', ['flinch', 'stare'], opp, (v) => { opp = v; start(kind); });
  const l = document.createElement('label');
  l.innerHTML = `danger <input type="range" min="0" max="1" step="0.05" value="${danger}"> <b>${danger.toFixed(2)}</b>`;
  const r = l.querySelector('input')!;
  r.oninput = () => { danger = Number(r.value); l.querySelector('b')!.textContent = danger.toFixed(2); };
  bar.appendChild(l);
  btn('restart', () => start(kind));
  sep();
  bar.insertAdjacentHTML('beforeend', '<div id="prog"><i></i></div><span id="pct"></span><span id="log"></span>');
}

function start(k: MinigameKind): void {
  api?.dispose();
  kind = k;
  progress = sum = t = doneAt = closing = cageCut = 0;
  myFlinch = false;
  startedAt = performance.now();
  delete document.body.dataset.done;
  renderBar();
  const host: MinigameHost = {
    container: game,
    progress: (d) => {
      d = Math.max(0, Math.min(0.25, d));
      sum += d;
      if (kind === 'fight') { if (t < 1.5) myFlinch = true; return; }
      if (kind === 'escape') {
        const n = d * 20;
        if (mode === 'grab') { if (t >= 1) progress += n / 20; }
        else if (mode === 'tv') progress += n / 8;
        else cageCut = Math.min(0.4 * 20, cageCut + 0.25 * n);
        return;
      }
      progress = Math.min(1, progress + d / work);
    },
    getProgress: () => (kind === 'fight' ? Math.min(1, sum / 1.5) : Math.min(1, progress)),
    exit: () => { api?.dispose(); api = null; log('exit()'); },
    sound: ((name: string, o?: { pitch?: number; volume?: number }) =>
      log(`sound: ${name}${o?.pitch ? ` p${o.pitch.toFixed(2)}` : ''}${o?.volume ? ` v${o.volume.toFixed(2)}` : ''}`)) as MinigameHost['sound'],
    data: {
      mode, order, fur, limp: 1, opponent: q.get('opponent') || 'Gerald', opponentFur: '#9a8f86',
      helpers: () => (help ? 1 : 0),
    },
    danger: () => danger,
  };
  api = openMinigame(k, host);
}

function log(s: string): void {
  const l = document.getElementById('log');
  if (l) l.textContent = s;
}

addEventListener('keydown', (e) => { if (api?.key(e, true)) e.preventDefault(); });
addEventListener('keyup', (e) => { if (api?.key(e, false)) e.preventDefault(); });
for (const ty of ['mousedown', 'mousemove', 'mouseup'] as const) game.addEventListener(ty, (e) => api?.mouse?.(e));

/** what P5's client is asked to do on a host close: finish(), then dispose a moment later */
function hostClose(r: 'done' | 'win' | 'lose' | 'off', delay: number): void {
  if (closing) return;
  closing = performance.now() + delay * 1000;
  api?.finish?.(r);
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (api) {
    t += dt;
    if (help && progress < 0.999 && kind !== 'fight' && kind !== 'escape') progress = Math.min(1, progress + dt * 0.03);
    if (kind === 'escape' && mode === 'cage') progress = Math.min(1, (t + cageCut) / 20);
    if (demo && !closing) api.bot?.(dt);
    api.update(dt);
    if (kind === 'fight' && !closing) {
      if (t >= 1.5 && !myFlinch && opp === 'stare') hostClose('off', 0.6);
      else if (t >= 4) hostClose(sum > 0.55 ? 'win' : 'lose', 0.9);
    } else if (kind !== 'fight' && progress >= 0.999 && !closing) hostClose('done', 0.5);
    const i = document.querySelector<HTMLElement>('#prog i');
    if (i) i.style.width = `${progress * 100}%`;
    const pct = document.getElementById('pct');
    if (pct) pct.textContent = `${Math.round(progress * 100)}%`;
    if ((progress >= 0.999 || closing) && !doneAt) { doneAt = now; document.body.dataset.done = ((now - startedAt) / 1000).toFixed(1); log(`done in ${document.body.dataset.done}s`); }
    if (closing && now > closing) {
      api.dispose();
      api = null;
      if (demo && cycle) setTimeout(() => start(KINDS[(KINDS.indexOf(kind) + 1) % KINDS.length]), 600);
    }
  }
  requestAnimationFrame(frame);
}
/** for scripted checks: progress and completion time */
(window as unknown as { __mg: () => string }).__mg = () => `${kind} t=${t.toFixed(1)} p=${progress.toFixed(3)} done=${document.body.dataset.done ?? ''}`;
start(kind);
requestAnimationFrame(frame);
