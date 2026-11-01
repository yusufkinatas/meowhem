/**
 * The laptop's screen as a canvas texture: lock screen, the "boxbox" store while a cat paw-types
 * (same beats as the laptop minigame), and the order confirmation. Redraws only when something changes.
 */
import * as THREE from 'three';

const W = 512, H = 320;
const SPRITES = ['herb', 'canned_food', 'package', 'bed', 'shopping_cart', 'credit_card'] as const;
type Sprite = (typeof SPRITES)[number];
const ORDERS: Record<string, { name: string; sprite: Sprite }> = {
  catnip: { name: 'Catnip, 5 kg', sprite: 'herb' },
  wetFood: { name: 'Wet food, salmon, 48 cans', sprite: 'canned_food' },
};
const CARDS: [Sprite, string, string][] = [['herb', 'Catnip', '$64.00'], ['canned_food', 'Wet food', '$96.00'], ['package', 'Box, large', '$3.50'], ['bed', 'Heated bed', '$79.00']];
const SMASH = 'kjjjj;;llfdsaaa;kjhhhhggf;;;lkjjjjjjjd';
const DIALOGS = ['Place order?', '48 of them?', 'Arrives today. Confirm?'];
const FONT = '"Nunito", ui-rounded, "Avenir Next", "Trebuchet MS", system-ui, sans-serif';
const INK = '#4a2e22';

export interface LaptopScreen {
  readonly texture: THREE.CanvasTexture;
  set(screen: string, progress: number, order: string): void;
  update(dt: number): void;
}

export function createLaptopScreen(): LaptopScreen {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const img = new Map<Sprite, HTMLImageElement>();
  let screen = 'idle', progress = 0, order = 'catnip', dirty = true, blink = 0, caret = true;
  for (const s of SPRITES) {
    const i = new Image();
    i.onload = () => { img.set(s, i); dirty = true; };
    i.src = new URL(`../../minigames/assets/${s}.svg`, import.meta.url).href;
  }
  const sprite = (s: Sprite, x: number, y: number, size: number) => { const i = img.get(s); if (i) g.drawImage(i, x, y, size, size); };
  const rr = (x: number, y: number, w: number, h: number, r: number, fill: string) => { g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
  const text = (s: string, x: number, y: number, size: number, color = INK, weight = 900, align: CanvasTextAlign = 'left') => {
    g.font = `${weight} ${size}px ${FONT}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y);
  };

  function topBar(typed: string, auto: boolean) {
    sprite('package', 16, 12, 30);
    text('boxbox', 50, 28, 24, '#c4733a');
    rr(150, 12, 290, 32, 16, '#f4ece3');
    g.save(); g.beginPath(); g.rect(162, 12, 268, 32); g.clip();
    text(typed, 164, 29, auto ? 17 : 18, INK, auto ? 900 : 700);
    if (caret && !auto) { g.font = `700 18px ${FONT}`; rr(166 + g.measureText(typed).width, 18, 2, 20, 1, INK); }
    g.restore();
    sprite('shopping_cart', 452, 10, 36);
    g.fillStyle = '#e8574a'; g.beginPath(); g.arc(486, 14, 10, 0, Math.PI * 2); g.fill();
    text('1', 486, 15, 13, '#fff', 900, 'center');
  }

  function draw() {
    g.clearRect(0, 0, W, H);
    if (screen === 'off') { g.fillStyle = '#0c0f12'; g.fillRect(0, 0, W, H); return; }
    if (screen === 'idle') {
      const gr = g.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0, '#f3c48f'); gr.addColorStop(1, '#d9877a');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      text('6:00', W / 2, 130, 84, '#fffaf2', 800, 'center');
      text('Friday', W / 2, 192, 26, '#fff3e3', 700, 'center');
      return;
    }
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    const o = ORDERS[order] ?? ORDERS.catnip;
    if (screen === 'ordered') {
      topBar('', true);
      g.fillStyle = '#2f9a5e'; g.beginPath(); g.arc(96, 150, 44, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 11; g.beginPath(); g.moveTo(74, 152); g.lineTo(91, 169); g.lineTo(120, 133); g.stroke();
      text('Order placed', 164, 112, 32);
      text(o.name, 164, 150, 20, '#7b5a48', 800);
      text('Qty 48', 164, 178, 20, '#7b5a48', 800);
      text('Arrives today', 164, 206, 20, '#2f9a5e', 900);
      rr(24, 246, 464, 52, 12, '#fbf4ec');
      sprite('credit_card', 36, 252, 40);
      text('Card ending 4417 charged', 88, 272, 20, '#a24a3a', 900);
      return;
    }
    // hacking: the store, by beat
    const p = progress;
    if (p < 0.6) {
      const n = Math.max(1, Math.round((p / 0.55) * SMASH.length));
      const auto = p > 0.55;
      topBar(auto ? o.name : SMASH.slice(0, n), auto);
      CARDS.forEach(([s, name, price], i) => {
        const x = 16 + i * 122;
        rr(x, 60, 112, 150, 14, '#fbf4ec');
        sprite(s, x + 22, 70, 68);
        text(name, x + 56, 160, 17, INK, 900, 'center');
        text(price, x + 56, 186, 15, '#9b8576', 800, 'center');
      });
      rr(16, 224, 480, 40, 10, '#f6efe7');
      text('Recently viewed', 30, 244, 16, '#b09584', 800);
      text('Cat tree, 5 levels', 168, 244, 16, '#6d5446', 800);
      text('In your cart: Lint roller refills (6)', 30, 292, 15, '#a58b7b', 800);
    } else {
      topBar(o.name, true);
      sprite(o.sprite, 22, 72, 150);
      const q = Math.min(48, 1 + Math.round(((p - 0.6) / 0.2) * 47));
      text(o.name.length > 16 ? o.name.slice(0, o.name.indexOf(',') + 1) : o.name, 196, 96, 26);
      if (o.name.length > 16) text(o.name.slice(o.name.indexOf(',') + 2), 196, 126, 20, '#7b5a48', 800);
      text('Qty', 196, 162, 20, '#7b5a48', 800);
      rr(238, 146, 64, 32, 8, '#fff1d6');
      text(String(q), 270, 163, 20, INK, 900, 'center');
      text(p > 0.75 ? 'Arrives today' : 'Arrives in 5 to 7 days', 196, 200, 19, p > 0.75 ? '#2f9a5e' : '#7b5a48', 900);
      text('In your cart: Lint roller refills (6)', 196, 232, 15, '#a58b7b', 800);
      if (p >= 0.85) {
        const d = DIALOGS[Math.min(2, Math.floor((p - 0.85) / 0.05))];
        g.fillStyle = 'rgba(60,30,12,0.25)'; g.fillRect(0, 0, W, H);
        rr(96, 92, 320, 140, 18, '#ffffff');
        text(d, W / 2, 140, d.length > 14 ? 22 : 26, INK, 900, 'center');
        rr(196, 176, 120, 36, 18, '#ffad3b');
        text('OK', W / 2, 195, 20, '#fff', 900, 'center');
      }
    }
  }

  return {
    texture,
    set(s, p, ord) {
      const pq = Math.round(p * 100) / 100;
      if (s === screen && pq === progress && ord === order) return;
      screen = s; progress = pq; order = ord; dirty = true;
    },
    update(dt) {
      if (screen === 'hacking' && progress < 0.55) {
        blink += dt;
        if (blink > 0.5) { blink = 0; caret = !caret; dirty = true; }
      }
      if (!dirty) return;
      dirty = false;
      draw();
      texture.needsUpdate = true;
    },
  };
}
