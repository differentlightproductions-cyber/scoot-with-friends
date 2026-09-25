import test from 'node:test';
import assert from 'node:assert/strict';
import {CAREER, collectibles, collection, crateOdds, dailyFor, emptyProgress, levelFor, levelNeed, missionBoard, openCrate, record, validProgress} from '../src/data/progress';
import {ownsSelection, ownershipKey} from '../src/data/catalog';
import {inventoryItems} from '../src/data/inventory';
import {emptyWallet} from '../src/data/credit';

let n = 0;
const id = () => 'crate-' + (n++).toString().padStart(4, '0');

test('levels: each level asks more XP than the last', () => {
  assert.deepEqual(levelFor(0), {level: 1, into: 0, need: 600});
  assert.equal(levelFor(599).level, 1);
  assert.equal(levelFor(600).level, 2);
  assert.equal(levelFor(600 + levelNeed(2)).level, 3);
  assert.ok(levelNeed(10) > levelNeed(2));
});

test('missions: career stages pay Coins, XP and crates; dailies roll by date with a bonus for all three', () => {
  const p = emptyProgress(), day = '2026-09-24';
  let g = record(p, {tricks: 9}, id, day);
  assert.equal(g.completed.length, 0);
  g = record(p, {tricks: 1}, id, day);
  assert.equal(g.completed[0].title, 'Land 10 tricks I');
  assert.equal(p.career.landings, 1);
  assert.equal(g.credit >= 20, true);
  // A big jump settles several stages at once, each paid once.
  g = record(p, {tricks: 200}, id, day);
  assert.deepEqual(g.completed.filter(c => !c.title.startsWith('Daily')).map(c => c.title), ['Land 50 tricks II', 'Land 150 tricks III']);
  // Crates are rarer (#76): stage II pays none, stage III a Street Crate.
  assert.deepEqual(g.completed.filter(c => c.title.startsWith('Land')).map(c => c.reward.crate), [undefined, 'street']);
  // Bests only rise.
  record(p, {bestLine: 6}, id, day); record(p, {bestLine: 2}, id, day);
  assert.equal(p.stats.bestLine, 6);
  // Dailies: the same three for everyone on a date, a new set the next day.
  assert.deepEqual(p.daily.ids, dailyFor(day));
  assert.equal(new Set(dailyFor(day)).size, 3);
  assert.notDeepEqual(dailyFor('2026-09-25'), dailyFor(day));
  const q = emptyProgress();
  const board = missionBoard(q, day);
  const big: Record<string, number> = {tricks: 100, perfect: 100, grinds: 100, bestLine: 20, bestLinePoints: 1e6, whips: 100, flips: 100, spins: 100, bhillRuns: 10, points: 1e6};
  g = record(q, Object.fromEntries(board.daily.map(d => [require_stat(d.id), big[require_stat(d.id)]])), id, day);
  const tricksBefore = q.stats.tricks;
  assert.equal(q.daily.done.length, 3);
  assert.ok(q.daily.bonus && g.completed.some(c => c.title === 'All three dailies'));
  // Every level-up grants exactly one thing: Bucks (every fifth level), a crate or an item.
  assert.ok(g.levelsUp.length > 0 && g.crates.filter(c => c.source.startsWith('Level')).length + g.items.filter(i => i.source.startsWith('Level')).length + g.levelsUp.filter(l => l % 5 === 0).length === g.levelsUp.length);
  assert.equal(g.bucks, 5 * g.levelsUp.filter(l => l % 5 === 0).length);
  assert.ok(!g.completed.some(c => c.title === 'All three dailies' && c.reward.crate), 'the daily bonus no longer hands out a crate');
  // Next day: fresh dailies, lifetime stats kept.
  record(q, {tricks: 1}, id, '2026-09-25');
  assert.equal(q.daily.day, '2026-09-25'); assert.equal(q.daily.done.length, 0); assert.equal(q.stats.tricks, tricksBefore + 1);
});
function require_stat(dailyId: string) {
  return ({'d-tricks': 'tricks', 'd-perfect': 'perfect', 'd-grinds': 'grinds', 'd-line': 'bestLine', 'd-points': 'bestLinePoints', 'd-whips': 'whips', 'd-flips': 'flips', 'd-spins': 'spins', 'd-bhill': 'bhillRuns', 'd-banked': 'points'} as Record<string, string>)[dailyId];
}

