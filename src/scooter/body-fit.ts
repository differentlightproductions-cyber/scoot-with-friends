import * as THREE from 'three';
export type BodyBuild='skinny'|'regular'|'chunky';
export const BODY_BUILDS:BodyBuild[]=['skinny','regular','chunky'];
/** Regional radial morphs preserve bone lengths, hands, feet and identity. */
export function fittedPoint(p:THREE.Vector3,indices:number[],weights:number[],anchors:number[][][],names:string[],build:BodyBuild){
 if(build==='regular')return p.clone();
 const result=p.clone(),amount=build==='skinny'?-.17:.25;
 for(let k=0;k<4;k++){
  const id=indices[k],weight=weights[k],name=names[id];if(!weight||/head|neck|hand|foot/.test(name))continue;
  const a=new THREE.Vector3().fromArray(anchors[id][0]),b=new THREE.Vector3().fromArray(anchors[id][1]);
  if(/torso|hips/.test(name)){
   const waist=Math.exp(-(((p.y-1.03)/.17)**2)),chest=Math.exp(-(((p.y-1.26)/.16)**2));
   result.x+=p.x*amount*(.6+.45*waist+.18*chest)*weight;
   result.z+=(p.z-a.z)*amount*(.8+.8*waist)*weight;
   if(build==='chunky'&&p.z>a.z)result.z+=.019*waist*weight;
  }else{
   const axis=b.clone().sub(a),t=THREE.MathUtils.clamp(p.clone().sub(a).dot(axis)/axis.lengthSq(),0,1),center=a.addScaledVector(axis,t);
   const fullness=.30+.70*Math.sin(Math.PI*t),factor=/thigh|upper/.test(name)?1:.6;
   result.addScaledVector(p.clone().sub(center),amount*fullness*factor*weight);
  }
 }
 return result;
}
