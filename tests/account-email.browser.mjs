import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';

// Isolated account-panel browser check: Vite transforms the real modules, while
// the account API is mocked. No game boot, database, or email provider is used.
const server=await createServer({
  server:{host:'127.0.0.1',port:0},
  optimizeDeps:{noDiscovery:true,include:[]},
  plugins:[{name:'account-harness',configureServer(vite){
    vite.middlewares.use('/__account-harness',(_req,res)=>{
      res.setHeader('content-type','text/html; charset=utf-8');
      res.end('<!doctype html><html><head><meta name="referrer" content="no-referrer"></head><body><script type="module">import {AccountPanel} from "/src/ui/account.ts"; window.panel=new AccountPanel(); window.ready=true;</script></body></html>');
    });
  }}]
});
await server.listen();
const port=server.httpServer.address().port;
const base=`http://127.0.0.1:${port}/__account-harness`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const account={id:'rider-1',username:'rider_one',email:null,pendingEmail:'rider@example.com',marketingConsent:false};
async function pageWithApi(path,handlers={}){
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/account/**',async route=>{
    const action=route.request().url().split('/api/account/')[1];
    const body=route.request().method()==='POST'?JSON.parse(route.request().postData()||'{}'):null;
    const reply=await (handlers[action]?.(body)??(action==='session'?{account:null,emailReady:true}:action==='save'?{save:null}:{error:'Unexpected '+action}));
    await route.fulfill({status:reply.error?400:200,contentType:'application/json',body:JSON.stringify(reply)});
  });
  await page.goto(base+path);
  await page.waitForFunction(()=>window.ready);
  return {page,errors};
}
try{
  let registration;
  let {page,errors}=await pageWithApi('',{
    register:body=>{registration=body;return {account,recovery:'f'.repeat(64),emailReady:true};}
  });
  await page.evaluate(()=>window.panel.open());
  await page.getByRole('button',{name:'Create an account'}).click();
  const consent=page.locator('#account-dialog input[name=marketingConsent]');
  assert.equal(await consent.isChecked(),true,'promotional preference starts checked');
  await consent.uncheck();
  await page.locator('#account-dialog input[name=username]').fill('rider_one');
  await page.locator('#account-dialog input[name=email]').fill('rider@example.com');
  await page.locator('#account-dialog input[name=password]').fill('test-only-strong-password');
  await page.locator('#account-dialog button[type=submit]').click();
  await page.waitForFunction(()=>!!document.querySelector('#account-dialog .recovery-code:not([hidden])'));
  assert.equal(registration.email,'rider@example.com');
  assert.equal(registration.marketingConsent,false,'unchecked preference is sent explicitly');
  assert.deepEqual(errors,[]);
  await page.close();

  ({page,errors}=await pageWithApi('',{'email-reset-request':()=>({ok:true})}));
  await page.evaluate(()=>window.panel.open());
  await page.getByRole('button',{name:'Reset with verified email'}).click();
  await page.locator('#account-dialog input[name=email]').fill('rider@example.com');
  await page.locator('#account-dialog button[type=submit]').click();
  await page.getByText('If this is a verified account email, a reset link is on its way.').waitFor();
  await page.getByRole('button',{name:'Back to sign in'}).click();
  assert.equal(await page.locator('#account-dialog input[name=username]').count(),1,'request screen can return to sign in');
  assert.deepEqual(errors,[]);
  await page.close();

  ({page,errors}=await pageWithApi('?map=outdoor&account_reset='+ 'a'.repeat(64),{
    'email-reset':body=>{assert.equal(body.token,'a'.repeat(64));return {account,recovery:'b'.repeat(64)};}
  }));
  await page.evaluate(()=>window.panel.open());
  assert.equal(new URL(page.url()).search,'?map=outdoor','reset token leaves address while map stays');
  await page.locator('#account-dialog input[name=password]').fill('another-strong-password');
  await page.locator('#account-dialog button[type=submit]').click();
  await page.waitForFunction(()=>!!document.querySelector('#account-dialog .recovery-code:not([hidden])'));
  assert.equal(await page.locator('#account-dialog textarea').inputValue(),'b'.repeat(64),'new recovery code is visible after reset');
  assert.deepEqual(errors,[]);
  await page.close();

  let verified=0;
  ({page,errors}=await pageWithApi('?map=outdoor&account_verify='+ 'c'.repeat(64),{
    login:()=>({account}), 'email-verify':body=>{assert.equal(body.token,'c'.repeat(64));verified++;return {account:{...account,email:'rider@example.com',pendingEmail:null}};}
  }));
  await page.evaluate(()=>window.panel.open());
  assert.equal(new URL(page.url()).search,'?map=outdoor','verification token leaves address while map stays');
  await page.locator('#account-dialog input[name=username]').fill('rider_one');
  await page.locator('#account-dialog input[name=password]').fill('test-only-strong-password');
  await page.locator('#account-dialog button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#account-dialog .account-actions')?.textContent?.includes('Verified email: rider@example.com'));
  assert.equal(verified,1,'signed-out verification retries after login');
  assert.deepEqual(errors,[]);
  await page.close();
  console.log('Account email browser checks passed.');
}finally{await browser.close();await server.close();}
