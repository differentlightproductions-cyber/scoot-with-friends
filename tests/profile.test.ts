import { ridingButtons } from '../src/input/riding.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProfile, saveProfile, PROFILE_KEY } from '../src/data/loadout';
import { AVATAR_PRESETS, defaultAvatar } from '../src/avatar/config';
test('versioned profile migrates old saves and preserves the avatar and settings',()=>{
 const store=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)}});
 store.set(PROFILE_KEY,JSON.stringify({version:1,riderId:'rider-02',settings:{stance:'goofy',controlStyle:'arcade',sound:false}}));
 const p=loadProfile();assert.equal(p.version,3);assert.deepEqual(p.avatar,defaultAvatar());assert.equal(p.settings.stance,'goofy');assert.equal(p.settings.sound,false);
 p.avatar={...AVATAR_PRESETS[3].config};p.avatar.bodyType='stocky';p.settings.daylight='night';
 assert.equal(saveProfile(p),true);assert.deepEqual(loadProfile(),p);
 // Anything unknown or out of range falls back per field; the rest of the rider is kept.
 const bad={...p,avatar:{...p.avatar,hairStyle:'../../secret',eyeY:99,skinTone:7}};store.set(PROFILE_KEY,JSON.stringify(bad));
 const loaded=loadProfile().avatar;assert.equal(loaded.hairStyle,defaultAvatar().hairStyle);assert.equal(loaded.eyeY,3);assert.equal(loaded.skinTone,defaultAvatar().skinTone);assert.equal(loaded.top,p.avatar.top);
});
test('a pre-avatar save migrates its gear once and keeps its scooter',()=>{
 const store=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)}});
 const original=loadProfile() as any;delete original.avatar;
 Object.assign(original,{riderId:'rider-03',bodyBuild:'chunky',outfit:{head:'head-vented-forest',top:'top-hoodie-red',bottom:'bottom-shorts-gray',shoes:'shoes-high-top-navy'}});original.settings.daylight='snow';
 store.set(PROFILE_KEY,JSON.stringify(original));
 const migrated=loadProfile();
 assert.equal(migrated.avatar.bodyType,'stocky');assert.equal(migrated.avatar.headwear,'helmet');assert.equal(migrated.avatar.headwearColor,'green');
 assert.equal(migrated.avatar.top,'hoodie');assert.equal(migrated.avatar.topColor,'red');assert.equal(migrated.avatar.bottom,'shorts');assert.equal(migrated.avatar.shoes,'high-top');assert.equal(migrated.avatar.shoeColor,'navy');
 assert.deepEqual(migrated.scooter,original.scooter);assert.equal(migrated.settings.daylight,'snow');
 assert.equal('riderId' in migrated||'outfit' in migrated||'bodyBuild' in migrated,false);
 assert.equal(saveProfile(migrated),true);assert.deepEqual(loadProfile().avatar,migrated.avatar);
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

