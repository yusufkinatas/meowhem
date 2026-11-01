/** Bathroom visuals: tub water + stream + rubber duck, flood sheet, toilet paper ribbon + avalanche, litter box. */
import * as THREE from 'three';
import { cloneModel, hasModel, modelInfo } from '../../assets/loader';
import { type Builder, approach, bool, byMat, clamp01, decal, localBox, num } from './kit';
import { paperTex, rippleTex, ringTex, stinkTex, streamTex } from './paint';
import { gradientMap } from '../../shared/toon';

/** vector given in `root`-local space, expressed in `node.parent`'s space (includes the model's scale) */
function parentDelta(root: THREE.Object3D, node: THREE.Object3D, v: THREE.Vector3): THREE.Vector3 {
  root.updateWorldMatrix(true, true);
  const m = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(node.parent!.matrixWorld).invert();
  return v.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(m));
}

// ---------------------------------------------------------------- bathtub: water level, running stream, duck
export const bathtub: Builder = (c) => {
  const o = c.obj('bathtub');
  if (!o) return;
  const water = o.getObjectByName(modelInfo('bathtub')?.nodes?.water ?? 'bath_water');
  const bath = byMat(o, 'tiny_treats_1').filter((m) => m !== water && !m.parent?.name.includes('water'));
  const tubBox = localBox(o, bath.length ? bath : undefined);
  const wb = water ? localBox(o, [water as THREE.Mesh]) : new THREE.Box3(new THREE.Vector3(-0.4, 0.4, -0.65), new THREE.Vector3(0.4, 0.54, 0.7));
  const fullTop = wb.max.y, lowTop = tubBox.min.y + 0.16;
  const p0 = water?.position.clone(), s0 = water?.scale.clone();
  const down = water ? parentDelta(o, water, new THREE.Vector3(0, fullTop - lowTop, 0)) : null;
  // faucet spout: the highest part at the far end
  const spout = new THREE.Vector3(0, tubBox.max.y - 0.13, wb.min.z + 0.27);
  const stream = new THREE.Group();
  const sMat = new THREE.MeshBasicMaterial({ map: streamTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  for (const r of [0, Math.PI / 2]) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 1), sMat);
    q.rotation.y = r;
    q.position.y = -0.5;
    stream.add(q);
  }
  stream.position.copy(spout);
  stream.visible = false;
  const ring = decal(ringTex(), 0.16, 0.16, { basic: true, opacity: 0.8 });
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  o.add(stream, ring);
  // the rubber duck
  const duck = hasModel('ducky') ? cloneModel('ducky') : null;
  if (duck) { duck.visible = false; duck.scale.setScalar(1.15); o.add(duck); }
  let level = 0, shown = 0, running = false;
  const top = () => lowTop + (fullTop - lowTop) * shown;
  const apply = () => {
    if (!water || !p0 || !s0 || !down) return;
    water.visible = shown > 0.01;
    water.position.copy(p0).addScaledVector(down, -(1 - shown));
    const k = 0.78 + 0.22 * shown;
    water.scale.set(s0.x * k, s0.y, s0.z * k);
  };
  apply();
  return {
    keys: {
      'tub.water': (v) => { level = clamp01(num(v)); },
      'tub.running': (v) => { running = bool(v); },
    },
    update(dt, t) {
      if (Math.abs(shown - level) > 0.001) { shown = approach(shown, level, 3, dt); if (Math.abs(shown - level) < 0.002) shown = level; apply(); }
      const surface = shown > 0.01 ? top() : tubBox.min.y + 0.06;
      stream.visible = running;
      ring.visible = running;
      if (running) {
        const len = Math.max(0.05, spout.y - surface);
        stream.scale.y = len;
        sMat.map!.offset.y = (t * 2.6) % 1;
        sMat.map!.repeat.y = len * 3;
        ring.position.set(spout.x, surface + 0.006, spout.z);
        const pulse = (t * 2.2) % 1;
        ring.scale.set(0.08 + pulse * 0.16, 0.08 + pulse * 0.16, 1);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - pulse);
      }
      if (duck) {
        duck.visible = shown > 0.04;
        if (duck.visible) {
          const chop = running ? 1.6 : 1;
          duck.position.set(
            Math.sin(t * 0.21) * (wb.max.x - wb.min.x) * 0.28,
            top() - 0.012 + Math.sin(t * Math.PI * 1.2) * 0.01 * chop,
            (wb.min.z + wb.max.z) / 2 + 0.12 + Math.sin(t * 0.13 + 1) * (wb.max.z - wb.min.z) * 0.22,
          );
          duck.rotation.set(Math.sin(t * 3.1) * 0.05 * chop, t * 0.25, Math.sin(t * 2.3) * 0.06 * chop);
        }
      }
    },
  };
};

