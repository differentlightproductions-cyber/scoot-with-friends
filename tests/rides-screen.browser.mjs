// Rides screen: SCOOTER / LONGBOARD are the big choices (A rides the focused
// one, X customizes it), focusing only previews (never equips), the preview
// frames the focused ride, and saving a build stamps PRESET SAVED.
//
//   LAZER_URL=http://127.0.0.1:5174 CHROME_PATH=... OUT=artifacts/rides node tests/rides-screen.browser.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.env.LAZER_URL || 'http://127.0.0.1:5174';
const out = process.env.OUT || 'artifacts/rides';
mkdirSync(out, { recursive: true });
const results = [];
const check = (label, ok, detail) => { results.push({ label, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail ?? '')}`); };

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.menu, null, { timeout: 900000 });
  const frames = async (n = 3) => {
    const start = await page.evaluate(() => window.__LAZER.renderer.info.render.frame);
    await page.waitForFunction(([s, k]) => window.__LAZER.renderer.info.render.frame >= s + k, [start, n], { timeout: 180000, polling: 50 });
  };
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, timeout: 180000 });
  await page.evaluate(async () => {
    const { emptyInput } = await import('/src/input/input.ts');
    window.__rides = {
      press: (key) => { const f = emptyInput(); if (key) { f.pressed[key] = true; f.held[key] = 1; } window.__LAZER.menu.update(f, 0.1); window.__LAZER.menu.update(emptyInput(), 0.1); },
      state: () => { const m = window.__LAZER.menu; return { screen: m.screen, index: m.index, labels: m.choices.map((c) => c.label), board: m.previewRider.board.visible, scooter: m.previewRider.scooter.visible, active: window.__LAZER.profile.activeRideable, subtitle: document.querySelector('#menu .subtitle, #menu h2 + p, #menu small')?.textContent ?? '' }; },
    };
  });
  const state = () => page.evaluate(() => window.__rides.state());

  // 1. The screen: two big choices first, then the builds.
  await page.evaluate(() => { const m = window.__LAZER.menu; m.show('rides'); m.index = 0; m.render?.(); });
  await frames();
  let s = await state();
  const before = s.active;
  check('Rides lists SCOOTER and LONGBOARD first, then the two builds', s.labels.slice(0, 4).join('|') === 'SCOOTER|LONGBOARD|CUSTOMIZE SCOOTER|CUSTOMIZE LONGBOARD', s.labels);
  check('Scooter focused: the preview shows the scooter, not the board', s.scooter && !s.board, s);
  await shot('rides-scooter');

  // 2. Focusing the longboard only previews it: nothing is equipped.
  await page.evaluate(() => window.__rides.press('menuDown'));
  await frames();
  s = await state();
  check('Down focuses LONGBOARD and previews the board', s.index === 1 && s.board, s);
  check('Previewing does not equip (active ride unchanged)', s.active === before, { before, after: s.active });
  await shot('rides-longboard');

  // 3. X customizes the focused ride; B comes back.
  await page.evaluate(() => window.__rides.press('pushDeck'));
  s = await state();
  check('X on LONGBOARD opens the longboard build', s.screen === 'longboard', s.screen);
  await page.evaluate(() => { window.__rides.press('brakeBars'); });
  s = await state();
  check('B returns to Rides', s.screen === 'rides', s.screen);
  await page.evaluate(() => { const m = window.__LAZER.menu; m.index = 0; window.__rides.press('pushDeck'); });
  s = await state();
  check('X on SCOOTER opens the scooter build (or the starter builder first)', s.screen === 'scooter' || s.screen.startsWith('starter'), s.screen);
  await page.evaluate(() => { const m = window.__LAZER.menu; m.show('rides'); m.index = 0; });

  // 4. A rides the focused ride (the scooter here: already owned).
  await page.evaluate(() => window.__rides.press('hop'));
  await page.waitForTimeout(600);
  s = await state();
  check('A on SCOOTER rides the scooter', s.active === 'scooter', s);

  // 5. Saving a build stamps PRESET SAVED over the preview.
  // A fresh profile builds its starter scooter before it can equip parts, so the
  // stamp is raised the way a successful save raises it (Menu.presetSaved,
  // called from equip() and applySesh()) over the Rides preview.
  const stamp = await page.evaluate(async () => {
    const m = window.__LAZER.menu;
    m.show('rides'); m.index = 0;
    m.presetSaved('scooter');
    // Measure once the stamp-in animation has settled (software rendering can
    // make frames slower than the 0.32 s animation, so wait on it, not a timer).
    const el = document.querySelector('.preset-stamp');
    await Promise.all((el?.getAnimations() ?? []).map((a) => a.finished));
    const r = el?.getBoundingClientRect();
    const label = document.querySelector('#start .preview-frame .pf-label')?.getBoundingClientRect();
    const overlapsLabel = !!r && !!label && label.width > 0 && r.left < label.right && r.right > label.left && r.top < label.bottom && r.bottom > label.top;
    return { text: el?.textContent ?? null, box: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null, onScreen: !!r && r.width > 0 && r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, overlapsLabel };
  });
  if (stamp.text) await shot('preset-saved');
  check('Saving a build shows the PRESET SAVED stamp, on screen, clear of the preview label', /PRESET SAVED/.test(stamp.text ?? '') && stamp.onScreen && !stamp.overlapsLabel, stamp);

  // 6. Phone width: the stamp still fits inside the viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = await page.evaluate(async () => {
    const m = window.__LAZER.menu;
    m.presetSaved('both');
    const el = document.querySelector('.preset-stamp');
    await Promise.all((el?.getAnimations() ?? []).map((a) => a.finished));
    const r = el?.getBoundingClientRect();
    return { box: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null, onScreen: !!r && r.width > 0 && r.x >= 0 && r.right <= innerWidth };
  });
  await shot('preset-saved-phone');
  check('At phone width the stamp stays inside the viewport', narrow.onScreen, narrow);
  check('No page errors', errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
