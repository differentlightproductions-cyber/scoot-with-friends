import { Events } from "../core/events";
import { TUNE } from "../core/config";
import { completedDegrees, type TrickPrimitives } from "./resolver";
export function trickSignature(raw?: TrickPrimitives, name = "") {
  if (!raw) return name.toLowerCase().replace(/ out$/, "");
  return JSON.stringify([completedDegrees(raw.bodyYaw), raw.deckTurns, raw.barTurns,
    raw.finger ?? false, Math.round((raw.briAngle ?? 0) / (Math.PI * 2)),
    Math.round((raw.kicklessAngle ?? 0) / (Math.PI * 2)),
    raw.deckReversals?.length ?? 0, raw.barReversals?.length ?? 0,
    [...raw.states].sort(), raw.fakieSeconds !== undefined]);
}
export function trickValue(raw?: TrickPrimitives) {
  if (!raw) return TUNE.contactTrickPoints;
  if (raw.fakieSeconds !== undefined) return TUNE.fakieEntryPoints;
  const values = [completedDegrees(raw.bodyYaw) / 180 * TUNE.rotationPointsPer180,
    Math.abs(raw.deckTurns) * TUNE.deckTurnPoints * (raw.finger ? 1.35 : 1),
    Math.abs(raw.barTurns) * TUNE.barTurnPoints, raw.states.length * TUNE.bodyTrickPoints,
    Math.trunc((Math.abs(raw.briAngle ?? 0) + 0.2) / (Math.PI * 2)) * 300,
    Math.trunc((Math.abs(raw.kicklessAngle ?? 0) + 0.2) / (Math.PI * 2)) * 200,
    ((raw.deckReversals?.length ?? 0) + (raw.barReversals?.length ?? 0)) * 100];
  const combined = values.filter(n => n > 0).length;
  return Math.round(values.reduce((a,b) => a+b,0) * (1 + Math.max(0, combined-1)*0.12));
}

export interface AttemptDisplay {id:number;name:string;points:number;multiplier:number;status:'pending'|'landed'|'failed';age:number}
export class ScoreSystem {
 dispose:()=>unknown;total=0;line=0;multiplier=1;recent:string[]=[];lastAward=0;caseFactor=1;
 display:AttemptDisplay|null=null;
 private seen=new Set<number>();private sequence=-1;
 private segment:{id:number;name:string;points:number}|null=null;
 constructor(events:Events){this.dispose=events.on(e=>{
  if(e.type==='trick'){
   const id=e.attemptId??e.record?.id??this.sequence--;
   if(this.seen.has(id))return;this.seen.add(id);if(this.seen.size>512)this.seen.delete(this.seen.values().next().value!);
   const signature=trickSignature(e.record?.raw,e.name), repeated=this.recent.includes(signature);
   const extra=this.segment?.name===e.name?this.segment.points:0;
   const quality=e.record?.landing==='sketchy'?.8:1;
   const value=this.preview(e.record?.raw,e.name,quality,extra),factor=this.multiplier;
   this.total+=value;this.line+=value;this.lastAward=value;
   this.display={id,name:e.name,points:value,multiplier:factor,status:'landed',age:0};
   if(extra||this.segment?.name===e.name)this.segment=null;
   this.recent.push(signature);this.recent=this.recent.slice(-3);
   if(!repeated)this.multiplier=Math.min(TUNE.comboCap,this.multiplier+TUNE.comboStep);
   this.caseFactor=1;
  }
  if(e.type==='marker'&&e.message==='CASE / HOLD ON')this.caseFactor=.65;
  if(e.type==='line'&&e.ended){this.line=0;this.multiplier=1;}
  if(e.type==='bail'){
   if(this.display?.status==='pending')this.display={...this.display,status:'failed',age:0};
   this.segment=null;this.line=0;this.multiplier=1;this.caseFactor=1;
  }
  if(e.type==='reset'){this.display=null;this.segment=null;this.line=0;this.multiplier=1;this.caseFactor=1;}
 });}
 preview(raw?:TrickPrimitives,name='',quality=1,extra=0){
  const sig=trickSignature(raw,name),n=this.recent.filter(s=>s===sig).length;
  return Math.round((trickValue(raw)+extra)*this.multiplier*TUNE.repetitionValues[n]*quality*this.caseFactor);
 }
 observe(attempt:({id:number;name:string;raw:TrickPrimitives})|null){
  if(attempt&&!this.seen.has(attempt.id))this.display={id:attempt.id,name:attempt.name,points:this.preview(attempt.raw,attempt.name),multiplier:this.multiplier,status:'pending',age:0};
 }
 holdContact(dt:number,duration:number,grind:boolean,difficulty=1,name=grind?'50-50':'Manual'){
  this.hold(name,dt*(grind?45:24)*difficulty/Math.sqrt(1+duration*.4));
 }
 private hold(name:string,points:number){
  if(this.segment?.name!==name)this.segment={id:this.sequence--,name,points:0};
  this.segment.points+=points;
  this.display={id:this.segment.id,name,points:this.preview(undefined,name,1,this.segment.points),multiplier:this.multiplier,status:'pending',age:0};
 }
 holdFakie(dt:number){this.hold('Fakie',TUNE.fakiePointsPerSecond*dt);}
 tick(dt:number){if(this.display)this.display.age+=dt;}
 restart(){this.total=0;this.line=0;this.multiplier=1;this.recent=[];this.display=null;this.segment=null;this.caseFactor=1;}
}
