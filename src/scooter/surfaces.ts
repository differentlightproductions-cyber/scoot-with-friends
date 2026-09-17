import * as THREE from 'three';
// Reproducible authored surface profiles in metres. No physics lives here.
export function lathe(profile:number[][],segments=32){return new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),segments);}
export function extrusion(points:number[][],depth:number,bevel=.004){
 const s=new THREE.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();
 const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:3,steps:1,curveSegments:12});g.translate(0,0,-depth/2);return g;
}
/** Side-elevation shape (z,y), extruded symmetrically across the scooter's X axis. */
export function sidePlate(shape:THREE.Shape,thickness:number,bevel=.002){
 const g=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:4,curveSegments:18,steps:1});g.translate(0,0,-thickness/2);g.rotateY(-Math.PI/2);return g;
}
export function plate(width:number,length:number,thickness:number,r=.018){
 const s=new THREE.Shape(),x=width/2,z=length/2;
 s.moveTo(-x+r,-z);s.lineTo(x-r,-z);s.quadraticCurveTo(x,-z,x,-z+r);s.lineTo(x,z-r);s.quadraticCurveTo(x,z,x-r,z);s.lineTo(-x+r,z);s.quadraticCurveTo(-x,z,-x,z-r);s.lineTo(-x,-z+r);s.quadraticCurveTo(-x,-z,-x+r,-z);
 const g=new THREE.ExtrudeGeometry(s,{depth:thickness,bevelEnabled:true,bevelSize:Math.min(.003,thickness*.2),bevelThickness:Math.min(.003,thickness*.2),bevelSegments:3,curveSegments:10});g.rotateX(Math.PI/2);g.translate(0,thickness/2,0);return g;
}
/** Griptape sheet artwork: base grit colour plus a plain/stripe/logo/crown design in the accent. */
export function griptapeTexture(shape:string,color:number,accent:number){
 const c=document.createElement('canvas');c.width=256;c.height=1024;const ctx=c.getContext('2d')!;
 const hex=(n:number)=>'#'+n.toString(16).padStart(6,'0');
 ctx.fillStyle=hex(color);ctx.fillRect(0,0,256,1024);
 let seed=911;const rnd=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
 for(let i=0;i<7000;i++){const a=rnd()*.14;ctx.fillStyle=`rgba(255,255,255,${a})`;ctx.fillRect(rnd()*256,rnd()*1024,1.3,1.3);}
 ctx.fillStyle=hex(accent);
 if(shape==='stripe'){ctx.fillRect(70,40,26,944);ctx.fillRect(160,40,26,944);}
 if(shape==='logo'){ctx.save();ctx.translate(128,300);ctx.rotate(-Math.PI/2);ctx.font='bold 118px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('LAZER',0,0);ctx.restore();
  ctx.beginPath();ctx.moveTo(140,560);ctx.lineTo(96,700);ctx.lineTo(132,700);ctx.lineTo(112,820);ctx.lineTo(168,660);ctx.lineTo(132,660);ctx.closePath();ctx.fill();}
 if(shape==='crown')for(let y=70;y<1000;y+=150)for(const x of y%300===70?[64,192]:[128]){ctx.beginPath();ctx.moveTo(x-36,y+26);ctx.lineTo(x-36,y-14);ctx.lineTo(x-18,y+4);ctx.lineTo(x,y-26);ctx.lineTo(x+18,y+4);ctx.lineTo(x+36,y-14);ctx.lineTo(x+36,y+26);ctx.closePath();ctx.fill();}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
export function tube(points:THREE.Vector3[],radius:number){return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),Math.max(16,points.length*8),radius,16,false);}
export function detailTexture(kind:'rubber'|'grip'|'brushed'|'fabric'){
 const size=128,data=new Uint8Array(size*size*4);let seed=719;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=kind==='brushed'?238+8*Math.sin(y*3)+seed%6:kind==='fabric'?237+(x%3===0||y%3===0?-9:5):kind==='rubber'?240+(y%8<2?-18:0):220+seed%35;const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=n;data[i+3]=255;}
 const t=new THREE.DataTexture(data,size,size);t.needsUpdate=true;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;return t;
}
