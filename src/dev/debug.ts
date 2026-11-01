/** ?debug=1 overlay: fps, collider wireframes, nav graph. */
import * as THREE from 'three';
import type { LevelData } from '../shared/contracts';
import type { RAPIER } from '../core/physics';

export function createDebug(scene: THREE.Scene, level: LevelData, getWorld: () => RAPIER.World, getFps: () => number) {
  const label = document.createElement('div');
  label.className = 'debug-fps';
  document.body.appendChild(label);
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.6 }));
  lines.renderOrder = 20;
  lines.frustumCulled = false;
  scene.add(lines);
  const nav = new THREE.Group();
  const pts: number[] = [], cols: number[] = [];
  const byId = new Map(level.nav.nodes.map((n) => [n.id, n]));
  for (const l of level.nav.links) {
    const a = byId.get(l.a), b = byId.get(l.b);
    if (!a || !b) continue;
    pts.push(a.pos[0], a.pos[1] + 0.05, a.pos[2], b.pos[0], b.pos[1] + 0.05, b.pos[2]);
    const c = l.door ? [1, 0.3, 0.9] : l.kind === 'jump' ? [1, 0.6, 0.1] : l.catOnly ? [0.3, 0.6, 1] : [0.2, 0.9, 0.4];
    cols.push(...c, ...c);
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  ng.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const navLines = new THREE.LineSegments(ng, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
  navLines.renderOrder = 21;
  nav.add(navLines);
  const dot = new THREE.SphereGeometry(0.05, 6, 4), dm = new THREE.MeshBasicMaterial({ color: '#30d158', depthTest: false });
  for (const n of level.nav.nodes) { const m = new THREE.Mesh(dot, dm); m.position.set(...n.pos); m.renderOrder = 22; nav.add(m); }
  for (const s of level.spots) {
    const m = new THREE.Mesh(new THREE.RingGeometry(s.radius - 0.03, s.radius, 24), new THREE.MeshBasicMaterial({ color: '#ffd60a', side: THREE.DoubleSide, depthTest: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(s.pos[0], s.pos[1] + 0.03, s.pos[2]);
    m.renderOrder = 22;
    nav.add(m);
  }
  scene.add(nav);
  let n = 0;
  return {
    update() {
      label.textContent = `${Math.round(getFps())} fps`;
      if (n++ % 15) return;
      const { vertices, colors } = getWorld().debugRender();
      lines.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      lines.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
      (lines.material as THREE.LineBasicMaterial).vertexColors = true;
    },
    dispose() { label.remove(); scene.remove(lines, nav); },
  };
}
