import RAPIER from '@dimforge/rapier3d-compat';
import type { LevelData, DoorDef, BoxCollider, Role } from '../shared/contracts';
import { CFG } from '../config';

export { RAPIER };
let ready: Promise<void> | null = null;
export const initPhysics = () => (ready ??= RAPIER.init());

// collision groups: (membership << 16) | filter
export const G = { STATIC: 1, SITTER_BLOCK: 2, DOOR: 4, PROP: 8, CHAR: 16, QUERY: 32 } as const;
export const groups = (member: number, filter: number) => ((member & 0xffff) << 16) | (filter & 0xffff);
export const CHAR_QUERY: Record<Role, number> = {
  cat: groups(G.CHAR, G.STATIC | G.DOOR),
  sitter: groups(G.CHAR, G.STATIC | G.DOOR | G.SITTER_BLOCK),
};
export const LOS_QUERY = groups(G.QUERY, G.STATIC | G.DOOR);

export function yawQuat(yaw: number) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

function addBox(world: RAPIER.World, b: BoxCollider) {
  const sitterOnly = b.tag === 'catOnly'; // blocks the sitter only, cats pass (under-bed gap)
  const desc = RAPIER.ColliderDesc.cuboid(b.half[0], b.half[1], b.half[2])
    .setTranslation(b.center[0], b.center[1], b.center[2])
    .setRotation(yawQuat(b.rotY ?? 0))
    .setFriction(0.8)
    .setCollisionGroups(sitterOnly ? groups(G.SITTER_BLOCK, G.CHAR | G.QUERY) : groups(G.STATIC, 0xffff));
  return world.createCollider(desc);
}

/**
 * Door panel convention: the panel spans `width` from the hinge along the door's local +X axis
 * after rotating by yaw (three.js Object3D.rotation.y), i.e. direction (cos yaw, 0, -sin yaw).
 */
export function doorBox(d: DoorDef): BoxCollider {
  const dx = Math.cos(d.closedYaw), dz = -Math.sin(d.closedYaw);
  return {
    center: [d.hinge[0] + dx * d.width / 2, d.hinge[1] + d.height / 2, d.hinge[2] + dz * d.width / 2],
    half: [d.width / 2, d.height / 2, 0.04],
    rotY: d.closedYaw,
  };
}

export interface StaticWorld {
  world: RAPIER.World;
  doors: Map<DoorDef['id'], RAPIER.Collider>;
  setDoor(id: DoorDef['id'], open: boolean): void;
}

/** World with the level's static colliders + door colliders (doors start open). */
export function buildStaticWorld(level: LevelData): StaticWorld {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = CFG.tick;
  for (const b of level.colliders) if (b.tag !== 'rug') addBox(world, b); // 'rug' = data-only area (hairball x2)
  const doors = new Map<DoorDef['id'], RAPIER.Collider>();
  for (const d of level.doors) {
    const b = doorBox(d);
    const c = world.createCollider(
      RAPIER.ColliderDesc.cuboid(b.half[0], b.half[1], b.half[2])
        .setTranslation(b.center[0], b.center[1], b.center[2])
        .setRotation(yawQuat(b.rotY!))
        .setCollisionGroups(groups(G.DOOR, 0xffff)),
    );
    c.setEnabled(false);
    doors.set(d.id, c);
  }
  return { world, doors, setDoor: (id, open) => doors.get(id)?.setEnabled(!open) };
}

let ray: RAPIER.Ray | null = null;
/** distance along dir until a static/door hit, or maxDist */
export function rayDist(world: RAPIER.World, o: [number, number, number], d: [number, number, number], maxDist: number): number {
  ray ??= new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  ray.origin = { x: o[0], y: o[1], z: o[2] };
  ray.dir = { x: d[0], y: d[1], z: d[2] };
  const hit = world.castRay(ray, maxDist, true, undefined, LOS_QUERY);
  return hit ? hit.timeOfImpact : maxDist;
}

export function lineOfSight(world: RAPIER.World, a: [number, number, number], b: [number, number, number]): boolean {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const l = Math.hypot(dx, dy, dz);
  if (l < 1e-3) return true;
  return rayDist(world, a, [dx / l, dy / l, dz / l], l) >= l - 0.05;
}
