// DISPLAY setting (#60): Windowed -> Borderless Windowed -> Fullscreen -> Windowed.
// A click switches at once; a switch without a click or key (a gamepad press) waits
// for the next one; leaving fullscreen through the browser sets it back to Windowed.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/display-mode.browser.mjs
import { chromium } from 'playwright';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /SETTINGS/ }).first().click();
  await page.getByRole('button', { name: /^GRAPHICS/ }).click();
  const row = page.getByRole('button', { name: /^DISPLAY/ });
  const state = () => page.evaluate(() => ({ full: !!document.fullscreenElement, saved: JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /profile/i.test(k)) ?? '') ?? 'null')?.settings?.displayMode }));
  check('The row starts on WINDOWED', /DISPLAY WINDOWED/.test(await row.innerText()) && !(await state()).full, await row.innerText());
  await row.click(); await page.waitForTimeout(300);
  let s = await state();
  check('A click switches to Borderless Windowed and the page fills the screen', /BORDERLESS WINDOWED/.test(await row.innerText()) && s.full && s.saved === 'borderless', s);
  await row.click(); await page.waitForTimeout(300);
  s = await state();
  check('Next: Fullscreen, still full screen', /DISPLAY FULLSCREEN/.test(await row.innerText()) && s.full && s.saved === 'fullscreen', s);
  await row.click(); await page.waitForTimeout(300);
  s = await state();
  check('Next: back to Windowed, the frame returns', /DISPLAY WINDOWED/.test(await row.innerText()) && !s.full && s.saved === 'windowed', s);

  // A gamepad-style switch (no click): it waits, says so, and a later key press applies it.
  // (Fired from a timer after the last activation has expired, like a gamepad press.)
  await page.evaluate(() => setTimeout(() => [...document.querySelectorAll('.game-menu button')].find((b) => /^DISPLAY/.test(b.innerText))?.click(), 5600));
  await page.waitForTimeout(6200);
  const note = await page.locator('.game-menu').innerText();
  s = await state();
  check('Without a click it waits and asks for one', !s.full && /press any key to switch/i.test(note), { s, note: note.match(/[^\n]*press any key[^\n]*/i)?.[0] });
  await page.keyboard.press('Shift'); await page.waitForTimeout(300);
  s = await state();
  check('The next key press applies it', s.full && s.saved === 'borderless', s);

  // Leaving through the browser (Esc in Borderless) sets the setting back to Windowed.
  await page.evaluate(() => document.exitFullscreen()); await page.waitForTimeout(300);
  s = await state();
  check('Leaving through the browser sets it back to Windowed', !s.full && s.saved === 'windowed' && /DISPLAY WINDOWED/.test(await row.innerText()), s);

  // A reload with a saved Fullscreen starts on the first click.
  await row.click(); await row.click(); await page.waitForTimeout(200);
  await page.reload({ waitUntil: 'networkidle' });
  s = await state();
  const before = s.full;
  await page.mouse.click(5, 5); await page.waitForTimeout(300);
  s = await state();
  check('A saved Fullscreen comes back on the first click after a reload', !before && s.full && s.saved === 'fullscreen', { before, s });
  check('No page errors', errors.length === 0, errors.slice(0, 3));
} finally { await browser.close(); }
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
