import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const folder = 'artifacts/crate-inventory';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11'] });
const checks = [];
const check = (name, condition, detail) => { checks.push({ name, pass: !!condition, detail }); console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + JSON.stringify(detail) : ''}`); };
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.LAZER_URL ?? 'http://127.0.0.1:5184', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__LAZER?.rewards?.openAll, { timeout: 30000 });
  if (await page.locator('#mobile-start button').isVisible()) await page.locator('#mobile-start button').click();
  await page.locator('#mobile-start').waitFor({ state: 'hidden' });
  const earned = await page.evaluate(async () => {
    const g = window.__LAZER;
    g.testing(true);
    // Enough for three mission crates since crates were made rarer (#76).
    await g.economy.track({ tricks: 600, grinds: 120, bestLine: 12 });
    const crates = g.profile.progress.crates;
    const rows = id => g.phone.apps.find(app => app.id === id).open().page().blocks.flatMap(block => block.rows ?? []);
    const inventory = rows('items').find(row => row.id === 'crate-inventory');
    inventory?.action();
    const itemRows = g.phone.view?.page().blocks.flatMap(block => block.rows ?? []) ?? [];
    const missionRows = rows('missions');
    return { crates: crates.map(c => c.id), overlay: g.rewards.open, itemLink: !!inventory, missionLink: missionRows.some(row => row.id === 'crate-inventory'), oneRows: itemRows.filter(row => row.id.startsWith('crate-')).length, allRow: itemRows.some(row => row.id === 'open-all-crates') };
  });
  check('earned crates stay in inventory without opening a blocking overlay', earned.crates.length >= 3 && !earned.overlay, earned);
  check('ITEMS and MISSIONS expose shared one/open-all inventory', earned.itemLink && earned.missionLink && earned.oneRows === earned.crates.length && earned.allRow, earned);
  await page.waitForFunction(() => !!document.querySelector('.reward-toast.crate-added'), { timeout: 30000 });
  check('earning shows a compact CRATE ADDED toast', await page.locator('.reward-toast.crate-added').count() > 0);

  const first = earned.crates[0];
  const failedTap = await page.evaluate(async id => {
    const g = window.__LAZER, real = g.economy.openCrate.bind(g.economy);
    const crate = g.profile.progress.crates.find(c => c.id === id);
    g.rewards.openCrate(crate);
    g.economy.openCrate = async () => 'Temporary save failure';
    await g.rewards.tap(); await g.rewards.tap();
    g.economy.openCrate = real;
    return { hint: document.querySelector('.crate-hint')?.textContent, count: g.profile.progress.crates.length, taps: g.rewards.crateState?.taps };
  }, first);
  check('failed second tap keeps the crate and allows retry', failedTap.count === earned.crates.length && failedTap.taps === 1 && /RETRY/.test(failedTap.hint), failedTap);
  const opened = await page.evaluate(async () => {
    const g = window.__LAZER;
    await g.rewards.tap();
    g.rewards.closeOverlay(); // Back after the successful second tap must show the committed reward.
    const s = JSON.parse(localStorage.getItem('lazer-profile-v1'));
    const card = document.querySelector('.crate-card');
    const canvas = card.querySelector('canvas');
    return { count: s.progress.crates.length, opened: s.progress.stats.cratesOpened, part: canvas?.dataset.partId, variant: canvas?.dataset.variantId, owned: s.wallet.owned, equipment: JSON.stringify(s.scooter), canvas: !!canvas, stillOpen: g.rewards.open };
  });
  check('Back after committed tap reveals the real part instead of losing it', opened.count === earned.crates.length - 1 && opened.opened === 1 && opened.stillOpen && opened.canvas && opened.owned.includes(`${opened.part}:${opened.variant}`), opened);
  const equipped = await page.evaluate(async () => {
    const button = [...document.querySelectorAll('.crate-actions button')].find(b => b.textContent === 'EQUIP NOW');
    if (!button) { window.__LAZER.rewards.closeOverlay(); return { available: false }; }
    button.click();
    await new Promise(resolve => setTimeout(resolve, 350));
    const s = JSON.parse(localStorage.getItem('lazer-profile-v1'));
    return { available: true, equipment: s.scooter, open: window.__LAZER.rewards.open };
  });
  check('EQUIP NOW uses the real revealed part when available', !equipped.available || (!equipped.open && Object.values(equipped.equipment).some(s => s.partId === opened.part && s.variantId === opened.variant)), equipped);

  const partial = await page.evaluate(async () => {
    const g = window.__LAZER, crates = [...g.profile.progress.crates], real = g.economy.openCrate.bind(g.economy);
    let calls = 0;
    g.economy.openCrate = id => ++calls === 2 ? Promise.resolve('Temporary batch failure') : real(id);
    await g.rewards.openAll(crates);
    g.economy.openCrate = real;
    const s = JSON.parse(localStorage.getItem('lazer-profile-v1'));
    return { before: crates.length, left: s.progress.crates.length, opened: s.progress.stats.cratesOpened, calls, error: document.querySelector('.crate-batch-error')?.textContent, result: document.querySelector('.crate-card strong')?.textContent };
  });
  check('Open All stops on failure and preserves unopened crates', partial.calls === 2 && partial.left === partial.before - 1 && partial.opened === 2 && /Unopened crates remain/.test(partial.error), partial);
  await page.evaluate(() => window.__LAZER.rewards.closeOverlay());
  const all = await page.evaluate(async () => {
    const g = window.__LAZER, crates = [...g.profile.progress.crates], before = JSON.stringify(JSON.parse(localStorage.getItem('lazer-profile-v1')).scooter), real = g.economy.openCrate.bind(g.economy);
    let calls = 0;
    g.economy.openCrate = id => { calls++; return real(id); };
    await Promise.all([g.rewards.openAll(crates), g.rewards.openAll(crates)]);
    g.economy.openCrate = real;
    const s = JSON.parse(localStorage.getItem('lazer-profile-v1'));
    return { requested: crates.length, calls, left: s.progress.crates.length, opened: s.progress.stats.cratesOpened, before, after: JSON.stringify(s.scooter), resultCount: g.rewards.openedResults.length };
  });
  check('Open All ignores duplicate input and leaves equipped parts unchanged', all.calls === all.requested && all.left === 0 && all.opened === earned.crates.length && all.resultCount === all.requested && all.before === all.after, all);
  await page.evaluate(() => document.querySelectorAll('.reward-toast').forEach(el => el.remove()));
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 740 });
    await page.waitForTimeout(1200);
    const bounds = await page.evaluate(() => {
      const root = document.querySelector('.crate-overlay');
      const elements = [...root.querySelectorAll('.crate-card,.crate-actions button,.crate-card canvas')].filter(el => el.getClientRects().length);
      return { overflow: document.documentElement.scrollWidth - innerWidth, clipped: elements.filter(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(el => el.className || el.tagName), preview: !!root.querySelector('.cc-preview canvas[data-part-id][data-variant-id]') };
    });
    check(`${width}px result card and controls fit portrait`, bounds.overflow <= 1 && bounds.clipped.length === 0 && bounds.preview, bounds);
    await page.screenshot({ path: `${folder}/result-${width}.png` });
  }
  const reviewed = await page.evaluate(() => {
    const g = window.__LAZER, seen = [];
    for (;;) {
      seen.push(document.querySelector('.cc-preview canvas')?.dataset.partId + ':' + document.querySelector('.cc-preview canvas')?.dataset.variantId);
      const next = [...document.querySelectorAll('.crate-actions button')].find(button => button.textContent.startsWith('NEXT RESULT'));
      if (!next) break;
      next.click();
    }
    const saved = JSON.parse(localStorage.getItem('lazer-profile-v1'));
    return { seen, opened: saved.progress.stats.cratesOpened, left: saved.progress.crates.length, index: g.rewards.openedIndex };
  });
  check('NEXT RESULT reviews cached parts without a second transaction', reviewed.seen.length === all.requested && reviewed.opened === earned.crates.length && reviewed.left === 0 && reviewed.index === all.requested - 1, reviewed);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__LAZER?.profile);
  check('opened inventory stays empty after reload', await page.evaluate(() => window.__LAZER.profile.progress.crates.length === 0));
  check('no page errors', errors.length === 0, errors);
  await context.close();
} finally { await browser.close(); }
await writeFile(`${folder}/results.json`, JSON.stringify(checks, null, 2));
const failures = checks.filter(check => !check.pass).length;
console.log(`${checks.length - failures}/${checks.length} crate inventory checks passed`);
if (failures) process.exitCode = 1;
