// Props asset scouting viewer. Loads downloaded prop candidates from /assets-raw/props, one row per need,
// each model scaled so its largest dimension matches the game size (PROP_DEFS), next to 0.45 m cat poles
// and a 1.75 m sitter pole. Native sizes + scale factors + clip names land in window.__sizes.
// URL params: rows=0-5 (need row range)  need=mug,poop  fam=TT,KK,KEN,QUA,PP0,BY  angle=iso|front|top|low  toon=1  zoom=1.0
//   only=mug_red,salmon_ (file-name substrings, e.g. a shortlist)  cols=8 (plain grid instead of need rows)  labels=0
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { toon } from '../src/shared/toon';

type Fam = 'TT' | 'KK' | 'KEN' | 'QUA' | 'PP0' | 'BY';
const FAM: Record<Fam, [string, string]> = {
  TT: ['Tiny Treats CC0', '#d6457a'],
  KK: ['KayKit CC0', '#7a5bd6'],
  KEN: ['Kenney CC0', '#2e9e5b'],
  QUA: ['Quaternius CC0', '#c97a1e'],
  PP0: ['PolyPizza CC0', '#2e86c1'],
  BY: ['PolyPizza CC-BY', '#7d6250'],
};

const R = '/assets-raw/props/';
const TT = (pack: string, f: string) => `${R}tinytreats-${pack}/Assets/gltf/${f}.gltf`;
const KKF = (f: string) => `${R}kaykit-furniture-bits/gltf/${f}.gltf`;
const KKR = (f: string) => `${R}kaykit-restaurant-bits/gltf/${f}.gltf`;
const KEF = (f: string) => `${R}kenney-food-kit/Models/GLB format/${f}.glb`;
const KEN = (f: string) => `${R}kenney-furniture-kit/Models/GLTF format/${f}.glb`;
const QUA = (f: string) => `${R}quaternius-house-interior/glb/${f}.glb`;
const PP = (f: string) => `${R}polypizza/${f}.glb`;

/** target largest dimension in meters per need (from PROP_DEFS extents, mess sizes picked by eye) */
const SIZE: Record<string, number> = {
  mug: 0.12, glass: 0.13, plate: 0.22, vase: 0.3, book: 0.2, remote: 0.16, plantPot: 0.28, frame: 0.26,
  wineBottle: 0.3, cerealBox: 0.3, toyMouse: 0.1, yarn: 0.12, phone: 0.15, candle: 0.12, tpRoll: 0.11,
  salmon: 0.36, package: 0.5, pillow: 0.6, bowl: 0.16, shoe: 0.26, sock: 0.2, cucumber: 0.2, lamp: 0.4,
  trophy: 0.2, laptop: 0.33, poop: 0.14, fish: 0.3, tpPile: 0.4, shards: 0.25, tunaCan: 0.09, catnip: 0.25,
  spray: 0.26, treatBag: 0.22, food: 0.2, extra: 0.15,
};

interface Cand { need: string; fam: Fam; file: string; size: number }
const c = (need: string, fam: Fam, file: string, size = SIZE[need]): Cand => ({ need, fam, file, size });

