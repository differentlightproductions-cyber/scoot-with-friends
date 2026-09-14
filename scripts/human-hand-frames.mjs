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
export function handPoses(data,rig,weights){
 const result={};
 for(const [sideIndex,side]of ['R','L'].entries()){
  const frame=data.handFrames[sideIndex],origin=new THREE.Vector3().fromArray(data.anchors[sideIndex?12:6][0]);
  const local=p=>{const d=p.clone().sub(origin);return new THREE.Vector3(d.dot(new THREE.Vector3().fromArray(frame.across)),d.dot(new THREE.Vector3().fromArray(frame.normal)),d.dot(new THREE.Vector3().fromArray(frame.along)));};
  const joint=(bone,end)=>{const ids=rig.joints[rig.bones[bone][end]];return local(ids.reduce((v,i)=>v.add(new THREE.Vector3().fromArray(data.positions[i])),new THREE.Vector3()).divideScalar(ids.length));};
  const sums=new Map(),totals=new Map();
  for(let finger=1;finger<=5;finger++){
   let end;
   for(let segment=1;segment<=3;segment++){
    const name=`finger${finger}-${segment}.${side}`,a=joint(name,'head'),b=joint(name,'tail'),length=a.distanceTo(b);
    const start=end?.clone()??a.clone();
    if(segment===1&&finger!==1){start.y=0;start.z=frame.length-.006;}
    let direction;
    if(finger===1){const sign=side==='R'?1:-1;const target=new THREE.Vector3(sign*(segment===1?.043:segment===2?.030:.012),segment===1?-.007:-.025,frame.length+(segment===1?-.023:segment===2?-.007:.006));direction=target.sub(start).normalize();}
    else{const angle=[.92,1.98,2.92][segment-1];direction=new THREE.Vector3(0,-Math.sin(angle),Math.cos(angle));}
    end=start.clone().addScaledVector(direction,length);
    const rotation=new THREE.Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(),direction);
    for(const [i,w]of weights[name]??[]){const point=local(new THREE.Vector3().fromArray(data.positions[i])).sub(a).applyQuaternion(rotation).add(start);if(!sums.has(i))sums.set(i,new THREE.Vector3());sums.get(i).addScaledVector(point,w);totals.set(i,(totals.get(i)??0)+w);}
   }
  }
  data.positions.forEach((p,i)=>{if(data.skinIndex[i][0]!== (sideIndex?12:6)||data.skinWeight[i][0]<.65)return;const open=local(new THREE.Vector3().fromArray(p));const total=Math.min(1,totals.get(i)??0),closed=(sums.get(i)??new THREE.Vector3()).clone().addScaledVector(open,1-total);result[i]={open:open.add(origin).toArray(),closed:closed.add(origin).toArray()};});
 }
 return result;
}
if(process.argv[1]?.endsWith('human-hand-frames.mjs')){const rig=JSON.parse(readFileSync('assets-source/humans/default.mhskel')),weights=JSON.parse(readFileSync('assets-source/humans/default_weights.mhw')).weights;for(let i=1;i<=3;i++){const path=`public/models/humans/rider-${i}.json`,data=JSON.parse(readFileSync(path));data.handFrames=handFrames(data,rig);data.handPoses=handPoses(data,rig,weights);writeFileSync(path,JSON.stringify(data,(_,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v));console.log('Fitted finger poses',i,Object.keys(data.handPoses).length);}}
