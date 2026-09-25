// Replays (#41): the rolling history records rider state; CAPTURE REPLAY opens
// the editor with it; trims, both cameras, save, reopen, rename, export and
// delete work; playback never moves the live rider.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... OUT=artifacts/replay node tests/replay.browser.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186', out = process.env.OUT || 'artifacts/replay';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${ok ? '' : JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.replay, null, { timeout: 900000 });
  console.log('Renderer:', await page.evaluate(() => { const gl = window.__LAZER.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); }));

  // Ride a line: push off, up the back quarter, an air, back down, part of it in first person.
  // Frames are recorded by the game's own render step; drawing is stubbed while riding to keep it quick.
  const ride = await page.evaluate(async () => {
    const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true);
    const s = g.sim; // a new session builds a new Simulation
    g.profile.settings.replayHistory = 30;
    const real = g.renderer.render; g.renderer.render = () => {};
    s.position.set(4, 0.3, 8); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true); s.yaw = 0; s.previousYaw = 0;
    const step = (n, f = {}) => { for (let i = 0; i < n; i++) g.advance(1 / 30, f, true); };
    step(15);
    for (let i = 0; i < 6; i++) step(8, { pressed: { pushDeck: true }, held: { pushDeck: 1 } });
    let peak = 0; g.camera.view = 'first';
    for (let i = 0; i < 90; i++) { g.advance(1 / 30, {}, true); peak = Math.max(peak, s.position.y); }
    g.camera.view = 'third';
    step(45);
    g.renderer.render = real;
    return { peak, elapsed: s.elapsed, samples: g.replayBuffer.samples.length, duration: g.replayBuffer.duration, bytes: g.replayBuffer.bytes, views: [...new Set(g.replayBuffer.samples.map((f) => f.view))] };
  });
  check('The history records the ride at 30 samples a second, in both views', ride.samples > 150 && Math.abs(ride.samples / ride.duration - 30) < 2 && ride.views.includes('first') && ride.views.includes('third'), ride);
  const perMinute = Math.round(ride.bytes / ride.duration * 60 / 1024);
  check(`Memory: about ${perMinute} KB for a 60 s history`, perMinute < 3000, perMinute);

  const opened = await page.evaluate(() => {
    const g = window.__LAZER, s = g.sim, before = s.position.toArray();
    const ok = g.captureReplay(); const r = g.replay;
    return { ok, open: r.open, duration: r.duration, trim: r.trim, before, liveHidden: !g.rider.root.visible, hud: document.body.classList.contains('replay-open') };
  });
  check('CAPTURE REPLAY opens the editor with the whole history', opened.ok && opened.open && Math.abs(opened.duration - ride.duration) < 0.1 && Math.abs(opened.trim.length - opened.duration) < 0.01, opened);
  check('The live rider and the HUD step aside while it is open', opened.liveHidden && opened.hud, opened);

  // Third person, then first person, at the top of the air.
  const views = await page.evaluate(async () => {
    const { decodePoses } = await import('/src/replay/buffer.ts');
    const g = window.__LAZER, r = g.replay, frames = g.replayBuffer.samples, poses = decodePoses(frames);
    const top = poses.reduce((best, p, i) => (p.position[1] > poses[best].position[1] ? i : best), 0), t = frames[top].t - frames[0].t;
    const place = (view) => { r.setView(view); r.seek(t); for (let i = 0; i < 6; i++) { r.seek(t); r.draw(1 / 30); } const cam = r.player.camera.camera.position, p = poses[top].position; return { view: r.camera, dist: Math.hypot(cam.x - p[0], cam.y - p[1], cam.z - p[2]), first: r.player.camera.firstPersonActive }; };
    const third = place('third'); const thirdShot = g.renderer.domElement.toDataURL('image/jpeg', 0.8);
    const first = place('first'); const firstShot = g.renderer.domElement.toDataURL('image/jpeg', 0.8);
    const back = place('third');
    return { t, third, first, back, thirdShot, firstShot, live: g.sim.position.toArray() };
  });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`${out}/third-person.jpg`, Buffer.from(views.thirdShot.split(',')[1], 'base64'));
  writeFileSync(`${out}/first-person.jpg`, Buffer.from(views.firstShot.split(',')[1], 'base64'));
  await page.screenshot({ path: `${out}/editor.png`, timeout: 180000 }).catch(() => {});
  check('Third person frames the rider from behind', views.third.dist > 2.5 && views.third.dist < 9 && !views.third.first, views.third);
  check('First person replays from the rider\'s eyes (a third-person line switched to first)', views.first.first && views.first.dist < 1.6, views.first);
  check('And back to third person', views.back.dist > 2.5 && !views.back.first, views.back);
  check('Playback never moves the live rider', views.live.every((v, i) => Math.abs(v - opened.before[i]) < 1e-6), { live: views.live, before: opened.before });

  // Trim, save, reopen, rename.
  const saved = await page.evaluate(async () => {
    const g = window.__LAZER, r = g.replay;
    r.setTrim(1, 5); r.setView('first');
    // Playback time only: drawing is stubbed (each frame of the park takes a while in a software renderer).
    const real = g.renderer.render; g.renderer.render = () => {};
    for (let i = 0; i < 200; i++) r.draw(1 / 30);
    g.renderer.render = real;
    const inside = r.time >= 1 - 1e-6 && r.time <= 5 + 1e-6;
    const saveStart = performance.now(), id = await r.save(), saveMs = performance.now() - saveStart;
    const list = await r.store.list();
    return { id, saveMs, inside, trim: r.trim, list: list.map((m) => ({ name: m.name, trimIn: m.trimIn, trimOut: m.trimOut, camera: m.camera, map: m.map, thumb: !!m.thumbnail })) };
  });
  check('Trimming keeps playback inside IN-OUT (1-5 s: a 4 s clip)', saved.inside && Math.abs(saved.trim.length - 4) < 1e-6, saved);
  check('SAVE stores it with its map, trim, camera and a thumbnail', saved.id && saved.list.length === 1 && saved.list[0].name === 'Veterans Memorial Park - Replay 01' && saved.list[0].trimIn === 1 && saved.list[0].camera === 'first' && saved.list[0].thumb, saved.list);
  console.log(`SAVE ${saved.saveMs.toFixed(0)} ms`);
  const reopened = await page.evaluate(async (id) => {
    const r = window.__LAZER.replay; r.close(); const closed = !r.open && window.__LAZER.rider.root.visible;
    await r.openSaved(id, 'edit');
    const state = { open: r.open, trim: r.trim, camera: r.camera, duration: r.duration };
    await r.rename(id, '  Church   Flair Line ');
    return { closed, state, name: (await r.store.list())[0].name };
  }, saved.id);
  check('Closing brings the live rider back; the saved replay reopens with its trim and camera', reopened.closed && reopened.state.open && Math.abs(reopened.state.trim.in - 1) < 1e-6 && reopened.state.camera === 'first', reopened);
  check('RENAME tidies and keeps the name', reopened.name === 'Church Flair Line', reopened.name);

  // Export the trimmed clip, where the browser can record the canvas.
  const exp = await page.evaluate(async () => {
    const r = window.__LAZER.replay; r.setView('third');
    const supported = r.constructor.canExport(window.__LAZER.renderer.domElement);
    if (!supported) return { supported };
    // Cheap frames: a software renderer takes seconds over one frame of the park, too slow to feed the recorder.
    const g = window.__LAZER, gl = g.renderer.getContext(), real = g.renderer.render;
    g.renderer.render = () => { gl.clearColor(0.2 + Math.random() * 0.1, 0.4, 0.6, 1); gl.clear(gl.COLOR_BUFFER_BIT); };
    const started = r.startExport(), t0 = performance.now();
    while (window.__replayExport === undefined && performance.now() - t0 < 20000) { r.draw(1 / 30); await new Promise((q) => setTimeout(q, 34)); }
    g.renderer.render = real;
    return { supported, started, result: window.__replayExport ?? null, elapsedMs: performance.now() - t0 };
  });
  check('EXPORT VIDEO writes the trimmed clip as a video file (or reports it unsupported)', !exp.supported || (exp.started && exp.result?.bytes > 1000), exp);
  console.log(`EXPORT ${exp.elapsedMs?.toFixed(0) ?? 'unsupported'} ms, ${exp.result?.bytes ?? 0} bytes`);

  // Library: list, then delete.
  const lib = await page.evaluate(async (id) => {
    const r = window.__LAZER.replay; await r.openLibrary();
    const rows = document.querySelectorAll('.re-library li').length;
    await r.remove(id);
    const after = (await r.store.list()).length;
    r.close();
    return { rows, after, closed: !r.open };
  }, saved.id);
  await page.screenshot({ path: `${out}/library-empty.png`, timeout: 60000 }).catch(() => {});
  check('The library lists it; DELETE removes it', lib.rows === 1 && lib.after === 0 && lib.closed, lib);

  // Where to find it: the pause menu, the phone, and the history setting.
  const entry = await page.evaluate(() => ({
    pause: ['capture-replay', 'replays'].every((a) => !!document.querySelector(`#pause [data-action="${a}"]`)),
    phone: window.__LAZER.phone.apps.some((a) => a.id === 'replays' && a.label === 'REPLAYS'),
  }));
  check('CAPTURE REPLAY and REPLAYS are in the Sesh (pause) menu and the phone has a REPLAYS app', entry.pause && entry.phone, entry);
  await page.evaluate(() => { const g = window.__LAZER; g.profile.settings.replayHistory = 45; g.menu.openSesh('settings-gameplay', 'outdoor'); });
  await page.waitForSelector('.game-menu');
  await page.getByRole('button', { name: /^REPLAY HISTORY/ }).click();
  const label = await page.getByRole('button', { name: /^REPLAY HISTORY/ }).textContent();
  await page.getByRole('button', { name: /^APPLY \/ SAVE CHANGES/ }).first().click();
  // The library lasts for the session (#77): keep one, reload, and it is gone; nothing is left in IndexedDB.
  await page.evaluate(async () => {
    const r = window.__LAZER.replay, id = 'kept-for-reload';
    await r.store.put({ meta: { id, name: 'Kept', createdAt: Date.now(), map: 'outdoor', mapName: 'Veterans', rideable: 'scooter', trimIn: 0, trimOut: 1, camera: 'third', thumbnail: null }, clip: { frames: [] } });
  });
  const keptBefore = await page.evaluate(async () => (await window.__LAZER.replay.store.list()).length);
  await page.reload(); await page.waitForFunction(() => window.__LAZER?.profile, null, { timeout: 900000 });
  const session = await page.evaluate(async () => ({ kept: (await window.__LAZER.replay.store.list()).length, databases: (await indexedDB.databases?.() ?? []).map((d) => d.name) }));
  check('Replays last for the session: reopening the game starts an empty library, nothing kept in the browser', keptBefore === 1 && session.kept === 0 && !session.databases.includes('swf-replays'), { keptBefore, ...session });
  const history = await page.evaluate(() => window.__LAZER.profile.settings.replayHistory);
  check('Settings / Gameplay: REPLAY HISTORY steps 15-30-45-60 and is saved', /60 SEC/.test(label ?? '') && history === 60, { label, history });
  check('No page errors', errors.length === 0, errors.slice(0, 4));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
