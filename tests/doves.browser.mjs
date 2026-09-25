// Mourning doves (#71): a handful in the pines and on the pavilion roofs, a
// couple down on the lawn; they clatter off when someone comes close, steal
// chips left on a picnic table and crumbs, pick through litter, leave a splat
// that fades, roost at night, and every coo and wing clap is placed in the
// world so a far-off dove is quiet and off to one side.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/doves.browser.mjs
import { chromium } from 'playwright';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  const setup = await page.evaluate(async () => {
    const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true); g.renderer.render = () => {};
    await g.audio.start();
    const d = g.doves, THREE = await import('/node_modules/three/build/three.module.js');
    window.__V = (x, y, z) => new THREE.Vector3(x, y, z);
    // Every placed sound, for the audio checks.
    window.__sounds = [];
    const playAt = g.audio.playAt.bind(g.audio);
    g.audio.playAt = (buffer, at, gain, rate, near, far) => { const r = playAt(buffer, at, gain, rate, near, far); window.__sounds.push({ at: { x: at.x, y: at.y, z: at.z }, near, far, duration: buffer.duration, panner: r ? { model: r.panner.panningModel, distance: r.panner.distanceModel, ref: r.panner.refDistance, max: r.panner.maxDistance } : null }); return r; };
    // A day with no one near: the rider parked far off.
    window.__ctx = (o = {}) => ({ rider: o.rider ?? __V(300, 0, 300), speed: o.speed ?? 0, night: o.night ?? 0, rain: o.rain ?? 0 });
    // A lawn spot near the west lawn (landing() gives up now and then; keep asking).
    window.__lawn = () => { for (let i = 0; i < 200; i++) { const s = d.world.landing(__V(-20, 0, -12)); if (s) return s; } return null; };
    window.__run = (seconds, o, step = 1 / 30) => { for (let t = 0; t < seconds; t += step) d.update(step, __ctx(o)); };
    const states = d.state.map((s) => s.state);
    const perches = d.world.perches;
    return { count: states.length, perched: states.filter((s) => s === 'perch').length, ground: states.filter((s) => s === 'ground').length, perches: perches.length, high: perches.filter((p) => p.y > 3).length, tables: d.tables.length, audio: g.audio.context?.state ?? null };
  });
  check('Six doves: most up in the trees and on roofs, never more than three on the ground', setup.count === 6 && setup.perched >= 3 && setup.ground <= 3, setup);
  check('Perches come from the pines and pavilion roofs; a picnic table at every pavilion', setup.perches > 60 && setup.tables === 6, setup);

  // Walking up to a dove on the lawn: it takes off for a perch well away.
  const flee = await page.evaluate(async () => {
    const g = window.__LAZER, d = g.doves, dove = d.doves[0], spot = __lawn();
    dove.state = 'ground'; dove.position.copy(spot); dove.timer = 999; dove.walk = undefined; dove.flight = undefined;
    window.__sounds.length = 0;
    __run(0.5, { rider: __V(spot.x + 5, spot.y, spot.z) });
    const before = dove.state;
    __run(0.2, { rider: __V(spot.x + 1.5, spot.y, spot.z) });
    const took = dove.state, to = dove.flight?.to.clone();
    await new Promise((r) => setTimeout(r, 1000));
    const flaps = window.__sounds.length;
    let high = 0; for (let i = 0; i < 90; i++) { __run(1 / 30); high = Math.max(high, dove.position.y - spot.y); }
    __run(12);
    return { before, took, away: to ? Math.hypot(to.x - spot.x - 1.5, to.z - spot.z) : 0, up: to ? to.y - spot.y : 0, flaps, high, landed: dove.state };
  });
  check('Five metres off on foot it stays; at a metre and a half it takes off with a wing clap', flee.before === 'ground' && flee.took === 'fly' && flee.flaps >= 1, flee);
  check('It climbs away to a perch more than eight metres off and settles there', flee.away > 8 && flee.up > 1.5 && flee.high > 1 && flee.landed === 'perch', flee);

  // Riding past fast startles them from farther away.
  const riding = await page.evaluate(() => {
    const d = window.__LAZER.doves, dove = d.doves[1], spot = __lawn();
    dove.state = 'ground'; dove.position.copy(spot); dove.timer = 999; dove.walk = undefined; dove.flight = undefined;
    __run(0.2, { rider: __V(spot.x + 4.5, spot.y, spot.z), speed: 0 });
    const walkingPast = dove.state;
    __run(0.2, { rider: __V(spot.x + 4.5, spot.y, spot.z), speed: 8 });
    return { walkingPast, ridingPast: dove.state };
  });
  check('Riding past at speed 4.5 m off flushes it; walking past at that distance does not', riding.walkingPast === 'ground' && riding.ridingPast === 'fly', riding);

  // Chips left on a picnic table: doves come down, steal them one by one, and the empty bag is litter.
  const snack = await page.evaluate(() => {
    const g = window.__LAZER, d = g.doves, table = d.tables[0];
    let emptied = null; const onEmpty = d.onSnackEmpty; d.onSnackEmpty = (at) => { emptied = at.clone(); onEmpty(at); };
    const litterBefore = g.playful.litter;
    for (const dove of d.doves) { dove.state = 'perch'; dove.flight = undefined; dove.food = undefined; dove.walk = undefined; dove.timer = 0.01; dove.position.copy(table).add(__V(8, 4, 0)); }
    d.leaveSnack(table);
    const chips = d.foodLeft;
    let carried = 0, onTable = 0;
    for (let i = 0; i < 180 * 30 && d.foodLeft > 0; i++) {
      d.update(1 / 30, __ctx());
      for (const dove of d.doves) { if (dove.carry) carried = Math.max(carried, 1); if (dove.state === 'feed' && Math.abs(dove.position.y - table.y) < 0.05) onTable = 1; }
      for (const dove of d.doves) if (dove.state === 'perch' && !dove.flight) dove.timer = Math.min(dove.timer, 1);
    }
    return { chips, left: d.foodLeft, carried, onTable, emptied: !!emptied, litter: g.playful.litter - litterBefore, bagGone: !d.snacks.length };
  });
  check('Six chips by an open bag on the table; doves land on the table and fly off with them in their bills', snack.chips === 6 && snack.onTable === 1 && snack.carried === 1, snack);
  check('Picked clean, the bag is left as litter on the table', snack.left === 0 && snack.emptied && snack.litter === 1 && snack.bagGone, snack);

  // Crumbs where chips were eaten, and a can on the lawn: a dove on the ground goes to them.
  const scraps = await page.evaluate(() => {
    const g = window.__LAZER, d = g.doves, dove = d.doves[2], spot = __lawn();
    for (const o of d.doves) { o.state = 'perch'; o.timer = 999; o.flight = undefined; o.food = undefined; }
    dove.state = 'ground'; dove.position.copy(spot); dove.timer = 60; dove.walk = undefined;
    d.addCrumbs(spot.clone().add(__V(1.2, 0, 0)));
    const crumbs = d.foodLeft;
    __run(40);
    const eaten = crumbs - d.foodLeft;
    // Litter: it walks over and picks through it; the can shifts under its bill.
    const can = g.playful.litterObjects()[0];
    const at = can.position.clone(), yaw = can.rotation.y;
    dove.state = 'ground'; dove.position.copy(at).add(__V(-1, 0, 0)); dove.position.y = g.terrainHeight(dove.position.x, dove.position.z); dove.timer = 60; dove.food = undefined; dove.walk = undefined;
    let reached = 0; for (let i = 0; i < 30 * 20; i++) { d.update(1 / 30, __ctx()); if (dove.position.distanceTo(can.position) < 0.3 && dove.state === 'feed') reached = 1; }
    return { crumbs, eaten, reached, moved: can.position.distanceTo(at) > 0.002 || Math.abs(can.rotation.y - yaw) > 0.01 };
  });
  check('Crumbs on the lawn get eaten', scraps.crumbs === 5 && scraps.eaten >= 3, scraps);
  check('A dove picks through litter on the ground and nudges it about', scraps.reached === 1 && scraps.moved, scraps);

  // A splat from a perch: it lands on whatever is below and fades within ten seconds; never more than six.
  const splat = await page.evaluate(() => {
    const g = window.__LAZER, d = g.doves, dove = d.doves[3], table = d.tables[1];
    dove.state = 'perch'; dove.position.copy(table).add(__V(0, 3.4, 0)); dove.timer = 999; dove.flight = undefined;
    g.advance(1 / 60, {}, false);
    const before = d.splatCount;
    d.poop(dove, __ctx());
    const mesh = d.splats[d.splats.length - 1].mesh, onTable = mesh.position.y - table.y;
    __run(3);
    const mid = mesh.material.opacity;
    __run(8);
    for (let i = 0; i < 10; i++) d.poop(dove, __ctx());
    const capped = d.splatCount;
    // Right above the rider: the rider is hit instead.
    let hit = 0; d.onPoopHit = () => hit++;
    d.poop(dove, __ctx({ rider: dove.position.clone().setY(table.y - 0.8) }));
    return { made: d.splatCount >= 0 && before >= 0, onTable, mid, gone: !mesh.parent, capped, hit };
  });
  check('A splat lands on the picnic table below the perch', Math.abs(splat.onTable) < 0.03, splat);
  check('It fades after a few seconds and is gone; no more than six at once', splat.mid > 0.5 && splat.gone && splat.capped <= 6, splat);
  check('Straight above the rider it hits them instead', splat.hit === 1, splat);

  // Night (and rain): the ones on the ground go up to roost, and they stop cooing.
  const night = await page.evaluate(() => {
    const d = window.__LAZER.doves;
    d.doves.forEach((o, i) => { if (i < 2) { const s = __lawn(); o.state = 'ground'; o.position.copy(s); o.timer = 999; o.flight = undefined; o.food = undefined; } else { o.coo = 0.1; } });
    window.__sounds.length = 0; d.cooCooldown = 0;
    __run(20, { night: 1 });
    const coos = window.__sounds.filter((s) => s.near === 6).length;
    return { states: d.state.map((s) => s.state), coos };
  });
  check('At night every dove roosts up off the ground and none coo', night.states.every((s) => s === 'perch') && night.coos === 0, night);

  // Day: coos come from the dove's spot, spatialised, fading out by 85 m.
  const coo = await page.evaluate(async () => {
    const g = window.__LAZER, d = g.doves, dove = d.doves[4];
    dove.state = 'perch'; dove.timer = 999; dove.coo = 0.05; d.cooCooldown = 0; window.__sounds.length = 0;
    __run(0.2, { rider: dove.position.clone().add(__V(20, 0, 0)) });
    await new Promise((r) => setTimeout(r, 1500));
    const s = window.__sounds.find((x) => x.near === 6);
    return { s, at: dove.position.toArray(), context: g.audio.context?.state };
  });
  check('A coo plays at the dove through an HRTF panner, full within 6 m and silent past 85 m', coo.s && Math.hypot(coo.s.at.x - coo.at[0], coo.s.at.z - coo.at[2]) < 0.01 && coo.s.panner?.model === 'HRTF' && coo.s.panner.distance === 'linear' && coo.s.panner.ref === 6 && coo.s.panner.max === 85 && coo.s.duration > 1, coo);
  // The web audio linear model: gain = 1 - (d - ref) / (max - ref), so a dove 60 m off is at about a third.
  const heard = await page.evaluate(async () => {
    const at = async (x) => { const o = new OfflineAudioContext(2, 4800, 48000), s = o.createConstantSource(), q = o.createPanner(); Object.assign(q, { panningModel: 'equalpower', distanceModel: 'linear', refDistance: 6, maxDistance: 85 }); q.positionX.value = x; q.positionZ.value = -0.001; s.connect(q).connect(o.destination); s.start(); const b = await o.startRendering(); const l = b.getChannelData(0)[4000], r = b.getChannelData(1)[4000]; return { level: Math.hypot(l, r), left: l, right: r }; };
    return { near: await at(3), mid: await at(60), far: await at(90), side: await at(20) };
  });
  check('Distance attenuation: loud up close, faint 60 m off, silent past 85 m, and off to the side it pans', heard.near.level > 0.9 && heard.mid.level < 0.45 && heard.mid.level > 0.2 && heard.far.level < 0.01 && heard.side.right > heard.side.left * 3, heard);
  check('No page errors', errors.length === 0, errors);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
