/** Keyboard + mouse state with per-frame edges. Keys by KeyboardEvent.code. */
import { localUi, settings } from '../core/profile';

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
      this.mouseDX += e.movementX * settings.sens;
      this.mouseDY += e.movementY * settings.sens;
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private key(e: KeyboardEvent, isDown: boolean) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    // synthetic events (automation, some virtual keyboards) can come without a code
    const code = e.code || (e.key.length === 1 ? (e.key === ' ' ? 'Space' : `Key${e.key.toUpperCase()}`) : e.key === 'Shift' ? 'ShiftLeft' : e.key);
    if (this.intercept?.(e, isDown)) {
      e.preventDefault();
      // a key let go inside a minigame is still let go: otherwise E stays "held" and the next E press is lost
      if (!isDown) this.set(code, false);
      return;
    }
    if (['Tab', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'KeyR', 'KeyF'].includes(code)) e.preventDefault();
    if (isDown && localUi.paused) return; // the pause card is up: no walking, grabbing or pawing behind it
    this.set(code, isDown, e.repeat);
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
    // paused: let go of everything held when the card came up (releases still reach the game, so holds end cleanly)
    if (localUi.paused) for (const k of [...this.down]) this.set(k, false);
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
    const plain = () => {
      try { (this.canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* not allowed right now */ }
    };
    // raw mouse (no OS acceleration) where the browser supports it, the plain lock elsewhere
    try {
      const req = this.canvas.requestPointerLock as unknown as (o?: { unadjustedMovement?: boolean }) => Promise<void> | undefined;
      const r = req.call(this.canvas, { unadjustedMovement: true });
      if (r?.catch) r.catch((e: unknown) => { if ((e as Error)?.name !== 'NotAllowedError' && !this.locked) plain(); });
    } catch { plain(); }
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
