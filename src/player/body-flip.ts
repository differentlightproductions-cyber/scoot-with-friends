import {TUNE,clamp} from '../core/config';
export type TakeoffOrigin='manual_hop'|'natural_ramp_air'|'trick_initiated_pop'|'fastplant';
/** Signed integrated pitch about the rider's yaw-local right axis. Yaw is
 * integrated separately about world-up, so inversion never invents a spin. */
export class BodyFlipControl {
 origin:TakeoffOrigin='natural_ramp_air';active=false;angle=0;velocity=0;basePitch=0;
 /** Cumulative angular rate the completion assist has drawn this attempt. */
 assistUsed=0;
 /** True while the assist is actually contributing, for diagnostics. */
 assisting=false;
 begin(origin:TakeoffOrigin,pitch=0){this.reset();this.origin=origin;this.basePitch=pitch;}
 reset(){this.origin='natural_ramp_air';this.active=false;this.angle=this.velocity=this.basePitch=0;this.assistUsed=0;this.assisting=false;}
 step(dt:number,chord:boolean,lean:number,currentPitch:number,assist?:{timeToContact:number;surfacePitch:number}){
  if(!this.active&&chord&&Math.abs(lean)>.25){this.active=true;this.basePitch=currentPitch;}
  if(!this.active)return currentPitch;
  const magnitude=clamp((Math.abs(lean)-.1)/.9,0,1);
  // Input requests a bounded rate rather than adding torque indefinitely.
  // Neutral can continue an established rotation, but cannot initiate one.
  if(chord){const direction=magnitude>0?-Math.sign(lean):Math.sign(this.velocity||this.angle);
   const target=direction*(TUNE.flipSlowRate+(TUNE.flipMaxRate-TUNE.flipSlowRate)*Math.pow(magnitude,.8));
   this.velocity+=clamp(target-this.velocity,-TUNE.flipAcceleration*dt,TUNE.flipAcceleration*dt);
  }else this.velocity*=Math.exp(-TUNE.flipReleaseDamping*dt);
  if(assist)this.completionAssist(dt,chord,magnitude,assist);
  this.velocity=clamp(this.velocity,-TUNE.flipMaxRate,TUNE.flipMaxRate);
  this.angle+=this.velocity*dt;
  return this.basePitch+this.angle;
 }
 /**
  * Nudges a nearly finished rotation onto a landing the rider could actually
  * have reached. It never adds rotation the player did not earn: it chooses
  * between the revolution in progress and the one already completed, whichever
  * the current rate can still arrive at, and draws from a small fixed budget.
  */
 private completionAssist(dt:number,chord:boolean,magnitude:number,{timeToContact,surfacePitch}:{timeToContact:number;surfacePitch:number}){
  this.assisting=false;
  if(timeToContact<=0||timeToContact>TUNE.flipAssistWindow)return;
  // Still driving the rotation, or deliberately braking it: hands off.
  if(chord&&magnitude>TUNE.flipAssistInput)return;
  if(this.assistUsed>=TUNE.flipAssistBudget)return;
  const direction=Math.sign(this.velocity);
  if(!direction)return;
  const TAU=Math.PI*2;
  // Measured against the surface being landed on, so a banked receiving ramp
  // counts as level rather than as a fraction of a flip still owed.
  const level=surfacePitch-this.basePitch;
  const turned=this.angle-level;
  const ahead=(direction>0?Math.ceil(turned/TAU):Math.floor(turned/TAU))*TAU;
  const behind=(direction>0?Math.floor(turned/TAU):Math.ceil(turned/TAU))*TAU;
  const rateFor=(target:number)=>(target-turned)/Math.max(.08,timeToContact);
  // How much the assist could actually change the rate in the time remaining,
  // capped by what is left of its budget. A landing further off than this is
  // simply not reachable and is left alone: the rider lands as they arrive.
  const authority=Math.min(
   TUNE.flipAssistRate*timeToContact,
   TUNE.flipAssistBudget-this.assistUsed,
  );
  const reachable=(target:number)=>Math.abs(rateFor(target)-this.velocity)<=authority;
  const target=reachable(ahead)?ahead:reachable(behind)?behind:null;
  if(target===null)return;
  const step=clamp(rateFor(target)-this.velocity,-TUNE.flipAssistRate*dt,TUNE.flipAssistRate*dt);
  const allowed=Math.min(Math.abs(step),TUNE.flipAssistBudget-this.assistUsed);
  if(allowed<=0)return;
  this.velocity+=Math.sign(step)*allowed;
  this.assistUsed+=allowed;
  this.assisting=true;
 }
}
