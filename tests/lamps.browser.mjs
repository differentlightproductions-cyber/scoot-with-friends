// Lamp light (#75, #83). The park's lamps (path lamps, the parking lot's
// floodlights and the old sodium poles) all glow amber and light what is under
// them for real, falling off with distance and surface angle, instead of
// painted circles on the ground; the shaders take the 8 nearest the rider.
// The headlamp is a plain spot light on every map (it used to exist only at
// Veterans, so it never lit B Hill).
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/lamps.browser.mjs
import { chromium } from 'playwright';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 480, height: 300 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  const r = await page.evaluate(async () => {
    const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true);
    const draw = g.renderer.render; g.renderer.render = () => {};
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { parkLampLight, particleLight } = await import('/src/art/particle-light.ts');
    const P = g.profile.settings, s = g.sim; P.liveSky = false; P.weather = 'sunny';
    const place = (x, z, yaw) => { s.walking = true; s.position.set(x, g.terrainHeight(x, z) + 0.05, z); s.body.setTranslation(s.position, true); s.yaw = yaw; s.previousYaw = yaw; };
    const run = (n) => { for (let i = 0; i < n; i++) { g.advance(1 / 30, {}, false); g.render(); } };
    const lights = () => { const found = { spot: null, point: 0, count: 0 }; g.park.scene.traverse((o) => { if (o.isLight) found.count++; if (o.isSpotLight && o.name === 'Rider flashlight') found.spot = o; if (o.isPointLight) found.point++; }); return found; };
    const pools = []; g.park.scene.traverse((o) => { if (o.visible && /pool/i.test(o.name) && o.material?.opacity > 0) pools.push(o.name); });
    P.daylight = 'day'; P.flashlight = true; place(-40, 60, 0); run(60);
    const day = { power: parkLampLight.uParkLampPower.value, beam: lights().spot.intensity };
    // Night, headlamp off, rider away: the ground under the path lamp at (-20, 34.3).
    P.daylight = 'night'; P.flashlight = false; run(300);
    const cam = new THREE.PerspectiveCamera(40, 480 / 300, 0.1, 300); cam.position.set(-13, 3, 41); cam.lookAt(-18.5, 0, 34.8); cam.updateMatrixWorld();
    const gl = g.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const pixel = (c) => { draw.call(g.renderer, g.park.scene, c); const px = new Uint8Array(4); gl.readPixels(Math.floor(w / 2), Math.floor(h / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return [...px.slice(0, 3)]; };
    const lum = (p) => p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11;
    const power = parkLampLight.uParkLampPower.value, litPx = pixel(cam); parkLampLight.uParkLampPower.value = 0; const unlitPx = pixel(cam); parkLampLight.uParkLampPower.value = power;
    const used = particleLight.uParkLamps.value.filter((v) => v.w > 0).length;
    const tints = parkLampLight.uParkLampTint.value.slice(0, used).map((c) => { const k = 1 / Math.max(c.r, c.g, c.b); return c.clone().multiplyScalar(k).getHexString(); });
    // Out in the parking lot the nearest lamps are its floodlights (8.2 m up).
    place(22, -90, 0); run(10);
    const lot = particleLight.uParkLamps.value.filter((v) => v.w > 0).map((v) => +v.y.toFixed(1));
    P.flashlight = true; run(30);
    const veterans = { intensity: lights().spot.intensity, count: lights().count, point: lights().point };
    // B Hill at night: the headlamp is there and lit.
    await g.startSession('b_hill', true); g.renderer.render = () => {};
    P.daylight = 'night'; P.flashlight = true; s.walking = true; run(90);
    const bhill = { spot: !!lights().spot, intensity: lights().spot?.intensity ?? 0, inScene: !!lights().spot?.parent };
    return { pools, day, power, litPx, unlitPx, lit: lum(litPx), unlit: lum(unlitPx), used, tints, lot, veterans, bhill };
  });
  check('No painted light circles under the lamps', r.pools.length === 0, r.pools);
  check('By day: no lamp light and no headlamp', r.day.power === 0 && r.day.beam < 0.5, r.day);
  check('At night the path lamp really lights the ground under it', r.power > 15 && r.lit > r.unlit * 1.5 + 5, { power: r.power, lit: r.lit, unlit: r.unlit });
  check('Its light is amber: red well above blue', r.litPx[0] > r.litPx[2] * 1.4, { lit: r.litPx, unlit: r.unlitPx });
  check('Every lamp the shaders use is amber, 8 at most', r.used > 0 && r.used <= 8 && r.tints.every((t) => t === 'ff9a3c'), r.tints);
  check('In the parking lot the floodlights light the ground too', r.lot.filter((y) => y > 8).length >= 2, r.lot);
  check('Veterans: headlamp on, and the old headlamp (no bounce light; three lights in all)', r.veterans.intensity > 50 && r.veterans.point === 0 && r.veterans.count <= 3, r.veterans);
  check('B Hill: the headlamp is in the scene and lit at night', r.bhill.spot && r.bhill.inScene && r.bhill.intensity > 50, r.bhill);
  check('No page errors', errors.length === 0, errors);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
