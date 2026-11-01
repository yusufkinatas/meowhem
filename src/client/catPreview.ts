/**
 * Live 3D preview of the player's real cat (registry.createCatModel) for the title screen.
 * One small WebGL canvas for the app lifetime; it only renders while attached to the DOM.
 * Drag to turn the cat, click it for a meow.
 */
import * as THREE from 'three';
import type { CatFace, CatLook, CatModelApi, CatVisualState } from '../shared/contracts';
import { createCatModel } from '../registry';

export class CatPreview {
  readonly canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  private cat: CatModelApi | null = null;
  private look: CatLook | null = null;
  private raf = 0;
  private last = 0;
  private yaw = -0.5;
  private spin = 0;
  private drag: { x: number; moved: number } | null = null;
  private react = 0;
  private talk = 0;
  private face: CatFace = 'happy';
  private idleT = 0;
  onMeow: (() => void) | null = null;

  constructor() {
    this.canvas.className = 'cat-preview';
    this.scene.add(new THREE.HemisphereLight('#fff6ea', '#c9a27e', 1.9));
    const key = new THREE.DirectionalLight('#fff3df', 2.2);
    key.position.set(1.5, 3, 2.5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#ffd9b0', 1.1);
    rim.position.set(-2, 1.5, -2);
    this.scene.add(rim);
    this.camera.position.set(0, 0.4, 1.35);
    this.camera.lookAt(0, 0.21, 0);
    this.canvas.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, moved: 0 }; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      this.drag.x = e.clientX;
      this.drag.moved += Math.abs(dx);
      this.yaw += dx * 0.012;
      this.spin = dx * 0.6;
    });
    this.canvas.addEventListener('pointerup', () => {
      if (this.drag && this.drag.moved < 4) { this.talk = 0.5; this.react = 0.9; this.face = 'happy'; this.onMeow?.(); }
      this.drag = null;
    });
  }

  /** put the canvas in a host element and start rendering */
  mount(host: HTMLElement, look: CatLook) {
    host.appendChild(this.canvas);
    try {
      this.renderer ??= new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    } catch (e) {
      console.warn('[preview] no WebGL', e);
      return;
    }
    this.setLook(look, false);
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.loop); }
  }

  setLook(look: CatLook, poke = true) {
    const swap = !this.cat || !this.look || this.look.accessory !== look.accessory || this.look.pattern !== look.pattern;
    this.look = { ...look };
    if (!this.cat) {
      this.cat = createCatModel(this.look);
      this.scene.add(this.cat.root);
    } else this.cat.setLook(this.look);
    if (poke) {
      this.react = 0.8;
      this.face = swap ? (Math.random() < 0.5 ? 'smug' : 'happy') : 'happy';
    }
  }

  private loop = (now: number) => {
    this.raf = 0;
    if (!this.canvas.isConnected || !this.renderer || !this.cat) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w && h && (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.round(h * this.renderer.getPixelRatio()))) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (!this.drag) { this.spin *= Math.exp(-dt * 3); this.yaw += (this.spin * 0.012) + Math.sin(now / 2600) * dt * 0.12; }
    this.react = Math.max(0, this.react - dt);
    this.talk = Math.max(0, this.talk - dt);
    this.idleT += dt;
    const groom = !this.react && this.idleT % 9 > 7.2;
    const chonk = this.look?.chonk ?? 0.5;
    const s: CatVisualState = {
      anim: this.react > 0.4 ? 'jump' : groom ? 'groom' : 'sit',
      face: this.react > 0 ? this.face : groom ? 'sleepy' : 'neutral',
      speed: 0, vy: this.react > 0.55 ? 1.5 : 0, grounded: this.react <= 0.4,
      wet: 0, puffed: false, high: false, talk: this.talk > 0 ? 'meow' : null, lookAt: null, dizzy: false,
      pounceCharge: 0, wiggle: 0, carrying: null,
    };
    this.cat.update(dt, s);
    this.cat.root.rotation.y = this.yaw;
    this.camera.position.set(0, 0.4, 1.32 + chonk * 0.15);
    this.renderer.render(this.scene, this.camera);
  };
}
