/** Nav graph queries for bots: A* over level.nav, role-aware (sitter: no catOnly / high jumps), door-aware. */
import type { BoxCollider, DoorDef, LevelData, NavLink, Role, RoomId, Vec3 } from '../../shared/contracts';
import { distXZ } from '../../core/math';

type Nav = LevelData['nav'];
type DoorId = DoorDef['id'];

interface Graph {
  pos: Vec3[];
  adj: { to: number; l: NavLink; rise: number }[][];
  /** the sitter can stand here (reachable through a non-catOnly, low link) */
  sitterOk: boolean[];
}
const cache = new WeakMap<Nav, Graph>();

function graph(nav: Nav): Graph {
  let g = cache.get(nav);
  if (g) return g;
  const idx = new Map(nav.nodes.map((n, i) => [n.id, i]));
  const pos = nav.nodes.map((n) => n.pos);
  const adj: Graph['adj'] = pos.map(() => []);
  for (const l of nav.links) {
    const a = idx.get(l.a), b = idx.get(l.b);
    if (a === undefined || b === undefined) continue;
    const rise = Math.abs(pos[a][1] - pos[b][1]);
    adj[a].push({ to: b, l, rise });
    adj[b].push({ to: a, l, rise });
  }
  const sitterOk = pos.map((p, i) => p[1] < 0.35 && adj[i].some((e) => sitterLink(e.l, e.rise)));
  g = { pos, adj, sitterOk };
  cache.set(nav, g);
  return g;
}

/** straight walk from a to b (feet height y, body radius r) misses every static box in the way (table legs, chairs) */
export function clearXZ(colliders: BoxCollider[], a: Vec3, b: Vec3, r: number, y: number, tall: number): boolean {
  for (const c of colliders) {
    if (c.tag === 'floor' || c.tag === 'rug' || c.tag === 'ceiling' || c.tag === 'catOnly') continue;
    if (c.center[1] - c.half[1] > y + tall || c.center[1] + c.half[1] < y + 0.06) continue;
    // segment vs box grown by r, in the box's frame (slab test)
    const rot = c.rotY ?? 0, co = Math.cos(rot), si = Math.sin(rot);
    const lx = (x: number, z: number) => (x - c.center[0]) * co - (z - c.center[2]) * si;
    const lz = (x: number, z: number) => (x - c.center[0]) * si + (z - c.center[2]) * co;
    const ax = lx(a[0], a[2]), az = lz(a[0], a[2]), dx = lx(b[0], b[2]) - ax, dz = lz(b[0], b[2]) - az;
    const hx = c.half[0] + r, hz = c.half[2] + r;
    let t0 = 0, t1 = 1, hit = true;
    for (const [p, d, h] of [[ax, dx, hx], [az, dz, hz]]) {
      if (Math.abs(d) < 1e-9) { if (Math.abs(p) > h) { hit = false; break; } continue; }
      let ta = (-h - p) / d, tb = (h - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) { hit = false; break; }
    }
    if (hit) return false;
  }
  return true;
}

const sitterLink = (l: NavLink, rise: number) => !l.catOnly && (l.kind !== 'jump' || rise <= 0.35); // the sitter hops ~0.4 m

/**
 * Cat nodes under furniture so low the cat's capsule wedges (bottom <= 0.475 m above the node: capsule 0.44 + controller
 * offset 0.02 + ground snap). ponytail: avoids the trap instead of fixing it; drop when the level's table tops get thinner.
 */
const lowCache = new WeakMap<Nav, Uint8Array>();
function lowNodes(nav: Nav, colliders?: BoxCollider[]): Uint8Array | null {
  if (!colliders) return null;
  let low = lowCache.get(nav);
  if (low) return low;
  badLinks(nav, colliders);
  low = new Uint8Array(nav.nodes.length);
  nav.nodes.forEach((n, i) => {
    const [x, y, z] = n.pos;
    for (const b of colliders) {
      const gap = b.center[1] - b.half[1] - y;
      if (b.tag === 'catOnly' || b.tag === 'floor' || b.tag === 'rug' || gap < 0.2 || gap > 0.475) continue;
      const r = -(b.rotY ?? 0), c = Math.cos(r), s = Math.sin(r), dx = x - b.center[0], dz = z - b.center[2];
      if (Math.abs(dx * c + dz * s) < b.half[0] + 0.12 && Math.abs(-dx * s + dz * c) < b.half[2] + 0.12) { low![i] = 1; break; }
    }
  });
  lowCache.set(nav, low);
  return low;
}

/** same-level walk links that cross a solid box (a tub wall between the floor and the tub's inside): never walked */
const badCache = new WeakMap<Nav, Set<NavLink>>();
function badLinks(nav: Nav, colliders?: BoxCollider[]): Set<NavLink> | null {
  let bad = badCache.get(nav) ?? null;
  if (bad || !colliders) return bad;
  bad = new Set();
  const g = graph(nav);
  for (const l of nav.links) {
    if (l.kind !== 'walk') continue;
    const a = g.pos[nav.nodes.findIndex((n) => n.id === l.a)], b = g.pos[nav.nodes.findIndex((n) => n.id === l.b)];
    if (!a || !b || Math.abs(a[1] - b[1]) > 0.3) continue;
    if (!clearXZ(colliders, a, b, 0.06, Math.max(a[1], b[1]) + 0.1, 0.3)) bad.add(l);
  }
  badCache.set(nav, bad);
  return bad;
}

