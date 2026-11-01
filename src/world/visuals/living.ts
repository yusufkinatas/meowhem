/** Living room visuals: sofa shred, Cat TV screen, fish tank, curtains, window (birds, smudges, sun patch), cat tree sticker, plant, headlights. */
import * as THREE from 'three';
import type { WorldVisualValue } from '../../shared/contracts';
import { cloneModel, getClips, hasModel, modelInfo } from '../../assets/loader';
import { type Builder, type Feature, approach, bool, byMat, clamp01, decal, localBox, matName, meshes, num, ownMaterial, pivotize, planarUv, rng, roomCenter, stick } from './kit';
import { furTex, glowTex, paneLightTex, scratchTex, smudgeTex, soilTex, stickerTex, tearTex } from './paint';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Zp = new THREE.Vector3(0, 0, 1);
const easeBack = (k: number) => 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);

/** decals that pop in (scale overshoot) when their threshold is reached */
export function popGroup() {
  const items: { m: THREE.Object3D; at: number; base: THREE.Vector3; t: number; on: boolean }[] = [];
  return {
    add(m: THREE.Object3D, at: number) { items.push({ m, at, base: m.scale.clone(), t: 1, on: false }); m.visible = false; return m; },
    set(v: number) {
      for (const it of items) {
        const on = v >= it.at;
        if (on && !it.on) it.t = 0;
        it.on = on;
        it.m.visible = on;
      }
    },
    update(dt: number) {
      for (const it of items) {
        if (!it.on || it.t >= 1) continue;
        it.t = Math.min(1, it.t + dt / 0.28);
        const k = Math.max(0.01, easeBack(it.t));
        it.m.scale.set(it.base.x * k, it.base.y * k, it.base.z);
      }
    },
  };
}

// ---------------------------------------------------------------- sofa
export const sofa: Builder = (c) => {
  const o = c.obj('sofa');
  if (!o) return;
  const b = localBox(o);
  const front = b.max.z, top = b.max.y, w = b.max.x - b.min.x;
  // seat top: highest point of the middle front strip
  const seatY = b.min.y + (top - b.min.y) * 0.555;
  const pops = popGroup();
  const dark = '#8f5420', light = '#fff0c2';
  const add = (tex: THREE.Texture, size: number, pos: THREE.Vector3, n: THREE.Vector3, stage: number, spin = 0) => {
    const m = decal(tex, size, size);
    stick(m, pos, n, spin, 0.004);
    o.add(m);
    pops.add(m, stage);
  };
  const fy = (k: number) => b.min.y + 0.06 + (seatY - b.min.y - 0.06) * k;
  // stage 1: front panel + left arm
  add(scratchTex(11, dark, light), 0.3, new THREE.Vector3(-w * 0.22, fy(0.55), front), Zp, 1);
  add(scratchTex(12, dark, light), 0.26, new THREE.Vector3(w * 0.3, fy(0.5), front), Zp, 1, 0.3);
  add(scratchTex(13, dark, light), 0.26, new THREE.Vector3(b.min.x, fy(0.75), front - 0.22), X.clone().negate(), 1);
  // stage 2: first tear on the seat, more scratches
  add(tearTex(21, '#f5c75a', '#c48a2c'), 0.34, new THREE.Vector3(-w * 0.2, seatY, front - 0.26), Y, 2, 0.4);
  add(scratchTex(22, dark, light), 0.28, new THREE.Vector3(w * 0.05, fy(0.45), front), Zp, 2, -0.2);
  add(scratchTex(23, dark, light), 0.26, new THREE.Vector3(b.max.x, fy(0.7), front - 0.25), X, 2);
  // stage 3: ruined
  add(tearTex(31, '#f5c75a', '#c48a2c'), 0.3, new THREE.Vector3(w * 0.22, seatY, front - 0.22), Y, 3, -0.6);
  add(tearTex(32, '#f5c75a', '#c48a2c'), 0.22, new THREE.Vector3(-w * 0.38, fy(0.4), front), Zp, 3, 1.2);
  add(scratchTex(33, dark, light), 0.3, new THREE.Vector3(w * 0.12, top - 0.17, b.min.z + 0.2), Zp, 3, 0.5);
  add(furTex(34, ['#d9c3a5', '#8c7a6b']), 0.35, new THREE.Vector3(0, seatY + 0.003, front - 0.3), Y, 3);
  pops.set(0);
  return { keys: { 'sofa.shred': (v) => pops.set(num(v)) }, update: (dt) => pops.update(dt) };
};

