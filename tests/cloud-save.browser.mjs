import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';

// Cloud save end to end against a stand-in account API (same contract as
// server/auth-api.ts): signing in uploads this device's progress, a device that
// did not change pulls the account copy, and when both changed the player picks
// in the account dialog. Nothing is mixed and the replaced save is backed up.
// Usage: LAZER_URL=http://127.0.0.1:5190 node tests/cloud-save.browser.mjs
const folder='artifacts/cloud-save';mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];const check=(name,ok,detail)=>{results.push({name,ok});console.log((ok?'PASS ':'FAIL ')+name+(detail?' '+JSON.stringify(detail):''));};
const url=(process.env.LAZER_URL??'http://127.0.0.1:5190')+'/?map=outdoor';
// The stand-in server: one account, one save, revision checks like D1's upsert.
// Each browser context is a device with its own sign-in (like its own cookie).
const server={save:null,pushes:0},account={id:'acc-1',username:'rider_one'};
async function api(route,device){
 const request=route.request(),action=request.url().split('/api/account/')[1].split('?')[0],body=request.method()==='POST'?JSON.parse(request.postData()||'{}'):null;
 const json=(status,data)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 if(action==='session')return json(200,{account:device.signed?account:null});
 if(action==='login'){device.signed=true;return json(200,{account});}
 if(action==='logout'){device.signed=false;return json(200,{account:null});}
 if(action==='save'){
  if(!device.signed)return json(401,{error:'Sign in first.'});
  if(!body)return json(200,{save:server.save});
  if(server.save&&server.save.revision!==body.base&&!body.force)return json(409,{error:'Your account has newer progress.',save:server.save});
  server.save={data:body.data,revision:(server.save?.revision??0)+1,updated:Date.now()};server.pushes++;return json(200,{revision:server.save.revision,updated:server.save.updated});
 }
 return json(404,{error:'Unknown'});
}
async function boot(context){
 context.device??={signed:false};
 const page=await context.newPage({viewport:{width:1280,height:720}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/account/**',route=>api(route,context.device));
 await page.goto(url);await page.waitForFunction(()=>window.__LAZER?.rider,null,{timeout:120000});
 return {page,errors};
}
const profile=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('lazer-profile-v1')||'null'));
const settle=page=>page.waitForFunction(()=>/saved to your account|Could not|Sign in first|^$/.test(window.__LAZER.cloud.status)&&!window.__LAZER.cloud.busy,null,{timeout:20000}).catch(()=>{});
try{
 // Device A: play a little, then sign in. The account had nothing, so it uploads.
 const a=await browser.newContext();let {page,errors}=await boot(a);
 await page.evaluate(async()=>{const g=window.__LAZER;g.testing(true);await g.economy.track({tricks:40,grinds:6});await new Promise(r=>setTimeout(r,300));});
 const local=await profile(page);
 await page.evaluate(()=>window.__LAZER.menu.accountPanel.open());
 await page.fill('#account-dialog input[name=username]','rider_one');await page.fill('#account-dialog input[name=password]','correct horse battery');
 await page.click('#account-dialog button[type=submit]');await page.waitForFunction(()=>/saved to your account/.test(window.__LAZER.cloud.status),null,{timeout:20000}).catch(()=>{});
 check('Signing in uploads this device\'s progress',server.save?.data?.wallet?.credit===local.wallet.credit&&server.save.data.progress.xp===local.progress.xp,{server:server.save?.data?.wallet?.credit,local:local.wallet.credit,status:await page.evaluate(()=>window.__LAZER.cloud.status)});
 await page.waitForTimeout(300);await page.screenshot({path:folder+'/signed-in.png'});
 // More riding, then the tab is hidden: the change goes up straight away.
 await page.evaluate(async()=>{await window.__LAZER.economy.track({tricks:10});Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange',{bubbles:true}));await new Promise(r=>setTimeout(r,800));});
 const later=await profile(page);
 check('Leaving the tab uploads new progress',server.save.data.progress.stats.tricks===later.progress.stats.tricks&&server.save.revision===2,{server:server.save.data.progress.stats.tricks,local:later.progress.stats.tricks,revision:server.save.revision});
 await page.close();
 // Another device moved the account on. Device A has no new progress, so it pulls at start-up.
 server.save={data:{...server.save.data,wallet:{...server.save.data.wallet,credit:4321}},revision:7,updated:Date.now()-3600e3};
 ({page,errors}=await boot(a));
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lazer-profile-v1')||'{}').wallet?.credit===4321,null,{timeout:30000}).catch(()=>{});
 await page.waitForFunction(()=>window.__LAZER?.rider,null,{timeout:120000});
 const pulled=await profile(page);
 check('A device that did not change pulls the account copy',pulled.wallet.credit===4321,{credit:pulled.wallet.credit});
 await page.close();
 // Device B: a fresh browser with its own progress meets the account copy: the player chooses.
 const b=await browser.newContext();({page,errors}=await boot(b));
 await page.evaluate(async()=>{const g=window.__LAZER;g.testing(true);await g.economy.track({tricks:5});await new Promise(r=>setTimeout(r,300));});
 const deviceB=await profile(page);
 await page.evaluate(()=>window.__LAZER.menu.accountPanel.open());
 await page.fill('#account-dialog input[name=username]','rider_one');await page.fill('#account-dialog input[name=password]','correct horse battery');
 await page.click('#account-dialog button[type=submit]');
 await page.waitForSelector('#account-dialog .account-save',{timeout:10000}).catch(()=>{});
 const choice=await page.evaluate(()=>[...document.querySelectorAll('#account-dialog .account-save')].map(e=>e.textContent));
 check('Both saves are shown side by side',choice.length===2&&/4,321 Credit/.test(choice[0]),choice);
 await page.waitForTimeout(400);await page.screenshot({path:folder+'/choice.png'});
 const escaped=await page.evaluate(()=>{document.querySelector('#account-dialog').dispatchEvent(new Event('cancel',{cancelable:true}));return document.querySelector('#account-dialog').open;});
 check('The choice cannot be dismissed without answering',escaped);
 const before=server.pushes;
 await page.click('#account-dialog [data-pick=device]');await settle(page);
 check('Keeping this device overwrites the account on purpose',server.pushes===before+1&&server.save.data.wallet.credit===deviceB.wallet.credit,{pushes:server.pushes,credit:server.save.data.wallet.credit});
 check('The replaced account copy is kept on this device',await page.evaluate(()=>JSON.parse(localStorage.getItem('lazer-cloud-before-device-v1')||'null')?.wallet?.credit)===4321);
 await page.close();
 // Device B again, the account moved on elsewhere AND B changed: ask again, pick the account this time.
 ({page,errors}=await boot(b));await settle(page);
 await page.evaluate(async()=>{await window.__LAZER.economy.track({tricks:3});});
 server.save={data:{...server.save.data,wallet:{...server.save.data.wallet,credit:999}},revision:server.save.revision+3,updated:Date.now()};
 await page.evaluate(()=>{void window.__LAZER.cloud.sync();});
 await page.waitForSelector('#account-dialog .account-save',{timeout:10000}).catch(()=>{});
 const mine=await profile(page);
 await Promise.all([page.waitForEvent('load',{timeout:30000}).catch(()=>{}),page.click('#account-dialog [data-pick=cloud]')]);
 await page.waitForFunction(()=>window.__LAZER?.rider,null,{timeout:120000});
 const after=await profile(page),backup=await page.evaluate(()=>JSON.parse(localStorage.getItem('lazer-profile-before-cloud-v1')||'null'));
 check('Using the account copy loads it',after.wallet.credit===999,{credit:after.wallet.credit});
 check('The replaced device save is kept as a backup',backup?.progress?.stats?.tricks===mine.progress.stats.tricks,{backup:backup?.progress?.stats?.tricks});
 // Signing out stops syncing but keeps the progress here.
 await page.evaluate(()=>window.__LAZER.menu.accountPanel.open());await settle(page);
 await page.click('#account-dialog button:has-text("Sign out")');await page.waitForTimeout(500);
 check('Signing out keeps progress on this device',(await profile(page)).wallet.credit===999&&!await page.evaluate(()=>window.__LAZER.cloud.account));
 check('No page errors',errors.length===0,errors);
}finally{await browser.close();}
const failed=results.filter(r=>!r.ok).length;console.log(`${results.length-failed}/${results.length} cloud save checks passed`);process.exit(failed?1:0);
