import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
const v=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
/** Smooth, weighted garment topology driven by the existing pose targets, never the simulation. */
export class GarmentSkin {
 mesh:THREE.SkinnedMesh;private bones:THREE.Bone[]=[];
 constructor(private parent:THREE.Group,private drivers:THREE.Object3D[],kind:'pants'|'arm',materials:THREE.Material[]){
  parent.updateMatrixWorld(true);const rest=drivers.map(d=>{d.updateMatrix();return d.matrix.clone();});
  const pos:number[]=[],uv:number[]=[],indices:number[]=[],weights:number[]=[],skin:number[]=[];const groups:{start:number;count:number;materialIndex:number}[]=[];
  const segments=32,vertex=(p:THREE.Vector3,b0:number,b1:number,t:number,u:number,w:number)=>{pos.push(p.x,p.y,p.z);uv.push(u,w);skin.push(b0,b1,0,0);weights.push(1-t,t,0,0);};
  const ring=(points:THREE.Vector3[],b0:number,b1:number,t:number,w:number)=>{const start=pos.length/3;points.forEach((p,i)=>vertex(p,b0,b1,t,i/segments,w));return start;};
  const join=(a:number,b:number)=>{for(let j=0;j<segments;j++){const k=(j+1)%segments;indices.push(a+j,a+k,b+j,a+k,b+k,b+j);}};
  const endpoints=(index:number)=>{const d=drivers[index];return [v(0,-.5,0).applyMatrix4(d.matrix),v(0,.5,0).applyMatrix4(d.matrix)];};
  if(kind==='pants')for(let side=0;side<2;side++){
   const sign=side===0?-1:1,upper=1+side*2,lower=upper+1,[hip,knee]=endpoints(upper),[,foot]=endpoints(lower);
   // Each half shares its inner seam: a saddle-shaped crotch, not two disconnected cylinders.
   const top=Array.from({length:segments},(_,j)=>{const a=-Math.PI/2+j/segments*Math.PI*2;const outer=Math.max(0,Math.cos(a));return v(sign*.153*outer,.062-Math.pow(Math.max(0,-Math.cos(a)),.7)*.15,sign*Math.sin(a)*.108).applyMatrix4(rest[0]);});
   let previous=ring(top,0,upper,0,0);
   for(let r=1;r<=24;r++){
    const t=r/24*2,center=t<=1?hip.clone().lerp(knee,t):knee.clone().lerp(foot,t-1);
    const tangent=t<.8?knee.clone().sub(hip):t>1.2?foot.clone().sub(knee):foot.clone().sub(hip);tangent.normalize();
    const x=v(sign,0,0),z=tangent.clone().cross(x).normalize();
    const radius=t<.55?.098-t*.022:t<1?.088-(t-.55)*.025:t<1.45?.075-(t-1)*.014:.069-(t-1.45)*.031;
    const points=Array.from({length:segments},(_,j)=>{const a=-Math.PI/2+j/segments*Math.PI*2;const fold=1+.025*Math.sin(a*4+t*29)*Math.sin(t*Math.PI);return center.clone().addScaledVector(x,Math.cos(a)*radius*fold).addScaledVector(z,Math.sin(a)*radius*.95);});
    let b0=upper,b1=lower,blend=THREE.MathUtils.smoothstep(t,.78,1.22);if(t<.3){b0=0;b1=upper;blend=THREE.MathUtils.smoothstep(t,0,.3);}
    const next=ring(points,b0,b1,blend,t/2);const start=indices.length;join(previous,next);groups.push({start,count:indices.length-start,materialIndex:r<=11?0:1});previous=next;
   }
  }else{
   const [shoulder,elbow]=endpoints(0),[,wrist]=endpoints(1);let previous=-1;
   for(let r=0;r<=24;r++){
    const t=r/12,center=t<=1?shoulder.clone().lerp(elbow,t):elbow.clone().lerp(wrist,t-1),tangent=t<.8?elbow.clone().sub(shoulder):t>1.2?wrist.clone().sub(elbow):wrist.clone().sub(shoulder);tangent.normalize();
    const x=v(1,0,0).addScaledVector(tangent,-tangent.x).normalize(),z=tangent.clone().cross(x).normalize();
    const radius=t<.15?.07+Math.sin(t/.15*Math.PI/2)*.015:t<.7?.085-(t-.15)*.022:t<1?.06:t<1.4?.052:.052-(t-1.4)*.029;
    const points=Array.from({length:segments},(_,j)=>{const a=j/segments*Math.PI*2;return center.clone().addScaledVector(x,Math.cos(a)*radius).addScaledVector(z,Math.sin(a)*radius*.93);});
    const next=ring(points,0,1,THREE.MathUtils.smoothstep(t,.8,1.2),t/2);if(previous>=0){const first=indices.length;join(previous,next);if(r===9)this.sleeveEnd=indices.length;void first;}previous=next;
   }
  }
  let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skin,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));g.setIndex(indices);
  g=mergeVertices(g,.00001);g.computeVertexNormals();if(kind==='arm'){g.addGroup(0,this.sleeveEnd,0);g.addGroup(this.sleeveEnd,indices.length-this.sleeveEnd,1);}else {
   for(const group of groups){const previous=g.groups.at(-1);if(previous&&previous.materialIndex===group.materialIndex&&previous.start+previous.count===group.start)previous.count+=group.count;else g.addGroup(group.start,group.count,group.materialIndex);}
  }
  this.mesh=new THREE.SkinnedMesh(g,materials);this.mesh.name=kind==='pants'?'Continuous tailored trousers':'Continuous shoulder elbow wrist';this.mesh.castShadow=true;this.mesh.frustumCulled=false;
  this.bones=drivers.map((d,i)=>{const b=new THREE.Bone();b.name=kind+' pose '+i;parent.add(b);b.position.copy(d.position);b.quaternion.copy(d.quaternion);b.scale.copy(d.scale);return b;});
  parent.add(this.mesh);parent.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(this.bones);this.mesh.bind(skeleton);this.mesh.userData.assetRevision='weighted-tailoring-1';
 }
 private sleeveEnd=0;
 update(){this.bones.forEach((b,i)=>{const d=this.drivers[i];b.position.copy(d.position);b.quaternion.copy(d.quaternion);b.scale.copy(d.scale);});}
}

export function sneakerGeometry(sole=false){
 // Heel, padded collar rise, waist/arch, broad toe box, rounded toe end.
 const profiles=[[-.113,.024,.016],[-.103,.043,.027],[-.075,.048,.045],[-.04,.049,.048],[0,.052,.038],[.055,.054,.027],[.095,.046,.020],[.117,.027,.008],[.121,.002,.002]];
 const p:number[]=[],uv:number[]=[],idx:number[]=[],n=32;
 profiles.forEach(([z,w,h],j)=>{for(let i=0;i<n;i++){const a=i/n*Math.PI*2;const x=Math.cos(a)*w;let y=Math.sin(a)*h+.005;if(sole)y=-.028+Math.sin(a)*.012;p.push(x,y,z);uv.push(i/n,j/(profiles.length-1));}});
 for(let j=0;j<profiles.length-1;j++)for(let i=0;i<n;i++){const a=j*n+i,b=j*n+(i+1)%n;idx.push(a,b,a+n,b,b+n,a+n);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
