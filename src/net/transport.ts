/**
 * Message links between a client and the host. Loopback for the local player, PeerJS for remote ones.
 * PeerJS DataConnections are reliable + ordered, so snapshots and events share one channel.
 * ponytail: one reliable channel, add an unreliable snapshot channel if latency spikes under packet loss.
 */
import Peer, { type DataConnection } from 'peerjs';
import type { C2H, H2C } from './protocol';

export interface Link<In, Out> {
  send(m: Out): void;
  onMessage: ((m: In) => void) | null;
  onClose: (() => void) | null;
  close(): void;
  /** performance.now() of the last message received */
  lastSeen: number;
}

export type ClientLink = Link<H2C, C2H>;
export type HostLink = Link<C2H, H2C>;

class LoopLink<In, Out> implements Link<In, Out> {
  onMessage: ((m: In) => void) | null = null;
  onClose: (() => void) | null = null;
  lastSeen = performance.now();
  other!: LoopLink<Out, In>;
  closed = false;
  send(m: Out) {
    if (this.closed) return;
    const o = this.other;
    o.lastSeen = performance.now();
    o.onMessage?.(structuredClone(m)); // clone: the receiver must never alias sender state
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.other.closed = true;
    this.other.onClose?.();
  }
}

/** [clientSide, hostSide] */
export function loopbackPair(): [ClientLink, HostLink] {
  const c = new LoopLink<H2C, C2H>();
  const h = new LoopLink<C2H, H2C>();
  c.other = h;
  h.other = c;
  return [c, h];
}

class PeerLink<In, Out> implements Link<In, Out> {
  onMessage: ((m: In) => void) | null = null;
  onClose: (() => void) | null = null;
  lastSeen = performance.now();
  private closed = false;
  constructor(private conn: DataConnection) {
    conn.on('data', (d) => {
      this.lastSeen = performance.now();
      this.onMessage?.(d as In);
    });
    conn.on('close', () => this.fireClose());
    conn.on('error', () => this.fireClose());
  }
  private fireClose() {
    if (this.closed) return;
    this.closed = true;
    this.onClose?.();
  }
  send(m: Out) {
    if (this.closed || !this.conn.open) return;
    try { void this.conn.send(m); } catch { this.fireClose(); }
  }
  close() {
    try { this.conn.close(); } catch { /* already gone */ }
    this.fireClose();
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L, O
export const peerIdFor = (code: string) => `meowhem-${code.toUpperCase()}`;
const randomCode = () => Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

function errText(type: string): string {
  switch (type) {
    case 'peer-unavailable': return 'No game with that code.';
    case 'network': case 'server-error': case 'socket-error': case 'socket-closed':
      return 'Could not reach the matchmaking server.';
    case 'browser-incompatible': return 'This browser does not support WebRTC.';
    default: return `Connection failed (${type}).`;
  }
}

export interface PeerHost {
  code: string;
  onConnection: ((link: HostLink) => void) | null;
  destroy(): void;
}

/** Opens a host peer with a fresh 4-letter code. Retries on code collisions. */
export async function createPeerHost(tries = 4): Promise<PeerHost> {
  for (let i = 0; i < tries; i++) {
    const code = randomCode();
    try {
      const peer = await new Promise<Peer>((resolve, reject) => {
        const p = new Peer(peerIdFor(code), { debug: 1 });
        const t = setTimeout(() => { p.destroy(); reject(new Error('network')); }, 12000);
        p.on('open', () => { clearTimeout(t); resolve(p); });
        p.on('error', (e) => { clearTimeout(t); p.destroy(); reject(new Error(e.type)); });
      });
      const host: PeerHost = {
        code,
        onConnection: null,
        destroy: () => peer.destroy(),
      };
      peer.off('error');
      peer.on('error', (e) => console.warn('[peer host]', e.type));
      peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
      peer.on('connection', (conn) => {
        conn.on('open', () => host.onConnection?.(new PeerLink<C2H, H2C>(conn)));
      });
      return host;
    } catch (e) {
      const type = (e as Error).message;
      if (type !== 'unavailable-id') throw new Error(errText(type));
    }
  }
  throw new Error('Could not get a room code. Try again.');
}

export interface PeerClient { link: ClientLink; destroy(): void }

export function joinPeerHost(code: string): Promise<PeerClient> {
  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 1 });
    let done = false;
    const fail = (msg: string) => {
      if (done) return;
      done = true;
      peer.destroy();
      reject(new Error(msg));
    };
    const t = setTimeout(() => fail('Timed out. Check the code and try again.'), 15000);
    peer.on('error', (e) => { clearTimeout(t); fail(errText(e.type)); });
    peer.on('open', () => {
      const conn = peer.connect(peerIdFor(code), { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        clearTimeout(t);
        if (done) return;
        done = true;
        resolve({ link: new PeerLink<H2C, C2H>(conn), destroy: () => peer.destroy() });
      });
    });
  });
}
