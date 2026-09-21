import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const url=process.env.LAZER_URL||'http://127.0.0.1:5186',out='artifacts/weather';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const check=(label,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'} ${label}`,ok?'':detail);if(!ok)process.exitCode=1;};
await page.goto(url+'/?map=outdoor');await page.waitForFunction(()=>window.__LAZER?.weather,{timeout:90000});
await page.evaluate(async()=>{const g=window.__LAZER;g.testing(true);await g.startSession('outdoor',true);g.advance(.5,{},false);});await page.waitForTimeout(4000);
for(const mode of ['day','night','snow']){
 await page.evaluate(mode=>{const g=window.__LAZER;g.profile.settings.daylight=mode;for(let i=0;i<90;i++){g.daylight.update(.5,mode==='snow'?'day':mode,g.sim.position);g.weather.update(.5,mode,g.sim.position,g.profile.settings.fidelity);}g.camera.camera.position.set(22,12,9);g.camera.camera.lookAt(0,2,26);g.renderer.render(g.park.scene,g.camera.camera);},mode);
 await page.screenshot({path:`${out}/${mode}.png`});
}
const state=await page.evaluate(()=>{const g=window.__LAZER,terrain=g.park.scene.getObjectByName('Terrain surface'),snow=g.park.scene.getObjectByName('Visual weather');return{mode:g.profile.settings.daylight,coverage:g.weather.coverage.value,flakes:snow?.children[0]?.geometry?.attributes?.position?.count,terrainHook:terrain?.material?.customProgramCacheKey?.().includes('swf-snow-v1'),snowVisible:snow?.visible};});
check('snow accumulates through the existing terrain shader',state.coverage>.2&&state.terrainHook,state);check('fidelity-scaled falling snow is visible',state.snowVisible&&state.flakes>=100,state);check('render has no page errors',errors.length===0,errors);
await page.evaluate(()=>{const g=window.__LAZER;g.menu.openSesh('settings','outdoor');});await page.waitForSelector('.game-menu');
for(let i=0;i<5;i++)await page.locator('button',{hasText:'TIME OF DAY'}).first().click();
let label=await page.locator('button',{hasText:'TIME OF DAY'}).first().textContent();check('settings cycles to Snow through the real control',label?.includes('SNOW'),label);await page.locator('button',{hasText:'APPLY / SAVE CHANGES'}).click();
await page.reload();await page.waitForFunction(()=>window.__LAZER?.profile);check('Snow setting persists after reload',(await page.evaluate(()=>window.__LAZER.profile.settings.daylight))==='snow');
await page.evaluate(async()=>{const g=window.__LAZER;g.testing(true);await g.startSession('techno_gravity',true);g.weather.update(1,'snow',g.sim.position,g.profile.settings.fidelity);});
check('shop remains clear when Snow is selected',await page.evaluate(()=>!window.__LAZER.park.scene.getObjectByName('Visual weather')?.visible));
await browser.close();
