import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
// Holding the bars at any pitch: in the air (quarter-pipe airs carry up to
// ~1 rad of pitch) and on a steep transition, both hands must stay on the grips
// without over-stretching the arms, and the end of a Bri at a steep pitch must
// not move the scooter (the old 0.17 m catch pop).
// Usage: LAZER_URL=http://127.0.0.1:5190 node tests/pitch-reach.browser.mjs
mkdirSync('artifacts/pitch-reach',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:700,height:500}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5190')+'/?map=outdoor');
 await page.waitForFunction(()=>window.__LAZER?.rider.root.userData.characterRevision==='avatar-1',null,{timeout:120000});
 await page.evaluate(async()=>{const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);});
 const out=await page.evaluate(async()=>{
  const g=window.__LAZER,s=g.sim,m=g.rider,T=await import('/node_modules/three/build/three.module.js');
  const {terrainHeight,terrainNormal}=await import('/src/park/park.ts');
    const bone=n=>m.avatar.bone(n);
  const measure=()=>{
   m.root.updateMatrixWorld(true);
   const inv=m.rider.matrixWorld.clone().invert(),pos=n=>new T.Vector3().setFromMatrixPosition(bone(n).matrixWorld.clone().premultiply(inv));
   const r={palm:[0,0],stretch:[0,0]};
   for(const S of ['Left','Right']){
    const k=pos(S+'Arm').x<0?0:1,wrist=pos(S+'Hand'),mid=pos(S+'HandMiddle1'),sh=pos(S+'Arm');
    const socket=m.rider.worldToLocal(m.assembly.gripSockets[k].getWorldPosition(new T.Vector3()));
    const cp=new T.Line3(wrist,mid).closestPointToPoint(socket,true,new T.Vector3());
    r.palm[k]=+(cp.distanceTo(socket)-(m.hands[k].userData.gripRadius??.02)).toFixed(3);
    r.stretch[k]=+(sh.distanceTo(wrist)/m.avatar.armReach[k]).toFixed(3);
   }
   return r;
  };
  const rows=[];
  s.reset(0,true);g.advance(.3,{},false);
  // Airborne at a range of pitches, no trick: settle the damped pose, then measure.
  for(const pitch of [-1,-.75,-.5,-.25,0,.25,.5,.75,1]){
   s.position.set(0,4,-18);s.previousPosition.copy(s.position);s.grounded=false;s.pitch=pitch;s.roll=0;s.tricks.startAir(false);
   for(let i=0;i<60;i++)m.update(s,1/60,1);
   rows.push({case:'air pitch '+pitch,...measure()});
  }
  // The end of a Bri at a steep pitch: last frame of the spin, then the catch.
  const pops=[];
  for(const pitch of [-.75,.5,.75,1])for(const dt of [1/30,1/60,1/120]){
   s.position.set(0,4,-18);s.previousPosition.copy(s.position);s.grounded=false;s.pitch=pitch;s.tricks.startAir(false);
   for(let i=0;i<30;i++)m.update(s,1/60,1);
   s.tricks.bri.target=2*Math.PI;s.tricks.bri.angle=2*Math.PI-.001;s.tricks.bri.velocity=1;m.update(s,dt,1);m.root.updateMatrixWorld(true);
   const before=m.scooter.getWorldPosition(new T.Vector3());
   s.tricks.bri.angle=2*Math.PI;s.tricks.bri.velocity=0;m.update(s,dt,1);m.root.updateMatrixWorld(true);
   pops.push({pitch,dt:+dt.toFixed(4),pop:+before.distanceTo(m.scooter.getWorldPosition(new T.Vector3())).toFixed(4)});
   s.tricks.bri.reset();
  }
  // Grounded up the back quarter's transition.
  s.tricks.startAir(false);s.tricks.finish('clean');
  for(const z of [23,24,25,25.6]){
   s.reset(0,true);g.advance(.2,{},false);
   s.normal.copy(terrainNormal(-9,z));s.position.set(-9,terrainHeight(-9,z)+.22/Math.max(.55,s.normal.y),z);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);s.yaw=s.previousYaw=0;
   s.velocity.set(0,0,5).projectOnPlane(s.normal).normalize().multiplyScalar(5);s.body.setLinvel(s.velocity,true);
   g.advance(1/60,{},false);for(let i=0;i<20;i++){g.advance(1/120,{},false);}m.update(s,1/60,1);
   rows.push({case:`ramp z=${z} pitch ${s.pitch.toFixed(2)} grounded ${s.grounded}`,...measure()});
  }
  return {rows,pops};
 });
 for(const r of out.rows)console.log(JSON.stringify(r));
 for(const p of out.pops)console.log(JSON.stringify(p));
 writeFileSync('artifacts/pitch-reach/results.json',JSON.stringify(out,null,1));
 const worstPalm=Math.max(...out.rows.flatMap(r=>r.palm)),worstStretch=Math.max(...out.rows.flatMap(r=>r.stretch)),worstPop=Math.max(...out.pops.map(p=>p.pop));
 console.log('worst palm gap',worstPalm,'worst stretch',worstStretch,'worst catch pop',worstPop);
 assert.ok(worstPalm<.03,'hands on the grips at every pitch');
 assert.ok(worstStretch<1.02,'arms within reach');
 assert.ok(worstPop<.01,'no Bri catch pop');
 assert.equal(errors.length,0,errors.join('; '));
 console.log('PITCH REACH PASS');
}finally{await browser.close();}
