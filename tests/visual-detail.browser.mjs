import {chromium} from 'playwright';
import {writeFileSync,mkdirSync} from 'node:fs';
// artifacts/ is gitignored, so these output directories do not exist in a fresh clone.
mkdirSync('artifacts',{recursive:true});
const b=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1440,height:900}});
try{
 await p.goto('http://127.0.0.1:5174/');await p.waitForFunction(()=>window.__LAZER);
 await p.evaluate(()=>{const g=window.__LAZER;g.testing(true);g.exitToMenu();g.render();});
 await p.screenshot({path:'artifacts/character-detail.png'});
 const metrics=await p.evaluate(()=>{
  const g=window.__LAZER;g.startSession('outdoor',true);g.testing(true);g.advance(.5,{},false);
  g.camera.orbit=.7;g.render();
  const samples=[];for(let i=0;i<240;i++){const t=performance.now();g.advance(1/120,{held:{pushDeck:1}},false);samples.push(performance.now()-t);}
  samples.sort((a,b)=>a-b);g.render();
  let geometryBytes=0;const unique=new Set();g.park.scene.traverse(o=>{if(o.geometry&&!unique.has(o.geometry)){unique.add(o.geometry);Object.values(o.geometry.attributes).forEach(a=>geometryBytes+=a.array.byteLength);geometryBytes+=o.geometry.index?.array.byteLength??0;}});
  return {drawCalls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles,textures:g.renderer.info.memory.textures,geometries:g.renderer.info.memory.geometries,geometryMB:geometryBytes/1024/1024,physicsStepMedianMs:samples[120],physicsStep95Ms:samples[228],renderer:'headless SwiftShader; not a hardware GPU FPS benchmark'};
 });console.log(metrics);writeFileSync('artifacts/performance-detail.json',JSON.stringify(metrics,null,2));
 await p.screenshot({path:'artifacts/park-detail.png'});
}finally{await b.close();}
