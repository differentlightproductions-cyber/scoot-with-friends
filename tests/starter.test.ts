import test from 'node:test';
import assert from 'node:assert/strict';
import {CreditEconomy,owns} from '../src/data/credit';
import {loadProfile,PROFILE_KEY} from '../src/data/loadout';
import {defaultScooter,PARTS,STARTER_PICKS,validStarter,type ScooterLoadout} from '../src/data/scooterParts';
import {ownsBoard} from '../src/data/catalog';
import {emptyProgress,levelFor,missionBoard,record,STARTER,STARTER_REWARD,validProgress} from '../src/data/progress';

const store=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)}});
let n=0;const id=()=>'crate-test'+String(n++).padStart(4,'0');

test('a new rider owns no Lazer part and no longboard until the starter build', () => {
  store.clear();
  const p = loadProfile();
  assert.equal(p.wallet.starter, false);
  const lazer = PARTS.filter(x => x.brandId === 'lazer').flatMap(x => x.variants.filter(v => !v.exclusive).map(v => ({partId: x.id, variantId: v.id})));
  assert.ok(lazer.length > 40);
  assert.ok(lazer.every(s => !owns(p.wallet, s)), 'no Lazer colourway is free');
  assert.equal(ownsBoard(p.wallet, p.longboard), false, 'no free longboard');
  assert.equal(p.activeRideable, 'scooter');
});

test('the starter build: only the picked parts become owned, once, and it survives a reload', async () => {
  store.clear();
  const e = new CreditEconomy();
  const build = defaultScooter() as ScooterLoadout;
  build.deck = {partId: 'street-deck', variantId: 'blue'};
  build.bars = {partId: 'y-bars', variantId: 'black'};
  build.frontWheel = build.rearWheel = {partId: '120-wheels', variantId: 'white'};
  // Mafioso or crate exclusives are never starter picks; wheels must match.
  assert.equal(validStarter({...build, bars: {partId: 'mafioso-bars-y', variantId: 'mafioso_bars_y_black_gold'}}), null);
  assert.equal(validStarter({...build, deck: {partId: 'pro-deck', variantId: 'x-gold-rush'}}), null);
  assert.equal(validStarter({...build, rearWheel: {partId: '100-wheels', variantId: 'black'}}), null);
  assert.equal(await e.claimStarter({...build, deck: {partId: 'pro-deck', variantId: 'x-gold-rush'}}), 'Pick one Lazer part for every slot.');
  const [a, b] = await Promise.all([e.claimStarter(build), e.claimStarter(build)]);
  assert.equal(typeof a, 'object'); assert.equal(b, 'Your starter scooter is already built.', 'two tabs cannot both claim');
  const saved = loadProfile();
  assert.equal(saved.wallet.starter, true);
  assert.deepEqual(saved.scooter.deck, build.deck);
  assert.ok(owns(saved.wallet, build.deck) && owns(saved.wallet, build.bars) && owns(saved.wallet, build.frontWheel));
  assert.equal(owns(saved.wallet, {partId: 'pro-deck', variantId: 'red'}), false, 'an unpicked deck stays locked');
  assert.equal(owns(saved.wallet, {partId: '120-wheels', variantId: 'blue'}), false, 'another colourway stays locked');
  // One owned colourway per slot, plus the included hardware.
  assert.equal(saved.wallet.owned.length, STARTER_PICKS.length + 4);
  assert.equal(await new CreditEconomy().claimStarter(build), 'Your starter scooter is already built.', 'a reload cannot claim again');
});

test('a save from before keeps the Lazer build it was riding as its starter', () => {
  store.clear();
  const old = {version: 3, wallet: {credit: 50, remainder: 0, owned: [], receipts: [], testCredit: 0}, scooter: {...defaultScooter(), deck: {partId: 'light-deck', variantId: 'red'}}, settings: {}};
  store.set(PROFILE_KEY, JSON.stringify(old));
  const p = loadProfile();
  assert.equal(p.wallet.starter, true);
  assert.ok(owns(p.wallet, {partId: 'light-deck', variantId: 'red'}));
  assert.equal(owns(p.wallet, {partId: 'pro-deck', variantId: 'red'}), false);
  assert.equal(JSON.parse(store.get(PROFILE_KEY)!).wallet.starter, true, 'the migration is written back once');
});

test('starter missions pay once each; purposeful ones pay more; levels pay once ever', () => {
  const p = emptyProgress();
  const push = record(p, {}, id, '2026-09-24', ['push']);
  assert.deepEqual(push.completed.map(c => c.title), ['Push off']);
  assert.deepEqual(push.completed[0].reward, STARTER_REWARD.intro);
  assert.equal(record(p, {}, id, '2026-09-24', ['push']).completed.length, 0, 'the same first never pays twice');
  const flip = record(p, {}, id, '2026-09-24', ['trick:Backflip']);
  assert.ok(flip.completed[0].reward.xp > push.completed[0].reward.xp && flip.completed[0].reward.credit > push.completed[0].reward.credit);
  assert.equal(record(p, {}, id, '2026-09-24', ['not-a-mission']).completed.length, 0);
  assert.ok(STARTER.length >= 18 && new Set(STARTER.map(m => m.first)).size === STARTER.length);
  // Levels: an old save keeps the levels it was paid for on the old curve.
  const old = validProgress({xp: 5000});
  assert.ok(old.topLevel > levelFor(5000).level);
  const gains = record(old, {}, id, '2026-09-24', ['trick:Frontflip']);
  assert.equal(gains.levelsUp.length, 0, 'no level crate for a level already paid');
  // A fresh rider: an hour of starter missions is a few levels, not dozens.
  const fresh = emptyProgress();
  record(fresh, {}, id, '2026-09-24', STARTER.map(m => m.first));
  const level = levelFor(fresh.xp).level;
  assert.ok(level >= 2 && level <= 4, 'every starter mission done is level ' + level);
});

