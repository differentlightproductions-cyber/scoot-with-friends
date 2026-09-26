// The hologram mini editor (#66): the phone's RIDES and RIDER apps project a
// small see-through panel beside the rider; LS changes a part or look and the
// rider in the world changes at once, A saves, B puts it all back; the camera
// swings round to the rider's front while it is up, and the rider gets no input.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/hologram.browser.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186';
mkdirSync('artifacts/hologram66', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  const r = await page.evaluate(async () => {
    const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true);
    const { emptyInput } = await import('/src/input/input.ts');
    const f = (o = {}) => { const e = emptyInput(); return { ...e, ...o, pressed: { ...e.pressed, ...(o.pressed ?? {}) } }; };
    const step = (frame, n = 1) => { for (let i = 0; i < n; i++) g.holo.step(frame, 1 / 30); };
    const out = {};
    // Standing still, facing +z.
    g.sim.reset(0, true); g.advance(0.5, {}, false); g.render();
    const before = structuredClone(g.profile.avatar);
    // ---- RIDER
    g.openHolo('rider');
    const panel = document.querySelector('#holo');
    out.open = { visible: !panel.hidden, rows: panel.querySelectorAll('li').length, title: panel.querySelector('header strong')?.textContent, view: g.camera.view, showcase: g.camera.showcase };
    step(f(), 6); // past the opening guard
    // Down to HAIR, then right: the hair changes on the rider now, not in the save.
    step(f({ lean: 1 })); step(f(), 2); step(f({ steer: 1 })); step(f(), 2);
    out.preview = { rider: g.rider.root.userData.avatar?.hairStyle, saved: g.profile.avatar.hairStyle, was: before.hairStyle, row: panel.querySelector('li.on b')?.textContent };
    // The camera swings round to the rider's front.
    for (let i = 0; i < 90; i++) g.render();
    const cam = g.camera.camera.position, p = g.sim.position, fwd = { x: Math.sin(g.sim.yaw), z: Math.cos(g.sim.yaw) };
    out.camera = { front: +((cam.x - p.x) * fwd.x + (cam.z - p.z) * fwd.z).toFixed(2), dist: +Math.hypot(cam.x - p.x, cam.z - p.z).toFixed(2) };
    window.__shot = true;
    return out;
  });
  check('RIDER opens a hologram panel with its rows', r.open.visible && r.open.rows >= 8 && r.open.title === 'RIDER', r.open);
  check('It forces third person and the showcase camera', r.open.view === 'third' && r.open.showcase, r.open);
  check('LS changes the look on the rider in the world at once, without saving', r.preview.rider !== r.preview.was && r.preview.saved === r.preview.was && r.preview.row === 'HAIR', r.preview);
  check('The camera swings round to face the rider', r.camera.front > 1.2 && r.camera.dist < 5, r.camera);
  await page.screenshot({ path: 'artifacts/hologram66/rider.png', animations: 'disabled', timeout: 240000 }).catch((e) => console.log('screenshot skipped:', e.message.split('\n')[0]));
  const r2 = await page.evaluate(async () => {
    const g = window.__LAZER, { emptyInput } = await import('/src/input/input.ts');
    const f = (o = {}) => { const e = emptyInput(); return { ...e, ...o, pressed: { ...e.pressed, ...(o.pressed ?? {}) } }; };
    const out = {}, was = g.profile.avatar.hairStyle;
    // B puts it back.
    g.holo.step(f({ pressed: { brakeBars: true } }), 1 / 30);
    out.cancel = { active: g.holo.active, rider: g.rider.root.userData.avatar?.hairStyle, saved: g.profile.avatar.hairStyle, was, view: g.camera.view, showcase: g.camera.showcase };
    // Again, and A keeps it.
    g.openHolo('rider');
    for (let i = 0; i < 6; i++) g.holo.step(f(), 1 / 30);
    g.holo.step(f({ lean: 1 }), 1 / 30); g.holo.step(f(), 1 / 30); g.holo.step(f({ steer: 1 }), 1 / 30); g.holo.step(f(), 1 / 30);
    const chosen = g.rider.root.userData.avatar?.hairStyle;
    g.holo.step(f({ pressed: { hop: true } }), 1 / 30);
    const { loadProfile } = await import('/src/data/loadout.ts');
    out.apply = { active: g.holo.active, chosen, saved: g.profile.avatar.hairStyle, stored: loadProfile().avatar.hairStyle };
    // ---- RIDE: one row per scooter part; the rider gets no input while it is up.
    g.openHolo('ride');
    const panel = document.querySelector('#holo');
    out.ride = { rows: panel.querySelectorAll('li').length, title: panel.querySelector('header strong')?.textContent, first: panel.querySelector('li b')?.textContent };
    // X switches to the rider page and back.
    for (let i = 0; i < 6; i++) g.holo.step(f(), 1 / 30);
    g.holo.step(f({ pressed: { pushDeck: true } }), 1 / 30);
    out.swap = panel.querySelector('header strong')?.textContent;
    g.holo.step(f({ pressed: { brakeBars: true } }), 1 / 30);
    out.closed = g.holo.active;
    // Phone rows: RIDES and RIDER open the hologram, the full editors stay in the main menu.
    g.phone.open(); for (let i = 0; i < 30; i++) g.phoneStep({}, 1 / 30);
    g.phone.select('app-rides'); await new Promise((r) => setTimeout(r, 30));
    out.phoneRide = g.phone.select('holo-ride');
    for (let i = 0; i < 40; i++) g.phoneStep({}, 1 / 30);
    out.phoneOpened = { active: g.holo.active, mode: g.holo.mode };
    g.holo.close(false);
    return out;
  });
  check('B cancels: the look goes back and nothing is saved', !r2.cancel.active && r2.cancel.rider === r2.cancel.was && r2.cancel.saved === r2.cancel.was, r2.cancel);
  check('Closing restores the camera', r2.cancel.view === 'third' && !r2.cancel.showcase, r2.cancel);
  check('A applies and saves the new look', !r2.apply.active && r2.apply.saved === r2.apply.chosen && r2.apply.stored === r2.apply.chosen, r2.apply);
  check('RIDE lists every scooter part', r2.ride.rows >= 9 && r2.ride.title === 'SCOOTER' && r2.ride.first === 'DECK', r2.ride);
  check('X switches between RIDE and RIDER', r2.swap === 'RIDER', r2.swap);
  check('The phone RIDES app opens the hologram', r2.phoneRide && r2.phoneOpened.active && r2.phoneOpened.mode === 'ride', r2);
  check('No page errors', errors.length === 0, errors);
} finally { await browser.close(); }
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
