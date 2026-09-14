import {TUNE,clamp} from '../core/config';
export type TakeoffOrigin='manual_hop'|'natural_ramp_air'|'trick_initiated_pop'|'fastplant';
/** Signed integrated pitch about the rider's yaw-local right axis. Yaw is
 * integrated separately about world-up, so inversion never invents a spin. */
export class BodyFlipControl {
 origin:TakeoffOrigin='natural_ramp_air';active=false;angle=0;velocity=0;basePitch=0;
 begin(origin:TakeoffOrigin,pitch=0){this.reset();this.origin=origin;this.basePitch=pitch;}
 reset(){this.origin='natural_ramp_air';this.active=false;this.angle=this.velocity=this.basePitch=0;}
 step(dt:number,chord:boolean,lean:number,currentPitch:number){
  if(!this.active&&chord&&Math.abs(lean)>.25&&(this.origin==='manual_hop'||this.origin==='fastplant')){this.active=true;this.basePitch=currentPitch;}
  if(!this.active)return currentPitch;
  const magnitude=clamp((Math.abs(lean)-.1)/.9,0,1);
  // Input requests a bounded rate rather than adding torque indefinitely.
  // Neutral can continue an established rotation, but cannot initiate one.
  if(chord){const direction=magnitude>0?-Math.sign(lean):Math.sign(this.velocity||this.angle);
   const target=direction*(TUNE.flipSlowRate+(TUNE.flipMaxRate-TUNE.flipSlowRate)*Math.pow(magnitude,.8));
   this.velocity+=clamp(target-this.velocity,-TUNE.flipAcceleration*dt,TUNE.flipAcceleration*dt);
  }else this.velocity*=Math.exp(-TUNE.flipReleaseDamping*dt);
  this.velocity=clamp(this.velocity,-TUNE.flipMaxRate,TUNE.flipMaxRate);
  this.angle+=this.velocity*dt;
  return this.basePitch+this.angle;
 }
}
