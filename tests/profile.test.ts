import { ridingButtons } from '../src/input/riding.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProfile, saveProfile, PROFILE_KEY } from '../src/data/loadout';
import { AVATAR_PRESETS, defaultAvatar } from '../src/avatar/config';
test('versioned profile migrates old saves and preserves the avatar and settings',()=>{
 const store=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)}});
 store.set(PROFILE_KEY,JSON.stringify({version:1,riderId:'rider-02',settings:{stance:'goofy',controlStyle:'arcade',sound:false}}));
 const p=loadProfile();assert.equal(p.version,4);assert.deepEqual(p.avatar,defaultAvatar());assert.equal(p.settings.stance,'goofy');assert.equal(p.settings.sound,false);
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
 Object.assign(original,{riderId:'rider-03',bodyBuild:'chunky',outfit:{head:'head-vented-forest',top:'top-hoodie-red',bottom:'bottom-shorts-gray',shoes:'shoes-high-top-navy'}});original.settings.daylight='snow';delete original.settings.weather;
 store.set(PROFILE_KEY,JSON.stringify(original));
 const migrated=loadProfile();
 assert.equal(migrated.avatar.bodyType,'stocky');assert.equal(migrated.avatar.headwear,'helmet');assert.equal(migrated.avatar.headwearColor,'green');
 assert.equal(migrated.avatar.top,'hoodie');assert.equal(migrated.avatar.topColor,'red');assert.equal(migrated.avatar.bottom,'shorts');assert.equal(migrated.avatar.shoes,'high-top');assert.equal(migrated.avatar.shoeColor,'navy');
 assert.deepEqual(migrated.scooter,original.scooter);
 // Snow used to be a fifth time of day: it becomes snowy weather in the daytime.
 assert.equal(migrated.settings.daylight,'day');assert.equal(migrated.settings.weather,'snow');
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

test('time of day and weather are separate settings; a new rider starts on a sunny day', () => {
 const store=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)}});
 const fresh=loadProfile();
 assert.equal(fresh.settings.daylight,'day');assert.equal(fresh.settings.weather,'sunny');
 fresh.settings.daylight='night';fresh.settings.weather='rain';assert.equal(saveProfile(fresh),true);
 const back=loadProfile();assert.equal(back.settings.daylight,'night');assert.equal(back.settings.weather,'rain');
 // Unknown values fall back to the defaults.
 const bad=JSON.parse(store.get(PROFILE_KEY)!);bad.settings.daylight='noon';bad.settings.weather='hail';store.set(PROFILE_KEY,JSON.stringify(bad));
 const safe=loadProfile();assert.equal(safe.settings.daylight,'day');assert.equal(safe.settings.weather,'sunny');
});
test('the flashlight starts on and the live sky off; both are saved, bad values ignored', () => {
 const store=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)}});
 const fresh=loadProfile();
 assert.equal(fresh.settings.flashlight,true);assert.equal(fresh.settings.liveSky,false);
 fresh.settings.flashlight=false;fresh.settings.liveSky=true;saveProfile(fresh);
 const back=loadProfile();assert.equal(back.settings.flashlight,false);assert.equal(back.settings.liveSky,true);
 const bad=JSON.parse(store.get(PROFILE_KEY)!);bad.settings.flashlight='yes';bad.settings.liveSky=1;store.set(PROFILE_KEY,JSON.stringify(bad));
 const safe=loadProfile();assert.equal(safe.settings.flashlight,true);assert.equal(safe.settings.liveSky,false);
});
