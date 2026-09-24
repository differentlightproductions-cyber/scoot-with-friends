import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
// Clamp Grab (RT + RB in the air) through real hops: same buttons in both
// stances, the stance-side hand on the clamp and the other on the bar, hold and
// release, quarter air, bunny hop, 180 and backflip combinations, no extra
// jump/spin, and no snapping of the hand while it reaches and returns.
// Usage: LAZER_URL=http://127.0.0.1:5190 node tests/clamp-grab.browser.mjs
const folder='artifacts/clamp-grab';mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:900,height:700}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5190')+'/?map=outdoor');
 await page.waitForFunction(()=>window.__LAZER?.rider.root.userData.characterRevision==='christian-1',null,{timeout:120000});
 await page.evaluate(async()=>{const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);});
 const results=await page.evaluate(async()=>{
  const g=window.__LAZER,s=g.sim,m=g.rider,T=await import('/node_modules/three/build/three.module.js');
  const {terrainHeight,terrainNormal}=await import('/src/park/park.ts');
  const {modules,rampLips}=await import('/src/park/outdoor.ts');
  const a=(t,f={})=>g.advance(t,f,false);
  let sk;m.human.mesh.traverse(o=>{if(o.isSkinnedMesh&&!sk)sk=o;});
  const by=n=>sk.skeleton.bones.find(b=>b.name==='mixamorig'+n);
  const sample=()=>{
   g.rider.update(s,1/120,1);m.root.updateMatrixWorld(true);sk.skeleton.update();
   const inv=m.rider.matrixWorld.clone().invert(),pos=n=>new T.Vector3().setFromMatrixPosition(by(n).matrixWorld.clone().premultiply(inv));
   const clampIdx=s.tricks.stance==='regular'?0:1,r={wrist:[null,null],barGap:null,clampGap:null,reach:[0,0]};
   for(const S of ['Left','Right']){
    const k=pos(S+'Arm').x<0?0:1,wrist=pos(S+'Hand'),mid=pos(S+'HandMiddle1'),sh=pos(S+'Arm');
    r.wrist[k]=wrist;r.reach[k]=sh.distanceTo(wrist)/m.human.armReach[k];
    const seg=new T.Line3(wrist,mid);
    if(k!==clampIdx){const sock=m.rider.worldToLocal(m.assembly.gripSockets[k].getWorldPosition(new T.Vector3()));r.barGap=seg.closestPointToPoint(sock,true,new T.Vector3()).distanceTo(sock)-(m.hands[k].userData.gripRadius??.0165);}
    else{const an=m.rider.worldToLocal(m.assembly.clampGrabAnchor.getWorldPosition(new T.Vector3()));r.clampGap=seg.closestPointToPoint(an,true,new T.Vector3()).distanceTo(an)-(m.assembly.clampGrabAnchor.userData.radius??.03);}
   }
   return r;
  };
  const run=(name,{stance='regular',style='pro',where='flat',start=.05,end=9,script=()=>({}),chord={pumpGrind:1,rightModifier:1}})=>{
   s.reset(0,true);a(.3);s.tricks.stance=stance;s.tricks.controlStyle=style;
   let x=0,z=-10,dir=1,speed=4;
   if(where==='quarter'){const q=modules.find(q=>q.kind==='quarter');dir=q.reverse?-1:1;z=rampLips(q)[0]-dir*.65;x=-9;speed=9;}
   s.position.set(x,terrainHeight(x,z)+.22,z);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);s.yaw=s.previousYaw=dir===1?0:Math.PI;
   if(where==='quarter')s.normal.copy(terrainNormal(x,z));
   s.velocity.set(0,0,dir*speed);s.speed=speed;a(where==='quarter'?.01:.4);
   const before=g.events.history.length;
   s.preload.amount=.65;s.preload.dwell=.2;s.preload.armed=true;a(1/120,{ry:1});a(1/120,{ry:-1});
   let airStart=null,t=0,landedAt=null,maxBlend=0,peakY=-1e9,minY=1e9,maxYaw=0,firstHeld=null,releasedAt=null,prevWrist=null,maxJump=0,worstBar=0,worstClamp=0,worstReach=0,pose=new Set(),holdFrames=0;
   for(let i=0;i<900;i++){
    if(!s.grounded&&airStart===null)airStart=t;
    const tAir=airStart===null?-1:t-airStart;
    const holding=airStart!==null&&tAir>=start&&tAir<end;
    let input=airStart===null?{}:script(tAir);
    if(holding)input={...input,held:{...(input.held??{}),...chord}};
    a(1/120,input);t+=1/120;
    if(airStart!==null){
     peakY=Math.max(peakY,s.position.y);minY=Math.min(minY,s.position.y);maxYaw=Math.max(maxYaw,Math.abs(s.tricks.yaw));
     const b=s.tricks.visualPose==='Clamp Grab'?s.tricks.poseBlend:0;maxBlend=Math.max(maxBlend,b);if(s.tricks.visualPose)pose.add(s.tricks.visualPose);
     if(b>.95&&firstHeld===null)firstHeld=+tAir.toFixed(2);
     if(firstHeld!==null&&b<.95&&releasedAt===null)releasedAt=+tAir.toFixed(2);
     if(b>.05&&s.state!=='Bail'){
      const r=sample(),ci=stance==='regular'?0:1;
      if(prevWrist)maxJump=Math.max(maxJump,r.wrist[ci].distanceTo(prevWrist));
      prevWrist=r.wrist[ci];
      if(b>.95){holdFrames++;worstBar=Math.max(worstBar,r.barGap);worstClamp=Math.max(worstClamp,r.clampGap);worstReach=Math.max(worstReach,...r.reach);}
     }else prevWrist=null;
    }
    if(airStart!==null&&(s.grounded||s.state==='Bail')){landedAt=t;break;}
   }
   const endBlend=s.tricks.poseBlend;const state=s.state;a(.3);
   const events=g.events.history.slice(before).filter(e=>e.type==='trick'||e.type==='landing'||e.type==='bail').map(e=>e.type==='trick'?'trick:'+e.name:e.type==='landing'?'landing:'+e.quality:'bail:'+e.reason);
   const f=n=>+n.toFixed(3);
   return {name,stance,airtime:airStart!==null&&landedAt!==null?f(landedAt-airStart):null,rise:f(peakY-minY),maxYawDeg:Math.round(maxYaw*180/Math.PI),maxBlend:f(maxBlend),reachedAt:firstHeld,letGoAt:releasedAt,blendAtTouchdown:f(endBlend),holdFrames,barGap:f(worstBar),clampGap:f(worstClamp),maxArmReach:f(worstReach),maxHandStepCm:f(maxJump*100),poses:[...pose],events,endState:state};
  };
  const out=[];
  out.push(run('baseline plain hop',{start:99}));
  out.push(run('1 regular RT+RB bunny hop (hold to landing)',{}));
  out.push(run('2 goofy RT+RB bunny hop (same buttons)',{stance:'goofy'}));
  out.push(run('3 regular hold then release mid-air',{start:.1,end:.5}));
  out.push(run('3b goofy hold then release mid-air',{stance:'goofy',start:.1,end:.5}));
  out.push(run('4 regular quarter air',{where:'quarter',start:.15}));
  out.push(run('4b goofy quarter air',{stance:'goofy',where:'quarter',start:.15}));
  out.push(run('5 regular arcade RT+RB',{style:'arcade'}));
  out.push(run('6 regular 180 + clamp',{script:t=>t<.45?{steer:1}:{}}));
  out.push(run('7 goofy 180 + clamp',{stance:'goofy',script:t=>t<.45?{steer:1}:{}}));
  out.push(run('8 regular backflip + clamp',{script:()=>({held:{brake:1},lean:1}),chord:{pumpGrind:1,rightModifier:1}}));
  out.push(run('8b regular frontflip + clamp',{script:()=>({held:{brake:1},lean:-1}),chord:{pumpGrind:1,rightModifier:1}}));
  out.push(run('8c goofy backflip + clamp',{stance:'goofy',script:()=>({held:{brake:1},lean:1})}));
  return out;
 });
 for(const r of results)console.log(JSON.stringify(r));
 writeFileSync(`${folder}/results.json`,JSON.stringify({results,errors},null,1));
 console.log('page errors:',errors.length);
}finally{await browser.close();}