// ---------------------------------------------------------------- flood: a water sheet over bathroom + hallway floors
export const flood: Builder = (c) => {
  const rooms = (['bathroom', 'hallway'] as const).map((id) => c.room(id)).filter((r) => !!r);
  if (!rooms.length) return;
  const water = new THREE.MeshPhongMaterial({ color: '#79c4ea', specular: '#ffffff', shininess: 90, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const sheets: THREE.Mesh[] = [];
  const ripples: THREE.MeshBasicMaterial[] = [];
  const g = new THREE.Group();
  for (const r of rooms) {
    const w = r!.max[0] - r!.min[0], d = r!.max[2] - r!.min[2];
    const geo = new THREE.PlaneGeometry(w, d);
    const sheet = new THREE.Mesh(geo, water);
    const tex = rippleTex().clone();
    tex.needsUpdate = true;
    tex.repeat.set(w / 1.6, d / 1.6);
    const rip = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    ripples.push(rip);
    const ripple = new THREE.Mesh(geo, rip);
    for (const m of [sheet, ripple]) {
      m.rotation.x = -Math.PI / 2;
      m.position.set((r!.min[0] + r!.max[0]) / 2, 0, (r!.min[2] + r!.max[2]) / 2);
      m.renderOrder = 1;
      m.raycast = () => {};
      g.add(m);
    }
    sheet.receiveShadow = true;
    sheets.push(sheet, ripple);
  }
  g.visible = false;
  c.world.add(g);
  let target = 0, k = 0;
  return {
    keys: { flood: (v) => { target = clamp01(num(v)); } },
    update(dt, t) {
      if (k === 0 && target === 0) return;
      k = approach(k, target, 1.5, dt);
      if (target === 0 && k < 0.005) k = 0;
      g.visible = k > 0.004;
      const y = c.floorY + 0.008 + k * 0.025;
      for (const m of sheets) m.position.y = y;
      water.opacity = 0.18 + 0.4 * k;
      ripples.forEach((m, i) => {
        m.opacity = 0.18 + 0.22 * k;
        m.map!.offset.set((t * 0.03 * (i % 2 ? 1 : -1)) % 1, (t * 0.045) % 1);
      });
    },
  };
};

// ---------------------------------------------------------------- toilet paper: hanging ribbon + avalanche
export const toiletPaper: Builder = (c) => {
  const o = c.obj('tpHolder');
  if (!o) return;
  const roll = byMat(o, 'White');
  const rb = roll.length ? localBox(o, roll) : localBox(o);
  const cx = (rb.min.x + rb.max.x) / 2, cy = (rb.min.y + rb.max.y) / 2, front = rb.max.z + 0.002;
  const width = (rb.max.x - rb.min.x) * 0.85;
  const wpos = o.getWorldPosition(new THREE.Vector3());
  const floorLocal = o.worldToLocal(wpos.setY(c.floorY)).y + 0.004;
  const drop = cy - floorLocal;
  const SEG = 40;
  const geo = new THREE.PlaneGeometry(width, 1, 1, SEG);
  const tex = paperTex().clone();
  tex.needsUpdate = true;
  const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: gradientMap(), side: THREE.DoubleSide });
  const strip = new THREE.Mesh(geo, mat);
  strip.castShadow = true;
  strip.visible = false;
  strip.frustumCulled = false;
  o.add(strip);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  let len = 0, lenT = 0, sway = 0;
  const shape = (t: number) => {
    // vertex rows run top (j=0) to bottom; arc length s along the ribbon
    for (let j = 0; j <= SEG; j++) {
      const s = (j / SEG) * len;
      for (let i = 0; i < 2; i++) {
        const vi = j * 2 + i;
        const x = cx + (i ? width / 2 : -width / 2);
        if (s <= drop) {
          const wave = Math.sin(s * 9 - t * 2) * 0.008 * (s / Math.max(0.2, drop)) + sway * Math.sin(t * 6) * 0.03 * (s / Math.max(0.2, drop));
          pos.setXYZ(vi, x + wave * 0.5, cy - s, front + 0.002 + s * 0.04 + wave);
        } else {
          const e = s - drop;
          pos.setXYZ(vi, x + Math.sin(e * 7) * 0.05, floorLocal + 0.002, front + drop * 0.04 + e * 0.9);
        }
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    tex.repeat.set(1, len / 0.11);
  };
  // avalanche: a heap of the downloaded tp mess model under the holder
  const heap: { m: THREE.Object3D; s: number; t: number }[] = [];
  if (hasModel('tp')) {
    const spots: [number, number, number, number][] = [[-0.1, 0.32, 0.75, 0.3], [0.17, 0.42, 0.62, 1.9], [0.02, 0.6, 0.85, 4.1], [-0.2, 0.62, 0.5, 2.6]];
    for (const [x, z, s, yaw] of spots) {
      const m = cloneModel('tp');
      m.position.set(cx + x, floorLocal, front + z);
      m.rotation.y = yaw;
      m.visible = false;
      o.add(m);
      heap.push({ m, s, t: 1 });
    }
  }
  let avalanche = false;
  return {
    keys: {
      'tp.unrolled': (v) => { const n = clamp01(num(v)); if (n > lenT / Math.max(0.01, drop + 0.6) + 0.01) sway = 1; lenT = n * (drop + 0.6); },
      'tp.avalanche': (v) => {
        const on = bool(v);
        if (on && !avalanche) heap.forEach((h, i) => { h.t = -i * 0.12; });
        avalanche = on;
        for (const h of heap) h.m.visible = on && h.t >= 0;
      },
    },
    update(dt, t) {
      sway = Math.max(0, sway - dt * 1.5);
      if (Math.abs(len - lenT) > 0.002) len = approach(len, lenT, 6, dt);
      strip.visible = len > 0.01;
      if (strip.visible) shape(t);
      for (const h of heap) {
        if (!avalanche || h.t >= 1) continue;
        h.t = Math.min(1, h.t + dt / 0.35);
        h.m.visible = h.t >= 0;
        const k = Math.max(0.01, h.t < 0 ? 0 : 1 + 2.2 * Math.pow(h.t - 1, 3) + 1.2 * Math.pow(h.t - 1, 2));
        h.m.scale.set(h.s * k, h.s * k * (h.t < 1 ? 1.1 : 1), h.s * k);
      }
    },
  };
};

// ---------------------------------------------------------------- litter box: poops on the sand, stink lines
export const litter: Builder = (c) => {
  const o = c.obj('litterBox');
  if (!o) return;
  const b = localBox(o);
  // the sand sits in the back half of the tray (the front half is the entry lip)
  const sandY = b.min.y + (b.max.y - b.min.y) * 0.72;
  const hw = (b.max.x - b.min.x) / 2, hd = (b.max.z - b.min.z) / 2;
  const sz = b.min.z + hd * 0.55;
  const poops: THREE.Object3D[] = [];
  if (hasModel('poop')) {
    const spots: [number, number, number][] = [[-0.4, -0.1, 0.4], [0.35, 0.15, 2.2], [0.05, -0.2, 4], [-0.1, 0.3, 1.1], [0.55, -0.25, 5.3]];
    for (const [x, z, yaw] of spots) {
      const p = cloneModel('poop');
      p.position.set(x * hw, sandY - 0.012, sz + z * hd * 0.5);
      p.rotation.y = yaw;
      p.scale.setScalar(0.62);
      p.visible = false;
      o.add(p);
      poops.push(p);
    }
  }
  const lines = [0, 1, 2].map((i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: stinkTex(), transparent: true, depthWrite: false, opacity: 0 }));
    s.scale.set(0.07, 0.2, 1);
    s.position.set((i - 1) * hw * 0.55, sandY + 0.15, sz + (i % 2 ? -0.2 : 0.15) * hd);
    s.visible = false;
    o.add(s);
    return s;
  });
  let stink = false, k = 0;
  return {
    keys: {
      'litter.fill': (v) => {
        const f = clamp01(num(v));
        const n = f <= 0 ? 0 : Math.max(1, Math.round(f * 4));
        poops.forEach((p, i) => { p.visible = i < n; });
      },
      'litter.stink': (v) => { stink = bool(v); },
    },
    update(dt, t) {
      k = approach(k, stink ? 1 : 0, 3, dt);
      lines.forEach((s, i) => {
        s.visible = k > 0.01;
        if (!s.visible) return;
        const ph = (t * 0.45 + i / 3) % 1;
        s.position.y = sandY + 0.1 + ph * 0.22;
        s.material.opacity = k * Math.sin(Math.PI * ph) * 0.9;
        s.material.rotation = Math.sin(t * 2 + i) * 0.15;
      });
    },
  };
};
