/** Results: headline (ADDENDUM 5.3), damage receipt (5.2), disasters, awards (5.4). */
import type { MessKind, Role, SpotId } from '../shared/contracts';
import type { Award, Mess, Results, Stats } from '../core/types';

export const emptyStats = (): Stats => ({
  knocked: 0, messCaused: 0, eyeContacts: 0, poops: 0, poopsOutside: 0, timeCaged: 0, fightsWon: 0,
  zoomDist: 0, tidied: 0, cleaned: 0, catsGrabbed: 0, catsJailed: 0, sprayHits: 0, hairballs: 0, rugHairballs: 0,
  loafTime: 0, disasterPoints: 0, meows: 0, timesGrabbed: 0, treatsEaten: 0, broken: 0,
  escapes: 0, noodleTime: 0, blockTime: 0, slowPushes: 0, scratchPostUses: 0, standoffs: 0, treatsIgnored: 0,
  doorsOpened: 0, doorsUsed: 0, carryTime: 0, tosses: 0, slips: 0, undos: 0,
});

export interface Disaster { key: string; label: string; points: number; spot: SpotId | null; t: number }

type Player = Results['players'][number];

export interface ResultsInput {
  winner: Role;
  meter: number;
  timeLeft: number;
  forfeit?: string;
  overtime: boolean;
  players: Player[];
  disasters: Disaster[];
  mess: Mess[];
  fallen: { count: number; points: number };
  penalties: [string, number][];
}

