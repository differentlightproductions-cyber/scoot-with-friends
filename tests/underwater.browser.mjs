// First person in the water (#62, #69): click LS to swim faster, A hops up with
// a splash; a swimmer's eyes ride just above the surface; left still they sink,
// B dives and A kicks back up, and under the lake has a basin, murky fog, motes
// and a bright window overhead; an on-foot flip turns the first-person view
// over with the body.
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

  // Depth (#69): left still a swimmer sinks at a steady rate; stroking holds them up;
  // B dives, A kicks back up; the bottom stops them; a jump in carries them under.
  const depth = await page.evaluate(async () => {
    const g = window.__LAZER, s = g.sim, W = window.__WATER, out = {};
    const { lakeBed } = await import('/src/park/water.ts');
    const at = () => +(s.swim?.depth ?? 0).toFixed(2);
    const reset = () => { s.position.set(W.x, 0.4, W.z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true); s.velocity.set(0, 0, 0); s.swim.depth = 0; s.swim.rise = 0; s.swim.still = 0; };
    reset();
    for (let i = 0; i < 60; i++) g.advance(1 / 60, {}, false);
    out.after1s = at();
    for (let i = 0; i < 120; i++) g.advance(1 / 60, {}, false);
    out.after3s = at(); out.rate = +((out.after3s - out.after1s) / 2).toFixed(2);
    reset();
    for (let i = 0; i < 180; i++) g.advance(1 / 60, { lean: i % 120 < 60 ? -1 : 1 }, false);
    out.stroking = at();
    reset();
    let under = false, fog = null;
    for (let i = 0; i < 90; i++) { g.advance(1 / 60, { held: { brakeBars: 1 } }, false); g.render(); if (g.underwater.under) { under = true; fog ??= g.park.scene.fog.far; } }
    out.dived = at(); out.under = under; out.fog = fog; out.overlay = document.querySelector('.underwater-tint').style.opacity; out.eye = +g.camera.camera.position.y.toFixed(2);
    for (let i = 0; i < 240; i++) g.advance(1 / 60, { held: { brakeBars: 1 } }, false);
    out.bottom = +(s.position.y - lakeBed(s.position.x, s.position.z)).toFixed(2);
    for (let i = 0; i < 150; i++) { g.advance(1 / 60, { held: { hop: 1 } }, false); g.render(); }
    out.kicked = at(); out.upEye = +g.camera.camera.position.y.toFixed(2); out.upUnder = g.underwater.under;
    // Third person follows a diver under.
    g.camera.view = 'third';
    for (let i = 0; i < 70; i++) { g.advance(1 / 60, { held: { brakeBars: 1 } }, false); g.render(); }
    out.thirdY = +g.camera.camera.position.y.toFixed(2); out.thirdUnder = g.underwater.under;
    g.camera.view = 'first';
    for (let i = 0; i < 150; i++) { g.advance(1 / 60, { held: { hop: 1 } }, false); g.render(); }
    // A jump in from 3 m goes under by itself.
    s.swim = null; s.walking = true; s.grounded = false; s.footJumped = true;
    s.position.set(W.x, 3, W.z + 4); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true); s.velocity.set(0, -6, 0);
    let deepest = 0;
    for (let i = 0; i < 90; i++) { g.advance(1 / 60, {}, false); deepest = Math.max(deepest, s.swim?.depth ?? 0); }
    out.jumpIn = +deepest.toFixed(2);
    for (let i = 0; i < 200; i++) g.advance(1 / 60, { held: { hop: 1 } }, false);
    return out;
  });
  check('Left still, a swimmer sinks at a steady rate (about 0.45 m/s)', depth.after3s > 0.6 && depth.rate > 0.3 && depth.rate < 0.6, depth);
  check('Stroking holds a swimmer at the surface', depth.stroking < 0.2, depth);
  check('Holding B dives: the view goes under, murky fog closes in, the tint shows', depth.dived > 1 && depth.under && depth.fog <= 10 && depth.overlay === '1' && depth.eye < -0.3, depth);
  check('The bottom stops a diver', depth.bottom > 0.25 && depth.bottom < 0.5, depth);
  check('Holding A kicks back up to the surface, eyes above the water', depth.kicked < 0.05 && depth.upEye > 0.05 && !depth.upUnder, depth);
  check('In third person the camera follows a diver under', depth.thirdY < -0.3 && depth.thirdUnder, depth);
  check('A jump in from 3 m carries the swimmer under', depth.jumpIn > 0.8, depth);

  // Pictures under water: looking ahead along the bottom, and up at the window in the surface.
  for (const [name, pitch] of [['under-ahead', -0.25], ['under-up', 0.95]]) {
    await page.evaluate(async ({ pitch }) => {
      const g = window.__LAZER, W = window.__WATER, cam = g.camera.camera;
      cam.position.set(W.x + 1, -1.2, W.z - 6); cam.rotation.set(pitch, Math.PI, 0, 'YXZ'); cam.updateMatrixWorld();
      g.underwater.update(cam, 1 / 60, 1, true);
      g.renderer.render = window.__draw; g.renderer.render(g.park.scene, cam); g.renderer.render = () => {};
    }, { pitch });
    await page.screenshot({ path: `${out}/${name}.png` });
  }

  const back = await page.evaluate(async () => {
    const g = window.__LAZER;
    for (let i = 0; i < 120; i++) { g.advance(1 / 60, { lean: -0.2 }, false); g.render(); }
    return { eye: +g.camera.camera.position.y.toFixed(3), under: g.underwater.under, far: g.park.scene.fog.far };
  });
  check('Back at the top: eyes above the water, the fog as it was', !back.under && back.eye > 0.05 && back.far > 100, back);

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
