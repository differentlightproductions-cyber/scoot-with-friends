import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 await mkdir('artifacts/touch-settings',{recursive:true});
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{navigator.vibrate=()=>true;});
  const page=await context.newPage();
  await page.goto(process.env.LAZER_URL??'http://127.0.0.1:5184',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__LAZER);
  await page.locator('#mobile-start button').click();
  await page.evaluate(()=>window.__LAZER.menu.show('settings-touch'));
  await page.locator('#touch-pad.tp-preview').waitFor({state:'visible'});
  const rows=page.locator('#start[data-screen="settings-touch"] nav button');
  assert.equal(await rows.count(),7,'six settings and Back');
  for(const row of await rows.all()){
   await row.scrollIntoViewIfNeeded();
   const rect=await row.boundingBox();
   assert.ok(rect&&rect.height>=44,`touch target ${await row.innerText()} is at least 44px`);
   assert.ok(rect.x>=0&&rect.x+rect.width<=viewport.width+1,'row fits viewport');
   assert.ok(rect.y>=0&&rect.y+rect.height<=viewport.height+1,'row is reachable');
  }
  assert.equal(await page.evaluate(()=>window.__LAZER.touchPad.state()),null,'preview never supplies game input');
  await page.locator('#touch-pad [data-button="0"]').dispatchEvent('pointerdown',{pointerId:1});
  assert.equal(await page.evaluate(()=>window.__LAZER.touchPad.anyInput),false,'preview ignores touch presses');
  const before=await page.locator('#touch-pad .tp-ls').boundingBox();
  await page.getByRole('button',{name:/LEFT-HANDED LAYOUT/}).click();
  const after=await page.locator('#touch-pad .tp-ls').boundingBox();
  assert.ok(after.x>before.x,'left stick mirrors to right');
  await page.screenshot({path:`artifacts/touch-settings/${viewport.width}x${viewport.height}.png`});
  await page.getByRole('button',{name:/CONTROL SIZE/}).click();
  await page.getByRole('button',{name:/OPACITY/}).click();
  await page.getByRole('button',{name:/HAPTICS/}).click();
  assert.equal(await page.evaluate(()=>window.__LAZER.profile.settings.touchHaptics),true);
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__LAZER);
  await page.locator('#mobile-start button').click();
  assert.deepEqual(await page.evaluate(()=>{const s=window.__LAZER.profile.settings;return [s.touchLeftHanded,s.touchSize,s.touchOpacity,s.touchHaptics];}),[true,130,75,true]);
  await page.evaluate(()=>window.__LAZER.menu.show('settings-touch'));
  await page.getByRole('button',{name:/RESET TOUCH LAYOUT/}).click();
  assert.deepEqual(await page.evaluate(()=>{const s=window.__LAZER.profile.settings;return [s.touchControls,s.touchSize,s.touchOpacity,s.touchLeftHanded,s.touchHaptics];}),['auto',100,50,false,false]);
  await page.evaluate(()=>{Object.defineProperty(navigator,'vibrate',{value:undefined,configurable:true});window.__LAZER.menu.show('settings-touch');});
  assert.equal(await page.getByRole('button',{name:/HAPTICS/}).count(),0,'unsupported vibration has no setting row');
  assert.equal(await page.evaluate(()=>window.__LAZER.touchPad.preview),true);
  await page.evaluate(()=>window.__LAZER.menu.show('settings'));
  assert.equal(await page.evaluate(()=>window.__LAZER.touchPad.preview),false,'leaving settings ends preview');
  await context.close();
 }
}finally{await browser.close();}
