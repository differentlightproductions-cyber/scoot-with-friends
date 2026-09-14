import * as THREE from 'three';
let texture:THREE.CanvasTexture|undefined;
export function grainTexture(){
 if(texture)return texture;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
 const ctx=canvas.getContext('2d')!,data=ctx.createImageData(128,128);
 let seed=1039;
 for(let i=0;i<data.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const n=226+(seed%29);data.data[i]=data.data[i+1]=data.data[i+2]=n;data.data[i+3]=255;}
 ctx.putImageData(data,0,0);texture=new THREE.CanvasTexture(canvas);
 texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(24,24);texture.colorSpace=THREE.SRGBColorSpace;
 return texture;
}