// ---------------------------------------------------------------- tv screen
export const tv: Builder = (c) => {
  const o = c.obj('tv');
  if (!o) return;
  // the CRT glass: the biggest mesh of the bluish glass material
  const glass = byMat(o, 'mat16').map((m) => ({ m, b: localBox(o, [m]) }))
    .sort((a, b) => b.b.getSize(new THREE.Vector3()).lengthSq() - a.b.getSize(new THREE.Vector3()).lengthSq())[0];
  if (!glass) return;
  const whole = localBox(o);
  const faceMinusZ = glass.b.getCenter(new THREE.Vector3()).z < whole.getCenter(new THREE.Vector3()).z;
  planarUv(o, glass.m, 0, 1, faceMinusZ);
  const off = new THREE.MeshPhongMaterial({ color: '#1c262c', specular: '#8fa3b0', shininess: 70 });
  const onMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  let tex: THREE.Texture | null = null, on = false;
  const apply = () => {
    onMat.map = tex;
    onMat.needsUpdate = true;
    glass.m.material = on && tex ? onMat : off;
  };
  apply();
  return {
    keys: { 'tv.on': (v) => { on = bool(v); apply(); } },
    tv: (t) => { tex = t; apply(); },
  };
};

// ---------------------------------------------------------------- fish tank
export const aquarium: Builder = (c) => {
  const o = c.obj('aquarium');
  if (!o) return;
  for (const m of byMat(o, 'mat13')) m.visible = false;     // the baked fish
  if (!hasModel('fish')) return;
  const glass = byMat(o, 'mat24');
  const b = glass.length ? localBox(o, glass) : localBox(o);
  const sand = byMat(o, 'mat18');
  const floor = sand.length ? localBox(o, sand).max.y : b.min.y + 0.15;
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  const rx = (b.max.x - b.min.x) / 2 - 0.1, rz = (b.max.z - b.min.z) / 2 - 0.08;
  const y0 = floor + 0.07, y1 = b.max.y - 0.1;
  const clipName = modelInfo('fish')?.clips?.swim;
  const clip = getClips('fish').find((k) => k.name === clipName) ?? getClips('fish')[0];
  const tints = ['#ff9b3d', '#ffd23f', '#ff7aa2'];
  const fish = tints.map((tint, i) => {
    const holder = new THREE.Group();
    const f = cloneModel('fish');
    f.rotation.z = -Math.PI / 2;                              // undo the lie-on-side fix
    f.scale.setScalar(0.55);
    for (const m of meshes(f)) {
      const mat = ownMaterial<THREE.MeshToonMaterial>(m);
      if (mat.name !== 'Fins') mat.color.lerp(new THREE.Color(tint), 0.55);
    }
    holder.add(f);
    o.add(holder);
    const mixer = clip ? new THREE.AnimationMixer(f) : null;
    mixer?.clipAction(clip!).play();
    return { holder, mixer, ph: i * 2.1, sp: 0.55 + i * 0.12, y: y0 + (y1 - y0) * (0.25 + 0.3 * i), dir: i % 2 ? -1 : 1 };
  });
  let count = 3, dart = 0;
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  const set = (v: WorldVisualValue) => {
    const n = Math.max(0, Math.min(3, Math.round(num(v))));
    if (n < count) dart = 1;
    count = n;
    fish.forEach((f, i) => { f.holder.visible = i < n; });
  };
  return {
    keys: { 'tank.fish': set },
    update(dt, t) {
      dart = Math.max(0, dart - dt / 2.5);
      const boost = 1 + dart * 2.5;
      for (const f of fish) {
        if (!f.holder.visible) continue;
        f.ph += dt * f.sp * boost * f.dir;
        const a = f.ph;
        p.set(cx + Math.sin(a) * rx, f.y + Math.sin(t * 0.7 + f.sp * 9) * 0.03, cz + Math.sin(a * 2) * rz * 0.6);
        q.set(cx + Math.sin(a + 0.05 * f.dir) * rx, p.y, cz + Math.sin((a + 0.05 * f.dir) * 2) * rz * 0.6);
        f.holder.position.copy(p);
        f.holder.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
        f.mixer?.update(dt * 1.6 * boost);
      }
    },
  };
};

