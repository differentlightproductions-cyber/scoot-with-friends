import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
// Side views of the rider holding the bars across air pitches and up the back
// quarter's transition. Usage: LAZER_URL=http://127.0.0.1:5190 node tests/pitch-reach-visual.browser.mjs
mkdirSync('artifacts/pitch-reach',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:700,height:500}});
 await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5190')+'/?map=outdoor');
 await page.waitForFunction(()=>window.__LAZER?.rider.root.userData.characterRevision==='christian-1',null,{timeout:120000});
 await page.evaluate(async()=>{const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);document.querySelectorAll('body>*:not(canvas)').forEach(e=>e.style.display='none');});
 const image=await page.evaluate(async()=>{
  const g=window.__LAZER,s=g.sim,m=g.rider,T=await import('/node_modules/three/build/three.module.js');
  const {terrainHeight,terrainNormal}=await import('/src/park/park.ts');
  const W=260,H=300,cases=[['air -1',-1],['air -0.5',-.5],['air 0',0],['air 0.5',.5],['air 0.75',.75],['air 1',1],['ramp z=24',24],['ramp z=25.6',25.6]];
  const renderer=g.renderer,comp=document.createElement('canvas');comp.width=W*cases.length;comp.height=H;const ctx=comp.getContext('2d');
  const prev=renderer.getSize(new T.Vector2()),ratio=renderer.getPixelRatio();renderer.setPixelRatio(1);renderer.setSize(W,H,false);
  s.reset(0,true);g.advance(.3,{},false);
  cases.forEach(([label,value],k)=>{
   if(label.startsWith('air')){s.position.set(0,4,-18);s.previousPosition.copy(s.position);s.grounded=false;s.pitch=value;s.tricks.startAir(false);for(let i=0;i<40;i++)m.update(s,1/60,1);}
   else{s.reset(0,true);g.advance(.2,{},false);const z=value;s.normal.copy(terrainNormal(-9,z));s.position.set(-9,terrainHeight(-9,z)+.22/Math.max(.55,s.normal.y),z);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);s.yaw=s.previousYaw=0;s.velocity.set(0,0,5).projectOnPlane(s.normal).normalize().multiplyScalar(5);s.body.setLinvel(s.velocity,true);g.advance(1/60,{},false);for(let i=0;i<20;i++)g.advance(1/120,{},false);for(let i=0;i<20;i++)m.update(s,1/60,1);}
   m.root.updateMatrixWorld(true);
   const p=m.root.position.clone(),cam=new T.PerspectiveCamera(40,W/H,.05,200);cam.position.copy(p).add(new T.Vector3(3.6,.9,0));cam.lookAt(p.clone().add(new T.Vector3(0,.7,0)));
   renderer.render(g.park.scene,cam);ctx.drawImage(renderer.domElement,0,0,W,H,k*W,0,W,H);
   ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(k*W,0,W,22);ctx.fillStyle='#fff';ctx.font='14px sans-serif';ctx.fillText(`${label} pitch ${s.pitch.toFixed(2)} lean ${m.barLean.toFixed(2)}`,k*W+6,16);
  });
  renderer.setPixelRatio(ratio);renderer.setSize(prev.x,prev.y,false);
  return comp.toDataURL('image/png');
 });
 writeFileSync('artifacts/pitch-reach/side.png',Buffer.from(image.split(',')[1],'base64'));
 console.log('wrote artifacts/pitch-reach/side.png');
}finally{await browser.close();}
