import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completedDegrees} from '../src/tricks/resolver';
import {Tricks} from '../src/tricks/tricks';
import {ScoreSystem,trickSignature} from '../src/tricks/score';
import {Events} from '../src/core/events';
import {emptyInput} from '../src/input/input';
test('rotation naming uses tolerant 90-degree increments and preserves actual yaw',()=>{
 for(const [target,values] of [[90,[80,90,105]],[180,[165,180,195]],[270,[255,270,285]],[360,[340,347,360,380]],[540,[520,540,560]],[720,[700,720,740]],[1080,[1065,1095]]])
 for(const value of values)for(const sign of [-1,1]) assert.equal(completedDegrees(sign*value*Math.PI/180),target);
});
test('live trick attempts are provisional and a bail awards nothing',()=>{
 const e=new Events(),t=new Tricks(e),s=new ScoreSystem(e);t.startAir(false);
 const f=emptyInput();f.pressed.pushDeck=true;
 t.input(.04,f);assert.match(t.attempt?.name??'',/Tailwhip/);assert.equal(s.line,0);
 t.finish('failed');e.emit({type:'bail',reason:'test'});assert.equal(s.total,0);assert.equal(s.line,0);
});
test('components score, different combinations have distinct signatures and repetition diminishes',()=>{
 const e=new Events(),t=new Tricks(e),s=new ScoreSystem(e);
 const land=(deck=1,bars=0,yaw=0)=>{t.startAir(false);t.deck.angle=deck*Math.PI*2;t.bars.angle=bars*Math.PI*2;t.yaw=yaw*Math.PI/180;t.finish('clean');return s.lastAward;};
 const first=land(),second=land(),third=land(),fourth=land();
 assert(second<first);assert(third<second);assert(fourth<third);
 const varied=land(1,1,360);assert(varied>first);assert(s.multiplier>1);
 const raw=t.history.at(-1).raw;assert.notEqual(trickSignature(raw),trickSignature({...raw,bodyYaw:0}));
});