// ------------------------------------------------------------------ formatting
const R = Math.round;
const half = (v: number) => String(R(v * 2) / 2);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** "N s" under a minute, m:ss above */
export const fmtTime = (s: number) => (s >= 60 ? mmss(s) : `${R(s)} s`);
export const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${R(m)} m`);
const plural = (v: number, one: string, many = `${one}s`) => `${R(v)} ${R(v) === 1 ? one : many}`;

// ------------------------------------------------------------------ receipt (5.2)
const RECEIPT_LABEL: Partial<Record<SpotId, string>> = {
  laptop: 'Card charged', tubFaucet: 'Flood', tpRoll: 'The whole roll', sofa: 'Sofa', salmon: 'Dinner', fishTank: 'Fish tank', curtains: 'Curtains',
};
const MESS_LABEL: Record<MessKind, string> = {
  shards: 'Shards', poop: 'Poop', hairball: 'Hairball', soil: 'Soil', fur: 'Fur', puddle: 'Puddle', litter: 'Litter',
  tp: 'Toilet paper', fish: 'Fish', catnip: 'Catnip', food: 'Cereal',
};
const MESS_ORDER = Object.keys(MESS_LABEL) as MessKind[];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
export const disasterLabel = (d: Disaster) => (d.spot && RECEIPT_LABEL[d.spot]) || cap(d.label.replace(/\s+\d+\/\d+$/, ''));

export function buildReceipt(r: ResultsInput, scratch: number): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  // permanents in landing order, sofa stages summed into one line
  const lines: { label: string; pts: number; sofa?: number }[] = [];
  for (const d of r.disasters) {
    if (d.spot === 'sofa') {
      const s = lines.find((l) => l.sofa !== undefined);
      if (s) { s.sofa! += 1; s.pts += d.points; continue; }
      lines.push({ label: 'Sofa', pts: d.points, sofa: 1 });
      continue;
    }
    lines.push({ label: disasterLabel(d), pts: d.points });
  }
  for (const l of lines) out.push({ label: l.sofa !== undefined ? `Sofa (${l.sofa} of 3)` : l.label, value: half(l.pts) });
  // cleanable mess still present, grouped (rug hairballs on their own line)
  const groups = new Map<string, { name: string; rug: boolean; n: number; w: number }>();
  for (const m of [...r.mess].sort((a, b) => MESS_ORDER.indexOf(a.kind) - MESS_ORDER.indexOf(b.kind))) {
    const rug = m.kind === 'hairball' && m.onRug;
    const g = groups.get(m.kind + rug) ?? { name: MESS_LABEL[m.kind], rug, n: 0, w: 0 };
    g.n++; g.w += m.w;
    groups.set(m.kind + rug, g);
  }
  for (const g of groups.values()) out.push({ label: `${g.name} ×${g.n}${g.rug ? ' (rug)' : ''}`, value: half(g.w) });
  if (r.fallen.count) out.push({ label: `Things on the floor ×${r.fallen.count}`, value: half(r.fallen.points) });
  for (const [k, v] of r.penalties) out.push({ label: /litter/i.test(k) ? 'Litter box, full' : cap(k), value: half(v) });
  out.push({ label: 'Scratching post', value: scratch ? plural(scratch, 'use') : '0' });
  out.push({ label: '---', value: '' });
  out.push({ label: 'Total', value: `${R(r.meter)}%` });
  return out;
}

// ------------------------------------------------------------------ awards (5.4)
interface AwardDef {
  title: string;
  role: Role;
  min: number;
  value(s: Stats): number;
  line(v: number, s: Stats): string;
  /** score multiplier (filler awards 0.5, Good Cat infinite) */
  w?: number;
}

const AWARDS: AwardDef[] = [
  { title: 'Good Cat', role: 'cat', min: 1, w: Infinity, value: (s) => s.scratchPostUses,
    line: (v) => (R(v) === 1 ? 'Used the scratching post. Once.' : `Used the scratching post. ${R(v)} times.`) },
  { title: 'Insurance Claim', role: 'cat', min: 10, value: (s) => s.disasterPoints, line: (v) => `${R(v)} points of permanent damage` },
  { title: 'Eye Contact', role: 'cat', min: 2, value: (s) => s.eyeContacts, line: (v) => `${R(v)} things knocked off. Maintained eye contact.` },
  { title: 'Aim', role: 'cat', min: 1, value: (s) => s.rugHairballs, line: (v, s) => `${plural(s.hairballs, 'hairball')}. ${R(v)} on the rug.` },
  { title: 'Patience', role: 'cat', min: 2, value: (s) => s.slowPushes, line: (v) => `${R(v)} things pushed off, slowly` },
  { title: 'Liquid', role: 'cat', min: 2, value: (s) => s.escapes, line: (v) => `Escaped ${R(v)} times` },
  { title: 'Boneless', role: 'cat', min: 6, value: (s) => s.noodleTime, line: (v) => `Went limp for ${fmtTime(v)}` },
  { title: 'Load-Bearing', role: 'cat', min: 10, value: (s) => s.blockTime, line: (v) => `${fmtTime(v)} sitting on things that needed cleaning` },
  { title: 'Box Optional', role: 'cat', min: 1, value: (s) => s.poopsOutside, line: (v) => `${R(v)} outside the box` },
  { title: '3 A.M.', role: 'cat', min: 60, value: (s) => s.zoomDist, line: (v) => `${fmtDist(v)} at full speed` },
  { title: 'Standoff', role: 'cat', min: 1, value: (s) => s.standoffs,
    line: (v) => (R(v) === 1 ? '1 fight that never happened' : `${R(v)} fights that never happened`) },
  { title: 'Undisputed', role: 'cat', min: 2, value: (s) => s.fightsWon, line: (v) => `${R(v)} fights won` },
  { title: 'Unbribable', role: 'cat', min: 3, value: (s) => s.treatsIgnored, line: (v) => `Ignored ${R(v)} treat bags` },
  { title: 'Frequent Detainee', role: 'cat', min: 15, value: (s) => s.timeCaged, line: (v) => `${fmtTime(v)} in the carrier` },
  { title: 'Loaf', role: 'cat', min: 30, w: 0.5, value: (s) => s.loafTime, line: (v) => `${fmtTime(v)} as a loaf` },
  { title: 'Vocal Range', role: 'cat', min: 20, w: 0.5, value: (s) => s.meows, line: (v) => `${R(v)} meows` },
  { title: 'Wrangler', role: 'sitter', min: 3, value: (s) => s.catsGrabbed, line: (v) => `${R(v)} cats picked up` },
  { title: 'Underarm', role: 'sitter', min: 2, value: (s) => s.tosses, line: (v) => `Threw ${R(v)} cats. All landed on their feet.` },
  { title: 'Water Policy', role: 'sitter', min: 3, value: (s) => s.sprayHits, line: (v) => `${R(v)} direct hits` },
  { title: 'Time-Out', role: 'sitter', min: 2, value: (s) => s.catsJailed, line: (v) => `${R(v)} cats sent to the carrier` },
  { title: 'Damage Control', role: 'sitter', min: 2, value: (s) => s.undos, line: (v) => `${R(v)} disasters undone` },
  { title: 'Doorman', role: 'sitter', min: 2, value: (s) => s.doorsOpened - s.doorsUsed,
    line: (_v, s) => `Opened ${R(s.doorsOpened)} doors. ${R(s.doorsUsed)} were used.` },
  { title: 'Footwork', role: 'sitter', min: 1, value: (s) => s.slips, line: (v) => (R(v) === 1 ? 'Slipped once' : `Slipped ${R(v)} times`) },
  { title: 'Fur Coat', role: 'sitter', min: 20, value: (s) => s.carryTime, line: (v) => `Carried cats for ${fmtTime(v)}` },
  { title: 'Tidy Hands', role: 'sitter', min: 10, w: 0.5, value: (s) => s.cleaned + s.tidied, line: (v) => `${R(v)} things cleaned or put back` },
];

export function pickAwards(players: Player[]): Award[] {
  const cands: (Award & { score: number })[] = [];
  for (const a of AWARDS) {
    let best: Player | null = null, bestV = -Infinity;
    for (const p of players) {
      if (p.role !== a.role) continue;
      const v = a.value({ ...emptyStats(), ...p.stats });
      if (v > bestV) { bestV = v; best = p; } // ties: earlier roster entry stays
    }
    if (!best || bestV < a.min) continue;
    cands.push({ title: a.title, desc: a.line(bestV, { ...emptyStats(), ...best.stats }), playerId: best.id, name: best.name, role: best.role, score: (bestV / a.min) * (a.w ?? 1) });
  }
  cands.sort((x, y) => y.score - x.score);
  const picked: typeof cands = [];
  const count = new Map<string, number>();
  const take = (c: (typeof cands)[number]) => { picked.push(c); count.set(c.playerId, (count.get(c.playerId) ?? 0) + 1); };
  const sitterBest = cands.find((c) => c.role === 'sitter');
  if (sitterBest) take(sitterBest);
  for (const c of cands) {
    if (picked.length >= 6) break;
    if (picked.includes(c) || (count.get(c.playerId) ?? 0) >= 2) continue;
    take(c);
  }
  return picked.sort((x, y) => y.score - x.score).map(({ score: _s, ...a }) => a);
}

// ------------------------------------------------------------------ results
export function buildResults(r: ResultsInput): Results {
  const m = R(r.meter);
  let headline: string, sub: string;
  if (r.forfeit) {
    headline = r.winner === 'cat' ? 'The sitter has left the building.' : 'The cats wandered off.';
    sub = r.forfeit;
  } else if (r.winner === 'cat') {
    headline = 'The owners have questions.';
    sub = r.overtime ? 'Mess hit 100% while they looked for their keys.' : r.timeLeft >= 1 ? `Mess hit 100% with ${mmss(r.timeLeft)} left.` : 'Mess hit 100%.';
  } else {
    headline = m < 25 ? 'Spotless. Suspiciously spotless.' : m < 60 ? "Nothing a candle can't fix." : m < 90 ? "They'll notice. Eventually." : 'Technically a win.';
    sub = `The owners got home to ${m}% mess.`;
  }
  const scratch = r.players.reduce((a, p) => a + (p.stats.scratchPostUses ?? 0), 0);
  let sofa = 0;
  return {
    winner: r.winner, headline, sub, meter: m, players: r.players, overtime: r.overtime,
    awards: pickAwards(r.players),
    receipt: buildReceipt(r, scratch),
    disasters: r.disasters.map((d) => ({
      key: d.key, points: d.points, spot: d.spot,
      label: d.spot === 'sofa' ? `Sofa (${++sofa} of 3)` : disasterLabel(d),
    })),
  };
}
