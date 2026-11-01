/**
 * Placeholder models (capsule cat, capsule human, shape props, flat mess). Dev only: registry swaps
 * these for the real downloaded-model wrappers in src/models/**.
 */
import * as THREE from 'three';
import type { CatLook, CatModelApi, CatVisualState, MessKind, PropKind, SitterLook, SitterModelApi, SitterVisualState } from '../shared/contracts';
import { PROP_DEFS } from '../shared/propDefs';
import { toon } from '../shared/toon';

const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 12);

export function createDevCat(look: CatLook): CatModelApi {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const furMat = toon(look.furColor, { unique: true });
  const secMat = toon(look.secondaryColor, { unique: true });
  const body = new THREE.Mesh(capsule(0.12, 0.2), furMat);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.16, -0.02);
  body.castShadow = true;
  rig.add(body);
  const head = new THREE.Group();
  head.position.set(0, 0.3, 0.16);
  rig.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), furMat);
  skull.castShadow = true;
  head.add(skull);
  const earGeo = new THREE.ConeGeometry(0.05, 0.09, 4);
  const ears: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(earGeo, secMat);
    e.position.set(sx * 0.07, 0.12, 0);
    e.rotation.z = -sx * 0.3;
    head.add(e);
    ears.push(e);
  }
  const eyeMat = toon('#2a2320');
  const eyes: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), eyeMat);
    e.position.set(sx * 0.05, 0.02, 0.115);
    head.add(e);
    eyes.push(e);
  }
  const tail = new THREE.Mesh(capsule(0.03, 0.22), secMat);
  tail.position.set(0, 0.28, -0.22);
  tail.rotation.x = -0.6;
  rig.add(tail);
  const scruffAnchor = new THREE.Object3D();
  scruffAnchor.position.set(0, 0.36, 0.08);
  rig.add(scruffAnchor);
  const mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0, -0.05, 0.13);
  head.add(mouthAnchor);
  let t = 0;
  return {
    root, scruffAnchor, mouthAnchor,
    setLook(l) { furMat.color.set(l.furColor); secMat.color.set(l.secondaryColor); },
    update(dt, s: CatVisualState) {
      t += dt;
      const moving = s.speed > 0.2;
      rig.position.y = moving && s.grounded ? Math.abs(Math.sin(t * s.speed * 4)) * 0.03 : 0;
      const sq = s.grounded ? 1 : 1 + Math.max(-0.2, Math.min(0.2, s.vy * 0.04));
      const low = s.anim === 'loaf' || s.anim === 'sleep' || s.anim === 'pounceCharge' || s.anim === 'crouch';
      rig.scale.set(1 / Math.sqrt(sq), (low ? 0.75 : 1) * sq, 1 / Math.sqrt(sq));
      rig.scale.multiplyScalar(s.puffed ? 1.15 : s.wet > 0.2 ? 0.92 : 1);
      rig.rotation.x = s.anim === 'grabbed' ? -1.2 : s.anim === 'sit' || s.anim === 'hypnotized' || s.anim === 'caged' ? -0.35 : 0;
      rig.rotation.z = s.anim === 'stunned' || s.dizzy ? Math.sin(t * 12) * 0.15 : s.anim === 'pounceCharge' ? Math.sin(t * 30) * 0.08 * (s.pounceCharge ?? 0) : 0;
      tail.rotation.z = Math.sin(t * 3) * 0.5;
      for (const e of ears) e.rotation.x = s.puffed || s.wet > 0.2 ? -0.9 : 0;
      const blink = (t % 3.7) < 0.12 || s.face === 'sleepy' || s.anim === 'sleep';
      for (const e of eyes) e.scale.y = blink ? 0.15 : s.face === 'shock' || s.high ? 1.4 : 1;
      head.rotation.x = s.talk ? -0.25 : 0;
      head.rotation.y = s.anim === 'swipe' ? 0.3 : 0;
      furMat.color.set(look.furColor).multiplyScalar(1 - s.wet * 0.3);
    },
    dispose() { root.removeFromParent(); },
  };
}

