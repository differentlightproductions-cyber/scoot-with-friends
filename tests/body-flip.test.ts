import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BodyFlipControl} from '../src/player/body-flip.ts';
import {StickGesture} from '../src/tricks/gesture.ts';
import {RotationChannel} from '../src/tricks/tricks.ts';
test('Only a fresh manual hop or supported fastplant unlocks body rotation',()=>{
 for(const origin of ['manual_hop','natural_ramp_air','trick_initiated_pop','fastplant'] as const){
  const flip=new BodyFlipControl();flip.begin(origin,.3);
  for(let n=0;n<60;n++)flip.step(1/120,true,-1,.3);
  assert.equal(flip.active,origin==='manual_hop'||origin==='fastplant');
  if(flip.active){assert(flip.angle>1.5 && flip.angle<2.2);const angle=flip.angle;flip.step(1/120,false,0,angle+.3);assert(flip.angle>angle);for(let i=0;i<120;i++)flip.step(1/120,true,1,flip.angle+.3);assert(flip.velocity<0);}
  flip.reset();assert.equal(flip.active,false);assert.equal(flip.origin,'natural_ramp_air');
 }
});
test('Flip integration remains continuous across inversions and frame rates',()=>{
 const results=[];for(const hz of [30,60,120]){const f=new BodyFlipControl();f.begin('manual_hop');for(let n=0;n<hz*3;n++)f.step(1/hz,true,-1,f.angle);results.push(f.angle);assert(f.angle>Math.PI*4);}
 assert(Math.max(...results)-Math.min(...results)<.16);
});
test('Analog rates stay bounded, neutral eases an established flip and opposite input brakes',()=>{
 const f=new BodyFlipControl();f.begin('manual_hop');
 for(let i=0;i<60;i++)f.step(1/120,true,0,0);assert.equal(f.active,false);
 for(let i=0;i<120;i++)f.step(1/120,true,-1,f.angle);assert(f.velocity<=6.8);const fast=f.velocity;
 for(let i=0;i<60;i++)f.step(1/120,true,0,f.angle);assert(f.velocity<fast&&f.velocity>1);
 const before=f.velocity;f.step(1/120,true,1,f.angle);assert(f.velocity<before);
 for(let i=0;i<240;i++)f.step(1/120,false,0,f.angle);assert(Math.abs(f.velocity)<.1);
});
test('Short lower-quadrant scoops work both directions but a normal hop is not a scoop',()=>{
 for(const side of [-1,1]){const g=new StickGesture();g.step(.1,0,1);g.step(.04,side*.7,.7);const result=g.step(.04,side,0);assert.equal(result?.kind,'bri');assert.equal(result?.short,true);}
 const g=new StickGesture();g.step(.1,0,1);assert.equal(g.step(.008,0,-1),null);assert.equal(g.candidate,'');
});
test('A rewind does not report performance until the deck actually reverses',()=>{
 const c=new RotationChannel(120,22);c.kick(1);for(let n=0;n<100&&!c.canRewind;n++)c.step(1/120);
 assert(c.canRewind);c.rewind(-1,'leftModifier');assert.equal(c.reversals[0].performed,false);
 for(let n=0;n<80&&!c.reversals[0].performed;n++)c.step(1/120);
 assert.equal(c.reversals[0].performed,true);
});
