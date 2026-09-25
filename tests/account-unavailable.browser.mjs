import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
 const page = await browser.newPage();
 let available = false;
 await page.route('**/account-check.html', route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Account check</title><body></body>'}));
 await page.route('**/api/account/session', route => route.fulfill(available ? {contentType:'application/json',body:'{"account":null}'} : {status:404,contentType:'text/html',body:'Not found'}));
 await page.goto((process.env.LAZER_URL || 'http://127.0.0.1:5182') + '/account-check.html');
 await page.evaluate(async () => { const {AccountPanel}=await import('/src/ui/account.ts'); window.panel=new AccountPanel(); await window.panel.open(); });
 assert.equal(await page.locator('#account-dialog form').count(),0);
 assert.match(await page.locator('#account-dialog').innerText(),/no account service connected/);
 assert.equal(await page.getByRole('button',{name:'Open account-enabled game'}).count(),1);
 available=true;
 await page.getByRole('button',{name:'Retry connection'}).click();
 await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();
 assert.equal(await page.locator('#account-dialog input[name=password]').count(),1);
 console.log('PASS: unavailable account service explained; hosted-game route offered; retry restores sign-in form.');
} finally {await browser.close();}
