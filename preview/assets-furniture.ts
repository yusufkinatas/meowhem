// Asset scouting viewer: loads downloaded furniture candidates from /assets-raw/furniture at true relative scale.
// URL params: fam=picks|kenney,quat,lous,gap  only=sofa,tv (need filter)  angle=iso|front|top|low  cols=8  toon=1
//             from/to (item slice per family)  zoom=0.9  labels=0
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { toon } from '../src/shared/toon';

type Fam = 'kenney' | 'quat' | 'lous' | 'gap' | 'picks';
interface Cand { fam: Fam; need: string; file: string; scale?: number }

const R = '/assets-raw/furniture/';
const KEN = R + 'kenney-furniture-kit/Models/GLTF format/';
const QUA = R + 'quaternius-ultimate-house-interior/glb/';
const KFB = R + 'kaykit-furniture-bits/KayKit-Furniture-Bits-1.0-main/addons/kaykit_furniture_bits/Assets/gltf/';
const KRB = R + 'kaykit-restaurant-bits/KayKit-Restaurant-Bits-1.0-main/addons/kaykit_restaurant_bits/Assets/gltf/';
const TTK = R + 'tinytreats-charming-kitchen/Tiny-Treats-Charming-Kitchen-1.0-main/addons/tiny_treats_charming_kitchen_set/Assets/gltf/';
const TTB = R + 'tinytreats-bubbly-bathroom/Tiny-Treats-Bubbly-Bathroom-1.0-main/addons/tiny_treats_bubbly_bathroom_set/Assets/gltf/';
const TTH = R + 'tinytreats-homely-house/Tiny-Treats-Homely-House-1.0-main/addons/tiny_treats_homely_house_set/Assets/gltf/';
const PP = R + 'polypizza/';

// raw units -> meters per family (calibrated from door / bed / counter heights)
const FAM_SCALE: Record<Fam, number> = { kenney: 2.1, quat: 0.005, lous: 0.75, gap: 1, picks: 1 };
const FAM_NAME: Record<Fam, string> = {
  kenney: 'A  Kenney Furniture Kit (CC0)',
  quat: 'B  Quaternius Ultimate House Interior (CC0)',
  lous: 'C  KayKit Furniture/Restaurant + Tiny Treats (CC0)',
  gap: 'Gap fillers (Poly Pizza etc.)',
  picks: 'Recommended mix (C + gap fillers)',
};

const k = (need: string, f: string, scale?: number): Cand => ({ fam: 'kenney', need, file: KEN + f + '.glb', scale });
const q = (need: string, f: string, scale?: number): Cand => ({ fam: 'quat', need, file: QUA + f + '.glb', scale });
const l = (need: string, f: string, scale?: number): Cand => ({ fam: 'lous', need, file: f, scale });
const g = (need: string, f: string, scale?: number): Cand => ({ fam: 'gap', need, file: f, scale });
const p = (need: string, f: string, scale: number): Cand => ({ fam: 'picks', need, file: f, scale });
const L = 0.75, K = 2.1, Q = 0.005;

