/**
 * Host session: lobby, links (loopback + PeerJS), roster, the authoritative Sim, snapshot/event fan-out.
 * Single player is a host with only the loopback link.
 */
import type { CatLook, LevelData, PlayerId, Role } from '../shared/contracts';
import { CFG } from '../config';
import type { Difficulty, GameConfig, GameEvent, LobbyState, PlayerInfo } from '../core/types';
import type { C2H, H2C } from '../net/protocol';
import { PROTOCOL_VERSION } from '../net/protocol';
import type { HostLink, PeerHost } from '../net/transport';
import { Sim } from './sim';
import { randomLook } from '../core/profile';
import { BOT_NAMES } from './bots/names';

const MAX_CATS = 4;

/** dev URL flags: ?autobot=1 ?balance=1 ?timeScale=N ?difficulty=kitten|houseCat|feral */
const URLP = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const AUTOBOT = URLP.get('autobot') === '1';
const BALANCE = URLP.get('balance') === '1';
const TIME_SCALE = Math.max(0.1, Math.min(16, Number(URLP.get('timeScale')) || 1));
const DIFF = URLP.get('difficulty') as Difficulty | null;
/** balance lines collected for tooling (window.__balance) */
export const balanceLog: unknown[] = [];
if (BALANCE && typeof window !== 'undefined') (window as unknown as { __balance: unknown[] }).__balance = balanceLog;

export interface HostOptions {
  online: boolean;
  fillBots?: boolean;
  botDifficulty?: Difficulty;
  roundSeconds?: number;
  /** solo: total cat count (player + bots) */
  cats?: number;
}

export class HostSession {
  lobby: LobbyState;
  sim: Sim | null = null;
  readonly links = new Map<PlayerId, HostLink>();
  peer: PeerHost | null = null;
  private nextId = 1;
  private snapAcc = 0;
  private pingAcc = 0;
  private soloCats: number;
  private scaleAcc = 0;
  private logged: unknown = null;
  private againT = 0;

  constructor(private makeLevel: () => LevelData, opts: HostOptions) {
    this.lobby = {
      code: '', hostId: 'p0', players: [],
      fillBots: opts.fillBots ?? true, botDifficulty: DIFF && ['kitten', 'houseCat', 'feral'].includes(DIFF) ? DIFF : opts.botDifficulty ?? 'houseCat',
      roundSeconds: opts.roundSeconds ?? CFG.round.seconds,
    };
    this.soloCats = opts.cats ?? MAX_CATS;
  }

  /** the local player's link (always first, becomes the lobby host) */
  attachLocal(link: HostLink) { this.attach(link, true); }

  attachPeer(peer: PeerHost) {
    this.peer = peer;
    this.lobby.code = peer.code;
    peer.onConnection = (link) => this.attach(link, false);
  }

  private attach(link: HostLink, local: boolean) {
    let id: PlayerId | null = null;
    link.onMessage = (m) => {
      if (m.t === 'hello') {
        if (id) return;
        if (m.v !== PROTOCOL_VERSION) return this.reject(link, 'Version mismatch. Refresh the page.');
        if (this.sim) return this.reject(link, 'That game already started.');
        if (this.lobby.players.length >= MAX_CATS + 1) return this.reject(link, 'That room is full.');
        id = local ? 'p0' : `p${this.nextId++}`;
        const hasSitter = this.lobby.players.some((p) => p.role === 'sitter');
        const cats = this.lobby.players.filter((p) => p.role === 'cat').length;
        const role: Role = !hasSitter && (local || cats >= MAX_CATS) ? 'sitter' : 'cat';
        this.lobby.players.push({ id, name: (m.name || 'Player').slice(0, 16), role, look: m.look, bot: false, connected: true });
        this.links.set(id, link);
        link.send({ t: 'welcome', id });
        this.broadcastLobby();
        return;
      }
      if (id) this.onMsg(id, m);
    };
    link.onClose = () => { if (id) this.drop(id); };
  }

  private reject(link: HostLink, reason: string) {
    link.send({ t: 'bye', reason });
    setTimeout(() => link.close(), 300);
  }

  private onMsg(id: PlayerId, m: C2H) {
    if (m.t === 'move') this.sim?.onMove(id, m.m);
    else if (m.t === 'act') this.sim?.action(id, m.act);
    else if (m.t === 'pref') {
      const p = this.lobby.players.find((x) => x.id === id);
      if (!p || this.sim) return;
      if (m.name) p.name = m.name.slice(0, 16);
      if (m.look) p.look = m.look;
      if (m.role && m.role !== p.role) this.setRole(p, m.role);
      this.broadcastLobby();
    }
  }

  private setRole(p: PlayerInfo, role: Role) {
    if (role === 'sitter') {
      const cur = this.lobby.players.find((x) => x.role === 'sitter');
      if (cur) cur.role = 'cat';
      p.role = 'sitter';
    } else {
      if (this.lobby.players.filter((x) => x.role === 'cat').length >= MAX_CATS) return;
      p.role = 'cat';
    }
  }

