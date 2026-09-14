import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const software=process.argv.includes('--software');const folder='artifacts/complete-update/character-'+(software?'paired-software':'paired');mkdirSync(folder,{recursive:true});
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:[...(software?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]),'--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const results=[];
try{for(const [label,port,quality] of [['before',5177,null],['low',5180,'low'],['medium',5180,'medium'],['high',5180,'high']]){
 const p=await b.newPage({viewport:{width:1440,height:900}});const start=Date.now();await p.goto(`http://127.0.0.1:${port}/?map=outdoor`);await p.waitForFunction(()=>window.__LAZER);const loadMs=Date.now()-start;
 const result=await p.evaluate(async quality=>{
  const g=window.__LAZER;g.testing(true);g.startSession('outdoor',true);if(quality){g.profile.settings.characterQuality=quality;g.rider.applyProfile(g.profile);while(g.rider.human?.quality!==quality)await new Promise(r=>setTimeout(r,30));}await new Promise(r=>setTimeout(r,250));g.advance(.3,{},false);
  const cam=g.camera.camera,gl=g.renderer.getContext(),pixel=new Uint8Array(4),frames=[],animation=[];
  const draw=()=>{const r=g.rider.root.position;cam.position.set(r.x+.25,r.y+2.3,r.z-3.8);cam.lookAt(r.x,r.y+.9,r.z+.3);cam.updateProjectionMatrix();g.renderer.render(g.park.scene,cam);};
  for(let i=0;i<90;i++){
   const started=performance.now();g.advance(1/60,{held:{pushDeck:1}},false);const a=performance.now();g.rider.update(g.sim,1/60,1);animation.push(performance.now()-a);draw();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);if(i>=10)frames.push(performance.now()-started);
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  frames.sort((a,b)=>a-b);animation.sort((a,b)=>a-b);const extension=gl.getExtension('WEBGL_debug_renderer_info');
  return {browser:navigator.userAgent,gpu:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):'',quality:quality??'previous release',viewport:[innerWidth,innerHeight],pixelRatio:g.renderer.getPixelRatio(),frameMedianMs:frames[40],frame95Ms:frames[76],animationMedianMs:animation[45],animation95Ms:animation[85],drawCalls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles,textures:g.renderer.info.memory.textures,position:g.sim.position.toArray(),physicsTimestep:g.park.world.timestep};
 },quality);
 result.loadMs=loadMs;results.push({label,...result});await p.screenshot({path:`${folder}/${label}.png`});await p.close();console.log(label,result.frameMedianMs);
}writeFileSync(folder+'/metrics.json',JSON.stringify({hardware:software?'Intel Core i5-13500; SwiftShader software rendering':'Intel Core i5-13500; NVIDIA RTX 4060 Ti / Direct3D11',method:'Same 1440×900 viewport, mapped X push route, following camera, 90 steps, final 80 render/physics timings with a blocking pixel read. This short controlled workload is not a sustained hardware or phone benchmark.',results},null,2));}finally{await b.close();}

