import { ridingButtons } from '../src/input/riding.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProfile, saveProfile, PROFILE_KEY } from '../src/data/loadout';
test('versioned profile migrates old saves and preserves authored gear/settings',()=>{
 const store=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)}});
 store.set(PROFILE_KEY,JSON.stringify({version:1,riderId:'rider-02',settings:{stance:'goofy',controlStyle:'arcade',sound:false}}));
 const p=loadProfile();assert.equal(p.version,3);assert.equal(p.riderId,'rider-02');assert.equal(p.settings.stance,'goofy');assert.equal(p.settings.sound,false);
 assert.equal(p.bodyBuild,'regular');
 p.bodyBuild='chunky';p.outfit.head='head-vented-forest';p.outfit.top='top-hoodie-red';p.settings.daylight='night';
 assert.equal(saveProfile(p),true);assert.deepEqual(loadProfile(),p);
 const bad={...p,outfit:{...p.outfit,head:'../../secret'}};store.set(PROFILE_KEY,JSON.stringify(bad));assert.equal(loadProfile().outfit.head,'head-helmet-red');
});
test('controls version 2: Normal is the default and old presets keep their physical buttons once',()=>{
 const store=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)}});
 assert.equal(loadProfile().settings.stance,'regular');
 assert.equal(ridingButtons('regular').push,'hop');assert.equal(ridingButtons('regular').whip,'pushDeck');
 assert.equal(ridingButtons('goofy').push,'pushDeck');assert.equal(ridingButtons('goofy').whip,'hop');
 for(const style of ['regular','goofy'] as const){const b=ridingButtons(style);assert.notEqual(b.whip,'brakeBars');}
 // An old default save (X push) becomes Goofy (X push); an old Goofy save (A push) becomes Normal.
 for(const [old,next] of [['regular','goofy'],['goofy','regular']] as const){
  store.set(PROFILE_KEY,JSON.stringify({version:3,settings:{stance:old,controlStyle:'pro'}}));
  const p=loadProfile();assert.equal(p.settings.stance,next);
  const before=ridingButtons(old==='regular'?'goofy':'regular');// the pre-v2 table had the names swapped
  assert.equal(ridingButtons(p.settings.stance).push,before.push);
  saveProfile(p);assert.equal(loadProfile().settings.stance,next,'migration runs once');
 }
});
