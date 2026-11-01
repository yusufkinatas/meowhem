/**
 * Placeholder level: box rooms with the DESIGN.md layout so the engine can be played before the real
 * level (downloaded models) lands. Same LevelData contract, swapped in registry.buildLevel().
 *
 *   z=6  +---------------------+-------------------+
 *        |  LIVING  x-9..0     |  KITCHEN x0..9    |
 *        |          z 0..6     |          z2..6    |
 *        |                     +---- open ---------+
 *        |                    arch   HALLWAY z0..2  front door (x=9)
 *   z=0  +--door--+------door--+--door---+---------+
 *        | BEDROOM | BATHROOM  |  OFFICE           |
 *        | x-9..-3 | x-3..2    |  x2..9            |
 *   z=-6 +---------+-----------+-------------------+
 */
import * as THREE from 'three';
import type { BoxCollider, DoorDef, LevelData, NavLink, NavNode, PropSpawn, RoomDef, RoomId, Spot, Vec3, WorldVisualValue } from '../shared/contracts';
import { toon } from '../shared/toon';

const H = 2.6, T = 0.075; // wall height, half thickness

const COLORS = {
  floor: { living: '#d9a873', kitchen: '#e8dcc6', hallway: '#cf9e6a', bathroom: '#cfe3e0', bedroom: '#d6a77a', office: '#c9955f' } as Record<RoomId, string>,
  wall: { living: '#f3e6d0', kitchen: '#e4ecd9', hallway: '#f0dcc8', bathroom: '#dceeed', bedroom: '#f2d9cf', office: '#e9e2cf' } as Record<RoomId, string>,
};

