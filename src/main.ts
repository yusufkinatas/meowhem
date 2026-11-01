/**
 * Boot + session wiring: loading, menus, solo/host/join, the main loop, testing hooks (window.__game).
 * URL: ?debug=1  ?autostart=sitter|cat  ?bots=N  ?time=SECONDS
 */
import './style.css';
import type { LevelData, MessKind, Role, Vec3 } from './shared/contracts';
import { CFG } from './config';
import { buildLevel, createAudio, preloadAssets } from './registry';
import { initPhysics } from './core/physics';
import { loadProfile, saveProfile } from './core/profile';
import type { Action, LobbyState, GameConfig } from './core/types';
import { HostSession } from './sim/host';
import { PROTOCOL_VERSION, type H2C } from './net/protocol';
import { loopbackPair, createPeerHost, joinPeerHost, normalizeCode, type ClientLink } from './net/transport';
import { Renderer } from './client/renderer';
import { Input } from './client/input';
import { ClientGame } from './client/client';
import { Menu } from './client/menu';
import { createDebug } from './dev/debug';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const app = document.getElementById('app')!;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;

const renderer = new Renderer(canvas);
const input = new Input(canvas);
const audio = createAudio();
const profile = loadProfile();
const menu = new Menu(ui, profile, saveProfile);

interface Session {
  host: HostSession | null;
  link: ClientLink;
  myId: string;
  lobby: LobbyState | null;
  client: ClientGame | null;
  online: boolean;
  solo: Role | null;
  destroyPeer?: () => void;
  leaving: boolean;
}
let session: Session | null = null;
let sharedLevel: LevelData | null = null;
let debug: ReturnType<typeof createDebug> | null = null;

document.addEventListener('pointerdown', () => audio.unlock(), { once: false });

// ------------------------------------------------------------------ session lifecycle
function teardown() {
  const s = session;
  if (!s) return;
  session = null;
  s.leaving = true;
  s.link.onMessage = null;
  s.link.onClose = null;
  debug?.dispose();
  debug = null;
  s.client?.dispose();
  s.client = null;
  s.host?.destroy();
  s.link.close();
  s.destroyPeer?.();
  input.unlock();
}

function toTitle(err?: string) {
  teardown();
  audio.setMusic('menu');
  if (err) menu.error(err);
  menu.title({
    soloSitter: () => startSolo('sitter'),
    soloCat: () => startSolo('cat'),
    host: () => void startHost(),
    join: (code) => void startJoin(code),
  });
}

function newHost(online: boolean, cats?: number) {
  const t = Number(params.get('time'));
  return new HostSession(() => (sharedLevel = buildLevel()), {
    online,
    cats,
    botDifficulty: menu.solo.difficulty,
    roundSeconds: t > 0 ? t : menu.solo.seconds,
  });
}

function attach(link: ClientLink, host: HostSession | null, online: boolean, solo: Role | null, destroyPeer?: () => void) {
  const s: Session = { host, link, myId: '', lobby: null, client: null, online, solo, destroyPeer, leaving: false };
  session = s;
  link.onMessage = (m) => onHostMsg(s, m);
  link.onClose = () => { if (!s.leaving && session === s) toTitle('Lost connection to the host.'); };
  link.send({ t: 'hello', name: profile.name || 'Cat', look: { ...profile.look, name: profile.name || 'Cat' }, v: PROTOCOL_VERSION });
  return s;
}

function startSolo(role: Role) {
  teardown();
  const bots = Number(params.get('bots'));
  const cats = role === 'sitter' ? (bots > 0 ? bots : 4) : 1 + (bots >= 0 && params.has('bots') ? bots : 3);
  const host = newHost(false, Math.min(4, Math.max(1, cats)));
  const [cl, hl] = loopbackPair();
  host.attachLocal(hl);
  const s = attach(cl, host, false, role);
  cl.send({ t: 'pref', role });
  host.start();
  void s;
}

async function startHost() {
  teardown();
  menu.message('Opening a room...', 'Talking to the matchmaking server.');
  try {
    const peer = await createPeerHost();
    const host = newHost(true);
    host.attachPeer(peer);
    const [cl, hl] = loopbackPair();
    host.attachLocal(hl);
    attach(cl, host, true, null);
  } catch (e) {
    toTitle((e as Error).message);
  }
}

async function startJoin(raw: string) {
  const code = normalizeCode(raw);
  if (code.length !== 4) { menu.error('Room codes are 4 letters.'); return; }
  teardown();
  menu.message(`Joining ${code}...`, 'Knocking on the door.');
  try {
    const pc = await joinPeerHost(code);
    attach(pc.link, null, true, null, pc.destroy);
  } catch (e) {
    toTitle((e as Error).message);
  }
}

function showLobby(s: Session) {
  if (!s.lobby || s.client) return;
  menu.lobby(s.lobby, s.myId, {
    role: (r) => s.link.send({ t: 'pref', role: r }),
    options: (o) => s.host?.setOptions(o),
    start: () => s.host?.start(),
    leave: () => toTitle(),
  });
}

