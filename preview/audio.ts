import { createAudio, renderMusic, SOUND_NAMES } from '../src/audio/audio';
import type { SoundName, Vec3 } from '../src/shared/contracts';

const audio = createAudio();
const $ = (id: string) => document.getElementById(id)!;
const btn = (label: string, parent: HTMLElement, onClick: (b: HTMLButtonElement) => void) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => { audio.unlock(); onClick(b); };
  parent.appendChild(b);
  return b;
};
const pos = (): Vec3 | undefined => {
  const v = ($('pos') as HTMLSelectElement).value;
  return v ? (v.split(',').map(Number) as Vec3) : undefined;
};
const pitch = () => Number(($('pitch') as HTMLInputElement).value);
$('pitch').oninput = () => { $('pitchV').textContent = pitch().toFixed(2); };
$('vol').oninput = () => audio.setMasterVolume(Number(($('vol') as HTMLInputElement).value));
audio.setListener([0, 0, 0], 0);

const modes = ['off', 'menu', 'game', 'tense', 'catnip'] as const;
const mb = modes.map((m) => btn(m, $('music'), () => { audio.setMusic(m); mb.forEach((x) => x.classList.toggle('on', x.textContent === m)); }));
for (const n of ['purr', 'waterRun', 'typing', 'scratch', 'chatter', 'alarm'] as SoundName[]) {
  let on = false;
  btn(n, $('loops'), (b) => { on = !on; b.classList.toggle('on', on); audio.loop(`preview-${n}`, n, on, { pos: pos() }); });
}
const soundBtns = new Map<SoundName, HTMLButtonElement>();
for (const n of SOUND_NAMES) soundBtns.set(n, btn(n, $('sounds'), () => audio.play(n, { pos: pos(), pitch: pitch() })));

// ---- checks: every sound decoded with sane length and level, music renders without clipping
const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -120);
function stats(b: AudioBuffer) {
  let pk = 0, sum = 0, n = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; sum += d[i] * d[i]; n++; }
  }
  return { pk: db(pk), rms: db(Math.sqrt(sum / n)) };
}

(async () => {
  const t0 = performance.now();
  await audio.ready;
  const lines: string[] = [];
  const problems: string[] = [];
  for (const n of SOUND_NAMES) {
    const list = audio.buffers(n);
    if (!list.length) { problems.push(`${n}: no buffer`); soundBtns.get(n)!.classList.add('missing'); continue; }
    const parts = list.map((b) => {
      const s = stats(b);
      if (b.duration < 0.02 || b.duration > 12) problems.push(`${n}: duration ${b.duration.toFixed(2)}s`);
      if (s.pk > -0.1) problems.push(`${n}: clipping (${s.pk.toFixed(1)} dB)`);
      if (s.pk < -30) problems.push(`${n}: nearly silent (${s.pk.toFixed(1)} dB)`);
      return `${b.duration.toFixed(2)}s pk ${s.pk.toFixed(1)}`;
    });
    lines.push(`${n.padEnd(11)} ${list.length}x  ${parts.join(' | ')}`);
  }
  lines.push(`\nall decoded in ${(performance.now() - t0).toFixed(0)} ms`);
  const music: Record<string, { pk: number; rms: number; ms: number }> = {};
  for (const m of ['menu', 'game', 'tense', 'catnip'] as const) {
    const t = performance.now();
    const b = await renderMusic(m, 8);
    const s = stats(b);
    music[m] = { ...s, ms: Math.round(performance.now() - t) };
    if (s.pk > -0.5) problems.push(`music ${m}: peak ${s.pk.toFixed(1)} dB before master compressor`);
    if (s.rms < -40) problems.push(`music ${m}: too quiet (${s.rms.toFixed(1)} dB rms)`);
    lines.push(`music ${m.padEnd(7)} 8 bars ${b.duration.toFixed(1)}s  peak ${s.pk.toFixed(1)} dB  rms ${s.rms.toFixed(1)} dB  render ${music[m].ms} ms`);
  }
  lines.push(problems.length ? `\nPROBLEMS:\n${problems.join('\n')}` : '\nOK: no problems');
  $('report').textContent = lines.join('\n');
  (window as unknown as { __audioReport: unknown }).__audioReport = { problems, music, sounds: SOUND_NAMES.length };
})();
