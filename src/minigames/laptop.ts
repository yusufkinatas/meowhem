import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, paw, furOf, pop, shake, squash, fake, gate, now, rand, clamp } from './kit';

// ADDENDUM 4.1: search (0 -> 0.6), checkout (0.6 -> 0.85), confirm (0.85 -> 1)
const B1 = 0.6, B2 = 0.85;
const LETTER = 0.0045, CHORD = 0.009, SAME = 0.0015, HOLD = 0.125, ENTER = 0.05, DIALOG_DELAY = 0.4;
const DIALOGS = ['Place order?', '48 of them?', 'Arrives today. Confirm?'];
const ORDERS: Record<string, { name: string; sprite: string }> = {
  catnip: { name: 'Catnip, 5 kg', sprite: 'herb' },
  wetFood: { name: 'Wet food, salmon, 48 cans', sprite: 'canned_food' },
};
const CARDS = [
  { a: 'herb', name: 'Catnip', price: '$64.00' },
  { a: 'canned_food', name: 'Wet food', price: '$96.00' },
  { a: 'package', name: 'Box, large', price: '$3.50' },
  { a: 'bed', name: 'Heated bed', price: '$79.00' },
];

// keyboard deck, stage px
const DECK = { x: 90, y: 252, w: 640, h: 178 };
const KW = 46, KH = 36, GAP = 6;
const ROWS: [string, number, number][] = [['QWERTYUIOP', 40, 12], ['ASDFGHJKL;', 52, 54], ['ZXCVBNM', 76, 96]];