// ---------------------------------------------------------------- curtains
export const curtains: Builder = (c) => {
  const o = c.obj('curtains');
  if (!o) return;
  const rod = byMat(o, 'LightMetal');
  const fabric = byMat(o, 'Couch_Blue');
  const all = localBox(o);
  const rb = rod.length ? localBox(o, rod) : all;
  const fb = fabric.length ? localBox(o, fabric) : all;
  const rodY = (rb.min.y + rb.max.y) / 2, rodZ = (rb.min.z + rb.max.z) / 2;
  const pivot = pivotize(o, new THREE.Vector3(0, rodY, rodZ));
  const front = fb.max.z + 0.004;
  // claw marks climbing up the fabric
  const pops = popGroup();
  const xs = [-0.55, 0.5, -0.45, 0.6, -0.5, 0.45];
  xs.forEach((x, i) => {
    const m = decal(scratchTex(40 + i, '#7c2f1a', '#ffc4a3'), 0.24, 0.24);
    stick(m, new THREE.Vector3(x * (fb.max.x - fb.min.x) / 2, fb.min.y + 0.35 + i * 0.3, front), Zp, Math.PI / 2 + (i % 2 ? 0.3 : -0.3));
    pivot.children[0].add(m);                                 // inner group: same frame as the model
    pops.add(m, 0.08 + i * 0.16);
  });
  let climb = 0, wob = 0, down = false, fall = 0;
  const reset = () => { pivot.position.set(0, rodY, rodZ); pivot.rotation.set(0, 0, 0); pivot.scale.set(1, 1, 1); };
  return {
    keys: {
      'curtains.climb': (v) => { const n = clamp01(num(v)); if (n > climb + 0.001) wob = Math.min(1, wob + 0.5); climb = n; pops.set(n); },
      'curtains.down': (v) => { const d = bool(v); if (d && !down) fall = 0; down = d; if (!d) reset(); },
    },
    update(dt, t) {
      pops.update(dt);
      if (down) {
        // the rod lets go: one end first, then the whole thing drops forward onto the floor
        fall = Math.min(1.6, fall + dt);
        const k = Math.min(1, fall / 0.65);
        const drop = k * k;
        const settle = fall > 0.65 ? Math.exp(-(fall - 0.65) * 7) * Math.sin((fall - 0.65) * 22) * 0.06 : 0;
        pivot.position.y = rodY - (rodY - 0.06) * drop + Math.abs(settle) * 0.5;
        pivot.rotation.z = Math.min(1, fall / 0.25) * 0.12 * (1 - drop * 0.6);
        pivot.rotation.x = -Math.PI / 2 * 0.93 * drop + settle;
        pivot.scale.y = 1 - 0.35 * drop;
        return;
      }
      wob = Math.max(0, wob - dt * 0.6);
      const amp = 0.003 + wob * 0.05;                       // still air, unless someone is climbing
      pivot.rotation.x = Math.sin(t * 5.3) * amp * 0.6;
      pivot.rotation.z = Math.sin(t * 3.7) * amp;
      pivot.scale.y = 1 + climb * 0.02 + wob * 0.015 * Math.sin(t * 11);
    },
  };
};