test('crates: fixed by crate id, never a duplicate, Coins when the collection is complete', () => {
  const crate = {id: 'crate-abcdef', tier: 'street' as const, source: 'test'};
  const a = openCrate(crate, []), b = openCrate(crate, []);
  assert.deepEqual(a, b, 'reopening the same crate gives the same thing');
  assert.ok(a.item && a.credit > 0);
  const all = collectibles().map(ownershipKey);
  // Owning everything but one item: that one is what comes out.
  const last = all.at(-1)!;
  const one = openCrate({id: 'crate-zzzzzz', tier: 'street', source: 't'}, all.slice(0, -1));
  assert.equal(ownershipKey(one.item!), last);
  const none = openCrate({id: 'crate-yyyyyy', tier: 'legend', source: 't'}, all);
  assert.equal(none.item, null); assert.ok(none.credit >= 260);
  // Better crates skew rarer.
  const rarity = (tier: 'street' | 'legend') => { const counts: Record<string, number> = {}; for (let i = 0; i < 400; i++) { const r = openCrate({id: 'crate-' + tier + i, tier, source: ''}, []); counts[r.rarity] = (counts[r.rarity] ?? 0) + 1; } return counts; };
  const street = rarity('street'), legend = rarity('legend');
  assert.ok((street.common ?? 0) > 250 && !legend.common && (legend.epic ?? 0) + (legend.legendary ?? 0) > (street.epic ?? 0) + (street.legendary ?? 0) + 100);
  for (const tier of ['street', 'legend'] as const) assert.equal(Object.values(crateOdds(tier)).reduce((s, v) => s + v, 0), 100);
});
test('Mafioso (#76): legendary, only from a really lucky crate or for Bucks; never for Coins or on deal', async () => {
  const { PARTS } = await import('../src/data/scooterParts');
  const { priceOf } = await import('../src/data/catalog');
  const { dailyDeals } = await import('../src/data/deals');
  const mafioso = PARTS.filter(p => p.brandId === 'mafioso');
  assert.ok(mafioso.length >= 5 && mafioso.every(p => p.unlockType === 'bucks' && priceOf(p).currency === 'bucks'));
  const prices = mafioso.map(p => priceOf(p).amount);
  assert.ok(prices.every(n => n >= 1 && n <= 20), 'Bucks prices stay within 1-20: ' + prices);
  assert.ok(collectibles().filter(c => c.brand === 'Mafioso').every(c => c.rarity === 'legendary'));
  for (let day = 1; day <= 28; day++) for (const d of dailyDeals('techno_gravity', '2026-10-' + String(day).padStart(2, '0'))) assert.ok(!d.partId.startsWith('mafioso'), 'no Mafioso on deal');
  // A Legend Crate turns up Mafioso about once in 16; a Street Crate far less.
  const mafiosoRate = (tier: 'street' | 'legend') => { let n = 0; for (let i = 0; i < 2000; i++) if (openCrate({id: 'crate-m' + tier + i, tier, source: ''}, []).item?.brand === 'Mafioso') n++; return n / 2000; };
  const legendRate = mafiosoRate('legend'), streetRate = mafiosoRate('street');
  assert.ok(legendRate > 0.03 && legendRate < 0.1, 'legend ' + legendRate);
  assert.ok(streetRate < 0.01, 'street ' + streetRate);
  // Lazer parts cost more Coins than before.
  assert.equal(priceOf(PARTS.find(p => p.id === 'pro-deck')!).amount, 150);
});
test('Bucks (#76): 5 every fifth level, and once for levels an older save already reached', () => {
  const p = emptyProgress();
  let g = record(p, {}, id, '2026-09-24');
  assert.equal(g.bucks, 0);
  // An older save at level 12 that never had Bucks: 10 Bucks for levels 5 and 10, paid once.
  const old = validProgress({xp: 0, topLevel: 12});
  assert.equal(old.bucksLevel, 0);
  g = record(old, {}, id, '2026-09-24'); assert.equal(g.bucks, 10);
  g = record(old, {}, id, '2026-09-24'); assert.equal(g.bucks, 0, 'never twice');
  // Old unopened Pro and Signature crates become Street and Legend crates.
  const crates = validProgress({crates: [{id: 'crate-aaaaaa', tier: 'pro', source: 'x'}, {id: 'crate-bbbbbb', tier: 'signature', source: 'y'}]}).crates;
  assert.deepEqual(crates.map(c => c.tier), ['street', 'legend']);
});

