import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('artifacts/art-direction',{recursive:true});
const b=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&/THREE|Shader|WebGL/.test(m.text()))errors.push(m.text());});
try{
 await p.goto('http://127.0.0.1:5177/?map=outdoor');await p.waitForFunction(()=>window.__LAZER);
 const results=await p.evaluate(async()=>{
  const g=window.__LAZER;g.testing(true);g.startSession('outdoor',true);g.advance(.2);const checks=[];
  const check=(name,value)=>checks.push({name,pass:!!value});
  const colliders=()=>{const list=[];g.park.world.forEachCollider(c=>list.push([c.handle,c.translation(),c.rotation(),c.shapeType()]));return JSON.stringify(list);};
  const before=colliders(),world=g.park.world,body=g.sim.body,step=world.timestep;
  const quality=[];
  for(const level of ['low','medium','high']){
   g.fidelity.apply(g.park.scene,level);g.render();quality.push({level,draws:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles,pixelRatio:g.renderer.getPixelRatio(),shadows:g.renderer.shadowMap.enabled});
   check(level+' preserves exact collider handles and transforms',before===colliders());check(level+' preserves world, body and timestep',g.park.world===world&&g.sim.body===body&&world.timestep===step);
  }
  check('High has more visible geometry than Low',quality[2].triangles>quality[0].triangles);
  const {PARTS,defaultScooter}=await import('/src/data/scooterParts.ts');
  const wheelCenters=g.rider.assembly.wheels.map(w=>w.position.toArray());
  for(const part of PARTS){
   const slot=part.category==='wheels'?'frontWheel':part.category;let counts=[];
   for(const variant of part.variants){const load=defaultScooter();load[slot]={partId:part.id,variantId:variant.id};g.rider.assembly.build(load);let count=0;g.rider.scooter.traverse(o=>{if(o.geometry)count+=o.geometry.attributes.position.count;});counts.push(count);}
   check(part.name+' colorways share geometry',counts.every(n=>n===counts[0]));
  }
  g.rider.applyProfile(g.profile);check('Assembly replacement never changes colliders',before===colliders());
  check('Default wheel centers retained',JSON.stringify(wheelCenters)===JSON.stringify(g.rider.assembly.wheels.map(w=>w.position.toArray())));
  check('Same manufactured revision in gameplay and preview',g.rider.scooter.userData.assetRevision===g.menu.previewRider.scooter.userData.assetRevision);
  for(const pose of ['neutral','crouch','grab','fingerwhip','run','manual']){
   const s=g.sim;s.charge=pose==='crouch'?1:0;s.walking=pose==='run';s.running=pose==='run';s.tricks.visualPose=pose==='grab'?'Deck Grab':'';s.tricks.poseBlend=pose==='grab'?1:0;s.tricks.fingerTime=pose==='fingerwhip'?.16:0;
   if(pose==='manual')s.manual.enter(false);else s.manual.reset();
   for(let i=0;i<40;i++)g.rider.update(s,1/60,1);g.renderer.render(g.park.scene,g.camera.camera);
   const skins=g.rider.garmentSkins;check(pose+' uses visible weighted garments',skins.every(k=>k.mesh.visible&&k.mesh.isSkinnedMesh));
   let finite=true;for(const k of skins){const a=k.mesh.geometry.attributes.position;for(let i=0;i<a.count;i+=53){const point=g.rider.root.position.clone().fromBufferAttribute(a,i);k.mesh.applyBoneTransform(i,point);finite&&=Number.isFinite(point.x+point.y+point.z)&&point.length()<4;}}
   check(pose+' has bounded finite deformation',finite);
   if(pose==='neutral'||pose==='crouch'){const distances=g.rider.hands.map((h,i)=>h.getWorldPosition(g.rider.root.position.clone()).distanceTo(g.rider.assembly.gripSockets[i].getWorldPosition(g.rider.root.position.clone())));check(pose+' palms stay at current grips',distances.every(d=>d<.07));}
  }
  const s=g.sim;s.walking=false;s.running=false;s.manual.reset();s.charge=0;s.tricks.visualPose='';s.tricks.poseBlend=0;s.tricks.fingerTime=0;
  for(const stance of ['regular','goofy'])for(const style of ['pro','arcade']){
   s.reset();s.tricks.stance=stance;s.tricks.controlStyle=style;g.advance(.25,{},false);g.advance(.2,{ry:1},false);g.advance(1/120,{ry:0},false);g.advance(.08,{ry:-1},false);check(style+'/'+stance+' RS pop remains live',s.velocity.y>1&&!s.grounded);
  }
  check('Bench rendered with planks',!!g.park.scene.getObjectByName('Crafted bench planks and brackets'));
  return {checks,quality};
 });
 writeFileSync('artifacts/art-direction/acceptance.json',JSON.stringify({...results,errors},null,2));console.log(JSON.stringify({...results,errors},null,2));
 assert.equal(errors.length,0);assert(results.checks.every(c=>c.pass),'One or more art integration checks failed');
}finally{await b.close();}
