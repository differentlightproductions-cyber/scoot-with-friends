import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1400,height:900}});
 await page.goto(process.env.GAME_URL??'http://127.0.0.1:5182');await page.locator('#destination-loading').waitFor({state:'hidden',timeout:60000});
 const play=page.locator('#ride'),shops=page.locator('#start button').filter({hasText:'Visit, browse, and ride'});
 const bg=el=>el.evaluate(e=>getComputedStyle(e).backgroundColor);
 assert.notEqual(await bg(play),await bg(shops));
 await page.waitForTimeout(300);await page.keyboard.down('s');await page.waitForTimeout(80);await page.keyboard.up('s');
 assert(await shops.evaluate(e=>e.classList.contains('selected')));assert.notEqual(await bg(play),await bg(shops));
 assert.equal(await shops.evaluate(e=>getComputedStyle(e.querySelector('span'),'::before').content),'"› "');
 await page.screenshot({path:'artifacts/ui-polish/main-menu-focus.png'});
 await page.locator('#start button').filter({hasText:'Sign in / Create account'}).click();
 await page.locator('#account-dialog').waitFor({state:'visible'});
 await page.locator('#account-dialog input[name=username]').fill('walking_letters_wasd');
 assert.equal(await page.locator('#account-dialog input[name=username]').inputValue(),'walking_letters_wasd');
 assert.equal(await page.locator('#start').getAttribute('data-screen'),'home');
 await page.screenshot({path:'artifacts/ui-polish/account-panel.png'});
 console.log('Play / Shops keyboard selection has distinct color and marker; account form does not leak typing to menu.');
}finally{await browser.close();}
