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
  const authority=chord?clamp(-lean,-1,1):0;
  // No automatic completion and no return-to-upright spring.
  this.velocity+=authority*TUNE.flipAcceleration*dt;
  this.velocity=clamp(this.velocity,-TUNE.flipMaxRate,TUNE.flipMaxRate)*Math.exp(-(chord&&Math.abs(lean)>.05?.22:TUNE.flipReleaseDamping)*dt);
  this.angle+=this.velocity*dt;
  return this.basePitch+this.angle;
 }
}
