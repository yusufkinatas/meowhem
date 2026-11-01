/**
 * Synthesized lo-fi jazz. Everything is scheduled bar by bar into any BaseAudioContext, so the same code
 * plays live (AudioContext + timer) and renders offline (synth SFX jingles, preview checks).
 * Modes only move bus levels and the tape-wobble depth, so switching is always in time.
 */
export type MusicMode = 'off' | 'menu' | 'game' | 'tense' | 'catnip';

export const BPM = 82;
const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
const SWING = 0.62;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]): T => a[(Math.random() * a.length) | 0];
/** beat position (in beats, 8th grid swung) -> seconds */
const sw = (p: number) => {
  const b = Math.floor(p), f = p - b;
  return (b + (f < 0.5 ? (f / 0.5) * SWING : SWING + ((f - 0.5) / 0.5) * (1 - SWING))) * BEAT;
};

// Fmaj9 | Em9 | Dm9 | G13 | Cmaj9 | Am9 | Dm9 | C9  (rootless voicings around middle C)
const PROG = [
  { b: 41, v: [57, 60, 64, 67] },
  { b: 40, v: [55, 59, 62, 66] },
  { b: 38, v: [53, 57, 60, 64] },
  { b: 43, v: [53, 59, 64, 69] },
  { b: 36, v: [52, 55, 59, 62] },
  { b: 45, v: [55, 59, 60, 64] },
  { b: 38, v: [53, 57, 60, 64] },
  { b: 36, v: [52, 58, 62, 67] },
] as const;
const PENTA = [69, 72, 74, 76, 79, 81, 84, 86];
const COMP: readonly (readonly [number, number])[][] = [
  [[0, 1.5], [1.5, 2.4]],
  [[0, 3.6]],
  [[0, 1], [2.5, 1.4]],
  [[0.5, 1.2], [2, 1.9]],
  [[0, 0.9], [1.5, 0.9], [3, 0.9]],
];

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

function env(ctx: BaseAudioContext, dest: AudioNode, t: number, peak: number, attack: number, decay: number, end: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0, t + attack, decay);
  g.gain.setTargetAtTime(0, end, 0.06);
  g.connect(dest);
  return g;
}

function osc(ctx: BaseAudioContext, type: OscillatorType, f: number, dest: AudioNode, t: number, stop: number, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = detune;
  o.connect(dest);
  o.start(t);
  o.stop(stop);
  return o;
}

/** FM electric piano */
export function rhodes(ctx: BaseAudioContext, dest: AudioNode, t: number, m: number, v: number, dur: number) {
  const f = mtof(m), end = t + dur, stop = end + 0.5;
  const amp = env(ctx, dest, t, 0.13 * v, 0.006, 1.3, end);
  const car = osc(ctx, 'sine', f, amp, t, stop);
  const modG = ctx.createGain();
  modG.gain.setValueAtTime(f * 1.6 * v, t);
  modG.gain.exponentialRampToValueAtTime(f * 0.22, t + 0.45);
  modG.connect(car.frequency);
  osc(ctx, 'sine', f, modG, t, stop);
  const tine = env(ctx, dest, t, 0.025 * v, 0.002, 0.05, end);
  osc(ctx, 'sine', f * 7.1, tine, t, t + 0.4);
}

/** soft vibraphone / kalimba-ish bell */
export function vibes(ctx: BaseAudioContext, dest: AudioNode, t: number, m: number, v: number, dur = 1.2) {
  const f = mtof(m), stop = t + dur + 1.2;
  osc(ctx, 'sine', f, env(ctx, dest, t, 0.1 * v, 0.004, 0.9, t + dur), t, stop);
  osc(ctx, 'sine', f * 3.98, env(ctx, dest, t, 0.03 * v, 0.002, 0.12, t + dur), t, t + 0.6);
}

function bassNote(ctx: BaseAudioContext, dest: AudioNode, t: number, m: number, v: number, dur: number) {
  const f = mtof(m), end = t + dur, stop = end + 0.3;
  const amp = env(ctx, dest, t, 0.32 * v, 0.008, 0.5, end);
  osc(ctx, 'triangle', f, amp, t, stop);
  osc(ctx, 'sine', f, amp, t, stop);
}

function kick(ctx: BaseAudioContext, dest: AudioNode, t: number, v: number) {
  const amp = env(ctx, dest, t, 0.55 * v, 0.003, 0.11, t + 0.4);
  const o = osc(ctx, 'sine', 110, amp, t, t + 0.45);
  o.frequency.setValueAtTime(115, t);
  o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
}

function noiseHit(ctx: BaseAudioContext, dest: AudioNode, t: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  s.connect(f);
  f.connect(env(ctx, dest, t, peak, 0.002, decay, t + decay * 6));
  s.start(t, Math.random() * 0.5);
  s.stop(t + decay * 6 + 0.1);
}

