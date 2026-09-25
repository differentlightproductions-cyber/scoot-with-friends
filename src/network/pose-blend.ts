import * as THREE from 'three';
import type {Simulation} from '../physics/simulation';
/**
 * A rider's render state between two captured poses (network snapshots, and
 * replays in replay/): continuous values are interpolated, discrete ones taken
 * from the nearer pose, and vectors rebuilt so RiderModel.update can read it
 * like the live Simulation. Nothing here steps physics.
 */
export function blendPose(a:any,b:any,t:number):Simulation{
 const p=structuredClone(t<.5?a:b),lerp=THREE.MathUtils.lerp;
 for(const key of ['yaw','pitch','roll','elapsed'])p[key]=key==='elapsed'?lerp(a[key],b[key],t):a[key]+wrapAngle(b[key]-a[key])*t;
 for(const k of ['angle','velocity'])p.bodyFlip[k]=lerp(a.bodyFlip[k],b.bodyFlip[k],t);
 if(a.swim&&b.swim&&p.swim)for(const k of ['time','stroke'])p.swim[k]=lerp(a.swim[k],b.swim[k],t);
 if(a.mantle&&b.mantle&&p.mantle)p.mantle.time=lerp(a.mantle.time,b.mantle.time,t);
 if(a.diveFlip&&b.diveFlip&&p.diveFlip)for(const k of ['angle','side','twist'])p.diveFlip[k]=lerp(a.diveFlip[k],b.diveFlip[k],t);
 for(const channel of ['deck','bars','bri','kickless','decade'])for(const k of ['angle','velocity'])if(a.tricks[channel]&&b.tricks[channel])p.tricks[channel][k]=lerp(a.tricks[channel][k],b.tricks[channel][k],t);
 // The rider model turns a body flip with the Simulation's own flip frame; rebuild it
 // from the captured takeoff heading, pitch and roll (older peers send none: level).
 p.bodyFlip.basePitch??=0;p.flipYaw0??=p.yaw;p.flipRoll0??=0;
 p.flipFrame=(yaw0=p.flipYaw0,pitch0=p.bodyFlip.basePitch,roll0=p.flipRoll0)=>new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch0,yaw0,roll0,'YXZ'));
 p.flipOrientation=(yaw=p.yaw)=>p.flipFrame().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),p.bodyFlip.angle)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw-p.flipYaw0));
 p.tricks.yaw=lerp(a.tricks.yaw??0,b.tricks.yaw??0,t);
 p.position=new THREE.Vector3().fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position),t);p.previousPosition=p.position;p.previousYaw=p.yaw;
 if(p.fastplant)p.fastplant.foot=new THREE.Vector3().fromArray(p.fastplant.foot);
 if(p.mantle){p.mantle.edge=new THREE.Vector3().fromArray(p.mantle.edge);p.mantle.forward=new THREE.Vector3().fromArray(p.mantle.forward);}
 if(p.crash)for(const key of ['rider','scooter']){const body=p.crash[key];p.crash[key]={translation:()=>body.position,rotation:()=>body.rotation};}
 return p as Simulation;
}
/** The short way round from one angle to another. */
const wrapAngle=(v:number)=>v-Math.PI*2*Math.round(v/(Math.PI*2));
