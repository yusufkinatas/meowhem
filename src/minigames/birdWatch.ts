import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, pop, burst, fake, rand, clamp } from './kit';

// ADDENDUM 4.10: hold W to creep (+0.16/s while the bird looks away). Space pounces: >= 0.85 completes,
// earlier is a bonk on the glass (+0; window.ts reads the 0.0001 marker as a nose print).
const CREEP = 0.16, TELL = 0.35, POUNCE_AT = 0.85, BONK_MARK = 0.0001, GONE = 1.5;
const BIRD = { x: 470, y: 352 }, DOVE = { x: 700, y: 346 };

type Mode = 'away' | 'tell' | 'look' | 'gone';

export function birdWatch(host: MinigameHost): Game {
  const f = frame(host, 'birdWatch', 'Watch the birds', [[['W'], 'creep'], [['Space'], 'pounce']], { ticks: [POUNCE_AT] });
  const { stage } = f;

  const scene = el('div', 'bw-scene', stage);
  el('div', 'bw-sky', scene);
  el('div', 'bw-hill', scene);
  place(img('deciduous_tree', 'bw-tree far', scene), 560, 100, 200, 200);
  place(img('deciduous_tree', 'bw-tree', scene), -90, -20, 420, 420);
  el('div', 'bw-sill', scene);
  const dove = place(img('dove', 'bw-dove', scene), DOVE.x - 55, DOVE.y - 100, 110, 110);
  const bird = place(img('bird', 'bw-bird', scene), BIRD.x - 48, BIRD.y - 92, 96, 96);
  const q = place(el('div', 'mg-qmark bw-q', scene, '?'), BIRD.x + 14, BIRD.y - 136);
  const leaves = el('div', 'bw-leaves', stage);
  const glass = el('div', 'bw-glass', stage);
  el('div', 'bw-frame', stage);

  let t = 0, mode: Mode = 'away', modeT = rand(1.5, 3), creeping = false, chatT = 0, leafT = 1, botT = 0, peck = 0, bonked = false;
  const setMode = (m: Mode, d: number) => { mode = m; modeT = d; };

  function flutter(sec: number): void {
    setMode('gone', sec);
    f.sound('whoosh');
    q.classList.remove('on');
    bird.animate({ translate: ['0 0', '60px -120px', '420px -320px'], rotate: ['0deg', '-20deg', '-30deg'] }, { duration: 600, easing: 'ease-in', fill: 'forwards' });
  }

  function bonk(): void {
    f.sound('thud');
    stage.animate({ scale: ['1 1', '1.05 .93', '.98 1.02', '1 1'] }, { duration: 320, easing: 'ease-out' });
    const s = place(el('div', 'bw-smudge', glass), BIRD.x - 70 + rand(-60, 60), 150 + rand(-30, 40), 120, 70);
    s.animate({ opacity: [0, 0.9] }, { duration: 200, fill: 'forwards' });
    burst(stage, 410, 200, { asset: 'feather', n: 3, size: 34, spread: 140, up: 40, fall: 120, ms: 1200 });
  }

  function pounce(): void {
    if (f.locked() || mode === 'gone' || bonked) return;
    const p = host.getProgress();
    bonk();
    if (p >= POUNCE_AT) {
      bonked = true;
      f.report(0.25);
      flutter(99);
      return;
    }
    // too early: a bonk, everyone scatters except the dove
    f.report(BONK_MARK);
    f.lock(0.6);
    flutter(GONE);
  }

  return {
    update(dt) {
      const p = f.tick(dt);
      t += dt;
      modeT -= dt;
      if (modeT <= 0) {
        if (mode === 'away') { setMode('tell', TELL); q.classList.add('on'); pop(q, 1.4); bird.animate({ translate: ['0 0', '0 -10px', '0 0', '0 -6px', '0 0'] }, { duration: 350 }); }
        else if (mode === 'tell') { setMode('look', rand(1, 1.6)); q.classList.remove('on'); }
        else if (mode === 'look') setMode('away', rand(1.5, 3));
        else if (mode === 'gone' && p < 0.999) {
          setMode('away', rand(1.5, 3));
          bird.getAnimations().forEach((a) => a.cancel());
          bird.animate({ translate: ['-380px -300px', '0 0'], rotate: ['20deg', '0deg'] }, { duration: 700, easing: 'ease-out' });
        }
      }
      if (creeping && !f.locked() && mode !== 'gone' && p < 0.999) {
        if (mode === 'look') flutter(GONE);
        else f.stream(CREEP * dt);
      }
      if (p >= 0.999 && !bonked) { bonked = true; bonk(); flutter(99); }
      // the view creeps toward the bird; a little butt-wiggle sway while creeping
      const wig = creeping && mode !== 'gone' ? Math.sin(t * 16) * 4 : 0;
      scene.style.transform = `translate(${wig}px, 0) scale(${1 + clamp(p) * 0.35})`;
      peck = mode === 'away' ? Math.max(0, Math.sin(t * 7)) : 0;
      bird.style.transform = `scaleX(${mode === 'look' || mode === 'tell' ? 1 : -1}) rotate(${-peck * 28}deg) scaleY(${mode === 'look' ? 1.06 : 1})`;
      dove.style.transform = `scaleY(${1 + Math.sin(t * 1.3) * 0.01})`;
      chatT -= dt;
      if (creeping && mode !== 'gone' && chatT < 0) { chatT = 0.8; f.sound('chatter', { volume: 0.7 }); }
      leafT -= dt;
      if (leafT < 0) {
        leafT = rand(2, 4);
        const s = rand(40, 64);
        const lf = place(img('leaf_fluttering_in_wind', 'bw-leaf', leaves), -60, rand(20, 220), s, s);
        lf.animate({ transform: ['translate(0,0) rotate(0deg)', `translate(460px, ${rand(40, 120)}px) rotate(200deg)`, `translate(940px, ${rand(80, 200)}px) rotate(420deg)`] },
          { duration: rand(4500, 6500), easing: 'linear' }).onfinish = () => lf.remove();
      }
    },
    key(e, down) {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') { creeping = down; if (down && !e.repeat) f.flash('KeyW'); return true; }
      if (e.code !== 'Space') return false;
      if (down && !e.repeat) { f.flash('Space'); pounce(); }
      return true;
    },
    bot(dt) {
      // creep while it's busy, freeze on the tell, pounce once past the line
      botT -= dt;
      const want = mode === 'away' && botT <= 0;
      if (mode === 'tell' || mode === 'look') botT = rand(0.15, 0.3);
      if (want !== creeping) this.key(fake('KeyW', want), want);
      if (host.getProgress() >= POUNCE_AT + 0.02) this.key(fake('Space'), true);
    },
    finish() { f.finish(); },
    dispose: () => f.dispose(),
  };
}
