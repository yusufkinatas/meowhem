/** Nav graph queries for bots: A* over level.nav, role-aware (sitter: no catOnly / high jumps), door-aware. */
import type { DoorDef, LevelData, NavLink, Role, RoomId, Vec3 } from '../../shared/contracts';
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

const sitterLink = (l: NavLink, rise: number) => !l.catOnly && (l.kind !== 'jump' || rise <= 0.35); // the sitter hops ~0.4 m

export interface NavOpts {
  role: Role;
  doorOpen(id: DoorId): boolean;
  /** plan through closed doors anyway (cats hang on the handle / yowl, the sitter opens them). default yes */
  throughDoors?: boolean;
  /** room lookup: start/goal nodes in another room than the point are penalized (no snapping through walls) */
  roomAt?(p: Vec3): RoomId | null;
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
export function nearestNode(nav: Nav, p: Vec3, role?: Role, roomAt?: (p: Vec3) => RoomId | null): number {
  const g = graph(nav);
  const room = roomAt?.(p);
  let best = -1, bd = Infinity;
  for (let i = 0; i < g.pos.length; i++) {
    if (role === 'sitter' && !g.sitterOk[i]) continue;
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
  const s = nearestNode(nav, from, o.role, o.roomAt), goal = nearestNode(nav, to, o.role, o.roomAt);
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
      if (closed[v]) continue;
      if (o.role === 'sitter' && !sitterLink(l, rise)) continue;
      let c = distXZ(g.pos[u], g.pos[v]) + rise;
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
    out.unshift({ p: g.pos[u], jump: !!e && g.pos[u][1] > (prev[u] >= 0 ? g.pos[prev[u]][1] : 0) + 0.25, door: e?.l.door });
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

/** nodes the role can stand on (for flee / wander targets) */
export function standNodes(nav: Nav, role: Role): Vec3[] {
  const g = graph(nav);
  return g.pos.filter((_, i) => role === 'cat' || g.sitterOk[i]);
}
