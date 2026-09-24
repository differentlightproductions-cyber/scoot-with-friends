import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
// Real hop -> LB tap -> Decade, filmed from the game's chase camera and fixed world cameras (front, side, rear 3/4)
// at seven moments, with per-frame hand/grip and arm-stretch measurements from
// the skinned skeleton. Usage: LAZER_URL=http://127.0.0.1:5190 node tests/decade-visual.browser.mjs [regular|goofy] [arcade]
const folder='artifacts/decade';mkdirSync(folder,{recursive:true});
const stance=process.argv[2]??'regular',style=process.argv[3]??'arcade';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:900,height:700}});
 await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5190')+'/?map=outdoor');
 await page.waitForFunction(()=>window.__LAZER?.rider.root.userData.characterRevision==='christian-1',null,{timeout:120000});
 await page.evaluate(async()=>{const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);document.querySelectorAll('body>*:not(canvas)').forEach(e=>e.style.display='none');});
 const out=await page.evaluate(async([stance,style])=>{
  const g=window.__LAZER,s=g.sim,m=g.rider,T=await import('/node_modules/three/build/three.module.js');
  const {terrainHeight}=await import('/src/park/park.ts');
  const a=(t,f={},draw=false)=>g.advance(t,f,draw);
  s.reset(0,true);a(.3);s.tricks.stance=stance;s.tricks.controlStyle=style;
  const x=0,z=-10;s.position.set(x,terrainHeight(x,z)+.22,z);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);s.yaw=s.previousYaw=0;
  s.velocity.set(0,0,4);s.speed=4;a(.4);
  s.preload.amount=.65;s.preload.dwell=.2;s.preload.armed=true;a(1/120,{ry:1});a(1/120,{ry:-1});
  const W=260,H=320,moments=[.1,.2,.3,.4,.5,.6,.7,.8,.9],renderer=g.renderer;
  const comp=document.createElement('canvas');comp.width=W*moments.length;comp.height=H*4;const ctx=comp.getContext('2d');
  const prev=renderer.getSize(new T.Vector2()),ratio=renderer.getPixelRatio();renderer.setPixelRatio(1);renderer.setSize(W,H,false);
  const rows=[];let airStart=null,t=0,pressed=false,tapLeft=0,shot=0;
  let sk;m.human.mesh.traverse(o=>{if(o.isSkinnedMesh&&!sk)sk=o;});
  const by=n=>sk.skeleton.bones.find(b=>b.name==='mixamorig'+n);
  const measure=()=>{
   m.root.updateMatrixWorld(true);sk.skeleton.update();
   const inv=m.rider.matrixWorld.clone().invert(),pos=n=>new T.Vector3().setFromMatrixPosition(by(n).matrixWorld.clone().premultiply(inv));
   const r={ang:+s.tricks.decade.angle.toFixed(2),palm:[0,0],stretch:[0,0]};
   for(const S of ['Left','Right']){
    const k=pos(S+'Arm').x<0?0:1,wrist=pos(S+'Hand'),mid=pos(S+'HandMiddle1'),sh=pos(S+'Arm');
    const socket=m.rider.worldToLocal(m.assembly.gripSockets[k].getWorldPosition(new T.Vector3()));
    const cp=new T.Line3(wrist,mid).closestPointToPoint(socket,true,new T.Vector3());
    r.palm[k]=+(cp.distanceTo(socket)-(m.hands[k].userData.gripRadius??.02)).toFixed(3);
    r.stretch[k]=+(sh.distanceTo(wrist)/m.human.armReach[k]).toFixed(3);
   }
   return r;
  };
  for(let i=0;i<400;i++){
   if(!s.grounded&&airStart===null)airStart=t;
   const tAir=airStart===null?-1:t-airStart;
   let input={};
   if(airStart!==null&&!pressed&&tAir>=.02){input={pressed:{leftModifier:true},held:{leftModifier:1}};pressed=true;tapLeft=10;}else if(tapLeft>1){tapLeft--;input={held:{leftModifier:1}};}else if(tapLeft===1){tapLeft=0;input={released:{leftModifier:true}};}
   a(1/120,input,shot<moments.length&&tAir>=moments[shot]-1/120);t+=1/120;
   if(airStart!==null&&shot<moments.length&&tAir>=moments[shot]){
    a(0,{},true);ctx.drawImage(renderer.domElement,0,0,W,H,shot*W,3*H,W,H);ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(shot*W,3*H,W,22);ctx.fillStyle='#fff';ctx.font='15px sans-serif';ctx.fillText(`GAME CAM  t=${tAir.toFixed(2)}s`,shot*W+6,3*H+16);rows.push({tAir:+tAir.toFixed(2),...measure()});
    const p=s.position.clone(),yaw=s.yaw,fwd=new T.Vector3(Math.sin(yaw),0,Math.cos(yaw)),rt=new T.Vector3(-Math.cos(yaw),0,Math.sin(yaw));
    const target=p.clone().add(new T.Vector3(0,.42,0));
    const views=[['FRONT',p.clone().addScaledVector(fwd,4.2).add(new T.Vector3(0,.9,0))],['SIDE',p.clone().addScaledVector(rt,-4.2).add(new T.Vector3(0,.5,0))],['REAR 3/4',p.clone().addScaledVector(fwd,-3.2).addScaledVector(rt,2.4).add(new T.Vector3(0,1.3,0))]];
    views.forEach(([label,pos],v)=>{const cam=new T.PerspectiveCamera(42,W/H,.05,200);cam.position.copy(pos);cam.up.set(0,1,0);cam.lookAt(target);cam.updateProjectionMatrix();renderer.render(g.park.scene,cam);ctx.drawImage(renderer.domElement,0,0,W,H,shot*W,v*H,W,H);ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(shot*W,v*H,W,22);ctx.fillStyle='#fff';ctx.font='15px sans-serif';ctx.fillText(`${label}  t=${tAir.toFixed(2)}s  decade=${(s.tricks.decade.angle*180/Math.PI).toFixed(0)}°`,shot*W+6,v*H+16);});
    shot++;
   }
   if(airStart!==null&&s.grounded)break;
  }
  renderer.setPixelRatio(ratio);renderer.setSize(prev.x,prev.y,false);
  return {rows,image:comp.toDataURL('image/png'),name:g.events.history.filter(e=>e.type==='trick').map(e=>e.name).at(-1)};
 },[stance,style]);
 writeFileSync(`${folder}/decade-${stance}.png`,Buffer.from(out.image.split(',')[1],'base64'));
 console.log(stance,style,'trick:',out.name);
 for(const r of out.rows)console.log(JSON.stringify(r));
 const worstPalm=Math.max(...out.rows.flatMap(r=>r.palm)),worstStretch=Math.max(...out.rows.flatMap(r=>r.stretch));
 console.log('worst palm gap',worstPalm,'worst arm reach ratio',worstStretch);
}finally{await browser.close();}
