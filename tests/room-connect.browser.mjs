import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const origin=process.env.LAZER_URL??'http://127.0.0.1:5187';
const errors=[],sent=[];let code='';
try{
 const clients=[];
 for(const name of ['Host','Friend']){
  const context=await browser.newContext({viewport:{width:1000,height:720}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept(d.message().includes('Paste invite')?code:name));
  page.on('websocket',ws=>ws.on('framesent',f=>{const m=JSON.parse(String(f.payload));if(['create','join','appearance'].includes(m.type))sent.push({type:m.type,bytes:Buffer.byteLength(String(f.payload)),privateData:!!(m.appearance.wallet||m.appearance.progress)});}));
  await page.goto(origin);await page.waitForFunction(()=>window.__LAZER?.menu);
  await page.evaluate(()=>{const g=window.__LAZER;g.startSession('outdoor',true);g.hud.start();g.profile.wallet.receipts=Array.from({length:500},(_,i)=>`reward-${i}-`+'x'.repeat(60));g.menu.root.hidden=false;g.menu.show('online');});
  clients.push({context,page});
 }
 const [host,friend]=clients;
 await host.page.getByRole('button',{name:'CREATE PRIVATE ROOM',exact:true}).click();
 await host.page.getByRole('button',{name:/^ROOM CONNECTED/}).waitFor({state:'visible',timeout:30000});
 code=await host.page.evaluate(()=>window.__LAZER.network.code);assert.ok(code);
 assert.match(await host.page.getByRole('button',{name:/COPY ROOM CODE/}).innerText(),new RegExp(code));
 assert.ok(await host.page.getByRole('button',{name:'COPY INVITE',exact:true}).isVisible());
 const before=await host.page.evaluate(()=>window.__LAZER.sim.position.toArray());
 await host.page.keyboard.down('KeyW');await host.page.waitForTimeout(250);await host.page.keyboard.up('KeyW');
 assert.deepEqual(await host.page.evaluate(()=>window.__LAZER.sim.position.toArray()),before,'confirmation owns input and freezes local movement');
 await friend.page.getByRole('button',{name:'JOIN ROOM',exact:true}).click();
 await friend.page.getByRole('button',{name:/^ROOM CONNECTED/}).waitFor({state:'visible',timeout:30000});
 await host.page.waitForFunction(()=>window.__LAZER.network.roster.length===2);
 assert.equal(await friend.page.evaluate(()=>window.__LAZER.network.code),code);
 await host.page.evaluate(()=>window.__LAZER.menu.onChange());
 await host.page.getByRole('button',{name:'ENTER PARK',exact:true}).click();
 await host.page.locator('#start').waitFor({state:'hidden'});
 assert.equal(await host.page.evaluate(()=>window.__LAZER.network.status),'Connected');
 assert.ok(sent.length>=3);assert.ok(sent.every(m=>m.bytes<16384&&!m.privateData));assert.deepEqual(errors,[]);
 await mkdir('artifacts/network',{recursive:true});
 await friend.page.screenshot({path:'artifacts/network/room-connected.png'});
 await Promise.all(clients.map(c=>c.page.evaluate(()=>window.__LAZER.network.leave())));
 console.log(JSON.stringify({twoClients:true,largeSave:true,confirmation:true,visibleCode:true,copyInvite:true,enterPark:true,packets:sent,errors}));
}finally{await browser.close();}