/** the step into `b` needs a jump: up onto something, or a jump link on the same level (over a tub wall) */
const isJump = (l: NavLink, a: Vec3, b: Vec3) => b[1] > a[1] + 0.25 || (l.kind === 'jump' && b[1] > a[1] - 0.1);

export interface NavOpts {
  role: Role;
  doorOpen(id: DoorId): boolean;
  /** plan through closed doors anyway (cats hang on the handle / yowl, the sitter opens them). default yes */
  throughDoors?: boolean;
  /** room lookup: start/goal nodes in another room than the point are penalized (no snapping through walls) */
  roomAt?(p: Vec3): RoomId | null;
  /** level colliders: cats avoid nodes under low furniture they wedge under, nobody walks a link through a box */
  colliders?: BoxCollider[];
  /** cats: keep away from here (the sitter), extra cost within 3 m */
  danger?: Vec3;
}

export interface PathPt {
  p: Vec3;
  /** the link into this point needs a jump up */
  jump: boolean;
  /** the link into this point goes through this door */
  door?: DoorId;
  /** last point of a partial path: the target itself is not reachable on the graph */
  partial?: boolean;
}

/** index of the closest node on roughly the same height */
export function nearestNode(nav: Nav, p: Vec3, role?: Role, roomAt?: (p: Vec3) => RoomId | null, avoid?: Uint8Array | null): number {
  const g = graph(nav);
  const room = roomAt?.(p);
  let best = -1, bd = Infinity;
  for (let i = 0; i < g.pos.length; i++) {
    if (role === 'sitter' && !g.sitterOk[i]) continue;
    if (avoid?.[i]) continue;
    const n = g.pos[i];
    const dy = Math.abs(n[1] - p[1]);
    let d = distXZ(n, p) + (dy > 0.45 ? 4 + dy * 4 : dy);
    if (room && d < bd && roomAt!(n) !== room) d += 12; // never snap to a node behind a wall
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** A* waypoints from near `from` to `to` (last point is `to` itself), null if unreachable */
export function planPath(nav: Nav, from: Vec3, to: Vec3, o: NavOpts): PathPt[] | null {
  const g = graph(nav);
  if (!g.pos.length) return [{ p: to, jump: false }];
  const avoid = o.role === 'cat' ? lowNodes(nav, o.colliders) : null, bad = badLinks(nav, o.colliders);
  const s = nearestNode(nav, from, o.role, o.roomAt, avoid), goal = nearestNode(nav, to, o.role, o.roomAt, avoid);
  if (s < 0 || goal < 0) return null;
  const through = o.throughDoors ?? true;
  const n = g.pos.length;
  const gs = new Float64Array(n).fill(Infinity), fs = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1), via = new Array<{ l: NavLink; rise: number } | null>(n).fill(null);
  const closed = new Uint8Array(n);
  const h = (i: number) => distXZ(g.pos[i], g.pos[goal]) + Math.abs(g.pos[i][1] - g.pos[goal][1]);
  gs[s] = 0;
  fs[s] = h(s);
  const open = [s];
  while (open.length) {
    // ponytail: linear scan open list, fine for a few hundred nodes; binary heap if the graph grows
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (fs[open[k]] < fs[open[bi]]) bi = k;
    const u = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (u === goal) break;
    if (closed[u]) continue;
    closed[u] = 1;
    for (const e of g.adj[u]) {
      const { l, rise, to: v } = e;
      if (closed[v] || avoid?.[v] || bad?.has(l)) continue;
      if (o.role === 'sitter' && !sitterLink(l, rise)) continue;
      let c = distXZ(g.pos[u], g.pos[v]) + rise;
      if (o.danger) { const dd = distXZ(g.pos[v], o.danger); if (dd < 3 && Math.abs(g.pos[v][1] - o.danger[1]) < 1.4) c += (3 - dd) * 4; }
      if (l.kind === 'jump') c += 0.6 + rise;
      if (l.door && !o.doorOpen(l.door)) {
        if (!through) continue;
        c += o.role === 'sitter' ? 1.5 : 7; // cats: a closed door is a last resort
      }
      const ng = gs[u] + c;
      if (ng >= gs[v]) continue;
      gs[v] = ng;
      fs[v] = ng + h(v);
      prev[v] = u;
      via[v] = { l, rise };
      open.push(v);
    }
  }
  let end = goal;
  if (gs[goal] === Infinity) {
    // unreachable on the graph: get as close as we can, the caller fails fast at the end
    let bd = Infinity;
    end = -1;
    for (let i = 0; i < n; i++) {
      if (gs[i] === Infinity) continue;
      const d = distXZ(g.pos[i], to) + Math.abs(g.pos[i][1] - to[1]);
      if (d < bd) { bd = d; end = i; }
    }
    if (end < 0 || end === s && distXZ(g.pos[s], to) > 1.5) return null;
  }
  const out: PathPt[] = [];
  for (let u = end; u >= 0; u = prev[u]) {
    const e = via[u];
    out.unshift({ p: g.pos[u], jump: !!e && isJump(e.l, g.pos[prev[u]] ?? g.pos[u], g.pos[u]), door: e?.l.door });
  }
  out.push({ p: to, jump: to[1] > g.pos[end][1] + 0.25, partial: end !== goal });
  return out;
}

/** waypoints only (kept for the placeholder brain), [] if unreachable */
export function findPath(nav: Nav, from: Vec3, to: Vec3, o: NavOpts): Vec3[] {
  return planPath(nav, from, to, o)?.map((x) => x.p) ?? [];
}

/** length of a path in meters (straight line if unreachable) */
export function pathLen(path: PathPt[] | null, from: Vec3, to: Vec3): number {
  if (!path) return Infinity;
  let d = 0, last = from;
  for (const pt of path) { d += distXZ(last, pt.p) + Math.abs(last[1] - pt.p[1]); last = pt.p; }
  return d || distXZ(from, to);
}

export interface Reach {
  /** meters along the graph from the start (Infinity = not reached) */
  d: Float64Array;
  prev: Int32Array;
  door: (DoorId | undefined)[];
  jump: Uint8Array;
  start: number;
}

/**
 * Dijkstra from `from` over the role's graph. `keep(i, d)` false = don't expand through node i (used by the cat's
 * flee search: only nodes it reaches before the sitter can). Closed doors: cats never, the sitter at +1.5 m.
 */
export function reachFrom(nav: Nav, from: Vec3, o: NavOpts & { maxD?: number; keep?(i: number, d: number): boolean }): Reach | null {
  const g = graph(nav);
  const avoid = o.role === 'cat' ? lowNodes(nav, o.colliders) : null, bad = badLinks(nav, o.colliders);
  const n = g.pos.length, start = nearestNode(nav, from, o.role, o.roomAt, avoid);
  if (start < 0) return null;
  const d = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), door: (DoorId | undefined)[] = new Array(n), jump = new Uint8Array(n);
  const closed = new Uint8Array(n), maxD = o.maxD ?? Infinity;
  d[start] = distXZ(from, g.pos[start]);
  const open = [start];
  while (open.length) {
    let bi = 0; // ponytail: linear open list, same ceiling as planPath
    for (let k = 1; k < open.length; k++) if (d[open[k]] < d[open[bi]]) bi = k;
    const u = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (closed[u]) continue;
    closed[u] = 1;
    if (u !== start && o.keep && !o.keep(u, d[u])) continue;
    for (const { l, rise, to: v } of g.adj[u]) {
      if (closed[v] || avoid?.[v] || bad?.has(l) || (o.role === 'sitter' && !sitterLink(l, rise))) continue;
      let c = distXZ(g.pos[u], g.pos[v]) + rise + (l.kind === 'jump' ? 0.6 + rise : 0);
      if (l.door && !o.doorOpen(l.door)) { if (o.role !== 'sitter') continue; c += 1.5; }
      const nd = d[u] + c;
      if (nd >= d[v] || nd > maxD) continue;
      d[v] = nd;
      prev[v] = u;
      door[v] = l.door;
      jump[v] = isJump(l, g.pos[u], g.pos[v]) ? 1 : 0;
      open.push(v);
    }
  }
  return { d, prev, door, jump, start };
}

