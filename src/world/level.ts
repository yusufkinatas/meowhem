/**
 * The real house (DESIGN §7, ADDENDUM M22): procedural architecture (walls with openings, baseboards, casings,
 * canvas-textured floors, ceiling) + every piece of furniture from downloaded models, tight colliders, ~75 props,
 * spots, spawns, sun patches and a generated nav graph. World visual keys are delegated to ./visuals via LevelRefs.
 *
 *  z=6.6 +----------------- window -+------- window ---------+
 *        |  LIVING  x -9..0         |  KITCHEN  x 0..9        |
 *        |  TV  rug  sofa           arch  counters  fridge    |
 *        |                          |      table              |
 *   z=3  |                         arch----------arch---------+
 *        |  armchair   cat tree     |  HALLWAY z 0..3 (camera room) front door (x = 9)
 *   z=0  +----door-------+----------+-door--+-door------------+
 *        | BEDROOM       | BATHROOM         | OFFICE          |
 *        | x -9..-3      | x -3..2          | x 2..9          |
 *   z=-6 +---------------+------------------+-----------------+
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type {
  BoxCollider, DoorDef, LevelData, PropKind, PropSpawn, RoomDef, RoomId, Spot, SpotId, Vec3, WorldVisualValue,
} from '../shared/contracts';
import { cloneModel, hasModel, modelInfo } from '../assets/loader';
import { gradientMap, toon } from '../shared/toon';
import type { LevelRefs, RefKey, WorldVisuals } from './refs';
import { createWorldVisuals } from './visuals';
import { buildNav, checkNav, type Portal, type Surface } from './nav';
import { surfaceTexture, TILE_M, type SurfaceKind } from './textures';
import { artTexture } from './art';

const H = 2.6;      // wall height
const HT = 0.075;   // wall half thickness
const PI = Math.PI, toN = 0, toS = PI, toE = PI / 2, toW = -PI / 2;
const NZ = 6.6;     // north exterior wall
const HZ = 3;       // hallway / kitchen wall: a 3 m hallway leaves the sitter's camera room in front of the south doors
const DOOR_H = 2.25, ARCH_H = 2.3; // tall enough for the sitter's camera boom to pass under the lintel

// ---------------------------------------------------------------- rooms
const ROOMS: RoomDef[] = [
  { id: 'living', name: 'Living room', min: [-9, 0, 0], max: [0, H, NZ] },
  { id: 'kitchen', name: 'Kitchen', min: [0, 0, HZ], max: [9, H, NZ] },
  { id: 'hallway', name: 'Hallway', min: [0, 0, 0], max: [9, H, HZ] },
  { id: 'bedroom', name: 'Bedroom', min: [-9, 0, -6], max: [-3, H, 0] },
  { id: 'bathroom', name: 'Bathroom', min: [-3, 0, -6], max: [2, H, 0] },
  { id: 'office', name: 'Office', min: [2, 0, -6], max: [9, H, 0] },
];
const WALL_COLOR: Record<RoomId, string> = {
  living: '#f4e5cc', kitchen: '#e3ead2', hallway: '#f1d9c2', bathroom: '#d8ecea', bedroom: '#f1d6cc', office: '#e8e0c8',
};
const FLOOR: Record<RoomId, SurfaceKind> = {
  living: 'wood', kitchen: 'kitchenTile', hallway: 'herring', bathroom: 'bathTile', bedroom: 'wood', office: 'woodDark',
};
const TRIM = '#fbf5ea', WALL_TOP = '#5a4636', OUTSIDE = '#efdfc8';

export function roomAt(x: number, z: number): RoomId | null {
  for (const r of ROOMS) if (x >= r.min[0] && x <= r.max[0] && z >= r.min[2] && z <= r.max[2]) return r.id;
  return null;
}

// ---------------------------------------------------------------- walls (centerlines) + openings
type OpKind = 'door' | 'arch' | 'window' | 'front';
interface Op { a: number; b: number; y0: number; y1: number; kind: OpKind; key?: RefKey }
/** axis 'x': runs along x at z = at. axis 'z': runs along z at x = at. */
interface Wall { axis: 'x' | 'z'; at: number; from: number; to: number; ops?: Op[] }
const win = (a: number, b: number, y0: number, y1: number, key?: RefKey): Op => ({ a, b, y0, y1, kind: 'window', key });
const door = (a: number, b: number): Op => ({ a, b, y0: 0, y1: DOOR_H, kind: 'door' });
const arch = (a: number, b: number): Op => ({ a, b, y0: 0, y1: ARCH_H, kind: 'arch' });
const E = 9 + HT;
const WALLS: Wall[] = [
  // exterior
  { axis: 'x', at: NZ, from: -E, to: 0, ops: [win(-7.2, -5.0, 0.25, 2.25, 'livingWindow')] },
  { axis: 'x', at: NZ, from: 0, to: E, ops: [win(3.1, 4.25, 1.15, 2.05)] },
  { axis: 'x', at: -6, from: -E, to: -3 },
  { axis: 'x', at: -6, from: -3, to: 2, ops: [win(-1.1, -0.1, 1.55, 2.1)] },
  { axis: 'x', at: -6, from: 2, to: E, ops: [win(4.6, 6.2, 0.95, 2.1)] },
  { axis: 'z', at: -9, from: -6 - HT, to: 0, ops: [win(-2.25, -0.95, 0.95, 2.1)] },
  { axis: 'z', at: -9, from: 0, to: NZ + HT },
  { axis: 'z', at: 9, from: -6 - HT, to: 0, ops: [win(-3.9, -2.5, 0.95, 2.1)] },
  { axis: 'z', at: 9, from: 0, to: HZ, ops: [{ a: 1.05, b: 1.95, y0: 0, y1: 2.2, kind: 'front' }] },
  { axis: 'z', at: 9, from: HZ, to: NZ + HT },
  // interior
  { axis: 'x', at: 0, from: -9, to: -3, ops: [door(-4.22, -3.22)] },
  { axis: 'x', at: 0, from: -3, to: 0 },
  { axis: 'x', at: 0, from: 0, to: 2, ops: [door(0.8, 1.8)] },
  { axis: 'x', at: 0, from: 2, to: 9, ops: [door(2.2, 3.2)] },
  { axis: 'z', at: 0, from: 0, to: HZ, ops: [arch(0.95, 2.55)] },
  { axis: 'z', at: 0, from: HZ, to: NZ, ops: [arch(3.8, 5.4)] },
  { axis: 'x', at: HZ, from: 0, to: 9, ops: [arch(5.0, 6.8)] },
  { axis: 'z', at: -3, from: -6, to: 0 },
  { axis: 'z', at: 2, from: -6, to: 0 },
];

const DOORS: DoorDef[] = [
  { id: 'bedroomDoor', hinge: [-3.22, 0, 0], width: 1, height: DOOR_H, closedYaw: PI, openYaw: PI / 2 },
  { id: 'bathroomDoor', hinge: [1.8, 0, 0], width: 1, height: DOOR_H, closedYaw: PI, openYaw: PI / 2 },
  { id: 'officeDoor', hinge: [2.2, 0, 0], width: 1, height: DOOR_H, closedYaw: 0, openYaw: PI / 2 },
];

