// Surfaces and the ballfield DIY lot (#46): grass and infield sand slow a rolling
// scooter, pads and paths do not; snow never slows but takes tracks; wheel tracks
// are pressed into grass and sand; the DIY lot's kicker launches and its bench grinds.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/surfaces.browser.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186', out = process.env.OUT || 'artifacts/surfaces';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  await page.evaluate(async () => { const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true); g.renderer.render = () => {}; });

  // Roll 2 s from 6 m/s on each ground, heading east, and compare the speed kept.
  const roll = await page.evaluate(() => {
    const g = window.__LAZER, out = {};
    const spots = { slab: [0, 0, 10], lawn: [40, 0, 45], infield: [-9, 0, -123], outfield: [-3, 0, -141], path: [27, 0, -120] };
    for (const [name, [x, , z]] of Object.entries(spots)) {
      const s = g.sim; s.reset(0, true); s.walking = false; s.rideable = 'scooter';
      s.position.set(x, 0.3, z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true); s.yaw = Math.PI / 2; s.previousYaw = s.yaw;
      for (let i = 0; i < 20; i++) g.advance(1 / 60, {}, true);
      s.velocity.set(6, 0, 0); s.body.setLinvel(s.velocity, true);
      for (let i = 0; i < 120; i++) g.advance(1 / 60, {}, true);
      out[name] = { speed: +Math.hypot(s.velocity.x, s.velocity.z).toFixed(2), grounded: s.grounded };
    }
    return out;
  });
  check('Grass slows a rolling scooter more than the wood park slab', roll.lawn.speed < roll.slab.speed - 1 && roll.outfield.speed < roll.slab.speed - 1, roll);
  check('Infield sand slows it more than grass', roll.infield.speed < roll.lawn.speed - 1, roll);
  check('A path across the ballfield lawns rides like the slab', Math.abs(roll.path.speed - roll.slab.speed) < 0.3, roll);

  // Tracks: grass and sand take them, the slab does not; snow over everything takes them without slowing.
  const tracks = await page.evaluate(() => {
    const g = window.__LAZER, s = g.sim, out = {};
    const run = (x, z) => { s.reset(0, true); s.position.set(x, 0.3, z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true); s.yaw = Math.PI / 2; for (let i = 0; i < 20; i++) g.advance(1 / 60, {}, true); const before = g.tracks.marks; s.velocity.set(5, 0, 0); s.body.setLinvel(s.velocity, true); for (let i = 0; i < 90; i++) { g.advance(1 / 60, {}, true); g.render(); } return g.tracks.marks - before; };
    out.lawn = run(40, 45); out.infield = run(-9, -123); out.slab = run(-10, 10);
    return out;
  });
  check('Wheel tracks press into grass and sand, not the concrete slab', tracks.lawn > 5 && tracks.infield > 5 && tracks.slab === 0, tracks);

  // The DIY lot: the south-facing kicker launches a rider rolling at it.
  const kicker = await page.evaluate(() => {
    const g = window.__LAZER, s = g.sim; s.reset(0, true);
    // Kicker A rises toward +z at z -121..-119.2: roll at it from z -135, heading +z (yaw 0).
    s.position.set(-82.8, 0.3, -135); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true); s.yaw = 0; s.previousYaw = 0;
    for (let i = 0; i < 20; i++) g.advance(1 / 60, {}, true);
    let peak = 0, air = 0, bail = null;
    g.events.on((e) => { if (e.type === 'bail') bail = e.message ?? 'bail'; });
    s.velocity.set(0, 0, 7); s.body.setLinvel(s.velocity, true);
    for (let i = 0; i < 180; i++) { g.advance(1 / 60, {}, true); peak = Math.max(peak, s.position.y); if (!s.grounded) air += 1 / 60; }
    return { peak: +peak.toFixed(2), air: +air.toFixed(2), bail, z: +s.position.z.toFixed(1), state: s.state };
  });
  check('The DIY kicker launches a rider into the air and lands them', kicker.peak > 0.6 && kicker.air > 0.2 && !kicker.bail, kicker);

  // A picture of the lot, from above its north-east corner.
  const shot = await page.evaluate(async () => {
    const g = window.__LAZER; delete g.renderer.render;
    const s = g.sim; s.reset(0, true); s.position.set(-44, 0.3, -106); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true); s.yaw = Math.PI * 0.8;
    for (let i = 0; i < 30; i++) g.advance(1 / 60, {}, true);
    const cam = g.camera.camera; for (let i = 0; i < 3; i++) g.render();
    cam.position.set(-30, 14, -96); cam.lookAt(-62, 0, -126); cam.updateMatrixWorld();
    g.renderer.render(g.park.scene, cam);
    return g.renderer.domElement.toDataURL('image/jpeg', 0.85);
  });
  writeFileSync(`${out}/ballfield-diy.jpg`, Buffer.from(shot.split(',')[1], 'base64'));
  check('No page errors', errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
