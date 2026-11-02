import type { CatAccessory, CatLook, FurPattern } from '../shared/contracts';

export const COAT_PRESETS = [
  { name: 'Ginger', fur: '#f2a65a', sec: '#fff1dc' },
  { name: 'Charcoal', fur: '#55545c', sec: '#2f2e35' },
  { name: 'Snow', fur: '#f6f1ea', sec: '#e3d5c5' },
  { name: 'Cream', fur: '#efd3a0', sec: '#fff6e4' },
  { name: 'Blue', fur: '#8d9bb1', sec: '#d4dce8' },
  { name: 'Cocoa', fur: '#7d5843', sec: '#f0d8c2' },
  { name: 'Midnight', fur: '#2b2a33', sec: '#f4efe8' },
] as const;

export const PATTERNS: FurPattern[] = ['solid', 'tabby', 'tuxedo', 'calico', 'siamese', 'tortie'];
export const ACCESSORIES: CatAccessory[] = ['none', 'bell', 'bow', 'tinyHat', 'glasses', 'flowerCrown', 'cone'];
export const EYE_COLORS = ['#7cc36a', '#f2c14e', '#5aa9e6', '#e08a3c'];

export interface Profile { name: string; look: CatLook }

const KEY = 'meowhem.profile';

export function randomLook(name: string, rng: () => number = Math.random): CatLook {
  const c = COAT_PRESETS[Math.floor(rng() * COAT_PRESETS.length)];
  return {
    name,
    pattern: PATTERNS[Math.floor(rng() * PATTERNS.length)],
    furColor: c.fur,
    secondaryColor: c.sec,
    eyeColor: EYE_COLORS[Math.floor(rng() * EYE_COLORS.length)],
    accessory: rng() < 0.5 ? 'none' : ACCESSORIES[1 + Math.floor(rng() * (ACCESSORIES.length - 1))],
    chonk: Math.round(rng() * 10) / 10,
  };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Profile;
      if (p && typeof p.name === 'string' && p.look) return { name: p.name, look: { ...randomLook(p.name), ...p.look } };
    }
  } catch { /* private mode / blocked storage */ }
  return { name: '', look: randomLook('') };
}

export function saveProfile(p: Profile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

/** the local pause card is up: a solo host stops its sim (online games keep running) */
export const localUi = { paused: false };

/** live settings (mouse sensitivity, master volume), kept apart from the profile so the pause card can save them too */
const SKEY = 'meowhem.settings';
export const settings = { sens: 1, vol: 0.9 };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SKEY) ?? '{}')); } catch { /* blocked storage */ }
/** main.ts points `volume` at the audio master gain */
export const settingsHooks: { volume: ((v: number) => void) | null } = { volume: null };
export function setSetting(k: keyof typeof settings, v: number) {
  settings[k] = v;
  try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch { /* ignore */ }
  if (k === 'vol') settingsHooks.volume?.(v);
}
/** the two sliders, shared by the title screen and the pause card */
export const settingsHtml = () => `<div class="settings"><label>Mouse<input type="range" data-set="sens" min="0.3" max="2.5" step="0.05" value="${settings.sens}"></label><label>Volume<input type="range" data-set="vol" min="0" max="1" step="0.05" value="${settings.vol}"></label></div>`;
export function bindSettings(root: HTMLElement) {
  root.querySelectorAll<HTMLInputElement>('[data-set]').forEach((i) => i.addEventListener('input', () => setSetting(i.dataset.set as keyof typeof settings, Number(i.value))));
}