export function createDevSitter(look: SitterLook): SitterModelApi {
  const root = new THREE.Group();
  const shirt = toon(look.shirt, { unique: true });
  const skin = toon(look.skin, { unique: true });
  const body = new THREE.Mesh(capsule(0.27, 0.65), shirt);
  body.position.y = 0.6;
  body.castShadow = true;
  root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), skin);
  head.position.y = 1.48;
  head.castShadow = true;
  root.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(look.hair));
  hair.position.y = 1.52;
  root.add(hair);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), toon('#2a2320'));
    e.position.set(sx * 0.08, 1.5, 0.21);
    root.add(e);
  }
  const arms: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.33, 1.1, 0);
    const arm = new THREE.Mesh(capsule(0.06, 0.45), shirt);
    arm.position.y = -0.28;
    arm.castShadow = true;
    pivot.add(arm);
    root.add(pivot);
    arms.push(pivot);
  }
  const holdAnchor = new THREE.Object3D();
  holdAnchor.position.set(0, 1.3, 0.62);
  root.add(holdAnchor);
  const sprayNozzle = new THREE.Object3D();
  sprayNozzle.position.set(0.3, 1.15, 0.55);
  root.add(sprayNozzle);
  let t = 0;
  return {
    root, holdAnchor, sprayNozzle,
    setLook(l) { shirt.color.set(l.shirt); skin.color.set(l.skin); },
    update(dt, s: SitterVisualState) {
      t += dt;
      const swing = s.speed > 0.2 ? Math.sin(t * s.speed * 3) * 0.6 : 0;
      const reach = s.carrying || s.anim === 'carry' ? -1.45 : s.anim === 'spray' ? -1.3 - s.aimPitch : s.anim === 'clean' || s.anim === 'scoop' ? -0.9 + Math.sin(t * 10) * 0.2 : null;
      arms[0].rotation.x = reach ?? swing;
      arms[1].rotation.x = s.anim === 'spray' ? -1.3 - s.aimPitch : reach !== null && s.carrying ? reach : s.anim === 'shakeTreats' ? -2.4 + Math.sin(t * 30) * 0.2 : -swing;
      root.position.y = 0;
      body.scale.y = s.grounded ? 1 : 1 + Math.max(-0.1, Math.min(0.1, s.vy * 0.03));
      head.rotation.z = s.anim === 'stunned' ? Math.sin(t * 10) * 0.2 : 0;
    },
    dispose() { root.removeFromParent(); },
  };
}

const PROP_COLOR: Partial<Record<PropKind, string>> = {
  mug: '#f4f1ea', glass: '#bfe4f2', plate: '#ffffff', vase: '#5fa8d3', book: '#d9534f', remote: '#333338',
  plantPot: '#c4704f', frame: '#c9a46a', wineBottle: '#3f6b45', cerealBox: '#f2c14e', toyMouse: '#9c9c9c', yarn: '#e86a92',
  phone: '#2b2b30', candle: '#fff3d6', tpRoll: '#ffffff', salmon: '#f59d7c', package: '#c99a62', pillow: '#f2efe9',
  bowl: '#e58b6d', shoe: '#5b6b8c', sock: '#f4b942', cucumber: '#5c9e4f', lamp: '#f6d58e', trophy: '#e8b730',
};

export function createDevProp(kind: PropKind): THREE.Object3D {
  const d = PROP_DEFS[kind];
  const geo = d.shape === 'box' ? new THREE.BoxGeometry(d.half![0] * 2, d.half![1] * 2, d.half![2] * 2)
    : d.shape === 'cyl' ? new THREE.CylinderGeometry(d.r!, d.r!, d.hh! * 2, 14) : new THREE.SphereGeometry(d.r!, 12, 10);
  const m = new THREE.Mesh(geo, toon(PROP_COLOR[kind] ?? '#cccccc'));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const MESS_LOOK: Record<MessKind, [string, number]> = {
  shards: ['#dfeef5', 0.22], poop: ['#6b4a2e', 0.12], hairball: ['#b08a6a', 0.08], soil: ['#6e4a30', 0.3], fur: ['#d9c3a5', 0.2],
  puddle: ['#8fd0ea', 0.45], litter: ['#d8cfc0', 0.2], tp: ['#ffffff', 0.35], fish: ['#f29e4c', 0.1], catnip: ['#8bc34a', 0.25], food: ['#e9c46a', 0.25],
};

export function createDevMess(kind: MessKind): THREE.Object3D {
  const [color, r] = MESS_LOOK[kind];
  const g = new THREE.Group();
  const lump = kind === 'poop' || kind === 'hairball' || kind === 'fish';
  const m = lump
    ? new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), toon(color))
    : new THREE.Mesh(new THREE.CircleGeometry(r, 14), toon(color, { transparent: kind === 'puddle', opacity: 0.8 }));
  if (lump) { m.scale.y = 0.6; m.position.y = r * 0.5; } else { m.rotation.x = -Math.PI / 2; m.position.y = 0.006; }
  m.receiveShadow = true;
  g.add(m);
  return g;
}
