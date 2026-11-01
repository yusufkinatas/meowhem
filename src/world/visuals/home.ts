/** House-wide + kitchen/bedroom/office visuals: lights, fuse box, doors, fridge note, oven smudge, food bowl, carrier, laptop, pillow, fish bones. */
import * as THREE from 'three';
import { cloneModel, hasModel } from '../../assets/loader';
import { type Builder, approach, bool, byMat, clamp01, decal, hinge, localBox, meshes, num, ownMaterial, pivotize, planarUv, roomCenter, stick } from './kit';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { setPackageOpen } from '../../models/props';
import { furTex, noteTex, scratchTex, smudgeTex } from './paint';
import { createLaptopScreen } from './laptopScreen';
import { popGroup } from './living';

const Y = new THREE.Vector3(0, 1, 0), Zp = new THREE.Vector3(0, 0, 1), Zn = new THREE.Vector3(0, 0, -1);

// ---------------------------------------------------------------- lights (blackout)
export const lights: Builder = (c) => {
  const own = new Map<THREE.Material, THREE.MeshToonMaterial | THREE.MeshStandardMaterial>();
  const lamps: { m: THREE.MeshToonMaterial | THREE.MeshStandardMaterial; e: THREE.Color; i: number }[] = [];
  for (const mesh of c.refs.lampMeshes) {
    const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshToonMaterial;
    if (!('emissive' in src)) continue;
    let m = own.get(src);
    if (!m) {
      m = src.clone();
      own.set(src, m);
      const dark = m.emissive.getHex() === 0 || m.emissiveIntensity === 0;
      lamps.push({ m, e: dark ? new THREE.Color('#ffcf7a') : m.emissive.clone(), i: dark ? 0.85 : m.emissiveIntensity });
    }
    mesh.material = m;
  }
  const lightsList = c.refs.houseLights.map((l) => ({ l, i: l.intensity }));
  let on = true, k = 1, flicker = -1, applied = 1;
  const apply = (v: number) => {
    for (const L of lamps) { L.m.emissive.copy(L.e); L.m.emissiveIntensity = L.i * v; }
    for (const L of lightsList) L.l.intensity = L.i * v;
  };
  return {
    keys: { lights: (v) => { const n = bool(v); if (n && !on) flicker = 0; on = n; } },
    update(dt) {
      let target = on ? 1 : 0;
      if (flicker >= 0) {
        flicker += dt;
        // lights coming back: blink, blink, on
        target = flicker < 0.08 ? 1 : flicker < 0.18 ? 0.1 : flicker < 0.26 ? 1 : flicker < 0.4 ? 0.25 : 1;
        if (flicker > 0.45) flicker = -1;
        k = target;
      } else k = approach(k, target, on ? 10 : 14, dt);
      if (Math.abs(k - target) < 0.001) k = target;
      if (k !== applied) { applied = k; apply(k); }
    },
  };
};

// ---------------------------------------------------------------- fuse box: breaker lever drops, LEDs go dark, a red light blinks
export const fuseBox: Builder = (c) => {
  const o = c.obj('fuseBox');
  if (!o) return;
  const sized = (m: THREE.Mesh) => localBox(o, [m]).getSize(new THREE.Vector3());
  const lever = byMat(o, 'mat21').sort((a, b) => sized(a).lengthSq() - sized(b).lengthSq())[0];
  const leds = byMat(o, 'mat5');
  const warn = byMat(o, 'mat19');
  const ledMats = leds.map((m) => ownMaterial<THREE.MeshToonMaterial>(m));
  const warnMats = warn.map((m) => ownMaterial<THREE.MeshToonMaterial>(m));
  const leverP0 = lever?.position.clone();
  let dLever: THREE.Vector3 | null = null;
  if (lever) {
    o.updateWorldMatrix(true, true);
    const m = new THREE.Matrix4().copy(o.matrixWorld).invert().multiply(lever.parent!.matrixWorld).invert();
    dLever = new THREE.Vector3(0, -0.045, 0).applyMatrix3(new THREE.Matrix3().setFromMatrix4(m));
  }
  let flipped = false, k = 0;
  const ledOn = new THREE.Color('#5fd4ff'), ledOff = new THREE.Color('#25323a'), warnOn = new THREE.Color('#ff3b24');
  const warnBase = warnMats.map((m) => m.color.clone());
  for (const m of ledMats) { m.emissive.set('#3cc8ff'); m.emissiveIntensity = 0.9; }
  for (const m of warnMats) m.emissive.set('#ff2a1a');
  return {
    keys: { 'fuse.flipped': (v) => { flipped = bool(v); } },
    update(dt, t) {
      k = approach(k, flipped ? 1 : 0, 18, dt);
      if (lever && leverP0 && dLever) lever.position.copy(leverP0).addScaledVector(dLever, k);
      for (const m of ledMats) { m.emissiveIntensity = 0.9 * (1 - k); m.color.copy(ledOn).lerp(ledOff, k); }
      const blink = flipped ? (Math.sin(t * 9) > -0.3 ? 1.2 : 0.2) : 0;
      warnMats.forEach((m, i) => { m.emissiveIntensity = blink; m.color.copy(warnBase[i]).lerp(warnOn, k); });
    },
  };
};

