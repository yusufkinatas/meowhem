import type { Vec3 } from '../shared/contracts';

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, rate: number, dt: number) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const lerpAngle = (a: number, b: number, t: number) => a + wrapAngle(b - a) * t;
export const dampAngle = (a: number, b: number, rate: number, dt: number) => lerpAngle(a, b, 1 - Math.exp(-rate * dt));

export const dist2 = (a: Vec3, b: Vec3) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
export const dist = (a: Vec3, b: Vec3) => Math.sqrt(dist2(a, b));
export const distXZ = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
export const fwd = (yaw: number): Vec3 => [Math.sin(yaw), 0, Math.cos(yaw)];
export const yawTo = (from: Vec3, to: Vec3) => Math.atan2(to[0] - from[0], to[2] - from[2]);
export const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const r3 = (v: number) => Math.round(v * 1000) / 1000;
export const rv = (v: Vec3): Vec3 => [r3(v[0]), r3(v[1]), r3(v[2])];

/** dot of horizontal forward(yaw) and horizontal direction to target, in -1..1 */
export function facingDot(yaw: number, from: Vec3, to: Vec3): number {
  const dx = to[0] - from[0], dz = to[2] - from[2];
  const l = Math.hypot(dx, dz) || 1;
  return (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / l;
}

/** mulberry32 seeded rng */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(arr: readonly T[], rng: () => number = Math.random): T => arr[Math.floor(rng() * arr.length)];