// ---------------------------------------------------------------- window: birds, nose prints, sun patch
export const livingWindow: Builder = (c) => {
  const o = c.obj('livingWindow');
  if (!o) return;
  // the panes: 'Glass' in the model, or whatever transparent material the layout swapped in
  const glass = meshes(o, (m) => matName(m) === 'Glass' || (m.material as THREE.Material).transparent);
  const gb = glass.length ? localBox(o, glass) : localBox(o);
  const wb = localBox(o);
  // which side is the room? (smudges go inside, birds outside)
  const living = c.room('living');
  let inside = 1;
  if (living) {
    const lc = o.worldToLocal(roomCenter(living).setY(o.getWorldPosition(new THREE.Vector3()).y));
    inside = lc.z >= 0 ? 1 : -1;
  }
  const n = new THREE.Vector3(0, 0, inside);
  const feat: Feature = { keys: {} };
  // the model's panes are opaque white: make them glass so the birds (and the prints) read
  for (const m of glass) {
    if ((m.material as THREE.Material).transparent) continue;
    const g = ownMaterial<THREE.MeshToonMaterial>(m);
    g.color.set('#d9eef7');
    g.transparent = true;
    g.opacity = 0.22;
    g.depthWrite = false;
    m.castShadow = false;
    m.renderOrder = 1;
  }
  const updates: ((dt: number, t: number) => void)[] = [];

  // nose prints: 2 faint from the start, then window.smudges more
  const face = (inside > 0 ? gb.max.z : gb.min.z) + inside * 0.003;
  const spots = [[-0.42, 0.3], [0.25, 0.27], [-0.12, 0.36], [0.5, 0.33], [-0.6, 0.26], [0.05, 0.25], [0.36, 0.39], [-0.3, 0.4]];
  const faint = [[-0.25, 0.31], [0.55, 0.37]];
  const mk = (x: number, y: number, seed: number, op: number) => {
    const m = decal(smudgeTex(seed), 0.11, 0.09, { opacity: op });
    stick(m, new THREE.Vector3(x * (gb.max.x - gb.min.x) / 2, gb.min.y + y, face), n, (seed % 5) * 0.3, 0);
    o.add(m);
    return m;
  };
  faint.forEach(([x, y], i) => mk(x, y, 90 + i, 0.45));
  const pops = popGroup();
  spots.forEach(([x, y], i) => pops.add(mk(x, y, 60 + i, 0.9), i + 1));
  pops.set(0);
  feat.keys!['window.smudges'] = (v) => pops.set(num(v));
  updates.push((dt) => pops.update(dt));

  // sun patch on the floor inside, tinted and stretched at dusk
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: paneLightTex(), color: '#fff0c8', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  patch.renderOrder = 1;
  patch.raycast = () => {};
  // world space: the layout may scale the window, the patch must stay flat on the floor
  o.updateWorldMatrix(true, false);
  const sc = o.getWorldScale(new THREE.Vector3());
  const W = (gb.max.x - gb.min.x) * sc.x * 0.95, H = (gb.max.y - gb.min.y) * sc.y;
  const base = o.localToWorld(new THREE.Vector3((gb.min.x + gb.max.x) / 2, 0, inside > 0 ? wb.max.z : wb.min.z));
  const inward = new THREE.Vector3(0, 0, inside).transformDirection(o.matrixWorld).setY(0).normalize();
  const yaw = Math.atan2(inward.x, inward.z);
  c.world.add(patch);
  let dusk = 0, lights = 1, lightsT = 1;
  const placePatch = () => {
    const depth = H * (0.75 + dusk * 0.9);
    patch.scale.set(W * (1 + dusk * 0.1), depth, 1);
    patch.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ');
    patch.position.copy(base).addScaledVector(inward, 0.25 + depth / 2 + dusk * 0.2).setY(c.floorY + 0.004);
    const m = patch.material as THREE.MeshBasicMaterial;
    m.color.set('#fff0c8').lerp(new THREE.Color('#ff9a52'), dusk);
    m.opacity = (0.45 - dusk * 0.08) * lights;
  };
  placePatch();
  feat.keys!['time.dusk'] = (v) => { dusk = clamp01(num(v)); placePatch(); };
  feat.keys!['lights'] = (v) => { lightsT = bool(v) ? 1 : 0.35; };
  updates.push((dt) => { if (Math.abs(lights - lightsT) > 0.002) { lights = approach(lights, lightsT, 5, dt); placePatch(); } });

  // birds on the outside sill
  if (hasModel('bird')) {
    const sillY = gb.min.y - 0.01;
    const outZ = -inside * (Math.max(Math.abs(wb.min.z), Math.abs(wb.max.z)) + 0.05);
    const r = rng(5);
    const birds = [0, 1, 2].map((i) => {
      const g = new THREE.Group();
      const b = cloneModel('bird');
      b.scale.setScalar(0.85);
      g.add(b);
      g.visible = false;
      o.add(g);
      const x = (i - 1) * 0.4;
      g.position.set(x, sillY, outZ);
      return { g, b, wl: b.getObjectByName('wing-left'), wr: b.getObjectByName('wing-right'), x, tx: x, hop: 1, yaw: 0, tyaw: 0, next: 0.5 + i * 0.7, peck: 0, k: 0 };
    });
    let want = false;
    feat.keys!['window.birds'] = (v) => { want = bool(v); };
    const half = (gb.max.x - gb.min.x) / 2 - 0.12;
    updates.push((dt, t) => {
      for (const bd of birds) {
        bd.k = approach(bd.k, want ? 1 : 0, want ? 3 : 5, dt);
        bd.g.visible = bd.k > 0.02;
        if (!bd.g.visible) continue;
        const fly = 1 - bd.k;
        bd.next -= dt;
        if (bd.next <= 0 && bd.hop >= 1) {
          const roll = r();
          if (roll < 0.45) { bd.tx = Math.max(-half, Math.min(half, bd.x + (r() - 0.5) * 0.5)); bd.hop = 0; }
          else if (roll < 0.75) bd.peck = 1;
          else bd.tyaw = r() < 0.4 ? (inside > 0 ? 0 : Math.PI) : (r() - 0.5) * 3;
          bd.next = 0.4 + r() * 1.2;
        }
        let y = 0;
        if (bd.hop < 1) {
          bd.hop = Math.min(1, bd.hop + dt / 0.22);
          const s = bd.hop;
          y = Math.sin(Math.PI * s) * 0.05;
          const x0 = bd.x;
          bd.g.position.x = x0 + (bd.tx - x0) * s;
          bd.tyaw = bd.tx > x0 ? Math.PI / 2 : -Math.PI / 2;
          if (s >= 1) bd.x = bd.tx;
        }
        bd.yaw = approach(bd.yaw, bd.tyaw, 10, dt);
        bd.peck = Math.max(0, bd.peck - dt * 4);
        bd.g.rotation.set(Math.sin(bd.peck * Math.PI) * 0.6, bd.yaw, 0);
        bd.g.position.y = sillY + y + fly * 0.7;
        bd.g.position.z = outZ - inside * fly * 0.8;
        bd.g.scale.setScalar(Math.max(0.01, bd.k));
        const flap = fly > 0.02 || bd.hop < 1 ? Math.sin(t * 40) * 0.9 : 0;
        if (bd.wl) bd.wl.rotation.z = flap;
        if (bd.wr) bd.wr.rotation.z = -flap;
      }
    });
  }
  feat.update = (dt, t) => { for (const u of updates) u(dt, t); };
  return feat;
};

