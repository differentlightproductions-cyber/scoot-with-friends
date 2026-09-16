import test from 'node:test';import assert from 'node:assert/strict';import {resolveTrick,type TrickPrimitives} from '../src/tricks/resolver';import {componentPoints} from '../src/tricks/score';
const raw:TrickPrimitives={bodyYaw:Math.PI,flipPitch:-Math.PI*2,deckAngle:0,barAngle:0,deckTurns:0,barTurns:0,states:[],out:false,direction:{body:1,deck:0,bars:0}};
test('Flair and Front Flair are named for the completed movement, not the obstacle',()=>{
 // A backflip with a half turn is a Flair wherever it happened; the quarter
 // context is metadata now and no longer gates the label.
 assert.equal(resolveTrick({...raw,flairContext:true}).name,'Flair');
 assert.equal(resolveTrick(raw).name,'Flair');
 // The frontflip equivalent is a Front Flair.
 assert.equal(resolveTrick({...raw,flipPitch:Math.PI*2}).name,'Front Flair');
 assert.equal(resolveTrick({...raw,flipPitch:Math.PI*2,flairContext:true}).name,'Front Flair');
 // Both still need one flip AND the half turn.
 assert(!resolveTrick({...raw,bodyYaw:0}).name.includes('Flair'));
 assert(!resolveTrick({...raw,flipPitch:-Math.PI*4}).name.includes('Flair'));
 // Other flip/spin combinations keep their ordinary descriptions.
 assert.equal(resolveTrick({...raw,bodyYaw:Math.PI*2}).name,'Backflip 360');
 assert.equal(resolveTrick({...raw,flipPitch:Math.PI*2,bodyYaw:Math.PI*2}).name,'Frontflip 360');
 assert.equal(resolveTrick({...raw,flipPitch:Math.PI*2,bodyYaw:Math.PI*4}).name,'Frontflip 720');
});

test('Bri Air and Inward Air need completed scooter rotation, 180 and confirmed quarter return, without extra score',()=>{
 for(const stance of ['regular','goofy'] as const)for(const direction of [-1,1]){
  const natural=stance==='regular'?1:-1,p={...raw,flipPitch:0,briAngle:direction*Math.PI*2,stance,naturalWhipDirection:natural};
  const plain=resolveTrick(p),air=resolveTrick({...p,flairContext:true});
  assert.equal(air.name,direction===natural?'Bri Air':'Inward Air');assert.deepEqual(air.components,plain.components);
  assert(!plain.name.endsWith('Air'));assert(!resolveTrick({...p,briAngle:direction*2,flairContext:true}).name.includes('Bri Air'));
  assert(!resolveTrick({...p,bodyYaw:0,flairContext:true}).name.endsWith('Air'));
 }
});
