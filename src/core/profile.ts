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
export const ACCESSORIES: CatAccessory[] = ['none', 'bell', 'bow', 'bandana', 'tinyHat', 'glasses', 'flowerCrown', 'cone'];
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
