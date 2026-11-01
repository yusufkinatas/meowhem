/** Renderer, scene, warm lights, blackout / cat-vision / catnip looks. */
import * as THREE from 'three';
import type { Role } from '../shared/contracts';

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80);
  readonly hemi = new THREE.HemisphereLight('#fff3df', '#b88f6c', 1.7);
  readonly sun = new THREE.DirectionalLight('#ffe1b5', 2.4);
  readonly flashlight = new THREE.SpotLight('#fff6e0', 0, 14, 0.42, 0.55, 1.2);
  private bg = new THREE.Color('#f4e4cc');
  private darkBg = new THREE.Color('#0d0f18');
  private dark = 0;
  private catnip = 0;
  private t = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = this.bg.clone();
    this.scene.add(this.hemi);
    this.sun.position.set(-6, 14, 8);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -12; sc.right = 12; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 40;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);
    this.flashlight.visible = false;
    this.scene.add(this.flashlight, this.flashlight.target);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** lightsOn false = blackout. Sitter sees darkness + flashlight, cats get subtle cat-vision. */
  setLook(dt: number, lightsOn: boolean, role: Role, catnip: boolean) {
    this.t += dt;
    this.dark += ((lightsOn ? 0 : 1) - this.dark) * Math.min(1, dt * 4);
    this.catnip += ((catnip ? 1 : 0) - this.catnip) * Math.min(1, dt * 2);
    const d = this.dark;
    const sitterDark = role === 'sitter' ? d : 0;
    const catDark = role === 'cat' ? d : 0;
    this.hemi.intensity = 1.7 * (1 - sitterDark * 0.94) * (1 - catDark * 0.45);
    this.hemi.color.set('#fff3df').lerp(new THREE.Color('#9fe0d6'), catDark * 0.7);
    this.sun.intensity = 2.4 * (1 - d * 0.95);
    (this.scene.background as THREE.Color).copy(this.bg).lerp(this.darkBg, sitterDark + catDark * 0.7);
    this.flashlight.visible = sitterDark > 0.05;
    this.flashlight.intensity = 30 * sitterDark;
    const f: string[] = [];
    if (catDark > 0.02) f.push(`saturate(${1 - catDark * 0.45}) brightness(${1 + catDark * 0.15}) hue-rotate(${-12 * catDark}deg)`);
    if (this.catnip > 0.02) f.push(`hue-rotate(${Math.sin(this.t * 1.3) * 40 * this.catnip}deg) saturate(${1 + this.catnip * 0.5})`);
    const filter = f.join(' ');
    if (this.canvas.style.filter !== filter) this.canvas.style.filter = filter;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