const CANDS: Cand[] = [
  c('mug', 'TT', TT('charming-kitchen', 'mug_red')), c('mug', 'TT', TT('bakery-interior', 'mug_A_yellow')),
  c('mug', 'TT', TT('pleasant-picnic', 'mug')), c('mug', 'KEN', KEF('mug')), c('mug', 'KEN', KEF('cup-coffee')),
  c('glass', 'KEN', KEF('glass')), c('glass', 'TT', TT('pleasant-picnic', 'wine_glass')), c('glass', 'PP0', PP('wine-glass_2WpCzR5tff')),
  c('glass', 'KEN', KEF('glass-wine')),
  c('plate', 'TT', TT('charming-kitchen', 'plate')), c('plate', 'TT', TT('pleasant-picnic', 'plate_A')),
  c('plate', 'KK', KKR('plate')), c('plate', 'KEN', KEF('plate-dinner')),
  c('vase', 'BY', PP('vase_7img3RnfCzZ'), 0.32), c('vase', 'BY', PP('vase_20LOTk3BnjO')), c('vase', 'BY', PP('small-vase_cfW7jP87jTB')),
  c('vase', 'PP0', PP('flowers_RP8p3h7JHJ'), 0.4), c('vase', 'TT', TT('house-plants', 'pot_B_small'), 0.16),
  c('vase', 'KK', KKR('jar_C_large'), 0.25), c('vase', 'KK', KKR('jar_A_large'), 0.25), c('vase', 'TT', TT('charming-kitchen', 'container_kitchen_A_blue'), 0.2),
  c('book', 'KK', KKF('book_single')), c('book', 'KK', KKF('book_set'), 0.24), c('book', 'PP0', PP('books_dxt7dETAy9'), 0.24),
  c('book', 'KEN', KEN('books'), 0.24),
  c('remote', 'BY', PP('remote_9veo7sZrcBZ')), c('remote', 'BY', PP('remote-controller_aZ_jCqwgA18')), c('remote', 'BY', PP('timehotel-remote_11SpVcTGeWH')),
  c('plantPot', 'TT', TT('house-plants', 'succulent_plant_pot_small'), 0.18), c('plantPot', 'TT', TT('house-plants', 'cacti_plant_pot_small'), 0.2),
  c('plantPot', 'TT', TT('house-plants', 'pothos_plant_small_potted')), c('plantPot', 'TT', TT('house-plants', 'monstera_plant_small_potted')),
  c('plantPot', 'TT', TT('bubbly-bathroom', 'plant')), c('plantPot', 'KK', KKF('cactus_small_A'), 0.2), c('plantPot', 'KEN', KEN('plantSmall1')),
  c('frame', 'KK', KKF('pictureframe_standing_A')), c('frame', 'KK', KKF('pictureframe_standing_B')),
  c('frame', 'KK', KKF('pictureframe_small_A')),
  c('wineBottle', 'TT', TT('pleasant-picnic', 'wine_bottle')), c('wineBottle', 'KEN', KEF('wine-red')), c('wineBottle', 'KEN', KEF('soda-bottle')),
  c('cerealBox', 'BY', PP('timehotel-cereal-yellow_e2l_Q6TiVYm')), c('cerealBox', 'BY', PP('timehotel-cereal-blue_8McuTnDFC-Z')), c('cerealBox', 'KEN', KEF('carton')), c('cerealBox', 'TT', TT('bakery-interior', 'milk'), 0.22), c('cerealBox', 'TT', TT('bakery-interior', 'flour_sack_closed')),
  c('toyMouse', 'BY', PP('toy-mouse_49PYgABKfFo')),
  c('yarn', 'BY', PP('yarn-ball-v2_0kSphuYy8Or')),
  c('phone', 'PP0', PP('phone_k2kgBepoMU')), c('phone', 'PP0', PP('smartphone_4DRZmTs3jq')), c('phone', 'BY', PP('timehotel-phone_9rYdZAy5hZQ')),
  c('candle', 'TT', TT('bubbly-bathroom', 'candle')), c('candle', 'QUA', PP('candles_AnzHB44wlW'), 0.18),
  c('tpRoll', 'QUA', QUA('Bathroom_ToiletPaper')), c('tpRoll', 'BY', PP('toilet-paper_b-iE6Ii4GZk')),
  c('tpRoll', 'BY', PP('toilet-paper-roll_3fTwIG4NTg3')), c('tpRoll', 'KK', KKR('papertowel'), 0.25), c('tpRoll', 'BY', PP('timehotel-paper-towel_bem32rCBJpM'), 0.25),
  c('salmon', 'QUA', PP('salmon_2BeZAlQ73h')), c('salmon', 'QUA', PP('fish-fillet_nQVHa5aYfP')), c('salmon', 'KEN', KEF('fish')),
  c('salmon', 'KEN', KEF('meat-raw'), 0.25), c('salmon', 'BY', PP('fish_aEyLrUMMoUK')),
  c('package', 'TT', TT('homely-house', 'package')), c('package', 'KEN', KEN('cardboardBoxClosed')), c('package', 'PP0', PP('empty-box_pZBpmjtvw8')),
  c('package', 'KEN', KEN('cardboardBoxOpen')),
  c('pillow', 'TT', TT('pleasant-picnic', 'pillow_large_red')), c('pillow', 'TT', TT('pleasant-picnic', 'pillow_small_blue'), 0.45),
  c('pillow', 'KK', KKF('pillow_A')), c('pillow', 'KK', KKF('pillow_B')), c('pillow', 'KEN', KEN('pillowBlue')),
  c('bowl', 'TT', TT('pleasant-picnic', 'bowl')), c('bowl', 'KK', KKR('bowl')), c('bowl', 'KEN', KEF('bowl')),
  c('bowl', 'TT', TT('bakery-interior', 'mixing_bowl'), 0.22), c('bowl', 'KEN', KEF('bowl-cereal')),
  c('shoe', 'TT', TT('homely-house', 'boots'), 0.3), c('shoe', 'TT', TT('bubbly-bathroom', 'slippers'), 0.28), c('shoe', 'BY', PP('trainer_cs7k_ENAZjQ')),
  c('sock', 'BY', PP('socks_hcfzStK2HR'), 0.4), c('sock', 'BY', PP('timehotel-long-sock_7ihG5p5F3XK'), 0.3),
  c('cucumber', 'QUA', PP('cucumber_nyGEAKs590')), c('cucumber', 'KEN', KEF('eggplant')), c('cucumber', 'KEN', KEF('leek'), 0.3),
  c('lamp', 'KK', KKF('lamp_table')), c('lamp', 'PP0', PP('lamp-with-shade_1nKtMmYxLT')), c('lamp', 'PP0', PP('desk-lamp_SF3cZuqW3s')),
  c('lamp', 'KEN', KEN('lampRoundTable')), c('lamp', 'KEN', KEN('lampSquareTable')),
  c('trophy', 'PP0', PP('trophy_fLy8KmmD1t')), c('trophy', 'BY', PP('trophy_6Xu7mttjodo')),
  c('laptop', 'BY', PP('laptop_UGOWjMUC5U')), c('laptop', 'KEN', KEN('laptop')),
  // mess
  c('poop', 'BY', PP('poop_65wuu48mFfG')), c('poop', 'PP0', PP('scary-poop_uVFt6LRcYU')), c('poop', 'PP0', PP('poo-character_03djWQlJue'), 0.2),
  c('fish', 'QUA', PP('fish_XWl86YFtpF')), c('fish', 'QUA', PP('fish_Ymu8ftrmuT')), c('fish', 'KEN', KEF('fish')), c('fish', 'KEN', KEF('fish-bones')),
  c('tpPile', 'QUA', QUA('Bathroom_ToiletPaperPile')), c('tpPile', 'BY', PP('timehotel-rock-forms-3-white_0PpIe1BnuM8'), 0.35),
  c('tpPile', 'BY', PP('timehotel-rock-forms-5-white_28cOcmtim4L'), 0.35),
  c('shards', 'KEN', KEF('plate-broken')),
  c('tunaCan', 'BY', PP('cat-food-cans-closed-open_cpdwLDHiw8-'), 0.2), c('tunaCan', 'BY', PP('tuna-fish-cans_eNrhHG7iOah'), 0.2),
  c('tunaCan', 'BY', PP('tuna-can_0YMEf4u04s5')), c('tunaCan', 'KEN', KEF('can-open')), c('tunaCan', 'KEN', KEF('can-small')),
  c('catnip', 'BY', PP('catnip_cqYn1KzqlfK')), c('catnip', 'TT', TT('house-plants', 'succulent_A'), 0.15),
  c('spray', 'BY', PP('spray-bottle_uQ6VGKpkWm')), c('spray', 'BY', PP('sprayer_HDfEfa2kHZ')), c('spray', 'BY', PP('timehotel-spray-cleaner_bnAE4wYavQQ')),
  c('spray', 'TT', TT('bubbly-bathroom', 'container_bathroom_D_blue'), 0.2), c('spray', 'TT', TT('bubbly-bathroom', 'container_bathroom_B_pink'), 0.2),
  c('treatBag', 'BY', PP('timehotel-chips-bag_994lzjJo4tJ')), c('treatBag', 'KEN', KEF('bag')), c('treatBag', 'KEN', KEF('bag-flat')), c('treatBag', 'TT', TT('bakery-interior', 'flour_sack_closed')),
  c('treatBag', 'KEN', KEF('candy-bar-wrapper'), 0.15),
  // kitchen counter food / decoration
  c('food', 'TT', TT('baked-goods', 'bread'), 0.28), c('food', 'TT', TT('baked-goods', 'baguette'), 0.5), c('food', 'TT', TT('baked-goods', 'croissant'), 0.14),
  c('food', 'TT', TT('pleasant-picnic', 'apple'), 0.08), c('food', 'TT', TT('pleasant-picnic', 'grapes_bowl'), 0.2), c('food', 'TT', TT('pleasant-picnic', 'cheese_A'), 0.12),
  c('food', 'KEN', KEF('banana'), 0.18), c('food', 'KEN', KEF('loaf'), 0.25), c('food', 'PP0', PP('fruit-bowl_G6FktIrBkj'), 0.28),
  c('food', 'TT', TT('charming-kitchen', 'toaster'), 0.26), c('food', 'TT', TT('charming-kitchen', 'kettle'), 0.22),
  // extras that would sell the house
  c('extra', 'PP0', PP('rubber-duck_oH3dEdlDpB'), 0.1), c('extra', 'TT', TT('bubbly-bathroom', 'ducky'), 0.1),
  c('extra', 'PP0', PP('tissue-box_dS4MQQH5EM'), 0.22), c('extra', 'PP0', PP('alarm-clock_y5f363OS9C'), 0.13),
  c('extra', 'BY', PP('feather_3OrFBjp8Ae9'), 0.3), c('extra', 'TT', TT('homely-house', 'letter'), 0.2),
];