export function laptop(host: MinigameHost): Game {
  const f = frame(host, 'laptop', 'Order something', [[['A–Z'], 'roll across'], [['Space'], 'lie on it'], [['Enter'], 'confirm']]);
  const { stage } = f;
  const fur = furOf(host);
  const order = ORDERS[String(host.data?.order)] ?? ORDERS.catnip;

  // ---- the store
  const screen = place(el('div', 'lp-screen', stage), 110, 6, 600, 240);
  const site = el('div', 'lp-site', screen);
  const top = el('div', 'lp-top', site);
  const logo = el('div', 'lp-logo', top);
  img('package', 'lp-logo-ico', logo);
  el('span', '', logo, 'boxbox');
  const search = el('div', 'lp-search', top);
  const typed = el('span', 'lp-typed', search);
  el('span', 'lp-caret', search);
  const cart = el('div', 'lp-cart', top);
  img('shopping_cart', '', cart);
  const badge = el('b', 'lp-badge', cart, '1');

  const home = el('div', 'lp-home', site);
  const grid = el('div', 'lp-grid', home);
  for (const c of CARDS) {
    const card = el('div', 'lp-card', grid);
    img(c.a, 'lp-pic', card);
    el('div', 'lp-name', card, c.name);
    el('div', 'lp-price', card, c.price);
  }
  el('div', 'lp-recent', home, '<span>Recently viewed</span> Cat tree, 5 levels');

  const prod = el('div', 'lp-prod', site);
  img(order.sprite, 'lp-big', prod);
  const info = el('div', 'lp-info', prod);
  el('div', 'lp-pname', info, order.name);
  const qtyRow = el('div', 'lp-row', info, 'Qty ');
  const qty = el('b', 'lp-qty', qtyRow, '1');
  const ship = el('div', 'lp-row lp-ship', info, 'Arrives in 5 to 7 days');
  el('div', 'lp-row lp-cartline', info, 'In your cart: Lint roller refills (6)');

  const dialog = el('div', 'lp-dialog', site);
  const dText = el('div', 'lp-dtext', dialog);
  el('div', 'lp-dbtn', dialog, '<span class="mg-kbd sm">Enter</span> OK');
  const card = img('credit_card', 'lp-card-fly', stage);
  place(card, 640, 120, 96, 96);

  // ---- keyboard
  const deck = place(el('div', 'lp-deck', stage), DECK.x, DECK.y, DECK.w, DECK.h);
  const keys = new Map<string, { e: HTMLElement; x: number; y: number }>();
  for (const [row, x0, y] of ROWS) [...row].forEach((ch, i) => {
    const x = x0 + i * (KW + GAP);
    const code = ch === ';' ? 'Semicolon' : `Key${ch}`;
    keys.set(code, { e: place(el('div', 'lp-key', deck, ch), x, y, KW, KH), x: DECK.x + x + KW / 2, y: DECK.y + y + KH / 2 });
  });
  const enterX = 52 + 10 * (KW + GAP);
  keys.set('Enter', { e: place(el('div', 'lp-key lp-enter', deck, 'Enter'), enterX, 54, 64, KH), x: DECK.x + enterX + 32, y: DECK.y + 54 + KH / 2 });
  keys.set('Space', { e: place(el('div', 'lp-key lp-space', deck), 170, 138, 300, 30), x: DECK.x + 320, y: DECK.y + 153 });

  const paws = [paw('back', fur, 'lp-paw'), paw('back', fur, 'lp-paw')];
  const rest = [{ x: 260, y: 300 }, { x: 560, y: 300 }];
  const pos = rest.map((r) => ({ x: r.x, y: r.y, tx: r.x, ty: r.y }));
  paws.forEach((p, i) => { stage.appendChild(p); p.style.rotate = `${i ? -10 : 10}deg`; });

  // ---- state
  const held = new Set<string>();
  const cap = gate(14, true);
  let text = '', lastCode = '', typeT = 0, spaceHeld = false, beat = 0, botT = 0, botIdx = 0;
  let dialogN = 0, dialogT = DIALOG_DELAY, dialogOn = false, dialogAge = 0, doneShown = false;
  const botKeys: string[] = [];
  const ordered = [...keys.keys()].filter((k) => k.startsWith('Key'));

  function slap(code: string, i: number): void {
    const k = keys.get(code);
    if (!k) return;
    pos[i].tx = k.x;
    pos[i].ty = k.y - 18;
    paws[i].animate({ scale: ['1', '1.06 .9', '1'], translate: ['0 0', '0 8px', '0 0'] }, { duration: 160, easing: 'ease-out' });
  }

  function letter(code: string, key: string): void {
    held.add(code);
    keys.get(code)?.e.classList.add('down');
    const i = (keys.get(code)?.x ?? 0) < DECK.x + DECK.w / 2 ? 0 : 1;
    slap(code, i);
    f.flash('Letters');
    if (now() - typeT > 0.25) { typeT = now(); f.sound('typing'); }
    if (beat !== 0) { lastCode = code; return; }
    text += held.size >= 6 ? 'jjjjjjjj' : (key.length === 1 ? key : code === 'Semicolon' ? ';' : code.slice(3)).toLowerCase();
    text = text.slice(-22);
    typed.textContent = text;
    squash(search, 140);
    if (code !== 'Semicolon' && cap()) {
      const d = held.size >= 3 ? CHORD : held.size === 1 && code === lastCode ? SAME : LETTER;
      f.stream(d);
    }
    lastCode = code;
  }

  function setBeat(b: number): void {
    beat = b;
    f.dim('Letters', b !== 0);
    f.dim('Space', b !== 1);
    f.dim('Enter', b !== 2);
    if (b >= 1 && !site.classList.contains('checkout')) {
      site.classList.add('checkout');
      typed.textContent = order.name;
      search.classList.add('auto');
      badge.textContent = '2';
      pop(badge, 1.6);
      f.sound('pop');
    }
  }
  setBeat(0);

  return {
    update(dt) {
      const p = f.tick(dt);
      if (p >= 0.999 && !doneShown) {
        doneShown = true;
        dialog.classList.remove('on');
        f.sound('ding');
        f.sound('buzz');
        card.classList.add('on');
        shake(screen, 4, 260);
      }
      const b = p >= B2 ? 2 : p >= B1 ? 1 : 0;
      if (b !== beat) setBeat(b);
      // checkout: the cat lies on the keyboard
      if (beat === 1 && spaceHeld && !f.locked()) f.stream(HOLD * dt);
      const k = clamp((p - B1) / (B2 - B1));
      qty.textContent = String(Math.max(1, Math.round(1 + 47 * k * k)));
      if (k > 0.55 && !ship.classList.contains('today')) { ship.classList.add('today'); ship.textContent = 'Arrives today'; pop(ship, 1.15); }
      // confirm: an Enter before its dialog appears does nothing
      dialogAge = dialogOn ? dialogAge + dt : 0;
      if (beat === 2 && p < 0.999 && !dialogOn) {
        dialogT -= dt;
        if (dialogT <= 0) {
          dialogOn = true;
          dText.textContent = DIALOGS[Math.min(dialogN, DIALOGS.length - 1)];
          dialog.classList.add('on');
          pop(dialog, 1.08);
          f.sound('pop');
        }
      }
      // paws: lie on space during checkout, else drift home
      const lying = beat === 1 && spaceHeld;
      pos.forEach((pp, i) => {
        if (lying) { pp.tx = 250 + i * 140; pp.ty = DECK.y + 90; }
        pp.x += (pp.tx - pp.x) * Math.min(1, dt * 20);
        pp.y += (pp.ty - pp.y) * Math.min(1, dt * 20);
        if (!lying && !held.size) { pp.tx += (rest[i].x - pp.tx) * Math.min(1, dt * 2.5); pp.ty += (rest[i].y - pp.ty) * Math.min(1, dt * 2.5); }
        place(paws[i], pp.x - 65, pp.y, 130, 182);
        paws[i].style.scale = lying ? '1.08 .86' : '1';
      });
      keys.get('Space')!.e.classList.toggle('down', spaceHeld);
    },
    key(e, down) {
      const code = e.code;
      if (code === 'Space') {
        if (down && !e.repeat) f.flash('Space');
        if (spaceHeld !== down) {
          spaceHeld = down;
          if (down && beat === 1) { f.sound('typing'); squash(deck, 220); }
        }
        return true;
      }
      if (code === 'Enter' || code === 'NumpadEnter') {
        if (!down || e.repeat) return true;
        f.flash('Enter');
        slap('Enter', 1);
        keys.get('Enter')!.e.classList.add('down');
        setTimeout(() => keys.get('Enter')?.e.classList.remove('down'), 120);
        if (beat === 2 && dialogOn && !f.locked()) {
          dialogOn = false;
          dialogT = DIALOG_DELAY;
          dialogN++;
          dialog.classList.remove('on');
          f.report(ENTER);
          f.sound('pop');
        }
        return true;
      }
      if (!keys.has(code) || !code.startsWith('Key') && code !== 'Semicolon') return false;
      if (!down) { held.delete(code); keys.get(code)?.e.classList.remove('down'); return true; }
      if (!e.repeat && !held.has(code)) letter(code, e.key);
      return true;
    },
    bot(dt) {
      // a cat rolling its paw across the row: 2 to 3 keys down at any time
      botT -= dt;
      if (botT > 0) return;
      if (beat === 0) {
        botT = 1 / 12;
        botIdx = (botIdx + (Math.random() < 0.8 ? 1 : 2)) % ordered.length;
        const c = ordered[botIdx];
        this.key(fake(c), true);
        botKeys.push(c);
        if (botKeys.length > 3 || Math.random() < 0.2) this.key(fake(botKeys.shift()!, false), false);
      } else {
        while (botKeys.length) this.key(fake(botKeys.shift()!, false), false);
        if (beat === 1 && !spaceHeld) this.key(fake('Space'), true);
        if (beat === 2) {
          if (spaceHeld) this.key(fake('Space', false), false);
          if (dialogOn && dialogAge > rand(0.2, 0.35)) this.key(fake('Enter'), true);
        }
      }
    },
    finish() { f.finish(); },
    dispose: () => f.dispose(),
  };
}
