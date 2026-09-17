import {TUNE,clamp} from '../core/config';
export type TakeoffOrigin='manual_hop'|'natural_ramp_air'|'trick_initiated_pop'|'fastplant';
/** Signed integrated pitch about the rider's yaw-local right axis. Yaw is
 * integrated separately about world-up, so inversion never invents a spin.
 *
 * Control, with LT+RT held (the chord) and LS pitch:
 *  - Strong LS in the rotation's direction drives it toward a bounded rate.
 *  - LS against it (even a light nudge) brakes toward a stop; it never flips the sign of a
 *    rotation in flight. From a stop, held input can start one again.
 *  - Eased LS eases the rate down toward flipSlowRate for a slower finish.
 * Releasing the chord keeps the rotation's momentum; nothing damps it to a stall.
 * In the last moments before a predicted contact, while the player is not
 * driving or braking, landing preparation opens the rider up to meet the next
 * upright in the direction of travel (or stops just past one). It may tuck to
 * speed up only within flipAssistBudget, so a missing half flip is never made up. */
export class BodyFlipControl {
 origin:TakeoffOrigin='natural_ramp_air';active=false;angle=0;velocity=0;basePitch=0;
 /** Cumulative speed-up (rad/s) landing preparation has added this attempt. */
 assistUsed=0;
 /** True while landing preparation is shaping the rate, for diagnostics. */
 assisting=false;
 /** Last time-to-contact seen, for diagnostics. */
 lastContact=99;
 /** Seconds landing preparation has shaped the rate this attempt. */
 prepared=0;
 /** A brake that stopped the rotation holds until the stick comes back. */
 private brakeLatch=false;
 begin(origin:TakeoffOrigin,pitch=0){this.reset();this.origin=origin;this.basePitch=pitch;}
 reset(){this.origin='natural_ramp_air';this.active=false;this.angle=this.velocity=this.basePitch=0;this.assistUsed=0;this.assisting=false;this.brakeLatch=false;this.lastContact=99;this.prepared=0;}
 step(dt:number,chord:boolean,lean:number,currentPitch:number,assist?:{timeToContact:number;surfacePitch:number}){
  if(!this.active&&chord&&Math.abs(lean)>.25){this.active=true;this.basePitch=currentPitch;}
  if(!this.active)return currentPitch;
  this.assisting=false;
  const magnitude=clamp((Math.abs(lean)-.1)/.9,0,1);
  const requested=magnitude>0?-Math.sign(lean):0;
  const turning=Math.sign(this.velocity);
  if(assist)this.lastContact=assist.timeToContact;
  const strong=chord&&magnitude>TUNE.flipAssistInput;
  const countering=chord&&magnitude>0&&turning!==0&&requested===-turning;
  if(!strong&&!countering)this.brakeLatch=false;
  if(countering){
   // Opening up against the rotation, even with a light nudge: slow toward a
   // stop, never reverse it.
   const next=this.velocity-turning*TUNE.flipBrakeAcceleration*Math.max(.5,magnitude)*dt;
   this.velocity=Math.sign(next)===turning?next:0;
   if(this.velocity===0)this.brakeLatch=true;
  }else if(strong&&this.brakeLatch){
   // Held against a rotation it has stopped: stay stopped until the stick returns.
  }else if(strong){
   const target=requested*(TUNE.flipSlowRate+(TUNE.flipMaxRate-TUNE.flipSlowRate)*Math.pow(magnitude,.8));
   this.velocity+=clamp(target-this.velocity,-TUNE.flipAcceleration*dt,TUNE.flipAcceleration*dt);
  }else if(!(assist&&this.prepareLanding(dt,assist))&&chord&&turning!==0&&Math.abs(this.velocity)>TUNE.flipSlowRate){
   // Eased stick with the chord held: a controlled, slower continuation.
   const target=turning*TUNE.flipSlowRate;
   this.velocity+=clamp(target-this.velocity,-TUNE.flipAcceleration*dt,TUNE.flipAcceleration*dt);
  }
  this.velocity=clamp(this.velocity,-TUNE.flipMaxRate,TUNE.flipMaxRate);
  this.angle+=this.velocity*dt;
  return this.basePitch+this.angle;
 }
 /**
  * Shapes a relaxed rotation onto a landing the rider can actually reach.
  * Returns true while it owns the rate. It measures against the surface being
  * landed on, keeps the winding (only uprights in the direction of travel, or
  * the one just passed), opens up at up to flipOpenAcceleration and tucks only
  * within the small flipAssistBudget.
  */
 private prepareLanding(dt:number,{timeToContact,surfacePitch}:{timeToContact:number;surfacePitch:number}){
  if(timeToContact<=0||timeToContact>TUNE.flipAssistWindow)return false;
  const direction=Math.sign(this.velocity);
  if(!direction)return false;
  const TAU=Math.PI*2;
  const level=surfacePitch-this.basePitch;
  const turned=this.angle-level;
  const ahead=(direction>0?Math.ceil(turned/TAU):Math.floor(turned/TAU))*TAU;
  const behind=ahead-direction*TAU;
  const past=(turned-behind)*direction; // how far beyond the last upright
  const remaining=(ahead-turned)*direction;
  let desired:number;
  if(past<TUNE.flipCatchOvershoot&&past<remaining)desired=0;
  else{
   const needed=remaining/Math.max(.08,timeToContact);
   const tuckRoom=Math.max(0,TUNE.flipAssistBudget-this.assistUsed);
   // Out of reach even with a full tuck: the rider lands as they arrive.
   if(needed>Math.abs(this.velocity)+tuckRoom+1e-6)return false;
   desired=needed;
  }
  const current=Math.abs(this.velocity);
  let next:number;
  if(desired<current)next=Math.max(desired,current-TUNE.flipOpenAcceleration*dt);
  else{
   const room=Math.max(0,TUNE.flipAssistBudget-this.assistUsed);
   next=Math.min(desired,current+Math.min(TUNE.flipAssistRate*dt,room));
   this.assistUsed+=next-current;
  }
  this.velocity=direction*next;
  this.assisting=true;
  this.prepared+=dt;
  return true;
 }
}
