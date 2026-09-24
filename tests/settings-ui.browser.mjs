import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined)});
const page=await browser.newPage({viewport:{width:1440,height:900}});
await mkdir('artifacts/settings-pause',{recursive:true});
await page.goto(process.env.LAZER_URL??'http://127.0.0.1:5186',{waitUntil:'networkidle'});
await page.getByRole('button',{name:/SETTINGS/}).click();
for(const name of ['RIDING & CONTROLS','CAMERA','GRAPHICS','TIME & WEATHER','AUDIO','ACCESSIBILITY & TOUCH'])
  assert.equal(await page.getByRole('button',{name:new RegExp(name)}).count(),1,name+' category missing');
await page.screenshot({path:'artifacts/settings-pause/settings.png'});
await page.getByRole('button',{name:/TIME & WEATHER/}).click();
assert.equal(await page.locator('.game-menu h1').textContent(),'TIME & WEATHER');
assert.match(await page.getByRole('button',{name:/TIME OF DAY/}).innerText(),/DAY|SUNSET|NIGHT|SUNRISE|SNOW/);
await page.screenshot({path:'artifacts/settings-pause/time-weather.png'});
await page.getByRole('button',{name:'BACK',exact:true}).click();
assert.equal(await page.locator('.game-menu h1').textContent(),'SETTINGS');
await page.getByRole('button',{name:'BACK',exact:true}).click();
await page.getByRole('button',{name:/RIDER/}).click();
assert.equal(await page.getByRole('button',{name:/CHANGE CHARACTER/}).count(),0);
assert.match(await page.getByRole('button',{name:/CHOOSE RIDER/}).innerText(),/Sample riders and presets/);
assert.match(await page.getByRole('button',{name:/CUSTOMIZE RIDER/}).innerText(),/Face, hair, eyes/);
await page.screenshot({path:'artifacts/settings-pause/rider.png'});
await page.getByRole('button',{name:/SAVE & BACK/}).click();
// A fresh profile builds its starter scooter first (the Lazer starter); RIDE IT goes straight
// to Veterans Memorial Park. Otherwise PLAY / SOLO / the first park.
const play=page.getByRole('button',{name:/^(PLAY|BUILD YOUR SCOOTER)/}).first();
if(/BUILD YOUR SCOOTER/.test(await play.innerText())){await play.click();await page.getByRole('button',{name:/^RIDE IT/}).click();}
else{await play.click();await page.getByRole('button',{name:/^SOLO/}).click();await page.locator('.game-menu nav button').first().click();}
await page.locator('#loading').waitFor({state:'hidden',timeout:30000});
await page.locator('#start').waitFor({state:'hidden',timeout:30000});
await page.waitForTimeout(500);
await page.keyboard.down('Escape');
await page.waitForTimeout(150);
await page.keyboard.up('Escape');
await page.locator('#pause').waitFor({state:'visible'});
assert.match(await page.locator('#pause').evaluate(e=>getComputedStyle(e).backgroundColor),/rgba\([^)]*, 0\.[0-9]+\)/);
const frozen=()=>page.evaluate(()=>{const g=window.__LAZER;return {position:g.sim.position.toArray(),elapsed:g.sim.elapsed,rider:g.rider.rider.position.toArray(),hands:g.rider.hands.map(h=>h.position.toArray()),camera:g.camera.camera.position.toArray()};});
const before=await frozen();await page.keyboard.down('w');await page.waitForTimeout(400);await page.keyboard.up('w');
assert.deepEqual(await frozen(),before,'pause must freeze physics, pose and camera even with movement held');
await page.screenshot({path:'artifacts/settings-pause/pause.png'});
await browser.close();
