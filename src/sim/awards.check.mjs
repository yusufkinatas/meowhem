// Self-check for results building (receipt, awards, headlines). Run: node src/sim/awards.check.mjs
import assert from 'node:assert/strict';
const { buildResults, emptyStats } = await import('./awards.ts');

const stats = (o) => ({ ...emptyStats(), ...o });
const players = [
  { id: 'p0', name: 'Sam', role: 'sitter', bot: false, stats: stats({ tosses: 3, catsGrabbed: 4, undos: 2, cleaned: 30 }) },
  { id: 'a', name: 'Mochi', role: 'cat', bot: false, stats: stats({ scratchPostUses: 1, disasterPoints: 20, hairballs: 2, rugHairballs: 2, eyeContacts: 5 }) },
  { id: 'b', name: 'Gerald', role: 'cat', bot: true, stats: stats({ standoffs: 1, noodleTime: 75, meows: 400 }) },
];
const r = buildResults({
  winner: 'cat', meter: 100, timeLeft: 0, overtime: true, players,
  disasters: [
    { key: 'laptop', label: 'CARD CHARGED', points: 12, spot: 'laptop', t: 10 },
    { key: 'sofa', label: 'SOFA 1/3', points: 4, spot: 'sofa', t: 20 },
    { key: 'sofa', label: 'SOFA 2/3', points: 4, spot: 'sofa', t: 30 },
  ],
  mess: [
    { id: 1, kind: 'hairball', p: [0, 0, 0], yaw: 0, scale: 1, onRug: true, w: 3 },
    { id: 2, kind: 'hairball', p: [0, 0, 0], yaw: 0, scale: 1, onRug: false, w: 1.5 },
    { id: 3, kind: 'shards', p: [0, 0, 0], yaw: 0, scale: 1, onRug: false, w: 1.5 },
    { id: 4, kind: 'shards', p: [0, 0, 0], yaw: 0, scale: 1, onRug: false, w: 1.5 },
  ],
  fallen: { count: 7, points: 5.4 },
  penalties: [['litterFull', 4]],
});

assert.equal(r.headline, 'The owners have questions.');
assert.equal(r.sub, 'Mess hit 100% while they looked for their keys.');
assert.deepEqual(r.receipt.map((x) => `${x.label}|${x.value}`), [
  'Card charged|12', 'Sofa (2 of 3)|8', 'Shards ×2|3', 'Hairball ×1 (rug)|3', 'Hairball ×1|1.5',
  'Things on the floor ×7|5.5', 'Litter box, full|4', 'Scratching post|1 use', '---|', 'Total|100%',
]);
assert.deepEqual(r.disasters.map((d) => d.label), ['Card charged', 'Sofa (1 of 3)', 'Sofa (2 of 3)']);
// Good Cat always wins its slot, max 2 per player, the sitter is always in, max 6
const titles = r.awards.map((a) => a.title);
assert.equal(titles[0], 'Good Cat');
assert.ok(r.awards.some((a) => a.role === 'sitter'));
assert.ok(r.awards.length <= 6);
for (const id of ['p0', 'a', 'b']) assert.ok(r.awards.filter((a) => a.playerId === id).length <= 2);
assert.equal(r.awards.find((a) => a.title === 'Boneless')?.desc, 'Went limp for 1:15');

const s = buildResults({ winner: 'sitter', meter: 93, timeLeft: 0, overtime: true, players, disasters: [], mess: [], fallen: { count: 0, points: 0 }, penalties: [] });
assert.equal(s.headline, 'Technically a win.');
assert.equal(s.receipt.at(-3).value, '1 use');
console.log('awards ok:', titles.join(', '));
