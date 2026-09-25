import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
 const page=await browser.newPage({viewport:{width:1000,height:700}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.LAZER_URL??'http://127.0.0.1:5184');
 await page.waitForFunction(()=>window.__LAZER?.menu);
 const result=await page.evaluate(()=>{
  const g=window.__LAZER,m=g.menu,profile=JSON.stringify(g.profile),screen=m.screen;
  const sheet=document.createElement('div');sheet.style.cssText='position:fixed;inset:0;z-index:999;background:#f4f1e8;display:grid;grid-template-columns:repeat(3,1fr);align-content:start;gap:10px;padding:20px';document.body.append(sheet);
  const entries=[g.profile.scooter.deck,g.profile.scooter.fork,g.profile.scooter.clamp,g.profile.scooter.bars,g.profile.scooter.frontWheel,g.profile.longboard.deck];
  const previews=entries.map(selection=>{
   const canvas=m.renderPartPreview(g.renderer,selection),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   const colors=new Set();for(let i=0;i<pixels.length;i+=4)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
   const box=document.createElement('div');canvas.style.cssText='position:static;inset:auto;display:block;width:100%;height:auto';box.textContent=canvas.getAttribute('aria-label');box.append(canvas);sheet.append(box);
   return {partId:canvas.dataset.partId,variantId:canvas.dataset.variantId,colors:colors.size};
  });
  const unchanged=JSON.stringify(g.profile)===profile&&m.screen===screen&&m.rewardSelection===undefined;
  return {previews,entries,unchanged};
 });
 assert.equal(result.unchanged,true,'thumbnail rendering preserves profile and menu');
 for(let i=0;i<result.previews.length;i++){
  const preview=result.previews[i];assert.equal(preview.partId,result.entries[i].partId);assert.equal(preview.variantId,result.entries[i].variantId);
  assert.ok(preview.colors>20,`${preview.partId}: real model pixels, not an empty canvas`);
 }
 assert.deepEqual(errors,[]);
 await mkdir('artifacts/crate-inventory',{recursive:true});
 await page.screenshot({path:'artifacts/crate-inventory/part-previews.png'});
 console.log('Six authored part previews passed; profile and menu restored.');
} finally {await browser.close();}
