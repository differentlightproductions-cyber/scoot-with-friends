// The phone camera (#77): CAMERA holds the phone up to the eye (first person,
// a viewfinder over the game view). A takes a photo, X records a clip with the
// world's sound, LB / RB zoom, Y opens the gallery, B puts the camera down; the
// sticks still move the rider. Photos and clips live for this session only and
// SAVE TO DEVICE hands the file over (a download here).
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/camera.browser.mjs
import { chromium } from 'playwright';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, acceptDownloads: true }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  const r = await page.evaluate(async () => {
    const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true);
    const cam = g.phoneCamera, phone = g.phone, out = {};
    // A software renderer takes seconds over one frame of the whole park, too slow to feed a video
    // recorder: frames are a cheap clear of the real canvas except for the photo, whose pixels are checked.
    const real = g.renderer.render.bind(g.renderer), gl = g.renderer.getContext();
    const cheap = () => { gl.clearColor(0.25 + Math.random() * 0.1, 0.45, 0.6, 1); gl.clear(gl.COLOR_BUFFER_BIT); };
    const fast = (on) => { g.renderer.render = on ? cheap : real; };
    fast(true);
    const frame = (values = {}) => { const f = { steer: 0, lean: 0, rx: 0, ry: 0, held: {}, pressed: {}, released: {}, ...values }; return f; };
    const renders = (n) => { for (let i = 0; i < n; i++) g.render(); };
    // Frames, not wall time: the phone's animations step once per rendered frame, and a software renderer is slow.
    const until = async (cond, frames = 90) => { for (let i = 0; i < frames && !cond(); i++) { g.render(); await new Promise((r) => setTimeout(r, 20)); } return cond(); };
    g.camera.view = 'third'; g.sim.walking = true; g.advance(0.3);

    // The app: on the home screen, opens to OPEN CAMERA and GALLERY.
    const app = phone.apps.find((a) => a.id === 'camera');
    out.app = app && { label: app.label, icon: app.icon };
    phone.open(); renders(30);
    phone.select('app-camera');
    out.page = JSON.stringify(phone.view?.page() ?? {});
    // OPEN CAMERA puts the phone away and the camera up.
    phone.select('open-camera');
    await until(() => cam.active);
    renders(3);
    out.entered = { active: cam.active, view: g.camera.view, firstPerson: g.camera.firstPersonActive, overlay: !cam.root.hidden, phone: phone.active };

    // The sticks still reach the rider; the face buttons do not.
    const passed = cam.update(frame({ steer: 0.5, lean: -1, rx: 0.3, held: { brake: 1, hop: 1 }, pressed: { hop: false } }), 1 / 60);
    out.passes = { steer: passed.steer, lean: passed.lean, rx: passed.rx, brake: passed.held.brake, hop: passed.held.hop };

    // A: a photo of the game image.
    fast(false);
    cam.update(frame({ pressed: { hop: true } }), 1 / 60);
    out.photoTaken = await until(() => cam.shots.length === 1);
    fast(true);
    const photo = cam.shots[0];
    if (photo) {
      const d = photo.thumb.getContext('2d').getImageData(0, 0, photo.thumb.width, photo.thumb.height).data;
      let sum = 0, sq = 0, n = 0;
      for (let i = 0; i < d.length; i += 16) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += v; sq += v * v; n++; }
      const mean = sum / n;
      out.photo = { kind: photo.kind, type: photo.blob.type, bytes: photo.blob.size, thumb: [photo.thumb.width, photo.thumb.height], name: photo.name, place: photo.place, mean: +mean.toFixed(1), spread: +Math.sqrt(sq / n - mean * mean).toFixed(1) };
    }

    // RB zooms in (the lens narrows), LB back out.
    renders(2);
    const wide = g.camera.camera.fov;
    for (let i = 0; i < 60; i++) cam.update(frame({ held: { rightModifier: 1 } }), 1 / 60);
    renders(2);
    out.zoom = { zoom: +cam.zoom.toFixed(2), wide: +wide.toFixed(1), narrow: +g.camera.camera.fov.toFixed(1) };
    for (let i = 0; i < 120; i++) cam.update(frame({ held: { leftModifier: 1 } }), 1 / 60);
    out.zoomOut = +cam.zoom.toFixed(2);

    // X: a clip, then X again to stop it.
    cam.update(frame({ pressed: { pushDeck: true } }), 1 / 60);
    out.recording = cam.isRecording && !cam.root.querySelector('.pc-rec').hidden;
    const start = performance.now();
    while (performance.now() - start < 2500) { g.advance(1 / 30, {}, false); g.render(); await new Promise((r) => setTimeout(r, 30)); }
    out.recLabel = cam.root.querySelector('.pc-rec span').textContent;
    cam.update(frame({ pressed: { pushDeck: true } }), 1 / 60);
    out.clipAdded = await until(() => cam.shots.length === 2);
    const clip = cam.shots[0];
    if (clip) out.clip = { kind: clip.kind, type: clip.blob.type, bytes: clip.blob.size, seconds: +clip.seconds.toFixed(1), name: clip.name };

    // Y: the camera goes down and the phone opens on the gallery.
    cam.update(frame({ pressed: { body: true } }), 1 / 60);
    renders(30);
    const gallery = phone.view?.page();
    out.gallery = { active: cam.active, view: g.camera.view, phone: phone.active, title: phone.view?.title, rows: gallery?.blocks.find((b) => b.type === 'list')?.rows.map((row) => row.label) ?? [] };
    return out;
  });
  check('The phone has a CAMERA app with its own icon', r.app?.label === 'CAMERA' && r.app.icon === 'camera', r.app);
  check('CAMERA offers OPEN CAMERA and GALLERY, and says the gallery lasts this session', /OPEN CAMERA/.test(r.page) && /GALLERY/.test(r.page) && /until you close the game/.test(r.page), r.page.slice(0, 160));
  check('OPEN CAMERA puts the phone away and looks through the lens (first person, viewfinder shown)', r.entered.active && r.entered.view === 'first' && r.entered.firstPerson && r.entered.overlay && !r.entered.phone, r.entered);
  check('The sticks and brake still reach the rider; A does not', r.passes.steer === 0.5 && r.passes.lean === -1 && r.passes.rx === 0.3 && r.passes.brake === 1 && !r.passes.hop, r.passes);
  check('A takes a photo of the game image (a JPG, not blank)', r.photoTaken && r.photo?.kind === 'photo' && r.photo.type === 'image/jpeg' && r.photo.bytes > 10000 && r.photo.spread > 8 && r.photo.thumb[0] === 360, r.photo);
  check('RB zooms the lens in, LB back out to 1x', r.zoom.zoom > 1.8 && r.zoom.narrow < r.zoom.wide * 0.7 && r.zoomOut === 1, { ...r.zoom, out: r.zoomOut });
  check('X records a clip (REC shown) and X again stops it into the gallery as a video', r.recording && /0:0[1-3]/.test(r.recLabel) && r.clipAdded && r.clip?.kind === 'clip' && /video\//.test(r.clip.type) && r.clip.bytes > 1000 && r.clip.seconds > 1.5, { rec: r.recLabel, clip: r.clip });
  check('Y puts the camera down (view restored) and opens the gallery, newest first', !r.gallery.active && r.gallery.view === 'third' && r.gallery.phone && r.gallery.title === 'GALLERY' && r.gallery.rows[0] === 'CLIP 1' && r.gallery.rows[1] === 'PHOTO 1', r.gallery);

  // SAVE TO DEVICE downloads the file; DELETE removes it.
  const download = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
  const saved = await page.evaluate(async () => {
    const g = window.__LAZER, phone = g.phone, cam = g.phoneCamera;
    const photo = cam.shots.find((s) => s.kind === 'photo');
    phone.select('shot-' + photo.id);
    const page = JSON.stringify(phone.view?.page() ?? {});
    phone.select('save');
    await new Promise((r) => setTimeout(r, 500));
    return { page: /SAVE TO DEVICE/.test(page) && /DELETE/.test(page), saved: photo.saved };
  });
  const file = await download;
  check('SAVE TO DEVICE downloads the photo as a JPG named for the place', saved.page && saved.saved && /\.jpg$/.test(file?.suggestedFilename() ?? ''), { ...saved, file: file?.suggestedFilename() });
  const removed = await page.evaluate(async () => {
    const g = window.__LAZER, phone = g.phone, cam = g.phoneCamera;
    phone.select('delete');
    const sheet = phone.view?.title;
    phone.select('sheet-1');
    for (let i = 0; i < 5; i++) g.render();
    return { sheet, left: cam.shots.map((s) => s.name), title: phone.view?.title };
  });
  check('DELETE asks first, removes the shot and returns to the gallery', removed.sheet === 'DELETE THIS?' && removed.left.length === 1 && removed.left[0] === 'CLIP 1' && removed.title === 'GALLERY', removed);

  // B puts the camera down; a reload empties the gallery (nothing is kept in the browser).
  const done = await page.evaluate(async () => {
    const g = window.__LAZER, cam = g.phoneCamera, phone = g.phone;
    phone.stow(); for (let i = 0; i < 20; i++) g.render();
    cam.enter(); g.render();
    const was = cam.active;
    cam.update({ steer: 0, lean: 0, rx: 0, ry: 0, held: {}, pressed: { brakeBars: true }, released: {} }, 1 / 60);
    return { was, active: cam.active, view: g.camera.view, overlay: !cam.root.hidden };
  });
  check('B puts the camera down and the view comes back', done.was && !done.active && done.view === 'third' && !done.overlay, done);
  await page.reload();
  await page.waitForFunction(() => window.__LAZER?.phoneCamera, null, { timeout: 900000 });
  const after = await page.evaluate(() => window.__LAZER.phoneCamera.shots.length);
  check('Reopening the game starts with an empty gallery', after === 0, { after });
  check('No page errors', errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
