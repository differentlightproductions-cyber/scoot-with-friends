import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';

const out='artifacts/first-person-view';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5186')+'/?map=outdoor');
 await page.waitForFunction(()=>window.__LAZER?.rider.human,null,{timeout:90000});
 await page.evaluate(async()=>{const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);g.advance(.4,{},false);g.camera.view='first';g.camera.firstPersonFov=135;});
 const statesResult=await page.evaluate(async()=>{
  const g=window.__LAZER,T=await import('/node_modules/three/build/three.module.js'),{terrainHeight}=await import('/src/park/park.ts'),s=g.sim,r=g.rider,out=[];
  const pose=(name)=>{
   s.reset(0,true);g.advance(.4,{},false);s.position.set(-10,terrainHeight(-10,10)+.22,10);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);s.velocity.set(0,0,0);s.body.setLinvel(s.velocity,true);s.yaw=s.previousYaw=0;s.walking=false;s.running=false;s.sitting=false;s.charge=name==='crouch'?1:0;s.grounded=name!=='bri';s.tricks.airborne=name==='bri';s.tricks.visualPose='';s.tricks.poseBlend=0;s.tricks.bri.angle=0;s.tricks.bri.velocity=0;s.tricks.deck.angle=0;s.tricks.deck.velocity=0;r.hideHead=true;g.camera.rider=r;g.camera.reset();
   if(name==='bri'){s.tricks.bri.angle=Math.PI*.75;s.tricks.bri.velocity=8;}
   if(name==='tailwhip'){s.tricks.deck.angle=Math.PI*1.25;s.tricks.deck.velocity=10;}
   if(name==='on-foot')s.walking=true;
   const human=r.human;let masked=null;for(let i=0;i<40;i++){r.update(s,1/60,1);masked=human.setFirstPerson?human.setFirstPerson(true):null;r.root.updateMatrixWorld(true);g.camera.update(s,{rx:0,ry:0,held:{},pressed:{}},1/60,1);}g.renderer.render(g.park.scene,g.camera.camera);
   const cam=g.camera.camera,project=p=>p.clone().project(cam).toArray(),hands=r.hands.map(h=>project(h.getWorldPosition(new T.Vector3()))),grips=r.assembly.gripSockets.map(o=>project(o.getWorldPosition(new T.Vector3()))),deck=project(r.assembly.deckSocket.getWorldPosition(new T.Vector3())),deckBox=new T.Box3().setFromObject(r.assembly.deckPivot),deckCorners=[];for(let x=0;x<2;x++)for(let y=0;y<2;y++)for(let z=0;z<2;z++)deckCorners.push(project(new T.Vector3(x?deckBox.max.x:deckBox.min.x,y?deckBox.max.y:deckBox.min.y,z?deckBox.max.z:deckBox.min.z)));const wheels=r.assembly.wheels.map(o=>project(o.getWorldPosition(new T.Vector3())));const lookDown=-new T.Vector3(0,0,-1).applyQuaternion(cam.quaternion).y;
   return {name,lookDown,active:g.camera.firstPersonActive,near:cam.near,fov:cam.fov,aspect:cam.aspect,horizontalFov:2*Math.atan(Math.tan(cam.fov*Math.PI/360)*cam.aspect)*180/Math.PI,cameraPosition:cam.position.toArray(),rootPosition:r.root.getWorldPosition(new T.Vector3()).toArray(),headPosition:r.head.getWorldPosition(new T.Vector3()).toArray(),handsWorld:r.hands.map(h=>h.getWorldPosition(new T.Vector3()).toArray()),hands,grips,deck,deckCorners,wheels,masked,headVisible:r.head.visible,torsoVisible:r.torso.visible,image:['mounted','crouch','bri'].includes(name)?g.renderer.domElement.toDataURL('image/png'):null};
  };
  for(const name of ['mounted','crouch','tailwhip','bri','on-foot'])out.push(pose(name));
  const beforeBones=[];r.human.group.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.bones.forEach(b=>{if(/Head/i.test(b.name))beforeBones.push(b);});});r.root.updateMatrixWorld(true);const before=beforeBones.map(b=>b.getWorldPosition(new T.Vector3()));r.hideHead=false;g.camera.view='third';r.update(s,1/60,1);r.human.setFirstPerson(false);r.root.updateMatrixWorld(true);const after=beforeBones.map(b=>b.getWorldPosition(new T.Vector3()));const restored={coreMask:r.human.firstPerson.value,boneMovement:Math.max(0,...before.map((p,i)=>p.distanceTo(after[i])))};return {states:out,restored};
 });
 const {states,restored}=statesResult;
 for(const s of states){if(s.image)writeFileSync(`${out}/${s.name}.png`,Buffer.from(s.image.split(',')[1],'base64'));delete s.image;}
 writeFileSync(`${out}/results.json`,JSON.stringify({states,restored},null,2));
 for(const s of states){assert.equal(s.active,true,`${s.name}: first-person camera active`);assert.equal(s.near,.05,`${s.name}: eye camera near plane`);assert.ok(Math.abs(s.horizontalFov-135)<.1,`${s.name}: 135-degree horizontal FOV`);if(['mounted','crouch'].includes(s.name))assert.ok(s.deckCorners.some(([x,y,z])=>Math.abs(x)<1&&Math.abs(y)<1&&z<1),`${s.name}: deck in camera frustum`);if(['mounted','crouch','bri'].includes(s.name)){assert.ok(s.hands.every(([x,y,z])=>Math.abs(x)<1&&Math.abs(y)<1&&z<1),`${s.name}: both hands in camera frustum`);assert.ok(s.grips.every(([x,y,z])=>Math.abs(x)<1&&Math.abs(y)<1&&z<1),`${s.name}: both grips in camera frustum`);}if(s.name==='tailwhip')assert.ok(s.deckCorners.some(([x,y,z])=>Math.abs(x)<1&&Math.abs(y)<1&&z<1),`${s.name}: tricking scooter deck visible`);assert.ok(s.deck.every(Number.isFinite)&&s.wheels.every(p=>p.every(Number.isFinite)),`${s.name}: scooter projects cleanly`);}
 const byName=Object.fromEntries(states.map(s=>[s.name,s]));assert.ok(byName.crouch.lookDown>byName.mounted.lookDown+.02,'charging the jump tilts the view further down');assert.ok(byName.mounted.lookDown<.9,'heads-up view keeps the line ahead in frame');
 assert.equal(restored.coreMask,0,'first-person core mask clears after exit');// The exit path runs one 1/60 s rig update, which alone moves the head about 0.03 mm; a mask that deformed the skeleton would move it by centimetres.
 assert.ok(restored.boneMovement<1e-4,'mask toggle leaves head skeleton pose unchanged');
 assert.deepEqual(errors,[],'no browser page or console errors');
 console.log(JSON.stringify({states:states.map(({name,horizontalFov,hands,grips,deck,wheels})=>({name,horizontalFov,hands,grips,deck,wheels})),restored},null,2));
}finally{await browser.close();}
