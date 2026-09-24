import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';

// Headless review of the decorative nature assets (pine trees, camellia shrubs,
// sky clouds): how many copies of each exist in the scene, whether the old
// procedural fallbacks are really hidden, and whether each authored tree/shrub
// rests on the real terrain surface. Writes numbers to artifacts/nature/report.json
// and screenshots next to it. Usage: LAZER_URL=http://127.0.0.1:5190 node tests/nature-review.browser.mjs
const folder='artifacts/nature';mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1100,height:900}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5190')+'/?map=outdoor');
 await page.waitForFunction(()=>window.__LAZER?.rider,null,{timeout:90000});
 await page.evaluate(async()=>{const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);});
 await page.waitForFunction(()=>{const s=window.__LAZER.park.scene;return s.getObjectByName('Detailed trees')&&s.getObjectByName('Detailed shrubs')&&s.getObjectByName('Sky clouds');},null,{timeout:60000});
 await page.waitForTimeout(1500);
 const report=await page.evaluate(()=>{
  const g=window.__LAZER,scene=g.park.scene;
  const visibleInTree=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
  const named={};
  scene.traverse(o=>{if(['tree-trunks','tree-crowns','Detailed trees','bushes','Detailed shrubs','Sky clouds'].includes(o.name)){(named[o.name]??=[]).push({count:o.count,visible:visibleInTree(o)});}});
  const instances=(mesh,sourceMinY)=>{
   const a=mesh.instanceMatrix.array,rows=[];
   for(let i=0;i<mesh.count;i++){
    const o=i*16,x=a[o+12],y=a[o+13],z=a[o+14],sy=Math.hypot(a[o+4],a[o+5],a[o+6]);
    const ground=g.terrainHeight(x,z);
    rows.push({i,x:+x.toFixed(2),z:+z.toFixed(2),baseY:+y.toFixed(3),ground:+ground.toFixed(3),lowestVertexAboveGround:+(y+sourceMinY*sy-ground).toFixed(3),scale:+sy.toFixed(2)});
   }
   return rows;
  };
  const out={named,trees:[],shrubs:[]};
  for(const [name,key] of [['Detailed trees','trees'],['Detailed shrubs','shrubs']]){
   const mesh=scene.getObjectByName(name);mesh.geometry.computeBoundingBox();
   out[key]=instances(mesh,mesh.geometry.boundingBox.min.y);
  }
  return out;
 });
 const gap=rows=>{const v=rows.filter(r=>r.baseY>-1).map(r=>r.lowestVertexAboveGround);return {n:v.length,min:Math.min(...v),max:Math.max(...v),buried:v.filter(n=>n<-0.02).length,floating:v.filter(n=>n>0.05).length};};
 report.treeGap=gap(report.trees);report.shrubGap=gap(report.shrubs);report.errors=errors;
 writeFileSync(`${folder}/report.json`,JSON.stringify(report,null,1));
 console.log('scene objects by name:',JSON.stringify(report.named));
 console.log('trees vs terrain:',JSON.stringify(report.treeGap));
 console.log('shrubs vs terrain:',JSON.stringify(report.shrubGap));
 // Ground-level views of a few real trees plus a wide view from the ride line.
 const shots=await page.evaluate(()=>{
  const g=window.__LAZER,scene=g.park.scene,mesh=scene.getObjectByName('Detailed trees'),a=mesh.instanceMatrix.array;
  document.querySelectorAll('body>*:not(canvas)').forEach(e=>e.style.display='none');
  const cam=g.camera.camera.clone(),out=[];
  const shoot=(name,pos,look)=>{cam.position.set(...pos);cam.lookAt(...look);cam.aspect=1100/900;cam.updateProjectionMatrix();g.renderer.render(scene,cam);out.push({name,image:g.renderer.domElement.toDataURL('image/png')});};
  for(const i of [0,2,5]){
   const o=i*16,x=a[o+12],z=a[o+14],ground=g.terrainHeight(x,z),h=a[o+5]*0.984;
   shoot(`tree-${i}-near`,[x+h*1.3,ground+1.6,z+h*1.3],[x,ground+h*0.45,z]);
   shoot(`tree-${i}-base`,[x+3.2,ground+0.9,z+3.2],[x,ground+0.6,z]);
  }
  const x=a[12],z=a[14],ground=g.terrainHeight(x,z);
  shoot('park-wide',[0,4,-8],[0,3,40]);
  shoot('lawn-east',[46,1.8,12],[20,0.3,12]);
  shoot('lawn-west',[-58,1.8,-18],[-30,0.3,-18]);
  shoot('lawn-low',[30,0.9,-14],[10,0.05,-14]);
  return out;
 });
 for(const s of shots)writeFileSync(`${folder}/${s.name}.png`,Buffer.from(s.image.split(',')[1],'base64'));
 console.log(`${shots.length} screenshots written to ${folder}; page errors: ${errors.length}`);
}finally{await browser.close();}
