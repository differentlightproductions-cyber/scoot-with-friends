import * as THREE from 'three';
import {Park,registerShop} from './park';
import {blankLayout,makeObject,setActiveLayout} from '../editor/layout';
import {buildObject} from '../editor/assets';
import {PARTS,defaultScooter,type Category,type PartSelection} from '../data/scooterParts';
import {ScooterAssembly} from '../scooter/assembly';
export const SHOP_DISPLAYS:{x:number;z:number;category:Category;label:string}[]=[
 {x:-4.7,z:-.3,category:'wheels',label:'Wheels / pairs'},{x:-4.7,z:2.5,category:'clamp',label:'Clamps'},
 {x:4.8,z:3,category:'bars',label:'Handlebars'},{x:-4.7,z:5,category:'deck',label:'Decks'},
 {x:4.8,z:.2,category:'fork',label:'Forks'},{x:4.8,z:5.5,category:'grips',label:'Grips'},
 {x:0,z:6.8,category:'bearings',label:'Bearings / hardware'}];
export const shopLayout=blankLayout();shopLayout.title='Techno Gravity DIY alley';
for(const [type,x,z,w,h,l]of [['Mini Ramp',-7,24,8,1.8,16],['Bank',7,18,3,1,3],['Grind Box',7,26,1.2,.55,4],['Flat Rail',1,23,.1,.65,5]] as const){const o=makeObject(type,x,z);Object.assign(o,{id:'tg-'+type.replaceAll(' ','-'),width:w,height:h,length:l,radius:3.5,deck:1,coping:true,material:'wood'});shopLayout.objects.push(o);}
const V=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
export function installShop(){registerShop(buildShop);}
function buildShop(park:Park){
 const scene=park.scene;setActiveLayout(shopLayout);
 scene.background=new THREE.Color(0xa8c4d2);scene.fog=new THREE.Fog(0xa8c4d2,65,150);
 scene.add(new THREE.HemisphereLight(0xfff0dc,0x67736e,1.6));const sun=new THREE.DirectionalLight(0xffe3bf,2.5);sun.position.set(-15,30,-20);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-35;sun.shadow.camera.right=35;sun.shadow.camera.top=35;sun.shadow.camera.bottom=-35;scene.add(sun);
 const box=(x:number,y:number,z:number,w:number,h:number,l:number,c=0xd7c7a8,solid=true)=>park.box(V(x,y,z),V(w,h,l),c,solid);
 const sign=(text:string,x:number,y:number,z:number,w:number,h:number,color='#f3e2bb',bg='#223331',yaw=Math.PI)=>{const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d')!;ctx.fillStyle=bg;ctx.fillRect(0,0,1024,256);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 74px Arial';ctx.fillText(text,512,128,960);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:t,roughness:.9,side:THREE.DoubleSide}));m.position.set(x,y,z);m.rotation.y=yaw;scene.add(m);return m;};
 // Modest single retail unit: open entrance and connected sidewalk / side alley.
 box(0,-.052,-19,35,.12,24,0x555b5c);box(0,-.021,-6.8,34,.06,3.5,0xc3c2b8);
 box(0,-.008,2,15.7,.035,13.7,0x2d3934);box(0,3.55,2,16.5,.4,14.5);
 box(-8,1.7,2,.25,3.4,14);box(8,1.7,2,.25,3.4,14);box(0,1.7,9,16,3.4,.25);
 box(-4.8,.4,-5,6.4,.8,.22,0x8b8070);box(4.8,.4,-5,6.4,.8,.22,0x8b8070);box(0,3,-5,16,.7,.25);
 for(const x of [-8,-1.5,1.5,8])box(x,1.7,-5,.12,3.4,.18,0x293333);
 const glassMat=new THREE.MeshBasicMaterial({color:0x93b6b4,transparent:true,opacity:.09,depthWrite:false,side:THREE.FrontSide});
 for(const x of [-4.75,4.75]){const glass=box(x,1.75,-5,6.3,1.9,.025,0xc1d9d6);(glass.material as THREE.Material).dispose();(glass as THREE.Mesh).material=glassMat;sign(x<0?'TECHNO':'GRAVITY',x,1.9,-5.03,3.2,.55,'#f4edda','#344642',Math.PI);}
 sign('TECHNO GRAVITY',0,3.05,-5.26,10,.62,'#f8eace','#753e38',Math.PI);sign('SCOOTERS / PARTS / REPAIRS',0,2.62,-5.26,6,.24,'#223331','#d7c7a8',Math.PI);
 const mat=sign('TECHNO GRAVITY',0,.018,-3.8,2.2,.65);mat.rotation.set(-Math.PI/2,0,0);
 // Ceiling tiles and efficient emissive fluorescent fittings.
 for(let x=-7.5;x<8;x+=1.25)for(let z=-4.5;z<9;z+=1.25)box(x,3.31,z,1.22,.025,1.22,0xdedbd0,false);
 for(const z of [-2,2,6])for(const x of [-3,3]){const fixture=box(x,3.26,z,1.1,.035,.48,0xfaf2d3,false);const m=fixture.material as THREE.MeshStandardMaterial;m.emissive.set(0xffecc5);m.emissiveIntensity=1;}
 for(const z of [-1,5]){const light=new THREE.PointLight(0xffefd6,16,11,1.3);light.position.set(0,2.8,z);scene.add(light);}
 // Long dark-based cases, glass shelves and rows of actual catalog meshes.
 const prototypes=new Map<string,THREE.Group>();
 const product=(selection:PartSelection)=>{const key=selection.partId+selection.variantId;if(prototypes.has(key))return prototypes.get(key)!;const root=new THREE.Group(),a=new ScooterAssembly(root),loadout=defaultScooter(),part=PARTS.find(p=>p.id===selection.partId)!;if(part.category==='wheels'){loadout.frontWheel=selection;loadout.rearWheel=selection;}else loadout[part.category]=selection;a.build(loadout);root.updateMatrixWorld(true);const out=new THREE.Group();root.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.part===part.id){if(part.category==='wheels'&&o.parent?.userData.slot==='rearWheel')return;const g=o.geometry.clone().applyMatrix4(o.matrixWorld),m=new THREE.Mesh(g,o.material);out.add(m);}});const bounds=new THREE.Box3().setFromObject(out),center=bounds.getCenter(new THREE.Vector3());out.children.forEach(o=>o.position.sub(center));prototypes.set(key,out);return out;};
 const place=(partId:string,variantId:string,x:number,y:number,z:number,scale=1,yaw=Math.PI/2)=>{const group=product({partId,variantId}).clone();group.position.set(x,y,z);group.scale.setScalar(scale);group.rotation.y=yaw;scene.add(group);};
 for(const x of [-5.8,5.8])for(const z of [0,3,6]){box(x,.25,z,1.0,.5,2.65,0x222a2b);const collider=box(x,.75,z,1,1,2.65,0xb9d4ce);(collider.material as THREE.Material).dispose();(collider as THREE.Mesh).material=glassMat;for(const y of [.53,.86,1.2]){const shelf=box(x,y,z,.92,.012,2.6,0x394442,false);if(y>1)shelf.visible=false;}for(const sx of [-.49,.49]){for(const y of [.51,1.23])box(x+sx,y,z,.025,.025,2.65,0x657373,false);for(const dz of [-1.31,1.31])box(x+sx,.87,z+dz,.025,.73,.025,0x657373,false);}}
 for(const display of SHOP_DISPLAYS){const parts=PARTS.filter(p=>p.category===display.category).sort((a,b)=>Number(b.brandId==='mafioso')-Number(a.brandId==='mafioso')),x=display.x<0?-5.8:display.x>0?5.8:0;let n=0;
  for(const p of parts)for(const variant of p.variants){if(n>=12)break;const row=Math.floor(n/4),col=n%4;place(p.id,variant.id,x+(row-1)*.22,.65+row*.18,display.z-.85+col*.48,p.category==='bars'?.85:p.category==='deck'?1:1.25,p.category==='bars'?0:Math.PI/2);n++;}
  sign(display.label.toUpperCase(),x,1.35,display.z,1.4,.25,'#efe3c4','#2a3637',x<0?Math.PI/2:x>0?-Math.PI/2:Math.PI);
 }
 // Wall grid, raised completes, hanging soft goods and service counter.
 for(let z=-3;z<8;z+=.4)box(7.82,1.85,z,.02,2,.016,0x313b3d,false);for(let y=.9;y<3;y+=.4)box(7.82,y,2.4,.02,.015,11,0x313b3d,false);
 for(let i=0;i<6;i++){const p=PARTS.filter(p=>p.category==='bars')[i%4];place(p.id,p.variants[0].id,7.7,2.0,-2+i*1.6,1,Math.PI/2);}
 box(-2.5,.2,7.9,5,.4,1.2,0xb68e5f);for(let i=0;i<5;i++){const root=new THREE.Group();new ScooterAssembly(root);root.position.set(-4.5+i, .4,7.7);root.rotation.y=-.3;scene.add(root);box(-4.5+i,.44,7.65,.16,.08,.5,0x2a3537,false);}
 box(2.4,.5,7.7,2.4,1,1.1,0x2d3534);box(2.4,1.04,7.7,2.6,.07,1.2,0xb19672);box(2.7,1.24,7.7,.35,.35,.28,0x20272a,false);sign('TECHNO GRAVITY',2.4,.7,7.12,2,.3);
 box(-6.6,.85,8,2,.1,1.2,0x9d805c);for(const x of [-7.4,-5.8])box(x,.4,8,.08,.8,1,0x343e3c);for(let i=0;i<6;i++)box(-7.3+i*.25,.94,8,.05,.04,.35,0x777b78,false);
 sign('LAZER / BUILT TO RIDE',-3,2.5,8.84,4,.8);sign('MAFIOSO',3,2.5,8.84,3,.8,'#cab46f');
 for(let i=0;i<8;i++){box(-7.78,2, -2+i*.9,.05,.36,.26,[0x6f8e79,0x382d36,0xaf7356][i%3],false);box(-7.74,2.18,-2+i*.9,.02,.06,.15,0xded5bf,false);}
 for(let i=0;i<5;i++){const shell=new THREE.Mesh(new THREE.SphereGeometry(.14,16,10,0,Math.PI*2,0,1.8),new THREE.MeshStandardMaterial({color:[0xaa5d40,0x2d3d46,0xb7b5a1][i%3]}));shell.position.set(-7.5,2.65,-2+i*1.5);scene.add(shell);}
 // Fictional DIY extension: clean riding surfaces with rough background props.
 box(0,-.030,25,28,.07,31,0x666967);for(const o of shopLayout.objects){o.y=.012;buildObject(park,o);}
 for(const x of [-15,15])box(x,1.2,19,.15,2.4,32,0x858376);box(0,1.2,38,30,2.4,.15,0x858376);
 for(let i=0;i<6;i++)box(-13,.12+i*.08,14,1.5,.08,1,0xa58a65,false);for(let i=0;i<3;i++)box(12,.08,32+i*.35,2.4,.1,.18,0xb89a71,false);
 park.bench('tg-front-bench',-5,0,-7,.6,2.5);sign('DIY ALLEY →',9,1.9,5,2,.5,'#e3d5b5','#34413e',Math.PI/2);
 for(let i=0;i<7;i++)box(-13+i*4,.002,-19,.07,.008,7,0xe9e4cc,false);
}
