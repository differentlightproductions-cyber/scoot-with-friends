import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('artifacts/complete-update',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5180/?map=outdoor');await page.waitForFunction(()=>window.__LAZER);
 const result=await page.evaluate(async()=>{
  const g=window.__LAZER;g.testing(true);g.startSession('outdoor',true);
  const {emptyInput}=await import('/src/input/input.ts');const {ridingButtons}=await import('/src/input/riding.ts');
  const {terrainHeight,terrainNormal}=await import('/src/park/park.ts');const {makeObject}=await import('/src/editor/layout.ts');
  const checks=[],data=[];const check=(name,pass,detail)=>{if(!pass)throw Error(name+' '+JSON.stringify(detail??g.snapshot()));checks.push(name);};
  const a=(t,f={})=>g.advance(t,f,false);
  const place=(x,z,speed=0,yaw=0,y)=>{const s=g.sim;s.reset(0,true);a(.3);s.position.set(x,y??terrainHeight(x,z)+.22,z);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);s.yaw=s.previousYaw=yaw;s.normal.copy(terrainNormal(x,z));s.velocity.set(Math.sin(yaw)*speed,0,Math.cos(yaw)*speed).projectOnPlane(s.normal).normalize().multiplyScalar(speed);s.body.setLinvel(s.velocity,true);return s;};
  for(const style of ['pro','arcade'])for(const stance of ['regular','goofy']){
   let s=place(-10,-19);s.tricks.controlStyle=style;s.tricks.stance=stance;
   a(.22,{ry:1});a(1/120,{ry:-1});check('Skipped-neutral RS hop '+style+'/'+stance,!s.grounded&&s.velocity.y>0);
   s=place(-10,-19);s.tricks.controlStyle=style;s.tricks.stance=stance;a(.2,{ry:1});a(.4);check('Neutral preload relaxes without pop '+style+'/'+stance,s.grounded&&s.preload.amount===0);
   const buttons=ridingButtons(stance,style);a(2.5,{held:{[buttons.push]:1},pressed:{[buttons.push]:true}});check('Mapped hold-to-push '+style+'/'+stance,s.speed>2);
   s=place(-10,-19,4);s.tricks.controlStyle=style;s.tricks.stance=stance;a(.28,{ry:.34});check('Gentle manual '+style+'/'+stance,s.manual.active);
   a(.12,{ry:1});a(1/120,{ry:-1});check('Manual to pop '+style+'/'+stance,!s.grounded&&!s.manual.active);
  }
  for(const x of [-8,-2]){const heights=[];for(const speed of [6,10,14]){const s=place(x,x===-8?8.2:5.7,speed,Math.PI);let top=s.position.y,air=false;for(let i=0;i<360;i++){a(1/120);top=Math.max(top,s.position.y);air||=!s.grounded;if(air&&s.grounded)break;}heights.push(top);}data.push({x,heights});check('Box launch follows entry speed '+x,heights[2]>heights[1]+.5&&heights[1]>heights[0]+.4,heights);}
  for(const x of [-8,-2,4]){const s=place(x,28,8);a(.12,{ry:1});a(1/120,{ry:-1});check('Quarter ramp pop clears coping '+x,!s.grounded&&s.velocity.y>0);}
  // The empty Warehouse is tested using real player-placed obstacles.
  g.startSession('warehouse',true);check('Warehouse starts empty',g.builder.layout.objects.length===0&&g.park.rails.every(r=>r.id.startsWith('Warehouse bench')));
  let s=place(-12,-24);s.walking=true;g.social.warehouse=true;let f=emptyInput();f.held.menuLeft=1;g.social.update(s,f,.25);check('General wheel opens on foot',!g.social.wheel.hidden);
  f.rx=1;g.social.update(s,f,.02);check('Wheel uses RS',g.social.selected>=0);f=emptyInput();f.pressed.brakeBars=true;g.social.update(s,f,.02);
  const o=makeObject('Flat Rail',0,0);Object.assign(o,{height:.65,length:5,width:.12});g.builder.begin(o);
  check('Rail ghost is actual asset geometry',g.builder.placement&&g.builder.placement.type==='Flat Rail'&&g.park.rails.every(r=>r.id.startsWith('Warehouse bench')));
  f=emptyInput();f.pressed.hop=true;g.builder.update(s,f,.02);check('Placement immediately creates rail',g.park.rails.filter(r=>!r.id.startsWith('Warehouse bench')).length===1&&g.builder.layout.objects.length===1);
  const rail=g.park.rails.find(r=>r.kind==='rail'),mid=rail.a.clone().lerp(rail.b,.5),dir=rail.b.clone().sub(rail.a).normalize(),side=dir.clone().set(dir.z,0,-dir.x);
  for(const yawOffset of [0,Math.PI/2]){s=place(mid.x,mid.z,6,Math.atan2(dir.x,dir.z)+yawOffset,mid.y+.3);s.velocity.copy(dir).multiplyScalar(6);s.velocity.y=-1;s.body.setLinvel(s.velocity,true);s.grounded=false;s.tricks.startAir(false);s.airTime=.2;a(.08,{held:{pumpGrind:1}});check('Aligned grind contact '+yawOffset,!!s.grind);const entry=s.yaw;a(.15);check('Grind preserves approach angle '+yawOffset,Math.abs(s.yaw-entry)<.04);a(1/120,{pressed:{[ridingButtons(s.tricks.stance,s.tricks.controlStyle).whip]:true}});check('Trick exits grind immediately '+yawOffset,!s.grind&&!s.grounded);}
  g.startSession('warehouse',true);check('Placed rail survives map reload',g.builder.layout.objects.length===1&&g.park.rails.filter(r=>!r.id.startsWith('Warehouse bench')).length===1);g.builder.reset();
  g.startSession('outdoor',true);s=place(22,-35);s.walking=true;f=emptyInput();f.pressed.brakeBars=true;g.interactions.update(s,f,.02);check('Rack starts storing real scooter',!!g.interactions.stored&&!s.hasScooter);g.interactions.update(s,emptyInput(),.8);g.interactions.update(s,f,.02);g.interactions.update(s,emptyInput(),.8);check('Rack retrieves scooter',!g.interactions.stored&&s.hasScooter);
  s=place(-10,-19);s.walking=true;s.running=true;s.velocity.set(0,0,6);g.camera.reset();for(let i=0;i<60;i++)g.camera.update(s,{...emptyInput(),rx:1},1/60,1);s.walking=false;let previous=g.camera.camera.position.clone();for(let i=0;i<90;i++){g.camera.update(s,{...emptyInput(),rx:1},1/60,1);check('Mount camera bounded frame '+i,g.camera.camera.position.distanceTo(previous)<1);previous.copy(g.camera.camera.position);}
  check('Riding camera ignores held RS',Math.abs(g.camera.orbit)<Math.PI);
  return {checks,data};
 });
 if(errors.length)throw Error(errors.join('\n'));writeFileSync('artifacts/complete-update/backlog.json',JSON.stringify(result,null,2));console.log(`${result.checks.length} earlier-update checks passed`);
}finally{await browser.close();}

