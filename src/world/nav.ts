/**
 * Bot nav graph generated from the level's colliders: a clearance-checked floor grid per room, portals through
 * openings (door links tagged), jump links onto listed surfaces, a node on every spot. checkNav() verifies it.
 */
import type { BoxCollider, DoorDef, LevelData, NavLink, NavNode, RoomDef, RoomId, Spot, Vec3 } from '../shared/contracts';

const CAT = { r: 0.19, y0: 0.05, y1: 0.46 };
const SITTER = { r: 0.3, y0: 0.32, y1: 1.8 };
const STEP = 0.7;

export interface Portal { a: Vec3; b: Vec3; ra: RoomId; rb: RoomId; door?: DoorDef['id'] }
export interface Surface { p: Vec3; room: RoomId; group?: string }

const solid = (b: BoxCollider) => b.tag !== 'rug' && b.tag !== 'floor' && b.tag !== 'ceiling';

/** horizontal distance from (x, z) to the box footprint (0 inside) */
function footDist(b: BoxCollider, x: number, z: number) {
  const r = -(b.rotY ?? 0), c = Math.cos(r), s = Math.sin(r);
  const dx = x - b.center[0], dz = z - b.center[2];
  const lx = dx * c + dz * s, lz = -dx * s + dz * c;
  const ox = Math.max(0, Math.abs(lx) - b.half[0]), oz = Math.max(0, Math.abs(lz) - b.half[2]);
  return Math.hypot(ox, oz);
}

export function makeClearance(colliders: BoxCollider[]) {
  const boxes = colliders.filter(solid);
  const walls = colliders.filter((b) => b.tag === 'wall');
  /** is a capsule of radius r with feet at y free at (x, z)? */
  const free = (x: number, y: number, z: number, who: 'cat' | 'sitter', list = boxes) => {
    const k = who === 'cat' ? CAT : SITTER;
    for (const b of list) {
      if (who === 'cat' && b.tag === 'catOnly') continue;
      if (b.center[1] + b.half[1] <= y + k.y0 || b.center[1] - b.half[1] >= y + k.y1) continue;
      if (footDist(b, x, z) < k.r) return false;
    }
    return true;
  };
  const seg = (a: Vec3, b: Vec3, who: 'cat' | 'sitter', list = boxes) => {
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.1));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (!free(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, who, list)) return false;
    }
    return true;
  };
  /** true if the straight xz line a->b crosses a wall box (any height) */
  const crossesWall = (a: Vec3, b: Vec3) => {
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.05));
    const y = Math.max(a[1], b[1]) + 0.1;
    for (let i = 1; i < n; i++) {
      const t = i / n, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
      for (const w of walls) if (y < w.center[1] + w.half[1] && y + 0.3 > w.center[1] - w.half[1] && footDist(w, x, z) < 0.02) return true;
    }
    return false;
  };
  /** something solid hangs over (x, z) below 2 m (under a bed or table): no place to jump up from */
  const covered = (x: number, z: number) => boxes.some((b) => b.tag !== 'catOnly' && b.center[1] - b.half[1] > 0.3 && b.center[1] - b.half[1] < 2 && footDist(b, x, z) < CAT.r);
  return { free, seg, crossesWall, covered };
}

