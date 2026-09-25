// Phone home screen (#86): the clock widget, then a 4 x 4 grid of apps that
// fills the screen (no scrolling, no page buttons). LS turns the page at the
// grid's edge and a swipe does on touch. X rearranges: A picks an app up, LS
// carries it (a row at a time up and down), A puts it down, X is done. A long
// press starts rearranging on touch. The order is saved.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/phone-home-check.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 await page.goto((process.env.LAZER_URL||'http://127.0.0.1:5192')+'/phone-home-check.html');
 const result=await page.evaluate(async()=>{
  const {Phone}=await import('/src/phone/phone.ts');
  const {homePage}=await import('/src/phone/apps.ts');
  const {emptyInput}=await import('/src/input/input.ts');
  const ui=await import('/src/phone/canvas-ui.ts');
  localStorage.removeItem('swf-phone-app-order-v1');
  const create=()=>{const phone=new Phone();for(let i=0;i<20;i++)phone.register({id:'test'+i,label:'APP '+i,icon:'music',color:'#ff5a1f',open:()=>({title:'APP '+i,page:()=>({blocks:[]})})});phone.homePage=()=>homePage({phone});phone.open();phone.tick(1);return phone;};
  const press=(phone,set)=>{const f=emptyInput();set(f);phone.update(f,1/60);phone.tick(.2);const idle=emptyInput();phone.update(idle,1/60);phone.tick(.05);};
  const tiles=phone=>phone.homePage().blocks.find(b=>b.type==='grid').tiles.map(t=>t.id);
  const phone=create();
  const home=phone.homePage();
  const clock=home.blocks[0].type==='image';
  const rows=home.blocks.filter(b=>b.type==='list').flatMap(b=>b.rows.map(r=>r.id));
  const page0=tiles(phone);
  // Everything on the page fits between the status bar and the nav bar.
  const fits=phone.screen.contentH<=ui.SCREEN_H-ui.NAV_H-ui.STATUS_H-8;
  // LS right off the grid's right edge turns the page.
  phone.screen.focusId='app-test3';phone.tick(.2);press(phone,f=>{f.steer=1;});
  const controllerPage=phone.homePageIndex;const page1=tiles(phone);
  phone.setHomePage(0);phone.tick(.2);
  // X: rearrange. A picks test0 up, LS right carries it one place, LS down a row, A puts it down, X done.
  press(phone,f=>{f.pressed.pushDeck=true;});const editing=phone.homeEditing;
  phone.screen.focusId='app-test0';phone.tick(.2);press(phone,f=>{f.pressed.hop=true;});const picked=phone.editingAppId;
  press(phone,f=>{f.steer=1;});const afterRight=phone.apps.map(a=>a.id).indexOf('test0');
  press(phone,f=>{f.lean=1;});const afterDown=phone.apps.map(a=>a.id).indexOf('test0');
  press(phone,f=>{f.pressed.hop=true;});const dropped=phone.editingAppId==='';
  press(phone,f=>{f.pressed.pushDeck=true;});const done=!phone.homeEditing;
  const order=phone.apps.map(a=>a.id);
  // Touch: a long press on an app starts rearranging with it picked up; a tap on another spot moves it there.
  const canvas=phone.screen.canvas;canvas.setPointerCapture=()=>{};
  const t2=[...phone.screen.targets].find(t=>t.id==='app-test2');
  const r=canvas.getBoundingClientRect(),cx=r.left+(t2.x+t2.w/2)/ui.SCREEN_W*r.width,cy=r.top+(t2.y+t2.h/3)/ui.SCREEN_H*r.height;
  canvas.dispatchEvent(new PointerEvent('pointerdown',{pointerId:2,clientX:cx,clientY:cy,bubbles:true}));
  await new Promise(res=>setTimeout(res,700));
  const longPress={editing:phone.homeEditing,picked:phone.editingAppId};
  canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId:2,clientX:cx,clientY:cy,bubbles:true}));
  phone.tick(.2);
  const t5=[...phone.screen.targets].find(t=>t.id==='app-test5');
  phone.tap(t5.x+t5.w/2,t5.y+10);phone.tick(.2);
  const tapMoved=phone.apps.map(a=>a.id).indexOf('test2');
  phone.setHomeEditing(false);phone.setHomePage(0);phone.tick(.3);
  // A swipe still turns the page.
  canvas.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:250,clientY:300,bubbles:true}));
  canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:100,clientY:302,bubbles:true}));
  canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:100,clientY:302,bubbles:true}));
  const swipePage=phone.homePageIndex;
  const {applyUiPalette,uiColors}=await import('/src/ui/palette.ts');
  applyUiPalette('grayscale');phone.tick(.3);
  const pixel=[...phone.screen.g.getImageData(10,200,1,1).data];
  const paletteOk=ui.TEAL===uiColors().teal&&phone.homePage().blocks.find(b=>b.type==='grid').tiles[0].color===uiColors().lime&&Math.max(...pixel.slice(0,3))-Math.min(...pixel.slice(0,3))<3;
  applyUiPalette('default');
  const finalOrder=phone.apps.map(a=>a.id);
  const restored=create();
  return {clock,rows,page0,fits,controllerPage,page1,editing,picked,afterRight,afterDown,dropped,done,order,longPress,tapMoved,swipePage,paletteOk,finalOrder,restored:restored.apps.map(a=>a.id)};
 });
 assert.equal(result.clock,true,'the time and date widget stays on top');
 assert.deepEqual(result.rows,[],'no page or edit buttons on the home screen');
 assert.equal(result.page0.length,16,'16 apps on a page');
 assert.equal(result.fits,true,'the page fits without scrolling');
 assert.equal(result.controllerPage,1,'LS off the right edge turns the page');
 assert.deepEqual(result.page1,['app-test16','app-test17','app-test18','app-test19']);
 assert.equal(result.editing,true,'X starts rearranging');
 assert.equal(result.picked,'test0','A picks the focused app up');
 assert.equal(result.afterRight,1,'LS right carries it one place');
 assert.equal(result.afterDown,5,'LS down carries it a row (4 places)');
 assert.equal(result.dropped,true,'A puts it down');
 assert.equal(result.done,true,'X finishes');
 assert.deepEqual(result.longPress,{editing:true,picked:'test2'},'a long press picks the app up');
 assert.equal(result.tapMoved,result.order.indexOf('test5'),'a tap on another app moves the held one there');
 assert.equal(result.swipePage,1);
 assert.equal(result.paletteOk,true);
 assert.deepEqual(result.restored,result.finalOrder,'the order is saved');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: phone home: clock widget, 4 x 4 apps with no page buttons, X rearrange with LS, long press and tap on touch, swipe pages, saved order.');
}finally{await browser.close();}
