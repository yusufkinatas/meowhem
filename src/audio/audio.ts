import type { AudioApi, SoundName, Vec3 } from '../shared/contracts';
import { BAR, createMusicEngine, rhodes, vibes, type MusicEngine, type MusicMode } from './music';

/**
 * Recorded CC0 sounds (public/sounds, see SOURCES.md) + a few synthesized jingles + synthesized music.
 * Files are fetched and decoded right away on an OfflineAudioContext (no user gesture needed),
 * the live AudioContext is only created in unlock().
 */

// f: file variants, v: volume, j: random pitch jitter in semitones, r: base rate, T: seamless loop length (loop files)
interface Def { f?: string[]; v: number; j: number; r?: number; T?: number; max?: number }
const DEFS: Record<SoundName, Def> = {
  meow: { f: ['meow1', 'meow2', 'meow3', 'meow4', 'meow5'], v: 0.9, j: 1 },
  meowShort: { f: ['meowShort1', 'meowShort2', 'meowShort3'], v: 0.85, j: 1 },
  meowLong: { f: ['meowLong1', 'meowLong2'], v: 0.9, j: 0.8 },
  chirp: { f: ['chirp1'], v: 0.9, j: 1.5, r: 1.08 },
  mrrp: { f: ['mrrp1'], v: 1, j: 1.2 },
  hiss: { f: ['hiss1', 'hiss2'], v: 0.75, j: 1 },
  purr: { f: ['purr'], v: 0.55, j: 0.4, T: 6 },
  yowl: { f: ['yowl1', 'yowl2', 'yowl3'], v: 0.8, j: 0.8 },
  shatter: { f: ['shatter1', 'shatter2', 'shatter3'], v: 0.85, j: 1.5 },
  thud: { f: ['thud1', 'thud2', 'thud3'], v: 0.75, j: 2, max: 6 },
  clink: { f: ['clink1', 'clink2', 'clink3'], v: 0.6, j: 2, max: 6 },
  plop: { f: ['plop1'], v: 0.8, j: 2 },
  spray: { f: ['spray1', 'spray2', 'spray3'], v: 0.6, j: 1 },
  doorbell: { f: ['doorbell'], v: 0.85, j: 0 },
  typing: { f: ['typing'], v: 0.5, j: 0.5, T: 6 },
  scratch: { f: ['scratch'], v: 0.6, j: 1, T: 3 },
  splash: { f: ['splash1', 'splash2'], v: 0.7, j: 1.5 },
  waterRun: { f: ['waterRun'], v: 0.45, j: 0.3, T: 6 },
  flush: { f: ['flush'], v: 0.75, j: 0.5 },
  pickup: { f: ['pickup1'], v: 0.6, j: 2 },
  drop: { f: ['drop1'], v: 0.6, j: 2 },
  whoosh: { f: ['whoosh1'], v: 0.5, j: 2 },
  fight: { f: ['fight1'], v: 0.8, j: 0.6 },
  ding: { f: ['ding'], v: 0.45, j: 0 },
  buzz: { f: ['buzz'], v: 0.4, j: 0.3 },
  breaker: { f: ['breaker'], v: 0.85, j: 0.5 },
  tvOn: { f: ['tvOn'], v: 0.55, j: 0.3 },
  treatShake: { f: ['treatShake'], v: 1, j: 0.5 },
  crunch: { f: ['crunch1'], v: 0.65, j: 1.5 },
  hairball: { f: ['hairball1'], v: 0.85, j: 1 },
  cageClose: { f: ['cageClose'], v: 0.75, j: 1 },
  cageOpen: { f: ['cageOpen'], v: 0.75, j: 1 },
  paperRip: { f: ['paperRip1', 'paperRip2'], v: 0.75, j: 1.5 },
  dig: { f: ['dig1', 'dig2', 'dig3'], v: 0.55, j: 2 },
  step: { f: ['step1', 'step2', 'step3', 'step4'], v: 0.3, j: 2, max: 8 },
  land: { f: ['land1', 'land2'], v: 0.45, j: 2 },
  uiClick: { f: ['uiClick'], v: 0.45, j: 0.5 },
  uiHover: { f: ['uiHover'], v: 0.22, j: 0.5 },
  countdown: { v: 0.6, j: 0 },
  go: { v: 0.6, j: 0 },
  win: { v: 0.7, j: 0 },
  lose: { v: 0.7, j: 0 },
  carArrive: { f: ['carArrive'], v: 0.85, j: 0 },
  alarm: { v: 0.4, j: 0 },
  pop: { f: ['pop1'], v: 0.55, j: 3 },
  gulp: { f: ['gulp1'], v: 0.65, j: 1 },
  chatter: { f: ['chatter1'], v: 0.8, j: 1 },
  door: { f: ['door1', 'door2'], v: 0.75, j: 1 },
};

