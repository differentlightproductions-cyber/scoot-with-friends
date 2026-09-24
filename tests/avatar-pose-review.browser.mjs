// Visual + numeric review of the avatar rider (src/avatar) in every riding,
// trick and on-foot pose. Renders FRONT / SIDE / REAR-3/4 views per pose and
// measures, from the avatar's own bones:
//  - wrist-to-target and bar-to-fist gaps for poses that hold the bars
//  - ankle-to-target and sole-to-deck gaps for poses standing on the deck
//  - reach shortfall of the fixed-length limbs (they never stretch)
//  - any part below the ground when grounded
//  - elbow / knee bend direction and flexion
// Usage: CHROME_PATH=... LAZER_URL=http://127.0.0.1:5174 node tests/avatar-pose-review.browser.mjs [pose ...]
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';

const folder=process.env.REVIEW_OUT??'artifacts/avatar/review';mkdirSync(folder,{recursive:true});
const only=process.argv.slice(2);
// grip: both hands expected on the grips. deck: both feet expected on the deck.
const POSES=[
 {name:'standing',grip:[0,1],deck:[0,1],ground:true},
 {name:'cruise',grip:[0,1],deck:[0,1],ground:true,speed:4},
 {name:'carve',grip:[0,1],deck:[0,1],ground:true,speed:4,steer:.8,roll:.25},
 {name:'preload',grip:[0,1],deck:[0,1],ground:true,preload:1},
 {name:'landing',grip:[0,1],deck:[0,1],ground:true,land:1},
 {name:'push-plant',grip:[0,1],deck:['front'],ground:true,push:.25,pushFoot:true,pushGround:true},
 {name:'push-drive',grip:[0,1],deck:['front'],ground:true,push:.4,pushFoot:true,pushGround:true},
 {name:'push-recover',grip:[0,1],deck:['front'],ground:true,push:.7,pushFoot:true},
 {name:'air',grip:[0,1],deck:[0,1],air:true},
 {name:'air-lean',grip:[0,1],deck:[0,1],air:true,weight:.7},
 {name:'air-lean-back',grip:[0,1],deck:[0,1],air:true,weight:-.7},
 {name:'manual',grip:[0,1],deck:[0,1],ground:true,manual:.3},
 {name:'tailwhip',grip:[0,1],air:true,deck2:[Math.PI*.6,12]},
 {name:'barspin',air:true,deck:[0,1],bars:[Math.PI*.5,12]},
 {name:'kickless',grip:[0,1],air:true,kickless:[Math.PI,12]},
 {name:'bri-25',grip:[0,1],air:true,bri:Math.PI*.5},
 {name:'bri',grip:[0,1],air:true,bri:Math.PI},
 {name:'bri-75',grip:[0,1],air:true,bri:Math.PI*1.5},
 {name:'inward-25',grip:[0,1],air:true,bri:-Math.PI*.5},
 {name:'inward',grip:[0,1],air:true,bri:-Math.PI},
 {name:'inward-75',grip:[0,1],air:true,bri:-Math.PI*1.5},
 {name:'finger',reach:[1],grip:[0],air:true,finger:true},
 // The flick itself: early in the whip, the hand on the deck as it starts to turn.
 {name:'finger-contact',reach:[1],grip:[0],air:true,finger:{time:.26,angle:.4},fingerContact:true},
 {name:'deckgrab',reach:[1],grip:[0],air:true,visual:'Deck Grab'},
 {name:'superman',grip:[0,1],air:true,visual:'Superman'},
 {name:'superman-flip',grip:[0,1],air:true,visual:'Superman',flip:-Math.PI*.5},
 {name:'nohander',air:true,deck:[0,1],visual:'No-hander'},
 {name:'tucknohander',air:true,visual:'Tuck No-hander'},
 {name:'onefooter',grip:[0,1],deck:['front'],air:true,visual:'One-footer'},
 {name:'cancan',grip:[0,1],air:true,visual:'Can Can'},
 // Clamp Grab: the stance-side hand (Regular right = index 0, Goofy left = index 1) holds
 // the clamp, the other stays on its grip. clamp = which hand index is expected on the clamp.
 {name:'clamp-regular',grip:[1],air:true,visual:'Clamp Grab',stance:'regular',clamp:0},
 {name:'clamp-goofy',grip:[0],air:true,visual:'Clamp Grab',stance:'goofy',clamp:1},
 // Toboggan: the same stance-side hand reaches the rear of the deck (its anchor), the other keeps its grip.
 {name:'toboggan-regular',grip:[1],reach:[0],air:true,visual:'Toboggan',stance:'regular'},
 {name:'toboggan-goofy',grip:[0],reach:[1],air:true,visual:'Toboggan',stance:'goofy'},
 // Bar Twist: the bars spin tipped forward and down.
 {name:'bartwist',air:true,deck:[0,1],bars:[Math.PI*.5,12],twist:true},
 // Decade: rider and bars orbit the scooter's steering axis; both hands stay on the grips.
 ...[.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5].flatMap(q=>[
  {name:'decade-regular-'+q,grip:[0,1],air:true,stance:'regular',decade:-q*Math.PI/3},
  {name:'decade-goofy-'+q,grip:[0,1],air:true,stance:'goofy',decade:q*Math.PI/3},
 ]).filter(p=>/-(1|2|3|4|5)$/.test(p.name)),
 {name:'backflip',grip:[0,1],air:true,flip:-Math.PI*.5},
 {name:'frontflip',grip:[0,1],air:true,flip:Math.PI*.5},
 {name:'flip-inverted',grip:[0,1],air:true,flip:Math.PI},
 {name:'walk-a',ground:true,walk:2,phase:0},
 {name:'walk-b',ground:true,walk:2,phase:Math.PI/2/9},
 {name:'run-a',ground:true,walk:5,run:true,phase:0},
 {name:'run-b',ground:true,walk:5,run:true,phase:Math.PI/2/13},
 {name:'sit',sit:true},
].filter(p=>!only.length||only.includes(p.name));

