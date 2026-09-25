// #85: weather falls on every open-air map (Veterans, B Hill, the Church),
// consistent with the one Weather setting, and never inside a roofed shelter
// (the church building and plaza canopy, the Veterans pavilions): no flakes,
// streaks or leaves under the roof and no snow, puddles or litter on its floor.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/weather-maps.browser.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186', out = process.env.OUT || 'artifacts/weather-maps';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${ok ? '' : JSON.stringify(detail)}`); };
try {
  for (const map of ['b_hill', 'church', 'outdoor']) {
    const page = await browser.newPage({ viewport: { width: 480, height: 320 } }), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${url}/?map=${map}`);
    await page.waitForFunction(() => window.__LAZER?.weather, null, { timeout: 900000 });
    const r = await page.evaluate(async (map) => {
      const g = window.__LAZER; g.testing(true); await g.startSession(map, true); g.advance(0.3, {}, false);
      const draw = g.renderer.render; g.renderer.render = () => {};
      const THREE = await import('/node_modules/three/build/three.module.js');
      const w = g.weather, s = g.sim, res = {}, shelters = g.park.scene.userData.shelters ?? [];
      const run = (mode, seconds, camera) => { for (let i = 0; i < seconds * 10; i++) { g.daylight.update(0.1, 'day', s.position); w.update(0.1, mode, s.position, g.profile.settings.fidelity, { camera }); } };
      // Visible particles inside a shelter, counted from the live buffers.
      const inside = (points, alphaName) => {
        if (!points?.visible) return 0; const p = points.geometry.getAttribute('position').array, a = alphaName ? points.geometry.getAttribute(alphaName).array : null; let n = 0;
        const stride = points.isLineSegments ? 6 : 3;
        for (let i = 0; i * stride < p.length; i++) { const k = i * stride, shown = a ? a[i] > 0 : Math.hypot(p[k] - p[k + 3], p[k + 1] - p[k + 4], p[k + 2] - p[k + 5]) > 1e-4; if (shown && w.sheltered(p[k], p[k + 1], p[k + 2])) n++; }
        return n;
      };
      for (const mode of ['snow', 'rain', 'fall']) {
        run(mode, 30, g.camera.camera.position);
        res[mode] = { falling: mode === 'snow' ? !!w.flakes?.visible : mode === 'rain' ? !!w.drops?.visible : !!w.leaves?.visible, ground: +(mode === 'snow' ? w.coverage.value : mode === 'rain' ? w.wet.value : w.litter.value).toFixed(2) };
        if (shelters.length) {
          // Stand the particle box on the first shelter's floor: nothing shows under its roof.
          const b = shelters[0], c = new THREE.Vector3((b.x0 + b.x1) / 2, b.top - 2.5, (b.z0 + b.z1) / 2);
          run(mode, 3, c);
          res[mode].underRoof = inside(w.flakes, 'aAlpha') + inside(w.drops) + inside(w.leaves, 'aAlpha');
          // The same floor, same light, with and without its roof: snow only settles without.
          if (mode === 'snow') {
            const cam = new THREE.PerspectiveCamera(60, 1.5, 0.05, 200); cam.position.copy(c); cam.lookAt(c.x + 0.01, b.top - 8, c.z + 3); cam.updateMatrixWorld();
            const mean = () => { draw.call(g.renderer, g.park.scene, cam); const gl = g.renderer.getContext(), px = new Uint8Array(40 * 20 * 4); gl.readPixels(220, 50, 40, 20, gl.RGBA, gl.UNSIGNED_BYTE, px); let sum = 0; for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2]; return sum / (px.length / 4) / 3; };
            res[mode].roofed = Math.round(mean());
            const keep = g.park.scene.userData.shelters; g.park.scene.userData.shelters = []; w.update(0.001, mode, s.position, g.profile.settings.fidelity, { camera: c });
            res[mode].open = Math.round(mean());
            g.park.scene.userData.shelters = keep; w.update(0.001, mode, s.position, g.profile.settings.fidelity, { camera: c });
          }
        }
        run('sunny', 30, g.camera.camera.position);
      }
      res.shelters = shelters.length;
      return res;
    }, map);
    check(`${map}: snow falls and settles`, r.snow.falling && r.snow.ground > 0.6, r.snow);
    check(`${map}: rain falls and soaks the ground`, r.rain.falling && r.rain.ground > 0.9, r.rain);
    check(`${map}: leaves fall and gather`, r.fall.falling && r.fall.ground > 0.9, r.fall);
    if (map !== 'b_hill') {
      check(`${map}: shelters declared`, r.shelters > 0, r.shelters);
      for (const mode of ['snow', 'rain', 'fall']) check(`${map}: nothing ${mode === 'fall' ? 'drifts' : 'falls'} under the roof (${mode})`, r[mode].underRoof === 0, r[mode]);
      check(`${map}: the floor under the roof stays clear of snow (it would be white without the roof)`, r.snow.open > r.snow.roofed + 25, r.snow);
    }
    check(`${map}: no page errors`, errors.length === 0, errors);
    await page.close();
  }
  // One city, one sky: snow that settled at Veterans is still on the ground at the Church.
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  await page.goto(`${url}/?map=outdoor`);
  await page.waitForFunction(() => window.__LAZER?.weather, null, { timeout: 900000 });
  const carry = await page.evaluate(async () => {
    const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true); g.advance(0.3, {}, false);
    for (let i = 0; i < 400; i++) g.weather.update(0.1, 'snow', g.sim.position, g.profile.settings.fidelity, {});
    const before = g.weather.coverage.value;
    await g.startSession('church', true); g.advance(0.1, {}, false);
    g.weather.update(0.1, 'snow', g.sim.position, g.profile.settings.fidelity, {});
    return { before: +before.toFixed(3), after: +g.weather.coverage.value.toFixed(3), falling: !!g.weather.flakes?.visible };
  });
  check('Snow cover carries from Veterans to the Church (no fresh start)', carry.before > 0.8 && Math.abs(carry.after - carry.before) < 0.02 && carry.falling, carry);
  await page.close();
} finally {
  await browser.close();
}
const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length} weather-map checks passed`);
process.exit(failed ? 1 : 0);
