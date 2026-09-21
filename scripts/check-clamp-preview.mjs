import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
mkdirSync('artifacts/clamps',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:800,height:600}});
 await page.route('**/clamp-check',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
 await page.goto('http://127.0.0.1:5186/clamp-check');
 for(const kind of ['double','triple']){
  const result=await page.evaluate(async kind=>{
   const T=await import('/node_modules/.vite/deps/three.js');
   const {ScooterAssembly}=await import('/src/scooter/assembly.ts');
   const {defaultScooter,PARTS}=await import('/src/data/scooterParts.ts');
   const part=PARTS.find(p=>p.category==='clamp'&&p.shape===kind),loadout=defaultScooter();
   loadout.clamp={partId:part.id,variantId:part.variants[0].id};
   const scene=new T.Scene(),root=new T.Group();scene.add(root);new ScooterAssembly(root,loadout);
   root.traverse(o=>{if(o.isMesh)o.visible=o.userData.part===part.id;});
   const camera=new T.PerspectiveCamera(35,800/600,.001,10);camera.position.set(.12,.44,.12);camera.lookAt(0,.36,.291);
   scene.background=new T.Color('#b8c3cc');scene.add(new T.HemisphereLight(0xffffff,0x555555,3));const light=new T.DirectionalLight(0xffffff,4);light.position.set(1,2,-1);scene.add(light);
   const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(800,600);document.body.replaceChildren(renderer.domElement);document.body.style.margin='0';renderer.render(scene,camera);
   return {part:part.name,draws:renderer.info.render.calls};
  },kind);
  await page.screenshot({path:`artifacts/clamps/${kind}.png`});console.log(JSON.stringify(result));
 }
} finally {await browser.close();}