const browser=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];const rows=[];
try{
 const page=await browser.newPage({viewport:{width:900,height:800}});
 page.on('pageerror',e=>errors.push(e.message));
 // Other people edit this tree while the review runs; Vite then reloads the
 // page. Re-open the game and retry the pose instead of failing the run.
 const open=async()=>{
  await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5174')+'/?map=outdoor',{timeout:120000});
  await page.waitForFunction(()=>window.__LAZER?.rider.root.userData.characterRevision==='avatar-1',null,{timeout:120000});
  await page.evaluate(async()=>{const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);});
 };
 await open();
 for(const pose of POSES){
  let result;
  for(let attempt=0;;attempt++){try{result=await evaluatePose(page,pose);break;}catch(e){if(attempt>=4||!/context was destroyed|navigation|Target closed|__LAZER|null|Timeout/.test(String(e)))throw e;console.log(`  (page reloaded during ${pose.name}; retrying)`);await page.waitForTimeout(2000);try{await open();}catch(o){console.log("  (reopen failed, retrying)");}}}
  const {image,...row}=result;
  finish(pose,row,image);
 }
 writeFileSync(`${folder}/results.json`,JSON.stringify({rows,errors},null,1));
 if(errors.length)console.log('page errors',errors);
 const failed=rows.filter(r=>r.fails.length).length;
 console.log(`${rows.length-failed}/${rows.length} poses pass numeric checks`);
 process.exitCode=failed?1:0;
}finally{await browser.close();}