const CANDS: Cand[] = [
  // ---- A Kenney
  k('sofa', 'loungeSofa'), k('sofa', 'loungeDesignSofa'), k('armchair', 'loungeChair'), k('armchair', 'loungeDesignChair'),
  k('coffeeTable', 'tableCoffee'), k('tv', 'televisionModern'), k('tvStand', 'cabinetTelevision'), k('bookshelf', 'bookcaseOpen'),
  k('bookshelf', 'bookcaseClosedWide'), k('rug', 'rugRectangle'), k('rug', 'rugRound'), k('plant', 'pottedPlant'),
  k('sideTable', 'sideTableDrawers'), k('lamp', 'lampRoundFloor'), k('lamp', 'lampSquareTable'), k('window', 'wallWindow'),
  k('counter', 'kitchenCabinet'), k('counterCorner', 'kitchenCabinetCornerInner'), k('sink', 'kitchenSink'), k('stove', 'kitchenStove'),
  k('fridge', 'kitchenFridge'), k('diningTable', 'table'), k('chair', 'chair'), k('bathtub', 'bathtub'),
  k('toilet', 'toilet'), k('bathSink', 'bathroomSink'), k('washer', 'washer'), k('mirror', 'bathroomMirror'),
  k('litterBox', 'cardboardBoxOpen'), k('bed', 'bedDouble'), k('nightstand', 'cabinetBedDrawerTable'), k('wardrobe', 'bookcaseClosedDoors'),
  k('desk', 'desk'), k('officeChair', 'chairDesk'), k('laptop', 'laptop'), k('shelf', 'bookcaseOpenLow'),
  k('frontDoor', 'doorwayFront'), k('door', 'doorway'), k('coatRack', 'coatRackStanding'), k('doormat', 'rugDoormat'),
  k('trash', 'trashcan'), k('pillow', 'pillowBlue'),
  // ---- B Quaternius
  q('sofa', 'Couch_Medium1'), q('sofa', 'Couch_Medium2'), q('sofa', 'Couch_Large1'), q('armchair', 'Couch_Small2'),
  q('armchair', 'Couch_Small1'), q('coffeeTable', 'Table_RoundSmall'), q('bookshelf', 'Bookshelf'), q('bookshelf', 'Shelf_Large'),
  q('rug', 'Carpet_1'), q('rug', 'Carpet_Round'), q('plant', 'Houseplant_6'), q('plant', 'Houseplant_8'),
  q('plant', 'Houseplant_7'), q('sideTable', 'NightStand_2'), q('lamp', 'Light_Floor1'), q('lamp', 'Light_Desk'),
  q('curtains', 'Curtains_Double'), q('window', 'Window_Large1'), q('counter', 'Kitchen_Cabinet1'), q('counter', 'Kitchen_2Drawers'),
  q('sink', 'Kitchen_Sink'), q('stove', 'Kitchen_Oven'), q('fridge', 'Kitchen_Fridge'), q('diningTable', 'Table_RoundLarge'),
  q('chair', 'Chair_1'), q('bathtub', 'Bathroom_Bathtub'), q('toilet', 'Bathroom_Toilet'), q('bathSink', 'Bathroom_Sink'),
  q('washer', 'Bathroom_WashingMachine'), q('mirror', 'Bathroom_Mirror1'), q('towel', 'Bathroom_Towel'), q('tp', 'Bathroom_ToiletPaper'),
  q('bed', 'Bed_King'), q('nightstand', 'NightStand_1'), q('dresser', 'Drawer_4'), q('tvStand', 'Drawer_3'),
  q('shelf', 'Shelf_Small1'), q('door', 'Door_1'), q('door', 'Door_4'), q('frontDoor', 'Door_8'),
  q('trash', 'Trashcan_Small1'), q('plate', 'Plate_1'),
  // ---- C Lousberg (KayKit + Tiny Treats)
  l('sofa', KFB + 'couch_pillows.gltf'), l('sofa', KFB + 'couch.gltf'), l('armchair', KFB + 'armchair_pillows.gltf'), l('coffeeTable', KFB + 'table_low.gltf'),
  l('bookshelf', KFB + 'shelf_B_large_decorated.gltf'), l('bookshelf', KFB + 'shelf_A_big.gltf'), l('rug', KFB + 'rug_rectangle_stripes_A.gltf'), l('rug', KFB + 'rug_oval_A.gltf'),
  l('plant', KFB + 'cactus_medium_A.gltf'), l('plant', TTB + 'plant.gltf'), l('sideTable', KFB + 'table_small.gltf'), l('lamp', KFB + 'lamp_standing.gltf'),
  l('lamp', KFB + 'lamp_table.gltf'), l('tvStand', KFB + 'cabinet_medium_decorated.gltf'), l('frame', KFB + 'pictureframe_large_A.gltf'), l('frame', KFB + 'pictureframe_standing_A.gltf'),
  l('counter', TTK + 'countertop_straight_A.gltf'), l('counterCorner', TTK + 'countertop_corner_inner.gltf'), l('sink', TTK + 'countertop_sink.gltf'), l('stove', TTK + 'stove.gltf'),
  l('fridge', TTK + 'fridge.gltf'), l('cuttingBoard', TTK + 'cuttingboard.gltf'), l('wallCabinet', TTK + 'wall_cabinet_straight.gltf'), l('hood', TTK + 'extractor_hood.gltf'),
  l('counter', KRB + 'kitchencounter_straight_A.gltf'), l('sink', KRB + 'kitchencounter_sink.gltf'), l('stove', KRB + 'oven.gltf'), l('fridge', KRB + 'fridge_A.gltf'),
  l('diningTable', KFB + 'table_medium.gltf'), l('chair', KFB + 'chair_A_wood.gltf'), l('chair', KFB + 'chair_C.gltf'), l('bowl', KRB + 'bowl.gltf'),
  l('bathtub', TTB + 'bath.gltf'), l('bathSink', TTB + 'cabinet_bathroom.gltf'), l('mirror', TTB + 'mirror.gltf'), l('towel', TTB + 'towel_stacked.gltf'),
  l('towel', TTB + 'towel_pink.gltf'), l('bathMat', TTB + 'mat.gltf'), l('bed', KFB + 'bed_double_A.gltf'), l('nightstand', KFB + 'cabinet_small.gltf'),
  l('wardrobe', KFB + 'cabinet_medium.gltf'), l('desk', KFB + 'table_medium_long.gltf'), l('frontDoor', KRB + 'door_A.gltf'), l('door', KRB + 'door_B.gltf'),
  l('basket?', TTB + 'container_bathroom_A_blue.gltf'), l('basket?', TTB + 'container_bathroom_B_pink.gltf'), l('basket?', TTB + 'container_bathroom_C_yellow.gltf'), l('basket?', TTB + 'container_bathroom_D_blue.gltf'),
  l('wallShelf', TTB + 'wall_shelf.gltf'), l('slippers', TTB + 'slippers.gltf'), l('ducky', TTB + 'ducky.gltf'), l('litter?', KRB + 'crate.gltf'),
  l('blinds', TTK + 'blinds_kitchen.gltf'), l('wallBox?', TTK + 'wall_cabinet_single_left.gltf'), l('papertowel', TTK + 'wall_papertowel_holder.gltf'), l('door', TTB + 'wall_tiled_doorway.gltf'),
  l('doormat', TTH + 'doormat.gltf'), l('package', TTH + 'package.gltf'), l('boots', TTH + 'boots.gltf'), l('window', KRB + 'wall_window_closed.gltf'),
  // ---- recommended mix: C family first, gaps from A/B/Poly Pizza
  p('sofa', KFB + 'couch_pillows.gltf', L), p('armchair', KFB + 'armchair_pillows.gltf', L), p('coffeeTable', KFB + 'table_low.gltf', L), p('tvStand', KFB + 'cabinet_medium.gltf', L),
  p('tv', PP + 'tv_retro_eracleous.glb', 0.72), p('tv', KEN + 'televisionModern.glb', 1.3), p('wallShelf', KFB + 'shelf_B_large_decorated.gltf', L), p('bookshelf', KEN + 'bookcaseOpen.glb', K), p('rug', KFB + 'rug_rectangle_stripes_A.gltf', L),
  p('plant', PP + 'isalousberg_large_monstera_plant.glb', 0.5), p('plantPot', PP + 'isalousberg_large_pot.glb', 0.4), p('plant', PP + 'isalousberg_large_yucca.glb', 0.9), p('plant', KFB + 'cactus_medium_A.gltf', 1.3), p('sideTable', KFB + 'table_small.gltf', L), p('lamp', KFB + 'lamp_standing.gltf', L), p('lamp', KFB + 'lamp_table.gltf', 0.4),
  p('curtains', QUA + 'Curtains_Double.glb', Q), p('fishTank', PP + 'fishtank_chrisross.glb', 1.3), p('catTree', PP + 'cattree_patsiefring.glb', 0.24), p('frame', KFB + 'pictureframe_large_A.gltf', 0.5),
  p('counter', TTK + 'countertop_straight_A.gltf', 0.9), p('counterCorner', TTK + 'countertop_corner_inner.gltf', 0.9), p('sink', TTK + 'countertop_sink.gltf', 0.9), p('stove', TTK + 'stove.gltf', 0.9),
  p('fridge', TTK + 'fridge.gltf', 0.65), p('wallCabinet', TTK + 'wall_cabinet_straight.gltf', 0.9), p('cuttingBoard', TTK + 'cuttingboard.gltf', 0.4), p('diningTable', KFB + 'table_medium.gltf', L),
  p('chair', KFB + 'chair_A_wood.gltf', L), p('foodBowl', PP + 'petbowl_full_google.glb', 3.4e-7), p('foodBowl', KRB + 'bowl_small.gltf', 0.3), p('bathtub', TTB + 'bath.gltf', 0.8), p('toilet', QUA + 'Bathroom_Toilet.glb', Q), p('toilet', PP + 'creativetrio_toilet.glb', 1.45),
  p('bathSink', TTB + 'cabinet_bathroom.gltf', 0.6), p('mirror', TTB + 'mirror.gltf', 0.6), p('washer', QUA + 'Bathroom_WashingMachine.glb', 0.0065), p('towel', TTB + 'towel_stacked.gltf', 0.5),
  p('bathMat', TTB + 'mat.gltf', 0.6), p('litterBox', PP + 'tray_milkandbanana.glb', 0.022), p('laundryBasket', PP + 'basket_google.glb', 4.4e-6), p('bed', KFB + 'bed_double_A.gltf', L), p('nightstand', KFB + 'cabinet_small.gltf', 0.6), p('wardrobe', KEN + 'bookcaseClosedDoors.glb', 2.3),
  p('desk', KFB + 'table_medium.gltf', L), p('officeChair', KEN + 'chairDesk.glb', 1.9), p('laptop', KEN + 'laptop.glb', 1.3), p('shelf', KFB + 'shelf_A_big.gltf', L),
  p('frontDoor', QUA + 'Door_8.glb', Q), p('door', QUA + 'Door_1.glb', Q), p('door', TTB + 'wall_tiled_doorway.gltf', 0.7), p('window', QUA + 'Window_Large1.glb', 0.007), p('coatRack', PP + 'hatrack_doncarson.glb', 1.4), p('shoeRack', PP + 'littlebookcase_doncarson.glb', 0.6),
  p('doormat', TTH + 'doormat.gltf', L), p('shoes', TTH + 'boots.gltf', 0.4), p('package', TTH + 'package.gltf', 0.6), p('fuseBox', PP + 'fusebox_zeoxo.glb', 0.36), p('fuseBox', TTK + 'wall_cabinet_single_left.gltf', 0.4),
];

