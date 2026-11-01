import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, puff, rand, clamp, pick } from './kit';

const SW = 820, SH = 430;
const FOCUS_SECONDS = 7;
const R = 58; // focus radius
// perches the bird hops between: ground line and tree branches
const PERCH = [
  { x: 330, y: 330 }, { x: 420, y: 336 }, { x: 520, y: 332 }, { x: 610, y: 326 }, { x: 250, y: 334 },
  { x: 128, y: 168 }, { x: 205, y: 120 }, { x: 690, y: 200 },
];

export function birdWatch(host: MinigameHost): Game {
  const f = frame(host, 'birdWatch', 'Birds', [[['WASD', '←↑→↓'], 'keep the bird in focus']]);
  const { stage } = f;

  const sky = el('div', 'bw-sky', stage);
  place(img('sun_behind_small_cloud', 'bw-sun', sky), 640, 20, 120, 120);
  const clouds = [0, 1, 2].map((i) => place(img('cloud', 'bw-cloud', sky), 120 + i * 260, 30 + (i % 2) * 50, 140 - i * 20, 140 - i * 20));
  el('div', 'bw-hill', sky);
  place(img('deciduous_tree', 'bw-tree', sky), -70, 10, 380, 380);
  place(img('deciduous_tree', 'bw-tree far', sky), 640, 120, 200, 200);
  const bird = place(img('bird', 'bw-bird', sky), 0, 0, 84, 84);
  const glass = el('div', 'bw-glass', stage);
  el('div', 'bw-frame', stage);
  const cam = el('div', 'bw-cam', stage);
  img('cat_face', 'bw-cam-top', cam);
  const jaw = img('cat_face', 'bw-cam-jaw', cam);
  const ring = el('div', 'bw-ring', stage);
  const tag = el('div', 'bw-tag', stage, 'Focused');

  let t = 0, rx = SW / 2, ry = 220, vx = 0, vy = 0, chatT = 0, botAim = { x: rx, y: ry };
  let bx = PERCH[1].x, by = PERCH[1].y, perch = 1, hopT = 1.2, hopFrom = { x: bx, y: by }, hopP = 1, hopH = 0, face = 1, peck = 0;
  const held = new Set<string>();
  const AX: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
  };

  function hop(): void {
    // short hops along the ground, sometimes a flight to a branch
    const near = PERCH.map((p, i) => i).filter((i) => i !== perch && (Math.random() < 0.25 || Math.abs(PERCH[i].y - by) < 30));
    perch = pick(near.length ? near : [0]);
    hopFrom = { x: bx, y: by };
    hopP = 0;
    const dist = Math.hypot(PERCH[perch].x - bx, PERCH[perch].y - by);
    hopH = dist > 160 ? 90 : 30;
    face = PERCH[perch].x > bx ? -1 : 1;
    hopT = rand(0.6, 1.8);
  }

  return {
    update(dt) {
      const p = f.tick();
      t += dt;
      // reticle: a little inertia so it feels like eyes, not a mouse
      let ix = 0, iy = 0;
      for (const c of held) { ix += AX[c][0]; iy += AX[c][1]; }
      vx += (ix * 420 - vx) * Math.min(1, dt * 10);
      vy += (iy * 420 - vy) * Math.min(1, dt * 10);
      rx = clamp(rx + vx * dt, 40, SW - 40);
      ry = clamp(ry + vy * dt, 40, SH - 40);
      // bird
      if (p < 0.999) {
        if (hopP < 1) {
          hopP = Math.min(1, hopP + dt / (hopH > 60 ? 0.7 : 0.28));
          bx = hopFrom.x + (PERCH[perch].x - hopFrom.x) * hopP;
          by = hopFrom.y + (PERCH[perch].y - hopFrom.y) * hopP - Math.sin(hopP * Math.PI) * hopH;
        } else {
          hopT -= dt;
          if (Math.random() < dt * 1.5) peck = 1;
          if (hopT <= 0) hop();
        }
      } else {
        bx += 260 * dt * -face;
        by -= 200 * dt;
      }
      peck = Math.max(0, peck - dt * 4);
      const flap = hopP < 1 ? Math.sin(t * 40) * 0.08 : 0;
      bird.style.transform = `translate(${bx - 42}px,${by - 70}px) scaleX(${face}) rotate(${-peck * 25}deg) scaleY(${1 + flap})`;
      clouds.forEach((c, i) => { c.style.translate = `${((t * (8 + i * 4)) % 1000) - 100}px 0`; });

      const d = Math.hypot(bx - rx, by - 40 - ry);
      const on = d < R && p < 0.999;
      if (on) host.progress(dt / FOCUS_SECONDS);
      ring.classList.toggle('on', on);
      ring.style.transform = `translate(${rx}px,${ry}px) scale(${on ? 0.85 + Math.sin(t * 20) * 0.03 : 1})`;
      // the reflection chatters its jaw
      jaw.style.translate = on ? `0 ${Math.sin(t * 90) > 0 ? 5 : 0}px` : '0 0';
      cam.classList.toggle('on', on);
      chatT -= dt;
      if (on && chatT < 0) {
        chatT = rand(0.45, 0.8);
        f.sound('chatter');
        puff(stage, 150 + rand(0, 40), SH - 150, pick(['ek ek ek', 'ek-ek', 'ekekek']), 'bw-ek');
      }
      tag.classList.toggle('on', p >= 0.999);
      glass.style.backgroundPosition = `${rx * 0.05}px 0`;
    },
    key(e, down) {
      if (!(e.code in AX)) return false;
      if (down) { held.add(e.code); if (!e.repeat) f.flash(e.code); } else held.delete(e.code);
      return true;
    },
    mouse(e) {
      if (e.type !== 'mousemove') return;
      const r = stage.getBoundingClientRect();
      rx = clamp(((e.clientX - r.left) / r.width) * SW, 40, SW - 40);
      ry = clamp(((e.clientY - r.top) / r.height) * SH, 40, SH - 40);
    },
    bot(dt) {
      botAim.x += (bx - botAim.x) * Math.min(1, dt * 3);
      botAim.y += (by - 40 - botAim.y) * Math.min(1, dt * 3);
      const want = (c: string, on: boolean) => (on ? held.add(c) : held.delete(c));
      want('ArrowRight', botAim.x - rx > 14); want('ArrowLeft', rx - botAim.x > 14);
      want('ArrowDown', botAim.y - ry > 14); want('ArrowUp', ry - botAim.y > 14);
    },
    dispose: () => f.dispose(),
  };
}