// ---------------------------------------------------------------- front door (owners arriving)
export const frontDoor: Builder = (c) => {
  const o = c.obj('frontDoor');
  if (!o) return;
  let target = 0, k = 0;
  const ud = o.userData as { closedYaw?: number; openYaw?: number };
  if (typeof ud.closedYaw === 'number' && typeof ud.openYaw === 'number') {
    // the layout hands us a hinge pivot with its own swing
    const a = ud.closedYaw, d = ud.openYaw - ud.closedYaw;
    o.rotation.y = a;
    return {
      keys: { 'frontDoor.open': (v) => { target = clamp01(num(v)); } },
      update(dt) {
        if (Math.abs(k - target) < 0.0005) return;
        k = approach(k, target, 9, dt);
        o.rotation.y = a + d * k;
      },
    };
  }
  const b = localBox(o);
  const handle = byMat(o, 'Metal');
  const hb = handle.length ? localBox(o, handle) : null;
  // the hinge is on the side away from the handle
  const hx = hb && (hb.min.x + hb.max.x) / 2 < (b.min.x + b.max.x) / 2 ? b.max.x : b.min.x;
  const rot = hinge(o, new THREE.Vector3(hx, 0, (b.min.z + b.max.z) / 2));
  // swing into the hallway
  let sign = 1;
  const hall = c.room('hallway');
  if (hall) {
    const hc = roomCenter(hall);
    const free = new THREE.Vector3(b.min.x + b.max.x - hx, 0, 0);
    const test = (s: number) => { rot(s * 1.2); o.updateMatrixWorld(true); const d = o.localToWorld(free.clone()).setY(0).distanceTo(hc.clone().setY(0)); return d; };
    sign = test(1) < test(-1) ? 1 : -1;
    rot(0);
  }
  return {
    keys: { 'frontDoor.open': (v) => { target = clamp01(num(v)); } },
    update(dt) {
      if (Math.abs(k - target) < 0.0005) return;
      k = approach(k, target, 9, dt);
      rot(sign * k * 1.65);
    },
  };
};

// ---------------------------------------------------------------- claw scratches at the bottom of the bedroom + bathroom doors (both faces)
export const doorScratches: Builder = (c) => {
  (['bedroomDoor', 'bathroomDoor'] as const).forEach((key, d) => {
    const o = c.obj(key);
    if (!o) return;
    const b = localBox(o);
    const w = b.max.x - b.min.x, mid = (b.min.x + b.max.x) / 2;
    [1, -1].forEach((s, i) => {
      const n = s > 0 ? Zp : Zn;
      const z = s > 0 ? b.max.z : b.min.z;
      [[-0.08, 0.15, 0.24], [0.14, 0.11, 0.18]].forEach(([x, y, size], j) => {
        const m = decal(scratchTex(70 + d * 10 + i * 3 + j, '#7a3d18', '#ffd9a8'), size, size);
        stick(m, new THREE.Vector3(mid + x * w * s, b.min.y + y, z), n, Math.PI / 2 + (j ? 0.25 : -0.15), 0.003);
        o.add(m);
      });
    });
  });
};

