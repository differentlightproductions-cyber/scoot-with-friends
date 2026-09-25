import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
  const page = await browser.newPage({viewport:{width:1280,height:800}});
  await page.goto(process.env.LAZER_URL??'http://127.0.0.1:5184',{waitUntil:'networkidle'});
  await page.waitForFunction(() => !!window.__LAZER);
  await page.evaluate(() => window.__LAZER.menu.show('settings'));
  await page.getByRole('button',{name:/LANGUAGE/}).click();
  await page.getByRole('button',{name:/Español/}).click();
  assert.equal(await page.locator('html').getAttribute('lang'),'es');
  await page.evaluate(() => window.__LAZER.startSession('outdoor'));
  await page.locator('#start').waitFor({state:'hidden'});
  await page.evaluate(() => window.__LAZER.hud.setPaused(true));
  assert.match(await page.locator('#pause [data-action="resume"]').innerText(),/Continuar/);
  await page.evaluate(() => {const g=window.__LAZER;g.hud.setPaused(false);g.phone.open('messages');});
  await page.waitForFunction(() => window.__LAZER.phone.screen.chrome.title === 'MENSAJES');
  await page.evaluate(() => {const g=window.__LAZER;g.phone.stow();g.menu.root.hidden=false;g.menu.show('settings-language');});
  await page.getByRole('button',{name:/العربية/}).click();
  assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
  assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('rtl')),true);
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('html').getAttribute('lang'),'ar','language choice survives reload');
  await page.waitForFunction(() => !!window.__LAZER);
  await page.evaluate(() => window.__LAZER.startSession('outdoor'));
  await page.locator('#start').waitFor({state:'hidden'});
  await page.evaluate(() => {const g=window.__LAZER;g.menu.root.hidden=true;g.hud.setPaused(true);});
  assert.match(await page.locator('#pause [data-action="resume"]').innerText(),/متابعة/);
  await page.evaluate(() => {const g=window.__LAZER;g.hud.setPaused(false);g.phone.open('messages');});
  await page.waitForFunction(() => window.__LAZER.phone.screen.chrome.title === 'الرسائل');
  await page.evaluate(() => {const g=window.__LAZER;g.phone.stow();g.menu.root.hidden=false;g.menu.show('settings-language');});
  await page.getByRole('button',{name:/English/}).click();
  assert.equal(await page.locator('html').getAttribute('dir'),'ltr');
  await page.evaluate(() => {const g=window.__LAZER;g.menu.root.hidden=true;g.hud.setPaused(true);});
  assert.match(await page.locator('#pause [data-action="resume"]').innerText(),/Resume/);
  await page.evaluate(() => {const g=window.__LAZER;g.hud.setPaused(false);g.phone.open('messages');});
  await page.waitForFunction(() => window.__LAZER.phone.screen.chrome.title === 'MESSAGES');
} finally {
  await browser.close();
}