// ---------------------------------------------------------------- merged vertex-colored architecture
class Mesher {
  p: number[] = []; n: number[] = []; c: number[] = [];
  private quad(v: number[][], nrm: Vec3, col: THREE.Color) {
    for (const i of [0, 1, 2, 0, 2, 3]) { this.p.push(...v[i]); this.n.push(...nrm); this.c.push(col.r, col.g, col.b); }
  }
  /** axis-aligned box; color(face) returns null to skip that face */
  box(a: Vec3, b: Vec3, color: (axis: 0 | 1 | 2, sign: 1 | -1) => THREE.Color | null) {
    const [x0, y0, z0] = a, [x1, y1, z1] = b;
    const f = (axis: 0 | 1 | 2, sign: 1 | -1, v: number[][]) => {
      const col = color(axis, sign);
      if (col) this.quad(v, [axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0], col);
    };
    f(0, 1, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]);
    f(0, -1, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
    f(1, 1, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]);
    f(1, -1, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
    f(2, 1, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
    f(2, -1, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]);
  }
  mesh(): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    const m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap() }));
    m.castShadow = m.receiveShadow = true;
    return m;
  }
}

const colorCache = new Map<string, THREE.Color>();
const col = (hex: string) => { let c = colorCache.get(hex); if (!c) colorCache.set(hex, (c = new THREE.Color(hex))); return c; };

// ---------------------------------------------------------------- the build
type LB = [number, number, number, number, number, number, string?]; // local box: min xyz, max xyz, tag
interface PutOpts {
  y?: number; s?: Vec3 | number; ref?: RefKey;
  /** local colliders, 'full' = manifest size box */
  box?: LB[] | 'full';
  /** local points cats can stand on (nav surfaces) */
  surf?: Vec3[];
  /** called on the clone before it is placed (geometry tweaks) */
  prep?: (o: THREE.Group) => void;
}