const P = new URLSearchParams(location.search);
const needOrder = [...new Set(CANDS.map((x) => x.need))];
const [r0, r1] = (P.get('rows') ?? `0-${needOrder.length - 1}`).split('-').map(Number);
const needs = P.get('need')?.split(',') ?? needOrder.slice(r0, r1 + 1);
const fams = (P.get('fam')?.split(',') ?? Object.keys(FAM)) as Fam[];
const angle = P.get('angle') ?? 'iso';
const zoom = Number(P.get('zoom') ?? 1);
const useToon = P.get('toon') === '1';
const only = P.get('only')?.split(',');
const cols = Number(P.get('cols') ?? 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: 'fixed', top: '0', left: '0', pointerEvents: 'none' });
document.body.appendChild(labels.domElement);
if (P.get('labels') === '0') labels.domElement.style.display = 'none';

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f3e6d3');
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.01, 200);
const controls = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight('#fff4e0', '#b08a6a', 1.7));
const sun = new THREE.DirectionalLight('#fff1dc', 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.01;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#e2c79f', roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function label(html: string, cls = 'lbl'): CSS2DObject {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  return new CSS2DObject(d);
}
function pole(h: number, color: string, r = 0.012): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), new THREE.MeshStandardMaterial({ color }));
  m.position.y = h / 2;
  m.castShadow = true;
  const t = label(`${h} m`);
  t.position.y = h / 2 + 0.03;
  m.add(t);
  return m;
}
function toToon(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const conv = (mat: THREE.Material) => {
      const s = mat as THREE.MeshStandardMaterial;
      return s.map ? toon('#ffffff', { map: s.map }) : toon(s.color ?? '#ffffff');
    };
    m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
  });
}

