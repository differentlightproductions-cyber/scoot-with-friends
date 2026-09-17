import {TUNE,clamp,wrap} from '../core/config';
export type TakeoffOrigin='manual_hop'|'natural_ramp_air'|'trick_initiated_pop'|'fastplant';
/** Signed integrated pitch about the rider's yaw-local right axis. Yaw is
 * integrated separately about world-up, so inversion never invents a spin.
 *
 * Intent: a flip is one rotation unless the player keeps the stick pushed hard
 * through it. Strong input still held past a revolution's upright (relative to
 * the landing surface) commits to one more revolution.
 *
 * Control, with LT+RT held (the chord) and LS pitch:
 *  - Strong LS in the rotation's direction drives it toward a bounded rate.
 *  - LS against it (even a light nudge) brakes toward a stop; it never reverses
 *    a rotation in flight. From a stop, held input can start one again.
 * Whenever the player is not driving or braking (a brief flick, eased stick or
 * released triggers), the rotation is guided to finish the intended revolutions
 * just before the predicted contact, then held upright for the landing. It never
 * unwinds a rotation and cannot outrun flipMaxRate, so a flip started with too
 * little air still lands short and fails honestly. */
export class BodyFlipControl {
 origin:TakeoffOrigin='natural_ramp_air';active=false;angle=0;velocity=0;basePitch=0;
 /** Whole revolutions the player is going for. */
 intendedTurns=1;
 /** Cumulative guidance speed-up this attempt (rad/s), for diagnostics. */
 assistUsed=0;
 /** True while guidance is shaping the rate, for diagnostics. */
 assisting=false;
 /** Seconds guidance has shaped the rate this attempt. */
 prepared=0;
 /** Last time-to-contact seen, for diagnostics. */
 lastContact=99;
 /** A brake that stopped the rotation holds until the stick comes back. */
 private brakeLatch=false;
 begin(origin:TakeoffOrigin,pitch=0){this.reset();this.origin=origin;this.basePitch=pitch;}
 reset(){this.origin='natural_ramp_air';this.active=false;this.angle=this.velocity=this.basePitch=0;this.intendedTurns=1;this.assistUsed=0;this.assisting=false;this.prepared=0;this.brakeLatch=false;this.lastContact=99;}
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
  const TAU=Math.PI*2;
  if(countering){
   // Never a weaker stop than guidance itself would make.
   const next=this.velocity-turning*Math.max(TUNE.flipOpenAcceleration,TUNE.flipBrakeAcceleration*magnitude)*dt;
   this.velocity=Math.sign(next)===turning?next:0;
   if(this.velocity===0)this.brakeLatch=true;
  }else if(strong&&this.brakeLatch){
   // Held against a rotation it has stopped: stay stopped until the stick returns.
  }else if(strong){
   const target=requested*(TUNE.flipSlowRate+(TUNE.flipMaxRate-TUNE.flipSlowRate)*Math.pow(magnitude,.8));
   this.velocity+=clamp(target-this.velocity,-TUNE.flipAcceleration*dt,TUNE.flipAcceleration*dt);
   // Still pushing hard past this revolution's upright (measured against the
   // landing surface, like the finish): go for another.
   const level=assist?wrap(assist.surfacePitch-this.basePitch):0;
   if((this.angle-level)*requested>=(this.intendedTurns-1+TUNE.flipDoubleCommit)*TAU)this.intendedTurns++;
  }else if(turning!==0)this.guide(dt,assist);
  this.velocity=clamp(this.velocity,-TUNE.flipMaxRate,TUNE.flipMaxRate);
  this.angle+=this.velocity*dt;
  return this.basePitch+this.angle;
 }
 /**
  * Carries a relaxed rotation to the intended upright relative to the surface
  * being landed on, finishing a little before contact, then holds it there.
  */
 private guide(dt:number,assist?:{timeToContact:number;surfacePitch:number}){
  const TAU=Math.PI*2,direction=Math.sign(this.velocity);
  // The surface below changes during the air (wall, then deck), so its pitch is
  // only a within-half-turn offset; it must never add or remove a revolution.
  const level=assist?wrap(assist.surfacePitch-this.basePitch):0;
  const target=direction*this.intendedTurns*TAU+level;
  // Carried past the intended upright: open out and stop, never go round again.
  const remaining=(target-this.angle)*direction;
  const current=Math.abs(this.velocity);
  let desired:number;
  if(remaining<=0)desired=0; // upright (or just past): open out and hold
  else{
   const time=assist&&assist.timeToContact<50?assist.timeToContact:1;
   // Finish shortly before contact so the rider is set for the landing.
   const finish=Math.max(.12,time-TUNE.flipFinishLead);
   desired=clamp(remaining/finish,TUNE.flipGuideMinRate,TUNE.flipMaxRate);
   // Close to the upright, slow into it rather than stopping abruptly.
   desired=Math.min(desired,Math.sqrt(2*TUNE.flipOpenAcceleration*remaining));
  }
  let next:number;
  if(desired<current)next=Math.max(desired,current-TUNE.flipOpenAcceleration*dt);
  else{next=Math.min(desired,current+TUNE.flipGuideAcceleration*dt);this.assistUsed+=next-current;}
  this.velocity=direction*next;
  this.assisting=true;
  this.prepared+=dt;
 }
}
