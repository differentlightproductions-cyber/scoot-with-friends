import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.LAZER_URL??'http://127.0.0.1:5187');
  await page.waitForFunction(()=>window.__LAZER?.menu);
  await mkdir('artifacts/ui-palettes',{recursive:true});
  const original=await page.evaluate(()=>JSON.stringify(window.__LAZER.profile.scooter));
  await page.evaluate(()=>window.__LAZER.menu.show('settings-graphics'));
  for (const expected of ['grayscale','earth','default']) {
    await page.getByRole('button',{name:/^UI COLORS:/}).click();
    assert.equal(await page.locator('html').getAttribute('data-ui-palette'),expected);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lazer-profile-v1')).settings.uiPalette),expected);
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__LAZER.profile.scooter)),original);
    await page.screenshot({path:`artifacts/ui-palettes/${expected}.png`});
  }
  await page.getByRole('button',{name:/^UI COLORS:/}).click();
  await page.reload();await page.waitForFunction(()=>window.__LAZER?.menu);
  assert.equal(await page.locator('html').getAttribute('data-ui-palette'),'grayscale');
  await page.evaluate(()=>{const g=window.__LAZER;g.startSession('outdoor',true);g.hud.start();g.menu.openSesh('settings-graphics','outdoor');});
  await page.getByRole('button',{name:/^UI COLORS:/}).click();
  assert.equal(await page.locator('html').getAttribute('data-ui-palette'),'earth');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lazer-profile-v1')).settings.uiPalette),'earth');
  assert.deepEqual(errors,[]);
  console.log('PASS: three UI palettes, persisted reload, Sesh immediate saving, unchanged scooter, no page errors');
} finally {await browser.close();}