function evaluatePose(page,pose){
  return page.evaluate(async pose=>{
   const g=window.__LAZER,s=g.sim,m=g.rider;const T=await import('/node_modules/three/build/three.module.js');
   s.reset(0,true);g.advance(.1,{},false);
   const setup=()=>{
    s.velocity.set(0,0,pose.speed??0);s.speed=pose.speed??0;s.walking=!!pose.walk;s.running=!!pose.run;s.sitting=null;s.steer=pose.steer??0;
    s.grounded=!pose.air;s.tricks.airborne=!!pose.air;
    s.tricks.stance=pose.stance??'regular';
    if(pose.decade!==undefined){s.tricks.decade.angle=pose.decade;s.tricks.decade.target=pose.decade;s.tricks.decade.velocity=0;}
    if(pose.roll)s.roll=pose.roll;
    if(pose.preload){s.preload.amount=pose.preload;s.charge=pose.preload;}
    if(pose.land){s.landTimer=.3;s.landingCompression=pose.land;}
    if(pose.push!==undefined)s.pushTimer=.46*(1-pose.push);
    if(pose.walk){s.velocity.set(0,0,pose.walk);s.speed=pose.walk;}
    if(pose.weight)s.airWeight.shift=pose.weight;
    if(pose.manual){s.manual.active=true;s.manual.pitch=pose.manual;}
    if(pose.deck2){s.tricks.deck.angle=pose.deck2[0];s.tricks.deck.velocity=pose.deck2[1];}
    if(pose.bars){s.tricks.bars.angle=pose.bars[0];s.tricks.bars.velocity=pose.bars[1];s.tricks.twisting=!!pose.twist;}
    if(pose.kickless){s.tricks.kickless.angle=pose.kickless[0];s.tricks.kickless.velocity=pose.kickless[1];}
    if(pose.bri!==undefined){s.tricks.bri.angle=pose.bri;s.tricks.bri.velocity=12;}
    if(pose.finger){const f=pose.finger===true?{time:.175,angle:1.3}:pose.finger;s.tricks.fingerTime=f.time;s.tricks.fingerHand=1;s.tricks.deck.angle=f.angle;s.tricks.deck.velocity=12;}
    if(pose.visual){s.tricks.visualPose=pose.visual;s.tricks.poseBlend=1;s.tricks.poseSide=1;}
    if(pose.flip!==undefined){s.bodyFlip.active=true;s.bodyFlip.angle=pose.flip;s.bodyFlip.velocity=Math.sign(pose.flip)*5;s.pitch=pose.flip;}
    if(pose.sit)s.sitting={id:'visual-seat',origin:s.position.clone()};
   };
   // A real bench puts the seat surface at rider y=0, 0.55 m above the ground.
   if(pose.sit){s.position.y+=.55;s.previousPosition.copy(s.position);}
   setup();
   for(let i=0;i<40;i++){s.elapsed=pose.walk?pose.phase:i/60;setup();g.rider.update(s,1/60,1);}
   const a=m.avatar;m.root.updateMatrixWorld(true);
   const {RIG}=await import('/src/avatar/rig.ts');
   const r3=x=>+x.toFixed(3);
   const out={pose:pose.name,wrist:[],palm:[],ankle:[],sole:[],elbow:[],knee:[],short:{arms:a.solved.arms.map(x=>r3(x.short)),legs:a.solved.legs.map(x=>r3(x.short))}};
   const inRider=o=>m.rider.worldToLocal(o.getWorldPosition(new T.Vector3()));
   for(let k=0;k<2;k++){
    const hand=a.hands[k],wrist=hand.position.clone();
    out.wrist[k]=r3(wrist.distanceTo(m.hands[k].position));
    // The bar runs through the fist along the hand's x axis, RIG.palm ahead of the wrist.
    const barGap=(target,radius)=>{const centre=wrist.clone().add(new T.Vector3(0,-(radius+.012),RIG.palm).applyQuaternion(hand.quaternion)),axis=new T.Vector3(1,0,0).applyQuaternion(hand.quaternion),d=target.clone().sub(centre);d.addScaledVector(axis,-d.dot(axis));return r3(d.length());};
    out.palm[k]=barGap(inRider(m.assembly.gripSockets[k]),m.hands[k].userData.gripRadius??.0165);
    if(pose.clamp===k){const anchor=inRider(m.assembly.clampGrabAnchor),rad=m.assembly.clampGrabAnchor.userData.radius??.03;out.clamp={hand:k,gap:barGap(anchor,rad),wristToClamp:r3(wrist.distanceTo(anchor))};}
    out.ankle[k]=r3(a.feet[k].position.distanceTo(m.shoes[k].position));
    const sh=a.upperArms[k].position,el=a.forearms[k].position,wr=a.hands[k].position;
    const u=el.clone().sub(sh).normalize(),f=wr.clone().sub(el).normalize();
    const lineDir=wr.clone().sub(sh).normalize(),off=el.clone().sub(sh);off.addScaledVector(lineDir,-off.dot(lineDir));
    const outward=new T.Vector3(k?1:-1,-.7,-.3).normalize().applyQuaternion(m.torso.quaternion);
    out.elbow[k]={flex:r3(Math.acos(T.MathUtils.clamp(u.dot(f),-1,1))*180/Math.PI),outward:off.length()>.005?r3(off.normalize().dot(outward)):null};
    const hp=a.thighs[k].position,kn=a.shins[k].position,an=a.feet[k].position;
    const lu=kn.clone().sub(hp).normalize(),ll=an.clone().sub(kn).normalize(),ld=an.clone().sub(hp).normalize(),ko=kn.clone().sub(hp);ko.addScaledVector(ld,-ko.dot(ld));
    const fwd=new T.Vector3(0,0,1).applyQuaternion(m.hips.quaternion),tuckFwd=new T.Vector3(0,.5,1).normalize();
    out.knee[k]={flex:r3(Math.acos(T.MathUtils.clamp(lu.dot(ll),-1,1))*180/Math.PI),forward:ko.length()>.005?r3(Math.max(ko.clone().normalize().dot(fwd),ko.clone().normalize().dot(tuckFwd))):null};
   }
   // Sole (the shoe's flat underside) vs the deck top and the ground.
   const deckInv=m.deckPivot.matrixWorld.clone().invert();
   const {terrainHeight}=await import('/src/park/park.ts');const rootAt=m.root.getWorldPosition(new T.Vector3());
   const groundY=terrainHeight(rootAt.x,rootAt.z);
   out.sole=[0,1].map(k=>r3(Math.min(...[-.07,.04,.15].map(z=>a.feet[k].localToWorld(new T.Vector3(0,-RIG.ankle,z)).applyMatrix4(deckInv).y))-.112));
   out.footGround=[0,1].map(k=>r3(Math.min(...[-.07,.04,.15].map(z=>a.feet[k].localToWorld(new T.Vector3(0,-RIG.ankle,z)).y))-groundY));
   let minY=Infinity;const v=new T.Vector3();
   a.group.traverse(o=>{if(!o.isMesh||!o.visible)return;const p=o.geometry.attributes.position;for(let n=0;n<p.count;n+=3){v.fromBufferAttribute(p,n).applyMatrix4(o.matrixWorld);minY=Math.min(minY,v.y);}});
   out.groundY=r3(groundY);out.belowGround=r3(groundY-minY);
   if(pose.fingerContact){const edge=m.assembly.deckSocket.position.clone();edge.z*=window.__FINGER.along/.5;const deck=m.rider.worldToLocal(m.deckPivot.localToWorld(edge));const k=a.hands[1].position.x>0?1:0;out.fingerDeck=r3(a.hands[k].localToWorld(new T.Vector3(0,-.02,.06)).applyMatrix4(m.rider.matrixWorld.clone().invert()).distanceTo(deck));}
   // Front (deck) foot per src/core/stance.ts: Regular = left foot = index 1.
   out.front=s.tricks.stance==='regular'?1:0;
   // views
   const renderer=g.renderer,canvas=renderer.domElement,W=600,H=640;
   const prevSize=renderer.getSize(new T.Vector2()),prevRatio=renderer.getPixelRatio();
   renderer.setPixelRatio(1);renderer.setSize(W,H,false);
   const comp=document.createElement('canvas');comp.width=W*3;comp.height=H;const ctx=comp.getContext('2d');
   const q=m.rider.getWorldQuaternion(new T.Quaternion());
   const center=m.hips.getWorldPosition(new T.Vector3()).lerp(m.torso.getWorldPosition(new T.Vector3()),.3);
   const up=new T.Vector3(0,1,0);
   const views=[['FRONT',new T.Vector3(.25,.15,2.6)],['SIDE',new T.Vector3(2.7,.1,.15)],['REAR 3/4',new T.Vector3(-1.7,.6,-2.0)]];
   views.forEach(([label,off],n)=>{
    const cam=new T.PerspectiveCamera(38,W/H,.05,100);
    const yawOnly=new T.Quaternion().setFromAxisAngle(up,m.root.rotation.y??0);
    cam.position.copy(center).add(off.clone().applyQuaternion(pose.flip!==undefined?yawOnly:q));cam.up.set(0,1,0);cam.lookAt(center);cam.updateProjectionMatrix();
    renderer.render(g.park.scene,cam);ctx.drawImage(canvas,0,0,W,H,n*W,0,W,H);
    ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(n*W,0,W,28);ctx.fillStyle='#fff';ctx.font='18px sans-serif';ctx.fillText(`${pose.name} - ${label}`,n*W+10,20);
   });
   renderer.setPixelRatio(prevRatio);renderer.setSize(prevSize.x,prevSize.y,false);
   out.image=comp.toDataURL('image/png');
   return out;
  },pose);
}

