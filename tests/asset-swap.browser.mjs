import {chromium} from 'playwright';
import assert from 'node:assert/strict';

// The loading screen must hold until the park's scenery is in place (the wood
// ramps, pines, desert and sky are all generated, not loaded), so plain
// stand-ins never flash on screen first. Rides through the same path as the menu's Ride button.
// Usage: LAZER_URL=http://127.0.0.1:5190 node tests/asset-swap.browser.mjs
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:900,height:700}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.LAZER_URL??'http://127.0.0.1:5190')+'/?map=outdoor');
 await page.waitForFunction(()=>window.__LAZER?.rider,null,{timeout:90000});
 const state=await page.evaluate(async()=>{
  const g=window.__LAZER;await g.menu.onRide('outdoor');
  // Read the scene the instant the loading screen has finished.
  const s=g.park.scene,visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
  const stand_ins=[];s.traverse(o=>{if(/^tree-(trunks|crowns)$|^bushes$|Nearby layered foliage/.test(o.name)&&visible(o))stand_ins.push(o.name);});
  return {loadingHidden:document.querySelector('#loading,[data-loading]')?.hidden??null,
   detailed:['Wood ramp spine riding sheet','Wood ramp small-box riding sheet','Wood ramp large-transfer riding sheet','Wood ramp front-quarter riding sheet','Wood ramp back-quarter riding sheet','tree-pines','Desert floor and ranges','Sky dome'].map(n=>[n,!!s.getObjectByName(n)]),
   standInsStillVisible:stand_ins,pending:(s.userData.assetLoads??[]).length};
 });
 console.log(JSON.stringify(state));
 for(const [name,present] of state.detailed)assert.ok(present,`${name} is in the scene when loading finishes`);
 assert.deepEqual(state.standInsStillVisible,[],'no procedural stand-ins are still visible when loading finishes');
 assert.deepEqual(errors,[]);
 console.log('authored models are in place before the loading screen finishes');
}finally{await browser.close();}