// gap fillers are appended at runtime from /assets-raw/furniture/polypizza/index.json if present
async function gapCands(): Promise<Cand[]> {
  try {
    const r = await fetch(PP + 'index.json');
    if (!r.ok) return [];
    const list = (await r.json()) as { need: string; file: string; scale?: number }[];
    return list.map((e) => g(e.need, PP + e.file, e.scale));
  } catch { return []; }
}

const P = new URLSearchParams(location.search);
const fams = (P.get('fam') ?? 'picks').split(',') as Fam[];
const only = P.get('only')?.split(',');
const angle = P.get('angle') ?? 'iso';
const cols = Number(P.get("cols") ?? 8);
const useToon = P.get('toon') === '1';
const from = Number(P.get('from') ?? 0);
const to = Number(P.get('to') ?? 999);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: 'fixed', top: '0', left: '0', pointerEvents: 'none' });
document.body.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f3e6d3');
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 500);
const controls = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight('#fff4e0', '#b08a6a', 1.6));
const sun = new THREE.DirectionalLight('#fff1dc', 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#e2c79f', roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function label(html: string, cls = 'lbl'): CSS2DObject {
  const d = document.createElement('div');
  if (cls === 'lbl' && P.get('labels') === '0') d.style.display = 'none';
  d.className = cls;
  d.innerHTML = html;
  return new CSS2DObject(d);
}
function pole(h: number, color: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, h, 12), new THREE.MeshStandardMaterial({ color }));
  m.position.y = h / 2;
  const t = label(`${h} m`);
  t.position.y = h / 2 + 0.08;
  m.add(t);
  return m;
}

