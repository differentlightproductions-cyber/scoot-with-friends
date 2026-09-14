import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const stage=process.argv[2]||'after';
const folder=`artifacts/art-direction/${stage}`;mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader|THREE|WebGL/.test(m.text()))errors.push(m.text());});
try{
 const started=Date.now();await page.goto('http://127.0.0.1:5177/?map=outdoor');await page.waitForFunction(()=>window.__LAZER);
 const loadMs=Date.now()-started;
 await page.evaluate(()=>{const g=window.__LAZER;g.testing(true);g.startSession('outdoor',true);g.advance(.5,{},false);g.render();});
 await page.screenshot({path:`${folder}/01-riding.png`});
 const shots=[['02-front',[0,1.0,2.5],[0,.82,0]],['03-side',[2.4,.8,.1],[0,.64,0]],['04-hardware',[.85,.38,.98],[0,.28,.1]],['05-shoes-hands',[.7,.8,.85],[0,.56,.05]],['06-standing',[1.9,1.2,2],[0,.86,0]],['07-crouch',[1.9,.9,2],[0,.75,0]],['08-grab',[1.9,.9,2],[0,.75,0]],['09-underside',[.7,-.3,.6],[0,.15,0]]];
 for(const [name,eye,target] of shots){await page.evaluate(({name,eye,target})=>{
  const g=window.__LAZER,s=g.sim;s.charge=name.includes('crouch')?1:0;
  if(name.includes('standing')){s.walking=true;}else s.walking=false;
  if(name.includes('grab')){s.tricks.visualPose='Deck Grab';s.tricks.poseBlend=1;}else{s.tricks.visualPose='';s.tricks.poseBlend=0;}
  for(let i=0;i<50;i++)g.rider.update(s,1/60,1);
  const r=g.rider.root.position;const cam=g.camera.camera;cam.position.set(r.x+eye[0],r.y+eye[1],r.z+eye[2]);cam.lookAt(r.x+target[0],r.y+target[1],r.z+target[2]);cam.updateProjectionMatrix();g.renderer.render(g.park.scene,cam);
 },{name,eye,target});await page.screenshot({path:`${folder}/${name}.png`});}
 if(stage!=='before'){
  for(const quality of ['low','medium','high']){
   await page.evaluate(quality=>{const g=window.__LAZER;g.fidelity.apply(g.park.scene,quality);g.sim.charge=0;g.sim.tricks.poseBlend=0;g.sim.tricks.visualPose='';g.render();},quality);
   await page.screenshot({path:`${folder}/quality-${quality}.png`});
  }
  for(const angle of ['side','front','rear','under']){await page.evaluate(angle=>{
   const g=window.__LAZER,r=g.rider.root.position;g.rider.rider.visible=false;g.rider.update(g.sim,1/60,1);
   const cam=g.camera.camera,eye=angle==='side'?[1.5,.64,0]:angle==='front'?[.5,.7,1.5]:angle==='rear'?[-.6,.7,-1.4]:[.8,-.20,.4];
   cam.position.set(r.x+eye[0],r.y+eye[1],r.z+eye[2]);cam.lookAt(r.x,r.y+.54,r.z);g.renderer.render(g.park.scene,cam);
  },angle);await page.screenshot({path:`${folder}/scooter-${angle}.png`});}
  await page.evaluate(()=>window.__LAZER.rider.rider.visible=true);
  await page.evaluate(()=>{const g=window.__LAZER,b=g.park.benches.find(b=>b.id.includes('Small'))??g.park.benches[0],cam=g.camera.camera;cam.position.set(b.x+3,b.seat+1.4,b.z+3);cam.lookAt(b.x,b.seat,b.z);g.renderer.render(g.park.scene,cam);});await page.screenshot({path:`${folder}/bench-wood-rail.png`});
 }
 const metrics=await page.evaluate(async()=>{
  const g=window.__LAZER;g.sim.walking=false;g.sim.charge=0;g.sim.tricks.poseBlend=0;g.render();
  const gl=g.renderer.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info');const frames=[],animation=[];
  for(let i=0;i<90;i++){const t=performance.now();g.rider.update(g.sim,1/60,1);animation.push(performance.now()-t);g.renderer.render(g.park.scene,g.camera.camera);gl.finish();frames.push(performance.now()-t);await new Promise(requestAnimationFrame);}
  frames.sort((a,b)=>a-b);animation.sort((a,b)=>a-b);
  let bytes=0;const geometries=new Set();g.park.scene.traverse(o=>{if(o.geometry&&!geometries.has(o.geometry)){geometries.add(o.geometry);for(const a of Object.values(o.geometry.attributes))bytes+=a.array.byteLength;bytes+=o.geometry.index?.array.byteLength||0;}});
  return {browser:navigator.userAgent,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:[innerWidth,innerHeight],pixelRatio:g.renderer.getPixelRatio(),calls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles,memory:g.renderer.info.memory,geometryMB:bytes/1048576,frameMedianMs:frames[45],frame95Ms:frames[85],animationMedianMs:animation[45],animation95Ms:animation[85],note:'Headless Windows Chrome / software GPU. Synchronized render timings; not physical phone or hardware GPU performance.'};
 });metrics.loadMs=loadMs;metrics.errors=errors;writeFileSync(`${folder}/metrics.json`,JSON.stringify(metrics,null,2));console.log(metrics);
}finally{await browser.close();}