// ---------------------------------------------------------------- fridge note (ADDENDUM 1.6) + nose print on the oven door
export const kitchenDecals: Builder = (c) => {
  const f = c.obj('fridge');
  if (f) {
    const doors = meshes(f, (m) => /door_top/.test(m.name));
    const b = localBox(f, doors.length ? doors : undefined);
    const m = decal(noteTex(), 0.12, 0.16);
    stick(m, new THREE.Vector3(b.min.x + (b.max.x - b.min.x) * 0.62, b.min.y + (b.max.y - b.min.y) * 0.56, b.max.z), Zp, -0.06, 0.0015);
    f.add(m);
  }
  const s = c.obj('stove');
  if (s) {
    const glass = byMat(s, 'tiny_treats_1_GLASS');
    if (glass.length) {
      const gb = localBox(s, glass);
      const m = decal(smudgeTex(77), 0.11, 0.09, { opacity: 0.85 });
      stick(m, new THREE.Vector3(gb.min.x + (gb.max.x - gb.min.x) * 0.3, gb.min.y + (gb.max.y - gb.min.y) * 0.38, gb.max.z), Zp, 0.3, 0.002);
      s.add(m);
    }
  }
};

/** float32 position/normal + index copy (the GLB mixes quantized and float accessors, which won't merge) */
function plain(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const a = src.getAttribute(name);
    if (!a) continue;
    const arr = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) { arr[i * 3] = a.getX(i); arr[i * 3 + 1] = a.getY(i); arr[i * 3 + 2] = a.getZ(i); }
    g.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  if (src.index) g.setIndex(Array.from(src.index.array));
  return g;
}

// ---------------------------------------------------------------- food bowl: full mound, rim-only ring, shaken thin layer, empty
export const foodBowl: Builder = (c) => {
  const o = c.obj('foodBowl');
  if (!o) return;
  const kib = meshes(o, (m) => /^Sphere/.test(m.name));
  if (!kib.length) return;
  const bowlBox = localBox(o);
  const cx = (bowlBox.min.x + bowlBox.max.x) / 2, cz = (bowlBox.min.z + bowlBox.max.z) / 2;
  const info = kib.map((m, i) => { const bb = localBox(o, [m]); const p = bb.getCenter(new THREE.Vector3()); return { m, i, r: Math.hypot(p.x - cx, p.z - cz), y: p.y }; });
  const maxR = Math.max(...info.map((i) => i.r));
  const ys = info.map((i) => i.y).sort((a, b) => a - b);
  const lowY = ys[Math.floor(ys.length * 0.6)];
  // ~280 kibble spheres = ~280 draw calls: bake each state into one merged mesh (bowl-local) and toggle those.
  // full: heaped into a mound. thin (shaken): every other bottom piece, settled flat. ring: bottom pieces at the rim.
  o.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
  const bake = (pick: (k: (typeof info)[number]) => boolean, lift: (k: (typeof info)[number]) => number): THREE.Mesh | null => {
    const geos = info.filter(pick).map((k) => {
      const g = plain(k.m.geometry).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, k.m.matrixWorld));
      return g.translate(0, lift(k), 0);
    });
    const merged = geos.length ? mergeGeometries(geos) : null;
    if (!merged) return null;
    const mesh = new THREE.Mesh(merged, kib[0].material);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    o.add(mesh);
    return mesh;
  };
  const low = (k: (typeof info)[number]) => k.y <= lowY;
  const states = {
    full: bake(() => true, (k) => Math.pow(1 - k.r / maxR, 1.4) * 0.022),
    thin: bake((k) => low(k) && k.i % 2 === 0, () => -0.004),
    ring: bake((k) => low(k) && k.r > maxR * 0.66, () => 0),
  };
  if (!states.full || !states.thin || !states.ring) { for (const m of Object.values(states)) m?.removeFromParent(); return; } // keep the model's own kibble
  for (const m of kib) m.removeFromParent();
  let fill = 1, shaken = false;
  const apply = () => {
    const state = fill <= 0.001 ? 'empty' : fill > 0.5 ? 'full' : shaken ? 'thin' : 'ring';
    states.full!.visible = state === 'full';
    states.thin!.visible = state === 'thin';
    states.ring!.visible = state === 'ring';
  };
  apply();
  return {
    keys: {
      'foodBowl.fill': (v) => { fill = clamp01(num(v)); apply(); },
      'foodBowl.shaken': (v) => { shaken = bool(v); apply(); },
    },
  };
};

