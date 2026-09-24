import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
const cache=new Map<string,THREE.CanvasTexture>();
/**
 * Poured concrete, 512 px and seamless: broad trowel mottling, fine sand grain,
 * exposed aggregate, air pits, faint hairline cracks and a few weathered stains.
 * Mean brightness stays near the old flat noise so tinted slabs keep their colour.
 */
function concreteTexture(){
 const N=512,c=document.createElement('canvas');c.width=c.height=N;const ctx=c.getContext('2d')!,d=ctx.createImageData(N,N);
 let seed=7919;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 // Periodic value noise: lattice wraps at `cells`, so the tile is seamless.
 const lattice=(cells:number)=>{const g=new Float32Array(cells*cells);for(let i=0;i<g.length;i++)g[i]=rnd();return (x:number,y:number)=>{const fx=x/N*cells,fy=y/N*cells,x0=Math.floor(fx),y0=Math.floor(fy),tx=fx-x0,ty=fy-y0,sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty);const at=(i:number,j:number)=>g[((j%cells+cells)%cells)*cells+((i%cells+cells)%cells)];return (at(x0,y0)*(1-sx)+at(x0+1,y0)*sx)*(1-sy)+(at(x0,y0+1)*(1-sx)+at(x0+1,y0+1)*sx)*sy;};};
 const broad=lattice(4),mid=lattice(12),fine=lattice(48);
 const h=new Float32Array(N*N);
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){
  const mottle=broad(x,y)*.55+mid(x,y)*.3+fine(x,y)*.15;
  h[y*N+x]=241+(mottle-.5)*16+(rnd()-.5)*9;
 }
 const put=(x:number,y:number,v:number)=>{const i=((y+N)%N)*N+((x+N)%N);h[i]=v;};
 const add=(x:number,y:number,v:number)=>{const i=((y+N)%N)*N+((x+N)%N);h[i]+=v;};
 // Exposed aggregate: small stones, lighter or darker than the paste.
 for(let k=0;k<2600;k++){const x=Math.floor(rnd()*N),y=Math.floor(rnd()*N),r=rnd()<.8?1:2,tone=(rnd()<.5?-1:1)*(6+rnd()*10);for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++)if(i*i+j*j<=r*r+.5)add(x+i,y+j,tone);}
 // Air pits: tiny dark holes.
 for(let k=0;k<900;k++){const x=Math.floor(rnd()*N),y=Math.floor(rnd()*N);put(x,y,206+rnd()*14);if(rnd()<.3)add(x+1,y,-12);}
 // Hairline cracks: a few wandering lines.
 for(let k=0;k<5;k++){let x=rnd()*N,y=rnd()*N,a=rnd()*Math.PI*2;const len=60+rnd()*140;for(let s=0;s<len;s++){a+=(rnd()-.5)*.5;x+=Math.cos(a);y+=Math.sin(a);add(Math.round(x),Math.round(y),-(9+rnd()*6));}}
 // Weathered stains: soft darker blotches.
 for(let k=0;k<7;k++){const cx=rnd()*N,cy=rnd()*N,r=18+rnd()*46,depth=4+rnd()*6;for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++){const q=(i*i+j*j)/(r*r);if(q<1)add(Math.round(cx+i),Math.round(cy+j),-depth*(1-q)*(1-q)*(.7+.3*fine(cx+i,cy+j)));}}
 for(let i=0;i<N*N;i++){const v=Math.max(0,Math.min(255,h[i]));d.data[i*4]=v;d.data[i*4+1]=v*.995;d.data[i*4+2]=v*.985;d.data[i*4+3]=255;}
 ctx.putImageData(d,0,0);
 return c;
}
export function surfaceTexture(kind:'wood'|'concrete'){
 if(cache.has(kind))return cache.get(kind)!;
 if(kind==='concrete'){const t=new THREE.CanvasTexture(concreteTexture());t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;cache.set(kind,t);return t;}
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
 const texture=surfaceTexture(kind).clone();texture.repeat.set(sx/(kind==='wood'?.3:2.4),sz/(kind==='wood'?2:2.4));texture.needsUpdate=true;
 const m=new THREE.MeshStandardMaterial({color,map:texture,bumpMap:texture,bumpScale:kind==='wood'?.001:.0012,roughness:kind==='wood'?.83:.94});m.name=kind;return m;
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
