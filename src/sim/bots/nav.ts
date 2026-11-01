/** Basic nav graph queries for bots. ponytail: Dijkstra per query on a ~100 node graph, cache paths if bots multiply. */
import type { DoorDef, LevelData, NavLink, Role, Vec3 } from '../../shared/contracts';
import { distXZ } from '../../core/math';

type Nav = LevelData['nav'];
const adjCache = new WeakMap<Nav, NavLink[][]>();

function adjacency(nav: Nav): NavLink[][] {
  let adj = adjCache.get(nav);
  if (adj) return adj;
  adj = nav.nodes.map(() => []);
  const idx = new Map(nav.nodes.map((n, i) => [n.id, i]));
  for (const l of nav.links) {
    const a = idx.get(l.a), b = idx.get(l.b);
    if (a === undefined || b === undefined) continue;
    adj[a].push(l);
    adj[b].push(l);
  }
  adjCache.set(nav, adj);
  return adj;
}

export interface NavOpts { role: Role; doorOpen(id: DoorDef['id']): boolean }

const usable = (nav: Nav, l: NavLink, o: NavOpts) => {
  if (l.door && !o.doorOpen(l.door)) return false;
  if (o.role === 'sitter') {
    if (l.catOnly) return false;
    if (l.kind === 'jump') {
      const a = nav.nodes.find((n) => n.id === l.a)!, b = nav.nodes.find((n) => n.id === l.b)!;
      if (Math.abs(a.pos[1] - b.pos[1]) > 0.5) return false;
    }
  }
  return true;
};

/** index of the closest node on roughly the same height */
export function nearestNode(nav: Nav, p: Vec3, role?: Role): number {
  let best = -1, bd = Infinity;
  nav.nodes.forEach((n, i) => {
    const dy = Math.abs(n.pos[1] - p[1]);
    if (role === 'sitter' && n.pos[1] > 0.5) return;
    const d = distXZ(n.pos, p) + (dy > 0.45 ? 4 + dy * 4 : dy);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

/** waypoints from near `from` to near `to` (ends with `to`), [] if unreachable */
export function findPath(nav: Nav, from: Vec3, to: Vec3, o: NavOpts): Vec3[] {
  if (!nav.nodes.length) return [to];
  const s = nearestNode(nav, from, o.role), g = nearestNode(nav, to, o.role);
  if (s < 0 || g < 0) return [to];
  const adj = adjacency(nav);
  const idx = new Map(nav.nodes.map((n, i) => [n.id, i]));
  const dist = new Array(nav.nodes.length).fill(Infinity);
  const prev = new Array(nav.nodes.length).fill(-1);
  const done = new Array(nav.nodes.length).fill(false);
  dist[s] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === g) break;
    done[u] = true;
    for (const l of adj[u]) {
      if (!usable(nav, l, o)) continue;
      const v = idx.get(l.a === nav.nodes[u].id ? l.b : l.a)!;
      const c = dist[u] + distXZ(nav.nodes[u].pos, nav.nodes[v].pos) + (l.kind === 'jump' ? 1 : 0);
      if (c < dist[v]) { dist[v] = c; prev[v] = u; }
    }
  }
  if (dist[g] === Infinity) return [];
  const out: Vec3[] = [to];
  for (let u = g; u >= 0; u = prev[u]) out.unshift(nav.nodes[u].pos);
  return out;
}
