/**
 * Prop + mess meshes from the downloaded models. Props: origin = collider center (manifest 'center').
 * Mess: origin = floor contact. Missing models fall back to the dev shape / the canvas mess decal.
 */
import * as THREE from 'three';
import type { MessKind, PropKind } from '../shared/contracts';
import { cloneModel, getClips, hasModel, modelInfo } from '../assets/loader';
import { createDevProp } from '../dev/devModels';
import { PROP_DEFS } from '../shared/propDefs';
import { createMessDecal } from '../fx/messDecals';

export function createProp(kind: PropKind): THREE.Object3D {
  if (!hasModel(kind)) return createDevProp(kind);
  const g = cloneModel(kind);
  g.name = `prop-${kind}`;
  return kind === 'package' ? packageProp(g) : g;
}

// ---------------------------------------------------------------- delivery box: closed, or opened and empty (world key package.open)
const packages = new Set<THREE.Group>();
let packageOpen = false;
const showPackage = (g: THREE.Group) => { g.children[0].visible = !packageOpen; if (g.children[1]) g.children[1].visible = packageOpen; };

/** called by the world visuals for 'package.open' (one delivery per round, so the set stays tiny) */
export function setPackageOpen(open: boolean): void {
  packageOpen = open;
  for (const g of packages) { if (!g.parent) packages.delete(g); else showPackage(g); }
}

function packageProp(closed: THREE.Group): THREE.Group {
  const g = new THREE.Group();
  g.name = 'prop-package';
  // the model is taller than the PROP_DEFS box: flatten it to the collider so it doesn't sink into the floor
  const sz = modelInfo('package')?.size;
  if (sz) closed.scale.y = (PROP_DEFS.package.half![1] * 2) / sz[1];
  g.add(closed);
  if (hasModel('packageOpen')) {
    const open = cloneModel('packageOpen');
    const [hx, hy, hz] = PROP_DEFS.package.half!;
    const size = modelInfo('packageOpen')!.size;
    open.scale.set((hx * 2) / size[0], (hy * 2 + 0.06) / size[1], (hz * 2) / size[2]);
    open.position.y = -hy;                     // feet origin onto the collider bottom
    g.add(open);
  }
  packages.add(g);
  showPackage(g);
  return g;
}

const MODEL_MESS = new Set<MessKind>(['poop', 'fish', 'tp', 'shards']);

export function createMess(kind: MessKind): THREE.Object3D {
  if (!MODEL_MESS.has(kind) || !hasModel(kind)) return createMessDecal(kind);
  const root = new THREE.Group();
  root.name = `mess-${kind}`;
  const m = cloneModel(kind);
  m.rotation.y = Math.random() * Math.PI * 2;
  root.add(m);
  if (kind === 'fish') flop(m);
  if (kind === 'shards') scatter(m);
  return root;
}

/** the shards model is a broken plate still lying in one piece: push the pieces apart so it reads as smashed */
function scatter(m: THREE.Group) {
  m.traverse((o) => {
    if (o.name !== 'piece' && !/^piece/.test(o.name)) return;
    o.position.x *= 1.5 + Math.random() * 0.6;
    o.position.z *= 1.5 + Math.random() * 0.6;
    o.rotation.y += (Math.random() - 0.5) * 1.4;
    o.rotation.x += (Math.random() - 0.5) * 0.25;
  });
}

/**
 * A fish on the floor: sped-up swim clip on its side plus little hops in bursts. Mess meshes have no
 * update hook, so the first skinned mesh's onBeforeRender advances it (wall-clock dt, safe to call twice).
 */
function flop(fish: THREE.Group) {
  const name = modelInfo('fish')?.clips?.swim;
  const clip = getClips('fish').find((c) => c.name === name) ?? getClips('fish')[0];
  const mixer = clip ? new THREE.AnimationMixer(fish) : null;
  mixer?.clipAction(clip!).play();
  let host: THREE.Mesh | null = null;
  fish.traverse((o) => { if (!host && (o as THREE.Mesh).isMesh) host = o as THREE.Mesh; });
  if (!host) return;
  const base = fish.position.y;
  let last = performance.now(), t = Math.random() * 3;
  (host as THREE.Mesh).onBeforeRender = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (dt <= 0) return;
    t += dt;
    const phase = t % 1.8;                     // a burst of three flops, then a breather
    const busy = phase < 0.9;
    mixer?.update(dt * (busy ? 3.2 : 0.6));
    const hop = busy ? Math.abs(Math.sin(phase * Math.PI * 3.33)) : 0;
    fish.position.y = base + hop * 0.045;
    fish.rotation.z = busy ? Math.sin(phase * 21) * 0.25 : 0;
  };
}
