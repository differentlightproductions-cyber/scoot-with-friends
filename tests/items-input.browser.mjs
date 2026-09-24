import {chromium} from 'playwright';import assert from 'node:assert/strict';import {writeFileSync,mkdirSync} from 'node:fs';
// artifacts/ is gitignored, so these output directories do not exist in a fresh clone.
mkdirSync('artifacts/fit-pass/addendum',{recursive:true});
const b=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true});
try{const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(process.env.LAZER_URL||'http://127.0.0.1:5180/');await p.waitForFunction(()=>window.__LAZER?.rider.avatar);
 const checks=await p.evaluate(async()=>{
  const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);
  const {emptyInput}=await import('/src/input/input.ts'),{saveProfile,loadProfile}=await import('/src/data/loadout.ts'),{emptyPockets,receiveItem}=await import('/src/data/items.ts');
  const out=[],check=(name,ok,data)=>{if(!ok)throw Error(name+' '+JSON.stringify(data));out.push({name,data});};
  let s=g.sim,w=g.interactions;s.walking=true;s.grounded=true;s.velocity.set(0,0,0);s.body.setLinvel(s.velocity,true);Object.assign(g.profile.pockets,emptyPockets());const item=receiveItem(g.profile.pockets,'Soda');g.profile.pockets.held=null;
  // The phone's ITEMS app: A on a row through the same controller path the game uses.
  const tick=t=>{for(let i=0;i<Math.ceil(t*60);i++)g.phone.tick(1/60);};
  const press=id=>{tick(.02);g.phone.screen.focusId=id;const f=emptyInput();f.pressed.hop=true;g.phone.update(f,.016);tick(.02);};
  g.phone.open('items');tick(.5);press('group-'+item.id);press('hold');check('Phone Hold does not consume or start an action',g.profile.pockets.held===item.id&&item.state==='sealed'&&!w.active);
  press('stow');check('Phone Stow preserves inventory',!g.profile.pockets.held&&g.profile.pockets.entries.length===1);
  g.phone.stow();g.profile.pockets.backpack=true;g.phone.open('items');tick(.5);check('Backpack changes presentation only',g.phone.view.page().blocks[0].text==='BACKPACK'&&g.profile.pockets.entries[0].id===item.id);
  press('group-'+item.id);press('use');tick(.5);check('Phone Use puts the phone away and starts one action',!g.phone.active&&w.active?.itemId===item.id);
  const advance=t=>{for(let i=0;i<t*60;i++){if(s.emote)s.emote.time+=1/60;w.update(s,emptyInput(),1/60);}};
  advance(.6);const move=emptyInput();move.steer=.5;w.update(s,move,.016);check('Interrupted opening stays opened',item.state==='opened'&&!w.active);
  const use=emptyInput();use.pressed.pushDeck=true;w.update(s,use,.016);advance(1.5);w.update(s,move,.016);check('Interrupted consumption stays empty',item.state==='empty'&&g.profile.pockets.entries.length===1);
  g.profile.pockets.backpack=false;saveProfile(g.profile);await g.startSession('techno_gravity',true);s=g.sim;w=g.interactions;
  check('Map change retains the specific empty item',g.profile.pockets.entries[0].id===item.id&&g.profile.pockets.entries[0].state==='empty');
  check('Reload retains contents and backpack selection',loadProfile().pockets.entries[0].state==='empty'&&!loadProfile().pockets.backpack);
  for(const mode of ['mounted','on-foot','carry','held']){
    s.walking=mode!=='mounted';s.running=mode==='carry';s.heldItem=mode==='held'?'Soda':null;s.velocity.set(0,0,0);s.emote=null;
    for(let i=0;i<120;i++){s.elapsed+=1/60;g.rider.update(s,1/60,1);}
    const initial=g.rider.hands.map(h=>h.position.clone());let max=0;
    for(let i=0;i<120;i++){s.elapsed+=1/60;g.rider.update(s,1/60,1);g.rider.hands.forEach((h,j)=>max=Math.max(max,h.position.distanceTo(initial[j])));}
    check('Stable idle hands '+mode,max<.003,{maxMeters:max});
  }
  return out;
 });assert.equal(errors.length,0);writeFileSync('artifacts/fit-pass/addendum/items-input.json',JSON.stringify({checks,errors},null,2));console.log(checks);
}finally{await b.close();}
