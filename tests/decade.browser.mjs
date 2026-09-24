import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
// Drives real hops through the production simulation and checks the Decade
// lifecycle: A in the air, one revolution around the front of the scooter,
// catch, landing, naming, combinations, and a deliberately late attempt that
// must bail. Usage: LAZER_URL=http://127.0.0.1:5190 node tests/decade.browser.mjs
const folder='artifacts/decade';mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:900,height:700}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5190')+'/?map=outdoor');
 await page.waitForFunction(()=>window.__LAZER?.rider,null,{timeout:90000});
 await page.evaluate(async()=>{const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);});
 const results=await page.evaluate(async()=>{
  const g=window.__LAZER,s=g.sim,a=(t,f={})=>g.advance(t,f,false);
  const {terrainHeight,terrainNormal}=await import('/src/park/park.ts');
  const {modules,rampLips}=await import('/src/park/outdoor.ts');
  // script(tAir) -> extra input for that frame; A is pressed once at `press` seconds after takeoff.
  const run=(name,{stance='regular',style='pro',preload=.65,press=.03,speed=4,where='flat',script=()=>({}),noA=false})=>{
   s.reset(0,true);a(.3);s.tricks.stance=stance;s.tricks.controlStyle=style;
   let x=0,z=-10,dir=1;
   if(where==='quarter'){const m=modules.find(m=>m.kind==='quarter');dir=m.reverse?-1:1;z=rampLips(m)[0]-dir*.65;x=-9;speed=9;}
   s.position.set(x,terrainHeight(x,z)+.22,z);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);s.yaw=s.previousYaw=dir===1?0:Math.PI;
   if(where==='quarter')s.normal.copy(terrainNormal(x,z));
   s.velocity.set(0,0,dir*speed);s.speed=speed;a(where==='quarter'?.01:.4);
   const before=g.events.history.length;
   s.preload.amount=preload;s.preload.dwell=.2;s.preload.armed=true;
   a(1/120,{ry:1});a(1/120,{ry:-1});
   let airStart=null,pressed=false,landedAt=null,t=0,maxAng=0,minY=1e9,maxY=-1e9,maxYaw=0,maxFlip=0;const phases=new Set();
   for(let i=0;i<900;i++){
    if(!s.grounded&&airStart===null)airStart=t;
    const tAir=airStart===null?-1:t-airStart;
    let input=airStart===null?{}:script(tAir);
    if(airStart!==null&&!pressed&&!noA&&tAir>=press){input={...input,pressed:{...(input.pressed??{}),hop:true},held:{...(input.held??{}),hop:1}};pressed=true;}
    a(1/120,input);t+=1/120;
    maxAng=Math.max(maxAng,Math.abs(s.tricks.decade.angle));phases.add(s.tricks.decadePhase);maxYaw=Math.max(maxYaw,Math.abs(s.tricks.yaw));maxFlip=Math.max(maxFlip,Math.abs(s.tricks.flip));
    if(airStart!==null){minY=Math.min(minY,s.position.y);maxY=Math.max(maxY,s.position.y);}
    if(airStart!==null&&(s.grounded||s.state==='Bail')){landedAt=t;break;}
   }
   const airtime=landedAt!==null&&airStart!==null?+(landedAt-airStart).toFixed(3):null;
   const endState=s.state;a(.3);
   const events=g.events.history.slice(before).filter(e=>e.type==='trick'||e.type==='landing'||e.type==='bail').map(e=>e.type==='trick'?'trick:'+e.name:e.type==='landing'?'landing:'+e.quality:'bail:'+e.reason);
   return {name,stance,style,airtime,rise:+(maxY-minY).toFixed(2),maxDecade:+maxAng.toFixed(2),maxYawDeg:Math.round(maxYaw*180/Math.PI),maxFlipDeg:Math.round(maxFlip*180/Math.PI),phases:[...phases],events,endState,settled:+s.tricks.decade.angle.toFixed(2)};
  };
  const out=[];
  out.push(run('plain hop, no trick',{noA:true}));
  out.push(run('1 regular hop -> A',{}));
  out.push(run('2 regular higher hop -> A',{preload:1}));
  out.push(run('3 regular quarter air -> A -> transition landing',{where:'quarter',press:.1}));
  out.push(run('4 regular 180 + Decade',{script:t=>t<.45?{steer:1}:{}}));
  out.push(run('5 goofy hop -> A (A is the whip button in Goofy Pro)',{stance:'goofy'}));
  out.push(run('5b goofy arcade hop -> A',{stance:'goofy',style:'arcade'}));
  out.push(run('6 regular arcade hop -> A',{style:'arcade'}));
  out.push(run('7 late A (regular)',{press:.72}));
  out.push(run('7b late A (arcade goofy)',{stance:'goofy',style:'arcade',press:.72}));
  out.push(run('8 backflip + Decade (lean forward)',{script:()=>({held:{brake:1,pumpGrind:1},lean:-1})}));
  out.push(run('8b frontflip + Decade (lean back)',{script:()=>({held:{brake:1,pumpGrind:1},lean:1})}));
  return out;
 });
 for(const r of results)console.log(JSON.stringify(r));
 writeFileSync(`${folder}/results.json`,JSON.stringify({results,errors},null,1));
 console.log('page errors:',errors.length);
}finally{await browser.close();}