const snare = (ctx: BaseAudioContext, d: AudioNode, t: number, v: number) => {
  noiseHit(ctx, d, t, 'bandpass', 1900, 0.8, 0.22 * v, 0.06);
  osc(ctx, 'triangle', 190, env(ctx, d, t, 0.12 * v, 0.002, 0.03, t + 0.15), t, t + 0.2);
};
const hat = (ctx: BaseAudioContext, d: AudioNode, t: number, v: number, open = false) =>
  noiseHit(ctx, d, t, 'highpass', 7500, 0.7, 0.07 * v, open ? 0.12 : 0.022);

/** a 4 s crackle + hiss loop, the "dusty record" bed */
function crackleBuffer(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate, b = ctx.createBuffer(1, sr * 4, sr), d = b.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < d.length; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.08; d[i] = lp * 0.05; }
  for (let k = 0; k < 90; k++) {
    const at = (Math.random() * (d.length - 400)) | 0, a = rnd(0.05, Math.random() < 0.1 ? 0.6 : 0.2), len = 20 + ((Math.random() * 60) | 0);
    for (let j = 0; j < len; j++) d[at + j] += a * (Math.random() * 2 - 1) * Math.exp(-j / (len / 4));
  }
  return b;
}

type Bus = 'keys' | 'bass' | 'drums' | 'mel' | 'tense' | 'crackle';
const LEVELS: Record<MusicMode, Record<Bus, number> & { wob: number; nip: number; wah: number }> = {
  off:    { keys: 0, bass: 0, drums: 0, mel: 0, tense: 0, crackle: 0, wob: 0.0012, nip: 0, wah: 0 },
  menu:   { keys: 0.9, bass: 0.7, drums: 0, mel: 0.9, tense: 0, crackle: 1, wob: 0.0012, nip: 0, wah: 0 },
  game:   { keys: 1, bass: 1, drums: 1, mel: 0.55, tense: 0, crackle: 0.8, wob: 0.0012, nip: 0, wah: 0 },
  tense:  { keys: 0.8, bass: 1, drums: 1, mel: 0.2, tense: 1, crackle: 0.5, wob: 0.0008, nip: 0, wah: 0 },
  catnip: { keys: 1, bass: 1, drums: 0.9, mel: 1, tense: 0, crackle: 0.8, wob: 0.0012, nip: 0.0075, wah: 9 },
};

export interface MusicEngine {
  /** output node; connect it where the music should go */
  readonly out: GainNode;
  setMode(mode: MusicMode, fade?: number): void;
  scheduleBar(index: number, t: number): void;
}

