import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
// Drives real hops through the production simulation and checks the Decade:
// a tap of LB in the air (same button in every stance and control style), one
// natural revolution of the rider round the front of the scooter paced to the
// air, the deck held still in the world, the legs drawn up together (not a
// whip kick), catch, landing, naming, combinations, a late tap that must bail,
// and no Decade over a Bri / Inward (or Bri over a Decade).
// Usage: LAZER_URL=http://127.0.0.1:5190 node tests/decade.browser.mjs
const folder='artifacts/decade';mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:900,height:700}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5190')+'/?map=outdoor');
 await page.waitForFunction(()=>window.__LAZER?.rider,null,{timeout:90000});
 await page.evaluate(async()=>{const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);});
 const results=await page.evaluate(async()=>{
  const g=window.__LAZER,s=g.sim,m=g.rider,THREE=m.root.constructor.prototype.isObject3D?null:null;
  const dt=1/120,a=(t,f={})=>g.advance(t,f,false);
  const {terrainHeight,terrainNormal}=await import('/src/park/park.ts');
  const {modules,rampLips}=await import('/src/park/outdoor.ts');
  const V=()=>new m.root.position.constructor(),Q=()=>new m.root.quaternion.constructor();
  // script(tAir) -> extra input for that frame; LB is tapped (10 frames) at `press` seconds after takeoff.
  const run=(name,{stance='regular',style='pro',preload=.65,press=.03,speed=4,where='flat',script=()=>({}),noTap=false,watch=false})=>{
   s.reset(0,true);a(.3);s.tricks.stance=stance;s.tricks.controlStyle=style;
   let x=0,z=-10,dir=1;
   if(where==='quarter'){const mod=modules.find(q=>q.kind==='quarter');dir=mod.reverse?-1:1;z=rampLips(mod)[0]-dir*.65;x=-9;speed=9;}
   s.position.set(x,terrainHeight(x,z)+.22,z);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);s.yaw=s.previousYaw=dir===1?0:Math.PI;
   if(where==='quarter')s.normal.copy(terrainNormal(x,z));
   s.velocity.set(0,0,dir*speed);s.speed=speed;a(where==='quarter'?.01:.4);
   const before=g.events.history.length;
   s.preload.amount=preload;s.preload.dwell=.2;s.preload.armed=true;
   a(dt,{ry:1});a(dt,{ry:-1});
   let airStart=null,tapped=false,tapLeft=0,landedAt=null,t=0,maxAng=0,minY=1e9,maxY=-1e9,maxYaw=0,maxFlip=0,decStart=null,decCaught=null;
   let deckMove=0,deckTurn=0,feetApart=0,orbitErr=0,maxRate=0,prevAng=0;const phases=new Set();
   for(let i=0;i<900;i++){
    if(!s.grounded&&airStart===null)airStart=t;
    const tAir=airStart===null?-1:t-airStart;
    let input=airStart===null?{}:script(tAir);
    if(airStart!==null&&!tapped&&!noTap&&tAir>=press){tapped=true;tapLeft=10;input={...input,pressed:{...(input.pressed??{}),leftModifier:true},held:{...(input.held??{}),leftModifier:1}};}
    else if(tapLeft>1){tapLeft--;input={...input,held:{...(input.held??{}),leftModifier:1}};}
    else if(tapLeft===1){tapLeft=0;input={...input,released:{...(input.released??{}),leftModifier:true}};}
    a(dt,input);t+=dt;
    const ang=s.tricks.decade.angle;
    if(ang!==0&&decStart===null)decStart=t;
    if(decStart!==null&&decCaught===null&&s.tricks.decadePhase==='caught')decCaught=t;
    if(!s.grounded)maxRate=Math.max(maxRate,Math.abs(ang-prevAng)/dt);prevAng=ang;
    maxAng=Math.max(maxAng,Math.abs(ang));phases.add(s.tricks.decadePhase);maxYaw=Math.max(maxYaw,Math.abs(s.tricks.yaw));maxFlip=Math.max(maxFlip,Math.abs(s.tricks.flip));
    if(watch&&ang!==0&&!s.grounded){
     // The real pose, then the same frame with no orbit (dt 0 leaves every damped value alone).
     m.update(s,dt,1);m.root.updateMatrixWorld(true);
     const p=m.deckPivot.getWorldPosition(V()),q=m.deckPivot.getWorldQuaternion(Q());
     const f0=m.shoes[0].getWorldPosition(V()),f1=m.shoes[1].getWorldPosition(V());feetApart=Math.max(feetApart,f0.distanceTo(f1));
     const rq=m.rider.quaternion.clone();
     s.tricks.decade.angle=0;m.update(s,0,1);m.root.updateMatrixWorld(true);
     const p0=m.deckPivot.getWorldPosition(V()),q0=m.deckPivot.getWorldQuaternion(Q()),rq0=m.rider.quaternion.clone();
     s.tricks.decade.angle=ang;
     deckMove=Math.max(deckMove,p.distanceTo(p0));deckTurn=Math.max(deckTurn,q.angleTo(q0));
     // The rider turns by exactly the Decade angle about the vertical.
     const turned=rq0.clone().invert().multiply(rq);const yaw=2*Math.atan2(turned.y,turned.w);
     const err=Math.abs(((yaw-ang)%(2*Math.PI)+3*Math.PI)%(2*Math.PI)-Math.PI);orbitErr=Math.max(orbitErr,err);
    }
    if(airStart!==null){minY=Math.min(minY,s.position.y);maxY=Math.max(maxY,s.position.y);}
    if(airStart!==null&&(s.grounded||s.state==='Bail')){landedAt=t;break;}
   }
   const airtime=landedAt!==null&&airStart!==null?+(landedAt-airStart).toFixed(3):null;
   const endState=s.state;a(.3);
   const events=g.events.history.slice(before).filter(e=>e.type==='trick'||e.type==='landing'||e.type==='bail').map(e=>e.type==='trick'?'trick:'+e.name:e.type==='landing'?'landing:'+e.quality:'bail:'+e.reason);
   return {name,stance,style,airtime,maxDecade:+maxAng.toFixed(2),revolution:decStart!==null&&decCaught!==null?+(decCaught-decStart).toFixed(3):null,peakRate:+maxRate.toFixed(1),
    maxYawDeg:Math.round(maxYaw*180/Math.PI),maxFlipDeg:Math.round(maxFlip*180/Math.PI),phases:[...phases],events,endState,settled:+s.tricks.decade.angle.toFixed(2),
    deckWorldMove:watch?+deckMove.toFixed(4):undefined,deckWorldTurn:watch?+deckTurn.toFixed(4):undefined,feetApart:watch?+feetApart.toFixed(3):undefined,orbitErr:watch?+orbitErr.toFixed(4):undefined,deck:s.tricks.deck.target,bri:s.tricks.bri.target};
  };
  const scoop=(t)=>t<.03?{rx:0,ry:1}:t<.06?{rx:-.7,ry:.7}:t<.09?{rx:-1,ry:0}:{};
  const out=[];
  out.push(run('plain hop, no trick',{noTap:true}));
  out.push(run('1 regular hop -> LB',{watch:true}));
  out.push(run('2 regular higher hop -> LB',{preload:1,watch:true}));
  out.push(run('3 regular quarter air -> LB -> transition landing',{where:'quarter',press:.1}));
  out.push(run('4 regular 180 + Decade',{script:t=>t<.45?{steer:1}:{}}));
  out.push(run('5 goofy pro hop -> LB',{stance:'goofy',watch:true}));
  out.push(run('5b goofy arcade hop -> LB',{stance:'goofy',style:'arcade'}));
  out.push(run('6 regular arcade hop -> LB',{style:'arcade'}));
  out.push(run('7 late LB (regular)',{press:.7}));
  out.push(run('7b late LB (goofy arcade)',{stance:'goofy',style:'arcade',press:.7}));
  out.push(run('8 backflip + Decade (lean forward)',{script:()=>({held:{brake:1,pumpGrind:1},lean:-1})}));
  out.push(run('8b frontflip + Decade (lean back)',{script:()=>({held:{brake:1,pumpGrind:1},lean:1})}));
  out.push(run('9 air Bri scoop, then LB (Decade must not start)',{script:scoop,press:.15}));
  out.push(run('10 LB with Y held (a modifier, no Decade)',{script:t=>t>=.03&&t<.4?{held:{body:1}}:{}}));
  return out;
 });
 for(const r of results)console.log(JSON.stringify(r));
 writeFileSync(`${folder}/results.json`,JSON.stringify({results,errors},null,1));
 const by=n=>results.find(r=>r.name.startsWith(n));
 const decade=r=>r.events.some(e=>/Decade/.test(e));
 for(const n of ['1 ','2 ','3 ','4 ','5 ','5b','6 ','8 ','8b']){const r=by(n);assert.ok(decade(r)&&r.events.includes('landing:clean'),`${r.name}: ${r.events}`);assert.equal(r.deck,0,`${r.name}: no whip`);}
 for(const n of ['1 ','2 ','5 ']){const r=by(n);
  assert.ok(r.revolution>=.69,`${r.name}: revolution ${r.revolution}s must be slower than a whip`);
  assert.ok(r.deckWorldMove<.002&&r.deckWorldTurn<.002,`${r.name}: deck held still (${r.deckWorldMove} m, ${r.deckWorldTurn} rad)`);
  assert.ok(r.orbitErr<.01,`${r.name}: rider turns by the Decade angle (${r.orbitErr})`);
  assert.ok(r.feetApart<.3,`${r.name}: feet together, not a whip spread (${r.feetApart} m)`);}
 assert.ok(by('7 ').events.some(e=>e.startsWith('bail')),'late tap bails');
 assert.ok(by('7b').events.some(e=>e.startsWith('bail')),'late tap bails (goofy)');
 assert.ok(!decade(by('9 '))&&by('9 ').maxDecade===0,'no Decade over a Bri');
 assert.ok(!decade(by('10'))&&by('10').maxDecade===0,'Can Can is not a Decade');
 assert.equal(errors.length,0,'page errors: '+errors.join('; '));
 console.log('DECADE PASS');
}finally{await browser.close();}
