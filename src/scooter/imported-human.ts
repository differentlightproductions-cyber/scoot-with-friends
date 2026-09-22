import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import type {BodyBuild} from './body-fit';
import type {CharacterQuality,HumanRig} from './human';
import {legFrame} from './limb-frame';

const URL='/models/humans/christian.glb';
const TARGET_HEIGHT=1.65;
let source:THREE.Group|undefined,request:Promise<void>|undefined;

export function loadImportedHuman(){
 return request??=new GLTFLoader().loadAsync(URL).then(gltf=>{source=gltf.scene;source.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.skeleton.pose();});source.updateMatrixWorld(true);});
}

type Binding={bone:THREE.Bone;bindWorld:THREE.Matrix4;sourceFrame:THREE.Matrix4;target:()=>THREE.Matrix4};
type Finger={bone:THREE.Bone;rest:THREE.Quaternion;axis:THREE.Vector3;side:0|1;digit:string;joint:number};
const V=()=>new THREE.Vector3(),Q=()=>new THREE.Quaternion(),S=()=>new THREE.Vector3();
// A stable front reference prevents the minimal +Y rotation from twisting a
// sleeve 180 degrees when the forearm points downward.
function armFrame(direction:THREE.Vector3,front=new THREE.Vector3(0,0,1)){
 const y=direction.clone().normalize(),z=front.clone().addScaledVector(y,-front.dot(y));
 if(z.lengthSq()<.001)z.set(0,1,0).addScaledVector(y,-y.y);
 z.normalize();const x=y.clone().cross(z).normalize();z.crossVectors(x,y);
 return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}

/** Adapts the supplied textured Mixamo character to the existing pose drivers. */
export class ImportedHuman {
 group=new THREE.Group();
 mesh:THREE.Object3D;
 /** Legacy shoe drivers locate the shoe centre, 4.5 cm above its sole. */
 ankleOffsets=[0,0];
 private bones:THREE.Bone[]=[];
 private bindings:Binding[]=[];
 private fingers:Finger[]=[];
 private restLocal=new Map<THREE.Bone,THREE.Matrix4>();
 private desired=new Map<THREE.Bone,THREE.Matrix4>();
 private normalization=1;
 private firstPerson={value:0};
 private viewMaterials:THREE.Material[]=[];
 setFirstPerson(active:boolean){this.firstPerson.value=active?1:0;}