function onHostMsg(s: Session, m: H2C) {
  if (session !== s) return;
  switch (m.t) {
    case 'welcome': s.myId = m.id; break;
    case 'lobby': s.lobby = m.lobby; if (s.online) showLobby(s); break;
    case 'start': startClient(s, m.cfg); break;
    case 'toLobby':
      s.client?.dispose();
      s.client = null;
      debug?.dispose();
      debug = null;
      showLobby(s);
      break;
    case 'bye': s.leaving = true; toTitle(m.reason); break;
    case 'snap': case 'ev': s.client?.handle(m); break;
  }
}

function startClient(s: Session, cfg: GameConfig) {
  s.client?.dispose();
  debug?.dispose();
  menu.hide();
  const level = s.host && sharedLevel ? sharedLevel : buildLevel();
  s.client = new ClientGame({
    link: s.link, myId: s.myId, cfg, level, isHost: !!s.host, audio, renderer, input, ui,
    onLeave: () => toTitle(),
    onAgain: () => {
      if (!s.host) return;
      if (s.solo) s.host.start();
      else s.host.backToLobby();
    },
  });
  if (DEBUG) debug = createDebug(renderer.scene, level, () => s.host?.sim?.world ?? s.client!.sw.world, () => s.client?.fps ?? 0);
  input.lock();
}

// ------------------------------------------------------------------ loop
let last = performance.now();
let acc = 0;
let pingAcc = 0;
function advance(dt: number) {
  const s = session;
  if (s?.host) {
    acc += dt;
    let n = 0;
    while (acc >= CFG.tick && n++ < 8) { s.host.step(CFG.tick); acc -= CFG.tick; }
    if (n >= 8) acc = 0;
  }
  if (s && !s.host && s.online) {
    pingAcc += dt;
    if (pingAcc > 2) {
      pingAcc = 0;
      s.link.send({ t: 'ping' });
      if (performance.now() - s.link.lastSeen > 10000) toTitle('The host stopped responding.');
    }
  }
}
function loop(now: number) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  advance(dt);
  session?.client?.frame(dt);
  debug?.update();
  if (session?.client) renderer.render();
}
// hidden tabs get no rAF: keep an online host ticking so remote players are not frozen
setInterval(() => {
  if (document.hidden && session?.host && session.online) { const now = performance.now(); advance(Math.min(0.1, (now - last) / 1000)); last = now; }
}, 50);

// ------------------------------------------------------------------ testing hooks
/** real DOM key events (so minigames see them too); mouse buttons go straight to Input */
function pressKey(code: string, down: boolean) {
  if (code.startsWith('Mouse')) return input.set(code, down);
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code === 'Space' ? ' ' : code, bubbles: true }));
}
const game = {
  get session() { return session; },
  get host() { return session?.host ?? null; },
  get sim() { return session?.host?.sim ?? null; },
  get client() { return session?.client ?? null; },
  snapshot: () => session?.client?.snap ?? null,
  me: () => session?.client?.me ?? null,
  startSolo,
  startHost: () => startHost(),
  join: (code: string) => startJoin(code),
  toTitle: () => toTitle(),
  act: (a: Action) => session?.client?.act(a),
  /** hold/release a key or mouse button (KeyW, Space, Mouse0...) */
  key: (code: string, down: boolean) => pressKey(code, down),
  tap: (code: string, ms = 80) => { pressKey(code, true); setTimeout(() => pressKey(code, false), ms); },
  lockless: (on = true) => { if (session?.client) session.client.forceLocked = on; },
  look: (yaw: number, pitch = 0.25) => { const c = session?.client; if (c) { c.camera.yaw = yaw; c.camera.pitch = pitch; } },
  teleport: (id: string, p: Vec3) => { const sim = session?.host?.sim; const c = sim?.byId.get(id); if (c) sim!.teleport(c.s, p); },
  addMess: (kind: MessKind, p: Vec3) => session?.host?.sim?.addMess(kind, p),
  setTime: (t: number) => { const sim = session?.host?.sim; if (sim) sim.timeLeft = t; },
  end: (winner: Role = 'sitter') => session?.host?.sim?.forceEnd(winner),
  give: (id: string, st: string, sec: number) => { const c = session?.host?.sim?.byId.get(id); if (c) (c.s.st as Record<string, number>)[st] = sec; },
};
(window as unknown as { __game: typeof game }).__game = game;

// ------------------------------------------------------------------ boot
async function boot() {
  menu.loading(0);
  requestAnimationFrame(loop);
  try {
    await initPhysics();
    menu.loading(0.15);
    await preloadAssets((p) => menu.loading(0.15 + p * 0.85));
  } catch (e) {
    console.error(e);
    menu.message('Something broke while loading.', String((e as Error).message ?? e));
    return;
  }
  const auto = params.get('autostart');
  if (auto === 'sitter' || auto === 'cat') {
    if (!profile.name) profile.name = auto === 'cat' ? 'Mochi' : 'Sam';
    startSolo(auto);
  } else toTitle();
}
void boot();
void app;
