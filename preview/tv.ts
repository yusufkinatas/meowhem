import * as THREE from 'three';
import { createCatTv } from '../src/tv/catTv';
import type { TvShow } from '../src/shared/contracts';

// ?show=birds&t=5 freezes a frame, ?grid=birds renders six frames of one show, ?off=1 shows the off screen
const q = new URLSearchParams(location.search);
const SHOWS: TvShow[] = ['birds', 'rickAndMeowty', 'planetMearth', 'cucumber', 'laserDot', 'cookingShow'];
const LEN: Record<TvShow, number> = { birds: 14, rickAndMeowty: 15, planetMearth: 15, cucumber: 14, laserDot: 12.5, cookingShow: 13 };
const tv = createCatTv();
const canvas = tv.texture.image as HTMLCanvasElement;
const $ = (id: string) => document.getElementById(id)!;

const gridShow = q.get('grid') as TvShow | null;
if (gridShow) {
  const times = (q.get('times') ?? '').split(',').filter(Boolean).map(Number);
  const ts = times.length ? times : [0, 1, 2, 3, 4, 5].map((i) => (LEN[gridShow] * (i + 0.5)) / 6);
  const cw = 512, ch = 288, cols = 2, rows = Math.ceil(ts.length / cols);
  const out = document.createElement('canvas');
  out.width = cw * cols; out.height = ch * rows;
  const o = out.getContext('2d')!;
  tv.setOn(true); tv.setShow(gridShow);
  ts.forEach((t, i) => {
    tv.seek(t);
    o.drawImage(canvas, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch);
    o.fillStyle = '#ff0'; o.font = 'bold 14px monospace'; o.fillText(`t=${t.toFixed(1)}`, (i % cols) * cw + 6, Math.floor(i / cols) * ch + ch - 6);
  });
  $('grid').appendChild(out);
} else {
  $('screen').appendChild(canvas);
}

let on = !q.get('off');
let show: TvShow = (q.get('show') as TvShow) ?? 'birds';
let frozen = q.has('t');
tv.setShow(show);
tv.setOn(on);
if (frozen) tv.seek(Number(q.get('t')));

const btns = SHOWS.map((s) => {
  const b = document.createElement('button');
  b.textContent = s;
  b.onclick = () => { show = s; tv.setShow(s); frozen = false; sync(); };
  $('shows').appendChild(b);
  return b;
});
const sync = () => { btns.forEach((b) => b.classList.toggle('on', b.textContent === show)); $('power').classList.toggle('on', on); };
sync();
$('power').onclick = () => { on = !on; tv.setOn(on); sync(); };
const time = $('time') as HTMLInputElement;
time.oninput = () => { frozen = true; tv.seek(Number(time.value)); $('timeV').textContent = Number(time.value).toFixed(1); };

// the texture on a little 3D TV, to check the CanvasTexture path end to end
const renderer = new THREE.WebGLRenderer({ canvas: $('three') as HTMLCanvasElement, antialias: true });
renderer.setSize(480, 300, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9d8c4');
const cam = new THREE.PerspectiveCamera(35, 480 / 300, 0.1, 20);
cam.position.set(0.5, 0.25, 2.6); cam.lookAt(0, 0, 0);
const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.0, 0.08), new THREE.MeshBasicMaterial({ color: '#1a1a1a' }));
const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshBasicMaterial({ map: tv.texture, toneMapped: false }));
screen.position.z = 0.041;
scene.add(body, screen);

let last = performance.now(), cycleT = 0;
function frame(now: number) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
  if (($('cycle') as HTMLInputElement).checked) {
    cycleT += dt;
    if (cycleT > 6) { cycleT = 0; show = SHOWS[(SHOWS.indexOf(show) + 1) % SHOWS.length]; tv.setShow(show); sync(); }
  }
  if (!frozen) tv.update(dt);
  renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
