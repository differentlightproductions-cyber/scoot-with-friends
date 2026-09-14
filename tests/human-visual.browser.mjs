import {chromium} from 'playwright';import {mkdirSync,writeFileSync} from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{const page=await browser.newPage({viewport:{width:1400,height:1050}});page.on('pageerror',e=>console.error(e.message));await page.goto('http://127.0.0.1:5180/?map=outdoor');await page.waitForFunction(()=>window.__LAZER?.rider.human);mkdirSync('artifacts/complete-update/humans',{recursive:true});
 for(const view of ['front','side','rear','face','crouch']){
  const data=await page.evaluate(async view=>{const g=window.__LAZER;g.testing(true);g.startSession('outdoor',true);await new Promise(r=>setTimeout(r,50));g.advance(.1,{},true);if(view==='crouch')for(let i=0;i<45;i++){g.advance(1/60,{ry:1},false);g.rider.update(g.sim,1/60,1);}const root=g.rider.root;root.updateMatrixWorld(true);const center=root.position.clone().add(g.sim.position.clone().set(0,view==='face'?1.49:.91,0));const c=g.camera.camera.clone();c.position.copy(center).add(g.sim.position.clone().set(view==='side'?2.7:0,view==='face'?.03:.05,view==='side'?0:view==='rear'?-2.7:view==='face'?.63:2.7));c.lookAt(center);document.querySelectorAll('body>*:not(canvas)').forEach(e=>e.style.display='none');g.renderer.render(root.parent,c);return {revision:root.userData.characterRevision,triangles:g.renderer.info.render.triangles,draws:g.renderer.info.render.calls,geometries:g.renderer.info.memory.geometries};},view);
  await page.locator('body>canvas').screenshot({path:`artifacts/complete-update/humans/${view}.png`});console.log(view,data);
 }
}finally{await browser.close();}

