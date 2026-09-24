import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
// Snow: flakes fall at snow's terminal velocity (about 1 m/s) and drift with
// the wind in world space (a rider moving at speed passes through them rather
// than carrying them along), the fog closes in while it snows and lifts after,
// ground cover builds in patches on open flat surfaces, and wheels throw up
// powder once it is deep enough. Renders standing, riding and covered views.
// Usage: LAZER_URL=http://127.0.0.1:5190 node tests/snow.browser.mjs
mkdirSync('artifacts/snow',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:960,height:600}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5190')+'/?map=outdoor');
 await page.waitForFunction(()=>window.__LAZER?.rider,null,{timeout:120000});
 await page.evaluate(async()=>{const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);document.querySelectorAll('body>*:not(canvas)').forEach(e=>e.style.display='none');});
 const shot=async name=>{const url=await page.evaluate(()=>{const g=window.__LAZER;g.render();return g.renderer.domElement.toDataURL('image/png');});writeFileSync(`artifacts/snow/${name}.png`,Buffer.from(url.split(',')[1],'base64'));};
 const result=await page.evaluate(async()=>{
  const g=window.__LAZER,s=g.sim,w=g.weather;
  const {terrainHeight}=await import('/src/park/park.ts');
  const fog=g.park.scene.fog,fogBefore={near:fog.near,far:fog.far};
  g.profile.settings.daylight='snow';
  s.reset(0,true);s.position.set(0,terrainHeight(0,-12)+.22,-12);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);s.yaw=s.previousYaw=0;
  // Six seconds of weather time (rendering every frame in software is slow), then a few rendered frames.
  for(let i=0;i<360;i++)w.update(1/60,'snow',s.position,g.profile.settings.fidelity,{camera:g.camera.camera.position});
  for(let i=0;i<3;i++)g.advance(1/60,{},true);
  const flakes=w.flakes,pos=()=>Array.from(flakes.geometry.getAttribute('position').array);
  // Flake physics while standing still: vertical speed and horizontal drift against the wind.
  const a=pos();g.advance(1/60,{},true);const b=pos();
  const n=a.length/3,vy=[],vh=[];let wrapped=0;
  for(let i=0;i<n;i++){const dy=(b[i*3+1]-a[i*3+1])*60,dx=(b[i*3]-a[i*3])*60,dz=(b[i*3+2]-a[i*3+2])*60;if(Math.abs(dy)>5||Math.abs(dx)>5||Math.abs(dz)>5){wrapped++;continue;}vy.push(-dy);vh.push([dx,dz]);}
  const mean=x=>x.reduce((p,q)=>p+q,0)/x.length;
  const fallMean=mean(vy),fallMin=Math.min(...vy),fallMax=Math.max(...vy);
  const wind=w.wind(w.time),drift=[mean(vh.map(v=>v[0])),mean(vh.map(v=>v[1]))];
  const fogSnow={near:fog.near,far:fog.far};
  // Riding at 8 m/s: the flakes keep moving with the air, not with the rider.
  s.velocity.set(0,0,8);s.speed=8;s.body.setLinvel({x:0,y:0,z:8},true);
  const c=pos();g.advance(1/60,{},true);const d=pos();const vr=[];
  for(let i=0;i<n;i++){const dz=(d[i*3+2]-c[i*3+2])*60;if(Math.abs(dz)<5)vr.push(dz);}
  const flakeZWhileRiding=mean(vr),riderZ=s.velocity.z;
  // Deep cover: powder off the wheels while riding.
  w.coverage.value=1;let sprayPeak=0;
  for(let i=0;i<40;i++){g.advance(1/60,{held:{pushDeck:i%20<2?1:0}},true);sprayPeak=Math.max(sprayPeak,Array.from(w.sprayLife).filter(x=>x>0).length);}
  return {n,wrapped,fallMean,fallMin,fallMax,wind:[wind.x,wind.z],drift,fogBefore,fogSnow,flakeZWhileRiding,riderZ,sprayPeak,coverage:w.coverage.value};
 });
 await shot('riding-deep-cover');
 // Standing in fresh snowfall, then with the park covered, from the game camera.
 await page.evaluate(async()=>{const g=window.__LAZER,s=g.sim;const {terrainHeight}=await import('/src/park/park.ts');s.reset(0,true);s.position.set(-2,terrainHeight(-2,-14)+.22,-14);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);s.yaw=s.previousYaw=0;g.weather.coverage.value=.3;for(let i=0;i<30;i++)g.advance(1/60,{},true);});
 await shot('light-cover');
 await page.evaluate(async()=>{const g=window.__LAZER;g.weather.coverage.value=1;for(let i=0;i<30;i++)g.advance(1/60,{},true);});
 await shot('full-cover');
 const after=await page.evaluate(async()=>{const g=window.__LAZER,s=g.sim;g.profile.settings.daylight='day';for(let i=0;i<400;i++)g.weather.update(1/60,'day',s.position,g.profile.settings.fidelity,{});g.advance(1/60,{},true);const f=g.park.scene.fog;return {near:f.near,far:f.far,coverage:g.weather.coverage.value,visible:g.weather.group.visible};});
 console.log(JSON.stringify({...result,after},null,1));
 writeFileSync('artifacts/snow/results.json',JSON.stringify({result,after,errors},null,1));
 assert.ok(result.fallMean>.75&&result.fallMean<1.25,`flakes fall at snow's terminal velocity (${result.fallMean.toFixed(2)} m/s)`);
 assert.ok(result.fallMin>.3&&result.fallMax<1.7,'no flake falls like rain or hangs still');
 const dw=Math.hypot(result.drift[0]-result.wind[0],result.drift[1]-result.wind[1]);
 assert.ok(dw<.6,`flakes drift with the wind (${dw.toFixed(2)} m/s off)`);
 assert.ok(Math.abs(result.flakeZWhileRiding)<3,`flakes are not carried along with the rider (${result.flakeZWhileRiding.toFixed(2)} m/s vs rider ${result.riderZ})`);
 assert.ok(result.fogSnow.far<result.fogBefore.far*.8,'visibility drops in snowfall');
 assert.ok(Math.abs(after.far-result.fogBefore.far)<.5&&Math.abs(after.near-result.fogBefore.near)<.5,'visibility returns after the snow');
 assert.ok(result.sprayPeak>5,'wheels throw up powder on deep cover');
 assert.ok(after.coverage===0&&!after.visible,'cover melts and snowfall stops after switching back');
 assert.equal(errors.length,0,'page errors: '+errors.join('; '));
 console.log('SNOW PASS');
}finally{await browser.close();}