test('crate exclusives: never sold, owned only once found, collection counts them', () => {
  const wallet = emptyWallet(), gold = {partId: 'pro-deck', variantId: 'x-gold-rush'};
  assert.equal(ownsSelection(wallet, gold), false, 'an exclusive colourway is never owned by default');
  assert.equal(ownsSelection(wallet, {partId: 'pro-deck', variantId: 'red'}), false, 'Lazer parts are not free outside the starter build');
  assert.ok(!inventoryItems(wallet, 'shop').some(i => i.exclusive), 'the shop never lists crate exclusives');
  wallet.owned.push(ownershipKey(gold));
  assert.ok(inventoryItems(wallet, 'owned').some(i => i.partId === 'pro-deck' && i.variantId === 'x-gold-rush' && i.rarity === 'legendary'));
  const c = collection(wallet.owned);
  assert.equal(c.have, 1); assert.equal(c.total, collectibles().length);
});

test('progress from a save is sanitised', () => {
  const p = validProgress({xp: -5, stats: {tricks: 12, bogus: 9, perfect: 'x'}, career: {landings: 99}, daily: {day: 'nope'}, crates: [{id: 'bad id!', tier: 'pro'}, {id: 'crate-good01', tier: 'legend', source: 'Level 10'}, {id: 'crate-good02', tier: 'mythic'}], visited: ['outdoor', 5]});
  assert.equal(p.xp, 0); assert.equal(p.stats.tricks, 12); assert.equal(p.stats.perfect, 0);
  assert.equal(p.career.landings, CAREER.find(c => c.id === 'landings')!.goals.length);
  assert.equal(p.daily.day, ''); assert.deepEqual(p.crates.map(c => c.id), ['crate-good01']); assert.deepEqual(p.visited, ['outdoor']);
});

test('daily deals: three different parts, the same all day, never an exclusive', async () => {
  const {dailyDeals} = await import('../src/data/deals');
  const a = dailyDeals('techno_gravity', '2026-09-24'), b = dailyDeals('techno_gravity', '2026-09-24');
  assert.deepEqual(a, b);
  assert.equal(a.length, 3); assert.equal(new Set(a.map(d => d.partId)).size, 3);
  assert.ok(a.every(d => d.price < d.was && !d.variantId.startsWith('x-')));
  assert.notDeepEqual(dailyDeals('techno_gravity', '2026-09-25'), a);
});

test('level rewards: one per level, Bucks every fifth level, silly items and snacks between, fixed per level', async () => {
  const { levelReward } = await import('../src/data/progress');
  const { NOVELTY_KINDS } = await import('../src/data/items');
  assert.deepEqual(levelReward(5), { kind: 'bucks', amount: 5 });
  assert.deepEqual(levelReward(10), { kind: 'bucks', amount: 5 });
  assert.deepEqual(levelReward(25), { kind: 'bucks', amount: 5 });
  assert.deepEqual(levelReward(7), levelReward(7), 'the same level always gives the same thing');
  const first100 = Array.from({ length: 100 }, (_, i) => levelReward(i + 2));
  const crates = first100.filter(r => r.kind === 'crate').length, novelties = first100.filter(r => r.kind === 'item' && (NOVELTY_KINDS as readonly string[]).includes(r.item)).length;
  assert.ok(crates >= 5 && crates <= 18, 'about one crate in ten levels (#76): ' + crates);
  assert.ok(novelties >= 25, 'plenty of silly items: ' + novelties);
});