// ---------------------------------------------------------------- carrier: lids open / shut, rattles while someone's inside
export const carrier: Builder = (c) => {
  const o = c.obj('carrier');
  if (!o) return;
  const lidL = o.getObjectByName('picnic_basket_lid_left');
  const lidR = o.getObjectByName('picnic_basket_lid_right');
  const b = localBox(o);
  const pivot = pivotize(o, new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2));
  const zL = lidL?.rotation.z ?? 0, zR = lidR?.rotation.z ?? 0;
  let closed = false, occupied = false, k = 0, jolt = 0, next = 0;
  const OPEN = 2.55;
  return {
    keys: {
      'carrier.closed': (v) => { const n = bool(v); if (n && !closed) jolt = 1; closed = n; },
      'carrier.occupied': (v) => { occupied = bool(v); },
    },
    update(dt, t) {
      k = approach(k, closed ? 0 : 1, closed ? 16 : 7, dt);
      if (lidL) lidL.rotation.z = zL - OPEN * k;
      if (lidR) lidR.rotation.z = zR + OPEN * k;
      if (occupied) {
        next -= dt;
        if (next <= 0) { jolt = 1; next = 0.35 + Math.random() * 1.1; }
      }
      jolt = Math.max(0, jolt - dt * 3.2);
      const j = jolt * jolt;
      pivot.rotation.z = Math.sin(t * 38) * 0.07 * j;
      pivot.rotation.x = Math.sin(t * 29 + 1) * 0.04 * j;
      pivot.position.y = b.min.y + Math.abs(Math.sin(t * 19)) * 0.025 * j;
    },
  };
};

// ---------------------------------------------------------------- laptop screen
export const laptop: Builder = (c) => {
  const o = c.obj('laptop');
  if (!o) return;
  const scr = byMat(o, 'Screen')[0];
  if (!scr) return;
  planarUv(o, scr, 0, 1, false);
  const screen = createLaptopScreen();
  scr.material = new THREE.MeshBasicMaterial({ map: screen.texture, color: '#e8e8e8', toneMapped: false });
  let mode = 'idle', progress = 0, order = 'catnip';
  const sync = () => screen.set(mode, progress, order);
  sync();
  return {
    keys: {
      'laptop.screen': (v) => { mode = String(v); sync(); },
      'laptop.progress': (v) => { progress = clamp01(num(v)); sync(); },
      'laptop.order': (v) => { order = String(v); sync(); },
    },
    update: (dt) => screen.update(dt),
  };
};

// ---------------------------------------------------------------- owner's pillow: squish while kneaded, fur left behind
export const pillow: Builder = (c) => {
  const o = c.obj('bedPillow');
  if (!o) return;
  const b = localBox(o);
  const pivot = pivotize(o, new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2));
  const inner = pivot.children[0];
  const pops = popGroup();
  const w = b.max.x - b.min.x, d = b.max.z - b.min.z;
  [[-0.2, 0.05, 0.3], [0.18, -0.12, 0.28], [0.02, 0.15, 0.24]].forEach(([x, z, s], i) => {
    const m = decal(furTex(50 + i, ['#d9c3a5', '#f2efe9', '#8c7a6b']), s, s);
    stick(m, new THREE.Vector3(x * w, b.max.y - 0.012, z * d), Y, i * 1.3, 0.004);
    inner.add(m);
    pops.add(m, 0.15 + i * 0.3);
  });
  let knead = 0, pulse = 0, ph = 0;
  return {
    keys: {
      'pillow.knead': (v) => {
        const n = clamp01(num(v));
        if (n > knead + 0.001) pulse = 1;
        knead = n;
        pops.set(n);
      },
    },
    update(dt) {
      pops.update(dt);
      pulse = Math.max(0, pulse - dt * 1.2);
      ph += dt * Math.PI * 2 * 2.2;
      const squish = pulse > 0 ? (0.5 + 0.5 * Math.sin(ph)) * 0.16 * pulse : 0;
      const dent = knead * 0.12;
      pivot.scale.set(1 + squish * 0.35 + dent * 0.15, 1 - squish - dent, 1 + squish * 0.35 + dent * 0.15);
    },
  };
};

// ---------------------------------------------------------------- done marks: the salmon was eaten under the bed
export const doneMarks: Builder = (c) => {
  const spot = c.refs.spots.get('hideout');
  let bones: THREE.Object3D | null = null;
  if (spot && hasModel('fishBones')) {
    bones = cloneModel('fishBones');
    bones.position.set(spot.pos[0], c.floorY, spot.pos[2]);
    bones.rotation.y = 0.7;
    bones.visible = false;
    c.world.add(bones);
  }
  return {
    keys: {
      'done.salmon': (v) => { if (bones) bones.visible = bool(v); },
      // the delivery box is a prop (props.ts); opening it swaps in the open box model
      'package.open': (v) => setPackageOpen(bool(v)),
    },
  };
};