export function buildHouse(): LevelData {
  const group = new THREE.Group();
  group.name = 'house';
  const colliders: BoxCollider[] = [];
  const surfaces: Surface[] = [];
  const objects = new Map<RefKey, THREE.Object3D>();
  const lampMeshes: THREE.Mesh[] = [];
  const houseLights: THREE.Light[] = [];
  const portals: Portal[] = [];
  const mesher = new Mesher();

  const roomColor = (x: number, z: number) => { const r = roomAt(x, z); return col(r ? WALL_COLOR[r] : OUTSIDE); };
  const addBox = (min: Vec3, max: Vec3, tag?: string, rotY?: number) => {
    colliders.push({
      center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
      half: [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2], tag, rotY,
    });
  };

  // ---- walls
  const windowsToPlace: { w: Wall; o: Op }[] = [];
  const tiles: { w: Wall; sign: number; a: number; b: number; y0: number; y1: number }[] = [];
  for (const w of WALLS) {
    const toBox = (a: number, b: number, y0: number, y1: number, inset = 0): [Vec3, Vec3] => w.axis === 'x'
      ? [[a, y0, w.at - HT - inset], [b, y1, w.at + HT + inset]]
      : [[w.at - HT - inset, y0, a], [w.at + HT + inset, y1, b]];
    const along: 0 | 2 = w.axis === 'x' ? 0 : 2;
    const piece = (a: number, b: number, y0: number, y1: number) => {
      const [mn, mx] = toBox(a, b, y0, y1);
      addBox(mn, mx, 'wall');
      mesher.box(mn, mx, (axis, sign) => {
        if (axis === 1) return sign > 0 ? (y1 >= H - 0.001 ? col(WALL_TOP) : col(TRIM)) : y0 > 0 ? col(TRIM) : null;
        if (axis === along) return col(TRIM);
        const mid = (a + b) / 2, off = sign * (HT + 0.25);
        return w.axis === 'x' ? roomColor(mid, w.at + off) : roomColor(w.at + off, mid);
      });
      // baseboards on room-facing sides (bathroom: a tiled band instead)
      if (y0 === 0) for (const sign of [1, -1] as const) {
        const mid = (a + b) / 2;
        const inside = w.axis === 'x' ? roomAt(mid, w.at + sign * 0.3) : roomAt(w.at + sign * 0.3, mid);
        if (!inside) continue;
        if (inside === 'bathroom') tiles.push({ w, sign, a, b, y0: 0, y1: Math.min(1.25, y1) });
        const f = w.at + sign * HT, g = f + sign * 0.014;
        const [p, q]: [Vec3, Vec3] = w.axis === 'x'
          ? [[a, 0, Math.min(f, g)], [b, 0.09, Math.max(f, g)]]
          : [[Math.min(f, g), 0, a], [Math.max(f, g), 0.09, b]];
        mesher.box(p, q, () => col(TRIM));
      }
    };
    /** flat trim strip on a wall face: span along [a,b], height [y0,y1], proud d */
    const trim = (sign: number, a: number, b: number, y0: number, y1: number, d = 0.018, dz0 = 0) => {
      const f = w.at + sign * (HT + dz0), g = f + sign * d;
      const [p, q]: [Vec3, Vec3] = w.axis === 'x'
        ? [[a, y0, Math.min(f, g)], [b, y1, Math.max(f, g)]]
        : [[Math.min(f, g), y0, a], [Math.max(f, g), y1, b]];
      mesher.box(p, q, () => col(TRIM));
    };
    const ops = [...(w.ops ?? [])].sort((p, q) => p.a - q.a);
    let cur = w.from;
    for (const o of ops) {
      if (o.a > cur) piece(cur, o.a, 0, H);
      if (o.y1 < H) piece(o.a, o.b, o.y1, H);
      if (o.y0 > 0) piece(o.a, o.b, 0, o.y0);
      const sides = [1, -1].filter((sg) => (w.axis === 'x' ? roomAt((o.a + o.b) / 2, w.at + sg * 0.3) : roomAt(w.at + sg * 0.3, (o.a + o.b) / 2)));
      if (o.kind === 'window') {
        windowsToPlace.push({ w, o });
        const [mn, mx] = toBox(o.a, o.b, o.y0, o.y1);
        addBox(mn, mx, 'wall'); // glass: nobody leaves through a window
        for (const sg of sides) {
          trim(sg, o.a - 0.07, o.a, o.y0 - 0.05, o.y1 + 0.07);
          trim(sg, o.b, o.b + 0.07, o.y0 - 0.05, o.y1 + 0.07);
          trim(sg, o.a - 0.07, o.b + 0.07, o.y1, o.y1 + 0.07);
          trim(sg, o.a - 0.1, o.b + 0.1, o.y0 - 0.05, o.y0, 0.07); // sill
        }
      } else {
        for (const sg of [1, -1]) {
          trim(sg, o.a - 0.075, o.a, 0, o.y1 + 0.075);
          trim(sg, o.b, o.b + 0.075, 0, o.y1 + 0.075);
          trim(sg, o.a - 0.075, o.b + 0.075, o.y1, o.y1 + 0.075);
        }
        if (o.kind === 'front') { const [mn, mx] = toBox(o.a, o.b, 0, o.y1); addBox(mn, mx, 'wall'); }
        else {
          // portal nodes either side of the opening (door links carry the door id)
          const mid = (o.a + o.b) / 2;
          const P = (sg: number): Vec3 => (w.axis === 'x' ? [mid, 0, w.at + sg * 0.5] : [w.at + sg * 0.5, 0, mid]);
          const ra = roomAt(P(1)[0], P(1)[2]), rb = roomAt(P(-1)[0], P(-1)[2]);
          const d = DOORS.find((dd) => Math.abs((w.axis === 'x' ? dd.hinge[0] : dd.hinge[2]) - o.a) < 0.05 || Math.abs((w.axis === 'x' ? dd.hinge[0] : dd.hinge[2]) - o.b) < 0.05);
          if (ra && rb) portals.push({ a: P(1), b: P(-1), ra, rb, door: o.kind === 'door' ? d?.id : undefined });
        }
      }
      cur = o.b;
    }
    if (w.to > cur) piece(cur, w.to, 0, H);
  }
  const archMesh = mesher.mesh();
  archMesh.name = 'architecture';
  group.add(archMesh);
  // tiled surfaces on walls: bathroom wainscot + kitchen backsplash (canvas texture, world-space UVs)
  const backsplash = [{ w: WALLS[1], sign: -1, a: 1.875, b: 3.1, y0: 0.92, y1: 1.5 }, { w: WALLS[1], sign: -1, a: 3.1, b: 4.25, y0: 0.92, y1: 1.12 },
    { w: WALLS[1], sign: -1, a: 4.25, b: 8.925, y0: 0.92, y1: 1.5 }, { w: WALLS[9], sign: -1, a: 4.275, b: 6.525, y0: 0.92, y1: 1.5 }];
  for (const [list, kind] of [[tiles, 'wallTile'], [backsplash, 'kitchenTile']] as const) {
    const geos: THREE.BufferGeometry[] = [];
    for (const t of list) {
      const len = t.b - t.a, h = t.y1 - t.y0, f = t.w.at + t.sign * (HT + 0.004);
      const g = new THREE.PlaneGeometry(len, h);
      // plane faces +z; turn it to face the room
      if (t.w.axis === 'x') { if (t.sign < 0) g.rotateY(PI); g.translate((t.a + t.b) / 2, (t.y0 + t.y1) / 2, f); }
      else { g.rotateY(t.sign > 0 ? PI / 2 : -PI / 2); g.translate(f, (t.y0 + t.y1) / 2, (t.a + t.b) / 2); }
      const pos = g.attributes.position, uv = g.attributes.uv, tm = kind === 'kitchenTile' ? 0.6 : TILE_M[kind];
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (t.w.axis === 'x' ? pos.getX(i) : pos.getZ(i)) / tm, pos.getY(i) / tm);
      geos.push(g);
    }
    const merged = geos.length ? mergeGeometries(geos, false) : null;
    if (!merged) continue;
    const m = new THREE.Mesh(merged, toon('#ffffff', { map: surfaceTexture(kind) }));
    m.receiveShadow = true;
    m.name = `tiles:${kind}`;
    group.add(m);
  }

  // ---- floors, ceiling, outdoor ground
  for (const r of ROOMS) {
    const w = r.max[0] - r.min[0], d = r.max[2] - r.min[2];
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-PI / 2);
    g.translate((r.min[0] + r.max[0]) / 2, 0, (r.min[2] + r.max[2]) / 2);
    const pos = g.attributes.position, uv = g.attributes.uv, t = TILE_M[FLOOR[r.id]];
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / t, -pos.getZ(i) / t);
    const m = new THREE.Mesh(g, toon('#ffffff', { map: surfaceTexture(FLOOR[r.id]) }));
    m.receiveShadow = true;
    m.name = `floor:${r.id}`;
    group.add(m);
  }
  {
    const g = new THREE.PlaneGeometry(18.2, 12.2 + NZ - 6);
    g.rotateX(PI / 2);
    g.translate(0, H, (NZ - 6) / 2);
    const ceiling = new THREE.Mesh(g, toon('#fbf1e3', { emissive: '#fff4e6', emissiveIntensity: 0.25 }));
    ceiling.name = 'ceiling';
    group.add(ceiling);
    const gg = new THREE.PlaneGeometry(90, 90);
    gg.rotateX(-PI / 2);
    const uv = gg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 15, uv.getY(i) * 15);
    const ground = new THREE.Mesh(gg, toon('#ffffff', { map: surfaceTexture('grass') }));
    ground.position.y = -0.03;
    ground.receiveShadow = true;
    ground.name = 'ground';
    group.add(ground);
  }
  colliders.push({ center: [0, -0.25, (NZ - 6) / 2], half: [9.6, 0.25, 6.6 + (NZ - 6) / 2], tag: 'floor' });
  colliders.push({ center: [0, H + 0.2, (NZ - 6) / 2], half: [9.6, 0.2, 6.6 + (NZ - 6) / 2], tag: 'ceiling' });

  // ---- model placement
  const statics: THREE.Object3D[] = [];
  const glass = new THREE.MeshPhysicalMaterial({ name: 'Glass', color: '#cfe9f3', transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, depthWrite: false });
  function put(key: string, x: number, z: number, yaw: number, o: PutOpts = {}): THREE.Group | null {
    if (!hasModel(key)) { console.warn(`[level] missing model ${key}`); return null; }
    const m = cloneModel(key);
    o.prep?.(m);
    const y = o.y ?? 0;
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    if (o.s !== undefined) typeof o.s === 'number' ? m.scale.setScalar(o.s) : m.scale.set(...o.s);
    m.name = key;
    group.add(m);
    if (o.ref) objects.set(o.ref, m); else statics.push(m);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const W = (lx: number, ly: number, lz: number): Vec3 => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    const boxes: LB[] = o.box === 'full'
      ? (() => { const sz = modelInfo(key)!.size, sc = typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s ?? [1, 1, 1];
        return [[-sz[0] / 2 * sc[0], 0, -sz[2] / 2 * sc[2], sz[0] / 2 * sc[0], sz[1] * sc[1], sz[2] / 2 * sc[2]]] as LB[]; })()
      : o.box ?? [];
    const quarter = Math.abs(Math.round(yaw / (PI / 2)) * (PI / 2) - yaw) < 1e-6;
    const odd = quarter && Math.abs(Math.round(yaw / (PI / 2))) % 2 === 1;
    for (const b of boxes) {
      const ctr = W((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
      const hx = (b[3] - b[0]) / 2, hy = (b[4] - b[1]) / 2, hz = (b[5] - b[2]) / 2;
      colliders.push(quarter
        ? { center: ctr, half: odd ? [hz, hy, hx] : [hx, hy, hz], tag: b[6] ?? 'furniture' }
        : { center: ctr, half: [hx, hy, hz], rotY: yaw, tag: b[6] ?? 'furniture' });
    }
    for (const p of o.surf ?? []) {
      const w = W(...p);
      const room = roomAt(w[0], w[2]);
      if (room) surfaces.push({ p: w, room });
    }
    return m;
  }

  /** wall frame with a painted canvas on its picture surface */
  const artPlane = new THREE.PlaneGeometry(0.37, 0.47);
  const frame = (x: number, z: number, yaw: number, y: number, art: number, s = 1) =>
    put('wallFrame', x - Math.sin(yaw) * 0.05, z - Math.cos(yaw) * 0.05, yaw, {
      y, s,
      prep: (g) => {
        const m = new THREE.Mesh(artPlane, toon('#ffffff', { map: artTexture(art) }));
        m.position.set(0, 0.3, 0.027);
        m.receiveShadow = true;
        g.add(m);
      },
    });

  // windows (model scaled into each opening, glass made transparent)
  for (const { w, o } of windowsToPlace) {
    const size = modelInfo('window')?.size ?? [1.6, 1.483, 0.123];
    const mid = (o.a + o.b) / 2;
    const inside = w.axis === 'x' ? (roomAt(mid, w.at - 0.3) ? -1 : 1) : (roomAt(w.at - 0.3, mid) ? -1 : 1);
    const yaw = w.axis === 'x' ? (inside < 0 ? PI : 0) : (inside < 0 ? -PI / 2 : PI / 2);
    const [x, z] = w.axis === 'x' ? [mid, w.at] : [w.at, mid];
    put('window', x, z, yaw, {
      y: o.y0, s: [(o.b - o.a) / size[0], (o.y1 - o.y0) / size[1], 1], ref: o.key,
      prep: (g) => g.traverse((n) => {
        const mesh = n as THREE.Mesh;
        if (mesh.isMesh && (mesh.material as THREE.Material).name === 'Glass') { mesh.material = glass; mesh.castShadow = false; mesh.renderOrder = 2; }
      }),
    });
  }

  // ---------------------------------------------------------------- LIVING
  put('tvStand', -8.675, 3.3, toE, { box: 'full', surf: [[-0.42, 0.55, 0]] });
  put('tv', -8.7, 3.1, toE, { y: 0.55, ref: 'tv', box: [[-0.36, 0, -0.22, 0.36, 0.52, 0.22]], surf: [[0, 0.52, 0]] });
  put('wallShelf', -8.775, 3.3, toE, { y: 1.62, box: [[-0.6, 0, -0.15, 0.6, 0.12, 0.15], [-0.4, 0.12, -0.15, 0.48, 0.42, 0.05]] }); // board + its books
  put('rug', -6.9, 3.3, toE, { ref: 'livingRug' });
  colliders.push({ center: [-6.9, 0.01, 3.3], half: [0.9, 0.01, 1.3], tag: 'rug' });
  put('coffeeTable', -6.85, 3.3, toE, { box: 'full', surf: [[-0.3, 0.45, 0], [0.3, 0.45, 0]] });
  put('sofa', -5.25, 3.3, toW, {
    ref: 'sofa',
    box: [[-0.8, 0, -0.02, 0.8, 0.33, 0.53, 'soft'], [-0.8, 0, -0.27, 0.8, 0.55, -0.02], [-0.8, 0, -0.53, 0.8, 0.8, -0.27],
      [-1, 0, -0.53, -0.8, 0.66, 0.53], [0.8, 0, -0.53, 1, 0.66, 0.53]],
    surf: [[-0.45, 0.33, 0.25], [0.45, 0.33, 0.25], [0, 0.8, -0.4], [-0.9, 0.66, 0.1], [0.9, 0.66, 0.1]],
  });
  for (const z of [2.05, 4.55]) put('sideTable', -5.25, z, toW, { box: 'full', surf: [[0, 0.6, 0]] });
  // the two gathered panels + the rod: thin colliders so the camera never ends up inside the fabric
  put('curtains', -6.1, NZ - 0.21, toS, {
    s: [1.45, 1, 1], ref: 'curtains', prep: (g) => drawOpen(g, 0.45),
    box: [[-1.33, 0, -0.12, -0.78, 2.32, 0.12], [0.78, 0, -0.12, 1.33, 2.32, 0.12], [-0.78, 2.02, -0.12, 0.78, 2.32, 0.12]],
  });
  put('tvStand', -8.675, 5.75, toE, { box: 'full', surf: [[0.45, 0.55, 0]] }); // fish tank cabinet
  put('aquarium', -8.66, 5.95, toE, { y: 0.55, ref: 'aquarium', box: [[-0.45, 0, -0.29, 0.45, 0.62, 0.29]], surf: [[0, 0.62, 0]] });
  put('bookshelf', -3.95, 6.1, toE, { // open back, side to the wall: swiped books fly out the back
    box: [[-0.41, 0, -0.255, -0.37, 1.8, 0.255], [0.37, 0, -0.255, 0.41, 1.8, 0.255], [-0.41, 0, -0.255, 0.41, 0.27, 0.255],
      [-0.37, 0.6, -0.255, 0.37, 0.76, 0.255], [-0.37, 1.13, -0.255, 0.37, 1.25, 0.255], [-0.41, 1.6, -0.255, 0.41, 1.74, 0.255]],
  });
  // big plants: pot + a foliage block, so nobody walks through the leaves and the camera stops at them
  put('plant', -0.7, 5.9, toS, { ref: 'bigPlant', box: [[-0.28, 0, -0.28, 0.28, 1.1, 0.28]] });
  put('catTree', -0.6, 0.5, toW, {
    ref: 'catTree',
    box: [[-0.41, 0, 0.15, 0.41, 0.8, 0.45], [-0.41, 0, -0.45, 0.41, 1.46, 0.05], [-0.41, 0, -0.45, 0.41, 0.05, 0.45]],
    surf: [[0, 0.8, 0.3], [0, 1.46, -0.2]],
  });
  put('armchair', -8.05, 0.9, PI / 4, {
    box: [[-0.4, 0, -0.02, 0.4, 0.33, 0.53, 'soft'], [-0.4, 0, -0.27, 0.4, 0.55, -0.02], [-0.4, 0, -0.53, 0.4, 0.8, -0.27],
      [-0.6, 0, -0.53, -0.4, 0.66, 0.53], [0.4, 0, -0.53, 0.6, 0.66, 0.53]],
    surf: [[0, 0.33, 0.22]],
  });
  const lamp: PutOpts = { box: [[-0.05, 0, -0.05, 0.05, 1.2, 0.05], [-0.27, 1.2, -0.27, 0.27, 1.6, 0.27]] }; // pole + shade
  const lampL = put('floorLamp', -8.55, 2.3, toE, lamp);
  const tallPlant: PutOpts = { box: [[-0.3, 0, -0.28, 0.3, 1.25, 0.28]] };
  put('plantTall', -2.3, 0.5, toN, tallPlant);
  frame(-6.9, 0.125, toN, 1.25, 1);
  frame(-6.25, 0.125, toN, 1.15, 0, 0.8);
  frame(-0.125, 3.17, toW, 1.2, 2);

  // ---------------------------------------------------------------- KITCHEN (north run faces south, east run faces west)
  put('counterCorner', 8.4, 6.0, toS, { box: 'full', surf: [[0, 0.92, 0]] });
  put('counter', 7.275, 6.215, toS, { box: 'full', surf: [[0, 0.92, 0.05]] });
  put('stove', 6.075, 6.179, toS, { ref: 'stove', box: [[-0.6, 0, -0.346, 0.6, 0.92, 0.346], [-0.6, 0, -0.346, 0.6, 1.2, -0.22]], surf: [[0, 0.92, 0.15]] });
  put('counter', 4.875, 6.215, toS, { box: 'full', surf: [[0, 0.92, 0.05]] });
  // the manifest stretches the chunky sink 2.2x in height vs depth: the faucet stood 0.7 m tall (taller than a cat)
  put('kitchenSink', 3.675, 6.215, toS, { prep: (g) => squashAbove(g, 0.93, 0.5), box: [[-0.6, 0, -0.31, 0.6, 0.92, 0.31]], surf: [[0.38, 0.92, 0.12], [-0.38, 0.92, 0.12]] });
  put('counter', 2.475, 6.215, toS, { box: 'full', surf: [[0.2, 0.92, 0.05]] });
  put('counter', 8.615, 4.875, toW, { box: 'full', surf: [[0, 0.92, 0.05]] });
  put('fridge', 8.585, 3.816, toW, { ref: 'fridge', box: 'full', surf: [[0, 1.85, 0]] });
  put('extractorHood', 6.075, 6.189, toS, { y: 1.45, s: [1, 0.95, 1], box: 'full' }); // 0.53 above the hob: no cat wedges under it
  for (const x of [7.275, 4.875, 2.475]) put('wallCabinet', x, 6.325, toS, { y: 1.5, box: 'full' });
  put('wallCabinet', 8.725, 4.875, toW, { y: 1.5, box: 'full', surf: [[0, 0.6, 0]] });
  put('cuttingBoard', 2.3, 6.2, toS, { y: 0.92, box: 'full' });
  put('kettle', 7.45, 6.28, toS, { y: 0.92, box: 'full' });
  put('toaster', 8.7, 5.25, toW, { y: 0.92, box: 'full' });
  put('bread', 8.68, 4.55, toW, { y: 0.92, box: 'full' });
  put('diningTable', 3.4, 4.35, toN, {
    box: [[-0.6, 0.62, -0.45, 0.6, 0.75, 0.45], [-0.58, 0, -0.43, -0.48, 0.62, -0.33], [0.48, 0, -0.43, 0.58, 0.62, -0.33],
      [-0.58, 0, 0.33, -0.48, 0.62, 0.43], [0.48, 0, 0.33, 0.58, 0.62, 0.43]],
    surf: [[-0.45, 0.75, 0], [0.45, 0.75, 0], [0, 0.75, -0.3], [0, 0.75, 0.3]],
  });
  put('fruitBowl', 3.4, 4.55, toN, { y: 0.75, box: 'full' });
  const chair: PutOpts = { box: [[-0.25, 0, -0.12, 0.25, 0.36, 0.3], [-0.25, 0, -0.3, 0.25, 0.88, -0.12]], surf: [[0, 0.36, 0.1]] };
  put('chair', 2.45, 4.35, toE, chair);
  put('chair', 4.35, 4.35, toW, chair);
  put('chair', 3.05, 3.6, toN, chair);
  put('chair', 3.8, 3.6, toN, chair);
  put('foodBowl', 1.15, 6.2, toS, { ref: 'foodBowl' });
  put('carrier', 1.4, 3.45, toN, { ref: 'carrier', box: [[-0.31, 0, -0.23, 0.31, 0.36, 0.23]], surf: [[0, 0.36, 0]] });

  // ---------------------------------------------------------------- HALLWAY
  {
    const info = modelInfo('frontDoor');
    const pivot = new THREE.Group();
    pivot.name = 'frontDoorPivot';
    pivot.position.set(9, 0, 1.05);
    pivot.rotation.y = PI / 2;
    pivot.userData = { closedYaw: PI / 2, openYaw: PI / 2 - 1.45 };
    if (info && hasModel('frontDoor')) {
      const leaf = cloneModel('frontDoor');
      const sx = 0.9 / info.size[0];
      leaf.scale.set(sx, 2.2 / info.size[1], 0.65);
      leaf.position.x = -info.size[0] * sx / 2;
      pivot.add(leaf);
    }
    group.add(pivot);
    objects.set('frontDoor', pivot);
  }
  put('doormat', 8.45, 1.5, toW, {});
  put('shoeRack', 7.8, HZ - 0.2, toS, { box: [[-0.3, 0, -0.12, 0.3, 0.47, 0.12], [0.1, 0, -0.1, 0.3, 0.75, 0.1]], surf: [[-0.12, 0.47, 0]] });
  put('fuseBox', 7.8, HZ - 0.11, toS, { y: 1.05, ref: 'fuseBox', box: 'full' });
  put('boots', 7.2, HZ - 0.28, toS, { box: 'full' });
  put('coatRack', 8.5, HZ - 0.4, -2.4, { s: 0.8, box: [[-0.08, 0, -0.08, 0.08, 1.05, 0.08], [-0.28, 1.05, -0.28, 0.28, 1.4, 0.28]] });
  put('plantSmall', 4.7, HZ - 0.25, toS, { box: [[-0.14, 0, -0.12, 0.14, 0.3, 0.12]] });
  frame(4.3, 0.125, toN, 1.2, 4, 0.8);
  frame(5.0, 0.125, toN, 1.3, 3);
  frame(5.7, 0.125, toN, 1.2, 2, 0.8);

  // ---------------------------------------------------------------- BATHROOM
  put('bathtub', -2.0, -5.3, toE, {
    ref: 'bathtub',
    box: [[-0.42, 0, -0.62, 0.42, 0.035, 0.62], [-0.57, 0, -0.72, -0.42, 0.57, 0.72], [0.42, 0, -0.72, 0.57, 0.57, 0.72],
      [-0.45, 0, 0.62, 0.45, 0.57, 0.85], [-0.45, 0, -0.85, 0.45, 0.6, -0.6]],
    surf: [[0.5, 0.57, 0], [-0.5, 0.57, 0], [0, 0.6, -0.72], [0, 0.57, 0.74], [0, 0.035, 0.1]],
  });
  put('bathMat', -2.0, -4.35, toN, {});
  put('toilet', 1.45, -5.565, toN, { box: [[-0.2, 0, -0.15, 0.2, 0.42, 0.36], [-0.25, 0, -0.36, 0.25, 0.8, -0.15]], surf: [[0, 0.42, 0.12], [0, 0.8, -0.25]] });
  put('tpHolder', 1.88, -4.85, toW, { y: 0.62, ref: 'tpHolder' });
  // beside the toilet, not over it: a cat on the tank jumps up onto it instead of into its underside
  put('shelf', 0.6, -5.775, toN, { y: 1.28, box: [[-0.6, 0.2, -0.15, 0.6, 0.24, 0.15]], surf: [[0.35, 0.24, 0]] });
  // uniform 1.3: vanity 0.47, vessel bowl rim 0.72 (a cat sits in the bowl at 0.58)
  put('bathSink', -2.47, -3.2, toE, { s: 1.3, box: [[-0.6, 0, -0.455, 0.6, 0.47, 0.455], [-0.36, 0.47, -0.2, 0.36, 0.58, 0.42]], surf: [[0, 0.58, 0.1]] });
  put('mirror', -2.9, -3.2, toE, { y: 1.35 });
  put('washer', -2.54, -2.1, toE, { box: 'full', surf: [[0.1, 0.85, 0.1]] });
  put('towels', -2.6, -2.25, toE, { y: 0.85, box: 'full' });
  put('litterBox', -0.7, -0.45, toS, { ref: 'litterBox', box: [[-0.25, 0, -0.22, 0.25, 0.1, 0.22]] });
  put('plantSmall', -0.6, -5.65, toN, { box: [[-0.14, 0, -0.12, 0.14, 0.3, 0.12]] });

  // ---------------------------------------------------------------- BEDROOM
  put('bed', -7.875, -3.4, toE, {
    ref: 'bed',
    prep: (g) => stretchLegs(g, 0.072, 0.4),
    box: [[-1.03, 0.48, -0.8, 1.03, 0.76, 1.05, 'soft'], [-0.83, 0.48, -0.75, -0.13, 0.93, -0.27, 'soft'], [0.07, 0.48, -0.75, 0.87, 0.93, -0.27, 'soft'],
      [-1.08, 0.48, -1.05, 1.08, 1.1, -0.8], [-1.08, 0, -1.05, 1.08, 0.47, 1.05, 'catOnly'],
      [-1.08, 0, -1.05, -0.96, 0.48, -0.93], [0.96, 0, -1.05, 1.08, 0.48, -0.93], [-1.08, 0, 0.93, -0.96, 0.48, 1.05], [0.96, 0, 0.93, 1.08, 0.48, 1.05]],
    // nodes 0.15 m inside the edges: a bot jumps from ~0.8 m out, early enough to clear the open underside
    surf: [[0, 0.76, 0.9], [0.88, 0.76, 0.35], [-0.88, 0.76, 0.35], [0.88, 0.76, -0.3], [-0.88, 0.76, -0.3], [0, 0.76, 0.3]],
  });
  put('pillow', -7.95, -2.9, toE + 0.15, { y: 0.76 + 0.09, ref: 'bedPillow', box: [[-0.3, -0.09, -0.23, 0.3, 0.07, 0.23, 'soft']] });
  put('nightstand', -8.645, -4.8, toE, { box: 'full', surf: [[0, 0.55, 0]] });
  put('nightstand', -8.645, -2.0, toE, { box: 'full', surf: [[0, 0.55, 0]] });
  put('alarmClock', -8.7, -4.92, toE + 0.3, { y: 0.55, box: 'full' });
  put('rugRound', -5.75, -3.4, toE, { ref: 'bedroomRug' });
  colliders.push({ center: [-5.75, 0.01, -3.4], half: [0.7, 0.01, 1.0], tag: 'rug' });
  put('wardrobe', -5.3, -5.64, toN, { box: 'full' });
  put('laundryBasket', -3.45, -3.1, toW, { ref: 'laundryBasket', box: [[-0.26, 0, -0.2, 0.26, 0.2, 0.2]], surf: [[0, 0.2, 0]] });
  put('plantSmall', -3.45, -5.6, toN, { box: [[-0.14, 0, -0.12, 0.14, 0.3, 0.12]] });
  frame(-8.875, -3.4, toE, 1.35, 5);

  // ---------------------------------------------------------------- OFFICE
  put('desk', 5.4, -5.575, toN, {
    box: [[-0.7, 0.62, -0.35, 0.7, 0.75, 0.35], [-0.68, 0, -0.33, -0.58, 0.62, -0.23], [0.58, 0, -0.33, 0.68, 0.62, -0.23],
      [-0.68, 0, 0.23, -0.58, 0.62, 0.33], [0.58, 0, 0.23, 0.68, 0.62, 0.33]],
    surf: [[0.45, 0.75, 0.2], [-0.45, 0.75, 0.2], [0.05, 0.75, 0.2]],
  });
  put('laptop', 5.05, -5.66, toN, { y: 0.75, ref: 'laptop' });
  put('officeChair', 6.25, -4.65, PI + 0.6, { box: [[-0.25, 0, -0.15, 0.25, 0.38, 0.26], [-0.25, 0, -0.26, 0.25, 1, -0.15]], surf: [[0, 0.38, 0.05]] });
  put('shelf', 2.225, -3.2, toE, { y: 0.95, box: [[-0.6, 0.2, -0.15, 0.6, 0.24, 0.15]], surf: [[-0.42, 0.24, 0]] });
  put('nightstand', 2.36, -2.2, toE, { box: 'full', surf: [[0, 0.55, 0]] });
  put('bookshelf', 6.3, -0.33, toS, {
    box: [[-0.41, 0, -0.255, -0.37, 1.8, 0.255], [0.37, 0, -0.255, 0.41, 1.8, 0.255], [-0.41, 0, -0.255, 0.41, 0.27, 0.255],
      [-0.37, 0.6, -0.255, 0.37, 0.76, 0.255], [-0.37, 1.13, -0.255, 0.37, 1.25, 0.255], [-0.41, 1.6, -0.255, 0.41, 1.74, 0.255]],
  });
  put('armchair', 8.15, -1.0, -3 * PI / 4, {
    box: [[-0.4, 0, -0.02, 0.4, 0.33, 0.53, 'soft'], [-0.4, 0, -0.27, 0.4, 0.55, -0.02], [-0.4, 0, -0.53, 0.4, 0.8, -0.27],
      [-0.6, 0, -0.53, -0.4, 0.66, 0.53], [0.4, 0, -0.53, 0.6, 0.66, 0.53]],
    surf: [[0, 0.33, 0.22]],
  });
  const lampO = put('floorLamp', 8.55, -2.05, toW, lamp);
  // an empty delivery box nobody threw away: cats sit in it
  put('packageOpen', 3.3, -5.35, 0.35, {
    box: [[-0.25, 0, -0.25, 0.25, 0.02, 0.25], [-0.25, 0, -0.25, -0.23, 0.29, 0.25], [0.23, 0, -0.25, 0.25, 0.29, 0.25],
      [-0.25, 0, -0.25, 0.25, 0.29, -0.23], [-0.25, 0, 0.23, 0.25, 0.29, 0.25]],
    surf: [[0, 0.02, 0]],
  });
  put('plantTall', 8.35, -5.4, toN, tallPlant);
  frame(7.4, -0.125, toS, 1.3, 0);
  frame(4.2, -0.125, toS, 1.25, 4, 0.8);

  // ---------------------------------------------------------------- garden (seen through the windows)
  for (const [x, z, k, yaw] of [
    [-8.2, 10.2, 'treeLarge', 0.4], [-3.6, 11.5, 'tree', 1.1], [2.6, 9.8, 'tree', 2.0], [7.4, 11.0, 'treeLarge', 0.2],
    [-12.2, -2.4, 'tree', 0.7], [5.6, -10.2, 'treeLarge', 1.4], [12.4, -2.0, 'tree', 2.6], [-11.5, 5.0, 'tree', 0.1], [12.0, 6.5, 'tree', 1.9],
    [-6.6, 7.6, 'bush', 0.3], [-4.4, 7.8, 'bush', 1.7], [3.2, 7.5, 'bush', 2.4], [5.4, 7.7, 'bush', 0.9], [-9.9, -1.2, 'bush', 1.1],
    [4.6, -6.9, 'bush', 0.2], [6.6, -7.0, 'bush', 2.2], [9.9, -3.0, 'bush', 0.6], [9.8, 0.1, 'bush', 1.4], [9.85, 2.95, 'bush', 2.9],
  ] as [number, number, string, number][]) put(k, x, z, yaw);
  for (let x = -16; x <= 16; x += 1.85) { put('fence', x, 14, 0); put('fence', x, -13, 0); }

  // ---------------------------------------------------------------- doors (leaf pivots at the hinge)
  const doorPivots = new Map<DoorDef['id'], THREE.Group>();
  const doorInfo = modelInfo('door');
  for (const d of DOORS) {
    const pivot = new THREE.Group();
    pivot.name = d.id;
    pivot.position.set(...d.hinge);
    pivot.rotation.y = d.openYaw;
    pivot.userData = { closedYaw: d.closedYaw, openYaw: d.openYaw };
    if (doorInfo && hasModel('door')) {
      const leaf = cloneModel('door');
      const sx = (d.width - 0.04) / doorInfo.size[0];
      leaf.scale.set(sx, d.height / doorInfo.size[1] * 0.985, 0.6);
      leaf.position.x = d.width / 2;
      pivot.add(leaf);
    }
    group.add(pivot);
    doorPivots.set(d.id, pivot);
    objects.set(d.id, pivot);
    // ponytail: the slab stays when the door is closed (a 12 cm strip along the side wall), dynamic leaf colliders if it ever matters
    const dx = Math.cos(d.openYaw), dz = -Math.sin(d.openYaw);
    const a = [d.hinge[0] + dx * 0.12, d.hinge[2] + dz * 0.12], b = [d.hinge[0] + dx * d.width, d.hinge[2] + dz * d.width];
    addBox([Math.min(a[0], b[0]) - 0.06, 0, Math.min(a[1], b[1]) - 0.06], [Math.max(a[0], b[0]) + 0.06, d.height, Math.max(a[1], b[1]) + 0.06], 'doorLeaf');
  }

  // ---------------------------------------------------------------- lamps + warm house lights (no shadows)
  for (const l of [lampL, lampO]) {
    if (!l) continue;
    let top: THREE.Mesh | null = null, topY = -1;
    l.updateMatrixWorld(true);
    l.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (!mesh.isMesh) return;
      const y = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()).y;
      if (y > topY) { topY = y; top = mesh; }
    });
    if (top) {
      const mesh = top as THREE.Mesh;
      const mat = (mesh.material as THREE.MeshToonMaterial).clone();
      mat.emissive = new THREE.Color('#ffc978');
      mat.emissiveIntensity = 0.55;
      mesh.material = mat;
      lampMeshes.push(mesh);
    }
  }
  const light = (x: number, y: number, z: number, i: number, dist: number) => {
    const p = new THREE.PointLight('#ffcf94', i, dist, 2);
    p.position.set(x, y, z);
    p.castShadow = false;
    group.add(p);
    houseLights.push(p);
  };
  light(-8.4, 1.45, 2.3, 2.2, 5);    // living floor lamp
  light(8.4, 1.45, -2.05, 2.0, 4.5); // office floor lamp
  light(3.4, 2.3, 4.4, 2.5, 5.5);    // over the dining table
  light(-7.2, 2.2, -2.6, 1.6, 4.5);  // bedroom

  // ---------------------------------------------------------------- props (pos = resting contact point)
  const props: PropSpawn[] = [];
  const P = (kind: PropKind, x: number, y: number, z: number, rotY = 0) => props.push({ kind, pos: [x, y, z], rotY });
  // living: coffee table, side tables, tv stand, bookshelf (book dominoes on the 0.76 shelf), floor toys
  P('remote', -6.75, 0.45, 3.45, 0.4); P('mug', -6.95, 0.45, 3.0); P('candle', -6.7, 0.45, 2.85); P('phone', -6.62, 0.45, 3.75, -0.3);
  P('book', -7.02, 0.45, 3.65, 1.2); P('glass', -6.98, 0.45, 3.25);
  P('lamp', -5.25, 0.6, 4.55); P('frame', -5.3, 0.6, 1.96, -PI / 2); P('vase', -5.15, 0.6, 2.18);
  P('plantPot', -8.68, 0.55, 3.8);
  for (let i = 0; i < 6; i++) P('book', -3.95, 0.76, 5.9 + i * 0.08); // dominoes
  P('vase', -3.95, 1.25, 5.85); P('frame', -3.97, 1.25, 6.32, PI / 2); P('yarn', -3.9, 0.27, 5.8); P('toyMouse', -3.9, 0.27, 6.35, 2);
  P('plantPot', -3.95, 1.74, 5.85); P('candle', -3.95, 1.74, 6.35);
  P('yarn', -4.2, 0, 2.5); P('toyMouse', -3.5, 0, 4.2, 2.2); P('pillow', -5.55, 0.33, 2.75, -PI / 2 + 0.2);
  // kitchen: 3 mugs at the counter edge (cat 0 spawns at the end of the row), salmon on the board, dining table, fridge top
  P('mug', 4.6, 0.92, 6.0, 0.3); P('mug', 4.85, 0.92, 5.98, -0.2); P('mug', 5.1, 0.92, 6.01, 0.5);
  P('salmon', 2.3, 0.958, 6.2, PI / 2); P('glass', 2.85, 0.92, 6.32); P('wineBottle', 1.95, 0.92, 6.35);
  P('cerealBox', 6.95, 0.92, 6.38, PI); P('plate', 7.15, 0.92, 6.08);
  P('bowl', 8.55, 0.92, 5.05); P('glass', 8.5, 0.92, 4.4); P('wineBottle', 8.62, 0.92, 6.22);
  P('plate', 3.05, 0.75, 4.1); P('plate', 3.75, 0.75, 4.1); P('glass', 3.0, 0.75, 4.58); P('cucumber', 3.8, 0.75, 4.58, 0.7);
  P('cerealBox', 8.6, 1.85, 3.6, -PI / 2); P('plantPot', 8.6, 1.85, 4.1);
  // hallway: the sitter's shoes by the door
  P('book', 7.92, 0.47, HZ - 0.2, PI); P('shoe', 8.15, 0, 0.35, 0.2); P('shoe', 8.38, 0, 0.32, -0.15);
  // bathroom
  P('tpRoll', 1.45, 0.8, -5.75); P('candle', -2.68, 0.6, -5.5); P('candle', -2.72, 0.6, -5.1);
  P('candle', 0.2, 1.52, -5.78); P('plantPot', 0.55, 1.52, -5.78); P('tpRoll', 0.95, 1.52, -5.78); P('glass', -2.45, 0.85, -1.9);
  // bedroom
  P('glass', -8.62, 0.55, -4.65); P('lamp', -8.65, 0.55, -2.0); P('book', -8.6, 0.55, -1.8, 0.4);
  P('plantPot', -5.3, 1.95, -5.62); P('sock', -6.4, 0, -1.2, 0.8); P('sock', -4.6, 0, -4.9, -0.4);
  // office: desk, west shelf (book dominoes + trophy), north bookshelf, cabinet
  P('mug', 5.7, 0.75, -5.75); P('phone', 5.95, 0.75, -5.45, 0.3); P('book', 6.0, 0.75, -5.82, 0.2); P('frame', 4.82, 0.75, -5.8, 0.2);
  for (let i = 0; i < 6; i++) P('book', 2.225, 1.19, -3.5 + i * 0.08);
  P('trophy', 2.225, 1.19, -3.7);
  for (let i = 0; i < 4; i++) P('book', 6.3 - 0.25 + i * 0.07, 0.76, -0.34, PI / 2);
  P('vase', 6.45, 0.76, -0.34); P('candle', 6.1, 1.25, -0.34); P('frame', 6.45, 1.25, -0.36, PI); P('plantPot', 6.3, 1.74, -0.33);
  P('plantPot', 2.36, 0.55, -2.2); P('yarn', 5.0, 0, -3.2);

  // ---------------------------------------------------------------- spots
  const S = (id: SpotId, pos: Vec3, facing: number, radius: number): Spot => ({ id, pos, facing, radius, room: roomAt(pos[0], pos[2]) ?? 'hallway' });
  const spots: Spot[] = [
    S('tv', [-7.85, 0, 3.1], toW, 1.2),
    S('sofa', [-4.3, 0, 3.3], toW, 1.0),
    S('fishTank', [-8.66, 0.55, 5.32], toN, 0.6),
    S('curtains', [-7.05, 0, 6.05], toN, 0.8),
    S('window', [-6.1, 0, 6.05], toN, 0.7),
    S('plant', [-1.0, 0, 5.22], 0.4, 0.9),
    S('scratchPost', [-1.45, 0, 0.5], toE, 0.8),
    S('salmon', [2.3, 0.92, 6.2], toW, 0.65),
    S('sink', [3.675, 0, 5.55], toN, 1.0),
    S('foodBowl', [1.15, 0, 5.7], toN, 0.8),
    S('carrier', [1.4, 0, 3.9], toS, 1.0),
    S('frontDoor', [8.3, 0, 1.5], toE, 1.0),
    S('shoes', [8.25, 0, 0.78], toS, 0.8),
    S('fuseBox', [7.8, 0, HZ - 0.7], toN, 0.9),
    S('tubFaucet', [-2.3, 0, -4.36], toS, 0.9),
    S('tpRoll', [1.35, 0, -4.6], toE, 0.8),
    S('litterBox', [-0.7, 0, -1.0], toN, 0.9),
    S('pillow', [-7.5, 0.76, -2.95], toW, 0.65), // on the mattress beside the pillow (the old spot slid cats off the edge)
    S('hideout', [-7.75, 0, -3.4], toE, 0.9),
    S('laundry', [-3.95, 0, -3.1], toE, 0.8),
    S('laptop', [5.05, 0.75, -5.38], toS, 0.6),
    S('bathroomDoor', [1.3, 0, 0], toS, 1.3),
    S('bedroomDoor', [-3.72, 0, 0], toS, 1.3),
    S('officeDoor', [2.7, 0, 0], toS, 1.3),
  ];
  const fixRoom = (id: SpotId, room: RoomId) => { const s = spots.find((x) => x.id === id); if (s) s.room = room; };
  fixRoom('bathroomDoor', 'hallway'); fixRoom('bedroomDoor', 'living'); fixRoom('officeDoor', 'hallway');

  // ---------------------------------------------------------------- spawns, sun
  const spawns = {
    sitter: [1.6, 0, 1.5] as Vec3, // west end of the hallway: the counter cat (player 1 in solo) is ~8 m of walking away
    // cat 0 stands at the end of the mug row, looking along it: with its back to the wall the camera had no room
    cats: [[4.3, 0.92, 5.97], [-5.55, 0.33, 3.55], [0.9, 0, -4.3], [5.75, 0.75, -5.45]] as Vec3[],
    sitterYaw: toW,
    catYaws: [toE, toW, toE, toS],
  };
  const sunPatches = [
    { center: [-5.6, 0, 5.85] as Vec3, radius: 0.8 },  // living window floor
    { center: [3.95, 0.92, 6.15] as Vec3, radius: 0.5 }, // kitchen counter by the sink
    { center: [-8.2, 0.8, -2.6] as Vec3, radius: 0.5 },  // bedroom: the owner's side of the bed
  ];

  // ---------------------------------------------------------------- nav
  const nav = buildNav({ rooms: ROOMS, colliders, portals, surfaces, spots });
  if (new URLSearchParams(location.search).has('navcheck')) {
    const problems = checkNav({ nav, spots, spawns, colliders },
      ['tv', 'sofa', 'curtains', 'plant', 'sink', 'foodBowl', 'carrier', 'frontDoor', 'fuseBox', 'tubFaucet', 'tpRoll', 'litterBox', 'laundry', 'bathroomDoor', 'bedroomDoor', 'officeDoor']);
    console.info(`[level] nav ${nav.nodes.length} nodes ${nav.links.length} links:`, problems.length ? problems : 'OK');
  }

  // static furniture never moves: bake it into one mesh per material (hundreds of draw calls -> tens)
  const keep = new Set<THREE.Object3D>([lampL, lampO].filter((o): o is THREE.Group => !!o));
  mergeByMaterial(group, statics.filter((o) => !keep.has(o)), true);
  for (const o of keep) { o.updateMatrixWorld(true); o.matrixAutoUpdate = false; o.traverse((c) => (c.matrixAutoUpdate = false)); }
  // inside refs: only parts the world visuals never single out (aquarium by material, TV all but the glass)
  const tv = objects.get('tv'), tank = objects.get('aquarium');
  if (tv) mergeByMaterial(tv, [tv], false, (m) => matOf(m).name !== 'mat16');
  if (tank) mergeByMaterial(tank, [tank], false);

  // ---------------------------------------------------------------- visuals seam
  const refs: LevelRefs = { group, objects, spots: new Map(spots.map((s) => [s.id, s])), rooms: ROOMS, floorY: 0, lampMeshes, houseLights };
  let visuals: WorldVisuals;
  try { visuals = createWorldVisuals(refs); } catch (err) {
    console.error('[level] world visuals failed, keys ignored', err);
    visuals = { setVisual() {}, update() {}, setTvTexture() {} };
  }
  const doorTarget = new Map<DoorDef['id'], number>(DOORS.map((d) => [d.id, 1]));

  return {
    group, colliders, props, spots, doors: DOORS, rooms: ROOMS, nav, spawns, sunPatches,
    setDoorOpen(id, open01) { doorTarget.set(id, open01); },
    setVisual(key: string, value: WorldVisualValue) { try { visuals.setVisual(key, value); } catch (err) { console.error('[level] setVisual', key, err); } },
    update(dt, time) {
      for (const d of DOORS) {
        const p = doorPivots.get(d.id)!;
        const target = d.closedYaw + (d.openYaw - d.closedYaw) * (doorTarget.get(d.id) ?? 1);
        p.rotation.y += (target - p.rotation.y) * Math.min(1, dt * 10);
      }
      visuals.update(dt, time);
    },
    setTvTexture(tex) { visuals.setTvTexture(tex); },
  };
}

