import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const folder='artifacts/christian/acceptance';mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];const rows=[];
try{
 const page=await browser.newPage({viewport:{width:1100,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5186')+'/?map=outdoor');
 await page.waitForFunction(()=>window.__LAZER?.rider.root.userData.characterRevision==='christian-1',null,{timeout:90000});
 await page.evaluate(async()=>{const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);});
 for(const pose of ['standing','crouch','push','walk','run','manual','finger','bri','inward','flip','sit']){
  const result=await page.evaluate(async pose=>{
   const g=window.__LAZER,s=g.sim;const T=await import('/node_modules/three/build/three.module.js');
   s.reset(0,true);g.advance(.1,{},false);s.velocity.set(0,0,0);s.walking=false;s.running=false;s.sitting=null;
   s.grounded=!['finger','bri','inward','flip'].includes(pose);s.tricks.airborne=!s.grounded;
   if(pose==='crouch'){s.preload.amount=1;s.charge=1;}
   if(pose==='push'){s.velocity.set(0,0,3);s.pushTimer=.18;}
   if(pose==='walk'||pose==='run'){s.walking=true;s.running=pose==='run';s.velocity.set(0,0,s.running?5:2);}
   if(pose==='manual'){s.manual.active=true;s.manual.pitch=.3;}
   if(pose==='finger'){s.tricks.fingerTime=.175;s.tricks.fingerHand=1;s.tricks.deck.angle=1.3;s.tricks.deck.velocity=12;}
   if(pose==='bri'||pose==='inward'){s.tricks.bri.angle=pose==='bri'?Math.PI:-Math.PI;s.tricks.bri.velocity=12;}
   if(pose==='flip'){s.bodyFlip.active=true;s.bodyFlip.angle=Math.PI;s.pitch=Math.PI;}
   if(pose==='sit')s.sitting={id:'visual-seat',x:s.position.x,z:s.position.z,seat:1,yaw:0};
   for(let i=0;i<36;i++){s.elapsed+=1/60;g.rider.update(s,1/60,1);}
   const h=g.rider.human;h.group.updateMatrixWorld(true);const bounds=new T.Box3();let vertices=0,finite=true,shadow=true;
   h.group.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();shadow&&=o.castShadow;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i);o.applyBoneTransform(i,v);finite&&=v.toArray().every(Number.isFinite);bounds.expandByPoint(v);vertices++;}}});
   const center=g.rider.rider.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,.85,0)),camera=g.camera.camera.clone();
   camera.position.copy(center).add(new T.Vector3(1.6,.25,3));camera.lookAt(center);camera.aspect=1.1;camera.updateProjectionMatrix();g.renderer.render(g.park.scene,camera);
   return {pose,finite,shadow,vertices,bounds:bounds.getSize(new T.Vector3()).toArray(),revision:g.rider.root.userData.characterRevision,image:g.renderer.domElement.toDataURL('image/png')};
  },pose);
  const {image,...row}=result;rows.push(row);writeFileSync(`${folder}/${pose}.png`,Buffer.from(image.split(',')[1],'base64'));
  assert.ok(row.finite,`${pose}: finite deformation`);assert.ok(row.shadow,`${pose}: skin casts shadow`);assert.ok(row.vertices>10000,`${pose}: imported character loaded`);assert.ok(row.bounds.every(n=>n<3.5),`${pose}: bounded anatomy`);
 }
 assert.deepEqual(errors,[]);writeFileSync(`${folder}/results.json`,JSON.stringify({rows,errors,environment:'Windows Chrome headless SwiftShader; simulated pose inputs, not a physical controller/GPU test'},null,2));
 console.log(`${rows.length} Christian pose/bounds/shadow checks passed; screenshots saved for visual review.`);
}finally{await browser.close();}
