import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type {Simulation} from '../physics/simulation';
import {TUNE} from '../core/config';
import {OUTDOOR,terrainHeight} from '../park/park';
import {inWater} from '../park/water';
import {GROUPS} from '../physics/groups';

/** Move only the local rider. Reuse marker recovery without replacing their saved marker. */
export function teleportNear(s:Simulation,target:number[],yaw:number):boolean {
  if(target.length!==3||!target.every(Number.isFinite)||!Number.isFinite(yaw))return false;
  const usable=(c:RAPIER.Collider)=>!c.isSensor()&&!s.park.railHandles.has(c.handle)&&c.parent()!==s.crash?.rider&&c.parent()!==s.crash?.scooter;
  for(const radius of [1.6,2.5,4,6])for(let i=0;i<8;i++){
    const angle=yaw+Math.PI+i*Math.PI/4,x=target[0]+Math.sin(angle)*radius,z=target[2]+Math.cos(angle)*radius;
    if(OUTDOOR&&inWater(x,z,1.08))continue;
    const top=Math.max(target[1]+2,terrainHeight(x,z)+2);
    const hit=s.world.castRayAndGetNormal(new RAPIER.Ray({x,y:top,z},{x:0,y:-1,z:0}),8,true,undefined,undefined,undefined,s.body,usable);
    if(!hit||hit.normal.y<.95)continue;
    const y=top-hit.timeOfImpact+TUNE.radius+.02;
    if(s.world.intersectionWithShape({x,y:y+.65,z},{x:0,y:0,z:0,w:1},new RAPIER.Capsule(.4,.35),undefined,GROUPS.chassis,undefined,s.body,usable))continue;
    const saved=s.marker.saved;
    try{
      s.marker.saved={mapId:OUTDOOR?'outdoor':'warehouse',position:[x,y,z],yaw,pitch:0,roll:0,normal:[0,1,0],dropIn:null};
      if(s.marker.returnTo(s)){s.lastSafeGround.copy(s.position);return true;}
    }finally{s.marker.saved=saved;}
  }
  return false;
}
