import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';

const browser=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true});
try{
 mkdirSync('artifacts/ui-polish',{recursive:true});
 const page=await browser.newPage({viewport:{width:1400,height:900}});
 await page.route('**/api/account/session',route=>route.fulfill({status:200,contentType:'application/json',body:'{"account":null}'}));
 await page.goto(process.env.GAME_URL??'http://127.0.0.1:5182');
 await page.locator('#destination-loading').waitFor({state:'hidden',timeout:60000});
 const play=page.locator('#ride'),solo=page.locator('#start nav button').filter({hasText:'Choose a park and ride'});
 const bg=el=>el.evaluate(e=>getComputedStyle(e).backgroundColor);
 assert.notEqual(await bg(play),await bg(solo));
 await page.waitForTimeout(300);
 await page.keyboard.down('s');await page.waitForTimeout(80);await page.keyboard.up('s');
 assert(await solo.evaluate(e=>e.classList.contains('selected')));
 assert.notEqual(await bg(play),await bg(solo));
 assert.equal(await solo.evaluate(e=>getComputedStyle(e.querySelector('span'),'::before').content),'"▶ "');
 await page.screenshot({path:'artifacts/ui-polish/main-menu-focus.png'});
 await page.locator('[data-tab="account"]').click();
 await page.getByRole('button',{name:/SIGN IN \/ CREATE ACCOUNT/}).click();
 await page.locator('#account-dialog').waitFor({state:'visible'});
 await page.locator('#account-dialog input[name=username]').fill('walking_letters_wasd');
 assert.equal(await page.locator('#account-dialog input[name=username]').inputValue(),'walking_letters_wasd');
 assert.equal(await page.locator('#start').getAttribute('data-screen'),'account');
 await page.screenshot({path:'artifacts/ui-polish/account-panel.png'});
 console.log('PLAY keyboard selection has distinct color and marker; account form does not leak typing to menu.');
}finally{await browser.close();}
