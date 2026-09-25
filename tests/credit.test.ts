import test from 'node:test';import assert from 'node:assert/strict';
import {CreditEconomy,owns} from '../src/data/credit';import {loadProfile,saveProfile,PROFILE_KEY} from '../src/data/loadout';
test('confirmed rewards, atomic purchases, duplicate input, storage failure and migration',async()=>{
 const data=new Map<string,string>();let fail=false;(globalThis as any).localStorage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{if(fail)throw Error('full');data.set(k,v);}};
 data.set(PROFILE_KEY,JSON.stringify({version:2,riderId:'rider-02',settings:{stance:'goofy'}}));const old=loadProfile();assert.equal(old.avatar.version,1);assert.equal(old.wallet.credit,0);
 // Purchases also count toward missions, which can pay Credit: `paid` tracks that.
 const e=new CreditEconomy();let paid=0;e.onGains=g=>{paid+=g.credit;};assert.equal(await e.reward('confirmed:1',7600),'ok');await e.reward('confirmed:1',7600);assert.equal(loadProfile().wallet.credit,30,'one Coin per 250 banked points, paid once');
 // Mafioso costs Bucks (#76), never Coins or test Credit.
 const part={partId:'mafioso-bars-y',variantId:'mafioso_bars_y_black_gold'};assert.equal(await e.buy(part),'Not enough Bucks');assert.equal(loadProfile().wallet.credit,30);
 {const p=loadProfile();p.wallet.bucks=11;saveProfile(p,true);}
 const results=await Promise.all([e.buy(part),e.buy(part)]);assert.deepEqual(results,['ok','Already owned']);assert.equal(loadProfile().wallet.bucks,5,'6 Bucks, charged once');assert.equal(loadProfile().wallet.credit,30+paid);assert.equal(loadProfile().progress.stats.purchases,1);assert.ok(owns(loadProfile().wallet,part));
 saveProfile(old);assert.equal(loadProfile().wallet.credit,30+paid);assert.equal(loadProfile().wallet.bucks,5);assert.ok(owns(loadProfile().wallet,part));
 assert.equal(await e.setTestCredit(1000,false),'Owner access required');assert.equal(await e.setTestCredit(1000,true),'ok');
 const wheel={partId:'mafioso-wheels-petal',variantId:'mafioso_wheels_petal_oilslick'};fail=true;assert.match(await e.buy(wheel),/Saving failed/);assert.equal(loadProfile().wallet.bucks,5);assert.equal(owns(loadProfile().wallet,wheel),false);fail=false;
 assert.equal(await e.buy(wheel),'ok');assert.equal(loadProfile().wallet.bucks,0);assert.equal(loadProfile().wallet.testCredit,1000,'test Credit never pays for Bucks parts');assert.equal(loadProfile().wallet.credit,30+paid);assert.ok(owns(loadProfile().wallet,wheel));
 // Coins parts spend test Credit first.
 const deck={partId:'pro-deck',variantId:'black'};assert.equal(await e.buy(deck),'ok');assert.equal(loadProfile().wallet.testCredit,850);assert.equal(loadProfile().wallet.credit,30+paid);
 const equipped=await e.equip(wheel,0);assert.ok(equipped.profile);assert.deepEqual(loadProfile().scooter.frontWheel,wheel);assert.deepEqual(loadProfile().scooter.rearWheel,wheel);assert.equal(loadProfile().equipmentRevision,1);
 assert.ok((await e.equip(part,0)).error);assert.deepEqual(loadProfile().scooter.frontWheel,wheel);
 fail=true;assert.ok((await e.equip(part,1)).error);fail=false;assert.equal(loadProfile().equipmentRevision,1);
});

