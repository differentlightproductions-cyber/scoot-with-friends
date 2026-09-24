// Visual + numeric review of the imported Christian rider in every riding,
// trick and on-foot pose. Renders FRONT / SIDE / REAR-3/4 views per pose and
// measures, from the skinned skeleton itself:
//  - limb stretch: joint distances and bone matrix scale vs the bind pose
//  - wrist-to-target and palm-to-grip gaps for poses that hold the bars
//  - ankle-to-target and sole-to-deck gaps for poses standing on the deck
//  - skin below the ground when grounded
//  - elbow / knee bend direction, flexion and twist
// Usage: LAZER_URL=http://127.0.0.1:5190 node tests/christian-pose-review.browser.mjs [pose ...]
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';

const folder=process.env.REVIEW_OUT??'artifacts/christian/review';mkdirSync(folder,{recursive:true});
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

const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];const rows=[];
try{
 const page=await browser.newPage({viewport:{width:900,height:800}});
 page.on('pageerror',e=>errors.push(e.message));
 // Other people edit this tree while the review runs; Vite then reloads the
 // page. Re-open the game and retry the pose instead of failing the run.
 const open=async()=>{
  await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5190')+'/?map=outdoor',{timeout:120000});
  await page.waitForFunction(()=>window.__LAZER?.rider.root.userData.characterRevision==='christian-1',null,{timeout:120000});
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
    if(pose.bars){s.tricks.bars.angle=pose.bars[0];s.tricks.bars.velocity=pose.bars[1];}
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
   const h=m.human;m.root.updateMatrixWorld(true);
   let sk;h.mesh.traverse(o=>{if(o.isSkinnedMesh&&!sk)sk=o;});
   const skins=[];h.mesh.traverse(o=>{if(o.isSkinnedMesh)skins.push(o);});
   skins.forEach(o=>o.skeleton.update());
   const bones=sk.skeleton.bones,byName=n=>bones.find(b=>b.name==='mixamorig'+n),idx=n=>bones.indexOf(byName(n));
   const norm=h.normalization,riderInv=m.rider.matrixWorld.clone().invert();
   const bindPos=n=>new T.Vector3().setFromMatrixPosition(sk.skeleton.boneInverses[idx(n)].clone().invert());
   const bindRot=n=>new T.Quaternion().setFromRotationMatrix(sk.skeleton.boneInverses[idx(n)].clone().invert());
   const local=n=>byName(n).matrixWorld.clone().premultiply(riderInv);
   const pos=n=>new T.Vector3().setFromMatrixPosition(local(n));
   const rot=n=>{const p=new T.Vector3(),q=new T.Quaternion(),sc=new T.Vector3();local(n).decompose(p,q,sc);return q;};
   const scaleDev=n=>{const e=local(n).elements;const cols=[0,4,8].map(k=>Math.hypot(e[k],e[k+1],e[k+2])/norm);
    // shear/non-orthogonality also stretches skin
    const a=new T.Vector3(e[0],e[1],e[2]).normalize(),b=new T.Vector3(e[4],e[5],e[6]).normalize(),c=new T.Vector3(e[8],e[9],e[10]).normalize();
    return Math.max(...cols.map(x=>Math.abs(x-1)),Math.abs(a.dot(b)),Math.abs(b.dot(c)),Math.abs(a.dot(c)));};
   const r3=x=>+x.toFixed(3);
   const out={pose:pose.name,stretch:{},scale:{},wrist:[],palm:[],ankle:[],sole:[],elbow:[],knee:[],twist:{}};
   const segs=[['LeftShoulder','LeftArm'],['LeftArm','LeftForeArm'],['LeftForeArm','LeftHand'],['LeftHand','LeftHandMiddle1'],['RightShoulder','RightArm'],['RightArm','RightForeArm'],['RightForeArm','RightHand'],['RightHand','RightHandMiddle1'],['LeftUpLeg','LeftLeg'],['LeftLeg','LeftFoot'],['RightUpLeg','RightLeg'],['RightLeg','RightFoot'],['Hips','Spine'],['Spine2','Neck'],['Neck','Head']];
   for(const [a,b] of segs){const cur=pos(a).distanceTo(pos(b)),bind=bindPos(a).distanceTo(bindPos(b))*norm;out.stretch[a]=r3(cur/bind-1);}
   for(const n of ['LeftShoulder','LeftArm','LeftForeArm','LeftHand','RightShoulder','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot','Hips','Spine','Spine1','Spine2','Neck','Head'])out.scale[n]=r3(scaleDev(n));
   const L=['Left','Right'];
   // twist of child relative to parent, about the child bone axis, vs bind
   const twist=(parent,child,grand)=>{
    const rel=rot(parent).invert().multiply(rot(child)),relBind=bindRot(parent).invert().multiply(bindRot(child));
    const d=rel.clone().multiply(relBind.clone().invert()); // extra rotation in parent frame
    const axisBind=bindPos(grand).sub(bindPos(child)).normalize().applyQuaternion(bindRot(parent).invert());
    const v=new T.Vector3(d.x,d.y,d.z),p=axisBind.clone().multiplyScalar(v.dot(axisBind));const tw=new T.Quaternion(p.x,p.y,p.z,d.w).normalize();
    let ang=2*Math.acos(Math.min(1,Math.abs(tw.w)))*180/Math.PI;return r3(ang);
   };
   for(let i=0;i<2;i++){
    const S=L[i];
    out.twist[S+'Elbow']=twist(S+'Arm',S+'ForeArm',S+'Hand');
    out.twist[S+'Wrist']=twist(S+'ForeArm',S+'Hand',S+'HandMiddle1');
    out.twist[S+'Knee']=twist(S+'UpLeg',S+'Leg',S+'Foot');
    // hand index in model: side 0 = -x
    const k=pos(S+'Arm').x<0?0:1;
    const wrist=pos(S+'Hand');out.wrist[k]=r3(wrist.distanceTo(m.hands[k].position));
    const socket=m.rider.worldToLocal(m.assembly.gripSockets[k].getWorldPosition(new T.Vector3()));
    const seg=new T.Line3(wrist,pos(S+'HandMiddle1'));const cp=seg.closestPointToPoint(socket,true,new T.Vector3());
    out.palm[k]=r3(cp.distanceTo(socket)-(m.hands[k].userData.gripRadius??.02));
    out.ankle[k]=r3(pos(S+'Foot').distanceTo(m.shoes[k].position));
    if(pose.clamp===k){
     const anchor=m.rider.worldToLocal(m.assembly.clampGrabAnchor.getWorldPosition(new T.Vector3())),rad=m.assembly.clampGrabAnchor.userData.radius??.03;
     const cs=new T.Line3(wrist,pos(S+'HandMiddle1')).closestPointToPoint(anchor,true,new T.Vector3());
     out.clamp={hand:k,gap:r3(cs.distanceTo(anchor)-rad),wristToClamp:r3(wrist.distanceTo(anchor))};
    }
    // elbow: flexion angle and whether the elbow points out/down/back rather than inward/forward-up
    const sh=pos(S+'Arm'),el=pos(S+'ForeArm'),wr=pos(S+'Hand');
    const u=el.clone().sub(sh).normalize(),f=wr.clone().sub(el).normalize();
    const lineDir=wr.clone().sub(sh).normalize(),off=el.clone().sub(sh);off.addScaledVector(lineDir,-off.dot(lineDir));
    const torsoQ=m.torso.quaternion,outward=new T.Vector3(k?1:-1,-.7,-.3).normalize().applyQuaternion(torsoQ);
    out.elbow[k]={flex:r3(Math.acos(T.MathUtils.clamp(u.dot(f),-1,1))*180/Math.PI),outward:off.length()>.005?r3(off.normalize().dot(outward)):null};
    const hp=pos(S+'UpLeg'),kn=pos(S+'Leg'),an=pos(S+'Foot');
    const lu=kn.clone().sub(hp).normalize(),ll=an.clone().sub(kn).normalize();
    const ld=an.clone().sub(hp).normalize(),ko=kn.clone().sub(hp);ko.addScaledVector(ld,-ko.dot(ld));
    // Knees bend toward the pelvis's front. The model's hips object turns with the whole torso, so in a deep tuck its
    // forward axis points at the ground; there the rider's own forward-and-up is the pelvis's front. Either counts.
    const fwd=new T.Vector3(0,0,1).applyQuaternion(m.hips.quaternion),tuckFwd=new T.Vector3(0,.5,1).normalize();
    out.knee[k]={flex:r3(Math.acos(T.MathUtils.clamp(lu.dot(ll),-1,1))*180/Math.PI),forward:ko.length()>.005?r3(Math.max(ko.clone().normalize().dot(fwd),ko.clone().normalize().dot(tuckFwd))):null};
   }
   // sole vs deck, and ground penetration
   const deckInv=m.deckPivot.matrixWorld.clone().invert();
   const footIdx=bones.map(b=>/Foot|Toe/.test(b.name)),leftFoot=bones.map(b=>/Left(Foot|Toe)/.test(b.name));
   const minSole=[Infinity,Infinity],minFoot=[Infinity,Infinity];let minY=Infinity;const v=new T.Vector3();
   const ray=new T.Raycaster(m.root.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,3,0)),new T.Vector3(0,-1,0));
   const hits=ray.intersectObjects(g.park.scene.children.filter(o=>o!==m.root&&!o.isLight),true).filter(x=>{let o=x.object;while(o){if(o===m.root)return false;o=o.parent;}return x.object.visible;});
   // Terrain, not whatever mesh a ray happens to hit first (rails, decals).
   const {terrainHeight}=await import('/src/park/park.ts');const rootAt=m.root.getWorldPosition(new T.Vector3());
   const groundY=terrainHeight(rootAt.x,rootAt.z);void hits;
   for(const o of skins){const p=o.geometry.attributes.position,si=o.geometry.attributes.skinIndex,sw=o.geometry.attributes.skinWeight;
    for(let n=0;n<p.count;n++){v.fromBufferAttribute(p,n);o.applyBoneTransform(n,v);v.applyMatrix4(o.matrixWorld);minY=Math.min(minY,v.y);
     let wf=0,wl=0;for(let c=0;c<4;c++){const j=si.getComponent(n,c),w=sw.getComponent(n,c);if(footIdx[j])wf+=w;if(leftFoot[j])wl+=w;}
     // Mixamo "Left" bones sit on the rider's -x side, which is model index 0.
     if(wf>.5){const d=v.clone().applyMatrix4(deckInv);const k=wl>.25?0:1;minSole[k]=Math.min(minSole[k],d.y);minFoot[k]=Math.min(minFoot[k],v.y);}
    }}
   out.sole=minSole.map(y=>r3(y-.112));out.footGround=minFoot.map(y=>r3(y-groundY));
   out.groundY=r3(groundY);out.belowGround=r3(groundY-minY);
   if(pose.fingerContact){const edge=m.assembly.deckSocket.position.clone();edge.z*=window.__FINGER.along/.5;const deck=m.rider.worldToLocal(m.deckPivot.localToWorld(edge));const S=pos('RightHand').x>0?'Right':'Left';out.fingerDeck=r3(new T.Line3(pos(S+'Hand'),pos(S+'HandMiddle1')).closestPointToPoint(deck,true,new T.Vector3()).distanceTo(deck));}
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
  for(const [k,x] of Object.entries(row.stretch))if(Math.abs(x)>.02)fails.push(`stretch ${k} ${(x*100).toFixed(1)}%`);
  for(const [k,x] of Object.entries(row.scale))if(x>.02)fails.push(`scale ${k} ${(x*100).toFixed(1)}%`);
  for(const k of pose.reach??[])if(row.wrist[k]>.03)fails.push(`reach${k} ${row.wrist[k]} short`);
  if(pose.fingerContact&&row.fingerDeck>.05)fails.push(`finger hand ${row.fingerDeck} from the deck`);
  const gripSides=(pose.grip??[]).filter(x=>x!=='off');
  // A held hand may roll around the bar, so contact is the palm-to-bar gap.
  for(const k of gripSides)if(row.palm[k]>.03)fails.push(`palm${k} ${row.palm[k]} off the grip`);
  if(pose.clamp!==undefined&&row.clamp&&row.clamp.gap>.03)fails.push(`clamp hand ${row.clamp.hand} ${row.clamp.gap} off the clamp`);
  const rear=1-row.front;
  if(pose.pushFoot&&row.ankle[rear]>.03)fails.push(`push foot ${row.ankle[rear]} short of its target`);
  if(pose.pushGround&&Math.abs(row.footGround[rear])>.03)fails.push(`push sole ${row.footGround[rear]} off the ground`);
  const deckSides=(pose.deck??[]).map(x=>x==='front'?row.front:x);
  for(const k of deckSides){if(row.ankle[k]>.03)fails.push(`ankle${k} ${row.ankle[k]}`);if(Math.abs(row.sole[k])>.03)fails.push(`sole${k} ${row.sole[k]}`);}
  if(pose.ground&&row.belowGround>.01)fails.push(`skin ${row.belowGround} below ground`);
  for(let k=0;k<2;k++){if(row.elbow[k].outward!==null&&row.elbow[k].outward< -.2)fails.push(`elbow${k} points inward/forward ${row.elbow[k].outward}`);
   if(row.knee[k].forward!==null&&row.knee[k].forward<.2&&row.knee[k].flex>12)fails.push(`knee${k} not forward ${row.knee[k].forward}`);}
  for(const [k,x] of Object.entries(row.twist))if(x>75)fails.push(`twist ${k} ${x.toFixed(0)}deg`);
  row.fails=fails;rows.push(row);
  writeFileSync(`${folder}/${pose.name}.png`,Buffer.from(image.split(',')[1],'base64'));
  console.log(`${pose.name.padEnd(14)} ${fails.length?'FAIL '+fails.join('; '):'ok'}`);
  if(row.clamp)console.log(`   clamp ${JSON.stringify(row.clamp)}`);
  console.log(`   wrist ${row.wrist} palm ${row.palm} ankle ${row.ankle} sole ${row.sole} below ${row.belowGround} elbow ${JSON.stringify(row.elbow)} knee ${JSON.stringify(row.knee)} twist ${JSON.stringify(row.twist)}`);
}
