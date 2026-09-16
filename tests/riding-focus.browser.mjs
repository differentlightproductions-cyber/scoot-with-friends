import {chromium} from 'playwright';
import {writeFileSync,mkdirSync} from 'node:fs';
// artifacts/ is gitignored, so these output directories do not exist in a fresh clone.
mkdirSync('artifacts',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
try{
 await page.goto('http://127.0.0.1:5174/?map=outdoor');await page.waitForFunction(()=>window.__LAZER);
 const result=await page.evaluate(async()=>{
  const g=window.__LAZER;g.testing(true);g.startSession('outdoor',true);
  const {terrainHeight,terrainNormal}=await import('/src/park/park.ts');
  const {emptyInput}=await import('/src/input/input.ts');
  const {outdoorLip}=await import('/src/park/outdoor.ts');
  const checks=[],data=[];const check=(name,ok,detail)=>{if(!ok)throw Error(name+' '+JSON.stringify(detail??g.snapshot()));checks.push(name);};
  const a=(time,f={})=>g.advance(time,f,false);
  const place=(x,z,speed,dir=-1)=>{g.sim.reset(0,true);a(.4);const s=g.sim;
   s.position.set(x,terrainHeight(x,z)+.22,z);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);
   s.yaw=dir<0?Math.PI:0;s.normal.copy(terrainNormal(x,z));
   s.velocity.set(0,0,dir*speed).projectOnPlane(s.normal).normalize().multiplyScalar(speed);s.body.setLinvel(s.velocity,true);return s;};
  for(const x of [-8,-2]){const heights=[];
   for(const speed of [6,10,14,18]){
    const s=place(x,x===-8?8.2:5.7,speed);let maxY=s.position.y,launch=null;
    for(let i=0;i<360;i++){a(1/120);maxY=Math.max(maxY,s.position.y);if(!launch&&g.events.history.some(e=>e.type==='pop'))launch=s.velocity.toArray();if(launch&&s.grounded)break;}
    heights.push(maxY);data.push({x,speed,maxY,launch,state:s.state});
   }
   check('Box height scales with speed '+x,heights[2]>heights[1]+.6&&heights[1]>heights[0]+.5,heights);
  }
  for(const speed of [4,10]){
   const s=place(4,.02,speed,1);for(let i=0;i<180&&!s.stall;i++)a(1/120,{held:{brake:1}});
   data.push({stallSpeed:speed,state:s.state,pos:s.position.toArray()});check('LT intentional spine stall '+speed,!!s.stall);
  }
  for(const x of [-8,-2])for(const kind of ['whip','bars','bri','inward','hop']){
   const z=(x===-8?4:2.75)+.5;const rider=place(x,z,9);
   if(kind==='bri'||kind==='inward'){
    for(let i=0;i<=24;i++){const r=(kind==='bri'?1:-1)*i*Math.PI*2/24;a(.014,{rx:Math.cos(r),ry:Math.sin(r)});}
   }else if(kind==='hop'){a(.1,{ry:1});a(1/120,{ry:-1});}
   else a(1/120,{pressed:{[kind==='whip'?'hop':'brakeBars']:true}});
   check('Box lip pop into '+kind+' '+x,!rider.grounded&&rider.velocity.y>0);
   if(kind==='bri'||kind==='inward')check('Box overhead gesture begins '+kind+' '+x,Math.abs(rider.tricks.bri.target)>6);
  }
  // The warehouse builds only bench ledges and contains no rail at all, so this
  // section used to dereference undefined. Rail behaviour has to be exercised on
  // a map that actually has a rail; outdoor is already loaded above.
  g.sim.reset(0,true);a(.4);
  const rail=g.park.rails.find(r=>r.kind==='rail');
  check('A rail exists to grind against',!!rail,{kinds:[...new Set(g.park.rails.map(r=>r.kind))]});
  const mid=rail.a.clone().lerp(rail.b,.5),dir=rail.b.clone().sub(rail.a).normalize(),side=dir.clone().set(dir.z,0,-dir.x);
  const railPlace=(offset,speed=6,vy=-1)=>{g.sim.reset(0,true);a(.4);const s=g.sim;
   s.position.copy(mid).addScaledVector(side,offset);s.position.y+=.3;s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);
   s.velocity.copy(dir).multiplyScalar(speed).addScaledVector(side,offset>0?-.8:0);s.velocity.y=vy;s.body.setLinvel(s.velocity,true);s.yaw=Math.atan2(dir.x,dir.z);s.grounded=false;s.state='Airborne';s.airTime=.2;s.tricks.startAir(false);return s;};
  for(const offset of [0,.15]){const rider=railPlace(offset);a(.12,{held:{pumpGrind:1}});check('Rail contact engages '+offset,!!rider.grind);
   a(1/120,{pressed:{hop:true}});check('Tailwhip immediately exits rail '+offset,!rider.grind&&rider.tricks.deck.target!==0);}
  let rider=railPlace(0,18,-7);a(.035,{held:{pumpGrind:1}});check('High-speed descending rail engages before tunneling',!!rider.grind);
  rider=railPlace(.9);a(.1,{held:{pumpGrind:1}});check('A clear rail miss stays a miss',!rider.grind);
  rider=railPlace(-.7,0,0);rider.position.y-=.2;rider.body.setTranslation(rider.position,true);rider.velocity.copy(side).multiplyScalar(18);rider.body.setLinvel(rider.velocity,true);a(.1);
  check('Bad high-speed rail crossing produces physical impact',g.events.history.some(e=>e.type==='railImpact'||e.type==='bail'));
  g.sim.reset(0,true);a(.4);
  a(.05,{pressed:{hop:true},held:{hop:1}});a(1/120,{released:{hop:true}});
  check('Physical A tap retains tailwhip',!g.sim.grounded&&g.sim.tricks.deck.target!==0);
  // Sampled inside the preload's own range. RS 0.2-0.5 is the gentle manual
  // band and deliberately produces no crouch at all, so the old .2/.5/1 samples
  // could not pass once manuals took that region.
  g.sim.reset(0,true);a(.4);const crouches=[];
  for(const ry of [.7,.85,1]){a(.12,{ry});for(let i=0;i<8;i++)g.render();crouches.push(g.rider.crouch);}
  check('Analog preload is visible at light, medium and full RS',crouches[0]>.02&&crouches[1]>crouches[0]&&crouches[2]>crouches[1],crouches);
  // The gentle band is the manual's, not the preload's. Rolling speed is
  // required: a manual cannot be entered from a standstill.
  g.sim.reset(0,true);a(.4);
  g.sim.velocity.set(0,0,-6);g.sim.body.setLinvel(g.sim.velocity,true);g.sim.yaw=Math.PI;a(.15);
  a(.12,{ry:.35});
  check('Gentle RS positions a manual instead of loading a preload',g.sim.manual.active&&g.sim.charge===0,{charge:g.sim.charge,manual:g.sim.manual.active});
  g.sim.reset(0,true);a(.4);let f=emptyInput();f.held.menuLeft=1;g.social.update(g.sim,f,.3);check('Riding cannot open emotes',g.social.wheel.hidden);
  g.sim.walking=true;g.social.update(g.sim,f,.3);check('On-foot D-pad left opens wheel',!g.social.wheel.hidden);
  // The quick wheel is a root menu now (Emotes / Chat / Scooter / ...) and RS
  // drives selection, not LS. Navigate root -> Emotes -> Wave.
  const rsUp=(extra={})=>{const i=emptyInput();i.ry=-1;return {...i,...extra,held:{...i.held,...extra.held},pressed:{...i.pressed,...extra.pressed}};};
  f.ry=-1;g.social.update(g.sim,f,.02);
  check('RS selects the first quick-wheel option',g.social.selected===0,{selected:g.social.selected});
  g.social.update(g.sim,rsUp(),.02);
  check('Releasing the D-pad opens the emote list',!g.social.wheel.hidden&&g.social.options.some(o=>o.label==='Wave'),{options:g.social.options.map(o=>o.label)});
  g.social.update(g.sim,rsUp({pressed:{hop:true}}),.02);
  check('A confirms the selected wave',g.sim.emote?.id==='wave',{emote:g.sim.emote});
  for(let i=0;i<20;i++){g.social.update(g.sim,emptyInput(),1/60);g.render();}
  check('Wave raises the actual hand',g.rider.hands[0].position.y>1.4);
  f=emptyInput();f.pressed.sprint=true;g.social.update(g.sim,f,.02);check('Sprint interrupts emote',!g.sim.emote);
  f=emptyInput();f.held.menuRight=1;g.social.update(g.sim,f,.3);check('On-foot D-pad right opens chat',!g.social.chat.hidden);
  g.social.send('<script>hello</script>');g.render();check('Local speech is safe text',g.social.bubble.textContent==='<script>hello</script>'&&!g.social.bubble.querySelector('script'));
  return {checks,data};
 });
 console.log(JSON.stringify(result,null,2));writeFileSync('artifacts/riding-focus-report.json',JSON.stringify(result,null,2));
 // Diagnostic artifact only; nothing is asserted on it. After this suite's very
 // large number of simulation steps the compositor can refuse to produce a frame
 // headless, so a failed capture must not fail the behavioural checks above.
 await page.evaluate(()=>{window.__LAZER.social.closeChat();window.__LAZER.render();});
 try{
  await page.screenshot({path:'artifacts/riding-social.png',animations:'disabled',caret:'hide',timeout:20000});
 }catch{
  console.warn('NOTE: riding-social.png capture timed out; all checks above still passed.');
 }
}finally{await browser.close();}