 constructor(private model:HumanRig,public id:string,public quality:CharacterQuality,public bodyBuild:BodyBuild='regular'){
  if(!source)throw Error('Imported human must be loaded before construction');
  this.group.name='Imported Christian rider';this.group.userData.quality=quality;
  this.mesh=clone(source);this.group.add(this.mesh);
  this.mesh.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.frustumCulled=false;}if(o instanceof THREE.Bone){this.bones.push(o);o.updateMatrix();this.restLocal.set(o,o.matrix.clone());o.matrixAutoUpdate=false;}});
  this.mesh.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(this.mesh),height=bounds.max.y-bounds.min.y;
  this.normalization=TARGET_HEIGHT/Math.max(.001,height);
  const byName=(part:string)=>this.bones.find(b=>b.name.toLowerCase().replace(/[^a-z0-9]/g,'').endsWith(part.toLowerCase()));
  const worldPos=(b:THREE.Object3D)=>b.getWorldPosition(V());
  const hips=byName('hips');if(!hips)throw Error('Christian Mixamo hips bone is missing');
  const hipX=worldPos(hips).x;
  for(const name of ['leftfoot','rightfoot']){const bone=byName(name);if(!bone)continue;const point=worldPos(bone),i=point.x<hipX?0:1;let sole=Infinity;
   this.mesh.traverse(o=>{if(!(o instanceof THREE.SkinnedMesh))return;const p=o.geometry.getAttribute('position'),j=o.geometry.getAttribute('skinIndex'),w=o.geometry.getAttribute('skinWeight');
    const footBones=o.skeleton.bones.map(b=>/foot|toe/i.test(b.name)&&(worldPos(b).x<hipX?0:1)===i);
    const vertex=new THREE.Vector3();
    for(let n=0;n<p.count;n++){let weight=0;for(let k=0;k<4;k++)if(footBones[j.getComponent(n,k)])weight+=w.getComponent(n,k);if(weight>.5)sole=Math.min(sole,vertex.fromBufferAttribute(p,n).applyMatrix4(o.matrixWorld).y);}
   });
   this.ankleOffsets[i]=Number.isFinite(sole)?Math.max(0,(point.y-sole)*this.normalization-.045):0;
  }
  if(bodyBuild!=='regular'){
   // Shape changes are confined to the skin around the original skeleton. Bone
   // lengths, hand contacts, shoes and all gameplay dimensions stay unchanged.
   const amount=bodyBuild==='skinny'?-.14:.2;
   this.mesh.traverse(o=>{if(!(o instanceof THREE.SkinnedMesh))return;
    o.geometry=o.geometry.clone();o.userData.ownsHumanGeometry=true;
    const positions=o.geometry.getAttribute('position'),indices=o.geometry.getAttribute('skinIndex'),weights=o.geometry.getAttribute('skinWeight'),inverse=o.matrixWorld.clone().invert();
    const anchors=o.skeleton.bones.map(b=>{const a=worldPos(b),child=b.children.find(c=>c instanceof THREE.Bone),end=child?worldPos(child):a.clone().add(new THREE.Vector3(0,.05,0));return {name:b.name.toLowerCase(),a,end};});
    for(let i=0;i<positions.count;i++){
     const original=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld),point=original.clone();
     for(let k=0;k<4;k++){
      const weight=weights.getComponent(i,k);if(!weight)continue;const anchor=anchors[indices.getComponent(i,k)];if(!anchor||/head|neck|hand|foot|toe/.test(anchor.name))continue;
      if(/hips|spine|shoulder/.test(anchor.name)){point.x+=(original.x-hipX)*amount*weight;point.z+=(original.z-anchor.a.z)*amount*weight;}
      else {const axis=anchor.end.clone().sub(anchor.a),t=THREE.MathUtils.clamp(original.clone().sub(anchor.a).dot(axis)/Math.max(.00001,axis.lengthSq()),0,1),center=anchor.a.clone().addScaledVector(axis,t);point.addScaledVector(original.clone().sub(center),amount*weight*(.4+.6*Math.sin(Math.PI*t)));}
     }
     point.applyMatrix4(inverse);positions.setXYZ(i,point.x,point.y,point.z);
    }
    positions.needsUpdate=true;o.geometry.computeVertexNormals();o.geometry.computeBoundingBox();
   });
  }
  const side=(bone:THREE.Bone):0|1=>worldPos(bone).x<hipX?0:1;
  const driverFrame=(driver:THREE.Object3D,arm=false)=>{driver.updateMatrix();const p=V(),q=Q(),s=S();driver.matrix.decompose(p,q,s);if(arm)q.copy(armFrame(new THREE.Vector3(0,1,0).applyQuaternion(q),new THREE.Vector3(0,0,1).applyQuaternion(model.torso.quaternion)));return new THREE.Matrix4().compose(p,q,new THREE.Vector3(this.normalization,s.y,this.normalization));};
  const anchorFrame=(driver:THREE.Object3D)=>()=>{driver.updateMatrix();const p=V(),q=Q();driver.matrix.decompose(p,q,S());return new THREE.Matrix4().compose(p,q,new THREE.Vector3().setScalar(this.normalization));};
  const at=(a:THREE.Object3D,b:THREE.Object3D,t:number)=>()=>{a.updateMatrix();b.updateMatrix();return new THREE.Matrix4().compose(a.position.clone().lerp(b.position,t),a.quaternion.clone().slerp(b.quaternion,t),new THREE.Vector3().setScalar(this.normalization));};
  // Torso/head/shoe drivers use body axes, not the source bone's local axes.
  // Preserve the bone's bind rotation rather than unwinding it into the skin.
  const sourceAnchor=(bone:THREE.Bone)=>new THREE.Matrix4().makeTranslation(...worldPos(bone).toArray());
  const sourceLimb=(bone:THREE.Bone,child?:THREE.Bone)=>{
   child??=bone.children.find(c=>c instanceof THREE.Bone) as THREE.Bone|undefined;
   if(!child)return sourceAnchor(bone);
   const a=worldPos(bone),b=worldPos(child),rotation=/upleg|leftleg|rightleg/i.test(bone.name)?legFrame(a,b):armFrame(b.clone().sub(a));
   return new THREE.Matrix4().compose(a.clone().lerp(b,.5),rotation,new THREE.Vector3(1,a.distanceTo(b),1));
  };
  const bind=(name:string,target:()=>THREE.Matrix4,limb=false,childName?:string)=>{const bone=byName(name);if(bone)this.bindings.push({bone,bindWorld:bone.matrixWorld.clone(),sourceFrame:limb?sourceLimb(bone,childName?byName(childName):undefined):sourceAnchor(bone),target});};
  bind('hips',anchorFrame(model.hips));
  bind('spine',at(model.hips,model.torso,.34));bind('spine1',at(model.hips,model.torso,.81));
  bind('spine2',()=>new THREE.Matrix4().compose(new THREE.Vector3(0,.075,0).applyQuaternion(model.torso.quaternion).add(model.torso.position),model.torso.quaternion,new THREE.Vector3().setScalar(this.normalization)));
  // The legacy neck rod ends below the skull; it is not the imported bone's
  // full neck-to-head span. Keep neck skin at its anatomical scale.
  bind('neck',()=>new THREE.Matrix4().compose(new THREE.Vector3(0,-model.neck.scale.y/2,0).applyQuaternion(model.neck.quaternion).add(model.neck.position),model.torso.quaternion,new THREE.Vector3().setScalar(this.normalization)));bind('head',anchorFrame(model.head));
  for(const name of ['leftshoulder','rightshoulder']){const b=byName(name);if(b){const i=side(b),sign=i?1:-1;bind(name,()=>{
   const arm=model.upperArms[i],end=new THREE.Vector3(0,-arm.scale.y/2,0).applyQuaternion(arm.quaternion).add(arm.position),start=new THREE.Vector3(sign*.03,.15,0).applyQuaternion(model.torso.quaternion).add(model.torso.position);
   return new THREE.Matrix4().compose(start.clone().lerp(end,.5),armFrame(end.clone().sub(start),new THREE.Vector3(0,0,1).applyQuaternion(model.torso.quaternion)),new THREE.Vector3(this.normalization,start.distanceTo(end),this.normalization));
  },true,name.replace('shoulder','arm'));}}
  for(const name of ['leftarm','rightarm']){const b=byName(name);if(b){const i=side(b);bind(name,()=>driverFrame(model.upperArms[i],true),true,name.replace('arm','forearm'));}}
  for(const name of ['leftforearm','rightforearm']){const b=byName(name);if(b){const i=side(b);bind(name,()=>driverFrame(model.forearms[i],true),true,name.replace('forearm','hand'));}}
  const curlAxes:THREE.Vector3[]=[];
  for(const name of ['lefthand','righthand']){const b=byName(name);if(b){
   const i=side(b),index=byName(name.replace('hand','handindex1')),middle=byName(name.replace('hand','handmiddle1')),pinky=byName(name.replace('hand','handpinky1'));
   const wrist=worldPos(b),tip=middle?worldPos(middle):index?worldPos(index):wrist.clone().add(new THREE.Vector3(0,0,.08)),along=tip.clone().sub(wrist),palm=THREE.MathUtils.clamp(along.length()*this.normalization,.055,.11);
   const across=index&&pinky?worldPos(index).sub(worldPos(pinky)).normalize():new THREE.Vector3(i?1:-1,0,0),z=along.normalize(),y=z.clone().cross(across).normalize();
   if(y.y<0)y.negate();across.copy(y).cross(z).normalize();curlAxes[i]=across.clone();
   const sourceFrame=new THREE.Matrix4().compose(wrist.clone().addScaledVector(z,tip.distanceTo(wrist)/2),new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,y,z)),new THREE.Vector3(1,1,tip.distanceTo(wrist)));
   const target=()=>{model.hands[i].updateMatrix();const q=model.hands[i].quaternion,p=model.hands[i].position.clone().add(new THREE.Vector3(0,0,palm/2).applyQuaternion(q));return new THREE.Matrix4().compose(p,q,new THREE.Vector3(this.normalization,this.normalization,palm));};
   this.bindings.push({bone:b,bindWorld:b.matrixWorld.clone(),sourceFrame,target});model.hands[i].userData.palmLength=palm;
  }}
  for(const name of ['leftupleg','rightupleg']){const b=byName(name);if(b){const i=side(b);bind(name,()=>driverFrame(model.thighs[i]),true,name.replace('upleg','leg'));}}
  for(const name of ['leftleg','rightleg']){const b=byName(name);if(b){const i=side(b);bind(name,()=>driverFrame(model.shins[i]),true,name.replace('leg','foot'));}}
  for(const name of ['leftfoot','rightfoot']){const b=byName(name);if(b){const i=side(b);bind(name,anchorFrame(model.shoes[i]));}}
  for(const bone of this.bones){const n=bone.name.toLowerCase(),m=n.match(/(left|right)hand(thumb|index|middle|ring|pinky)([1-3])$/);if(m){const i=side(bone),axis=(curlAxes[i]??new THREE.Vector3(1,0,0)).clone().applyQuaternion(bone.getWorldQuaternion(Q()).invert());this.fingers.push({bone,rest:bone.quaternion.clone(),axis,side:i,digit:m[2],joint:Number(m[3])});}}
  // Hide only this rider's central body from the eye camera. Keep the actual
  // skeleton intact: arms, knees and full-body shadows still use the same pose.
  this.mesh.traverse(o=>{if(!(o instanceof THREE.SkinnedMesh))return;
   if(!o.userData.ownsHumanGeometry)o.geometry=o.geometry.clone();
   o.userData.ownsHumanGeometry=true;
   const indices=o.geometry.getAttribute('skinIndex'),weights=o.geometry.getAttribute('skinWeight'),mask=new Float32Array(indices.count);
   const core=o.skeleton.bones.map(b=>/hips|spine|neck|head|shoulder|(?:left|right)arm$/i.test(b.name));
   for(let i=0;i<mask.length;i++)for(let k=0;k<4;k++)if(core[indices.getComponent(i,k)])mask[i]+=weights.getComponent(i,k);
   o.geometry.setAttribute('firstPersonCore',new THREE.BufferAttribute(mask,1));
   const prepare=(sourceMaterial:THREE.Material)=>{const material=sourceMaterial.clone();this.viewMaterials.push(material);
    material.onBeforeCompile=shader=>{shader.uniforms.firstPersonBody=this.firstPerson;
     shader.vertexShader='attribute float firstPersonCore;\nvarying float vFirstPersonCore;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFirstPersonCore = firstPersonCore;');
     shader.fragmentShader='uniform float firstPersonBody;\nvarying float vFirstPersonCore;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif (firstPersonBody > 0.5 && vFirstPersonCore > 0.15) discard;');
    };material.customProgramCacheKey=()=> 'christian-first-person-core-2';return material;
   };
   o.material=Array.isArray(o.material)?o.material.map(prepare):prepare(o.material);
  });
  model.rider.add(this.group);this.update(0);
 }

 update(_time:number){
  this.model.rider.updateMatrixWorld(true);
  const explicit=new Map<THREE.Bone,THREE.Matrix4>();
  for(const {bone,bindWorld,sourceFrame,target} of this.bindings)explicit.set(bone,target().multiply(sourceFrame.clone().invert()).multiply(bindWorld));
  for(const bone of this.bones){
   let world=explicit.get(bone);
   const parent=bone.parent instanceof THREE.Bone?bone.parent:undefined;
   if(!world)world=parent?this.desired.get(parent)!.clone().multiply(this.restLocal.get(bone)!):bone.matrixWorld.clone();
   this.desired.set(bone,world);
   // Preserve the full affine matrix. Decomposing a scaled parent plus a bent
   // child into TRS loses shear and drags wrists away from their exact grips.
   bone.matrix.copy(parent?this.desired.get(parent)!.clone().invert().multiply(world):world);bone.matrix.decompose(bone.position,bone.quaternion,bone.scale);bone.matrixWorldNeedsUpdate=true;
  }
  for(const f of this.fingers){const open=THREE.MathUtils.clamp(this.model.hands[f.side].userData.openHand??0,0,1),closed=1-open;
   const angle=f.digit==='thumb'?(f.joint===1?.3:.45):([.65,.8,.55][f.joint-1]??.6);f.bone.matrix.multiply(new THREE.Matrix4().makeRotationAxis(f.axis,angle*closed));f.bone.matrixWorldNeedsUpdate=true;
  }
  this.setFirstPerson(!!this.model.hideHead);
  this.mesh.updateMatrixWorld(true);
 }

 dispose(){
  this.group.removeFromParent();
  this.viewMaterials.forEach(material=>material.dispose());
  this.mesh.traverse(o=>{if(o instanceof THREE.SkinnedMesh){o.skeleton.dispose();if(o.userData.ownsHumanGeometry)o.geometry.dispose();}});
 }
}