  private drop(id: PlayerId) {
    this.links.delete(id);
    if (this.sim) {
      this.sim.convertToBot(id);
      return;
    }
    this.lobby.players = this.lobby.players.filter((p) => p.id !== id);
    this.broadcastLobby();
  }

  setOptions(o: Partial<Pick<LobbyState, 'fillBots' | 'botDifficulty' | 'roundSeconds'>>) {
    Object.assign(this.lobby, o);
    this.broadcastLobby();
  }

  broadcastLobby() {
    for (const l of this.links.values()) l.send({ t: 'lobby', lobby: this.lobby });
  }

  canStart(): string | null {
    if (!this.lobby.players.length) return 'Nobody here yet.';
    return null;
  }

  /** builds the roster (+ bots) and starts the round */
  start(seed = Math.floor(Math.random() * 1e9)) {
    const players: PlayerInfo[] = this.lobby.players.map((p) => ({ ...p }));
    const online = !!this.peer;
    if (!players.some((p) => p.role === 'sitter')) {
      players.push({ id: 'bot-sitter', name: 'Sam', role: 'sitter', look: randomLook('Sam'), bot: true, connected: true });
    }
    const wantCats = online ? (this.lobby.fillBots ? MAX_CATS : 1) : this.soloCats;
    let i = 0;
    const names = BOT_NAMES.filter((n) => !players.some((p) => p.name.toLowerCase() === n.toLowerCase()));
    for (let j = names.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [names[j], names[k]] = [names[k], names[j]]; }
    while (players.filter((p) => p.role === 'cat').length < Math.max(1, wantCats)) {
      const name = names[i % names.length];
      players.push({ id: `bot${i}`, name, role: 'cat', look: randomLook(name), bot: true, connected: true });
      i++;
    }
    const cfg: GameConfig = { roundSeconds: this.lobby.roundSeconds, botDifficulty: this.lobby.botDifficulty, players, seed };
    if (AUTOBOT) cfg.autobot = players.filter((p) => !p.bot && p.id === 'p0').map((p) => p.id);
    this.sim?.dispose();
    this.sim = new Sim(this.makeLevel(), cfg);
    this.snapAcc = 1;
    this.logged = null;
    this.againT = 0;
    for (const l of this.links.values()) l.send({ t: 'start', cfg });
  }

  backToLobby() {
    this.sim?.dispose();
    this.sim = null;
    for (const l of this.links.values()) l.send({ t: 'toLobby' });
    this.broadcastLobby();
  }

  /** fixed-step tick */
  step(dt: number) {
    // dead links (tab closed without a clean close)
    this.pingAcc += dt;
    if (this.pingAcc > 1.5) {
      this.pingAcc = 0;
      const now = performance.now();
      for (const [id, l] of [...this.links]) {
        if (id === 'p0') continue;
        l.send({ t: 'ping' });
        if (now - l.lastSeen > 10000) { l.close(); this.drop(id); }
      }
    }
    const sim = this.sim;
    if (!sim) return;
    // ?timeScale=N: N sim steps per host step (all-bot balance runs)
    this.scaleAcc += TIME_SCALE;
    for (; this.scaleAcc >= 1; this.scaleAcc--) sim.step(dt);
    if (sim.out.length) this.flushEvents(sim.out.splice(0));
    if (sim.results && this.logged !== sim.results) {
      this.roundOver(sim, dt);
      if (this.sim !== sim) return; // restarted: never send the old round's snapshot
    }
    this.snapAcc += dt;
    if (this.snapAcc >= 1 / CFG.snapHz) {
      this.snapAcc = 0;
      const msg: H2C = { t: 'snap', s: sim.snapshot() };
      for (const l of this.links.values()) l.send(msg);
    }
  }

  /** M14: one JSON line per round; balance runs restart solo rounds on their own */
  private roundOver(sim: Sim, dt: number) {
    if (!BALANCE) { this.logged = sim.results; return; }
    if (!this.againT) {
      const line = sim.balance();
      balanceLog.push(line);
      console.log(`[balance] ${JSON.stringify(line)}`);
    }
    this.againT += dt;
    if (this.peer || this.againT < 2) return;
    this.logged = sim.results;
    this.start();
  }

  private flushEvents(out: { ev: GameEvent; to: string | undefined }[]) {
    if (!this.sim) return;
    const roleOf = new Map(this.sim.chars.map((c) => [c.s.id, c.s.role]));
    for (const [id, l] of this.links) {
      const ev = out.filter((o) => o.to === undefined || o.to === id || o.to === roleOf.get(id)).map((o) => o.ev);
      if (ev.length) l.send({ t: 'ev', ev });
    }
  }

  destroy() {
    for (const l of this.links.values()) {
      l.send({ t: 'bye', reason: 'The host closed the game.' });
      l.onClose = null;
      l.close();
    }
    this.links.clear();
    this.peer?.destroy();
    this.sim?.dispose();
    this.sim = null;
  }
}

export type { CatLook };
