import {chromium} from 'playwright';
import {writeFileSync,mkdirSync} from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5180/?map=outdoor');await page.waitForFunction(()=>window.__LAZER);
 const result=await page.evaluate(async()=>{
  const g=window.__LAZER;g.testing(true);g.startSession('outdoor',true);
  const {terrainHeight,terrainNormal}=await import('/src/park/park.ts');
  const {modules,rampLips}=await import('/src/park/outdoor.ts');
  const rows=[];const a=(t,f={})=>g.advance(t,f,false);
  for(const m of modules.filter(m=>m.kind!=='spine'))for(const distance of [.65,.15])for(const move of ['hop','bri','inward']){
   const dir=m.reverse?-1:1,z=rampLips(m)[0]-dir*distance,x=m.kind==='quarter'?-9:(m.x0+m.x1)/2;
   const s=g.sim;s.reset(0,true);a(.3);s.position.set(x,terrainHeight(x,z)+.22,z);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);s.yaw=s.previousYaw=dir===1?0:Math.PI;s.normal.copy(terrainNormal(x,z));s.velocity.set(0,0,dir*9).projectOnPlane(s.normal).normalize().multiplyScalar(9);s.body.setLinvel(s.velocity,true);s.grounded=true;
   // Preload before arriving at the lip, as a player does while riding up.
   s.preload.amount=.65;s.preload.dwell=.2;s.preload.armed=true;
   if(move==='hop'){a(1/120,{ry:1});a(1/120,{ry:-1});}
   else {a(1/120,{ry:1});a(1/120,{rx:move==='bri'?-.7:.7,ry:.7});a(1/120,{rx:move==='bri'?-1:1,ry:0});}
   const launch={y:s.velocity.y,forward:s.velocity.z*dir,grounded:s.grounded,origin:s.bodyFlip.origin};
   let top=s.position.y;const start=s.position.clone();let landed=false;
   for(let i=0;i<480;i++){a(1/120);top=Math.max(top,s.position.y);if(s.grounded||s.state==='Bail'){landed=true;break;}}
   rows.push({ramp:m.id,distance,move,launch,height:top-start.y,travel:s.position.z-start.z,end:s.state,landed,plant:s.fastplantOpportunity()});
  }
  return rows;
 });
 mkdirSync('artifacts/complete-update',{recursive:true});writeFileSync('artifacts/complete-update/pop-flow.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
