import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const url=process.env.LAZER_URL??'http://127.0.0.1:5184';
try{
 await mkdir('artifacts/menu-tabs',{recursive:true});
 for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:360,height:740}]){
  const mobile=viewport.width<500,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage();
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__LAZER);
  if(mobile)await page.locator('#mobile-start button').click();
  const tabs=page.locator('#start .main-tabs [role="tab"]');
  assert.equal(await tabs.count(),6,'six main tabs');
  assert.equal(await page.evaluate(()=>window.__LAZER.menu.screen),'home');
  assert.equal(await page.evaluate(()=>!!window.__LAZER.menu.tabPanel('play')),true);
  for(const tab of await tabs.all()){
   const r=await tab.boundingBox();assert.ok(r&&r.x>=0&&r.x+r.width<=viewport.width+1&&r.y>=0&&r.y+r.height<=viewport.height+1,'tab stays in viewport');
   assert.ok(r.height>=44,'tab touch target is 44px');
  }
  assert.ok(await page.locator('#ride').count(),'PLAY landing has an immediate starter or solo action');
  await page.screenshot({path:`artifacts/menu-tabs/${viewport.width}x${viewport.height}.png`});
  await page.locator('[data-tab="shop"]').click();
  assert.equal(await page.evaluate(()=>window.__LAZER.menu.screen),'shop');
  assert.equal(await page.evaluate(()=>window.__LAZER.menu.shopOpen),false,'main-menu shop is not an in-world overlay');
  assert.equal(await page.evaluate(()=>!!window.__LAZER.menu.tabPanel('shop')),true);
  assert.equal(await page.getByRole('button',{name:/VISIT TECHNO GRAVITY/}).count(),1);
  assert.equal(await page.locator('.menu-grid button:not(.menu-cell)').count(),0,'deal grid contains only product cells');
  assert.equal(await page.getByText(/more shops soon/i).count(),0);
  const brand=await page.evaluate(()=>window.__LAZER.menu.choices.find(c=>c.label==='LAZER')?.label);
  assert.equal(brand,'LAZER');
  await page.evaluate(()=>window.__LAZER.menu.choices.find(c=>c.label==='LAZER').action());
  assert.match(await page.locator('#start .game-menu .eyebrow').innerText(),/NOT OWNED YET/,'shop tab browses shop stock');
  await page.keyboard.press('KeyE');
  assert.equal(await page.evaluate(()=>window.__LAZER.menu.screen),'crates','E advances to CRATES');
  await page.keyboard.press('KeyQ');
  assert.equal(await page.evaluate(()=>window.__LAZER.menu.screen),'shop','Q returns to SHOP');
  await page.evaluate(()=>{const m=window.__LAZER.menu,f=window.__LAZER.input.previous;m.update({...f,pressed:{...f.pressed,rightModifier:true}},.1);});
  assert.equal(await page.evaluate(()=>window.__LAZER.menu.screen),'crates','RB advances tabs');
  await page.evaluate(()=>{const m=window.__LAZER.menu,f=window.__LAZER.input.previous;m.update({...f,pressed:{...f.pressed,leftModifier:true}},.1);});
  assert.equal(await page.evaluate(()=>window.__LAZER.menu.screen),'shop','LB reverses tabs');
  await page.locator('[data-tab="account"]').click();
  assert.equal(await page.evaluate(()=>window.__LAZER.menu.screen),'account');
  await page.getByRole('button',{name:/SIGN IN \/ CREATE ACCOUNT/}).click();
  await page.locator('#account-dialog').waitFor({state:'visible'});
  await page.keyboard.press('KeyE');
  assert.equal(await page.evaluate(()=>window.__LAZER.menu.screen),'account','account dialog owns keyboard');
  await page.evaluate(()=>window.__LAZER.menu.accountPanel.dialog.close());
  await page.evaluate(()=>window.__LAZER.menu.show('creator'));
  assert.equal(await page.locator('.main-tabs button:disabled').count(),6,'creator draft locks tabs');
  await page.keyboard.press('KeyE');
  assert.equal(await page.evaluate(()=>window.__LAZER.menu.screen),'creator');
  await page.evaluate(()=>window.__LAZER.menu.show('starter'));
  assert.equal(await page.locator('.main-tabs button:disabled').count(),6,'starter draft locks tabs');
  await page.evaluate(()=>{const m=window.__LAZER.menu;m.show('home');m.overlayOwnsInput=()=>true;});
  await page.keyboard.press('KeyE');
  assert.equal(await page.evaluate(()=>window.__LAZER.menu.screen),'home','reward overlay owns keyboard');
  await page.evaluate(()=>{const m=window.__LAZER.menu,f=window.__LAZER.input.previous;m.update({...f,pressed:{...f.pressed,rightModifier:true}},.1);});
  assert.equal(await page.evaluate(()=>window.__LAZER.menu.screen),'home','reward overlay owns bumper');
  await page.evaluate(()=>{const m=window.__LAZER.menu;m.overlayOwnsInput=()=>false;m.openSesh('settings','outdoor');});
  assert.equal(await page.locator('.main-tabs').count(),0,'in-session menu has no full locker tabs');
  await context.close();
 }
}finally{await browser.close();}
