import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import type {BodyBuild} from './body-fit';
import type {CharacterQuality,HumanRig} from './human';

const URL='/models/humans/christian.glb';
const TARGET_HEIGHT=1.65;
let source:THREE.Group|undefined,request:Promise<void>|undefined;

export function loadImportedHuman(){
 return request??=new GLTFLoader().loadAsync(URL).then(gltf=>{source=gltf.scene;source.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.skeleton.pose();});source.updateMatrixWorld(true);});
}

/** `target` may return null to let the bone keep its rest offset from its parent this frame. */
type Binding={bone:THREE.Bone;bindWorld:THREE.Matrix4;sourceFrame:THREE.Matrix4;target:()=>THREE.Matrix4|null};
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
const UP=new THREE.Vector3(0,1,0),IDENTITY=new THREE.Matrix4();
/** Recovers the two endpoints a poseRod-style proxy was stretched between
 * (position = midpoint, scale.y = length, +Y = direction). */
function endpoints(m:THREE.Object3D):[THREE.Vector3,THREE.Vector3]{
 const half=UP.clone().applyQuaternion(m.quaternion).multiplyScalar(m.scale.y/2);
 return [m.position.clone().sub(half),m.position.clone().add(half)];
}
/** Allowed invisible over-length (1.5%, a few millimetres) that closes a tiny
 * reach gap instead of letting a hand or foot visibly fall short. */
const LIMB_SLACK=.015;
type LimbSolve={root:THREE.Vector3;mid:THREE.Vector3;end:THREE.Vector3;upperDir:THREE.Vector3;lowerDir:THREE.Vector3;axis:THREE.Vector3;short:number};
/**
 * Analytic two-bone IK (law of cosines) with the imported skeleton's own,
 * fixed segment lengths. The old proxy rig was an infinitely stretchy box;
 * copying its current length onto the imported mesh's bones carried that
 * stretch over onto real geometry ("worm" arms and legs). Here the elbow or
 * knee bends instead, toward `pole`, and `axis` is the hinge the joint bends
 * about, so the segment roll can follow the hinge rather than an arbitrary
 * world reference. `short` reports how far the end fell short of the target.
 */
export function solveLimb(root:THREE.Vector3,target:THREE.Vector3,pole:THREE.Vector3,l1:number,l2:number):LimbSolve{
 const to=target.clone().sub(root),length=to.length();
 const dir=length>1e-6?to.divideScalar(length):new THREE.Vector3(0,-1,0);
 const stretch=THREE.MathUtils.clamp(length/(l1+l2),1,1+LIMB_SLACK),a=l1*stretch,b=l2*stretch;
 const dist=THREE.MathUtils.clamp(length,Math.abs(a-b)+1e-4,a+b-1e-5);
 const toPole=pole.clone().sub(root);toPole.addScaledVector(dir,-toPole.dot(dir));
 const axis=new THREE.Vector3().crossVectors(dir,toPole);
 if(axis.lengthSq()<1e-10)axis.crossVectors(dir,Math.abs(dir.x)<.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,0,1));
 axis.normalize();
 const cos=THREE.MathUtils.clamp((a*a+dist*dist-b*b)/(2*a*dist),-1,1);
 // Rotating about dir x pole moves the middle joint toward the pole side.
 const upperDir=dir.clone().applyAxisAngle(axis,Math.acos(cos));
 const mid=root.clone().addScaledVector(upperDir,a),end=root.clone().addScaledVector(dir,dist);
 return {root:root.clone(),mid,end,upperDir,lowerDir:end.clone().sub(mid).normalize(),axis,short:Math.max(0,length-dist)};
}