// ---------------------------------------------------------------- the $89.99 sticker on the cat tree
export const catTree: Builder = (c) => {
  const o = c.obj('catTree');
  if (!o) return;
  const b = localBox(o);
  const baseTop = b.min.y + Math.min(0.06, (b.max.y - b.min.y) * 0.035);
  const m = decal(stickerTex(), 0.12, 0.06);
  stick(m, new THREE.Vector3((b.min.x + b.max.x) / 2 + 0.03, baseTop, b.max.z - 0.07), Y, 0.18, 0.003);
  o.add(m);
};

// ---------------------------------------------------------------- plant dug
export const plant: Builder = (c) => {
  const o = c.obj('bigPlant');
  if (!o) return;
  const b = localBox(o);
  const h = b.max.y - b.min.y;
  const soilY = b.min.y + h * 0.28;
  const crater = decal(soilTex(3), 0.42, 0.42);
  stick(crater, new THREE.Vector3(0.02, soilY, 0.02), Y, 0.5, 0.004);
  const spill = decal(soilTex(8), 0.5, 0.36);
  stick(spill, new THREE.Vector3(0.05, b.min.y, b.max.z * 0.75 + 0.12), Y, 0.2, 0.004);
  o.add(crater, spill);
  const set = (v: number) => {
    const k = clamp01(v);
    crater.visible = spill.visible = k > 0.01;
    crater.scale.set(0.42 * (0.5 + k * 0.5), 0.42 * (0.5 + k * 0.5), 1);
    spill.scale.set(0.5 * k, 0.36 * k, 1);
  };
  set(0);
  return { keys: { 'plant.dug': (v) => set(num(v)) } };
};

