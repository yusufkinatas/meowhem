/** Placeholder FX: soft sprite puffs + canvas text. Swapped for src/fx in registry. */
import * as THREE from 'three';
import type { FxApi, FxKind, FxOptions } from '../shared/contracts';

const COLORS: Partial<Record<FxKind, string>> = {
  shatter: '#dfeef5', dust: '#d9c3a5', fightCloud: '#e8dccb', stink: '#9bbf5a', sparkle: '#fff2a8', splash: '#8fd0ea',
  spray: '#bfe9ff', hearts: '#ff7aa2', zzz: '#ffffff', question: '#ffd166', exclaim: '#ff6b5a', confetti: '#ffb3c7',
  furPoof: '#f3e2c7', catnipHaze: '#9be36b', poof: '#ffffff', stars: '#ffe066', tpBurst: '#ffffff', scratchMarks: '#a0785a',
  noteMusic: '#c9a7ff', anger: '#ff5a4f', sweat: '#9fd8ff', ding: '#fff2a8',
};

let dot: THREE.Texture | null = null;
const dotTex = () => {
  if (dot) return dot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  dot = new THREE.CanvasTexture(c);
  return dot;
};

interface P { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number; follow?: THREE.Object3D; off: THREE.Vector3; grow: number }

export function createDevFx(scene: THREE.Scene): FxApi {
  const parts: P[] = [];
  const add = (pos: THREE.Vector3, color: string, n: number, speed: number, life: number, size: number, o: FxOptions = {}) => {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color, transparent: true, depthWrite: false }));
      s.scale.setScalar(size);
      s.position.copy(pos);
      scene.add(s);
      const v = new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed);
      if (o.dir) v.addScaledVector(o.dir, speed * 2.5);
      parts.push({ s, v, life: life * (0.7 + Math.random() * 0.6), max: life, follow: o.follow, off: new THREE.Vector3(), grow: 1 });
    }
  };
  return {
    spawn(kind, pos, o = {}) {
      const color = o.color ?? COLORS[kind] ?? '#ffffff';
      const sc = o.scale ?? 1;
      if (kind === 'fightCloud' || kind === 'stink' || kind === 'catnipHaze') {
        const dur = o.duration ?? 4;
        for (let t = 0; t < dur; t += 0.25) setTimeout(() => add(pos.clone().add(new THREE.Vector3(0, 0.25, 0)), color, 3, 1.2, 0.7, 0.35 * sc), t * 1000);
      } else if (kind === 'spray') add(pos, color, 10, 0.6, 0.45, 0.12, o);
      else add(pos, color, kind === 'confetti' || kind === 'shatter' ? 14 : 7, 1.6, 0.6, 0.16 * sc, o);
    },
    text(text, pos, o = {}) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 64;
      const g = c.getContext('2d')!;
      g.font = 'bold 40px system-ui, sans-serif';
      g.textAlign = 'center';
      g.lineWidth = 6;
      g.strokeStyle = '#3a2a22';
      g.strokeText(text, 128, 46);
      g.fillStyle = o.color ?? '#ffffff';
      g.fillText(text, 128, 46);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, depthTest: false }));
      const sz = o.size ?? 0.5;
      s.scale.set(sz * 4, sz, 1);
      s.position.copy(pos);
      s.renderOrder = 10;
      scene.add(s);
      parts.push({ s, v: new THREE.Vector3(0, 0.5, 0), life: o.duration ?? 1.2, max: o.duration ?? 1.2, follow: o.follow, off: new THREE.Vector3(), grow: 0 });
    },
    update(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt;
        if (p.life <= 0) {
          scene.remove(p.s);
          p.s.material.map !== dot && p.s.material.map?.dispose();
          p.s.material.dispose();
          parts.splice(i, 1);
          continue;
        }
        p.off.addScaledVector(p.v, dt);
        p.v.y -= p.grow ? 1.5 * dt : 0;
        if (p.follow) p.s.position.copy(p.follow.position).add(p.off); else p.s.position.addScaledVector(p.v, dt);
        p.s.material.opacity = Math.min(1, p.life / (p.max * 0.5));
        if (p.grow) p.s.scale.multiplyScalar(1 + dt * 0.8);
      }
    },
    dispose() { for (const p of parts) scene.remove(p.s); parts.length = 0; },
  };
}