function finish(pose,row,image){
  const fails=[];
  for(const k of pose.reach??[])if(row.wrist[k]>.03)fails.push(`reach${k} ${row.wrist[k]} short`);
  if(pose.fingerContact&&row.fingerDeck>.05)fails.push(`finger hand ${row.fingerDeck} from the deck`);
  const gripSides=(pose.grip??[]).filter(x=>x!=='off');
  // A held hand may roll around the bar, so contact is the bar-to-fist gap.
  for(const k of gripSides)if(row.palm[k]>.03)fails.push(`palm${k} ${row.palm[k]} off the grip`);
  if(pose.clamp!==undefined&&row.clamp&&row.clamp.gap>.03)fails.push(`clamp hand ${row.clamp.hand} ${row.clamp.gap} off the clamp`);
  const rear=1-row.front;
  if(pose.pushFoot&&row.ankle[rear]>.03)fails.push(`push foot ${row.ankle[rear]} short of its target`);
  if(pose.pushGround&&Math.abs(row.footGround[rear])>.03)fails.push(`push sole ${row.footGround[rear]} off the ground`);
  const deckSides=(pose.deck??[]).map(x=>x==='front'?row.front:x);
  for(const k of deckSides){if(row.ankle[k]>.03)fails.push(`ankle${k} ${row.ankle[k]}`);if(Math.abs(row.sole[k])>.03)fails.push(`sole${k} ${row.sole[k]}`);}
  if(pose.ground&&row.belowGround>.01)fails.push(`body ${row.belowGround} below ground`);
  for(let k=0;k<2;k++){if(row.elbow[k].outward!==null&&row.elbow[k].outward< -.2)fails.push(`elbow${k} points inward/forward ${row.elbow[k].outward}`);
   if(row.knee[k].forward!==null&&row.knee[k].forward<.2&&row.knee[k].flex>12)fails.push(`knee${k} not forward ${row.knee[k].forward}`);}
  row.fails=fails;rows.push(row);
  writeFileSync(`${folder}/${pose.name}.png`,Buffer.from(image.split(',')[1],'base64'));
  console.log(`${pose.name.padEnd(14)} ${fails.length?'FAIL '+fails.join('; '):'ok'}`);
  if(row.clamp)console.log(`   clamp ${JSON.stringify(row.clamp)}`);
  console.log(`   wrist ${row.wrist} palm ${row.palm} ankle ${row.ankle} sole ${row.sole} short ${JSON.stringify(row.short)} below ${row.belowGround} elbow ${JSON.stringify(row.elbow)} knee ${JSON.stringify(row.knee)}`);
}
