import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const folder='artifacts/anatomy-contact';mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1100,height:900}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5186')+'/?map=outdoor');
 await page.waitForFunction(()=>window.__LAZER?.rider.human,null,{timeout:90000});
 await page.evaluate(async()=>{window.__LAZER.testing(true);await window.__LAZER.startSession('outdoor',true);});
 await page.waitForFunction(()=>['front-quarter','back-quarter','small-box','large-box','wood-hub','spine'].every(id=>window.__LAZER.park.scene.getObjectByName('Detailed '+id)),null,{timeout:90000});
 const rows=await page.evaluate(async()=>{
  const g=window.__LAZER,T=await import('/node_modules/three/build/three.module.js'),{terrainHeight}=await import('/src/park/park.ts');
  const s=g.sim,r=g.rider,result=[];
  const frame=(name)=>{r.update(s,1/60,1);r.root.updateMatrixWorld(true);const feet=[Infinity,Infinity],hands=[[],[]],core=[];
   r.human.group.traverse(o=>{if(!o.isSkinnedMesh)return;o.skeleton.update();const a=o.geometry.attributes;
    for(let i=0;i<a.position.count;i++){let best=0;for(let k=1;k<4;k++)if(a.skinWeight.getComponent(i,k)>a.skinWeight.getComponent(i,best))best=k;const bone=o.skeleton.bones[a.skinIndex.getComponent(i,best)].name;
     const p=new T.Vector3().fromBufferAttribute(a.position,i);o.applyBoneTransform(i,p);p.applyMatrix4(o.matrixWorld);
     if(/Foot|Toe/.test(bone)){const side=/Left/.test(bone)?0:1;feet[side]=Math.min(feet[side],p.y-terrainHeight(p.x,p.z));}
     if(/Hand/.test(bone))hands[/Left/.test(bone)?0:1].push(p.toArray());
     if(/Hips|Spine|Head/.test(bone))core.push(p);
    }
   });
   const inv=r.rider.matrixWorld.clone().invert(),localCore=core.map(p=>p.clone().applyMatrix4(inv)),box=new T.Box3().setFromPoints(localCore),grips=r.assembly.gripSockets.map(o=>o.getWorldPosition(new T.Vector3()).toArray());
   const handBounds=hands.map(ps=>new T.Box3().setFromPoints(ps.map(p=>new T.Vector3(...p))).getSize(new T.Vector3()).toArray());
   let image;if(['mounted','on-foot','bri-0.75','finger-0.25','superman-0.5'].includes(name)){const camera=g.camera.camera.clone(),center=r.rider.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,.83,0));camera.position.copy(center).add(new T.Vector3(1.6,.15,2.7));camera.lookAt(center);camera.aspect=1100/900;camera.updateProjectionMatrix();g.renderer.render(g.park.scene,camera);image=g.renderer.domElement.toDataURL('image/png');}
   const gripErrors=r.assembly.gripSockets.map((socket,i)=>{const q=socket.getWorldQuaternion(new T.Quaternion()),expected=socket.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,(r.hands[i].userData.gripRadius??.0165)+.012,-r.hands[i].userData.palmLength).applyQuaternion(q));return expected.distanceTo(r.hands[i].getWorldPosition(new T.Vector3()));});
   result.push({name,feet,handBounds,bodyBounds:box.getSize(new T.Vector3()).toArray(),grips,gripErrors,clearance:r.root.userData.trickBodyClearance,ankleOffsets:r.human.ankleOffsets,image});
  };
  for(const mode of ['mounted','on-foot','crouch','manual','push']){s.reset(0,true);g.advance(.4,{},false);s.position.set(-10,terrainHeight(-10,10)+.22,10);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);s.velocity.set(0,0,0);s.body.setLinvel(s.velocity,true);s.yaw=s.previousYaw=0;
   if(mode==='on-foot'){g.advance(1/120,{pressed:{body:true}},false);g.advance(.3,{},false);}
   if(mode==='crouch')s.charge=1;if(mode==='manual'){s.manual.active=true;s.manual.pitch=.3;}if(mode==='push')s.pushTimer=.18;
   for(let n=0;n<45;n++)r.update(s,1/60,1);frame(mode);
  }
  for(const kind of ['bri','inward','tailwhip','kickless','finger','superman'])for(const phase of [.125,.25,.375,.5,.625,.75,.875]){s.reset(0,true);g.advance(.1,{},false);s.position.set(-10,2.22,10);s.previousPosition.copy(s.position);s.walking=false;s.grounded=false;s.tricks.airborne=true;s.yaw=s.previousYaw=0;
   if(kind==='bri'||kind==='inward'){s.tricks.bri.angle=Math.PI*2*phase*(kind==='bri'?1:-1);s.tricks.bri.velocity=8;}
   if(kind==='tailwhip'){s.tricks.deck.angle=Math.PI*2*phase;s.tricks.deck.velocity=10;}
   if(kind==='kickless'){s.tricks.kickless.angle=Math.PI*2*phase;s.tricks.kickless.velocity=8;}
   if(kind==='finger'){s.tricks.fingerTime=.35*(1-phase);s.tricks.fingerHand=1;s.tricks.deck.angle=Math.PI*2*phase;s.tricks.deck.velocity=10;}
   if(kind==='superman'){s.tricks.visualPose='Superman';s.tricks.poseBlend=Math.sin(Math.PI*phase);}
   for(let n=0;n<35;n++)r.update(s,1/60,1);frame(kind+'-'+phase);
  }
  return result;
 });
 for(const row of rows){if(row.image)writeFileSync(`${folder}/${row.name}.png`,Buffer.from(row.image.split(',')[1],'base64'));delete row.image;}
 writeFileSync(`${folder}/results.json`,JSON.stringify(rows,null,2));console.log(JSON.stringify(rows.filter(r=>['mounted','on-foot','crouch','push'].includes(r.name)).map(({name,feet,handBounds})=>({name,feet,handBounds}))));
 assert.deepEqual(errors,[],'no runtime errors');
 {
  assert.ok(rows.find(r=>r.name==='on-foot').feet.every(y=>y>=-.008&&y<.035),'stationary shoe soles must rest above ground');
  for(const row of rows){if(row.clearance)assert.ok(row.clearance.minimum>=-.004,`${row.name}: scooter/body clearance`);if(/^(mounted|bri-|inward-|kickless-)/.test(row.name))assert.ok(row.gripErrors.every(n=>n<.035),`${row.name}: connected grips`);if(row.name.startsWith('superman-'))assert.ok(row.gripErrors[0]<.035,`${row.name}: supporting grip`);}
 }
}finally{await browser.close();}