export const SOUND_NAMES = Object.keys(DEFS) as SoundName[];
const LOOP_PAD = 0.1; // loop files carry 0.1 s of wrap padding on both ends (see SOURCES.md)
const SR = 44100;

// ---------------------------------------------------------------- synthesized one-shots
type Synth = (c: OfflineAudioContext, out: AudioNode) => void;
const SYNTH: Partial<Record<SoundName, [number, Synth]>> = {
  countdown: [0.6, (c, o) => vibes(c, o, 0, 76, 1, 0.3)],
  go: [1.2, (c, o) => { [72, 76, 79, 84].forEach((m, i) => vibes(c, o, i * 0.05, m, 1, 0.6)); rhodes(c, o, 0, 60, 0.8, 0.8); rhodes(c, o, 0, 64, 0.8, 0.8); }],
  win: [2.6, (c, o) => {
    [65, 69, 72, 76, 79, 84].forEach((m, i) => vibes(c, o, i * 0.09, m, 0.9, 0.9));
    [53, 57, 60, 64, 67].forEach((m, i) => rhodes(c, o, 0.55 + i * 0.015, m, 0.9, 1.6));
  }],
  lose: [2.8, (c, o) => {
    // sad trombone: four sagging notes through a closing lowpass, last one wobbles
    [[67, 0, 0.42], [66, 0.48, 0.42], [65, 0.96, 0.42], [64, 1.44, 1.2]].forEach(([m, t, d]) => {
      const f = 440 * Math.pow(2, (m - 69) / 12) / 2;
      const s = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
      s.type = 'sawtooth'; s.frequency.setValueAtTime(f * 1.02, t); s.frequency.linearRampToValueAtTime(f, t + 0.08);
      if (d > 1) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.5; lg.gain.value = 18; l.connect(lg); lg.connect(s.detune); l.start(t); l.stop(t + d + 0.2); }
      lp.type = 'lowpass'; lp.Q.value = 4; lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(1400, t + 0.12); lp.frequency.linearRampToValueAtTime(500, t + d);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.04); g.gain.setValueAtTime(0.22, t + d - 0.1); g.gain.linearRampToValueAtTime(0, t + d);
      s.connect(lp); lp.connect(g); g.connect(o); s.start(t); s.stop(t + d + 0.05);
    });
  }],
  alarm: [1.2, (c, o) => {
    for (const t of [0, 0.16, 0.6, 0.76]) {
      const s = c.createOscillator(), g = c.createGain();
      s.type = 'square'; s.frequency.value = 1320;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.005); g.gain.setValueAtTime(0.12, t + 0.1); g.gain.linearRampToValueAtTime(0, t + 0.11);
      const lp = c.createBiquadFilter(); lp.frequency.value = 3500;
      s.connect(lp); lp.connect(g); g.connect(o); s.start(t); s.stop(t + 0.12);
    }
  }],
};

async function renderSynth(dur: number, fn: Synth): Promise<AudioBuffer> {
  const c = new OfflineAudioContext(1, Math.ceil(SR * dur), SR);
  fn(c, c.destination);
  return c.startRendering();
}

// ---------------------------------------------------------------- api
export interface MeowAudio extends AudioApi {
  /** resolves when every file is decoded and every synth sound rendered */
  readonly ready: Promise<void>;
  /** decoded buffers per sound (variants), for tooling / preview checks */
  buffers(name: SoundName): AudioBuffer[];
  readonly context: AudioContext | null;
}

interface LoopState { name: SoundName; on: boolean; pos?: Vec3; vol: number; src?: AudioBufferSourceNode; gain?: GainNode; pan?: PannerNode }

