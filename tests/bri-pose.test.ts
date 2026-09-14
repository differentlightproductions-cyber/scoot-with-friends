import test from 'node:test';import assert from 'node:assert/strict';import {briPose} from '../src/scooter/bri-pose';
test('Bri pose preserves unwrapped turns, smooth endpoint offsets, side identity and restrained grip path',()=>{
 for(const natural of [-1,1])for(const direction of [-1,1]){
  let previous=briPose(0,natural);for(let n=1;n<=720;n++){const p=briPose(direction*n*Math.PI/180,natural);assert.equal(p.inward,direction!==natural);assert(Math.abs(p.rotation-previous.rotation)<.03);assert(Math.hypot(...p.offset)<.34);previous=p;}
  for(const angle of [0,2*Math.PI,4*Math.PI]){const p=briPose(direction*angle,natural);assert(Math.hypot(...p.offset)<1e-8);assert(Math.abs(p.barLead)<1e-8);}
 }
});
