// First person in the water (#62): click LS to swim faster, A hops up with a
// splash; a swimmer's eyes ride just above the
// surface; a dive plunges the view under, where the lake has a basin, murky
// fog, motes and a bright window overhead, then it comes back up; an on-foot
// flip turns the first-person view over with the body.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... OUT=artifacts/underwater node tests/underwater.browser.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186', out = process.env.OUT || 'artifacts/underwater';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  const swim = await page.evaluate(async () => {
    const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true);
    g.profile.settings.daylight = 'day'; g.profile.settings.liveSky = false; g.profile.settings.weather = 'sunny';
    g.profile.settings.cameraView = 'first'; g.camera.view = 'first';
    window.__draw = g.renderer.render; g.renderer.render = () => {};
    const { WATER } = await import('/src/park/water.ts'); window.__WATER = WATER;
    const s = g.sim; s.walking = true; s.hasScooter = false;
    s.position.set(WATER.x, 0.4, WATER.z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
    for (let i = 0; i < 20; i++) { g.advance(1 / 60, {}, false); g.render(); }
    return { swimming: !!s.swim, eye: +g.camera.camera.position.y.toFixed(3), under: g.underwater.under, basin: !!g.park.scene.getObjectByName('Lake bed'), underside: !!g.park.scene.getObjectByName('Lake surface from below') };
  });
  check('Swimming in first person: the eyes ride just above the surface; the lake has a basin and an underside', swim.swimming && swim.eye > 0.07 && !swim.under && swim.basin && swim.underside, swim);

  // Swim controls: clicking LS on the move swims faster (stopping drops back); A hops up out of the water.
  const controls = await page.evaluate(async () => {
    const g = window.__LAZER, s = g.sim, speed = () => Math.hypot(s.velocity.x, s.velocity.z);
    for (let i = 0; i < 60; i++) g.advance(1 / 60, { lean: -1 }, false);
    const steady = speed();
    g.advance(1 / 60, { lean: -1, pressed: { sprint: true } }, false);
    for (let i = 0; i < 60; i++) g.advance(1 / 60, { lean: -1 }, false);
    const fast = speed(), fastFlag = !!s.swim?.fast;
    for (let i = 0; i < 40; i++) g.advance(1 / 60, {}, false);
    const dropped = !s.swim?.fast, base = s.position.y;
    let peak = base, splashes = 0; g.events.on((e) => { if (e.type === 'splash') splashes++; });
    g.advance(1 / 60, { pressed: { hop: true } }, false);
    for (let i = 0; i < 60; i++) { g.advance(1 / 60, {}, false); peak = Math.max(peak, s.position.y); }
    for (let i = 0; i < 20; i++) g.render();
    return { steady: +steady.toFixed(2), fast: +fast.toFixed(2), fastFlag, dropped, lift: +(peak - base).toFixed(2), splashes, back: +(s.position.y - base).toFixed(3), swimming: !!s.swim };
  });
  check('Click LS on the move to swim faster; stopping drops back to a steady stroke', controls.fast > controls.steady * 1.4 && controls.fastFlag && controls.dropped, controls);
  check('A hops up out of the water with a splash and drops back in', controls.lift > 0.25 && controls.splashes >= 2 && Math.abs(controls.back) < 0.06 && controls.swimming, controls);

  const plunge = await page.evaluate(async () => {
    const g = window.__LAZER, W = window.__WATER; g.camera.plunge(1.3);
    let deepest = 9, under = false, fog = null;
    for (let i = 0; i < 30; i++) { g.render(); deepest = Math.min(deepest, g.camera.camera.position.y); if (g.underwater.under) { under = true; fog ??= { near: g.park.scene.fog.near, far: g.park.scene.fog.far }; } }
    const overlay = document.querySelector('.underwater-tint').style.opacity;
    return { deepest: +deepest.toFixed(2), under, fog, overlay, surface: W.surface };
  });
  check('A dive plunges the view under: murky fog closes in within metres, the tint shows', plunge.under && plunge.deepest < -0.6 && plunge.fog?.far <= 10 && plunge.overlay === '1', plunge);

  // Pictures under water: looking ahead along the bottom, and up at the window in the surface.
  for (const [name, pitch] of [['under-ahead', -0.25], ['under-up', 0.95]]) {
    await page.evaluate(async ({ pitch }) => {
      const g = window.__LAZER, W = window.__WATER, cam = g.camera.camera;
      g.camera.plunge(1.3); for (let i = 0; i < 20; i++) g.render();
      cam.position.set(W.x + 1, -1.2, W.z - 6); cam.rotation.set(pitch, Math.PI, 0, 'YXZ'); cam.updateMatrixWorld();
      g.underwater.update(cam, 1 / 60, 1, true);
      g.renderer.render = window.__draw; g.renderer.render(g.park.scene, cam); g.renderer.render = () => {};
    }, { pitch });
    await page.screenshot({ path: `${out}/${name}.png` });
  }

  const back = await page.evaluate(async () => {
    const g = window.__LAZER;
    for (let i = 0; i < 120; i++) g.render();
    return { eye: +g.camera.camera.position.y.toFixed(3), under: g.underwater.under, far: g.park.scene.fog.far };
  });
  check('Then it comes back up: eyes above the water, the fog as it was', !back.under && back.eye > 0.05 && back.far > 100, back);

  // An on-foot flip turns the first-person view over with the body.
  const flip = await page.evaluate(async () => {
    const g = window.__LAZER, s = g.sim, cam = g.camera.camera, out = {};
    s.swim = null; s.walking = true; s.position.set(0, 4, 60); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true); s.yaw = s.previousYaw = 0; s.grounded = false;
    for (const angle of [0, Math.PI / 2, Math.PI]) {
      s.diveFlip = { angle, dir: 1, side: 0, sideDir: 0, twist: 0, twistDir: 0 };
      for (let i = 0; i < 4; i++) g.render();
      const up = new cam.up.constructor(0, 1, 0).applyQuaternion(cam.quaternion), forward = new cam.up.constructor(0, 0, -1).applyQuaternion(cam.quaternion);
      out[angle.toFixed(2)] = { up: +up.y.toFixed(2), forward: +forward.y.toFixed(2) };
    }
    s.diveFlip = null;
    return out;
  });
  const [level, quarter, half] = Object.values(flip);
  check('An on-foot front flip turns the first-person view over: level, then facing down, then upside down', level.up > 0.9 && quarter.forward < -0.8 && half.up < -0.8, flip);
  check('No page errors', errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
