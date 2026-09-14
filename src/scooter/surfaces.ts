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
export function tube(points:THREE.Vector3[],radius:number){return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),Math.max(16,points.length*8),radius,16,false);}
export function detailTexture(kind:'rubber'|'grip'|'brushed'|'fabric'){
 const size=128,data=new Uint8Array(size*size*4);let seed=719;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=kind==='brushed'?238+8*Math.sin(y*3)+seed%6:kind==='fabric'?237+(x%3===0||y%3===0?-9:5):kind==='rubber'?240+(y%8<2?-18:0):220+seed%35;const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=n;data[i+3]=255;}
 const t=new THREE.DataTexture(data,size,size);t.needsUpdate=true;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;return t;
}
