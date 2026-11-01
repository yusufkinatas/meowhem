import type { MinigameHost } from '../shared/contracts';
import { type Game, frame, el, img, place, paw, furOf, squash, shake, burst, fake, tap, rand } from './kit';

const SWIPES = 10;
// package.svg at W px; tape centreline in svg units: (21.25,5.6) -> (9.75,13) -> (9.75,16.6)
const W = 380, X0 = 220, Y0 = 30, U = W / 32;
const P = [[21.25, 5.6], [9.75, 13], [9.75, 16.6]].map(([x, y]) => ({ x: X0 + x * U, y: Y0 + y * U }));
const L1 = Math.hypot(P[1].x - P[0].x, P[1].y - P[0].y), L2 = P[2].y - P[1].y, LEN = L1 + L2;

/** point along the tape at fraction s */
function at(s: number): { x: number; y: number } {
  const d = s * LEN;
  if (d <= L1) return { x: P[0].x + ((P[1].x - P[0].x) * d) / L1, y: P[0].y + ((P[1].y - P[0].y) * d) / L1 };
  return { x: P[1].x, y: P[1].y + (d - L1) };
}

export function openBox(host: MinigameHost): Game {
  const f = frame(host, 'openBox', 'Open the box', [[['A', 'D'], 'claw'], [[], 'or drag along the tape']]);
  const { stage } = f;
  const fur = furOf(host);

  el('div', 'ob-floor', stage);
  const shadow = place(el('div', 'ob-shadow', stage), X0 + 30, Y0 + W - 70, W - 60, 60);
  const box = place(el('div', 'ob-box', stage), X0, Y0, W, W);
  img('package', 'ob-pkg', box).style.cssText = 'left:0;top:0;width:100%;height:100%';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ob-tear');
  svg.setAttribute('viewBox', `${X0} ${Y0} ${W} ${W}`);
  const d = `M${P[0].x} ${P[0].y}L${P[1].x} ${P[1].y}L${P[2].x} ${P[2].y}`;
  svg.innerHTML = `<path class="ob-guide" d="${d}"/><path class="ob-slit" d="${d}" pathLength="1"/><g class="ob-marks"></g>`;
  box.appendChild(svg);
  const slit = svg.querySelector<SVGPathElement>('.ob-slit')!;
  const marks = svg.querySelector<SVGGElement>('.ob-marks')!;
  // svg lives inside the box div, so its user units are stage px offset by the box origin
  const pawEl = paw('back', fur, 'ob-paw claws');
  stage.appendChild(pawEl);
  const rest = at(0.05);
  place(pawEl, rest.x + 10, rest.y + 50);

  let last = -1, dragging = false, dragAcc = 0, lastX = 0, lastY = 0, botT = 0, botSide = 0, t = 0;

  function swipe(i: number): void {
    const s = Math.min(1, host.getProgress() + 0.05);
    const pt = at(s);
    const dir = i === last ? 0.5 : 1;
    last = i;
    // rest just below-right of the tear so the tape stays readable; slash across it
    pawEl.style.left = `${pt.x + 10}px`;
    pawEl.style.top = `${pt.y + 50}px`;
    pawEl.animate(
      { translate: ['0 0', '10px -150px', '-110px -90px', '0 0'], rotate: ['0deg', '18deg', '-12deg', '0deg'] },
      { duration: 320, easing: 'cubic-bezier(.3,.8,.4,1)' },
    );
    host.progress(dir / SWIPES);
    const m = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    m.setAttribute('transform', `translate(${pt.x} ${pt.y}) rotate(${rand(30, 50)})`);
    m.innerHTML = [-9, 0, 9].map((o) => `<path d="M${o - 3} -16 L${o + 3} 16"/>`).join('');
    marks.appendChild(m);
    squash(box, 220);
    f.sound(Math.random() < 0.5 ? 'scratch' : 'paperRip');
    burst(stage, pt.x, pt.y, { cls: 'ob-bit', n: 4, size: 14, spread: 80, up: 40, fall: 90 });
  }

  return {
    update(dt) {
      const p = f.tick();
      t += dt;
      slit.style.strokeDashoffset = `${1 - p}`;
      if (p < 0.999) box.style.rotate = `${Math.sin(t * 2) * 1.2}deg`;
      if (p >= 0.999 && !box.classList.contains('open')) {
        box.classList.add('open');
        box.style.rotate = '0deg';
        box.animate({ translate: ['0 0', '0 -40px', '0 0'], scale: ['1 1', '0.95 1.08', '1.06 0.94', '1 1'] }, { duration: 500, easing: 'ease-out' });
        shake(shadow, 4);
        f.sound('pop');
        burst(stage, X0 + W / 2, Y0 + 60, { asset: 'sparkles', n: 6, size: 54, spread: 200, up: 60 });
        burst(stage, X0 + W / 2, Y0 + 90, { asset: 'dashing_away', n: 3, size: 90, spread: 160, up: 30 });
      }
    },
    key(e, down) {
      const l = e.code === 'KeyA' || e.code === 'ArrowLeft', r = e.code === 'KeyD' || e.code === 'ArrowRight' || e.code === 'Space';
      if (!l && !r) return false;
      if (tap(e, down, e.code)) { f.flash(e.code); swipe(l ? 0 : 1); }
      return true;
    },
    mouse(e) {
      if (e.type === 'mousedown') { dragging = true; lastX = e.clientX; lastY = e.clientY; }
      if (e.type === 'mouseup') dragging = false;
      if (e.type === 'mousemove' && dragging && e.buttons) {
        dragAcc += Math.hypot(e.clientX - lastX, e.clientY - lastY);
        lastX = e.clientX; lastY = e.clientY;
        if (dragAcc > 45) { dragAcc = 0; swipe(last ^ 1); }
      }
    },
    bot(dt) {
      botT -= dt;
      if (botT > 0) return;
      botT = rand(0.22, 0.34);
      botSide ^= 1;
      this.key(fake(botSide ? 'KeyD' : 'KeyA'), true);
    },
    dispose: () => f.dispose(),
  };
}
