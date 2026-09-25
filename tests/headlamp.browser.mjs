// Headlamp (#64): at night with the setting on, the rider wears a headlamp and its
// beam leaves the lamp along the head's facing (it turns with the head); in first
// person it follows the eye camera. By day, or with the setting off, it is not worn.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/headlamp.browser.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186', out = process.env.OUT || 'artifacts/headlamp';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  await page.evaluate(async () => { const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true); g.__draw = g.renderer.render; g.renderer.render = () => {}; });
  const state = (phase, on, view = 'third') => page.evaluate(({ phase, on, view }) => {
    const g = window.__LAZER, s = g.sim; g.profile.settings.daylight = phase; g.profile.settings.flashlight = on; g.profile.settings.liveSky = false; g.camera.view = view;
    s.walking = true; s.position.set(-6, 0.05, 8); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true); s.yaw = 0.8; s.previousYaw = s.yaw;
    for (let i = 0; i < 40; i++) { g.advance(1 / 60, {}, true); g.render(); }
    const light = g.park.scene.getObjectByName('Rider flashlight'), lamp = g.rider.avatar.headlamp, head = lamp.housing.getWorldPosition(light.position.clone());
    const dir = light.target.position.clone().sub(light.position).normalize(), facing = lamp.housing.getWorldDirection(head.clone());
    return { worn: lamp.group.visible, intensity: +light.intensity.toFixed(1), fromLamp: +light.position.distanceTo(head).toFixed(3), fromEye: +light.position.distanceTo(g.camera.camera.position).toFixed(3), alongHead: +dir.dot(facing).toFixed(3), alongEye: +dir.dot(g.camera.camera.getWorldDirection(head.clone())).toFixed(3) };
  }, { phase, on, view });
  const day = await state('day', true), off = await state('night', false), night = await state('night', true), eye = await state('night', true, 'first');
  check('By day, or switched off, no headlamp is worn', !day.worn && !off.worn, { day, off });
  check('At night it is worn, lit, and the beam leaves the lamp along the head', night.worn && night.intensity > 20 && night.fromLamp < 0.01 && night.alongHead > 0.99, night);
  check('In first person the beam follows the eye camera', eye.fromEye < 0.01 && eye.alongEye > 0.99, eye);
  // Pictures: the lamp on the head, and the beam on the ground ahead.
  const shots = await page.evaluate(async () => {
    const g = window.__LAZER, s = g.sim; g.camera.view = 'third';
    for (let i = 0; i < 20; i++) { g.advance(1 / 60, {}, true); g.render(); }
    g.renderer.render = g.__draw;
    const cam = g.camera.camera, head = g.rider.avatar.head.getWorldPosition(cam.position.clone()), f = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) };
    const snap = (from, at) => { cam.position.copy(from); cam.lookAt(at); cam.updateMatrixWorld(); g.renderer.render(g.park.scene, cam); return g.renderer.domElement.toDataURL('image/jpeg', 0.88); };
    const close = snap(head.clone().add({ x: f.x * 0.9 + f.z * 0.5, y: 0.1, z: f.z * 0.9 - f.x * 0.5 }), head);
    const wide = snap(head.clone().add({ x: -f.x * 3.2 + f.z * 1.2, y: 1.2, z: -f.z * 3.2 - f.x * 1.2 }), head.clone().add({ x: f.x * 6, y: -1.4, z: f.z * 6 }));
    return { close, wide };
  });
  for (const [k, v] of Object.entries(shots)) writeFileSync(`${out}/${k}.jpg`, Buffer.from(v.split(',')[1], 'base64'));
  check('No page errors', errors.length === 0, errors.slice(0, 3));
} finally { await browser.close(); }
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
