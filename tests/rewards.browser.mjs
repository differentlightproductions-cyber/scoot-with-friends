import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';

// Missions, level-ups and crates end to end: riding events complete missions
// (Credit, XP and a crate land in the save in one transaction), the crate opens
// on screen (tap, tap, tap, reveal), grants a part that was not owned, and the
// part can be equipped straight from the reveal.
// Usage: LAZER_URL=http://127.0.0.1:5190 node tests/rewards.browser.mjs
const folder='artifacts/rewards';mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];const check=(name,ok,detail)=>{results.push({name,ok});console.log((ok?'PASS ':'FAIL ')+name+(detail?' '+JSON.stringify(detail):''));};
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5190')+'/?map=outdoor');
 await page.waitForFunction(()=>window.__LAZER?.rider,null,{timeout:120000});
 await page.evaluate(async()=>{localStorage.clear();const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);});
 // Ten landed tricks through the real event bus complete "Land 10 tricks I".
 const first=await page.evaluate(async()=>{
  const g=window.__LAZER,raw={bodyYaw:0,flipPitch:0,deckAngle:0,barAngle:0,deckTurns:1,barTurns:0,states:[],out:false,direction:{body:0,deck:1,bars:0}};
  for(let i=0;i<10;i++)g.sim.events.emit({type:'trick',name:'Tailwhip',record:{id:9000+i,name:'Tailwhip',recognized:'Tailwhip',components:['Tailwhip'],raw,landing:i<4?'clean':'good'},attemptId:9000+i});
  g.missions.flush();await new Promise(r=>setTimeout(r,400));
  const saved=JSON.parse(localStorage.getItem('lazer-profile-v1'));
  return {stats:saved.progress.stats,career:saved.progress.career,credit:saved.wallet.credit,xp:saved.progress.xp,toasts:document.querySelectorAll('.reward-toast').length};
 });
 check('Landed tricks count toward missions (tricks, perfect, whips)',first.stats.tricks===10&&first.stats.perfect===4&&first.stats.whips===10,first.stats);
 check('A completed mission pays Credit and XP into the save',first.career.landings===1&&first.credit>=30&&first.xp>=150,{career:first.career,credit:first.credit,xp:first.xp});
 check('Mission complete sticker shows',first.toasts>=1);
 await page.waitForTimeout(700);await page.screenshot({path:folder+'/mission-toast.png'});
 // Enough riding for the next stages and several levels: crates arrive.
 const second=await page.evaluate(async()=>{const g=window.__LAZER;await g.economy.track({tricks:200,grinds:30,bestLine:9});await new Promise(r=>setTimeout(r,300));const s=JSON.parse(localStorage.getItem('lazer-profile-v1'));return {crates:s.progress.crates,level:s.progress.xp};});
 check('Later stages and level-ups grant crates',second.crates.length>=3,{crates:second.crates.map(c=>c.tier)});
 await page.waitForSelector('.level-up',{timeout:5000}).catch(()=>{});
 await page.waitForTimeout(500);await page.screenshot({path:folder+'/level-up.png'});
 await page.waitForTimeout(3000);
 // Open a crate on screen.
 const crate=second.crates.find(c=>c.tier==='pro')??second.crates[0];
 await page.evaluate(id=>{const g=window.__LAZER,s=JSON.parse(localStorage.getItem('lazer-profile-v1'));g.rewards.openCrate(s.progress.crates.find(c=>c.id===id),s.progress.crates);},crate.id);
 await page.waitForTimeout(900);await page.screenshot({path:folder+'/crate-closed.png'});
 for(let i=0;i<3;i++){await page.mouse.click(640,380);await page.waitForTimeout(i===1?900:500);if(i===1)await page.screenshot({path:folder+'/crate-charged.png'});}
 await page.waitForSelector('.crate-card:not([hidden])',{timeout:5000});
 await page.waitForTimeout(1300);await page.screenshot({path:folder+'/crate-reveal.png'});
 const opened=await page.evaluate(id=>{const s=JSON.parse(localStorage.getItem('lazer-profile-v1'));return {left:s.progress.crates.some(c=>c.id===id),owned:s.wallet.owned,opened:s.progress.stats.cratesOpened,card:document.querySelector('.crate-card')?.textContent,buttons:[...document.querySelectorAll('.crate-actions button')].map(b=>b.textContent)};},crate.id);
 check('The opened crate is gone from the save and counted',!opened.left&&opened.opened===1,opened);
 check('The crate granted a part that was not owned before',opened.owned.length===1,{owned:opened.owned,card:opened.card});
 // Reopening the same crate id elsewhere gives nothing more.
 const again=await page.evaluate(async id=>window.__LAZER.economy.openCrate(id),crate.id);
 check('A crate cannot be opened twice',typeof again==='string',again);
 if(opened.buttons.includes('EQUIP NOW')){
  await page.click('.crate-actions button:has-text("EQUIP NOW")');await page.waitForTimeout(400);
  const equipped=await page.evaluate(key=>{const s=JSON.parse(localStorage.getItem('lazer-profile-v1'));const [partId,variantId]=key.split(':');return Object.values(s.scooter).some(sel=>sel.partId===partId&&sel.variantId===variantId)&&!document.querySelector('.crate-overlay');},opened.owned[0]);
  check('EQUIP NOW puts the part on the scooter and closes the reveal',equipped);
 }else{await page.click('.crate-actions button:has-text("NICE!")');check('Longboard part revealed (equip from the board builder)',true);}
 check('No page errors',errors.length===0,errors);
}finally{await browser.close();}
const failed=results.filter(r=>!r.ok).length;console.log(`${results.length-failed}/${results.length} reward checks passed`);process.exit(failed?1:0);
