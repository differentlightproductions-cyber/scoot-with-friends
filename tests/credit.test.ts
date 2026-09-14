import test from 'node:test';import assert from 'node:assert/strict';
import {CreditEconomy,owns} from '../src/data/credit';import {loadProfile,saveProfile,PROFILE_KEY} from '../src/data/loadout';
test('confirmed rewards, atomic purchases, duplicate input, storage failure and migration',async()=>{
 const data=new Map<string,string>();let fail=false;(globalThis as any).localStorage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{if(fail)throw Error('full');data.set(k,v);}};
 data.set(PROFILE_KEY,JSON.stringify({version:2,riderId:'rider-02',settings:{stance:'goofy'}}));const old=loadProfile();assert.equal(old.riderId,'rider-02');assert.equal(old.wallet.credit,0);
 const e=new CreditEconomy();assert.equal(await e.reward('confirmed:1',7600),'ok');await e.reward('confirmed:1',7600);assert.equal(loadProfile().wallet.credit,76);
 const part={partId:'mafioso-bars-y',variantId:'mafioso_bars_y_black_gold'};const results=await Promise.all([e.buy(part),e.buy(part)]);assert.deepEqual(results,['ok','Already owned']);assert.equal(loadProfile().wallet.credit,1);assert.ok(owns(loadProfile().wallet,part));
 saveProfile(old);assert.equal(loadProfile().wallet.credit,1);assert.ok(owns(loadProfile().wallet,part));
 assert.equal(await e.setTestCredit(1000,false),'Owner access required');assert.equal(await e.setTestCredit(1000,true),'ok');
 const wheel={partId:'mafioso-wheels-petal',variantId:'mafioso_wheels_petal_oilslick'};fail=true;assert.match(await e.buy(wheel),/Saving failed/);assert.equal(loadProfile().wallet.testCredit,1000);assert.equal(owns(loadProfile().wallet,wheel),false);fail=false;
 assert.equal(await e.buy(wheel),'ok');assert.equal(loadProfile().wallet.testCredit,945);assert.equal(loadProfile().wallet.credit,1);assert.ok(owns(loadProfile().wallet,wheel));
});