/** Adapts the supplied textured Mixamo character to the existing pose drivers. */
export class ImportedHuman {
 group=new THREE.Group();
 mesh:THREE.Object3D;
 /** Legacy shoe drivers locate the shoe centre, 4.5 cm above its sole. */
 ankleOffsets=[0,0];
 /** Shoulder-joint-to-wrist and hip-joint-to-ankle reach of the imported
  * skeleton in rider metres, per side (0 = rider -x). Pose drivers use these
  * to keep grips and deck contacts inside what the real limbs can reach. */
 armReach=[0,0];legReach=[0,0];
 /** Last frame's solved limbs (rider space), for pose drivers and tests. */
 solved:{arms:LimbSolve[];legs:LimbSolve[]}={arms:[],legs:[]};
 /** Hand orientation actually used this frame (the grip, rolled about a held bar). */
 private gripRoll=[new THREE.Quaternion(),new THREE.Quaternion()];
 private bones:THREE.Bone[]=[];
 private bindings:Binding[]=[];
 private bindingByBone=new Map<THREE.Bone,Binding>();
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
  const anchorFrame=(driver:THREE.Object3D)=>()=>{driver.updateMatrix();const p=V(),q=Q();driver.matrix.decompose(p,q,S());return new THREE.Matrix4().compose(p,q,new THREE.Vector3().setScalar(this.normalization));};
  // Torso/head/shoe drivers use body axes, not the source bone's local axes.
  // Preserve the bone's bind rotation rather than unwinding it into the skin.
  const sourceAnchor=(bone:THREE.Bone)=>new THREE.Matrix4().makeTranslation(...worldPos(bone).toArray());
  const bind=(name:string,target:()=>THREE.Matrix4)=>{const bone=byName(name);if(bone)this.bindings.push({bone,bindWorld:bone.matrixWorld.clone(),sourceFrame:sourceAnchor(bone),target});};
  // Everything below keeps the imported skeleton's own bone lengths: every
  // bone gets a uniform `normalization` scale and only rotates. Driver
  // proxies supply targets (grips, deck contacts, look direction), never
  // lengths. Targets are evaluated parent-first (see update), so a child can
  // start exactly where its parent's bone actually ends.
  const N=()=>new THREE.Vector3().setScalar(this.normalization),ONE=new THREE.Vector3(1,1,1);
  /** Where `bone` sits this frame if it keeps its rest offset from its parent. */
  const joint=(bone:THREE.Bone)=>new THREE.Vector3().setFromMatrixPosition(this.desired.get(bone.parent as THREE.Bone)!.clone().multiply(this.restLocal.get(bone)!));
  bind('hips',anchorFrame(model.hips));
  // The spine hangs off the pelvis with its own vertebra spacing and bends
  // progressively from the pelvis to the chest orientation. Interpolating
  // positions between the legacy hips and torso boxes (whose offset is partly
  // in world space) squashed the belly by up to 17% in a Superman.
  for(const [name,t] of [['spine',.34],['spine1',.81],['spine2',1]] as const){const bone=byName(name);if(bone)this.bindings.push({bone,bindWorld:bone.matrixWorld.clone(),sourceFrame:sourceAnchor(bone),target:()=>new THREE.Matrix4().compose(joint(bone),model.hips.quaternion.clone().slerp(model.torso.quaternion,t),N())});}
  // Neck follows the chest rigidly (no binding); the head bone sits exactly
  // on top of it, turned by the head driver (look/nod). Pinning both ends to
  // the legacy rod stretched the neck skin.
  const neckBone=byName('neck'),headBone=byName('head');
  if(neckBone&&headBone)this.bindings.push({bone:headBone,bindWorld:headBone.matrixWorld.clone(),sourceFrame:sourceAnchor(headBone),target:()=>{model.head.updateMatrix();return new THREE.Matrix4().compose(joint(headBone),model.head.quaternion,N());}});
  else bind('head',anchorFrame(model.head));
  // Limb segment frames: +Y along the bone, +Z toward the side the next
  // segment folds to (elbow crease forward in the T-pose, knee folds back).
  // Driving the roll from the IK hinge keeps elbows and knees true hinges and
  // is identical for both sides, so neither sleeve twists.
  const limbSource=(from:THREE.Bone,to:THREE.Bone,fold:THREE.Vector3)=>new THREE.Matrix4().compose(worldPos(from),armFrame(worldPos(to).sub(worldPos(from)),fold),ONE);
  const segment=(at:THREE.Vector3,along:THREE.Vector3,axis:THREE.Vector3)=>new THREE.Matrix4().compose(at,armFrame(along,along.clone().cross(axis)),N());
  const forward=(o:THREE.Object3D)=>new THREE.Vector3(0,0,1).applyQuaternion(o.quaternion);
  const curlAxes:THREE.Vector3[]=[];
  for(const prefix of ['left','right']){
   const clavicle=byName(prefix+'shoulder'),upper=byName(prefix+'arm'),fore=byName(prefix+'forearm'),hand=byName(prefix+'hand');
   if(!clavicle||!upper||!fore||!hand)continue;
   const i=side(upper),sign=i?1:-1,l1=worldPos(upper).distanceTo(worldPos(fore))*this.normalization,l2=worldPos(fore).distanceTo(worldPos(hand))*this.normalization;
   this.armReach[i]=l1+l2;
   const armRest=this.restLocal.get(upper)!;
   // The clavicle rides rigidly on the chest. Only when a grip is beyond the
   // arm's own reach does it swing (protract) toward it, at most ~26 degrees,
   // the way a real shoulder reaches forward.
   this.bindings.push({bone:clavicle,bindWorld:IDENTITY,sourceFrame:IDENTITY,target:()=>{
    const base=this.desired.get(clavicle.parent as THREE.Bone)!.clone().multiply(this.restLocal.get(clavicle)!);
    const pivot=new THREE.Vector3().setFromMatrixPosition(base),arm=new THREE.Vector3().setFromMatrixPosition(base.clone().multiply(armRest)).sub(pivot);
    const wrist=model.hands[i].position.clone().sub(pivot),goal=this.armReach[i]*.985;
    const axis=arm.clone().cross(wrist);if(arm.distanceTo(wrist)<=goal||axis.lengthSq()<1e-10)return base;axis.normalize();
    const distance=(t:number)=>arm.clone().applyAxisAngle(axis,t).distanceTo(wrist);
    let lo=0,hi=Math.min(.45,arm.angleTo(wrist));
    if(distance(hi)<goal)for(let k=0;k<14;k++){const t=(lo+hi)/2;if(distance(t)>goal)lo=t;else hi=t;}
    return new THREE.Matrix4().makeTranslation(pivot.x,pivot.y,pivot.z).multiply(new THREE.Matrix4().makeRotationAxis(axis,hi)).multiply(new THREE.Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z)).multiply(base);
   }});
   const fold=new THREE.Vector3(0,0,1);
   this.bindings.push({bone:upper,bindWorld:upper.matrixWorld.clone(),sourceFrame:limbSource(upper,fore,fold),target:()=>{
    const root=joint(upper),[,elbow]=endpoints(model.upperArms[i]);
    // The legacy elbow says which way the elbow points; nudge it outward so
    // a nearly straight arm still has a well-defined, anatomical bend plane.
    const pole=elbow.add(new THREE.Vector3(sign*.06,-.02,-.02).applyQuaternion(model.torso.quaternion));
    const hold=model.hands[i],lift=hold.userData.barLift??0;
    let r=solveLimb(root,hold.position,pole,l1,l2);this.gripRoll[i]=hold.quaternion.clone();
    if(lift>0){
     // A hand on a round bar can roll around it. Keep the grip centre fixed
     // and roll the hand until the fingers continue the forearm: the wrist
     // stays straight, and a scooter spinning about its bars (Bri, whips)
     // turns inside the hand instead of wringing the wrist 90-160 degrees.
     const offset=new THREE.Vector3(0,lift,-(hold.userData.palmLength??.1)),centre=hold.position.clone().sub(offset.clone().applyQuaternion(hold.quaternion));
     const bar=new THREE.Vector3(1,0,0).applyQuaternion(hold.quaternion);
     for(let pass=0;pass<2;pass++){
      const fingers=r.lowerDir.clone().addScaledVector(bar,-r.lowerDir.dot(bar));
      if(fingers.lengthSq()<.04)break; // forearm almost along the bar: keep the socket's roll
      fingers.normalize();const back=fingers.clone().cross(bar).normalize();
      this.gripRoll[i].setFromRotationMatrix(new THREE.Matrix4().makeBasis(bar,back,fingers));
      r=solveLimb(root,centre.clone().add(offset.clone().applyQuaternion(this.gripRoll[i])),pole,l1,l2);
     }
    }
    this.solved.arms[i]=r;
    return segment(root,r.upperDir,r.axis);
   }});
   const index=byName(prefix+'handindex1'),middle=byName(prefix+'handmiddle1'),pinky=byName(prefix+'handpinky1');
   const wrist=worldPos(hand),tip=middle?worldPos(middle):index?worldPos(index):wrist.clone().add(new THREE.Vector3(0,0,.08)),along=tip.clone().sub(wrist),palm=along.length()*this.normalization;
   const across=index&&pinky?worldPos(index).sub(worldPos(pinky)).normalize():new THREE.Vector3(sign,0,0),z=along.normalize(),y=z.clone().cross(across).normalize();
   if(y.y<0)y.negate();across.copy(y).cross(z).normalize();curlAxes[i]=across.clone();
   const palmBasis=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,y,z)),palmSource=new THREE.Matrix4().compose(wrist,palmBasis,ONE);
   const foreSource=limbSource(fore,hand,fold),foreBind=new THREE.Quaternion().setFromRotationMatrix(foreSource);
   // Mixamo forearms have no twist bone, so a posed hand's pronation would
   // all land at the wrist (a wrung "candy wrapper" when bars yaw in a Bri).
   // Share half of it along the forearm, as the radius does around the ulna.
   this.bindings.push({bone:fore,bindWorld:fore.matrixWorld.clone(),sourceFrame:foreSource,target:()=>{
    const r=this.solved.arms[i],roll=armFrame(r.lowerDir,r.lowerDir.clone().cross(r.axis));
    if(!model.hands[i].userData.freeWrist){
     const extra=this.gripRoll[i].clone().multiply(palmBasis.clone().invert()).multiply(foreBind).multiply(roll.clone().invert());
     let twist=2*Math.atan2(extra.x*r.lowerDir.x+extra.y*r.lowerDir.y+extra.z*r.lowerDir.z,extra.w);
     if(twist>Math.PI)twist-=Math.PI*2;if(twist<-Math.PI)twist+=Math.PI*2;
     roll.premultiply(new THREE.Quaternion().setFromAxisAngle(r.lowerDir,THREE.MathUtils.clamp(twist*.5,-1.1,1.1)));
    }
    return new THREE.Matrix4().compose(r.mid,roll,N());
   }});
   // The wrist is the forearm's actual end: the hand can never separate from
   // the arm, and with the grip inside reach that end is the grip target.
   // A hand holding nothing (`freeWrist`) keeps its rest relation to the
   // forearm, so its palm follows the elbow's hinge instead of the legacy
   // box-hand orientation, which bent free wrists 75-150 degrees.
   this.bindings.push({bone:hand,bindWorld:hand.matrixWorld.clone(),sourceFrame:palmSource,target:()=>{if(model.hands[i].userData.freeWrist)return null;return new THREE.Matrix4().compose(this.solved.arms[i].end,this.gripRoll[i],N());}});
   model.hands[i].userData.palmLength=palm;
  }
  for(const prefix of ['left','right']){
   const upper=byName(prefix+'upleg'),shin=byName(prefix+'leg'),foot=byName(prefix+'foot');
   if(!upper||!shin||!foot)continue;
   const i=side(upper),sign=i?1:-1,l1=worldPos(upper).distanceTo(worldPos(shin))*this.normalization,l2=worldPos(shin).distanceTo(worldPos(foot))*this.normalization;
   this.legReach[i]=l1+l2;
   const fold=new THREE.Vector3(0,0,-1);
   this.bindings.push({bone:upper,bindWorld:upper.matrixWorld.clone(),sourceFrame:limbSource(upper,shin,fold),target:()=>{
    const root=joint(upper),[,knee]=endpoints(model.thighs[i]);
    // Knees always point forward (and a little out) over the toes.
    const pole=knee.add(forward(model.hips).multiplyScalar(.25)).add(new THREE.Vector3(sign*.03,0,0));
    const r=solveLimb(root,model.shoes[i].position,pole,l1,l2);this.solved.legs[i]=r;
    return segment(root,r.upperDir,r.axis);
   }});
   this.bindings.push({bone:shin,bindWorld:shin.matrixWorld.clone(),sourceFrame:limbSource(shin,foot,fold),target:()=>{const r=this.solved.legs[i];return segment(r.mid,r.lowerDir,r.axis);}});
   this.bindings.push({bone:foot,bindWorld:foot.matrixWorld.clone(),sourceFrame:sourceAnchor(foot),target:()=>{model.shoes[i].updateMatrix();return new THREE.Matrix4().compose(this.solved.legs[i].end,model.shoes[i].quaternion,N());}});
  }
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
  if(this.bindingByBone.size!==this.bindings.length){this.bindingByBone.clear();for(const b of this.bindings)this.bindingByBone.set(b.bone,b);}
  // Bones are visited parent-first, and each binding is evaluated only when
  // its bone is reached, so a target may read its parent's final placement.
  for(const bone of this.bones){
   const binding=this.bindingByBone.get(bone);
   let world=binding?.target()?.multiply(binding.sourceFrame.clone().invert()).multiply(binding.bindWorld);
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

