import {chromium} from 'playwright';
import assert from 'node:assert/strict';
// Rides up the small box close to the seam it shares with the taller large
// transfer (x = -4) and along its deck, and checks that nothing but the visible
// wall pushes the rider sideways: the surface must follow the box right up to
// its edge. Usage: LAZER_URL=http://127.0.0.1:5190 node tests/box-seam.browser.mjs
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:700,height:500}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5190')+'/?map=outdoor');
 await page.waitForFunction(()=>window.__LAZER?.rider,null,{timeout:90000});
 await page.evaluate(async()=>{const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);});
 const out=await page.evaluate(async()=>{
  const g=window.__LAZER,s=g.sim,a=(t,f={})=>g.advance(t,f,false);
  const {terrainHeight}=await import('/src/park/park.ts');
  const heights=[-4.2,-4.1,-4.0,-3.95,-3.9,-3.85,-3.8,-3.7].map(x=>[x,+terrainHeight(x,1.8).toFixed(3)]);
  const ride=(x,z,speed)=>{
   s.reset(0,true);a(.3);
   s.position.set(x,terrainHeight(x,z)+.22,z);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);s.yaw=s.previousYaw=0;
   s.velocity.set(0,0,speed);s.speed=speed;s.body.setLinvel({x:0,y:0,z:speed},true);
   let maxVx=0,maxDx=0,minNy=1,bail=false;const x0=s.position.x;
   for(let i=0;i<240;i++){a(1/120,{});maxVx=Math.max(maxVx,Math.abs(s.velocity.x));maxDx=Math.max(maxDx,Math.abs(s.position.x-x0));if(s.grounded)minNy=Math.min(minNy,s.normal.y);if(s.state==='Bail')bail=true;if(s.position.z>2.6)break;}
   return {x,z,speed,maxVx:+maxVx.toFixed(2),maxDx:+maxDx.toFixed(2),minNy:+minNy.toFixed(3),endZ:+s.position.z.toFixed(2),bail};
  };
  // The rider's collision radius is 0.22 m, so closer than that to the real wall at x = -4 is a real contact.
  return {heights,runs:[ride(-3.9,-4,6),ride(-3.77,-4,6),ride(-3.7,-4,6),ride(-3.77,1.1,3),ride(-3.7,1.1,3),ride(-3.5,-4,6)]};
 });
 console.log('heights at z=1.8',JSON.stringify(out.heights));
 for(const r of out.runs)console.log(JSON.stringify(r));
 for(const [x,h] of out.heights)if(x>-4)assert.equal(h,1.4,`small box deck height at x=${x}`);
 for(const r of out.runs){assert.ok(r.maxVx<.6,`sideways kick at x=${r.x}: ${r.maxVx} m/s`);assert.ok(!r.bail,'no bail');}
 assert.equal(errors.length,0,errors.join('; '));
 console.log('BOX SEAM PASS');
}finally{await browser.close();}
