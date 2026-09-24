// Frontflip + spin off quarters and a straight jump (#19): one combined body
// rotation, ballistic flight, a readable third-person camera and honest landings.
//   CHROME_PATH=... LAZER_URL=http://127.0.0.1:5174 node tests/flip-spin-quarter.browser.mjs
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';

const out='artifacts/flip-spin-quarter';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:800,height:450}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5174')+'/?map=outdoor');
 await page.waitForFunction(()=>window.__LAZER?.rider,null,{timeout:120000});
 const results=await page.evaluate(async()=>{
  const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);
  const s=g.sim,cam=g.camera,T=await import('/node_modules/three/build/three.module.js');
  const L=await import('/src/player/landing.ts'),{TUNE}=await import('/src/core/config.ts'),{terrainHeight}=await import('/src/park/park.ts'),{modules,rampLips}=await import('/src/park/outdoor.ts');
  const dt=TUNE.step,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));cam.view='third';
  // Diagonal LS with LT+RT: lean forward (frontflip) plus a horizontal spin component.
  const chord=(steer)=>({lean:-.7,steer,held:{brake:1,pumpGrind:1}});
  const start=(x,z,yaw,speed,stance)=>{s.reset(0,true);g.advance(.3,{},false);s.tricks.stance=stance;s.tricks.controlStyle='pro';s.position.set(x,terrainHeight(x,z)+TUNE.radius,z);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);s.yaw=s.previousYaw=yaw;s.velocity.set(Math.sin(yaw)*speed,0,Math.cos(yaw)*speed);s.body.setLinvel(s.velocity,true);cam.reset();};
  const run=({x,z,yaw,speed,stance,script})=>{
   start(x,z,yaw,speed,stance);
   const events=[],off=g.events.on(e=>events.push({type:e.type,name:e.name,quality:e.quality,reason:e.reason}));
   let air=-1,landed=-1,camTurn=0,prevCam=null,maxNdc=0,velSwing=0,v0=null,flipSigns=new Set();const contact={};
   for(let i=0;i<Math.round(5/dt);i++){
    if(air<0&&i>30&&!s.grounded&&!s.grind&&s.state!=='Bail')air=i;
    const flying=air>=0&&landed<0;
    const input=script(i,flying?(i-air)*dt:-1)??{};
    const before={flip:s.bodyFlip.angle,spin:s.tricks.yaw,rate:s.spin,yaw:s.yaw};
    g.advance(dt,input,false);
    if(flying&&(s.grounded||s.state==='Bail')){landed=i;Object.assign(contact,{flip:before.flip,spin:before.spin,rate:before.rate,yaw:before.yaw});}
    if(flying&&!s.grounded&&s.state!=='Bail'){
     const h=Math.hypot(s.velocity.x,s.velocity.z);if(h>.5){const vy=Math.atan2(s.velocity.x,s.velocity.z);if(v0===null)v0=vy;velSwing=Math.max(velSwing,Math.abs(wrap(vy-v0)));}
     if(Math.abs(s.bodyFlip.velocity)>.5)flipSigns.add(Math.sign(s.bodyFlip.velocity));
    }
    if(i%2){g.rider.update(s,1/60,1);g.rider.root.updateMatrixWorld(true);cam.update(s,{rx:0,ry:0,held:{},pressed:{},...input},1/60,1);
     const f=new T.Vector3(0,0,-1).applyQuaternion(cam.camera.quaternion),yawNow=Math.atan2(f.x,f.z);
     if(flying&&!s.grounded&&s.state!=='Bail'){if(prevCam!==null)camTurn+=Math.abs(wrap(yawNow-prevCam));const n=s.position.clone().project(cam.camera);maxNdc=Math.max(maxNdc,Math.abs(n.x),Math.abs(n.y));}
     prevCam=yawNow;}
    if(landed>0&&i>landed+Math.round(1.5/dt))break;
   }
   off();
   const tricks=events.filter(e=>e.type==='trick').map(e=>e.name),landings=events.filter(e=>e.type==='landing').map(e=>e.quality),bails=events.filter(e=>e.type==='bail').map(e=>e.reason);
   const d=s.diagnostics.landings.at(-1);
   return {tricks,landings,bails,airTime:+((landed-air)*dt).toFixed(2),flipAtContact:+(contact.flip??0).toFixed(2),spinAtContact:+(contact.spin??0).toFixed(2),pitchErrorAtContact:d?+d.pitchError.toFixed(3):null,flipDirections:[...flipSigns],cameraYawTravelInAir:+camTurn.toFixed(2),riderMaxNdcInAir:+maxNdc.toFixed(2),flightYawSwing:+velSwing.toFixed(3),touchdownNormalY:d?+d.normal[1].toFixed(2):null,impact:d?+d.impact.toFixed(2):null,spinRateAtContact:+(contact.rate??0).toFixed(2),crookedAtContact:d?+L.crookedLandingAngle(new T.Vector3(...d.velocity),new T.Vector3(...d.normal),contact.yaw??0).toFixed(3):null,rideAway:s.state!=='Bail'&&s.speed>2};
  };
  const quarterAir=(module,stance,steer,hold,yawOffset=0)=>{const m=modules.find(q=>q.id===module),lip=rampLips(m)[0],toward=m.reverse?-1:1;
   return run({x:(m.x0+m.x1)/2+3-Math.sign(yawOffset*toward)*9,z:lip-toward*14,yaw:(toward>0?0:Math.PI)+yawOffset,speed:14,stance,script:(i,t)=>t>.05&&t<.05+hold?chord(steer):{}});};
  // Straight jump off the big box: hold RS down, release just before the lip (as physics acceptance does).
  const natural=(()=>{start(-10,14,Math.PI,15,'regular');for(let i=0;i<400;i++){g.advance(dt,i>40?{ry:1}:{},false);if(i>40&&!s.grounded&&!s.grind)return i;}return 120;})();
  const boxAir=(stance,steer,hold)=>run({x:-10,z:14,yaw:Math.PI,speed:15,stance,script:(i,t)=>i>=40&&i<natural-2?{ry:1}:i===natural-2?{ry:-1}:t>.05&&t<.05+hold?chord(steer):{}});
  const dir=stance=>stance==='regular'?.7:-.7;
  const r={};
  for(const stance of ['regular','goofy']){
   r[`quarter frontflip ${stance}`]=quarterAir('back-quarter',stance,0,.25);
   r[`quarter frontflip 180 ${stance}`]=quarterAir('back-quarter',stance,dir(stance),.3);
   r[`quarter frontflip 360 ${stance}`]=quarterAir('back-quarter',stance,dir(stance),.6);
   r[`front quarter frontflip 180 ${stance}`]=quarterAir('front-quarter',stance,dir(stance),.3);
   r[`angled quarter frontflip 180 ${stance}`]=quarterAir('back-quarter',stance,dir(stance),.3,stance==='regular'?.35:-.35);
   r[`box plain air ${stance}`]=boxAir(stance,0,0);
   r[`box frontflip 180 ${stance}`]=boxAir(stance,dir(stance),.3);
   r[`box frontflip 360 ${stance}`]=boxAir(stance,dir(stance),.9);
  }
  return r;
 });
 writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
 for(const [name,r] of Object.entries(results)){
  // One rotation path: the flip never reverses, the flight never bends with the body, the camera never orbits.
  assert.equal(r.flipDirections.length,/plain/.test(name)?0:1,`${name}: flip turned one way only (${r.flipDirections})`);
  assert.ok(r.flightYawSwing<.02,`${name}: flight direction unchanged by body rotation (${r.flightYawSwing})`);
  assert.ok(r.cameraYawTravelInAir<.35,`${name}: camera held its heading in the air (${r.cameraYawTravelInAir} rad)`);
  assert.ok(r.riderMaxNdcInAir<.8,`${name}: rider stayed in frame (${r.riderMaxNdcInAir})`);
  assert.deepEqual(r.bails,[],`${name}: no bail (${r.bails})`);
  if(/angled/.test(name))continue; // Sideways travel along the coping is judged honestly (sketchy), never a bail.
  if(/plain/.test(name))continue;
  // A straight box jump at this speed comes down hard whatever the rider does, so
  // it is compared with a plain air off the same takeoff: rotating must not make it worse.
  const grade=['clean','good','sketchy','failed'],control=/^box/.test(name)?results[name.replace(/frontflip \d+/,'plain air')]:null;
  if(control)assert.ok(r.landings.every(q=>grade.indexOf(q)<=Math.max(...control.landings.map(c=>grade.indexOf(c)))),`${name}: lands as well as a plain air off the same jump (${r.landings} vs ${control.landings})`);
  else assert.ok(r.landings.every(q=>q==='clean'||q==='good'),`${name}: clean or good landing (${r.landings})`);
  assert.ok(Math.abs(r.pitchErrorAtContact)<.35,`${name}: body meets the receiving surface (${r.pitchErrorAtContact} rad)`);
  assert.ok(r.rideAway,`${name}: rides away`);
  const expected=/360/.test(name)?'Frontflip 360':/180/.test(name)?'Front Flair':'Frontflip';
  assert.ok(r.tricks.includes(expected),`${name}: recognized as ${expected} (${r.tricks})`);
  if(/quarter/.test(name))assert.ok(r.touchdownNormalY<.8,`${name}: returned onto the transition (normal y ${r.touchdownNormalY})`);
 }
 assert.deepEqual(errors,[],'no browser errors');
 console.log(JSON.stringify(results,null,1));
}finally{await browser.close();}
