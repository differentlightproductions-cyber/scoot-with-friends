// Settings audit (#26): every category and option, read off the real menu, with
// no option in two places; navigation by touch/mouse (clicks), keyboard and the
// controller's input path (menu.update with the frames a pad produces); B backs
// out exactly one level and focus comes back to the row you left; the focused row
// is always scrolled into view; menu presses never reach the rider; and every
// setting changed here is still set after a reload.
//   LAZER_URL=http://127.0.0.1:5195 CHROME_PATH=... node tests/settings-audit.browser.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail === '' ? '' : ' ' + JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const base = process.env.LAZER_URL || 'http://127.0.0.1:5186';
  await page.goto(base + '/');
  await page.waitForFunction(() => window.__LAZER?.menu && document.querySelector('#start .main-tabs'), null, { timeout: 900000 });
  const heading = () => page.locator('#start .game-menu h1').textContent();
  const rows = () => page.evaluate(() => [...document.querySelectorAll('#start .game-menu nav button')].map((b) => b.querySelector('strong,b,span')?.textContent?.trim() || b.innerText.split('\n')[0].trim()));
  const focused = () => page.evaluate(() => { const b = document.querySelector('#start .game-menu nav button.selected'); return b ? b.innerText.split('\n')[0].trim() : null; });
  // Touch / mouse: the SETTINGS tab, then every category by clicking it.
  await page.locator('[data-tab="settings"]').click();
  check('SETTINGS opens', (await heading()) === 'SETTINGS', await heading());
  const categories = await rows();
  console.log('CATEGORIES', JSON.stringify(categories));
  const language = await page.evaluate(() => { const b = document.querySelector('#start .game-menu nav button'); return { text: b.innerText.split('\n')[0], color: getComputedStyle(b).backgroundColor }; });
  check('The 🌐 LANGUAGE entry is first, in #00C2FF', /🌐/.test(language.text) && language.color === 'rgb(0, 194, 255)', language);
  const inventory = {};
  // Software rendering makes a frame slow: wait for real frames, so the game's loop
  // has sampled the key while it is down and handled it before anything is read.
  await page.evaluate(() => { let n = 0; const tick = () => { window.__frame = ++n; requestAnimationFrame(tick); }; tick(); });
  const frames = async (count) => { const now = await page.evaluate(() => window.__frame); await page.waitForFunction((t) => window.__frame >= t, now + count, { timeout: 60000 }); };
  const press = async (key, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.down(key); await frames(2); await page.keyboard.up(key); await frames(2); } };
  const count = categories.filter((c) => c !== 'BACK').length;
  for (let i = 1; i < count; i++) {
    const name = categories[i];
    await page.locator('#start .game-menu nav button').nth(i).click();
    const title = await heading();
    inventory[title] = (await rows()).filter((r) => !/^(BACK|APPLY)/.test(r));
    await press('KeyB');
    const back = await heading(), row = await focused();
    if (back !== 'SETTINGS' || row !== name) check(`B from ${title} returns to SETTINGS on ${name}`, false, { back, row });
    else results.push(true);
  }
  for (const [title, options] of Object.entries(inventory)) console.log('  ' + title + ': ' + options.join(' | '));
  check('Every category opens by click, and B returns to SETTINGS on that same row', results.every(Boolean));
  // No option in two places.
  const stem = (s) => s.replace(/\s+(ON|OFF|\d+.*|LOW|MEDIUM|HIGH|NORMAL|GOOFY|PRO|ARCADE|THIRD.*|FIRST.*|REDUCED|FULL|RIGHT|LEFT|AUTO|SMALL|LARGE|DAY|SUNSET|NIGHT|SUNRISE|SUNNY|FALL|SNOW|RAIN|WINDOWED|BORDERLESS.*|FULLSCREEN|CAMCORDER)$/i, '').trim();
  const seen = new Map(), dupes = [];
  for (const [title, options] of Object.entries(inventory)) for (const o of options) { const k = stem(o); if (seen.has(k) && !/HELP|TRICK|LANGUAGE/.test(title)) dupes.push(`${k}: ${seen.get(k)} + ${title}`); seen.set(k, title); }
  check('No setting appears in two categories', dupes.length === 0, dupes);
  check('MOUNT CAMERA lives under CAMERA', (inventory.CAMERA ?? []).some((o) => /MOUNT CAMERA/.test(o)) && !Object.entries(inventory).some(([t, o]) => t !== 'CAMERA' && o.some((x) => /MOUNT CAMERA/.test(x))));
  // Keyboard: W/S move, Space selects, B backs out one level at a time.
  check('Only one category is about CONTROLS', categories.filter((c) => /CONTROLS/.test(c)).length === 1, categories);
  const to = async (label) => { for (let i = 0; i < 20 && (await focused()) !== label; i++) await press('KeyS'); return (await focused()) === label; };
  const riding = categories.find((c) => /RIDING/.test(c));
  await to(riding); await press('Space');
  const ridingTitle = await heading();
  const test = (await rows()).find((r) => /TEST/.test(r));
  await to(test); await press('Space');
  const inTest = await page.evaluate(() => window.__LAZER.menu.screen);
  await press('KeyB'); const up1 = await heading(), up1Row = await focused();
  await press('KeyB'); const up2 = await heading(), up2Row = await focused();
  check('Keyboard: into RIDING & CONTROLS, into the controller test, B, B', inTest === 'test-controller' && up1 === ridingTitle && up1Row === test && up2 === 'SETTINGS' && up2Row === riding, { inTest, up1, up1Row, up2, up2Row });
  // Controller: the same frames a pad produces (LS/D-pad down, A, B), through menu.update.
  const pad = (f) => page.evaluate((f) => { const g = window.__LAZER, m = g.menu; const frame = { steer: 0, lean: 0, rx: 0, ry: 0, held: {}, pressed: {}, released: {} }; for (const k of Object.keys(g.input.frame?.held ?? { hop: 0, brakeBars: 0, menuDown: 0, marker: 0, menuLeft: 0, menuRight: 0, pause: 0, pushDeck: 0, brake: 0, pumpGrind: 0, leftModifier: 0, rightModifier: 0 })) { frame.held[k] = 0; frame.pressed[k] = false; frame.released[k] = false; } Object.assign(frame, f.axes ?? {}); Object.assign(frame.held, f.held ?? {}); Object.assign(frame.pressed, f.pressed ?? {}); m.update(frame, 1 / 60); m.update({ ...frame, lean: 0, held: Object.fromEntries(Object.keys(frame.held).map((k) => [k, 0])), pressed: Object.fromEntries(Object.keys(frame.pressed).map((k) => [k, false])) }, 1 / 60); }, f);
  const audio = categories.find((c) => /AUDIO/.test(c));
  for (let i = 0; i < 20 && (await focused()) !== audio; i++) await pad({ held: { menuDown: 1 } });
  await pad({ pressed: { hop: true } });
  const padIn = await heading();
  const audioRows = (await rows()).length;
  for (let i = 0; i < audioRows - 1; i++) await pad({ axes: { lean: 1 } });
  const visible = await page.evaluate(() => {
    const b = document.querySelector('#start .game-menu nav button.selected'); if (!b) return null;
    const r = b.getBoundingClientRect(); let box = b.parentElement;
    while (box && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight + 1)) box = box.parentElement;
    const v = box ? box.getBoundingClientRect() : { top: 0, bottom: innerHeight };
    return { row: b.innerText.split('\n')[0], inside: r.top >= v.top - 1 && r.bottom <= v.bottom + 1 && r.bottom <= innerHeight, scrolls: !!box };
  });
  await pad({ pressed: { brakeBars: true } });
  check('Controller: D-pad/LS to AUDIO, A opens it, B backs out one level', padIn === 'AUDIO' && (await heading()) === 'SETTINGS' && (await focused()) === audio, { padIn, back: await heading() });
  check('The focused row stays in view at the bottom of a long page', visible?.inside, visible);
  // A short window makes every settings page scroll: each row, focused, is in view.
  await page.setViewportSize({ width: 800, height: 420 });
  const hidden = [];
  for (let i = 1; i < count; i++) {
    await page.evaluate((i) => { const m = window.__LAZER.menu; m.show('settings'); }, i);
    await page.locator('#start .game-menu nav button').nth(i).click();
    const n = (await rows()).length, title = await heading();
    for (let k = 0; k < n; k++) {
      const v = await page.evaluate(() => { const b = document.querySelector('#start .game-menu nav button.selected'); if (!b) return true; const r = b.getBoundingClientRect(); let box = b.parentElement; while (box && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight + 1)) box = box.parentElement; const t = box ? box.getBoundingClientRect() : { top: 0, bottom: innerHeight }; return r.top >= t.top - 1 && r.bottom <= Math.min(t.bottom, innerHeight) + 1; });
      if (!v) hidden.push(`${title} row ${k}`);
      await pad({ axes: { lean: 1 } });
    }
    await pad({ pressed: { brakeBars: true } });
  }
  check('In an 800x420 window, every row of every page is in view when focused', hidden.length === 0, hidden.slice(0, 5));
  await page.setViewportSize({ width: 960, height: 600 });
  // Persistence: change one option in each category through the menu, then reload.
  const before = await page.evaluate(() => JSON.parse(JSON.stringify(window.__LAZER.profile.settings)));
  const tap = async (category, option) => {
    await page.evaluate(() => window.__LAZER.menu.show('settings'));
    await page.locator('#start .game-menu nav button', { hasText: category }).first().click();
    await page.locator('#start .game-menu nav button', { hasText: option }).first().click();
  };
  await tap('RIDING', 'PRESET');
  await tap('CAMERA', 'CAMERA VIEW');
  await tap('CAMERA', 'MOUNT CAMERA');
  await tap('GRAPHICS', 'UI COLORS');
  await tap('TIME', 'TIME OF DAY');
  await tap('GAMEPLAY', 'REPLAY');
  await tap('AUDIO', 'MASTER');
  await tap('PHONE', 'HAND');
  await tap('ACCESSIBILITY', 'SIZE');
  const after = await page.evaluate(() => JSON.parse(JSON.stringify(window.__LAZER.profile.settings)));
  const keys = ['stance', 'cameraView', 'mountFlourish', 'uiPalette', 'daylight', 'replayHistory', 'phoneHand', 'touchSize'];
  const changed = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  const masterChanged = before.volumes.master !== after.volumes.master;
  check('One option in each category changes its setting', changed.length === keys.length && masterChanged, { unchanged: keys.filter((k) => !changed.includes(k)), masterChanged });
  await page.reload();
  await page.waitForFunction(() => window.__LAZER?.menu && document.querySelector('#start .main-tabs'), null, { timeout: 900000 });
  await page.evaluate(() => { let n = 0; const tick = () => { window.__frame = ++n; requestAnimationFrame(tick); }; tick(); });
  const reloaded = await page.evaluate(() => JSON.parse(JSON.stringify(window.__LAZER.profile.settings)));
  const lost = [...keys, 'volumes'].filter((k) => JSON.stringify(reloaded[k]) !== JSON.stringify(after[k]));
  check('Every change is still set after a reload', lost.length === 0, lost.map((k) => [k, after[k], reloaded[k]]));
  check('The retired grind assist toggle is gone from saved settings', !('grindAssist' in reloaded));
  // No input leaks: in a session, the pause menu's settings take Space/B/Escape; the rider never hops or brakes.
  await page.evaluate(async () => { const g = window.__LAZER; await g.startSession('outdoor', false); });
  await page.locator('#destination-loading').waitFor({ state: 'hidden', timeout: 600000 }).catch(() => {});
  await page.evaluate(() => { const g = window.__LAZER; g.renderer.render = () => {}; g.sim.reset(0, true); window.__events = []; g.events.on((e) => { if (['pop', 'trick', 'landing', 'bail'].includes(e.type)) window.__events.push(e.type); }); });
  await page.waitForTimeout(500);
  const still = await page.evaluate(() => { const g = window.__LAZER; return { y: g.sim.position.y, v: g.sim.velocity.length() }; });
  await press('Escape');
  const pauseOpen = await page.evaluate(() => !document.querySelector('#pause')?.hidden);
  await press('Escape');
  await page.evaluate(() => window.__LAZER.menu.openSesh('settings', 'outdoor'));
  await press('KeyS', 2); await press('Space'); await press('Space'); await press('KeyB'); await press('KeyB');
  for (let i = 0; i < 4 && await page.evaluate(() => window.__LAZER.menu.seshOpen || !document.querySelector('#pause')?.hidden); i++) await press('Escape');
  await frames(10);
  const leak = await page.evaluate(() => { const g = window.__LAZER; return { events: window.__events, y: g.sim.position.y, v: g.sim.velocity.length(), seshOpen: g.menu.seshOpen }; });
  check('Menu presses in a session never reach the rider (no pop, trick, bail; no movement)', pauseOpen && leak.events.length === 0 && Math.abs(leak.y - still.y) < 0.02 && leak.v < 0.2, { pauseOpen, still, leak });
  check('No page errors', errors.length === 0, errors.slice(0, 3));
  await page.evaluate((s) => { const g = window.__LAZER; Object.assign(g.profile.settings, s); }, before);
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
