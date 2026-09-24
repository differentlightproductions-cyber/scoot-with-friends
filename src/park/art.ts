import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
const cache=new Map<string,THREE.CanvasTexture>();
export function surfaceTexture(kind:'wood'|'concrete'){
 if(cache.has(kind))return cache.get(kind)!;
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!,d=ctx.createImageData(256,256);let seed=391;
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const grain=Math.sin(x*.74+Math.sin(y*.026)*2+Math.sin(y*.081+x*.015)*.7);
  const shade=kind==='wood'?233+grain*9+(seed%5):242+(seed%11);const i=(y*256+x)*4;d.data[i]=d.data[i+1]=d.data[i+2]=shade;d.data[i+3]=255;
 }ctx.putImageData(d,0,0);if(kind==='wood'){ctx.strokeStyle='rgba(80,65,40,.10)';ctx.lineWidth=1;for(const x of [18,95,161,233]){ctx.beginPath();ctx.ellipse(x,117,3,37,.02,0,Math.PI*2);ctx.stroke();}}
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;cache.set(kind,t);return t;
}
// Photographed lawn (ambientCG "Grass004", CC0) instead of generated noise: tinted
// concrete texture read as painted paving, not grass. One shared image; every
// slab gets its own Texture so its repeat can follow its size, and each is
// flagged for upload only once the image has actually arrived.
let lawnImage:HTMLImageElement|undefined,lawnReady=false;const lawnTextures:THREE.Texture[]=[];
export function lawnTexture(sx:number,sz:number){
 if(!lawnImage){lawnImage=new Image();lawnImage.onload=()=>{lawnReady=true;lawnTextures.forEach(t=>{t.needsUpdate=true;});};lawnImage.src='/textures/grass-lawn.jpg?v=1';}
 const t=new THREE.Texture(lawnImage);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;
 t.repeat.set(sx/3,sz/3);if(lawnReady)t.needsUpdate=true;else lawnTextures.push(t);return t;
}
export function surfaceMaterial(color:number,kind:'wood'|'concrete'|'grass',sx=1,sz=1){
 if(kind==='grass'){const m=new THREE.MeshStandardMaterial({color:0xffffff,map:lawnTexture(sx,sz),roughness:1});m.name='grass';return m;}
 const texture=surfaceTexture(kind).clone();texture.repeat.set(sx/(kind==='wood'?.3:1.6),sz/(kind==='wood'?2:1.6));texture.needsUpdate=true;
 const m=new THREE.MeshStandardMaterial({color,map:texture,bumpMap:texture,bumpScale:kind==='wood'?.001:.0006,roughness:kind==='wood'?.83:.94});m.name=kind;return m;
}
export function benchPlanks(scene:THREE.Scene,x:number,seat:number,z:number,width:number,length:number){
 const group=new THREE.Group();group.name='Crafted bench planks and brackets';
 for(let i=0;i<5;i++){
  const mesh=new THREE.Mesh(new RoundedBoxGeometry(width/5-.006,.112,length,3,.009),surfaceMaterial([0xab8256,0xa77d50,0xb48b5c][i%3],'wood',width/5,length));mesh.position.set(x-width/2+(i+.5)*width/5,seat-.056,z);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
 }
 const bolts:THREE.BufferGeometry[]=[];
 for(const dz of [-length*.34,length*.34])for(let i=0;i<5;i++){const g=new THREE.CylinderGeometry(.009,.009,.002,12);g.translate(x-width/2+(i+.5)*width/5,seat+.001,z+dz);bolts.push(g);}
 const hardware=new THREE.Mesh(mergeGeometries(bolts),new THREE.MeshStandardMaterial({color:0x88908a,metalness:.85,roughness:.3}));group.add(hardware);bolts.forEach(g=>g.dispose());
 for(const dz of [-length*.34,length*.34]){const brace=new THREE.Mesh(new RoundedBoxGeometry(width*.82,.06,.15,2,.012),new THREE.MeshStandardMaterial({color:0x405451,metalness:.65,roughness:.4}));brace.position.set(x,seat-.135,z+dz);group.add(brace);}
 scene.add(group);
}