/** the waypoints of a reachFrom() result to node i */
export function reachPath(nav: Nav, r: Reach, i: number): PathPt[] {
  const g = graph(nav), out: PathPt[] = [];
  for (let u = i; u >= 0; u = r.prev[u]) {
    out.unshift({ p: g.pos[u], jump: r.jump[u] === 1, door: r.door[u] });
  }
  return out;
}

/** node positions + which ones the sitter stands on (same indices as reachFrom) */
export function navNodes(nav: Nav): { pos: Vec3[]; sitterOk: boolean[] } {
  const g = graph(nav);
  return { pos: g.pos, sitterOk: g.sitterOk };
}

/** for every node the sitter can't stand on but can grab from beside (below 1.45 m): the sitter nodes within 1.3 m */
const reachCache = new WeakMap<Nav, number[][]>();
export function grabbableFrom(nav: Nav): number[][] {
  let r = reachCache.get(nav);
  if (r) return r;
  const g = graph(nav);
  r = g.pos.map((p, i) => (g.sitterOk[i] ? [i] : p[1] > 1.45 ? [] : g.pos.flatMap((q, j) => (g.sitterOk[j] && distXZ(p, q) < 1.3 ? [j] : []))));
  reachCache.set(nav, r);
  return r;
}

/** nodes the role can stand on (for flee / wander targets) */
export function standNodes(nav: Nav, role: Role): Vec3[] {
  const g = graph(nav);
  return g.pos.filter((_, i) => role === 'cat' || g.sitterOk[i]);
}
