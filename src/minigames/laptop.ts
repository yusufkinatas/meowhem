import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, paw, furOf, pop, shake, squash, burst, fake, pick, rand } from './kit';

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const KW = 46, KH = 40, GAP = 6;
const KB_X = 110, KB_Y = 252; // keyboard deck origin in stage px
const ROW_X = [40, 56, 80], ROW_Y = [16, 62, 108];
const HITS = 14; // target slaps to finish

interface Item { a: string; name: string; sub: string; price: string }
const ITEMS: Record<string, Item> = {
  catnip: { a: 'herb', name: 'Catnip', sub: '40 kg', price: '$189.00' },
  box: { a: 'package', name: 'Cardboard box', sub: 'Empty', price: '$4.99' },
  bed: { a: 'bed', name: 'Heated bed', sub: 'Never used', price: '$79.00' },
  tuna: { a: 'canned_food', name: 'Tuna', sub: '300 cans', price: '$412.50' },
};

export function laptop(host: MinigameHost): Game {
  const f = frame(host, 'laptop', 'Online shopping', [[['A–Z'], 'hit the glowing key']]);
  const { stage } = f;
  const fur = furOf(host);

  // ---- screen
  const screen = place(el('div', 'lp-screen', stage), 150, 10, 520, 236);
  const site = el('div', 'lp-site', screen);
  const bar = el('div', 'lp-top', site);
  const logo = el('div', 'lp-logo', bar);
  img('package', 'lp-logo-ico', logo);
  el('span', '', logo, 'boxbox');
  const search = el('div', 'lp-search', bar);
  const typed = el('span', 'lp-typed', search);
  el('span', 'lp-caret', search);
  const cart = el('div', 'lp-cart', bar);
  img('shopping_cart', '', cart);
  const badge = el('b', 'lp-badge', cart, '0');
  const results = el('div', 'lp-results', site, 'Recommended for you');
  const grid = el('div', 'lp-grid', site);
  const order = String(host.data?.order ?? '');
  const keys = order.includes('nip') ? ['tuna', 'box', 'bed', 'catnip'] : ['catnip', 'box', 'bed', 'tuna'];
  const cards = keys.map((k) => {
    const it = ITEMS[k];
    const c = el('div', 'lp-card', grid);
    const pic = img(it.a, 'lp-pic', c);
    el('div', 'lp-name', c, it.name);
    el('div', 'lp-sub', c, `${it.sub} · ${it.price}`);
    el('div', 'lp-add', c, 'Add to cart');
    return { c, pic };
  });
  const placed = el('div', 'lp-placed', screen, '<b>Order placed</b><span>Arriving soon. Signature not required.</span>');
  img('credit_card', 'lp-placed-card', placed);

  // ---- keyboard
  const deck = place(el('div', 'lp-deck', stage), KB_X, KB_Y, 600, 220);
  const keyEl = new Map<string, { e: HTMLElement; x: number; y: number; row: number; col: number }>();
  ROWS.forEach((row, r) => [...row].forEach((ch, c) => {
    const x = ROW_X[r] + c * (KW + GAP), y = ROW_Y[r];
    const e = place(el('div', 'lp-key', deck, ch), x, y, KW, KH);
    keyEl.set(ch, { e, x: KB_X + x + KW / 2, y: KB_Y + y + KH / 2, row: r, col: c });
  }));
  place(el('div', 'lp-key lp-space', deck), 150, 154, 300, KH);

  const pad = place(el('div', 'lp-pad', stage), 712, 300, 100, 120);
  const mouse = img('computer_mouse', 'lp-mouse', stage);
  place(mouse, 728, 318, 70, 70);
  let mouseGone = false;

  const paws = [paw('beans', fur, 'lp-paw'), paw('beans', fur, 'lp-paw')];
  const rest = [{ x: 250, y: 318 }, { x: 572, y: 318 }];
  paws.forEach((p, i) => { stage.appendChild(p); place(p, rest[i].x - 75, rest[i].y, 150, 210); p.style.rotate = `${i ? -8 : 8}deg`; });
  const pawPos = rest.map((r) => ({ ...r, tx: r.x, ty: r.y }));

  // ---- state
  let side = 0;            // which half the next target is on
  let target = '';
  let text = '';
  let added = 0;
  let botT = 0;
  const half = (ch: string) => ('QWERTASDFGZXCV'.includes(ch) ? 0 : 1);
  const letters = [...ROWS.join('')];

  function newTarget(): void {
    if (target) keyEl.get(target)!.e.classList.remove('target');
    target = pick(letters.filter((l) => half(l) === side));
    keyEl.get(target)!.e.classList.add('target');
    pop(keyEl.get(target)!.e, 1.15);
  }

  function slap(ch: string): void {
    const k = keyEl.get(ch)!;
    const i = half(ch);
    const pp = pawPos[i];
    pp.tx = k.x;
    pp.ty = k.y - 20;
    const p = paws[i];
    p.animate({ scale: ['1', '1.08', '0.9', '1'], translate: ['0 0', '0 -26px', '0 10px', '0 0'] },
      { duration: 210, easing: 'cubic-bezier(.3,.7,.4,1)' });
    // a paw is three keys wide
    const row = ROWS[k.row];
    const c0 = Math.max(0, Math.min(row.length - 3, k.col - 1));
    let s = '';
    for (const c of row.slice(c0, c0 + 3)) {
      const e = keyEl.get(c)!.e;
      e.classList.remove('down');
      void e.offsetWidth;
      e.classList.add('down');
      s += c.toLowerCase().repeat(Math.random() < 0.3 ? 3 : 1);
    }
    s = [...s].sort(() => Math.random() - 0.5).join('');
    text = (text + s).slice(-24);
    typed.textContent = text;
    squash(search, 160);
    shake(screen, 3, 160);
    f.sound('typing');
    if (!mouseGone && i === 1 && host.getProgress() > 0.08) flingMouse();
  }

  function flingMouse(): void {
    mouseGone = true;
    f.sound('whoosh');
    mouse.animate(
      [{ transform: 'translate(0,0) rotate(0deg)' }, { transform: 'translate(70px,-200px) rotate(260deg)', offset: 0.5 },
        { transform: 'translate(150px,-120px) rotate(560deg)' }],
      { duration: 650, easing: 'cubic-bezier(.2,.6,.5,1)', fill: 'forwards' },
    );
    shake(pad, 5);
  }

  function addItem(n: number): void {
    const card = cards[n];
    card.c.classList.add('added');
    const ghost = img(ITEMS[keys[n]].a, 'lp-ghost', site);
    const a = card.pic.getBoundingClientRect(), b = cart.getBoundingClientRect(), s = site.getBoundingClientRect();
    const sc = a.width / (card.pic.offsetWidth || 1);
    place(ghost, (a.left - s.left) / sc, (a.top - s.top) / sc, card.pic.offsetWidth, card.pic.offsetHeight);
    ghost.animate(
      [{ transform: 'translate(0,0) scale(1)' },
        { transform: `translate(${(b.left - a.left) / sc / 2}px,-40px) scale(1.2)`, offset: 0.4 },
        { transform: `translate(${(b.left - a.left) / sc}px,${(b.top - a.top) / sc}px) scale(.3)`, opacity: 0.6 }],
      { duration: 600, easing: 'ease-in' },
    ).onfinish = () => {
      ghost.remove();
      badge.textContent = String(n + 1);
      pop(badge, 1.6);
      pop(cart, 1.2);
      f.sound('pop');
    };
  }

  newTarget();
  const MILESTONES = [0.2, 0.44, 0.68, 0.92];

  return {
    update(dt) {
      const p = f.tick();
      // ease paws toward their slap point, then home
      pawPos.forEach((pp, i) => {
        pp.x += (pp.tx - pp.x) * Math.min(1, dt * 22);
        pp.y += (pp.ty - pp.y) * Math.min(1, dt * 22);
        pp.tx += (rest[i].x - pp.tx) * Math.min(1, dt * 3);
        pp.ty += (rest[i].y - pp.ty) * Math.min(1, dt * 3);
        paws[i].style.left = `${pp.x - 75}px`;
        paws[i].style.top = `${pp.y}px`;
      });
      while (added < MILESTONES.length && p >= MILESTONES[added]) addItem(added++);
      results.textContent = text ? `Results for “${text.slice(-12)}”` : 'Recommended for you';
      if (p >= 0.999 && !screen.classList.contains('done')) {
        screen.classList.add('done');
        keyEl.get(target)?.e.classList.remove('target');
        f.sound('ding');
        burst(stage, 410, 120, { asset: 'sparkles', n: 7, size: 46, spread: 160 });
      }
      if (!mouseGone && p > 0.3) flingMouse();
    },
    key(e, down) {
      const m = /^Key([A-Z])$/.exec(e.code);
      if (!m || !keyEl.has(m[1])) return false;
      if (!down || e.repeat) return true;
      f.flash(e.code);
      slap(m[1]);
      if (m[1] === target) {
        host.progress(1 / HITS);
        burst(stage, keyEl.get(target)!.x, keyEl.get(target)!.y - 10, { asset: 'sparkles', n: 2, size: 30, spread: 70, up: 60 });
        side ^= 1;
        newTarget();
      } else {
        shake(keyEl.get(target)!.e, 4, 200);
      }
      return true;
    },
    bot(dt) {
      botT -= dt;
      if (botT > 0) return;
      botT = rand(0.22, 0.42);
      const ch = Math.random() < 0.85 ? target : pick(letters);
      this.key(fake(`Key${ch}`), true);
    },
    dispose: () => f.dispose(),
  };
}

