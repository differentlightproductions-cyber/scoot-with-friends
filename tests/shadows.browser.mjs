// Sun shadows (#73). The shadow camera stands 70 m back along the light, so
// roofs and trees cast shadows (it once collapsed to 1 m and clipped every
// shadow taller than half a metre); the frustum follows the rider in whole
// shadow-map texels across the light's view, so still shadows never crawl or
// jump as the rider moves or climbs.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/shadows.browser.mjs
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
    g.profile.settings.daylight = 'day'; g.profile.settings.liveSky = false; g.profile.settings.weather = 'sunny';
    const draw = g.renderer.render; g.renderer.render = () => {};
    const s = g.sim; s.walking = true; s.position.set(-24, 0.05, -35); s.body.setTranslation(s.position, true);
    for (let i = 0; i < 90; i++) { g.advance(1 / 60, {}, false); g.render(); }
    const THREE = await import('/node_modules/three/build/three.module.js');
    let sun; g.park.scene.traverse((o) => { if (o.isDirectionalLight) sun = o; });
    sun.updateMatrixWorld(); sun.target.updateMatrixWorld(); sun.shadow.updateMatrices(sun);
    const distance = sun.position.distanceTo(sun.target.position);
    // The pavilion at (-28, -40): its roof peak, 5 m up, is inside the shadow camera's box.
    const peak = new THREE.Vector3(-28, 5, -40).project(sun.shadow.camera).toArray();
    // Beside the pavilion, just outside the roof on its lee side, from a camera
    // outside it: the ground there with the roof casting its shadow, and without.
    const dir = sun.position.clone().sub(sun.target.position).normalize();
    const lee = new THREE.Vector3(-28 - Math.sign(dir.x) * 4.4, 0.02, -40 - Math.sign(dir.z) * 3.0);
    const cam = new THREE.PerspectiveCamera(40, 480 / 300, 0.1, 300);
    cam.position.set(lee.x - Math.sign(dir.x) * 7, 3, lee.z - Math.sign(dir.z) * 7); cam.lookAt(lee); cam.updateMatrixWorld();
    const gl = g.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const lum = () => { draw.call(g.renderer, g.park.scene, cam); const px = new Uint8Array(4); gl.readPixels(Math.floor(w / 2), Math.floor(h / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return px[0] * 0.3 + px[1] * 0.59 + px[2] * 0.11; };
    const roof = []; g.park.scene.traverse((o) => { if (o.isMesh && /roof shingles|pavilion soffit/.test(o.material.name)) roof.push(o); });
    const underRoof = lum();
    roof.forEach((m) => { m.castShadow = false; });
    const open = lum();
    roof.forEach((m) => { m.castShadow = true; });
    // Light-space snapping: the target's position across the light is a whole number of texels.
    const toLight = dir, right = new THREE.Vector3(0, 1, 0).cross(toLight).normalize(), up = toLight.clone().cross(right);
    const texel = (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x, grid = [];
    for (const p of [[-24.013, 0.05, -35.02], [-24.3, 0.9, -35.4], [-23.71, 1.77, -34.9]]) {
      g.fidelity.update(new THREE.Vector3(...p), 1 / 60);
      const t = sun.target.position;
      grid.push([t.dot(right) / texel, t.dot(up) / texel].map((v) => Math.abs(v - Math.round(v))));
    }
    return { distance, peak, underRoof, open, grid, texel };
  });
  check('The sun\'s shadow camera stands 70 m back along the light', Math.abs(r.distance - 70) < 0.5, r.distance);
  check('A 5 m roof peak is inside the shadow camera\'s box', r.peak.every((v) => v > -1 && v < 1), r.peak);
  check('The pavilion roof casts its shadow: the ground beside it darkens when the roof casts, and not without', r.underRoof < r.open * 0.7, { underRoof: r.underRoof, open: r.open });
  check('The shadow frustum moves only in whole texels across the light, even as the rider climbs', r.grid.every((g) => g.every((v) => v < 1e-3)), r);
  check('No page errors', errors.length === 0, errors);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