export function buildDevLevel(): LevelData {
  const group = new THREE.Group();
  group.name = 'devLevel';
  const colliders: BoxCollider[] = [];
  const furniture: BoxCollider[] = [];

  const box = (c: Vec3, half: Vec3, color: string, opts: { collide?: boolean; tag?: string; furn?: boolean; rotY?: number; outline?: boolean } = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(half[0] * 2, half[1] * 2, half[2] * 2), toon(color));
    m.position.set(...c);
    m.rotation.y = opts.rotY ?? 0;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    if (opts.collide !== false) {
      const b: BoxCollider = { center: c, half, rotY: opts.rotY, tag: opts.tag };
      colliders.push(b);
      if (opts.furn) furniture.push(b);
    }
    return m;
  };
  /** furniture block from floor-ish bottom y0 to top y1 */
  const furn = (x: number, z: number, sx: number, sz: number, y1: number, color: string, y0 = 0) =>
    box([x, (y0 + y1) / 2, z], [sx / 2, (y1 - y0) / 2, sz / 2], color, { furn: true });

  // ---------------------------------------------------------------- rooms
  const rooms: RoomDef[] = [
    { id: 'living', name: 'Living room', min: [-9, 0, 0], max: [0, H, 6] },
    { id: 'kitchen', name: 'Kitchen', min: [0, 0, 2], max: [9, H, 6] },
    { id: 'hallway', name: 'Hallway', min: [0, 0, 0], max: [9, H, 2] },
    { id: 'bedroom', name: 'Bedroom', min: [-9, 0, -6], max: [-3, H, 0] },
    { id: 'bathroom', name: 'Bathroom', min: [-3, 0, -6], max: [2, H, 0] },
    { id: 'office', name: 'Office', min: [2, 0, -6], max: [9, H, 0] },
  ];
  colliders.push({ center: [0, -0.25, 0], half: [9.5, 0.25, 6.5], tag: 'floor' });
  for (const r of rooms) {
    const w = r.max[0] - r.min[0], d = r.max[2] - r.min[2];
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), toon(COLORS.floor[r.id]));
    f.rotation.x = -Math.PI / 2;
    f.position.set((r.min[0] + r.max[0]) / 2, 0.001, (r.min[2] + r.max[2]) / 2);
    f.receiveShadow = true;
    group.add(f);
  }

  // ---------------------------------------------------------------- walls
  const wallX = (z: number, x0: number, x1: number, gaps: [number, number][], color: string) => {
    let a = x0;
    for (const [g0, g1] of [...gaps, [x1, x1] as [number, number]]) {
      if (g0 > a) box([(a + g0) / 2, H / 2, z], [(g0 - a) / 2, H / 2, T], color);
      if (g1 > g0) box([(g0 + g1) / 2, 2.35, z], [(g1 - g0) / 2, 0.25, T], color); // lintel
      a = g1;
    }
  };
  const wallZ = (x: number, z0: number, z1: number, gaps: [number, number][], color: string) => {
    let a = z0;
    for (const [g0, g1] of [...gaps, [z1, z1] as [number, number]]) {
      if (g0 > a) box([x, H / 2, (a + g0) / 2], [T, H / 2, (g0 - a) / 2], color);
      if (g1 > g0) box([x, 2.35, (g0 + g1) / 2], [T, 0.25, (g1 - g0) / 2], color);
      a = g1;
    }
  };
  wallX(6, -9, 9, [], COLORS.wall.living);
  wallX(-6, -9, 9, [], COLORS.wall.bedroom);
  wallZ(-9, -6, 6, [], COLORS.wall.living);
  wallZ(9, -6, 6, [], COLORS.wall.hallway);
  wallX(0, -9, 9, [[-5.5, -4.5], [0.4, 1.4], [5, 6]], COLORS.wall.hallway);
  wallZ(-3, -6, 0, [], COLORS.wall.bathroom);
  wallZ(2, -6, 0, [], COLORS.wall.office);
  wallZ(0, 0, 6, [[0.2, 1.8], [3.6, 5.0]], COLORS.wall.living);
  wallX(2, 0, 9, [[3, 4.6]], COLORS.wall.kitchen);
  // front door (always closed) + window panes
  box([8.9, 1.05, 1], [0.05, 1.05, 0.5], '#b5764a', { collide: false });
  const glass = toon('#bfe4f2', { emissive: '#bfe4f2', emissiveIntensity: 0.35 });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), glass);
  win.position.set(-6.5, 1.45, 5.92);
  win.rotation.y = Math.PI;
  group.add(win);

  // ---------------------------------------------------------------- furniture
  // living
  furn(-8.65, 3, 0.5, 1.6, 0.5, '#8a6a52');                 // TV stand
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.68), new THREE.MeshBasicMaterial({ color: '#15151a' }));
  tvScreen.position.set(-8.6, 0.95, 3);
  tvScreen.rotation.y = Math.PI / 2;
  group.add(tvScreen);
  box([-8.75, 0.95, 3], [0.04, 0.38, 0.64], '#222228', { collide: true, furn: true });
  const sofaSeat = furn(-4.5, 3, 0.7, 2.2, 0.45, '#9fb8a8');   // sofa seat
  furn(-4.05, 3, 0.2, 2.2, 0.9, '#8aa595');                   // sofa back
  furn(-6.6, 3, 0.6, 1.0, 0.45, '#c08a5c');                   // coffee table
  colliders.push({ center: [-6.5, 0.005, 3], half: [1.5, 0.005, 1.2], tag: 'rug' });
  box([-6.5, 0.006, 3], [1.5, 0.006, 1.2], '#e8a9a0', { collide: false });
  furn(-4.4, 5.3, 0.45, 0.45, 0.6, '#c08a5c');               // side table N
  furn(-4.4, 0.6, 0.45, 0.45, 0.6, '#c08a5c');               // side table S
  furn(-2.0, 5.78, 1.6, 0.4, 1.2, '#a8835f');                // bookshelf
  furn(-0.6, 5.4, 0.5, 0.5, 0.45, '#c4704f');                // big plant pot
  const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), toon('#6fae6a'));
  leaves.position.set(-0.6, 1.0, 5.4);
  leaves.castShadow = true;
  group.add(leaves);
  furn(-8.5, 5.4, 1.0, 0.5, 0.75, '#8a6a52');                // fish cabinet
  box([-8.75, 1.0, 5.4], [0.25, 0.25, 0.22], '#9fd3e6', { furn: true }); // tank on half of it
  furn(-6.5, 5.82, 1.8, 0.3, 0.5, '#f0e4d0');                // window sill bench
  furn(-1.0, 0.6, 0.4, 0.4, 0.9, '#d9b48a');                 // scratch post
  // kitchen
  furn(4.5, 5.7, 7, 0.6, 0.92, '#f1ece2');                   // counters
  furn(8.6, 5.6, 0.7, 0.7, 1.9, '#e9eef0');                  // fridge
  furn(4.5, 3.6, 1.4, 0.8, 0.75, '#c08a5c');                 // dining table
  furn(8.3, 2.6, 0.45, 0.35, 0.35, '#7aa0c4');               // carrier
  box([1.0, 0.03, 2.6], [0.2, 0.03, 0.12], '#e58b6d', { collide: false }); // food bowls
  // hallway
  furn(7.5, 0.25, 0.8, 0.3, 0.4, '#a8835f');                 // shoe rack
  box([6.5, 1.6, 1.95], [0.2, 0.25, 0.04], '#9aa3ad', { collide: false }); // fuse box
  // bathroom
  furn(-2.1, -5.5, 1.6, 0.8, 0.55, '#f7f7f4');               // tub
  furn(1.5, -5.5, 0.4, 0.6, 0.45, '#f7f7f4');                // toilet
  furn(-2.7, -1.2, 0.5, 0.6, 0.85, '#f7f7f4');               // sink
  furn(1.6, -2.5, 0.6, 0.6, 0.85, '#e9eef0');                // washing machine
  box([-0.2, 0.08, -3], [0.3, 0.08, 0.22], '#7aa0c4', { collide: false }); // litter box
  // bedroom
  box([-7.95, 0.55, -3.5], [1.0, 0.07, 0.9], '#f2efe9', { furn: true });  // mattress slab (cats fit under)
  colliders.push({ center: [-7.95, 0.24, -3.5], half: [1.0, 0.24, 0.9], tag: 'catOnly' }); // sitter can't go under
  box([-7.95, 0.24, -3.5], [0.98, 0.24, 0.88], '#6b4f3a', { collide: false }).material = toon('#4a3a30', { transparent: true, opacity: 0.35 });
  furn(-8.7, -4.8, 0.45, 0.45, 0.55, '#c08a5c');             // nightstand
  furn(-8.7, -2.2, 0.45, 0.45, 0.55, '#c08a5c');             // nightstand
  furn(-4.0, -5.65, 1.4, 0.6, 2.0, '#b48a64');               // wardrobe
  colliders.push({ center: [-6, 0.005, -3.5], half: [1.3, 0.005, 1.0], tag: 'rug' });
  box([-6, 0.006, -3.5], [1.3, 0.006, 1.0], '#b9c6e8', { collide: false });
  furn(-3.6, -0.7, 0.5, 0.4, 0.45, '#e2cfa8');               // laundry basket
  // office
  furn(5.5, -5.6, 2.0, 0.7, 0.75, '#c08a5c');                // desk
  furn(5.5, -4.6, 0.5, 0.5, 0.48, '#6b7f99');                // chair
  furn(8.7, -3, 0.35, 1.4, 1.5, '#a8835f');                  // shelf
  furn(8.6, -1.8, 0.5, 0.6, 0.7, '#a8835f');                 // low cabinet (step to shelf)
  furn(2.5, -0.6, 0.35, 0.35, 0.4, '#c4704f');               // office plant

  // ---------------------------------------------------------------- doors
  const doors: DoorDef[] = [
    { id: 'bedroomDoor', hinge: [-5.5, 0, 0], width: 1, height: 2.1, closedYaw: 0, openYaw: Math.PI / 2 },
    { id: 'bathroomDoor', hinge: [0.4, 0, 0], width: 1, height: 2.1, closedYaw: 0, openYaw: Math.PI / 2 },
    { id: 'officeDoor', hinge: [5, 0, 0], width: 1, height: 2.1, closedYaw: 0, openYaw: Math.PI / 2 },
  ];
  const doorPivots = new Map<DoorDef['id'], THREE.Group>();
  for (const d of doors) {
    const pivot = new THREE.Group();
    pivot.position.set(...d.hinge);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(d.width - 0.04, d.height, 0.05), toon('#f4efe6'));
    panel.position.set(d.width / 2, d.height / 2, 0);
    panel.castShadow = true;
    pivot.add(panel);
    pivot.rotation.y = d.openYaw;
    group.add(pivot);
    doorPivots.set(d.id, pivot);
  }

  // ---------------------------------------------------------------- spots
  const S = (id: Spot['id'], pos: Vec3, facing: number, room: RoomId, radius = 1.0): Spot => ({ id, pos, facing, room, radius });
  const spots: Spot[] = [
    S('tv', [-7.7, 0, 3], -Math.PI / 2, 'living', 1.2),
    S('sofa', [-5.2, 0, 3.6], Math.PI / 2, 'living', 1.0),
    S('fishTank', [-8.25, 0.75, 5.4], -Math.PI / 2, 'living', 0.6),
    S('curtains', [-7.8, 0, 5.4], 0, 'living', 0.8),
    S('window', [-6.5, 0.5, 5.8], 0, 'living', 0.7),
    S('plant', [-0.6, 0, 4.7], 0, 'living', 0.9),
    S('scratchPost', [-1.0, 0, 1.2], Math.PI, 'living', 0.8),
    S('salmon', [2.5, 0.92, 5.6], 0, 'kitchen', 0.6),
    S('sink', [4.0, 0, 5.0], 0, 'kitchen', 1.0),
    S('foodBowl', [1.0, 0, 3.1], Math.PI, 'kitchen', 0.8),
    S('carrier', [7.7, 0, 2.6], Math.PI / 2, 'kitchen', 1.1),
    S('frontDoor', [8.3, 0, 1], Math.PI / 2, 'hallway', 1.0),
    S('shoes', [7.5, 0, 0.75], Math.PI, 'hallway', 0.8),
    S('fuseBox', [6.5, 0, 1.4], 0, 'hallway', 0.9),
    S('tubFaucet', [-1.0, 0, -5.3], -Math.PI / 2, 'bathroom', 0.9),
    S('tpRoll', [1.0, 0, -4.9], Math.PI / 2, 'bathroom', 0.8),
    S('litterBox', [-0.2, 0, -2.4], Math.PI, 'bathroom', 0.9),
    S('pillow', [-8.4, 0.62, -3.5], -Math.PI / 2, 'bedroom', 0.7),
    S('hideout', [-7.9, 0, -3.5], -Math.PI / 2, 'bedroom', 0.8),
    S('laundry', [-3.6, 0, -1.3], 0, 'bedroom', 0.8),
    S('laptop', [5.5, 0.75, -5.4], Math.PI, 'office', 0.6),
    S('bathroomDoor', [0.9, 0, 0], 0, 'hallway', 1.3),
    S('bedroomDoor', [-5, 0, 0], 0, 'living', 1.3),
    S('officeDoor', [5.5, 0, 0], 0, 'hallway', 1.3),
  ];

  // ---------------------------------------------------------------- props (pos = resting contact point)
  const P = (kind: PropSpawn['kind'], x: number, y: number, z: number, rotY = 0): PropSpawn => ({ kind, pos: [x, y, z], rotY });
  const props: PropSpawn[] = [
    P('mug', -6.75, 0.45, 2.75), P('remote', -6.5, 0.45, 3.2, 0.4), P('book', -6.7, 0.45, 3.3, 1.2), P('candle', -6.45, 0.45, 2.7),
    P('lamp', -4.4, 0.6, 5.3), P('frame', -4.45, 0.6, 0.6, 0.3), P('vase', -4.35, 0.6, 0.7),
    P('book', -2.5, 1.2, 5.75), P('book', -2.2, 1.2, 5.75, 0.2), P('trophy', -1.5, 1.2, 5.75),
    P('plantPot', -8.65, 0.5, 2.4), P('frame', -8.65, 0.5, 3.65, Math.PI / 2), P('plantPot', -6.0, 0.5, 5.82),
    P('yarn', -5.8, 0, 1.6), P('toyMouse', -3.0, 0, 2.2),
    P('mug', 1.6, 0.92, 5.65), P('glass', 3.2, 0.92, 5.6), P('plate', 5.0, 0.92, 5.65), P('wineBottle', 6.6, 0.92, 5.6),
    P('cerealBox', 7.3, 0.92, 5.7), P('bowl', 3.6, 0.92, 5.55), P('glass', 5.6, 0.92, 5.5),
    P('plate', 4.2, 0.75, 3.5), P('glass', 4.7, 0.75, 3.75), P('cucumber', 4.9, 0.75, 3.4, 0.7),
    P('salmon', 2.5, 0.92, 5.75, Math.PI / 2),
    P('mug', 4.9, 0.75, -5.6), P('phone', 6.1, 0.75, -5.5), P('book', 6.4, 0.75, -5.75, 0.5),
    P('trophy', 8.7, 1.5, -3.3), P('book', 8.7, 1.5, -2.7, Math.PI / 2),
    P('lamp', -8.7, 0.55, -4.8), P('glass', -8.7, 0.55, -2.2),
    P('pillow', -8.55, 0.62, -3.95, Math.PI / 2), P('pillow', -8.55, 0.62, -3.05, Math.PI / 2), P('sock', -6.2, 0, -1.2),
    P('tpRoll', -1.5, 0.55, -5.3), P('glass', -2.7, 0.85, -1.2),
    P('shoe', 7.3, 0.4, 0.25), P('shoe', 7.7, 0.4, 0.25),
  ];

  // ---------------------------------------------------------------- nav graph
  const nodes: NavNode[] = [];
  const links: NavLink[] = [];
  const node = (p: Vec3) => { nodes.push({ id: nodes.length, pos: p }); return nodes.length - 1; };
  const link = (a: number, b: number, kind: NavLink['kind'] = 'walk', extra: Partial<NavLink> = {}) => links.push({ a, b, kind, ...extra });
  const blocked = (x: number, z: number) => furniture.some((b) => b.half[1] * 2 > 0.1 && Math.abs(x - b.center[0]) < b.half[0] + 0.3 && Math.abs(z - b.center[2]) < b.half[2] + 0.3 && b.center[1] - b.half[1] < 0.3);
  const roomNodes = new Map<RoomId, number[]>();
  for (const r of rooms) {
    const ids: number[] = [];
    const grid = new Map<string, number>();
    const step = 1.4;
    for (let x = r.min[0] + 0.6; x <= r.max[0] - 0.5; x += step) {
      for (let z = r.min[2] + 0.6; z <= r.max[2] - 0.5; z += step) {
        if (blocked(x, z)) continue;
        const id = node([x, 0, z]);
        grid.set(`${Math.round((x - r.min[0]) / step)},${Math.round((z - r.min[2]) / step)}`, id);
        ids.push(id);
      }
    }
    for (const [k, id] of grid) {
      const [i, j] = k.split(',').map(Number);
      for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const o = grid.get(`${i + di},${j + dj}`);
        if (o !== undefined) link(id, o);
      }
    }
    roomNodes.set(r.id, ids);
  }
  const nearestIn = (room: RoomId, p: Vec3, n = 1) =>
    [...(roomNodes.get(room) ?? [])].sort((a, b) => Math.hypot(nodes[a].pos[0] - p[0], nodes[a].pos[2] - p[2]) - Math.hypot(nodes[b].pos[0] - p[0], nodes[b].pos[2] - p[2])).slice(0, n);
  const portal = (a: Vec3, ra: RoomId, b: Vec3, rb: RoomId, door?: DoorDef['id']) => {
    const na = node(a), nb = node(b);
    link(na, nb, 'walk', door ? { door } : {});
    for (const o of nearestIn(ra, a, 2)) link(na, o);
    for (const o of nearestIn(rb, b, 2)) link(nb, o);
  };
  portal([-0.6, 0, 1], 'living', [0.6, 0, 1], 'hallway');
  portal([-0.6, 0, 4.3], 'living', [0.6, 0, 4.3], 'kitchen');
  portal([3.8, 0, 1.3], 'hallway', [3.8, 0, 2.7], 'kitchen');
  portal([-5, 0, 0.6], 'living', [-5, 0, -0.6], 'bedroom', 'bedroomDoor');
  portal([0.9, 0, 0.6], 'hallway', [0.9, 0, -0.6], 'bathroom', 'bathroomDoor');
  portal([5.5, 0, 0.6], 'hallway', [5.5, 0, -0.6], 'office', 'officeDoor');
  // surfaces: jump links from the nearest floor node (catOnly when > 0.5 m rise)
  const surface = (room: RoomId, p: Vec3, from?: number) => {
    const id = node(p);
    const base = from ?? nearestIn(room, p, 1)[0];
    if (base !== undefined) link(id, base, 'jump', Math.abs(p[1] - nodes[base].pos[1]) > 0.5 ? { catOnly: true } : {});
    return id;
  };
  const sofa = surface('living', [-4.6, 0.45, 3]);
  surface('living', [-4.05, 0.9, 3], sofa);
  surface('living', [-6.6, 0.45, 2.6]);
  const stN = surface('living', [-4.4, 0.6, 5.3]);
  surface('living', [-2.6, 1.2, 5.75], stN);
  surface('living', [-4.4, 0.6, 0.6]);
  surface('living', [-8.6, 0.5, 2.3]);
  surface('living', [-8.25, 0.75, 5.4]);
  surface('living', [-6.5, 0.5, 5.75]);
  const counter = [1.5, 3.0, 4.5, 6.0, 7.5].map((x) => surface('kitchen', [x, 0.92, 5.55]));
  counter.forEach((id, i) => i && link(counter[i - 1], id));
  surface('kitchen', [4.5, 0.75, 3.6]);
  surface('kitchen', [8.3, 0.35, 2.6]);
  surface('hallway', [7.5, 0.4, 0.35]);
  surface('bathroom', [-2.1, 0.55, -5.4]);
  surface('bathroom', [1.6, 0.85, -2.5]);
  surface('bathroom', [-2.7, 0.85, -1.2]);
  const bed = surface('bedroom', [-7.6, 0.62, -3.5]);
  surface('bedroom', [-8.4, 0.62, -3.5], bed);
  const under = node([-7.9, 0, -3.5]);
  for (const o of nearestIn('bedroom', [-6.8, 0, -3.5], 1)) link(under, o, 'walk', { catOnly: true });
  surface('bedroom', [-8.7, 0.55, -4.8]);
  surface('bedroom', [-8.7, 0.55, -2.2]);
  surface('bedroom', [-3.6, 0.45, -0.7]);
  const chair = surface('office', [5.5, 0.48, -4.6]);
  surface('office', [5.5, 0.75, -5.4], chair);
  const cab = surface('office', [8.5, 0.7, -1.8]);
  surface('office', [8.7, 1.5, -2.8], cab);

  // ---------------------------------------------------------------- visuals API
  const sofaMat = sofaSeat.material as THREE.MeshToonMaterial;
  const tvMat = tvScreen.material as THREE.MeshBasicMaterial;
  let tvTex: THREE.Texture | null = null;
  let tvOn = false;
  const doorTarget = new Map<DoorDef['id'], number>(doors.map((d) => [d.id, 1]));
  const applyTv = () => {
    tvMat.map = tvOn ? tvTex : null;
    tvMat.color.set(tvOn ? '#ffffff' : '#15151a');
    tvMat.needsUpdate = true;
  };

  return {
    group, colliders, props, spots, doors, rooms,
    nav: { nodes, links },
    spawns: {
      sitter: [3.5, 0, 1],
      cats: [[-6, 0, 1.5], [-5.5, 0, 4.8], [2, 0, 3.2], [-2, 0, 3.0]],
    },
    sunPatches: [{ center: [-6.5, 0, 4.6], radius: 1.1 }],
    setDoorOpen(id, open01) { doorTarget.set(id, open01); },
    setVisual(key: string, value: WorldVisualValue) {
      if (key === 'tv.on') { tvOn = !!value; applyTv(); }
      else if (key === 'sofa.shred') sofaMat.color.set(['#9fb8a8', '#93a796', '#869583', '#77806e'][Number(value)] ?? '#77806e');
      else if (key === 'plant.dug') leaves.scale.setScalar(value ? 0.8 : 1);
    },
    update(dt) {
      for (const d of doors) {
        const p = doorPivots.get(d.id)!;
        const target = d.closedYaw + (d.openYaw - d.closedYaw) * (doorTarget.get(d.id) ?? 1);
        p.rotation.y += (target - p.rotation.y) * Math.min(1, dt * 10);
      }
    },
    setTvTexture(tex) { tvTex = tex; applyTv(); },
  };
}
