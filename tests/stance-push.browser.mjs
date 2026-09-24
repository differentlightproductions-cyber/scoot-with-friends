import {chromium} from 'playwright';
import assert from 'node:assert/strict';
// Which real foot pushes in each stance, measured from the skinned skeleton in
// rider space (rider faces +z, so its RIGHT side is -x and its LEFT is +x; the
// imported skeleton's own Left/Right names are mirrored and are not used).
// Regular: right foot pushes, left stays on the deck. Goofy: the reverse.
// Also checks a held push repeats, and that fakie and the return from fakie
// never change the configured stance or swap the push foot.
// Usage: LAZER_URL=http://127.0.0.1:5190 node tests/stance-push.browser.mjs
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:900,height:700}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5190')+'/?map=outdoor');
 await page.waitForFunction(()=>window.__LAZER?.rider.root.userData.characterRevision==='christian-1',null,{timeout:120000});
 await page.evaluate(async()=>{const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);});
 const results=await page.evaluate(async()=>{
  const g=window.__LAZER,s=g.sim,m=g.rider,T=await import('/node_modules/three/build/three.module.js');
  const {terrainHeight}=await import('/src/park/park.ts');
  const {ridingButtons}=await import('/src/input/riding.ts');
  const a=(t,f={})=>g.advance(t,f,false);
  let sk;m.human.mesh.traverse(o=>{if(o.isSkinnedMesh&&!sk)sk=o;});
  const bone=n=>sk.skeleton.bones.find(b=>b.name==='mixamorig'+n);
  const feet=(settle=false)=>{for(let k=0;k<(settle?40:1);k++)g.rider.update(s,1/120,1);m.root.updateMatrixWorld(true);sk.skeleton.update();const inv=m.rider.matrixWorld.clone().invert();
   const p=n=>new T.Vector3().setFromMatrixPosition(bone(n).matrixWorld.clone().premultiply(inv));
   // Sort by lateral side rather than by bone name: index 0 = rider's right (-x).
   const l=p('LeftFoot'),r=p('RightFoot');return l.x<r.x?{right:l,left:r}:{right:r,left:l};};
  const place=(stance,speed,reverse=false)=>{
   s.reset(0,true);a(.3);s.tricks.stance=stance;
   const x=0,z=-10;s.position.set(x,terrainHeight(x,z)+.22,z);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);s.yaw=s.previousYaw=0;
   s.velocity.set(0,0,reverse?-speed:speed);s.body.setLinvel({x:0,y:0,z:reverse?-speed:speed},true);s.speed=speed;a(.3);
  };
  const out={};
  for(const stance of ['regular','goofy']){
   const button=ridingButtons(stance,'pro').push;
   // 1. Mounted idle: which foot is forward on the deck.
   place(stance,0);const idle=feet(true);
   const row={stance,pushButton:button,idleFront:idle.left.z>idle.right.z?'left':'right'};
   // 2/3. Held push from a standstill: sample the feet through several cycles.
   place(stance,0);
   let excursion={left:0,right:0},cycles=0,lastTimer=0,pushes=0;const before=g.events.history.length;
   for(let i=0;i<360;i++){
    a(1/120,{held:{[button]:1},pressed:i===0?{[button]:true}:{}});
    if(s.pushTimer>lastTimer+.2)cycles++;lastTimer=s.pushTimer;
    if(i%2===0){const f=feet();excursion.left=Math.max(excursion.left,Math.abs(f.left.x)-.05,f.left.y-.25);excursion.right=Math.max(excursion.right,Math.abs(f.right.x)-.05,f.right.y-.25);}
   }
   row.pushFoot=excursion.left>excursion.right?'left':'right';row.excursion=excursion;row.pushCycles=cycles;row.pushEvents=g.events.history.slice(before).filter(e=>e.type==='push').length;
   row.stanceAfterPush=s.tricks.stance;
   // 4. Fakie: roll backwards, coast, then steer to revert to forward and push again.
   place(stance,3,true);
   for(let i=0;i<12;i++)a(1/120,{});
   row.fakieMode=s.fakie.mode;row.stanceInFakie=s.tricks.stance;
   const fakieIdle=feet(true);row.fakieFront=fakieIdle.left.z>fakieIdle.right.z?'left':'right';
   for(let i=0;i<360&&s.fakie.mode!=='Forward';i++)a(1/120,{steer:1});
   row.modeAfterRevert=s.fakie.mode;row.stanceAfterReturn=s.tricks.stance;
   {const sp=2,vx=Math.sin(s.yaw)*sp,vz=Math.cos(s.yaw)*sp;s.velocity.set(vx,0,vz);s.body.setLinvel({x:vx,y:0,z:vz},true);a(.2);row.modeWhenPushing=s.fakie.mode;row.dbg={pos:s.position.toArray().map(n=>+n.toFixed(1)),ny:+s.normal.y.toFixed(3),yaw:+s.yaw.toFixed(2),speed:+s.speed.toFixed(2),state:s.state,rampLean:+s.rampLean.toFixed(2)};}
   excursion={left:0,right:0};let cycles2=0,lastTimer2=0;
   for(let i=0;i<240;i++){a(1/120,{held:{[button]:1},pressed:i===0?{[button]:true}:{}});if(s.pushTimer>lastTimer2+.2)cycles2++;lastTimer2=s.pushTimer;if(i%2===0){const f=feet();excursion.left=Math.max(excursion.left,Math.abs(f.left.x)-.05,f.left.y-.25);excursion.right=Math.max(excursion.right,Math.abs(f.right.x)-.05,f.right.y-.25);}}
   row.pushFootAfterFakie=excursion.left>excursion.right?'left':'right';row.pushCyclesAfterFakie=cycles2;
   out[stance]=row;
  }
  return out;
 });
 console.log(JSON.stringify(results,null,1));
 const exp={regular:{push:'right',front:'left'},goofy:{push:'left',front:'right'}};
 for(const [stance,r] of Object.entries(results)){
  assert.equal(r.idleFront,exp[stance].front,`${stance}: front foot on the deck at idle`);
  assert.equal(r.pushFoot,exp[stance].push,`${stance}: pushing foot`);
  assert.ok(r.pushCyclesAfterFakie>=2,`${stance}: pushes after fakie (${r.pushCyclesAfterFakie})`);assert.equal(r.modeWhenPushing,'Forward',`${stance}: pushing forward again`);assert.equal(r.pushFootAfterFakie,exp[stance].push,`${stance}: pushing foot after returning from fakie`);
  assert.equal(r.fakieFront,exp[stance].front,`${stance}: front foot while rolling fakie`);
  assert.equal(r.fakieMode,'Fakie',`${stance}: really rolling fakie`);assert.equal(r.modeAfterRevert,'Forward',`${stance}: returned from fakie`);assert.equal(r.stanceAfterPush,stance);assert.equal(r.stanceInFakie,stance);assert.equal(r.stanceAfterReturn,stance);
  assert.ok(r.pushCycles>=2,`${stance}: a held push repeats (${r.pushCycles} cycles)`);
 }
 assert.deepEqual(errors,[]);
 console.log('stance push checks pass');
}finally{await browser.close();}
