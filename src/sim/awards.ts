import type { Role } from '../shared/contracts';
import type { Award, Results, Stats } from '../core/types';

export const emptyStats = (): Stats => ({
  knocked: 0, messCaused: 0, eyeContacts: 0, poops: 0, poopsOutside: 0, timeCaged: 0, fightsWon: 0,
  zoomDist: 0, tidied: 0, cleaned: 0, catsGrabbed: 0, catsJailed: 0, sprayHits: 0, hairballs: 0, rugHairballs: 0,
  loafTime: 0, disasterPoints: 0, meows: 0, timesGrabbed: 0, treatsEaten: 0, broken: 0,
  escapes: 0, noodleTime: 0, blockTime: 0, slowPushes: 0, scratchPostUses: 0, standoffs: 0, treatsIgnored: 0,
  doorsOpened: 0, doorsUsed: 0, carryTime: 0, tosses: 0, slips: 0, undos: 0,
});

const n = (v: number, one: string, many = one + 's') => `${Math.round(v)} ${Math.round(v) === 1 ? one : many}`;

const AWARDS: { title: string; role: Role; value: (s: Stats) => number; desc: (v: number) => string; min?: number }[] = [
  { title: 'Gravity Researcher', role: 'cat', value: (s) => s.knocked, desc: (v) => `${n(v, 'thing')} tested against the floor` },
  { title: 'Insurance Claim', role: 'cat', value: (s) => s.disasterPoints, desc: (v) => `${Math.round(v)} points of permanent damage` },
  { title: 'Held Eye Contact', role: 'cat', value: (s) => s.eyeContacts, desc: (v) => `${n(v, 'thing')} knocked off while being watched` },
  { title: 'Rug Sniper', role: 'cat', value: (s) => s.rugHairballs, desc: (v) => `${n(v, 'hairball')} on the rug` },
  { title: 'Box Critic', role: 'cat', value: (s) => s.poopsOutside, desc: (v) => `${n(v, 'review')} left outside the box` },
  { title: 'Undisputed', role: 'cat', value: (s) => s.fightsWon, desc: (v) => `${n(v, 'hiss fight')} won` },
  { title: 'Professional Loaf', role: 'cat', value: (s) => s.loafTime, desc: (v) => `${Math.round(v)} s spent as a loaf`, min: 8 },
  { title: 'Zoomie Mileage', role: 'cat', value: (s) => s.zoomDist, desc: (v) => `${Math.round(v)} m at full speed`, min: 25 },
  { title: 'Frequent Detainee', role: 'cat', value: (s) => s.timeCaged, desc: (v) => `${Math.round(v)} s in the carrier`, min: 3 },
  { title: 'Will Work for Treats', role: 'cat', value: (s) => s.treatsEaten, desc: (v) => `${n(v, 'treat')} accepted` },
  { title: 'Regular', role: 'cat', value: (s) => s.poops, desc: (v) => `${n(v, 'visit')} to the litter box` },
  { title: 'Vocal Range', role: 'cat', value: (s) => s.meows, desc: (v) => `${n(v, 'meow')}`, min: 12 },
  { title: 'Scruff Specialist', role: 'sitter', value: (s) => s.catsGrabbed, desc: (v) => `${n(v, 'cat')} picked up` },
  { title: 'Tidy Hands', role: 'sitter', value: (s) => s.cleaned + s.tidied, desc: (v) => `${n(v, 'thing')} cleaned or put back` },
  { title: 'Water Policy', role: 'sitter', value: (s) => s.sprayHits, desc: (v) => `${n(v, 'direct hit')}` },
  { title: 'Time-Out Enforcer', role: 'sitter', value: (s) => s.catsJailed, desc: (v) => `${n(v, 'cat')} sent to the carrier` },
];

export function buildResults(
  winner: Role, meter: number, timeLeft: number, players: Results['players'], forfeit?: string,
): Results {
  const awards: Award[] = [];
  const count = new Map<string, number>();
  for (const a of AWARDS) {
    let best: Results['players'][number] | null = null;
    let bestV = 0;
    for (const p of players) {
      if (p.role !== a.role) continue;
      const v = a.value(p.stats);
      if (v > bestV) { bestV = v; best = p; }
    }
    if (!best || bestV < (a.min ?? 1) || (count.get(best.id) ?? 0) >= 2) continue;
    count.set(best.id, (count.get(best.id) ?? 0) + 1);
    awards.push({ title: a.title, desc: a.desc(bestV), playerId: best.id, name: best.name, role: best.role });
    if (awards.length >= 6) break;
  }
  const m = Math.round(meter);
  const mmss = `${Math.floor(timeLeft / 60)}:${String(Math.floor(timeLeft % 60)).padStart(2, '0')}`;
  let headline: string, sub: string;
  if (forfeit) {
    headline = winner === 'cat' ? 'The sitter has left the building.' : 'The cats wandered off.';
    sub = forfeit;
  } else if (winner === 'cat') {
    headline = 'The owners have questions.';
    sub = timeLeft > 1 ? `Mess hit 100% with ${mmss} still on the clock.` : 'Mess hit 100%.';
  } else {
    headline = m < 25 ? 'Spotless. Suspiciously spotless.' : m < 60 ? "Nothing a candle can't fix." : "They'll notice. Eventually.";
    sub = `The owners got home to ${m}% mess.`;
  }
  return { winner, headline, sub, meter: m, awards, players };
}
