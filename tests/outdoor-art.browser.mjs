import {chromium} from 'playwright';
import assert from 'node:assert/strict';

// The generated outdoor art kit (src/art): the sky dome lights the scene, the
// Mojave floor and ranges surround the park with a landscaped rock border, the
// park's Aleppo pines and the desert scatter stand on the ground, nothing is
// downloaded for them, and lower fidelity thins the scatter.
// Usage: LAZER_URL=http://127.0.0.1:5190 node tests/outdoor-art.browser.mjs
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:900,height:700}});
 const errors=[],models=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/\/models\/(nature|park)\//.test(r.url()))models.push(r.url());});
 await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5190')+'/?map=outdoor');
 await page.waitForFunction(()=>window.__LAZER?.rider,null,{timeout:90000});
 const state=await page.evaluate(async()=>{
  const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);
  for(let i=0;i<40;i++)g.advance(1/30);g.render();
  const s=g.park.scene,THREE=await import('/node_modules/.vite/deps/three.js');
  const sky=s.getObjectByName('Sky dome'),desert=s.getObjectByName('Desert floor and ranges');
  const byName=name=>{const list=[];s.traverse(o=>{if(o.isInstancedMesh&&o.name===name)list.push(o);});return list;};
  // Every pine's base sits on the park ground; every desert plant on the desert floor.
  const ray=new THREE.Raycaster(),m=new THREE.Matrix4(),p=new THREE.Vector3();
  const seat=(meshes,ground)=>{const gaps=[];for(const mesh of meshes){for(let i=0;i<mesh.count;i+=Math.max(1,Math.floor(mesh.count/25))){mesh.getMatrixAt(i,m);p.setFromMatrixPosition(m);gaps.push(p.y-ground(p.x,p.z));}}return gaps;};
  const floor=(x,z)=>{ray.set(new THREE.Vector3(x,400,z),new THREE.Vector3(0,-1,0));return ray.intersectObject(desert)[0]?.point.y??NaN;};
  const pines=byName('tree-pines'),creosote=byName('desert creosote'),boulders=byName('desert boulders');
  const count=list=>list.reduce((n,o)=>n+o.count,0);
  const before={creosote:count(creosote),boulders:count(boulders)};
  g.fidelity.apply(s,'low');const low={creosote:count(creosote),boulders:count(boulders)};
  g.fidelity.apply(s,'high');const high={creosote:count(creosote),boulders:count(boulders)};
  return {
   sky:!!sky,skyFollows:sky&&sky.material.depthWrite===false&&sky.material.toneMapped===false,
   environment:!!s.environment&&s.environment===s.userData.skyEnvironment,
   fogMatchesHorizon:s.fog&&s.userData.sky&&s.fog.color.getHex()===s.userData.sky.horizon.getHex(),
   desert:!!desert,ranges:desert?Math.max(...Array.from({length:36},(_,i)=>floor(Math.cos(i/36*6.283)*1150,-20+Math.sin(i/36*6.283)*1150))):0,
   curbs:(()=>{let n=0;s.traverse(o=>{if(o.name==='Mow curb')n++;});return n;})(),
   pineCount:count(pines),pineGaps:seat(pines,(x,z)=>g.terrainHeight(x,z)),
   creosoteGaps:seat(creosote,floor),before,low,high,
   oldObjects:['Detailed trees','Detailed shrubs','Sky clouds','tree-trunks','tree-crowns'].filter(n=>s.getObjectByName(n)),
  };
 });
 console.log(JSON.stringify({...state,pineGaps:[Math.min(...state.pineGaps).toFixed(3),Math.max(...state.pineGaps).toFixed(3)],creosoteGaps:[Math.min(...state.creosoteGaps).toFixed(3),Math.max(...state.creosoteGaps).toFixed(3)]}));
 assert.ok(state.sky&&state.skyFollows,'the sky dome is drawn behind everything');
 assert.ok(state.environment,'the scene is lit by the sky environment');
 assert.ok(state.fogMatchesHorizon,'distance fades into the horizon colour');
 assert.ok(state.desert,'the desert floor surrounds the park');
 assert.ok(state.ranges>150,`mountain ranges rise around the horizon (${state.ranges.toFixed(0)} m)`);
 assert.equal(state.curbs,4,'a mow curb finishes each lawn edge');
 assert.ok(state.pineCount>=10,'the park has its Aleppo pines');
 for(const gap of state.pineGaps)assert.ok(Math.abs(gap+0.05)<0.08,`pine base sits on the ground (${gap})`);
 for(const gap of state.creosoteGaps)assert.ok(gap<0.08&&gap>-0.3,`creosote sits on the desert floor (${gap})`);
 assert.ok(state.low.creosote<state.high.creosote*0.5&&state.low.boulders<state.high.boulders,'low fidelity thins the desert scatter');
 assert.equal(state.high.creosote,state.before.creosote,'high fidelity keeps the full scatter');
 assert.deepEqual(state.oldObjects,[],'the retired downloaded nature models are gone');
 assert.deepEqual(models,[],'no park or nature models are downloaded');
 assert.deepEqual(errors,[]);
 console.log('outdoor art: sky, desert, border, pines and scatter all in place');
}finally{await browser.close();}
