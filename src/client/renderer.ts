/**
 * Renderer, scene and the client-owned lighting: warm key light with soft shadows fitted to the house,
 * hemisphere fill, dusk tint (time.dusk, ADDENDUM M22), blackout (sitter darkness + phone flashlight,
 * cats get a subtle cat-vision), catnip tint, a white flash for the end-show shutter.
 */
import * as THREE from 'three';
import type { Role } from '../shared/contracts';

const KEY_DAY = new THREE.Color('#fff3df'), KEY_DUSK = new THREE.Color('#ffae6b');
const SKY_DAY = new THREE.Color('#dfe9ff'), SKY_DUSK = new THREE.Color('#ffcfa8');
const CAT_VISION = new THREE.Color('#9fe0d6');
const GROUND = new THREE.Color('#b88f6c');
const KEY_I = 2.6, HEMI_I = 1.55;

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80);
  readonly hemi = new THREE.HemisphereLight(SKY_DAY, GROUND, HEMI_I);
  readonly sun = new THREE.DirectionalLight(KEY_DAY, KEY_I);
  readonly flashlight = new THREE.SpotLight('#fff6e0', 0, 16, 0.5, 0.6, 1.1);
  /** 0..1, set from the time.dusk world key */
  dusk = 0;
  private bg = new THREE.Color('#f4e4cc');
  private duskBg = new THREE.Color('#f0b98a');
  private darkBg = new THREE.Color('#0d0f18');
  private dark = 0;
  private catnip = 0;
  private t = 0;
  private col = new THREE.Color();
  private center = new THREE.Vector3();
  private flashEl: HTMLDivElement;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    // PCF with a blur radius (r18x removed PCFSoft): soft edges from one shadow map
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = this.bg.clone();
    this.scene.add(this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.06;
    this.sun.shadow.radius = 3;
    this.fitShadow(new THREE.Box3(new THREE.Vector3(-10, 0, -7), new THREE.Vector3(10, 3, 7)));
    this.scene.add(this.sun, this.sun.target);
    this.flashlight.visible = false;
    this.flashlight.castShadow = false;
    this.scene.add(this.flashlight, this.flashlight.target);
    this.flashEl = document.createElement('div');
    this.flashEl.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:40;transition:opacity 0.12s';
    document.body.appendChild(this.flashEl);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** aim the key light so its shadow camera covers the whole house (soft daylight from the front windows' side) */
  fitShadow(box: THREE.Box3) {
    box.getCenter(this.center);
    const size = box.getSize(new THREE.Vector3());
    const dir = new THREE.Vector3(-0.42, 1, 0.55).normalize();
    this.sun.position.copy(this.center).addScaledVector(dir, 16);
    this.sun.target.position.copy(this.center);
    this.sun.target.updateMatrixWorld();
    const r = Math.hypot(size.x, size.z) / 2 + 0.6;
    const sc = this.sun.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 4; sc.far = 32;
    sc.updateProjectionMatrix();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** a short white flash (camera shutter) */
  flash(ms = 120) {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = '0.9';
    void this.flashEl.offsetWidth;
    setTimeout(() => { this.flashEl.style.transition = 'opacity 0.25s'; this.flashEl.style.opacity = '0'; }, ms);
  }

  /** lightsOn false = blackout. Sitter sees darkness + flashlight, cats get subtle cat-vision. */
  setLook(dt: number, lightsOn: boolean, role: Role, catnip: boolean) {
    this.t += dt;
    this.dark += ((lightsOn ? 0 : 1) - this.dark) * Math.min(1, dt * 4);
    this.catnip += ((catnip ? 1 : 0) - this.catnip) * Math.min(1, dt * 2);
    const d = this.dark, k = this.dusk;
    const sitterDark = role === 'sitter' ? d : 0;
    const catDark = role === 'cat' ? d : 0;
    // key light: day -> dusk tint and x0.75, almost off in a blackout (moonlight through the windows)
    this.sun.color.copy(KEY_DAY).lerp(KEY_DUSK, k);
    if (catDark > 0) this.sun.color.lerp(CAT_VISION, catDark * 0.5);
    this.sun.intensity = KEY_I * (1 - 0.25 * k) * (1 - d * (role === 'sitter' ? 0.93 : 0.72));
    // fill: sky lerp for dusk; cats keep enough fill to see in the dark, the sitter does not
    this.hemi.color.copy(SKY_DAY).lerp(SKY_DUSK, k).lerp(CAT_VISION, catDark * 0.75);
    this.hemi.groundColor.copy(GROUND).lerp(this.col.set('#2a3550'), sitterDark * 0.8);
    this.hemi.intensity = HEMI_I * (1 - sitterDark * 0.93) * (1 - catDark * 0.35);
    const bg = this.scene.background as THREE.Color;
    bg.copy(this.bg).lerp(this.duskBg, k).lerp(this.darkBg, Math.min(1, sitterDark + catDark * 0.7));
    this.renderer.toneMappingExposure = 1.12 + catDark * 0.18;
    this.flashlight.visible = sitterDark > 0.05;
    this.flashlight.intensity = 34 * sitterDark;
    const f: string[] = [];
    if (catDark > 0.02) f.push(`saturate(${(1 - catDark * 0.4).toFixed(3)}) brightness(${(1 + catDark * 0.12).toFixed(3)}) hue-rotate(${(-10 * catDark).toFixed(1)}deg)`);
    if (this.catnip > 0.02) f.push(`hue-rotate(${(Math.sin(this.t * 1.3) * 40 * this.catnip).toFixed(1)}deg) saturate(${(1 + this.catnip * 0.5).toFixed(3)})`);
    const filter = f.join(' ');
    if (this.canvas.style.filter !== filter) this.canvas.style.filter = filter;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