/** gather both curtain panels toward the rod ends (fabric only), keeping `k` of each panel's width */
function drawOpen(root: THREE.Object3D, k: number) {
  root.updateMatrixWorld(true);
  const half = new THREE.Box3().setFromObject(root).max.x;
  const v = new THREE.Vector3();
  root.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh || matOf(mesh).name === 'LightMetal') return;
    mesh.geometry = mesh.geometry.clone();
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const M = mesh.matrixWorld, inv = M.clone().invert();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(M);
      v.x = Math.sign(v.x) * (half - (half - Math.abs(v.x)) * k);
      v.applyMatrix4(inv);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
}

/**
 * Raise a model on taller legs: vertices below `cut` (feet, in model meters) stretch to cut + add, everything
 * above moves up by `add`. Geometry is cloned so other instances keep the original.
 */
/** squash every vertex above height y0 toward it by k (model-local, before placement) */
function squashAbove(root: THREE.Object3D, y0: number, k: number) {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  root.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const M = mesh.matrixWorld, inv = M.clone().invert();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(M);
      if (v.y <= y0) continue;
      v.y = y0 + (v.y - y0) * k;
      v.applyMatrix4(inv);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
}

function stretchLegs(root: THREE.Object3D, cut: number, add: number) {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  root.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const M = mesh.matrixWorld, inv = M.clone().invert();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(M);
      v.y = v.y < cut ? v.y * ((cut + add) / cut) : v.y + add;
      v.applyMatrix4(inv);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
}

