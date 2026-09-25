// Footprints (#61): walking presses alternating shoe prints into snow, sand and mud,
// and leaves wet prints on pavement in the rain; dry pavement and grass take none.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/footprints.browser.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186', out = process.env.OUT || 'artifacts/footprints';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  await page.evaluate(async () => { const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true); });
  // Walk 6 m east at walking pace on a spot, under the given snow/wetness, and count new prints.
  const walk = (x, z, snow, wet) => page.evaluate(({ x, z, snow, wet }) => {
    const g = window.__LAZER, s = g.sim, feet = g.tracks.feet, before = feet.marks;
    s.walking = true; s.running = false; s.position.set(x, 0.05, z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
    const rider = { position: s.position.clone(), normal: s.normal ?? { y: 1 }, yaw: -Math.PI / 2, grounded: true, walking: true, rideable: 'scooter' };
    for (let i = 0; i <= 60; i++) { rider.position.set(x + i * 0.1, 0.05, z); feet.update(1 / 60, rider, snow, wet); }
    return feet.marks - before;
  }, { x, z, snow, wet });
  const slab = await walk(-6, 8, 0, 0), sand = await walk(-9, -123, 0, 0), mud = await walk(-9, -123, 0, 0.8), snow = await walk(-6, 8, 0.9, 0), rain = await walk(-6, 8, 0, 0.8), lawn = await walk(40, 45, 0, 0);
  check('Dry pavement and dry grass take no prints', slab === 0 && lawn === 0, { slab, lawn });
  check('About one print per 0.7 m step in sand, mud, snow and wet pavement', [sand, mud, snow, rain].every((n) => n >= 7 && n <= 10), { sand, mud, snow, rain });

  // A picture: fresh prints in the snow and a wet trail in the rain at the park slab.
  const shot = await page.evaluate(async () => {
    const g = window.__LAZER, s = g.sim, feet = g.tracks.feet;
    const rider = { position: s.position.clone(), normal: { x: 0, y: 1, z: 0 }, yaw: 0, grounded: true, walking: true, rideable: 'scooter' };
    // A curving walk across the infield sand so the heading turns.
    for (let i = 0; i <= 120; i++) { const t = i / 120; rider.position.set(-14 + t * 9, 0.02, -127 + Math.sin(t * 3) * 1.6); feet.update(1 / 60, rider, 0, 0); }
    s.walking = true; s.position.set(-3.5, 0.05, -124); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true); s.yaw = Math.PI / 2;
    for (let i = 0; i < 20; i++) g.advance(1 / 60, {}, true);
    for (let i = 0; i < 3; i++) g.render();
    const cam = g.camera.camera; cam.position.set(-7, 2.6, -120.5); cam.lookAt(-10, 0, -126.5); cam.updateMatrixWorld();
    g.renderer.render(g.park.scene, cam);
    return g.renderer.domElement.toDataURL('image/jpeg', 0.88);
  });
  writeFileSync(`${out}/sand-prints.jpg`, Buffer.from(shot.split(',')[1], 'base64'));
  check('No page errors', errors.length === 0, errors.slice(0, 3));
} finally { await browser.close(); }
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
