import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {GROUPS} from '../physics/groups';
/** Two temporary collision bodies own a bail. The assembled scooter and a
 * bounded capsule stand in for an expensive articulated ragdoll. */
export class CrashMotion {
 rider:RAPIER.RigidBody;scooter:RAPIER.RigidBody;stable=0;rest=0;settled=false;age=0;riderSupported=false;
 /** A board that kept rolling when the rider was thrown off; Y calls it back. */
 runaway=false;
 constructor(private world:RAPIER.World,position:THREE.Vector3,velocity:THREE.Vector3,yaw:number,pitch:number,runaway=false){
  this.runaway=runaway;
  const speed=Math.min(12,velocity.length()),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.max(-.7,Math.min(.7,pitch)),yaw,.55,'YXZ'));
  const center=position.clone().add(new THREE.Vector3(0,.68,0));
  this.rider=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(center.x,center.y,center.z).setRotation(q).setCcdEnabled(true).setLinearDamping(.8).setAngularDamping(3.5));
  world.createCollider(RAPIER.ColliderDesc.capsule(.54,.27).setMass(68).setFriction(.85).setRestitution(.03).setCollisionGroups(GROUPS.chassis),this.rider);
  this.scooter=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x+.35*Math.cos(yaw),position.y+.10,position.z-.35*Math.sin(yaw)).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw)).setCcdEnabled(true).setLinearDamping(.7).setAngularDamping(3.5));
  for(const [x,y,z,hx,hy,hz]of [[0,.09,-.13,.08,.07,.30],[0,.51,.20,.035,.48,.035],[0,1.0,.20,.31,.035,.035]])world.createCollider(RAPIER.ColliderDesc.cuboid(hx,hy,hz).setTranslation(x,y,z).setMass(1.3).setFriction(.9).setRestitution(.08).setCollisionGroups(GROUPS.chassis),this.scooter);
  const v=velocity.clone().clampLength(0,12).multiplyScalar(.6);v.y=Math.max(-8,Math.min(2,v.y));this.rider.setLinvel(v,true);this.scooter.setLinvel(v.clone().multiplyScalar(.8),true);
  this.rider.setAngvel({x:Math.cos(yaw)*(.7+speed*.14),y:0,z:-Math.sin(yaw)*(.7+speed*.14)+.6},true);
  this.scooter.setAngvel({x:.5+speed*.12,y:.3,z:1.2},true);
  if(runaway){
   // Thrown over the nose: the rider pitches forward and rolls; the board keeps
   // most of its speed and rolls away on its wheels.
   const forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)),side=new THREE.Vector3(forward.z,0,-forward.x);
   const fling=velocity.clone().setY(0).multiplyScalar(.7);fling.y=1.2;this.rider.setLinvel(fling,true);
   this.rider.setAngvel(side.multiplyScalar(-(2+speed*.25)),true);this.rider.setAngularDamping(1.2);
   const roll=velocity.clone().setY(Math.min(0,velocity.y));this.scooter.setLinvel(roll.multiplyScalar(.92),true);
   this.scooter.setAngvel({x:0,y:0,z:0},true);this.scooter.setLinearDamping(.12);for(let i=0;i<this.scooter.numColliders();i++)this.scooter.collider(i).setFriction(.03);this.scooter.setAngularDamping(8);
   this.scooter.setTranslation(position.clone().add(forward.multiplyScalar(.6)).add(new THREE.Vector3(0,.06,0)),true);
  }
 }
 /** Brings a runaway board back to the rider's side. */
 callBack(){
  const r=this.rider.translation();
  this.scooter.setTranslation({x:r.x+.5,y:r.y+.2,z:r.z},true);this.scooter.setLinvel({x:0,y:0,z:0},true);this.scooter.setAngvel({x:0,y:0,z:0},true);
  this.scooter.setRotation(new THREE.Quaternion(),true);this.scooter.setLinearDamping(5);this.runaway=false;
 }
 update(dt:number){
  this.age+=dt;let quiet=true,contact=true;
  for(const body of [this.rider,this.scooter]){const w=new THREE.Vector3().copy(body.angvel());if(w.length()>2.5)body.setAngvel(w.setLength(2.5),true);

   let touching=false;for(let i=0;i<body.numColliders();i++)this.world.contactPairsWith(body.collider(i),other=>{if(other.parent()!==this.rider&&other.parent()!==this.scooter)touching=true;});contact&&=touching;if(body===this.rider)this.riderSupported=touching;
   // Gravity finishes the fall; damp rolling only after actual world contact.
   const up=new THREE.Vector3(0,1,0).applyQuaternion(new THREE.Quaternion().copy(body.rotation()));
   if(touching&&this.age>.45&&(body===this.scooter||Math.abs(up.y)<.65||this.age>1.2)){
    body.setAngularDamping(18);body.setLinearDamping(5);
   }
   const slow=new THREE.Vector3().copy(body.linvel()).length()<.35&&w.length()<.4;
   if(touching&&this.age>1.2&&new THREE.Vector3().copy(body.linvel()).length()<1&&w.length()<1)body.sleep();
   quiet&&=body.isSleeping()||slow;
  }
  this.stable=quiet&&contact?this.stable+dt:0;this.settled=this.stable>.15;
  if(this.settled){this.rest+=dt;this.rider.sleep();this.scooter.sleep();}else this.rest=0;
 }
 get canRecover(){
  // A runaway board is still rolling; the rider can get up once they have stopped.
  if(this.runaway)return this.age>.9&&this.riderSupported&&new THREE.Vector3().copy(this.rider.linvel()).length()<1.2;
  return this.age>.55&&(this.settled||this.stable>.05||(this.age>.9&&this.riderSupported));
 }
 dispose(){this.world.removeRigidBody(this.rider);this.world.removeRigidBody(this.scooter);}
}