function toToon(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.geometry.attributes.normal) m.geometry.computeVertexNormals(); // some Poly Pizza GLBs ship without normals
    const conv = (mat: THREE.Material) => {
      const s = mat as THREE.MeshStandardMaterial;
      const o = { map: s.map ?? undefined, transparent: s.transparent || s.opacity < 1, opacity: s.opacity };
      return toon(s.map ? '#ffffff' : s.color ?? '#ffffff', o);
    };
    m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
  });
}

interface SizeRow { fam: Fam; need: string; name: string; raw: string; m: string; clips: string[]; tris: number }
const sizes: SizeRow[] = [];
(window as unknown as { __sizes: SizeRow[] }).__sizes = sizes;

async function main() {
  const all = [...CANDS, ...(await gapCands())];
  const list = all.filter((c) => fams.includes(c.fam) && (!only || only.includes(c.need)));
  const loader = new GLTFLoader();
  const hud = document.getElementById('hud')!;
  let done = 0;
  const loaded = await Promise.all(list.map(async (c) => {
    try {
      const gl = await loader.loadAsync(encodeURI(c.file));
      hud.textContent = `loading ${++done}/${list.length}`;
      return { c, root: gl.scene, clips: gl.animations.map((a) => a.name) };
    } catch (e) {
      console.warn('FAIL', c.file, e);
      return null;
    }
  }));

  let z = 0;
  const all3 = new THREE.Box3();
  for (const fam of fams) {
    const items = loaded.filter((x): x is NonNullable<typeof x> => !!x && x.c.fam === fam).slice(from, to);
    if (!items.length) continue;
    const famGroup = new THREE.Group();
    scene.add(famGroup);
    const ref = new THREE.Group();
    ref.add(pole(1.75, '#c0392b'));
    const cat = pole(0.45, '#2e86c1');
    cat.position.x = 0.25;
    ref.add(cat);
    ref.position.set(-0.8, 0, z);
    const ft = label(FAM_NAME[fam], 'fam');
    ft.position.set(0, 2.2, 0);
    ref.add(ft);
    famGroup.add(ref);
    let x = 0, rowDepth = 0, col = 0;
    for (const { c, root, clips } of items) {
      const rawBox = new THREE.Box3().setFromObject(root);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      const s = c.scale ?? FAM_SCALE[c.fam];
      root.scale.multiplyScalar(s);
      if (useToon) toToon(root);
      let tris = 0;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = m.receiveShadow = true;
        const gm = m.geometry;
        tris += (gm.index ? gm.index.count : gm.attributes.position.count) / 3;
      });
      const box = new THREE.Box3().setFromObject(root);
      const sz = box.getSize(new THREE.Vector3());
      if (col >= cols) { z += rowDepth + 1.6; x = 0; rowDepth = 0; col = 0; }
      // place: min corner x at cursor, centered on row z, standing on ground
      const holder = new THREE.Group();
      root.position.x -= box.min.x;
      root.position.y -= box.min.y;
      root.position.z -= (box.min.z + box.max.z) / 2;
      holder.add(root);
      holder.position.set(x, 0, z);
      const name = c.file.split('/').pop()!.replace(/\.(glb|gltf)$/, '');
      const t = label(`${c.need}: ${name}<br><small>${sz.x.toFixed(2)}×${sz.y.toFixed(2)}×${sz.z.toFixed(2)} m</small>`);
      t.position.set(sz.x / 2, 0, sz.z / 2 + 0.25);
      holder.add(t);
      famGroup.add(holder);
      sizes.push({ fam, need: c.need, name, raw: rawSize.toArray().map((v) => +v.toFixed(3)).join('x'), m: sz.toArray().map((v) => +v.toFixed(2)).join('x'), clips, tris: Math.round(tris) });
      x += Math.max(sz.x, 0.9) + 0.6;
      rowDepth = Math.max(rowDepth, sz.z);
      col++;
    }
    z += rowDepth + 3.2;
    all3.expandByObject(famGroup);
  }
  console.table(sizes);
  hud.textContent = `${sizes.length} models  |  fam=${fams.join(',')}${only ? '  only=' + only.join(',') : ''}  |  red pole 1.75 m, blue 0.45 m${useToon ? '  |  toon' : ''}`;

  const c = all3.getCenter(new THREE.Vector3());
  const bs = all3.getSize(new THREE.Vector3());
  const r = bs.length() / 2;
  const vfov = THREE.MathUtils.degToRad(camera.fov / 2);
  const hfov = Math.atan(Math.tan(vfov) * camera.aspect);
  const dist = Math.max((bs.x / 2) / Math.tan(hfov), (bs.z / 2) / Math.tan(vfov)) * 1.05 + bs.y;
  const dir = { iso: new THREE.Vector3(0, 0.9, 1), front: new THREE.Vector3(0, 0.25, 1), top: new THREE.Vector3(0, 1, 0.05), low: new THREE.Vector3(0.35, 0.35, 1) }[angle] ?? new THREE.Vector3(0, 0.9, 1);
  camera.position.copy(c).addScaledVector(dir.normalize(), dist * Number(P.get('zoom') ?? 1));
  controls.target.copy(c);
  controls.update();
  sun.position.copy(c).add(new THREE.Vector3(-8, 20, 12));
  sun.target.position.copy(c);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -r * 1.2;
  sc.right = sc.top = r * 1.2;
  sc.far = 100;
  sc.updateProjectionMatrix();
  (window as unknown as { __ready: boolean }).__ready = true;
}

function frame() {
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
  requestAnimationFrame(frame);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
});
main();
frame();