export function createMusicEngine(ctx: BaseAudioContext): MusicEngine {
  const out = ctx.createGain();
  // mix -> tape wobble (modulated delay) -> wah (peaking, flat unless catnip) -> dusty lowpass -> out
  const mix = ctx.createGain();
  const wobble = ctx.createDelay(0.1);
  wobble.delayTime.value = 0.03;
  const wah = ctx.createBiquadFilter();
  wah.type = 'peaking'; wah.frequency.value = 1100; wah.Q.value = 3; wah.gain.value = 0;
  const dust = ctx.createBiquadFilter();
  dust.type = 'lowpass'; dust.frequency.value = 6500; dust.Q.value = 0.5;
  mix.connect(wobble); wobble.connect(wah); wah.connect(dust); dust.connect(out);

  const lfo = (hz: number, target: AudioParam, depth: number) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = hz; g.gain.value = depth;
    o.connect(g); g.connect(target); o.start();
    return g;
  };
  const wobG = lfo(0.45, wobble.delayTime, LEVELS.off.wob);
  const nipG = lfo(0.8, wobble.delayTime, 0);
  const wahG = lfo(0.6, wah.frequency, 700);

  const buses = {} as Record<Bus, GainNode>;
  const level = {} as Record<Bus, number>;
  const mkBus = (name: Bus, filterHz?: number, pan = 0): AudioNode => {
    const g = ctx.createGain(); g.gain.value = 0; level[name] = 0;
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(mix); } else g.connect(name === 'crackle' ? out : mix);
    buses[name] = g;
    if (!filterHz) return g;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterHz; f.connect(g);
    return f;
  };
  const keys = mkBus('keys', 3000, -0.2), bass = mkBus('bass', 750), drums = mkBus('drums', 9000);
  const mel = mkBus('mel', 5000, 0.3), tense = mkBus('tense', 2600, 0.1), crackle = mkBus('crackle', 5000);

  const cr = ctx.createBufferSource();
  cr.buffer = crackleBuffer(ctx); cr.loop = true; cr.connect(crackle); cr.start();

  // melody: a 2-bar motif, repeated with small changes, renewed every 8 bars
  let motif: { p: number; d: number; s: number }[] = [];
  let melIdx = 3;
  const newMotif = () => {
    motif = [];
    const n = 3 + ((Math.random() * 3) | 0);
    const slots = [0, 0.5, 1, 1.5, 2.5, 3, 3.5, 4.5, 5, 5.5, 6.5, 7].sort(() => Math.random() - 0.5).slice(0, n).sort((a, b) => a - b);
    for (const p of slots) motif.push({ p, d: pick([0.5, 1, 1.5]), s: pick([-2, -1, 1, 1, 2]) });
  };

  return {
    out,
    setMode(mode, fade = 1.2) {
      const L = LEVELS[mode], now = ctx.currentTime, tc = Math.max(0.01, fade / 3);
      (Object.keys(buses) as Bus[]).forEach((b) => { level[b] = L[b]; buses[b].gain.setTargetAtTime(L[b], now, tc); });
      wobG.gain.setTargetAtTime(L.wob, now, tc);
      nipG.gain.setTargetAtTime(L.nip, now, tc);
      wah.gain.setTargetAtTime(L.wah, now, tc);
      wahG.gain.setTargetAtTime(L.wah ? 700 : 0, now, tc);
    },
    scheduleBar(i, t) {
      const c = PROG[i % 8], next = PROG[(i + 1) % 8];
      const j = () => rnd(-0.006, 0.006);
      if (level.keys > 0) {
        for (const [p, d] of pick(COMP)) {
          const v = rnd(0.75, 1);
          c.v.forEach((m, k) => rhodes(ctx, keys, t + sw(p) + k * 0.011 + j(), m, v * (k === 0 ? 0.85 : 1), d * BEAT));
        }
      }
      if (level.bass > 0) {
        bassNote(ctx, bass, t + j(), c.b, 1, BEAT * 1.4);
        if (Math.random() < 0.5) bassNote(ctx, bass, t + sw(1.5) + j(), c.b, 0.55, BEAT * 0.4);
        bassNote(ctx, bass, t + sw(2.5) + j(), c.b + pick([7, 7, 12]), 0.8, BEAT * 0.9);
        if (Math.random() < 0.45) bassNote(ctx, bass, t + sw(3.5) + j(), next.b + pick([-1, 1, 2]), 0.65, BEAT * 0.4);
      }
      if (level.drums > 0) {
        kick(ctx, drums, t, 1);
        kick(ctx, drums, t + sw(2.5), 0.85);
        if (Math.random() < 0.3) kick(ctx, drums, t + sw(1.75), 0.5);
        snare(ctx, drums, t + sw(1) + j(), 1);
        snare(ctx, drums, t + sw(3) + j(), 1);
        if (i % 8 === 7) for (const p of [3.5, 3.75]) snare(ctx, drums, t + sw(p), 0.4);
        for (let k = 0; k < 8; k++) {
          const open = k === 7 && Math.random() < 0.25;
          hat(ctx, drums, t + sw(k / 2) + j(), (k % 2 ? 0.6 : 1) * rnd(0.7, 1), open);
        }
      }
      if (level.mel > 0) {
        if (i % 8 === 0 || motif.length === 0) newMotif();
        if (i % 2 === 0 && (i % 8 !== 6 || Math.random() < 0.5)) {
          for (const n of motif) {
            if (Math.random() < 0.15) continue;
            melIdx = Math.max(0, Math.min(PENTA.length - 1, melIdx + n.s + (i % 8 === 4 ? 1 : 0)));
            vibes(ctx, mel, t + sw(n.p) + j(), PENTA[melIdx], rnd(0.6, 0.95), n.d * BEAT);
          }
        }
      }
      if (level.tense > 0) {
        for (let k = 0; k < 8; k++) {
          const tt = t + (k * BEAT) / 2, f = mtof(c.b + 12);
          const amp = env(ctx, tense, tt, k % 2 ? 0.07 : 0.1, 0.004, 0.06, tt + 0.16);
          osc(ctx, 'sawtooth', f, amp, tt, tt + 0.3);
          osc(ctx, 'sine', k % 2 ? 1700 : 2100, env(ctx, tense, tt, 0.035, 0.001, 0.008, tt + 0.03), tt, tt + 0.06);
        }
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + BAR * 0.8); g.gain.linearRampToValueAtTime(0, t + BAR + 0.1);
        g.connect(tense);
        for (const m of [c.v[2] + 12, c.v[3] + 12]) for (const dt of [-9, 9]) osc(ctx, 'sawtooth', mtof(m), g, t, t + BAR + 0.15, dt);
      }
    },
  };
}
