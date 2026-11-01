/** Keyboard + mouse state with per-frame edges. Keys by KeyboardEvent.code. */
export class Input {
  readonly down = new Set<string>();
  private pressedQ = new Set<string>();
  private releasedQ = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  locked = false;
  /** a minigame (or menu) gets keys first; return true to swallow */
  intercept: ((e: KeyboardEvent, down: boolean) => boolean) | null = null;
  private lastTap = new Map<string, number>();
  doubleTapped = new Set<string>();

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.down.clear());
    canvas.addEventListener('mousedown', (e) => this.btn(e, true));
    window.addEventListener('mouseup', (e) => this.btn(e, false));
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private key(e: KeyboardEvent, isDown: boolean) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (this.intercept?.(e, isDown)) { e.preventDefault(); return; }
    if (['Tab', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'KeyR', 'KeyF'].includes(e.code)) e.preventDefault();
    this.set(e.code, isDown, e.repeat);
  }

  private btn(e: MouseEvent, isDown: boolean) {
    this.set(`Mouse${e.button}`, isDown, false);
  }

  /** also used by tests to inject input */
  set(code: string, isDown: boolean, repeat = false) {
    if (isDown) {
      if (!this.down.has(code) && !repeat) {
        this.pressedQ.add(code);
        const now = performance.now();
        if (now - (this.lastTap.get(code) ?? -1e9) < 350) this.doubleTapped.add(code);
        this.lastTap.set(code, now);
      }
      this.down.add(code);
    } else if (this.down.has(code)) {
      this.down.delete(code);
      this.releasedQ.add(code);
    }
  }

  pressed = new Set<string>();
  released = new Set<string>();
  /** call once per frame before reading edges */
  beginFrame() {
    this.pressed = this.pressedQ;
    this.released = this.releasedQ;
    this.pressedQ = new Set();
    this.releasedQ = new Set();
  }
  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.doubleTapped.clear();
  }

  lock() {
    if (this.locked) return;
    try {
      const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      r?.catch?.(() => {});
    } catch { /* not allowed right now */ }
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
