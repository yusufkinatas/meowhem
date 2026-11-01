/** Placeholder Cat TV: a canvas with a bouncing bird dot. Swapped for src/tv in registry. */
import * as THREE from 'three';
import type { CatTvApi, TvShow } from '../shared/contracts';

export function createDevTv(): CatTvApi {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 144;
  const g = c.getContext('2d')!;
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  let on = false, show: TvShow = 'birds', t = 0;
  return {
    texture,
    setOn(v) { on = v; },
    setShow(s) { show = s; },
    update(dt) {
      if (!on) return;
      t += dt;
      g.fillStyle = '#9fd8ef';
      g.fillRect(0, 0, 256, 144);
      g.fillStyle = '#6fae6a';
      g.fillRect(0, 110, 256, 34);
      g.fillStyle = '#e36b4f';
      g.beginPath();
      g.arc(128 + Math.sin(t * 2) * 90, 90 - Math.abs(Math.sin(t * 5)) * 30, 10, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = '12px system-ui';
      g.fillText(`CAT TV: ${show}`, 8, 16);
      texture.needsUpdate = true;
    },
  };
}
