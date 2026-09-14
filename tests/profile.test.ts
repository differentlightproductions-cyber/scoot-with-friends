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
