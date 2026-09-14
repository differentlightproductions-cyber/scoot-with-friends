import * as THREE from 'three';
/** Stable transverse axis prevents near-vertical limbs from twisting around an arbitrary shortest-arc axis. */
export function legFrame(a:THREE.Vector3,b:THREE.Vector3){
 const y=b.clone().sub(a).normalize(),x=new THREE.Vector3(1,0,0);x.addScaledVector(y,-x.dot(y));
 if(x.lengthSq()<.01){x.set(0,0,1).addScaledVector(y,-y.z);}x.normalize();
 const z=x.clone().cross(y).normalize();return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}
