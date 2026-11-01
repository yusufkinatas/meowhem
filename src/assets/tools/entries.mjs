// Final asset selection. fit = target meters on final axes (uniform unless nonUniform), prop = PropKind (fit to collider).
const A = '/Users/yusufeminkinatas/Desktop/cat-game/assets-raw/';
const CC0 = 'CC0 1.0', BY = 'CC-BY 3.0';

const KCP = A + 'chars/kenney-cube-pets/Models/GLB format/';
const KAY = A + 'chars/kaykit-adventurers/KayKit-Character-Pack-Adventures-1.0-main/addons/kaykit_character_pack_adventures/Characters/gltf/';
const KFB = A + 'furniture/kaykit-furniture-bits/KayKit-Furniture-Bits-1.0-main/addons/kaykit_furniture_bits/Assets/gltf/';
const TTK = A + 'furniture/tinytreats-charming-kitchen/Tiny-Treats-Charming-Kitchen-1.0-main/addons/tiny_treats_charming_kitchen_set/Assets/gltf/';
const TTB = A + 'furniture/tinytreats-bubbly-bathroom/Tiny-Treats-Bubbly-Bathroom-1.0-main/addons/tiny_treats_bubbly_bathroom_set/Assets/gltf/';
const TTH = A + 'furniture/tinytreats-homely-house/Tiny-Treats-Homely-House-1.0-main/addons/tiny_treats_homely_house_set/Assets/gltf/';
const QUA = A + 'furniture/quaternius-ultimate-house-interior/glb/';
const KFK = A + 'furniture/kenney-furniture-kit/Models/GLTF format/';
const FPP = A + 'furniture/polypizza/';
const PPP = A + 'props/polypizza/';
const TTP = A + 'props/tinytreats-house-plants/Assets/gltf/';
const TTPP = A + 'props/tinytreats-pleasant-picnic/Assets/gltf/';
const TTBG = A + 'props/tinytreats-baked-goods/Assets/gltf/';
const KFD = A + 'props/kenney-food-kit/Models/GLB format/';