/** float32, non-interleaved, non-normalized copy (glTF quantized / interleaved data won't merge otherwise) */
function plainGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const k of Object.keys(g.attributes)) {
    const a = g.attributes[k] as THREE.BufferAttribute;
    const n = a.itemSize, arr = new Float32Array(a.count * n);
    for (let i = 0; i < a.count; i++) {
      arr[i * n] = a.getX(i);
      if (n > 1) arr[i * n + 1] = a.getY(i);
      if (n > 2) arr[i * n + 2] = a.getZ(i);
      if (n > 3) arr[i * n + 3] = a.getW(i);
    }
    out.setAttribute(k, new THREE.BufferAttribute(arr, n));
  }
  if (g.index) out.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array as ArrayLike<number>), 1));
  return out;
}

const matOf = (m: THREE.Mesh) => (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;

/**
 * Merge the meshes of `sources` (children of `root`, or root itself) into one mesh per material, in root space.
 * removeSources: detach the source objects afterwards (statics); else only the merged meshes are removed.
 */
function mergeByMaterial(root: THREE.Object3D, sources: THREE.Object3D[], removeSources: boolean, filter: (m: THREE.Mesh) => boolean = () => true) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  for (const src of sources) src.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material) || (m as THREE.SkinnedMesh).isSkinnedMesh || !filter(m) || !m.visible) return;
    const g = m.geometry;
    const key = `${m.material.uuid}|${g.index ? 'i' : 'n'}|${Object.keys(g.attributes).sort().map((k) => k + g.attributes[k].itemSize).join(',')}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: m.material, geos: [], meshes: [] }));
    b.geos.push(plainGeometry(g).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)));
    b.meshes.push(m);
  });
  const merged: THREE.Mesh[] = [];
  for (const b of buckets.values()) {
    if (b.meshes.length < 2 && !removeSources) continue;
    const one = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!one && !removeSources) continue; // keep the originals
    for (const geo of one ? [one] : b.geos) { // a failed merge still keeps every piece
      const mesh = new THREE.Mesh(geo, b.mat);
      mesh.castShadow = !b.mat.transparent;
      mesh.receiveShadow = true;
      mesh.renderOrder = b.meshes[0].renderOrder;
      mesh.name = `merged:${b.mat.name}`;
      mesh.matrixAutoUpdate = false;
      merged.push(mesh);
    }
    if (!removeSources) for (const m of b.meshes) m.removeFromParent();
  }
  if (removeSources) for (const s of sources) s.removeFromParent();
  for (const m of merged) root.add(m);
}
