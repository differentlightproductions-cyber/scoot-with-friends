import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {GROUPS} from '../physics/groups';
/** Two temporary collision bodies own a bail. The assembled scooter and a
 * bounded capsule stand in for an expensive articulated ragdoll. */
export class CrashMotion {
 rider:RAPIER.RigidBody;scooter:RAPIER.RigidBody;stable=0;rest=0;settled=false;age=0;
 constructor(private world:RAPIER.World,position:THREE.Vector3,velocity:THREE.Vector3,yaw:number,pitch:number){
  const speed=Math.min(12,velocity.length()),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.max(-.7,Math.min(.7,pitch)),yaw,.3,'YXZ'));
  const center=position.clone().add(new THREE.Vector3(0,.68,0));
  this.rider=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(center.x,center.y,center.z).setRotation(q).setCcdEnabled(true).setLinearDamping(.8).setAngularDamping(2.4));
  world.createCollider(RAPIER.ColliderDesc.capsule(.54,.27).setMass(68).setFriction(.85).setRestitution(.03).setCollisionGroups(GROUPS.chassis),this.rider);
  this.scooter=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x+.35*Math.cos(yaw),position.y+.10,position.z-.35*Math.sin(yaw)).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw)).setCcdEnabled(true).setLinearDamping(.7).setAngularDamping(2));
  for(const [x,y,z,hx,hy,hz]of [[0,.09,-.13,.08,.07,.30],[0,.51,.20,.035,.48,.035],[0,1.0,.20,.31,.035,.035]])world.createCollider(RAPIER.ColliderDesc.cuboid(hx,hy,hz).setTranslation(x,y,z).setMass(1.3).setFriction(.9).setRestitution(.08).setCollisionGroups(GROUPS.chassis),this.scooter);
  const v=velocity.clone().clampLength(0,12).multiplyScalar(.6);v.y=Math.max(-8,Math.min(2,v.y));this.rider.setLinvel(v,true);this.scooter.setLinvel(v.clone().multiplyScalar(.8),true);
  this.rider.setAngvel({x:Math.cos(yaw)*(.7+speed*.14),y:0,z:-Math.sin(yaw)*(.7+speed*.14)+.6},true);
  this.scooter.setAngvel({x:.5+speed*.12,y:.3,z:1.2},true);
 }
 update(dt:number){
  this.age+=dt;let quiet=true,contact=true;
  for(const body of [this.rider,this.scooter]){const w=new THREE.Vector3().copy(body.angvel());if(w.length()>5)body.setAngvel(w.setLength(5),true);
   quiet&&=new THREE.Vector3().copy(body.linvel()).length()<.16&&w.length()<.22;
   let touching=false;for(let i=0;i<body.numColliders();i++)this.world.contactPairsWith(body.collider(i),other=>{if(other.parent()!==this.rider&&other.parent()!==this.scooter)touching=true;});contact&&=touching;
  }
  this.stable=quiet&&contact?this.stable+dt:0;this.settled=this.stable>.35;
  if(this.settled){this.rest+=dt;this.rider.sleep();this.scooter.sleep();}else this.rest=0;
 }
 get canRecover(){return this.age>.55&&(this.settled||this.stable>.05);}
 dispose(){this.world.removeRigidBody(this.rider);this.world.removeRigidBody(this.scooter);}
}
