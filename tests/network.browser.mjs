import {chromium} from 'playwright';import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';
const b=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true});const errors=[];
try{const pages=[];for(let i=0;i<3;i++){const c=await b.newContext(),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5182');await p.waitForFunction(()=>window.__LAZER?.rider.human);pages.push(p);}
await pages[0].evaluate(()=>window.__LAZER.network.connect('create','Host'));await pages[0].waitForFunction(()=>window.__LAZER.network.status==='Connected');const code=await pages[0].evaluate(()=>window.__LAZER.network.code);
await pages[1].evaluate(code=>window.__LAZER.network.connect('join','Friend',code),code);await pages[1].waitForFunction(()=>window.__LAZER.network.status==='Connected');await pages[2].evaluate(()=>window.__LAZER.network.connect('create','Other room'));await pages[2].waitForFunction(()=>window.__LAZER.network.status==='Connected');await pages[0].waitForTimeout(1500);
const states=await Promise.all(pages.map(p=>p.evaluate(()=>{const g=window.__LAZER;return {status:g.network.status,remotes:g.network.remotes.size,samples:[...g.network.remotes.values()].map(r=>r.samples.length),visible:[...g.network.remotes.values()].map(r=>r.model.root.visible),state:g.sim.state};})));console.log({states,errors});assert.deepEqual(states.map(s=>s.remotes),[1,1,0]);assert(states[0].samples[0]>0&&states[1].samples[0]>0);assert.equal(errors.length,0);
const hostId=await pages[0].evaluate(()=>window.__LAZER.network.id);
await pages[0].evaluate(()=>{const g=window.__LAZER;g.testing(true);g.sim.position.x+=3;g.sim.previousPosition.copy(g.sim.position);g.sim.body.setTranslation(g.sim.position,true);g.sim.walking=true;g.render();});
await pages[1].waitForTimeout(400);assert.equal(await pages[1].evaluate(()=>[...window.__LAZER.network.remotes.values()][0].samples.at(-1).state.walking),true);
await pages[0].evaluate(()=>{const g=window.__LAZER,s=g.sim;s.walking=false;s.reset(0,true);g.advance(.3,{ry:1},true);g.advance(.009,{ry:-1},true);s.tricks.bri.kick(1);g.advance(.08,{},true);});
await pages[1].waitForTimeout(350);assert(await pages[1].evaluate(()=>Math.abs([...window.__LAZER.network.remotes.values()][0].samples.at(-1).state.tricks.bri.angle)>.01));
await pages[0].evaluate(()=>{const g=window.__LAZER;g.sim.bail('network crash');g.advance(.2,{},true);});await pages[1].waitForTimeout(350);assert.equal(await pages[1].evaluate(()=>[...window.__LAZER.network.remotes.values()][0].samples.at(-1).state.state),'Bail');
await pages[0].evaluate(()=>{const g=window.__LAZER;g.advance(.009,{pressed:{hop:true}},true);g.advance(.08,{},true);g.advance(.009,{pressed:{hop:true}},true);g.sim.emote={id:'wave',time:.3,duration:2.4};});await pages[1].waitForTimeout(350);assert.equal(await pages[1].evaluate(()=>[...window.__LAZER.network.remotes.values()][0].samples.at(-1).state.emote.id),'wave');
await pages[0].evaluate(()=>window.__LAZER.network.ws.close());await pages[0].waitForTimeout(1800);assert.equal(await pages[0].evaluate(()=>window.__LAZER.network.id),hostId);assert.equal(await pages[1].evaluate(()=>window.__LAZER.network.remotes.size),1);
await pages[0].evaluate(()=>window.__LAZER.network.send({type:'chat',message:'<img onerror=alert(1)> hello'}));await pages[1].waitForTimeout(200);assert.equal(await pages[1].evaluate(()=>[...window.__LAZER.network.remotes.values()][0].chat),'<img onerror=alert(1)> hello');mkdirSync('artifacts/network',{recursive:true});await pages[1].screenshot({path:'artifacts/network/two-clients.png'});const previousGeneration=await pages[0].evaluate(()=>window.__LAZER.network.generation);
await pages[0].evaluate(()=>window.__LAZER.network.changeMap('techno_gravity'));
for(const p of pages.slice(0,2))await p.waitForFunction(()=>window.__LAZER.network.status==='Connected'&&window.__LAZER.network.map==='techno_gravity');
await pages[1].waitForTimeout(1000);assert.equal(await pages[1].evaluate(()=>window.__LAZER.network.remotes.size),1);
assert.notEqual(await pages[0].evaluate(()=>window.__LAZER.network.generation),previousGeneration);
assert(await pages[1].evaluate(()=>[...window.__LAZER.network.remotes.values()][0].samples.length>0));
await pages[1].screenshot({path:'artifacts/network/shop-room.png'});
assert.equal(errors.length,0,errors.join('\n'));
await pages[0].evaluate(()=>window.__LAZER.network.leave());await pages[1].waitForTimeout(150);assert.equal(await pages[1].evaluate(()=>window.__LAZER.network.owner===window.__LAZER.network.id),true);
writeFileSync('artifacts/network/checkpoint-a.json',JSON.stringify({states,errors},null,2));
}finally{await b.close();}
