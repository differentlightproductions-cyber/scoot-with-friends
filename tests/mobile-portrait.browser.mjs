import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = process.env.LAZER_URL ?? 'http://127.0.0.1:5184';
const output = 'artifacts/mobile-portrait';
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sizes = [[390, 844], [360, 740]];
const menuScreens = [
  'home', 'play', 'maps', 'settings', 'settings-language', 'settings-riding',
  'settings-camera', 'settings-graphics', 'settings-time',
  'settings-gameplay', 'settings-audio', 'settings-phone', 'settings-touch',
  'guide', 'tricks', 'test-controller',
];
const results = [];
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--use-angle=d3d11'] });
try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/account/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: null }) }));
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__LAZER?.menu?.screen, { timeout: 30000 });
    const gate = page.locator('#mobile-start button');
    if (await gate.isVisible()) await gate.click();
    await page.locator('#mobile-start').waitFor({ state: 'hidden', timeout: 10000 });
    const folder = `${output}/${width}x${height}`;
    await mkdir(folder, { recursive: true });

    async function capture(name, setup, selector) {
      try {
        await setup();
        await page.locator(selector).waitFor({ state: 'visible', timeout: 10000 });
        if (name === 'crate-revealed') {
          await page.locator('.crate-actions button').first().waitFor({ state: 'visible', timeout: 5000 });
          await page.waitForTimeout(1600);
        }
        if (name === 'shop') {
          await page.waitForTimeout(3000);
          await page.evaluate(() => document.querySelectorAll('.reward-toast,.level-up').forEach(el => el.remove()));
        }
        // Let fonts and layout settle before measuring the final frame.
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(80);
        const audit = await page.evaluate(async rootSelector => {
          const root = document.querySelector(rootSelector);
          const width = innerWidth;
          const visible = element => {
            const s = getComputedStyle(element);
            const r = element.getBoundingClientRect();
            return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && r.width > 0 && r.height > 0;
          };
          const describe = element => `${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}${element.className && typeof element.className === 'string' ? '.' + element.className.trim().replace(/\s+/g, '.') : ''}: ${(element.textContent || '').trim().slice(0, 55)}`;
          const candidates = [...root.querySelectorAll('button,input,select,textarea,h1,h2,h3,.game-menu,.pause-sheet,.crate-stage,.crate-card,.shop-strip')].filter(visible);
          const clipped = candidates.flatMap(element => {
            const r = element.getBoundingClientRect();
            return r.left < -1 || r.right > width + 1 ? [{ element: describe(element), left: Math.round(r.left), right: Math.round(r.right) }] : [];
          });
          const unreachable = [];
          const controls = [...root.querySelectorAll('button,input,select,textarea')].filter(visible);
          for (const element of controls) {
            element.scrollIntoView({ block: 'center', inline: 'nearest' });
            await new Promise(resolve => requestAnimationFrame(resolve));
            const r = element.getBoundingClientRect();
            const x = Math.max(0, Math.min(width - 1, r.left + r.width / 2));
            const y = Math.max(0, Math.min(innerHeight - 1, r.top + r.height / 2));
            const hit = document.elementFromPoint(x, y);
            if (r.bottom < 1 || r.top > innerHeight - 1 || r.right < 1 || r.left > width - 1 || !(element === hit || element.contains(hit))) {
              unreachable.push({ element: describe(element), top: Math.round(r.top), bottom: Math.round(r.bottom), hit: describe(hit ?? document.body) });
            }
          }
          return { documentWidth: document.documentElement.scrollWidth, viewportWidth: width, clipped, unreachable, controls: controls.length };
        }, selector);
        await page.evaluate(rootSelector => {
          const root = document.querySelector(rootSelector);
          for (const el of [root, ...root.querySelectorAll('*')]) if (el.scrollTop) el.scrollTop = 0;
        }, selector);
        await page.screenshot({ path: `${folder}/${name}.png`, fullPage: false });
        results.push({ size: `${width}x${height}`, screen: name, ...audit, error: name === 'crate-revealed' && !audit.controls ? 'No revealed crate controls' : undefined });
        console.log(`${width}x${height} ${name}: ${audit.clipped.length} clipped, ${audit.unreachable.length} unreachable, document ${audit.documentWidth}px, ${audit.controls} controls`);
      } catch (error) {
        results.push({ size: `${width}x${height}`, screen: name, error: String(error) });
        console.error(`${width}x${height} ${name}: ${error}`);
      }
    }

    for (const screen of menuScreens) {
      await capture(screen, () => page.evaluate(screen => {
        const menu = window.__LAZER.menu;
        menu.root.hidden = false;
        menu.show(screen);
      }, screen), '#start');
    }
    await capture('account-login', () => page.evaluate(() => { void window.__LAZER.menu.accountPanel.open(); }), '#account-dialog');
    await capture('account-register', () => page.locator('#account-dialog .account-actions button').filter({ hasText: 'Create an account' }).click(), '#account-dialog');
    await capture('account-recovery', () => page.locator('#account-dialog .account-actions button').filter({ hasText: 'Forgot password' }).click(), '#account-dialog');
    await page.evaluate(() => window.__LAZER.menu.accountPanel.dialog.close());
    await capture('pause', () => page.evaluate(() => {
      window.__LAZER.menu.root.hidden = true;
      window.__LAZER.testing(true);
      window.__LAZER.hud.setPaused(true);
    }), '#pause .pause-sheet');
    await capture('sesh-settings', () => page.evaluate(() => {
      document.querySelector('#pause').hidden = true;
      window.__LAZER.menu.openSesh('settings', 'outdoor');
    }), '#start');
    await capture('crate', () => page.evaluate(async () => {
      window.__LAZER.menu.root.hidden = true;
      await window.__LAZER.economy.track({ tricks: 200, grinds: 30, bestLine: 9 });
      const crate = window.__LAZER.profile.progress.crates[0];
      if (!crate) throw new Error('Reward fixture did not earn a crate');
      window.__LAZER.rewards.openCrate(crate, window.__LAZER.profile.progress.crates);
    }), '.crate-overlay');
    await capture('crate-revealed', () => page.evaluate(async () => {
      const rewards = window.__LAZER.rewards;
      await rewards.tap(); await rewards.tap(); await rewards.tap();
    }), '.crate-overlay.open');
    await capture('shop', () => page.evaluate(() => {
      window.__LAZER.rewards.closeOverlay();
      document.querySelectorAll('.reward-toast,.level-up').forEach(el => el.remove());
      const menu = window.__LAZER.menu;
      menu.openShop('bars');
      menu.show('shop');
    }), '#start');
    await capture('shop-items', () => page.evaluate(() => window.__LAZER.menu.openShop('bars')), '#start');
    results.push({ size: `${width}x${height}`, screen: 'page-errors', errors });
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
const failures = results.filter(result => result.error || result.errors?.length || result.clipped?.length || result.unreachable?.length || result.documentWidth > result.viewportWidth + 1);
console.log(`${results.length} records, ${failures.length} failures; details: ${output}/results.json`);
if (failures.length) process.exitCode = 1;