export function createAudio(): MeowAudio {
  const bufs = new Map<SoundName, AudioBuffer[]>();
  const decoder = new OfflineAudioContext(1, 1, SR);
  const base = `${import.meta.env.BASE_URL}sounds/`;

  const fileLoads = (Object.keys(DEFS) as SoundName[]).flatMap((name) => (DEFS[name].f ?? []).map(async (f) => {
    try {
      const res = await fetch(`${base}${f}.mp3`);
      if (!res.ok) throw new Error(`${res.status}`);
      const b = await decoder.decodeAudioData(await res.arrayBuffer());
      bufs.set(name, [...(bufs.get(name) ?? []), b]);
    } catch (e) {
      console.warn(`[audio] could not load ${f}.mp3`, e);
    }
  }));
  const synthLoads = (Object.entries(SYNTH) as [SoundName, [number, Synth]][]).map(async ([name, [dur, fn]]) => {
    bufs.set(name, [await renderSynth(dur, fn)]);
  });
  const ready = Promise.all([...fileLoads, ...synthLoads]).then(() => { refreshLoops(); });

  let ctx: AudioContext | null = null;
  let master: GainNode, sfx: GainNode, musicGain: GainNode;
  let music: MusicEngine | null = null;
  let masterVol = 0.9;
  let musicMode: MusicMode = 'off';
  let listener: [Vec3, number] = [[0, 0, 0], 0];
  let nextBar = 0, nextBarTime = 0, timer = 0;
  const active = new Map<SoundName, number>();
  const lastPlay = new Map<SoundName, number>();
  const loops = new Map<string, LoopState>();

  function makePanner(pos: Vec3): PannerNode {
    const p = ctx!.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 2;
    p.rolloffFactor = 1.1;
    p.maxDistance = 50;
    setPos(p, pos);
    return p;
  }
  function setPos(p: PannerNode, [x, y, z]: Vec3) {
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
  }
  function applyListener() {
    if (!ctx) return;
    const [[x, y, z], yaw] = listener, l = ctx.listener, fx = Math.sin(yaw), fz = Math.cos(yaw);
    if (l.positionX) {
      l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z;
      l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(x, y, z);
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  /** src -> gain -> (panner) -> sfx bus */
  function voice(name: SoundName, buf: AudioBuffer, vol: number, pos: Vec3 | undefined, rate: number, loop: boolean) {
    const c = ctx!;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = c.createGain();
    gain.gain.value = vol;
    src.connect(gain);
    let pan: PannerNode | undefined;
    if (pos) { pan = makePanner(pos); gain.connect(pan); pan.connect(sfx); } else gain.connect(sfx);
    const T = DEFS[name].T;
    if (loop) {
      src.loop = true;
      if (T) { src.loopStart = LOOP_PAD; src.loopEnd = LOOP_PAD + T; }
    }
    return { src, gain, pan };
  }

  function startLoop(id: string, s: LoopState) {
    const b = bufs.get(s.name)?.[0];
    if (!ctx || !b || s.src) return;
    const v = voice(s.name, b, 0, s.pos, DEFS[s.name].r ?? 1, true);
    v.gain.gain.setTargetAtTime(s.vol * DEFS[s.name].v, ctx.currentTime, 0.05);
    v.src.start(ctx.currentTime, DEFS[s.name].T ? LOOP_PAD + Math.random() * DEFS[s.name].T! : 0);
    Object.assign(s, v);
    loops.set(id, s);
  }
  function stopLoop(id: string, s: LoopState) {
    loops.delete(id);
    if (!ctx || !s.src || !s.gain) return;
    s.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    s.src.stop(ctx.currentTime + 0.5);
  }
  function refreshLoops() { for (const [id, s] of loops) if (s.on) startLoop(id, s); }

  function tickMusic() {
    if (!ctx || !music) return;
    if (nextBarTime < ctx.currentTime) nextBarTime = ctx.currentTime + 0.05; // fell behind (background tab)
    while (nextBarTime < ctx.currentTime + 0.35) { music.scheduleBar(nextBar++, nextBarTime); nextBarTime += BAR; }
  }

  function applyMusic() {
    if (!ctx) return;
    if (musicMode !== 'off' && !music) {
      music = createMusicEngine(ctx);
      music.out.connect(musicGain);
    }
    if (!music) return;
    music.setMode(musicMode, 1.5);
    if (musicMode !== 'off' && !timer) { nextBarTime = ctx.currentTime + 0.1; tickMusic(); timer = window.setInterval(tickMusic, 60); }
    if (musicMode === 'off' && timer) { clearInterval(timer); timer = 0; }
  }

  const api: MeowAudio = {
    ready,
    get context() { return ctx; },
    buffers: (name) => bufs.get(name) ?? [],

    unlock() {
      if (!ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AC({ latencyHint: 'interactive' });
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 12; comp.attack.value = 0.003; comp.release.value = 0.2;
        master = ctx.createGain(); master.gain.value = masterVol;
        sfx = ctx.createGain(); musicGain = ctx.createGain(); musicGain.gain.value = 0.42;
        sfx.connect(master); musicGain.connect(master); master.connect(comp); comp.connect(ctx.destination);
        applyListener();
        applyMusic();
        refreshLoops();
      }
      if (ctx.state !== 'running') void ctx.resume();
    },

    play(name, opts) {
      if (!ctx) return;
      if (ctx.state === 'suspended') void ctx.resume();
      const list = bufs.get(name), d = DEFS[name];
      if (!list?.length) return;
      const now = ctx.currentTime;
      if (now - (lastPlay.get(name) ?? -1) < 0.03) return; // ten props landing in one frame = one sound
      if ((active.get(name) ?? 0) >= (d.max ?? 4)) return;
      lastPlay.set(name, now);
      const buf = list[(Math.random() * list.length) | 0];
      const rate = (d.r ?? 1) * (opts?.pitch ?? 1) * Math.pow(2, ((Math.random() * 2 - 1) * d.j) / 12);
      const vol = d.v * (opts?.volume ?? 1) * (0.88 + Math.random() * 0.12);
      const v = voice(name, buf, vol, opts?.pos, rate, false);
      active.set(name, (active.get(name) ?? 0) + 1);
      v.src.onended = () => { active.set(name, (active.get(name) ?? 1) - 1); v.src.disconnect(); v.pan?.disconnect(); };
      v.src.start(now);
    },

    loop(id, name, on, opts) {
      const s = loops.get(id);
      if (!on) { if (s) stopLoop(id, s); return; }
      const vol = opts?.volume ?? 1;
      if (s && s.name === name) {
        s.vol = vol;
        if (opts?.pos) { s.pos = opts.pos; if (s.pan) setPos(s.pan, opts.pos); }
        if (ctx && s.gain) s.gain.gain.setTargetAtTime(vol * DEFS[name].v, ctx.currentTime, 0.05);
        if (!s.src) startLoop(id, s);
        return;
      }
      if (s) stopLoop(id, s);
      const n: LoopState = { name, on: true, pos: opts?.pos, vol };
      loops.set(id, n);
      startLoop(id, n);
    },

    setListener(pos, yaw) {
      listener = [pos, yaw];
      applyListener();
    },

    setMusic(mode) {
      if (mode === musicMode) return;
      musicMode = mode;
      applyMusic();
    },

    setMasterVolume(v) {
      masterVol = Math.max(0, Math.min(1, v));
      if (ctx) master.gain.setTargetAtTime(masterVol, ctx.currentTime, 0.05);
    },
  };

  // Belt and braces for autoplay policy: the first gesture anywhere unlocks, even if the caller forgot.
  const auto = () => { api.unlock(); removeEventListener('pointerdown', auto, true); removeEventListener('keydown', auto, true); };
  addEventListener('pointerdown', auto, true);
  addEventListener('keydown', auto, true);

  return api;
}

/** Render `bars` of a music mode offline (preview / level checks), mono. */
export async function renderMusic(mode: MusicMode, bars: number, sampleRate = 32000): Promise<AudioBuffer> {
  const c = new OfflineAudioContext(1, Math.ceil(sampleRate * (bars * BAR + 1)), sampleRate);
  const m = createMusicEngine(c);
  const g = c.createGain(); g.gain.value = 0.42;
  m.out.connect(g); g.connect(c.destination);
  m.setMode(mode, 0.03);
  for (let i = 0; i < bars; i++) m.scheduleBar(i, 0.05 + i * BAR);
  return c.startRendering();
}
