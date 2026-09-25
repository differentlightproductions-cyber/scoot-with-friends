// #45: the rider's shadow stays readable at every time of day. The sky keeps
// its low sunset sun, but the light that casts shadows never drops below 24
// degrees, so a 1.8 m rider's shadow is at most about 4 m long, never the 17 m
// streak a 6 degree sun throws across the ground.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... OUT=artifacts/sunset-shadow node tests/sunset-shadow.browser.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186', out = process.env.OUT || 'artifacts/sunset-shadow';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  const lights = await page.evaluate(async () => {
    const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true);
    g.profile.settings.liveSky = false; g.profile.settings.weather = 'sunny';
    const s = g.sim, out = {};
    let sun = null; g.park.scene.traverse((o) => { if (!sun && o.isDirectionalLight && o.castShadow) sun = o; });
    for (const time of ['day', 'sunset', 'sunrise', 'night']) {
      for (let i = 0; i < 400; i++) g.daylight.update(0.1, time, s.position);
      // Where the light is placed each frame from (render/fidelity.ts follows the rider with this offset).
      const d = (sun.userData.shadowOffset ?? sun.position.clone().sub(sun.target.position)).clone().normalize(), sky = g.park.scene.userData.sky.sunDirection;
      out[time] = { light: +(Math.asin(d.y) * 180 / Math.PI).toFixed(1), sky: +(Math.asin(sky.y) * 180 / Math.PI).toFixed(1), shadow: +(1.8 / Math.tan(Math.asin(d.y))).toFixed(2) };
    }
    return out;
  });
  check('The shadow-casting light stays at 24 degrees or higher at every time of day', Object.values(lights).every((l) => l.light >= 23.9), lights);
  check('At sunset and sunrise the sky keeps its low sun while shadows stay under 4.1 m', lights.sunset.sky < 20 && lights.sunrise.sky < 20 && lights.sunset.shadow < 4.1 && lights.sunrise.shadow < 4.1, lights);

  // A picture of the rider's sunset shadow on the plaza, from above and to the side.
  const shot = await page.evaluate(async () => {
    const g = window.__LAZER, s = g.sim;
    s.walking = true; s.position.set(-10, 0.05, -19); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
    for (let i = 0; i < 20; i++) g.advance(1 / 60, {}, false);
    for (let i = 0; i < 100; i++) g.daylight.update(0.1, 'sunset', s.position);
    g.render();
    const cam = g.camera.camera; cam.position.set(s.position.x + 5, 6, s.position.z + 6); cam.lookAt(s.position.x, 0.4, s.position.z); cam.updateMatrixWorld();
    g.renderer.render(g.park.scene, cam);
    return g.renderer.domElement.toDataURL('image/jpeg', 0.88);
  });
  writeFileSync(`${out}/sunset-rider.jpg`, Buffer.from(shot.split(',')[1], 'base64'));
  check('No page errors', errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
