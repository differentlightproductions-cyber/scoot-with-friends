import {readFileSync,writeFileSync} from 'node:fs';
import * as THREE from 'three';
// Anatomical palm axes remove the arbitrary wrist-bone twist before gripping.
export function handFrames(data,rig){return ['R','L'].map(side=>{
 const avg=(bone,end='head')=>{const ids=rig.joints[rig.bones[bone][end]];return ids.reduce((v,i)=>v.add(new THREE.Vector3().fromArray(data.positions[i])),new THREE.Vector3()).divideScalar(ids.length);};
 const origin=avg('wrist.'+side),knuckle=avg('finger3-1.'+side);
 const along=knuckle.clone().sub(origin),length=along.length();along.normalize();
 const across=avg('finger2-1.'+side).sub(avg('finger5-1.'+side));across.addScaledVector(along,-across.dot(along)).normalize();if(across.x<0)across.negate();
 const normal=along.clone().cross(across).normalize();
 return {across:across.toArray(),along:along.toArray(),normal:normal.toArray(),length};
});}
if(process.argv[1]?.endsWith('human-hand-frames.mjs')){const rig=JSON.parse(readFileSync('assets-source/humans/default.mhskel'));for(let i=1;i<=3;i++){const path=`public/models/humans/rider-${i}.json`,data=JSON.parse(readFileSync(path));data.handFrames=handFrames(data,rig);writeFileSync(path,JSON.stringify(data));console.log(i,data.handFrames.map(x=>x.length));}}