test('phone shop: an order is paid once, travels as a package and is delivered once', async () => {
  store.clear();
  const e = new CreditEconomy();
  await e.setTestCredit(0, true); await e.reward('bank:phone-1', 50000); // 200 Coins
  const bars = {partId: 'y-bars', variantId: 'blue'}, t0 = 1_000_000;
  const first = await e.order(bars, undefined, t0);
  assert.equal(typeof first, 'object');
  const after = loadProfile().wallet, paid = 200 - after.credit;
  assert.ok(paid > 0 && paid <= 110 && after.packages.length === 1, 'charged at list or deal price, package on its way');
  assert.equal(owns(after, bars), false, 'not owned until delivered');
  assert.equal(await e.order(bars, undefined, t0), 'Already on its way');
  assert.match(await e.buy(bars), /on its way/, 'the counter cannot sell it twice either');
  assert.equal(await e.order({partId: 'pro-deck', variantId: 'x-gold-rush'}), 'Product unavailable', 'crate exclusives are never sold');
  assert.equal(await e.deliver(t0 + 10_000), 'none', 'not before it arrives');
  const arrived = await e.deliver(t0 + 46_000);
  assert.ok(Array.isArray(arrived) && arrived.length === 1);
  const w = loadProfile().wallet;
  assert.ok(owns(w, bars) && w.packages.length === 0);
  assert.equal(await e.deliver(t0 + 99_000), 'none', 'delivered once');
  assert.equal(loadProfile().progress.stats.purchases, 1, 'an order counts as a purchase');
});

test('simple trick missions take 5 landings, skill ones 3, big ones 1; progress survives a reload', () => {
  const p = emptyProgress();
  for (let i = 0; i < 4; i++) assert.equal(record(p, {}, id, '2026-09-24', ['trick:Tailwhip']).completed.length, 0, 'tailwhip ' + (i + 1) + ' of 5 pays nothing yet');
  const board = missionBoard(p, '2026-09-24').starter.find(m => m.id === 's-tailwhip')!;
  assert.equal(board.value, 4); assert.equal(board.goal, 5);
  const reloaded = validProgress(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(record(reloaded, {}, id, '2026-09-24', ['trick:Tailwhip']).completed.map(c => c.title), ['Land 5 Tailwhips']);
  assert.equal(record(reloaded, {}, id, '2026-09-24', ['trick:Tailwhip']).completed.length, 0, 'never twice');
  // Two in one flush count as two.
  assert.equal(record(p, {}, id, '2026-09-24', ['spin:360', 'spin:360', 'spin:360']).completed.length, 1);
  assert.equal(record(p, {}, id, '2026-09-24', ['trick:Backflip']).completed.length, 1, 'a big trick is still one landing');
  for (const m of STARTER.filter(m => m.tier === 'basic' && ['TRICKS', 'RAMPS', 'GRINDS'].includes(m.group))) assert.ok((m.count ?? 1) >= 5, m.id + ' asks for at least 5');
  assert.equal(validProgress({ counts: { 'trick:Tailwhip': 99, 'push': 3, 'nope': 2 } }).counts['trick:Tailwhip'], 4, 'counts are clamped and only kept for counted steps');
  assert.deepEqual(Object.keys(validProgress({ counts: { 'push': 3, 'nope': 2 } }).counts), []);
});

test('a level-up item lands in the pockets in the same save; full pockets pay Coins instead', async () => {
  const { levelReward, levelNeed } = await import('../src/data/progress');
  const { saveProfile } = await import('../src/data/loadout');
  // The first level from 2 up that gives an item rather than a crate.
  let level = 2; while (levelReward(level).kind !== 'item') level++;
  const reward = levelReward(level) as { kind: 'item'; item: string };
  const setUp = (fill: number) => {
    store.clear();
    const p = loadProfile();
    let xp = 0; for (let l = 1; l < level; l++) xp += levelNeed(l);
    p.progress.xp = xp - 1; p.progress.topLevel = level - 1;
    for (let i = 0; i < fill; i++) p.pockets.entries.push({ id: 'item-' + (i + 1), kind: 'Water', state: 'sealed' });
    p.pockets.nextId = fill + 1;
    saveProfile(p);
    return p.wallet.credit;
  };
  setUp(0);
  const gains = await new CreditEconomy().track({ points: 400 });
  assert.ok(typeof gains !== 'string' && gains.levelsUp.includes(level));
  assert.ok(loadProfile().pockets.entries.some(i => i.kind === reward.item), reward.item + ' is in the pockets after a reload');
  const before = setUp(48);
  await new CreditEconomy().track({ points: 400 });
  assert.equal(loadProfile().pockets.entries.length, 48);
  assert.ok(loadProfile().wallet.credit >= before + 15, 'full pockets: Coins instead');
});
