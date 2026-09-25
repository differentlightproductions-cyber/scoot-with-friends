// Lamp light (#75). The park's lamps light what is under them for real, in
// their own colour and falling off with distance and surface angle, instead of
// painted circles on the ground. The headlamp's beam has a shaped pattern,
// casts shadows (ramps and rails block it) except on Low, draws its shadow map
// only while it is on, and bounces a little light back off whatever it hits.
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
    const { parkLampLight } = await import('/src/art/particle-light.ts');
    const P = g.profile.settings, s = g.sim; P.liveSky = false; P.weather = 'sunny';
    const place = (x, z, yaw) => { s.walking = true; s.position.set(x, g.terrainHeight(x, z) + 0.05, z); s.body.setTranslation(s.position, true); s.yaw = yaw; s.previousYaw = yaw; };
    const run = (n) => { for (let i = 0; i < n; i++) { g.advance(1 / 30, {}, false); g.render(); } };
    let spot, bounce; const pools = [];
    g.park.scene.traverse((o) => { if (o.isSpotLight && o.name === 'Rider flashlight') spot = o; if (o.name === 'Headlamp bounce') bounce = o; if (o.name === 'Lamp pool' || (o.isMesh && o.material?.isMeshBasicMaterial && o.visible && o.material.opacity > 0 && /pool/i.test(o.name))) pools.push(o.name); });
    // Daytime: no lamp light.
    P.daylight = 'day'; P.flashlight = true; place(-40, 60, 0); run(60);
    const day = { power: parkLampLight.uParkLampPower.value, beam: spot.intensity, auto: spot.shadow.autoUpdate, bounce: bounce.intensity };
    // Night, headlamp off, rider away: the ground under the path lamp at (-20, 34.3).
    P.daylight = 'night'; P.flashlight = false; run(300);
    const cam = new THREE.PerspectiveCamera(40, 480 / 300, 0.1, 300); cam.position.set(-13, 3, 41); cam.lookAt(-18.5, 0, 34.8); cam.updateMatrixWorld();
    const gl = g.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const lum = (c) => { draw.call(g.renderer, g.park.scene, c); const px = new Uint8Array(4); gl.readPixels(Math.floor(w / 2), Math.floor(h / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return px[0] * 0.3 + px[1] * 0.59 + px[2] * 0.11; };
    const power = parkLampLight.uParkLampPower.value, lit = lum(cam); parkLampLight.uParkLampPower.value = 0; const unlit = lum(cam); parkLampLight.uParkLampPower.value = power;
    const tints = parkLampLight.uParkLampTint.value.slice(0, 7).map((c) => c.getHexString());
    const nightOff = { beam: spot.intensity, auto: spot.shadow.autoUpdate };
    // Headlamp on at the plaza: the beam lands on the concrete ahead and bounces.
    P.flashlight = true; place(-64, 21, Math.PI); run(60);
    const on = { beam: spot.intensity, auto: spot.shadow.autoUpdate, cast: spot.castShadow, map: !!spot.map && spot.map.name, shadowMap: !!spot.shadow.map, size: spot.shadow.mapSize.x, bounce: bounce.intensity, bounceAt: bounce.position.toArray() };
    // A tall block right in front of the lamp: the beam is stopped by it (the bounce comes close).
    const block = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.3), new THREE.MeshStandardMaterial()); block.castShadow = true;
    const ahead = new THREE.Vector3().subVectors(spot.target.position, spot.position).setY(0).normalize();
    block.position.copy(s.position).addScaledVector(ahead, 1.6).setY(s.position.y + 1.5); g.park.scene.add(block); block.updateMatrixWorld();
    const floor = spot.target.position.clone(); floor.y = g.terrainHeight(floor.x, floor.z) + 0.02;
    const beamCam = new THREE.PerspectiveCamera(40, 480 / 300, 0.1, 300); beamCam.position.copy(floor).add(new THREE.Vector3(3, 4, 0)); beamCam.lookAt(floor); beamCam.updateMatrixWorld();
    const blocked = lum(beamCam); block.castShadow = false; const open = lum(beamCam); block.removeFromParent();
    // Low preset: no headlamp shadows; High: a 512 map.
    g.fidelity.apply(g.park.scene, 'low'); const low = spot.castShadow;
    g.fidelity.apply(g.park.scene, 'high'); const high = { cast: spot.castShadow, size: spot.shadow.mapSize.x };
    return { pools, day, power, lit, unlit, tints, nightOff, on, blocked, open, low, high };
  });
  check('No painted light circles left under the lamps', r.pools.length === 0, r.pools);
  check('By day: no lamp light and no headlamp (its shadow map is not drawn)', r.day.power === 0 && r.day.beam < 0.5 && !r.day.auto && r.day.bounce === 0, r.day);
  check('At night the path lamp really lights the ground under it', r.power > 15 && r.lit > r.unlit * 1.5 + 5, { power: r.power, lit: r.lit, unlit: r.unlit });
  check('Path lamps shine warm white, the plaza\'s sodium poles amber', r.tints.slice(0, 5).every((t) => t === 'ffdca0') && r.tints.slice(5).every((t) => t === 'ff9a3c'), r.tints);
  check('Headlamp off: no beam and no shadow drawing', r.nightOff.beam < 0.5 && !r.nightOff.auto, r.nightOff);
  check('Headlamp on: shaped beam pattern, casting shadows, its map drawn while on', r.on.beam > 50 && r.on.cast && r.on.auto && r.on.map === 'Headlamp beam' && r.on.shadowMap, r.on);
  check('The beam bounces a little light back off the ground it hits', r.on.bounce > 0.1 && r.on.bounce < 2, r.on);
  check('Something in front of the lamp blocks its beam (shadow on the ground behind it)', r.blocked < r.open * 0.75, { blocked: r.blocked, open: r.open });
  check('Graphics presets: no headlamp shadows on Low; a 512 map on High', r.low === false && r.high.cast && r.high.size === 512, { low: r.low, high: r.high });
  check('No page errors', errors.length === 0, errors);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
