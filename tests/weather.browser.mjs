// Time of day and weather are separate settings (#40): Sunny, Fall, Snow and
// Rain at any time of day. Rain soaks the ground, clouds the sky, dims the sun
// and brings lightning with thunder after it; Fall drops leaves, gathers litter
// and turns the canopies. Old saves with snow as a time of day migrate.
// #63: storms pace flashes like a medium thunderstorm, ground strikes draw a
// visible channel, thunder waits for the speed of sound; shooting stars on clear nights.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... OUT=artifacts/weather node tests/weather.browser.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186', out = process.env.OUT || 'artifacts/weather';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${ok ? '' : JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'en-US' }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.weather, null, { timeout: 900000 });
  await page.evaluate(async () => { const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true); g.advance(0.5, {}, false); });

  // Run `seconds` of weather and daylight for a setting, then draw one frame from a fixed camera.
  const scene = (weather, time, seconds, name) => page.evaluate(async ({ weather, time, seconds, name }) => {
    const g = window.__LAZER, s = g.sim;
    g.profile.settings.weather = weather; g.profile.settings.daylight = time;
    for (let i = 0; i < seconds * 10; i++) { g.daylight.update(0.1, time, s.position); g.weather.update(0.1, weather, s.position, g.profile.settings.fidelity, { camera: g.camera.camera.position }); }
    const sun = []; g.park.scene.traverse((o) => { if (o.isDirectionalLight) sun.push(o.intensity); });
    const w = g.weather, grp = g.park.scene.getObjectByName('Visual weather');
    const info = { rain: w.rain, autumn: w.autumn, wet: w.wet.value, litter: w.litter.value, snow: w.coverage.value, overcast: g.park.scene.userData.overcast, storm: g.park.scene.userData.storm, sun: sun[0],
      drops: !!grp?.getObjectByName('Rain')?.visible, leaves: !!grp?.getObjectByName('Falling leaves')?.visible };
    if (name) { g.camera.camera.position.set(-18, 7, -52); g.camera.camera.lookAt(0, 1, -20); g.camera.camera.updateMatrixWorld(); g.renderer.render(g.park.scene, g.camera.camera); }
    return info;
  }, { weather, time, seconds, name });
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, timeout: 180000 });

  const sunny = await scene('sunny', 'day', 30, 'sunny-day'); await shot('sunny-day');
  check('Sunny: clear sky, dry ground, nothing falling', sunny.overcast < 0.01 && sunny.wet < 0.01 && !sunny.drops && !sunny.leaves, sunny);

  // Rain: count strikes and thunder while it rains.
  await page.evaluate(() => { const w = window.__LAZER.weather; window.__thunder = []; const prev = w.onThunder; w.onThunder = (d, s, km) => { window.__thunder.push({ d, s, km }); prev?.(d, s, km); }; });
  const rain = await scene('rain', 'day', 40, 'rain-day'); await shot('rain-day');
  const thunder = await page.evaluate(() => window.__thunder);
  check('Rain: streaks fall and the ground soaks through', rain.drops && rain.rain > 0.99 && rain.wet > 0.9, rain);
  check('Rain: storm clouds grey and darken the sky; the sun dims', rain.overcast > 0.99 && rain.storm > 0.99 && rain.sun < sunny.sun * 0.5, { rain: rain.sun, sunny: sunny.sun });
  check('Rain: lightning flashes; thunder follows at the speed of sound (2.9 s a km), 1-15 km off', thunder.length >= 1 && thunder.every((t) => Math.abs(t.d - t.km * 2.9) < 1e-6 && t.km >= 1 && t.km <= 15 && t.s >= 0.1 && t.s <= 1), thunder);
  // The flash lights the scene through the park's ambient light; no extra light joins every shader.
  await page.evaluate(() => { const g = window.__LAZER; let hemi = null; g.park.scene.traverse((o) => { if (!hemi && o.isHemisphereLight) hemi = o; }); window.__ambient = () => hemi.intensity / 4.2; for (let i = 0; i < 30; i++) g.daylight.update(0.1, 'day', g.sim.position); window.__ambientBase = window.__ambient(); });
  const lights = await page.evaluate(() => { let n = 0; window.__LAZER.park.scene.traverse((o) => { if (o.isLight) n++; }); return n; });
  // Sun, sky, the headlamp and its bounce (#75): four, and never more.
  check('Rain adds no lights: the park keeps its light count (every shader pays for each light)', lights <= 4, lights);
  const flash = await page.evaluate(() => { const g = window.__LAZER, w = g.weather, s = g.sim; w.strike(true, 1.2); let peak = 0; for (let i = 0; i < 20; i++) { w.update(0.02, 'rain', s.position, g.profile.settings.fidelity, {}); g.daylight.update(0.02, 'day', s.position); peak = Math.max(peak, Math.min(g.park.scene.userData.lightning, window.__ambient() - window.__ambientBase)); } return peak; });
  check('Rain: a strike flashes the scene and the cloud deck', flash > 0.9, flash);
  // A ground strike draws its channel in the sky, flickering with the return strokes, then it is gone.
  const bolt = await page.evaluate(() => {
    const g = window.__LAZER, w = g.weather, s = g.sim, ev = g.park.scene.userData.sky.events, before = ev.bolts;
    w.strike(true, 3); let seen = false, peak = 0, dips = 0, last = 0;
    for (let i = 0; i < 60; i++) {
      w.update(0.01, 'rain', s.position, g.profile.settings.fidelity, {}); g.daylight.update(0.01, 'day', s.position);
      const a = ev.coreMaterial.uniforms.uAlpha.value; seen ||= ev.showing.bolt; peak = Math.max(peak, a); if (a < last - 0.3) dips++; last = a;
    }
    for (let i = 0; i < 80; i++) { w.update(0.02, 'rain', s.position, g.profile.settings.fidelity, {}); g.daylight.update(0.02, 'day', s.position); }
    return { made: ev.bolts - before, seen, peak, dips, gone: !ev.showing.bolt };
  });
  check('A ground strike draws a lightning channel that flickers and goes', bolt.made === 1 && bolt.seen && bolt.peak > 0.8 && bolt.gone, bolt);
  // Ten minutes of storm: a medium thunderstorm's pace, about a third of flashes to the ground.
  const pace = await page.evaluate(() => {
    const g = window.__LAZER, w = g.weather, s = g.sim, ev = g.park.scene.userData.sky.events, keep = w.onThunder, strikes = w.strikes, bolts = ev.bolts, gaps = [];
    let at = 0, prev = null; w.onThunder = () => { if (prev !== null) gaps.push(at - prev); prev = at; };
    for (let i = 0; i < 12000; i++) { at += 0.05; w.update(0.05, 'rain', s.position, g.profile.settings.fidelity, {}); }
    w.onThunder = keep;
    const n = w.strikes - strikes;
    return { perMinute: n / 10, ground: +((ev.bolts - bolts) / n).toFixed(2), shortest: Math.min(...gaps), longest: Math.max(...gaps) };
  });
  check('Storm pace: 2-6 flashes a minute, 4-40 s apart, about a third reach the ground', pace.perMinute >= 2 && pace.perMinute <= 6 && pace.shortest >= 3.9 && pace.longest <= 40.1 && pace.ground > 0.15 && pace.ground < 0.5, pace);
  // A picture of a strike ahead of the camera, at its brightest.
  await page.evaluate(() => {
    const g = window.__LAZER, w = g.weather, s = g.sim, ev = g.park.scene.userData.sky.events, cam = g.camera.camera;
    cam.position.set(-18, 7, -52); cam.lookAt(0, 1, -20); cam.updateMatrixWorld(); g.renderer.render(g.park.scene, cam);
    const ahead = Math.atan2(ev.view.x, ev.view.z);
    w.strike(true, 3.5); ev.strike(3500, ahead + 0.15);
    for (let i = 0; i < 3; i++) { w.update(0.01, 'rain', s.position, g.profile.settings.fidelity, {}); g.daylight.update(0.01, 'day', s.position); }
    g.renderer.render(g.park.scene, cam);
  });
  await shot('rain-lightning');
  const rainNight = await scene('rain', 'night', 20, 'rain-night'); await shot('rain-night');
  check('Rain works at night too', rainNight.drops && rainNight.wet > 0.9, rainNight);

  const fall = await scene('fall', 'day', 30, 'fall-day'); await shot('fall-day');
  check('Fall: leaves drift down and litter gathers; the rain dries off', fall.leaves && fall.autumn > 0.99 && fall.litter > 0.9 && !fall.drops && fall.wet < rain.wet, fall);
  const foliage = await page.evaluate(() => { let key = null; window.__LAZER.park.scene.traverse((o) => { const m = o.material; if (!key && m?.name?.includes('foliage') && m.customProgramCacheKey) key = m.customProgramCacheKey(); }); return key; });
  check('Fall: tree and plant foliage takes the autumn shading', /swf-weather-v5-foliage/.test(foliage ?? ''), foliage);
  await scene('fall', 'sunset', 10, 'fall-sunset'); await shot('fall-sunset');

  const snow = await scene('snow', 'day', 60, 'snow-day'); await shot('snow-day');
  check('Snow: still snows and settles as before', snow.snow > 0.9 && !snow.leaves && snow.overcast > 0.99, snow);
  // A clear night: now and then a shooting star, rarer than the storm's visible strikes.
  await scene('sunny', 'night', 30);
  const meteors = await page.evaluate(() => {
    const g = window.__LAZER, s = g.sim, sky = g.park.scene.userData.sky, ev = sky.events, before = ev.meteors;
    for (let i = 0; i < 3600; i++) sky.step(0.5);
    const perHalfHour = ev.meteors - before;
    // One in flight, for the picture.
    ev.shootingStar(() => 0.17); for (let i = 0; i < 12; i++) sky.step(0.03);
    const cam = g.camera.camera, d = ev.meteor.start; cam.position.set(0, 2, 0); cam.lookAt(d.x * 100, 2 + d.y * 100, d.z * 100); cam.updateMatrixWorld();
    g.renderer.render(g.park.scene, cam);
    return { perHalfHour, flying: ev.showing.meteor };
  });
  await shot('clear-night-shooting-star');
  check('Clear nights: a shooting star every one to three minutes (rarer than visible strikes)', meteors.perHalfHour >= 8 && meteors.perHalfHour <= 32 && meteors.flying, meteors);
  const clear = await scene('sunny', 'day', 20);
  check('Back to Sunny: the storm and snow clear away', clear.overcast < 0.01 && clear.storm < 0.01 && !clear.drops && !clear.leaves, clear);

  // The real settings controls: separate TIME OF DAY and WEATHER rows, saved and restored on reload.
  await page.evaluate(() => { const g = window.__LAZER; g.profile.settings.weather = 'sunny'; g.profile.settings.daylight = 'day'; g.menu.openSesh('settings-time', 'outdoor'); });
  await page.waitForSelector('.game-menu');
  const labels = [];
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: /^WEATHER/ }).click();
    labels.push({ stored: await page.evaluate(() => window.__LAZER.menu.profile.settings.weather), visible: await page.getByRole('button', { name: /^WEATHER/ }).locator('span').textContent() });
  }
  await page.getByRole('button', { name: /^TIME OF DAY/ }).click();
  const time = { stored: await page.evaluate(() => window.__LAZER.menu.profile.settings.daylight), visible: await page.getByRole('button', { name: /^TIME OF DAY/ }).locator('span').textContent() };
  check('Settings: WEATHER cycles Fall, Snow, Rain; TIME OF DAY is its own row', labels.every((v, i) => v.stored === ['fall','snow','rain'][i] && v.visible?.trim() === `WEATHER ${['FALL','SNOW','RAIN'][i]}`) && time.stored === 'sunset' && time.visible?.trim() === 'TIME OF DAY SUNSET', { labels, time });
  await page.locator('button', { hasText: 'APPLY / SAVE CHANGES' }).first().click();
  await page.reload(); await page.waitForFunction(() => window.__LAZER?.profile, null, { timeout: 900000 });
  const saved = await page.evaluate(() => window.__LAZER.profile.settings);
  check('Rain at sunset persists after reload', saved.weather === 'rain' && saved.daylight === 'sunset', { weather: saved.weather, daylight: saved.daylight });

  // #44 HEADLAMP and #48 MATCH BOULDER CITY NOW: their own rows; live mode shows the city's time and weather.
  await page.evaluate(() => { window.__LAZER.menu.openSesh('settings-time', 'outdoor'); });
  await page.waitForSelector('.game-menu');
  await page.getByRole('button', { name: /^HEADLAMP/ }).click();
  const torch = await page.getByRole('button', { name: /^HEADLAMP/ }).textContent();
  await page.getByRole('button', { name: /^MATCH BOULDER CITY NOW/ }).click();
  const live = { match: await page.getByRole('button', { name: /^MATCH BOULDER CITY NOW/ }).textContent(), time: await page.getByRole('button', { name: /^TIME OF DAY/ }).textContent(), weather: await page.getByRole('button', { name: /^WEATHER/ }).textContent() };
  check('Flashlight turns off; MATCH BOULDER CITY NOW shows the live time and weather', /HEADLAMP OFF/.test(torch ?? '') && /NOW ON/.test(live.match ?? '') && /LIVE · (DAY|SUNSET|NIGHT|SUNRISE)/.test(live.time ?? '') && /LIVE · (SUNNY|FALL|SNOW|RAIN)/.test(live.weather ?? ''), { torch, live });
  await page.getByRole('button', { name: /^APPLY \/ SAVE CHANGES/ }).first().click();
  await page.reload(); await page.waitForFunction(() => window.__LAZER?.profile, null, { timeout: 900000 });
  const kept = await page.evaluate(() => window.__LAZER.profile.settings);
  check('Flashlight and live sky are saved', kept.flashlight === false && kept.liveSky === true, { flashlight: kept.flashlight, liveSky: kept.liveSky });

  // An old save with snow as the time of day opens as snowy weather in the daytime.
  await page.evaluate(async () => { const { PROFILE_KEY } = await import('/src/data/loadout.ts'); const raw = JSON.parse(localStorage.getItem(PROFILE_KEY)); raw.settings.daylight = 'snow'; delete raw.settings.weather; localStorage.setItem(PROFILE_KEY, JSON.stringify(raw)); });
  await page.reload(); await page.waitForFunction(() => window.__LAZER?.profile, null, { timeout: 900000 });
  const migrated = await page.evaluate(() => window.__LAZER.profile.settings);
  check('An old "snow" time of day becomes Snow weather by day', migrated.daylight === 'day' && migrated.weather === 'snow', { weather: migrated.weather, daylight: migrated.daylight });

  await page.evaluate(async () => { const g = window.__LAZER; g.testing(true); await g.startSession('techno_gravity', true); for (let i = 0; i < 20; i++) g.weather.update(0.2, 'rain', g.sim.position, g.profile.settings.fidelity); });
  check('Indoors (the shop) stays dry and clear', await page.evaluate(() => !window.__LAZER.park.scene.getObjectByName('Visual weather')?.visible && !(window.__LAZER.park.scene.userData.storm > 0)));
  check('No page errors', errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