interface SizeRow { need: string; fam: Fam; name: string; native: string; scale: number; meters: string; clips: string[]; tris: number }
const sizes: SizeRow[] = [];
(window as unknown as { __sizes: SizeRow[] }).__sizes = sizes;

async function main(): Promise<void> {
  const list = CANDS.filter((x) => needs.includes(x.need) && fams.includes(x.fam) && (!only || only.some((s) => x.file.includes(s))));
  const loader = new GLTFLoader();
  const hud = document.getElementById('hud')!;
  let done = 0;
  const loaded = await Promise.all(list.map(async (cand) => {
    try {
      const gl = await loader.loadAsync(encodeURI(cand.file));
      hud.textContent = `loading ${++done}/${list.length}`;
      return { cand, gl };
    } catch (e) {
      console.warn('FAIL', cand.file, e);
      return null;
    }
  }));

  const frame = new THREE.Box3();
  const mixers: THREE.AnimationMixer[] = [];
  // rows: one per need, or (cols=N) a plain grid in catalog order for shortlists
  const ok = loaded.filter((x): x is NonNullable<typeof x> => !!x);
  const rows = cols
    ? Array.from({ length: Math.ceil(ok.length / cols) }, (_, i) => ({ title: '', items: ok.slice(i * cols, i * cols + cols) }))
    : needs.map((n) => ({ title: n, items: ok.filter((x) => x.cand.need === n) }));
  let z = 0;
  for (const { title, items: row } of rows) {
    if (!row.length) continue;
    const ref = new THREE.Group();
    ref.add(pole(0.45, '#2e86c1'));
    ref.position.set(-0.25, 0, z);
    if (title) {
      const nt = label(title, 'need');
      nt.position.set(-0.2, 0.06, 0);
      ref.add(nt);
    }
    scene.add(ref);
    let x = 0, depth = 0;
    for (const { cand, gl } of row) {
      const root = gl.scene;
      const nb = new THREE.Box3().setFromObject(root);
      const ns = nb.getSize(new THREE.Vector3());
      const s = cand.size / Math.max(ns.x, ns.y, ns.z);
      root.scale.multiplyScalar(s);
      if (useToon) toToon(root);
      let tris = 0;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = m.receiveShadow = true;
        tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      });
      const b = new THREE.Box3().setFromObject(root);
      const sz = b.getSize(new THREE.Vector3());
      root.position.set(-b.min.x, -b.min.y, -b.min.z);
      const holder = new THREE.Group();
      holder.add(root);
      holder.position.set(x, 0, z);
      scene.add(holder);
      if (gl.animations.length) {
        const mx = new THREE.AnimationMixer(root);
        mx.clipAction(gl.animations[0]).play();
        mixers.push(mx);
      }
      const name = decodeURI(cand.file).split('/').pop()!.replace(/\.(glb|gltf)$/, '');
      const [famName, col] = FAM[cand.fam];
      const t = label(`${cols ? `<b>${cand.need}</b>: ` : ''}${name}<br><i style="background:${col}">${famName}</i> <small>${(sz.x * 100).toFixed(0)}×${(sz.y * 100).toFixed(0)}×${(sz.z * 100).toFixed(0)}cm</small>`);
      t.position.set(sz.x / 2, 0, sz.z + 0.04);
      holder.add(t);
      frame.expandByObject(holder);
      sizes.push({
        need: cand.need, fam: cand.fam, name,
        native: ns.toArray().map((v) => +v.toFixed(3)).join('x'),
        scale: +s.toFixed(4),
        meters: sz.toArray().map((v) => +v.toFixed(3)).join('x'),
        clips: gl.animations.map((a) => a.name),
        tris: Math.round(tris),
      });
      x += Math.max(sz.x, 0.2) + 0.18;
      depth = Math.max(depth, sz.z);
    }
    z += depth + 0.3;
  }
  const sitter = pole(1.75, '#c0392b', 0.02);
  sitter.position.x = -0.55;
  scene.add(sitter);
  frame.expandByPoint(new THREE.Vector3(-0.4, 0.45, 0));

  const center = frame.getCenter(new THREE.Vector3());
  const size = frame.getSize(new THREE.Vector3());
  const dir = { iso: [0.12, 0.85, 1], front: [0, 0.45, 1], top: [0, 1, 0.08], low: [0.3, 0.18, 1] }[angle] ?? [0.12, 0.85, 1];
  // fit: back the camera off until every corner of the content box (plus label room) projects inside the view
  const unit = new THREE.Vector3(...dir).normalize();
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(
    i & 1 ? frame.max.x : frame.min.x, i & 2 ? frame.max.y : 0, i & 4 ? frame.max.z + 0.12 : frame.min.z));
  let dist = 0.5;
  const v = new THREE.Vector3();
  const fits = () => corners.every((p) => { v.copy(p).project(camera); return Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.93; });
  do {
    dist *= 1.04;
    camera.position.copy(center).addScaledVector(unit, dist);
    camera.lookAt(center);
    camera.updateMatrixWorld();
  } while (!fits() && dist < 100);
  camera.position.copy(center).addScaledVector(unit, dist / zoom);
  controls.target.copy(center);
  controls.update();
  sun.position.copy(center).add(new THREE.Vector3(3, 6, 4));
  sun.target.position.copy(center);
  const ext = Math.max(size.x, size.z) / 2 + 1;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 0.1, far: 30 });
  sun.shadow.camera.updateProjectionMatrix();

  hud.textContent = `props: ${sizes.length} models, ${needs.length} needs${useToon ? ' (toon)' : ''}`;
  console.table(sizes);
  (window as unknown as { __ready: boolean }).__ready = true;
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    for (const m of mixers) m.update(dt);
    renderer.render(scene, camera);
    labels.render(scene, camera);
  });
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
});
main();