export function buildNav(o: {
  rooms: RoomDef[]; colliders: BoxCollider[]; portals: Portal[]; surfaces: Surface[]; spots: Spot[];
  /** extra explicit links between surface groups or points: [a, b] world points snapped to the nearest nodes */
  extra?: [Vec3, Vec3, NavLink['kind']][];
}): LevelData['nav'] {
  const C = makeClearance(o.colliders);
  const nodes: NavNode[] = [];
  const links: NavLink[] = [];
  const room: RoomId[] = [];
  const keys = new Set<string>();
  const node = (p: Vec3, r: RoomId) => { nodes.push({ id: nodes.length, pos: p }); room.push(r); return nodes.length - 1; };
  const link = (a: number, b: number, kind: NavLink['kind'], extra: Partial<NavLink> = {}) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    if (a === b || keys.has(k)) return;
    keys.add(k);
    links.push({ a, b, kind, ...extra });
  };
  const d2 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const floorLink = (a: number, b: number) => {
    const pa = nodes[a].pos, pb = nodes[b].pos;
    if (!C.seg(pa, pb, 'cat')) return false;
    const sitter = C.seg(pa, pb, 'sitter');
    link(a, b, 'walk', sitter ? {} : { catOnly: true });
    return true;
  };
  const floor: number[] = [];

  // ---- floor grid per room
  for (const r of o.rooms) {
    const grid = new Map<string, number>();
    // cells cover the room inside the wall faces (walls are 0.15 thick on the room edges)
    const x0 = r.min[0] + 0.075, x1 = r.max[0] - 0.075, z0 = r.min[2] + 0.075, z1 = r.max[2] - 0.075;
    const nx = Math.max(1, Math.round((x1 - x0) / STEP)), nz = Math.max(1, Math.round((z1 - z0) / STEP));
    const sx = (x1 - x0) / nx, sz = (z1 - z0) / nz;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const p: Vec3 = [x0 + (i + 0.5) * sx, 0, z0 + (j + 0.5) * sz];
      if (!C.free(p[0], 0, p[2], 'cat')) continue;
      const id = node(p, r.id);
      grid.set(`${i},${j}`, id);
      floor.push(id);
    }
    for (const [k, id] of grid) {
      const [i, j] = k.split(',').map(Number);
      for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const other = grid.get(`${i + di},${j + dj}`);
        if (other !== undefined) floorLink(id, other);
      }
    }
  }
  const nearFloor = (p: Vec3, r: RoomId, max: number, n: number) =>
    floor.filter((i) => room[i] === r && d2(nodes[i].pos, p) <= max).sort((a, b) => d2(nodes[a].pos, p) - d2(nodes[b].pos, p)).slice(0, n);
  const attachFloor = (id: number, r: RoomId) => {
    let n = 0;
    for (const f of nearFloor(nodes[id].pos, r, 1.3, 6)) if (floorLink(id, f)) n++;
    if (!n) for (const f of nearFloor(nodes[id].pos, r, 2, 3)) if (floorLink(id, f)) n++;
    return n;
  };

  // ---- portals through openings
  for (const p of o.portals) {
    const a = node(p.a, p.ra), b = node(p.b, p.rb);
    link(a, b, 'walk', p.door ? { door: p.door } : {});
    attachFloor(a, p.ra);
    attachFloor(b, p.rb);
    floor.push(a, b);
  }

  // ---- surfaces: jump links from the floor, links between surfaces
  const surf: number[] = [];
  const addSurface = (p: Vec3, r: RoomId) => {
    const id = node(p, r);
    surf.push(id);
    // bots only do plain jumps (~1.1 m): higher surfaces are reached by chaining surfaces
    const cands = p[1] > 1.05 ? [] : floor.filter((i) => room[i] === r && d2(nodes[i].pos, p) < 1.5 && !C.crossesWall(nodes[i].pos, p) && !C.covered(nodes[i].pos[0], nodes[i].pos[2]))
      .sort((a, b) => d2(nodes[a].pos, p) - d2(nodes[b].pos, p)).slice(0, 2);
    for (const f of cands) link(id, f, 'jump', { catOnly: true });
    return id;
  };
  for (const s of o.surfaces) addSurface(s.p, s.room);
  for (let i = 0; i < surf.length; i++) for (let j = i + 1; j < surf.length; j++) {
    const a = nodes[surf[i]].pos, b = nodes[surf[j]].pos, dy = Math.abs(a[1] - b[1]), h = d2(a, b);
    if (room[surf[i]] !== room[surf[j]] || C.crossesWall(a, b)) continue;
    if (dy < 0.12 && h < 0.95 && C.seg(a, b, 'cat')) link(surf[i], surf[j], 'walk', { catOnly: true });
    else if (dy >= 0.12 && dy <= 1.05 && h < 1.25) link(surf[i], surf[j], 'jump', { catOnly: true });
  }

  // ---- spots: a node on each, floor spots join the grid, raised ones join the surfaces
  for (const s of o.spots) {
    if (s.pos[1] < 0.1) {
      // a spot hugging its object (carrier): back the node off along -facing until the sitter fits
      let x = s.pos[0], z = s.pos[2];
      for (let k = 0; k < 8 && !C.free(x, 0, z, 'sitter'); k++) { x -= Math.sin(s.facing) * 0.05; z -= Math.cos(s.facing) * 0.05; }
      if (!C.free(x, 0, z, 'sitter')) { x = s.pos[0]; z = s.pos[2]; }
      const id = node([x, 0, z], s.room);
      if (!attachFloor(id, s.room)) for (const f of nearFloor(s.pos, s.room, 2.2, 2)) link(id, f, 'walk', { catOnly: true });
      floor.push(id);
    } else {
      const near = surf.filter((i) => d2(nodes[i].pos, s.pos) < 0.9 && Math.abs(nodes[i].pos[1] - s.pos[1]) < 0.12);
      const id = addSurface(s.pos, s.room);
      for (const n of near) link(id, n, 'walk', { catOnly: true });
    }
  }
  for (const [a, b, kind] of o.extra ?? []) {
    const na = nearestTo(nodes, a), nb = nearestTo(nodes, b);
    link(na, nb, kind, { catOnly: true });
  }
  return { nodes, links };
}