// ---------------------------------------------------------------- owners' headlights sweeping the living-room ceiling
export const headlights: Builder = (c) => {
  const room = c.room('living');
  if (!room) return;
  const ceilY = room.max[1] - 0.015;
  const win = c.obj('livingWindow');
  const center = roomCenter(room);
  // sweep axis: along the window wall, starting on the window side
  let along = new THREE.Vector3(1, 0, 0), inward = new THREE.Vector3(0, 0, 1), start = center.clone();
  if (win) {
    const wp = win.getWorldPosition(new THREE.Vector3());
    along = new THREE.Vector3(1, 0, 0).applyQuaternion(win.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    inward = center.clone().sub(wp).setY(0).normalize();
    start = wp.clone();
  }
  const halfX = Math.abs(along.x) > 0.7 ? (room.max[0] - room.min[0]) / 2 : (room.max[2] - room.min[2]) / 2;
  const mat = new THREE.MeshBasicMaterial({ map: paneLightTex(), color: '#fff6dc', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const glow = new THREE.MeshBasicMaterial({ map: glowTex(), color: '#ffe9b8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), mat);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.0), glow);
  for (const m of [a, halo]) { m.rotation.x = Math.PI / 2; m.renderOrder = 3; m.raycast = () => {}; g.add(m); }
  halo.position.y = 0.002;
  g.visible = false;
  c.world.add(g);
  let prev = false, t = -1;
  return {
    keys: { 'owners.headlights': (v) => { const on = bool(v); if (on && !prev) t = 0; prev = on; } },
    update(dt) {
      if (t < 0) return;
      t += dt;
      const k = Math.min(1, t / 2.5);
      g.visible = k < 1;
      if (k >= 1) { t = -1; return; }
      const s = k * k * (3 - 2 * k);
      const env = Math.sin(Math.PI * k);
      const depth = 0.8 + 1.6 * Math.sin(Math.PI * k);
      g.position.copy(start).addScaledVector(along, (s * 2 - 1) * halfX * 0.95).addScaledVector(inward, depth).setY(ceilY);
      g.rotation.y = Math.atan2(along.x, along.z) + (s - 0.5) * 0.9;
      g.scale.set(1 + env * 0.4, 1, 1 - env * 0.15);
      mat.opacity = env * 0.65;
      glow.opacity = env * 0.35;
    },
  };
};
