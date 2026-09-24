// Water tricks at the Veterans dive dock: rack the ride, walk the gangway and
// the tower stairs, flip off the tower and the springboard, cannonball off the
// deck, climb back out on a ladder, and the deck is solid to a swimmer.
//
//   LAZER_URL=http://127.0.0.1:5174 CHROME_PATH=... OUT=artifacts/water node tests/water-tricks.browser.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.env.LAZER_URL || 'http://127.0.0.1:5174';
const out = process.env.OUT || 'artifacts/water-tricks';
mkdirSync(out, { recursive: true });
const results = [];
const check = (label, ok, detail) => { results.push({ label, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail ?? '')}`); };

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER, null, { timeout: 900000 });
  await page.evaluate(async () => {
    const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true);
    const s = g.sim, { terrainHeight } = await import('/src/park/park.ts'), { DIVE_DOCK } = await import('/src/park/dive-dock.ts'), { emptyInput } = await import('/src/input/input.ts');
    const events = []; g.events.on((e) => { if (e.type === 'swim' || e.type === 'trick' || e.type === 'bail') events.push(e); });
    /** On foot at (x, z) facing yaw (0 = +z, north up the lake), at height y (ground when omitted). */
    const stand = (x, z, yaw, y) => {
      s.reset(0, true); g.advance(0.2, {}, false);
      s.walking = true; s.state = 'Walking';
      s.position.set(x, (y ?? terrainHeight(x, z)) + 0.22, z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
      s.yaw = s.previousYaw = yaw; s.walkCameraYaw = yaw; s.velocity.set(0, 0, 0); s.body.setLinvel(s.velocity, true);
      g.advance(0.3, {}, false);
    };
    const walk = (sec, extra = {}) => { for (let t = 0; t < sec; t += 1 / 60) g.advance(1 / 60, { lean: -1, ...extra }, false); };
    /** A walking run-up of `runup` seconds, a foot jump, then `air(t)` gives the frame input until the rider is in the water (or 4 s). */
    const jump = (air, runup = 0.3) => {
      events.length = 0;
      walk(runup);
      g.advance(1 / 60, { lean: -1, pressed: { hop: true }, held: { hop: 1 } }, false);
      let t = 0, peak = s.position.y;
      while (!s.swim && s.state !== 'Bail' && t < 4) { g.advance(1 / 60, air(t), false); peak = Math.max(peak, s.position.y); t += 1 / 60; if (s.grounded && t > 0.3) break; }
      const enter = events.find((e) => e.type === 'swim' && e.phase === 'enter'), scored = events.find((e) => e.type === 'trick');
      return { swim: !!s.swim, trick: enter?.trick ?? null, points: scored?.points ?? null, peak: +peak.toFixed(2), t: +t.toFixed(2), state: s.state };
    };
    window.__wt = { g, s, D: DIVE_DOCK, stand, walk, jump, emptyInput, events };
  });
  const run = (fn, a) => page.evaluate(fn, a);
  const shot = async (name, cam, look) => {
    await run(({ cam, look }) => { const g = window.__wt.g; g.render(); if (cam) { const c = g.camera.camera; c.position.set(...cam); c.lookAt(...look); c.updateMatrixWorld(); g.renderer.render(g.park.scene, c); } }, { cam, look });
    await page.screenshot({ path: `${out}/${name}.png`, timeout: 300000 });
  };

  // 1. The dock's rack takes the ride: put it up, go for a dip.
  const rack = await run(() => {
    const { g, s, D, stand, emptyInput } = window.__wt;
    const item = g.interactions.items.find((i) => i.interactionType === 'rack' && Math.hypot(i.position.x - D.rack[0], i.position.z - D.rack[1]) < 0.5);
    if (!item) return { found: false };
    stand(D.rack[0], D.rack[1] - 1, 0);
    const f = emptyInput(); f.pressed.brakeBars = true; g.interactions.update(s, f, 1 / 60);
    for (let i = 0; i < 60; i++) g.interactions.update(s, emptyInput(), 1 / 60);
    return { found: true, stored: g.interactions.stored?.rackId, hasScooter: s.hasScooter };
  });
  check('The dive dock has a rack; the ride goes up in it', rack.found && rack.stored && !rack.hasScooter, rack);

  // 2. Up the gangway onto the deck, then the stairs to the tower.
  const deck = await run(() => {
    const { g, s, D, stand, walk } = window.__wt;
    stand((D.x0 + D.x1) / 2 - 0.5, D.land - 1.2, 0);
    s.hasScooter = false;
    walk(2.6);
    const onDeck = { y: +s.position.y.toFixed(2), z: +s.position.z.toFixed(2), swim: !!s.swim };
    stand((D.stairs.x0 + D.stairs.x1) / 2, D.stairs.z0 - 0.8, 0, D.deck);
    s.hasScooter = false;
    let top = 0; for (let t = 0; t < 5 && s.position.z < D.tower.z0 + 0.5; t += 1 / 60) { g.advance(1 / 60, { lean: -1 }, false); top = Math.max(top, s.position.y); }
    return { onDeck, tower: { y: +s.position.y.toFixed(2), top: +top.toFixed(2), z: +s.position.z.toFixed(2), grounded: s.grounded } };
  });
  check('Walk up the gangway onto the deck (dry, deck height)', Math.abs(deck.onDeck.y - 0.62) < 0.08 && !deck.onDeck.swim && deck.onDeck.z > -26.2, deck.onDeck);
  check('Walk up the stairs onto the 3.2 m tower', deck.tower.y > 3.35 && deck.tower.z > -20.2, deck.tower);
  await shot('dock-overview', [-104, 6.5, -31], [-97, 1.2, -19]);

  // 3. Tower: hold a tucked front flip through two turns, let go: Double Front.
  const tower = await run(() => {
    const { s, D, stand, jump } = window.__wt;
    stand((D.tower.x0 + D.tower.x1) / 2, D.tower.z0 + 0.6, 0, D.tower.y);
    s.hasScooter = false;
    return jump((t) => t < 0.85 ? { lean: -1, held: { brake: 1, pumpGrind: 1, pushDeck: 1 } } : { held: { pushDeck: 1 } }, 0.55);
  });
  check('Tower: a held tucked double front enters clean as a Double Front, scored with height', tower.swim && tower.trick?.clean && /Double Front|Front 1½|Front 2½/.test(tower.trick.name) && tower.trick.height > 3.5 && tower.points > 500, tower);

  // Mid-air picture off the tower.
  await run(() => {
    const { g, s, D, stand } = window.__wt;
    stand((D.tower.x0 + D.tower.x1) / 2, D.tower.z0 + 0.6, 0, D.tower.y); s.hasScooter = false;
    window.__wt.walk(0.55);
    g.advance(1 / 60, { lean: -1, pressed: { hop: true }, held: { hop: 1 } }, false);
    for (let t = 0; t < 0.5; t += 1 / 60) g.advance(1 / 60, { lean: -1, held: { brake: 1, pumpGrind: 1, pushDeck: 1 } }, false);
  });
  await shot('tower-flip', [-91.5, 4.2, -18.5], [-96.2, 3.6, -16.5]);

  // 4. Springboard: a bigger bounce, a back flip with a twist.
  const board = await run(() => {
    const { s, D, stand, jump } = window.__wt;
    const b = D.board, z = b.z0 + 0.9, y = b.y0 + ((z - b.z0) / (b.z1 - b.z0)) * (b.y1 - b.y0);
    stand((b.x0 + b.x1) / 2, z, 0, y); s.hasScooter = false;
    window.__wt.walk(0.55);
    const start = s.position.y;
    const r = jump((t) => t < 0.7 ? { lean: 1, held: { brake: 1, pumpGrind: 1, leftModifier: t < 0.45 ? 1 : 0 } } : {}, 0);
    return { ...r, rise: +(r.peak - start).toFixed(2) };
  });
  check('Springboard bounces about twice as high as a normal jump (1.2 m)', board.rise > 2.3, board);
  check('Springboard back flip with a twist scores as a named trick', board.swim && board.trick?.clean && /Back|Gainer/.test(board.trick.name) && board.trick.board, board);

  // 5. Off the deck side: hold X for a Cannonball; B for a Star Jump.
  const plain = await run(() => {
    const { s, D, stand, jump } = window.__wt;
    stand(-97.3, -21.2, -Math.PI / 2, D.deck); s.hasScooter = false;
    const cannon = jump(() => ({ lean: -1, held: { pushDeck: 1 } }), 0.15);
    stand(-97.3, -21.2, -Math.PI / 2, D.deck); s.hasScooter = false;
    const star = jump(() => ({ lean: -1, held: { brakeBars: 1 } }), 0.15);
    return { cannon: cannon.trick?.name, star: star.trick?.name, points: [cannon.points, star.points] };
  });
  check('Cannonball (X) and Star Jump (B) off the deck', plain.cannon === 'Cannonball' && plain.star === 'Star Jump', plain);

  // 6. A flip held into the water flat is a Belly Flop, not a crash.
  const flop = await run(() => {
    const { s, D, stand, jump } = window.__wt;
    let best = null;
    for (const hold of [0.3, 0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.9]) {
      stand(-97.3, -21.2, -Math.PI / 2, D.deck); s.hasScooter = false;
      const r = jump((t) => ({ lean: -1, held: t < hold ? { brake: 1, pumpGrind: 1 } : {} }), 0.15);
      if (r.trick && !r.trick.clean) { best = r; break; }
      best ??= r;
    }
    return best;
  });
  check('A flat entry is a flop (OUCH), still swimming', flop.swim && flop.trick && (!flop.trick.clean ? /Flop|Smack|Plant/.test(flop.trick.name) : true), flop);

  // 7. Swimming: the deck is solid from the side; a ladder climbs out onto the deck.
  const ladder = await run(() => {
    const { g, s, D } = window.__wt;
    // In the water west of the deck, swimming east into its side.
    s.reset(0, true); g.advance(0.2, {}, false);
    s.walking = true; s.position.set(D.x0 - 1.4, 0.23, -23.4); s.body.setTranslation(s.position, true);
    s.walkCameraYaw = Math.PI / 2; g.advance(1 / 60, {}, false);
    // Walk in from the side at the lake edge would take a while: drop in directly.
    s.position.y = 0.3; s.body.setTranslation(s.position, true); g.advance(0.2, {}, false);
    const swimming = !!s.swim;
    for (let t = 0; t < 1.5; t += 1 / 60) g.advance(1 / 60, { lean: -1 }, false);
    const blockedX = +s.position.x.toFixed(2);
    // Along the side to the ladder, then into it.
    s.walkCameraYaw = 0;
    let t = 0; while (s.swim && t < 6) { const dz = D.ladders[0].water[1] - s.position.z; g.advance(1 / 60, Math.abs(dz) > 0.3 ? { lean: -Math.sign(dz) } : { steer: -1 }, false); t += 1 / 60; if (Math.abs(dz) <= 0.3) s.walkCameraYaw = 0; }
    for (let i = 0; i < 60; i++) g.advance(1 / 60, {}, false);
    return { swimming, blockedX, limit: D.x0 - 0.35, out: !s.swim, y: +s.position.y.toFixed(2), x: +s.position.x.toFixed(2), z: +s.position.z.toFixed(2), grounded: s.grounded, t: +t.toFixed(1) };
  });
  check('Swimming into the deck side is blocked', ladder.swimming && ladder.blockedX <= ladder.limit + 0.02, ladder);
  check('A ladder climbs the swimmer out onto the deck', ladder.out && Math.abs(ladder.y - 0.62) < 0.1 && ladder.x > -98.3 && ladder.grounded, ladder);

  // Pictures: the water up close at a low angle, and the shoreline edge.
  await shot('water-close', [-90.5, 1.6, 0], [-99, 0, 12]);
  await shot('shoreline', [-84, 2.4, 10], [-88.5, 0, 4]);
  check('No page errors', errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
