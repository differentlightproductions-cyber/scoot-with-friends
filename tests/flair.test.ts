import test from 'node:test';import assert from 'node:assert/strict';import {resolveTrick,type TrickPrimitives} from '../src/tricks/resolver';import {componentPoints} from '../src/tricks/score';
const raw:TrickPrimitives={bodyYaw:Math.PI,flipPitch:-Math.PI*2,deckAngle:0,barAngle:0,deckTurns:0,barTurns:0,states:[],out:false,direction:{body:1,deck:0,bars:0}};
test('Flair labels need a backflip, 180 and confirmed quarter return context',()=>{assert.equal(resolveTrick({...raw,flairContext:true}).name,'Flair');assert(!resolveTrick(raw).name.includes('Flair'));assert(!resolveTrick({...raw,bodyYaw:0,flairContext:true}).name.includes('Flair'));assert(!resolveTrick({...raw,flipPitch:Math.PI*2,flairContext:true}).name.includes('Flair'));});

test('Bri Air and Inward Air need completed scooter rotation, 180 and confirmed quarter return, without extra score',()=>{
 for(const stance of ['regular','goofy'] as const)for(const direction of [-1,1]){
  const natural=stance==='regular'?1:-1,p={...raw,flipPitch:0,briAngle:direction*Math.PI*2,stance,naturalWhipDirection:natural};
  const plain=resolveTrick(p),air=resolveTrick({...p,flairContext:true});
  assert.equal(air.name,direction===natural?'Bri Air':'Inward Air');assert.deepEqual(air.components,plain.components);
  assert(!plain.name.endsWith('Air'));assert(!resolveTrick({...p,briAngle:direction*2,flairContext:true}).name.includes('Bri Air'));
  assert(!resolveTrick({...p,bodyYaw:0,flairContext:true}).name.endsWith('Air'));
 }
});