function nearestTo(nodes: NavNode[], p: Vec3) {
  let best = 0, bd = Infinity;
  for (const n of nodes) {
    const d = Math.hypot(n.pos[0] - p[0], (n.pos[1] - p[1]) * 3, n.pos[2] - p[2]);
    if (d < bd) { bd = d; best = n.id; }
  }
  return best;
}

/** verification: every spot reachable for cats from every cat spawn; sitter spots from the sitter spawn; no link through a wall */
export function checkNav(level: Pick<LevelData, 'nav' | 'spots' | 'spawns' | 'colliders'>, sitterSpots: Spot['id'][]): string[] {
  const { nodes, links } = level.nav;
  const C = makeClearance(level.colliders);
  const problems: string[] = [];
  const adj = nodes.map(() => [] as { to: number; l: NavLink }[]);
  for (const l of links) { adj[l.a].push({ to: l.b, l }); adj[l.b].push({ to: l.a, l }); }
  const bfs = (start: number, sitter: boolean) => {
    const seen = new Set([start]);
    const q = [start];
    while (q.length) {
      const u = q.pop()!;
      for (const { to, l } of adj[u]) {
        if (seen.has(to)) continue;
        if (sitter && (l.catOnly || (l.kind === 'jump' && Math.abs(nodes[u].pos[1] - nodes[to].pos[1]) > 0.5))) continue;
        seen.add(to);
        q.push(to);
      }
    }
    return seen;
  };
  const nearest = (p: Vec3) => nearestTo(nodes, p);
  const spotNode = (s: Spot) => nearest(s.pos);
  level.spawns.cats.forEach((sp, i) => {
    const r = bfs(nearest(sp), false);
    for (const s of level.spots) if (!r.has(spotNode(s))) problems.push(`cat spawn ${i} can't reach ${s.id}`);
  });
  const rs = bfs(nearest(level.spawns.sitter), true);
  for (const s of level.spots) if (sitterSpots.includes(s.id) && !rs.has(spotNode(s))) problems.push(`sitter can't reach ${s.id}`);
  for (const l of links) {
    if (C.crossesWall(nodes[l.a].pos, nodes[l.b].pos)) problems.push(`link ${l.a}-${l.b} crosses a wall`);
  }
  const orphans = nodes.filter((n) => !adj[n.id].length).length;
  if (orphans) problems.push(`${orphans} orphan nodes`);
  return problems;
}