const kenneyPets = { lic: CC0, author: 'Kenney', url: 'https://kenney.nl/assets/cube-pets' };
const kaykitAdv = { lic: CC0, author: 'Kay Lousberg (KayKit)', url: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0' };
const kfb = { lic: CC0, author: 'Kay Lousberg (KayKit)', url: 'https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0' };
const ttk = { lic: CC0, author: 'Isa Lousberg (Tiny Treats)', url: 'https://github.com/TinyTreats-Game-Assets/Tiny-Treats-Charming-Kitchen-1.0' };
const ttb = { lic: CC0, author: 'Isa Lousberg (Tiny Treats)', url: 'https://github.com/TinyTreats-Game-Assets/Tiny-Treats-Bubbly-Bathroom-1.0' };
const tth = { lic: CC0, author: 'Isa Lousberg (Tiny Treats)', url: 'https://github.com/TinyTreats-Game-Assets/Tiny-Treats-Homely-House-1.0' };
const ttp = { lic: CC0, author: 'Isa Lousberg (Tiny Treats)', url: 'https://tinytreats.itch.io/house-plants' };
const ttpp = { lic: CC0, author: 'Isa Lousberg (Tiny Treats)', url: 'https://tinytreats.itch.io/pleasant-picnic' };
const ttbg = { lic: CC0, author: 'Isa Lousberg (Tiny Treats)', url: 'https://opengameart.org/content/tiny-treats-baked-goods-set' };
const qua = { lic: CC0, author: 'Quaternius', url: 'https://quaternius.com/packs/ultimatehomeinterior.html' };
const kfk = { lic: CC0, author: 'Kenney', url: 'https://kenney.nl/assets/furniture-kit' };
const kfd = { lic: CC0, author: 'Kenney', url: 'https://kenney.nl/assets/food-kit' };
const pp = (id, author, lic) => ({ lic, author, url: `https://poly.pizza/m/${id}` });

const SITTER_CLIPS = [
  'Idle', 'Unarmed_Idle', 'Unarmed_Pose', 'Walking_A', 'Walking_B', 'Walking_C', 'Walking_Backwards', 'Running_A', 'Running_B',
  'Jump_Start', 'Jump_Idle', 'Jump_Land', 'Jump_Full_Short', 'PickUp', 'Interact', 'Use_Item', 'Throw', 'Cheer',
  'Hit_A', 'Hit_B', 'Death_A', 'Death_A_Pose', 'Lie_Down', 'Lie_Idle', 'Lie_StandUp', 'Sit_Chair_Idle', 'Sit_Floor_Down', 'Sit_Floor_Idle', 'Sit_Floor_StandUp',
  'Block', 'Blocking', 'Dodge_Forward', '1H_Ranged_Aiming', '1H_Ranged_Shoot', '2H_Melee_Idle', 'Spellcast_Raise', 'Spellcasting', 'Unarmed_Melee_Attack_Punch_A',
];

export const ENTRIES = [
  // ------------------------------------------------------------ characters
  { key: 'cat', cat: 'chars', src: KCP + 'animal-cat.glb', name: 'Cube Pets: animal-cat', ...kenneyPets, fit: { y: 0.45 },
    clips: { static: 'static', idle: 'idle', walk: 'walk', run: 'run', eat: 'eat', happy: 'gesture-positive', no: 'gesture-negative', dance: 'dance' },
    nodes: { body: 'body', face: 'Group', tail: 'tail', legFL: 'leg-front-left', legFR: 'leg-front-right', legBL: 'leg-back-left', legBR: 'leg-back-right' },
    notes: 'Node-animated (not skinned): each part is its own mesh, so procedural gait/tail/squash are plain node rotations. Eyes are UV-mapped palette cells on the flat front face of `body`; overlay face decals there. Material + colormap are shared by every clone: clone them before recoloring.' },
  { key: 'sitter', cat: 'chars', src: KAY + 'Rogue.glb', name: 'KayKit Adventurers: Rogue', ...kaykitAdv, fit: { y: 1.75 },
    dropNodes: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable', 'Rogue_Cape'], keepClips: SITTER_CLIPS,
    clips: {
      idle: 'Unarmed_Idle', walk: 'Walking_A', run: 'Running_A', jump: 'Jump_Start', fall: 'Jump_Idle', land: 'Jump_Land',
      carry: '1H_Ranged_Aiming', spray: '1H_Ranged_Shoot', clean: 'Interact', interact: 'Interact', shakeTreats: 'Use_Item',
      stunned: 'Hit_A', grabReach: 'PickUp', celebrate: 'Cheer', despair: 'Sit_Floor_Down', despairIdle: 'Sit_Floor_Idle', scoop: 'PickUp',
      throw: 'Throw', walkBack: 'Walking_Backwards',
    },
    nodes: { head: 'Rogue_Head', body: 'Rogue_Body', handR: 'handslotr', handL: 'handslotl', headBone: 'head' },
    notes: 'Skinned 41-joint rig. Weapons and cape removed. Bones handslotr / handslotl = spray bottle + scruff anchors. Single palette texture (rogue_texture): recolor skin/hair/shirt by repainting a canvas copy.' },
  { key: 'bird', cat: 'chars', src: KCP + 'animal-chick.glb', name: 'Cube Pets: animal-chick', ...kenneyPets, fit: { y: 0.16 },
    clips: { idle: 'idle', walk: 'walk', run: 'run', eat: 'eat', happy: 'gesture-positive' }, notes: 'Window bird. Separate wing meshes.' },

  // ------------------------------------------------------------ living room
  { key: 'sofa', cat: 'furniture', src: KFB + 'couch_pillows.gltf', name: 'couch_pillows', ...kfb, fit: { x: 2.0 } },
  { key: 'armchair', cat: 'furniture', src: KFB + 'armchair_pillows.gltf', name: 'armchair_pillows', ...kfb, scale: 0.6667 },
  { key: 'coffeeTable', cat: 'furniture', src: KFB + 'table_low.gltf', name: 'table_low', ...kfb, fit: { y: 0.45, x: 1.2, z: 0.7 }, nonUniform: true },
  { key: 'tvStand', cat: 'furniture', src: KFB + 'cabinet_medium.gltf', name: 'cabinet_medium', ...kfb, fit: { y: 0.55, x: 1.3, z: 0.5 }, nonUniform: true },
  { key: 'tv', cat: 'furniture', src: FPP + 'tv_retro_safayan.glb', name: 'Retro TV', ...pp('2tfjTOK1Lh4', 'Alex Safayan', BY), fit: { x: 0.75 }, notes: 'Tabletop CRT with antennas. Screen is material `mat23` (near black, no UVs): put a UV-mapped plane with the Cat TV texture just in front of it.' },
  { key: 'bookshelf', cat: 'furniture', src: KFK + 'bookcaseOpen.glb', name: 'bookcaseOpen', ...kfk, fit: { y: 1.8 }, tint: { wood: '#c98a58' }, notes: 'Empty: fill with book / frame / plantPot props.' },
  { key: 'wallShelf', cat: 'furniture', src: KFB + 'shelf_B_large_decorated.gltf', name: 'shelf_B_large_decorated', ...kfb, scale: 0.6 },
  { key: 'shelf', cat: 'furniture', src: KFB + 'shelf_A_big.gltf', name: 'shelf_A_big', ...kfb, scale: 0.6 },
  { key: 'rug', cat: 'furniture', src: KFB + 'rug_rectangle_stripes_A.gltf', name: 'rug_rectangle_stripes_A', ...kfb, fit: { x: 2.6, z: 1.8, y: 0.03 }, nonUniform: true },
  { key: 'rugRound', cat: 'furniture', src: KFB + 'rug_oval_A.gltf', name: 'rug_oval_A', ...kfb, fit: { x: 2.0, z: 1.4, y: 0.03 }, nonUniform: true },
  { key: 'plant', cat: 'furniture', src: TTP + 'monstera_plant_large_potted.gltf', name: 'monstera_plant_large_potted', ...ttp, fit: { y: 1.3 } },
  { key: 'plantTall', cat: 'furniture', src: TTP + 'yucca_plant_large_potted.gltf', name: 'yucca_plant_large_potted', ...ttp, fit: { y: 1.5 } },
  { key: 'plantSmall', cat: 'furniture', src: TTP + 'sansevieria_plant_medium_potted.gltf', name: 'sansevieria_plant_medium_potted', ...ttp, fit: { y: 0.6 } },
  { key: 'sideTable', cat: 'furniture', src: KFB + 'table_small.gltf', name: 'table_small', ...kfb, fit: { y: 0.6, x: 0.5, z: 0.5 }, nonUniform: true },
  { key: 'floorLamp', cat: 'furniture', src: KFB + 'lamp_standing.gltf', name: 'lamp_standing', ...kfb, fit: { y: 1.6 } },
  { key: 'curtains', cat: 'furniture', src: QUA + 'Curtains_Double.glb', name: 'Curtains_Double', ...qua, fit: { y: 2.3 }, tint: { Couch_Blue: '#c8694a', LightMetal: '#8a6a4a' } },
  { key: 'window', cat: 'furniture', src: QUA + 'Window_Large1.glb', name: 'Window_Large1', ...qua, fit: { x: 1.6 }, tint: { White: '#fbf7ef' } },
  { key: 'aquarium', cat: 'furniture', src: FPP + 'fishtank_chrisross.glb', name: 'Fish Tank', ...pp('2Rb9zxgkDEM', 'Chris Ross', BY), fit: { x: 0.9 }, simplify: 0.5, notes: 'Glass is transparent (no shadow). Built-in fish are materials `mat18` + `mat13` (one mesh per color, not per fish): hide them and swim 3 `fish` clones (rotation reset) inside for tank.fish 0..3.' },
  { key: 'catTree', cat: 'furniture', src: FPP + 'cattree_patsiefring.glb', name: 'Cat Tree', ...pp('daMM0nomcTL', 'Pat Siefring', BY), fit: { y: 1.5 } },
  { key: 'wallFrame', cat: 'furniture', src: KFB + 'pictureframe_large_A.gltf', name: 'pictureframe_large_A', ...kfb, fit: { y: 0.6 } },

  // ------------------------------------------------------------ kitchen
  { key: 'counter', cat: 'furniture', src: TTK + 'countertop_straight_A.gltf', name: 'countertop_straight_A', ...ttk, fit: { y: 0.92, x: 1.2, z: 0.62 }, nonUniform: true },
  { key: 'counterCorner', cat: 'furniture', src: TTK + 'countertop_corner_inner.gltf', name: 'countertop_corner_inner', ...ttk, scale: [0.6, 0.92, 0.6] },
  { key: 'kitchenSink', cat: 'furniture', src: TTK + 'countertop_sink.gltf', name: 'countertop_sink', ...ttk, scale: [0.6, 0.92, 0.4133] },
  { key: 'stove', cat: 'furniture', src: TTK + 'stove.gltf', name: 'stove', ...ttk, scale: [0.6, 0.92, 0.4133], nodes: { door: 'stove_door' } },
  { key: 'fridge', cat: 'furniture', src: TTK + 'fridge.gltf', name: 'fridge', ...ttk, scale: [0.45, 0.6167, 0.42], nodes: { doorTop: 'fridge_door_top', doorBottom: 'fridge_door_bottom' } },
  { key: 'wallCabinet', cat: 'furniture', src: TTK + 'wall_cabinet_straight.gltf', name: 'wall_cabinet_straight', ...ttk, scale: [0.6, 0.6, 0.4] },
  { key: 'extractorHood', cat: 'furniture', src: TTK + 'extractor_hood.gltf', name: 'extractor_hood', ...ttk, scale: [0.6, 0.6, 0.42] },
  { key: 'cuttingBoard', cat: 'furniture', src: TTK + 'cuttingboard.gltf', name: 'cuttingboard', ...ttk, fit: { x: 0.45 } },
  { key: 'diningTable', cat: 'furniture', src: KFB + 'table_medium.gltf', name: 'table_medium', ...kfb, fit: { y: 0.75, x: 1.2, z: 0.9 }, nonUniform: true },
  { key: 'chair', cat: 'furniture', src: KFB + 'chair_A_wood.gltf', name: 'chair_A_wood', ...kfb, fit: { y: 0.9 } },
  { key: 'carrier', cat: 'furniture', src: TTPP + 'picnic_basket_square.gltf', name: 'picnic_basket_square', ...ttpp, fit: { x: 0.62, y: 0.38, z: 0.46 }, nonUniform: true,
    nodes: { lidLeft: 'picnic_basket_lid_left', lidRight: 'picnic_basket_lid_right', handleLeft: 'picnic_basket_handle_left', handleRight: 'picnic_basket_handle_right' },
    notes: 'No free pet carrier exists; a lidded wicker basket (classic cat basket) stands in. Flip the two lid nodes for carrier.closed, wobble the root while a caged cat mashes.' },
  { key: 'laundryBasket', cat: 'furniture', src: TTPP + 'picnic_basket_round.gltf', name: 'picnic_basket_round', ...ttpp, fit: { y: 0.45 }, notes: 'Wicker basket used as the laundry basket (laundry spot).' },
  { key: 'foodBowl', cat: 'furniture', src: FPP + 'petbowl_full_google.glb', name: 'Dog bowl (full)', ...pp('eA4LSFu4lj1', 'Poly by Google', BY), fit: { x: 0.2 }, simplify: 0.25 },
  { key: 'foodBowlEmpty', cat: 'furniture', src: FPP + 'petbowl_empty_google.glb', name: 'Dog bowl (empty)', ...pp('cMk8S7aDHny', 'Poly by Google', BY), fit: { x: 0.2 } },

  // ------------------------------------------------------------ bathroom
  { key: 'bathtub', cat: 'furniture', src: TTB + 'bath.gltf', name: 'bath', ...ttb, fit: { z: 1.7 }, nodes: { water: 'bath_water' } },
  { key: 'toilet', cat: 'furniture', src: QUA + 'Bathroom_Toilet.glb', name: 'Bathroom_Toilet', ...qua, fit: { y: 0.8 }, tint: { White: '#f7f3ec' } },
  { key: 'bathSink', cat: 'furniture', src: TTB + 'cabinet_bathroom.gltf', name: 'cabinet_bathroom', ...ttb, fit: { y: 0.9 } },
  { key: 'mirror', cat: 'furniture', src: TTB + 'mirror.gltf', name: 'mirror', ...ttb, fit: { y: 0.7 } },
  { key: 'washer', cat: 'furniture', src: QUA + 'Bathroom_WashingMachine.glb', name: 'Bathroom_WashingMachine', ...qua, fit: { y: 0.85 }, tint: { White: '#f4f0e8', Grey: '#b9c3c9' } },
  { key: 'litterBox', cat: 'furniture', src: FPP + 'tray_milkandbanana.glb', name: 'Container Bag Open', ...pp('WytMSfw8xI', 'MilkAndBanana', CC0), fit: { x: 0.5 }, uvRemap: { 54: 206, 1: 103 }, notes: 'Open plastic tray recolored to mint with sand-colored litter. Put poop models on the fill for litter.fill.' },
  { key: 'tpHolder', cat: 'furniture', src: QUA + 'Bathroom_ToiletPaper.glb', name: 'Bathroom_ToiletPaper', ...qua, fit: { x: 0.16 }, tint: { White: '#ffffff', Brown: '#b9773f', LightMetal: '#c8c8c8' } },
  { key: 'bathMat', cat: 'furniture', src: TTB + 'mat.gltf', name: 'mat', ...ttb, fit: { x: 0.9 } },

  // ------------------------------------------------------------ bedroom
  { key: 'bed', cat: 'furniture', src: KFB + 'bed_double_A.gltf', name: 'bed_double_A', ...kfb, fit: { z: 2.1 } },
  { key: 'nightstand', cat: 'furniture', src: KFB + 'cabinet_small.gltf', name: 'cabinet_small', ...kfb, fit: { y: 0.55 } },
  { key: 'wardrobe', cat: 'furniture', src: KFK + 'bookcaseClosedDoors.glb', name: 'bookcaseClosedDoors', ...kfk, fit: { y: 1.95 }, tint: { wood: '#c98a58', metal: '#e0c27a' } },

  // ------------------------------------------------------------ office
  { key: 'desk', cat: 'furniture', src: KFB + 'table_medium_long.gltf', name: 'table_medium_long', ...kfb, fit: { y: 0.75, x: 1.4, z: 0.7 }, nonUniform: true },
  { key: 'officeChair', cat: 'furniture', src: KFK + 'chairDesk.glb', name: 'chairDesk', ...kfk, fit: { y: 1.0 } },
  { key: 'laptop', cat: 'furniture', src: PPP + 'laptop_UGOWjMUC5U.glb', name: 'Laptop', ...pp('UGOWjMUC5U', 'J-Toastie', BY), rot: [0, -90, 0], fit: { x: 0.34 }, notes: 'Screen material is `Screen` (near black): put the laptop.screen canvas texture on it or on a plane in front.' },

  // ------------------------------------------------------------ hallway
  { key: 'frontDoor', cat: 'furniture', src: QUA + 'Door_8.glb', name: 'Door_8', ...qua, fit: { y: 2.05 }, tint: { Wood: '#8a4f2e', Metal: '#c9a35a' }, notes: 'Door leaf only. Hinge edge at x = +size[0]/2.' },
  { key: 'door', cat: 'furniture', src: TTB + 'wall_tiled_doorway.gltf', name: 'wall_tiled_doorway (door node only)', ...ttb, keepNodes: ['wall_tiled_door'], scale: [0.5625, 0.7321, 0.25], notes: 'Interior door leaf (frame is architecture). Hinge edge at x = -size[0]/2.' },
  { key: 'shoeRack', cat: 'furniture', src: FPP + 'littlebookcase_doncarson.glb', name: 'Little Bookcase', ...pp('74tXfxoDB9b', 'Don Carson', BY), rot: [0, 180, 0], fit: { y: 0.8 } },
  { key: 'coatRack', cat: 'furniture', src: FPP + 'hatrack_doncarson.glb', name: 'Hat Rack', ...pp('6QuAe-X7WG1', 'Don Carson', BY), fit: { y: 1.75 } },
  { key: 'fuseBox', cat: 'furniture', src: FPP + 'fusebox_zeoxo.glb', name: 'Fuse Box', ...pp('dCzy46eI_IT', 'zeoxo', BY), rot: [0, 180, 0], fit: { y: 0.5 } },
  { key: 'doormat', cat: 'furniture', src: TTH + 'doormat.gltf', name: 'doormat', ...tth, fit: { x: 0.9 } },

  // ------------------------------------------------------------ decor (static dressing)
  { key: 'boots', cat: 'decor', src: TTH + 'boots.gltf', name: 'boots', ...tth, fit: { y: 0.24 } },
  { key: 'packageOpen', cat: 'decor', src: PPP + 'empty-box_pZBpmjtvw8.glb', name: 'Empty Box', ...pp('pZBpmjtvw8', 'CreativeTrio', CC0), fit: { x: 0.5 } },
  { key: 'towels', cat: 'decor', src: TTB + 'towel_stacked.gltf', name: 'towel_stacked', ...ttb, fit: { x: 0.35 } },
  { key: 'ducky', cat: 'decor', src: A + 'props/tinytreats-bubbly-bathroom/Assets/gltf/ducky.gltf', name: 'ducky', ...ttb, fit: { y: 0.1 } },
  { key: 'toaster', cat: 'decor', src: TTK + 'toaster.gltf', name: 'toaster', ...ttk, fit: { x: 0.26 } },
  { key: 'kettle', cat: 'decor', src: TTK + 'kettle.gltf', name: 'kettle', ...ttk, fit: { y: 0.22 } },
  { key: 'bread', cat: 'decor', src: TTBG + 'bread.gltf', name: 'bread', ...ttbg, fit: { z: 0.28 } },
  { key: 'fruitBowl', cat: 'decor', src: TTPP + 'grapes_bowl.gltf', name: 'grapes_bowl', ...ttpp, fit: { x: 0.22 } },
  { key: 'alarmClock', cat: 'decor', src: PPP + 'alarm-clock_y5f363OS9C.glb', name: 'Alarm Clock', ...pp('y5f363OS9C', 'CreativeTrio', CC0), fit: { y: 0.13 } },
  { key: 'fishBones', cat: 'decor', src: KFD + 'fish-bones.glb', name: 'fish-bones', ...kfd, fit: { z: 0.3 } },

  // ------------------------------------------------------------ props (PropKind, origin = collider center)
  { key: 'mug', cat: 'props', prop: 'mug', src: A + 'props/tinytreats-charming-kitchen/Assets/gltf/mug_red.gltf', name: 'mug_red', ...ttk },
  { key: 'glass', cat: 'props', prop: 'glass', src: TTPP + 'wine_glass.gltf', name: 'wine_glass', ...ttpp },
  { key: 'plate', cat: 'props', prop: 'plate', match: 'x', src: A + 'props/tinytreats-charming-kitchen/Assets/gltf/plate.gltf', name: 'plate', ...ttk },
  { key: 'vase', cat: 'props', prop: 'vase', src: PPP + 'vase_20LOTk3BnjO.glb', name: 'Vase', ...pp('20LOTk3BnjO', 'Poly by Google', BY) },
  { key: 'book', cat: 'props', prop: 'book', rot: [0, 90, 0], fit: { x: 0.15, y: 0.2, z: 0.05 }, nonUniform: true, src: A + 'props/kaykit-furniture-bits/gltf/book_single.gltf', name: 'book_single', ...kfb },
  { key: 'remote', cat: 'props', prop: 'remote', match: 'z', rot: [-90, 0, 0], src: PPP + 'timehotel-remote_11SpVcTGeWH.glb', name: 'TIME HOTEL 2.22', ...pp('11SpVcTGeWH', 'S. Paul Michael', BY) },
  { key: 'plantPot', cat: 'props', prop: 'plantPot', src: TTP + 'pothos_plant_small_potted.gltf', name: 'pothos_plant_small_potted', ...ttp },
  { key: 'frame', cat: 'props', prop: 'frame', src: A + 'props/kaykit-furniture-bits/gltf/pictureframe_standing_A.gltf', name: 'pictureframe_standing_A', ...kfb },
  { key: 'wineBottle', cat: 'props', prop: 'wineBottle', src: TTPP + 'wine_bottle.gltf', name: 'wine_bottle', ...ttpp },
  { key: 'cerealBox', cat: 'props', prop: 'cerealBox', match: 'all', src: PPP + 'timehotel-cereal-blue_8McuTnDFC-Z.glb', name: 'TIME HOTEL 3.28', ...pp('8McuTnDFC-Z', 'S. Paul Michael', BY) },
  { key: 'toyMouse', cat: 'props', prop: 'toyMouse', match: 'z', rot: [0, 90, 0], src: PPP + 'toy-mouse_49PYgABKfFo.glb', name: 'Toy Mouse', ...pp('49PYgABKfFo', 'sirkitree', BY) },
  { key: 'yarn', cat: 'props', prop: 'yarn', match: 'y', dropNodes: ['group1337943959'], src: PPP + 'yarn-ball-v2_0kSphuYy8Or.glb', name: 'Yarn Ball v2', ...pp('0kSphuYy8Or', 'sirkitree', BY) },
  { key: 'phone', cat: 'props', prop: 'phone', match: 'z', rot: [-90, 0, 0], src: PPP + 'phone_k2kgBepoMU.glb', name: 'Phone', ...pp('k2kgBepoMU', 'Quaternius', CC0) },
  { key: 'candle', cat: 'props', prop: 'candle', src: A + 'props/tinytreats-bubbly-bathroom/Assets/gltf/candle.gltf', name: 'candle', ...ttb },
  { key: 'tpRoll', cat: 'props', prop: 'tpRoll', rot: [0, 0, 90], src: PPP + 'toilet-paper_b-iE6Ii4GZk.glb', name: 'Toilet paper', ...pp('b-iE6Ii4GZk', 'Poly by Google', BY) },
  { key: 'salmon', cat: 'props', prop: 'salmon', match: 'z', src: PPP + 'salmon_2BeZAlQ73h.glb', name: 'Salmon', ...pp('2BeZAlQ73h', 'Quaternius', CC0) },
  { key: 'package', cat: 'props', prop: 'package', match: 'all', src: TTH + 'package.gltf', name: 'package', ...tth },
  { key: 'pillow', cat: 'props', prop: 'pillow', match: 'x', src: A + 'props/kaykit-furniture-bits/gltf/pillow_A.gltf', name: 'pillow_A', ...kfb },
  { key: 'bowl', cat: 'props', prop: 'bowl', match: 'x', src: TTPP + 'bowl.gltf', name: 'bowl', ...ttpp },
  { key: 'shoe', cat: 'props', prop: 'shoe', match: 'z', rot: [0, 90, 0], src: PPP + 'trainer_cs7k_ENAZjQ.glb', name: 'Trainer', ...pp('cs7k_ENAZjQ', 'jeremy', BY) },
  { key: 'sock', cat: 'props', prop: 'sock', match: 'z', rot: [-90, 0, 0], keepNodes: ['Socks'], src: PPP + 'socks_hcfzStK2HR.glb', name: 'Socks', ...pp('hcfzStK2HR', 'MiniPoly', BY) },
  { key: 'cucumber', cat: 'props', prop: 'cucumber', match: 'z', rot: [0, 90, 0], src: PPP + 'cucumber_nyGEAKs590.glb', name: 'Cucumber', ...pp('nyGEAKs590', 'Quaternius', CC0) },
  { key: 'lamp', cat: 'props', prop: 'lamp', src: PPP + 'lamp-with-shade_1nKtMmYxLT.glb', name: 'Lamp With Shade', ...pp('1nKtMmYxLT', 'CreativeTrio', CC0) },
  { key: 'trophy', cat: 'props', prop: 'trophy', src: PPP + 'trophy_6Xu7mttjodo.glb', name: 'Trophy', ...pp('6Xu7mttjodo', 'Casey Tumbers', BY) },
  { key: 'sprayBottle', cat: 'props', src: PPP + 'spray-bottle_uQ6VGKpkWm.glb', name: 'Spray Bottle', ...pp('uQ6VGKpkWm', 'J-Toastie', BY), fit: { y: 0.24 }, notes: 'Sitter tool (not a PropKind). Nozzle points +X in source, rotated so it points +Z.', rot: [0, -90, 0] },
  { key: 'treatBag', cat: 'props', src: A + 'props/tinytreats-bakery-interior/Assets/gltf/flour_sack_closed.gltf', name: 'flour_sack_closed', lic: CC0, author: 'Isa Lousberg (Tiny Treats)', url: 'https://tinytreats.itch.io/bakery-interior', fit: { y: 0.2 }, notes: 'Sitter tool (not a PropKind). Rolled-top sack with a blank label.' },

  // ------------------------------------------------------------ mess (MessKind, origin = feet / floor contact)
  { key: 'poop', cat: 'mess', origin: 'feet', src: PPP + 'scary-poop_uVFt6LRcYU.glb', name: 'Scary Poop', ...pp('uVFt6LRcYU', 'hat_my_guy', CC0), fit: { x: 0.13 } },
  { key: 'fish', cat: 'mess', origin: 'feet', src: PPP + 'fish_XWl86YFtpF.glb', name: 'Fish', ...pp('XWl86YFtpF', 'Quaternius', CC0), rot: [0, 0, 90], fit: { z: 0.26 }, clips: { swim: 'Armature|Swim' }, notes: 'Rotated onto its side for flopping: play the swim clip fast. Also good for tank fish (rotation [0,0,0]).' },
  { key: 'tp', cat: 'mess', origin: 'feet', src: PPP + 'timehotel-rock-forms-5-white_28cOcmtim4L.glb', name: 'TIME HOTEL Rock Forms 5 (White)', ...pp('28cOcmtim4L', 'S. Paul Michael', BY), fit: { x: 0.45 }, notes: 'Crumpled white heap read as unrolled toilet paper.' },
  { key: 'shards', cat: 'mess', origin: 'feet', src: KFD + 'plate-broken.glb', name: 'plate-broken', ...kfd, fit: { x: 0.3 } },
];
