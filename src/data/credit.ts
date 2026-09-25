import {loadProfile,saveProfile} from './loadout';
import {type PartSelection,validStarter} from './scooterParts';
import {catalogEntry,ownershipKey as catalogKey,ownsSelection,ownsBoard,bundlePrice,completeBoardSelections} from './catalog';
import {LONGBOARD_PARTS,type LongboardCategory} from './longboardParts';
import {dayKey,openCrate,record,type CrateResult,type Gains,type Landed,type Stat} from './progress';
import {dailyDeals} from './deals';
import {SHOPS} from './shops';
const shopStock=(id:string)=>SHOPS.find(s=>s.id===id)?.stock??[];
import type {LocalProfile} from './loadout';
import {receiveItem} from './items';
/**
 * Pays what record() earned into the same save: Credit into the wallet, and
 * level-up items into the pockets (a full pocket gets their worth in Credit).
 */
function settle(p:LocalProfile,gains:Gains){
 for(const item of gains.items)if(!receiveItem(p.pockets,item.kind))gains.credit+=POCKETS_FULL_CREDIT;
 if(gains.credit)p.wallet.credit=Math.min(CREDIT_POLICY.maxBalance,p.wallet.credit+gains.credit);
}
const POCKETS_FULL_CREDIT=25;
const crateId=()=>'c'+Array.from(crypto.getRandomValues(new Uint8Array(9)),b=>b.toString(16).padStart(2,'0')).join('');
export interface AlphaWallet {credit:number;remainder:number;owned:string[];receipts:string[];testCredit:number;
 /** The one-time starter scooter has been claimed (claimStarter). Never resets. */
 starter:boolean;
 /** Phone-shop orders on their way: paid for, owned once delivered. */
 packages:Package[]}
/** A part ordered from the phone: already paid, delivered into the wallet at `arrives`. */
export interface Package {id:string;partId:string;variantId:string;price:number;ordered:number;arrives:number}
/** Phone orders are the same stock and price as the shop, delivered after a short wait. Tune here. */
export const DELIVERY={seconds:45,shopId:'techno_gravity',maxOpen:12};
export const CREDIT_POLICY={pointsPerCredit:100,maxBalance:10000000};
export const emptyWallet=():AlphaWallet=>({credit:0,remainder:0,owned:[],receipts:[],testCredit:0,starter:false,packages:[]});
/** Reward receipts only guard against the same event paying twice, which happens moments apart; the newest are enough. */
const RECEIPTS_KEPT=500;
export const ownershipKey=catalogKey;
export function owns(wallet:AlphaWallet,s:PartSelection){return ownsSelection(wallet,s);}
export function validWallet(value:any):AlphaWallet{
 const w=emptyWallet();if(!value)return w;
 for(const k of ['credit','remainder','testCredit'] as const)if(Number.isSafeInteger(value[k])&&value[k]>=0)w[k]=Math.min(value[k],CREDIT_POLICY.maxBalance);
 w.owned=Array.isArray(value.owned)?[...new Set<string>(value.owned.filter((s:any)=>typeof s==='string'))]:[];
 w.receipts=Array.isArray(value.receipts)?[...new Set<string>(value.receipts.filter((s:any)=>typeof s==='string'))].slice(-RECEIPTS_KEPT):[];
 w.starter=value.starter===true;
 w.packages=(Array.isArray(value.packages)?value.packages:[]).filter((p:any)=>p&&typeof p.id==='string'&&/^[a-z0-9-]{6,64}$/.test(p.id)&&catalogEntry(p.partId)?.variants.some(v=>v.id===p.variantId&&!v.exclusive)&&[p.price,p.ordered,p.arrives].every(n=>Number.isSafeInteger(n)&&n>=0))
  .slice(0,DELIVERY.maxOpen).map((p:any)=>({id:p.id,partId:p.partId,variantId:p.variantId,price:p.price,ordered:p.ordered,arrives:p.arrives}));
 return w;
}
/** Local alpha entitlement transaction. There is no paid balance or payment path. */
export class CreditEconomy {
 private queue=Promise.resolve();onChange=()=>{};
 /** Missions completed, levels gained and crates earned, as they happen. */
 onGains=(_gains:Gains)=>{};
 /** One transaction over the whole saved profile: wallet and progress together. */
 private update<T>(edit:(p:LocalProfile)=>T|string):Promise<T|string>{
  const run=()=>{const profile=loadProfile(),result=edit(profile);if(typeof result==='string')return result;
   if(!saveProfile(profile,true))return 'Saving failed — nothing was changed.';this.onChange();return result;};
  const operation=this.queue.then(()=>typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request('swf-alpha-wallet',run):run());
  this.queue=operation.then(()=>{},()=>{});return operation as Promise<T|string>;
 }
 /** Counts riding stats toward missions (and a map ridden); pays out whatever they complete. */
 async track(changes:Partial<Record<Stat,number>>,visit?:string,firsts:string[]=[],landed:Landed={}){
  const result=await this.update(p=>{
   if(visit&&!p.progress.visited.includes(visit))p.progress.visited.push(visit);
   if(visit)changes={...changes,maps:p.progress.visited.length};
   const gains=record(p.progress,changes,crateId,dayKey(),firsts,landed);
   settle(p,gains);return gains;});
  if(typeof result!=='string'&&(result.completed.length||result.levelsUp.length))this.onGains(result);
  return result;
 }
 /**
  * The one-time starter scooter: the chosen Lazer build (scooterParts.ts
  * validStarter) becomes owned and equipped, and nothing else does. The claim
  * is recorded in the same save, so a reload, another tab or a cloud copy can
  * never claim a second one.
  */
 claimStarter(build:unknown){return this.update<LocalProfile>(p=>{
  if(p.wallet.starter)return 'Your starter scooter is already built.';
  const scooter=validStarter(build);if(!scooter)return 'Pick one Lazer part for every slot.';
  for(const s of Object.values(scooter)){const key=catalogKey(s);if(!p.wallet.owned.includes(key))p.wallet.owned.push(key);}
  p.wallet.starter=true;p.scooter=scooter;p.activeRideable='scooter';p.equipmentRevision=(p.equipmentRevision??0)+1;return p;});}
 /**
  * Orders a part from the phone: charged now (today's deal price applies,
  * re-derived here), counted as a purchase, and delivered into the wallet
  * DELIVERY.seconds later by deliver(). Never a second order of the same colourway.
  */
 order(s:PartSelection,expected?:number,now=Date.now()){return this.update<{pkg:Package;gains:Gains}>(p=>{
  const w=p.wallet,part=catalogEntry(s.partId),variant=part?.variants.find(v=>v.id===s.variantId);
  if(!part||!variant||variant.exclusive||!shopStock(DELIVERY.shopId).includes(s.partId))return 'Product unavailable';
  if(owns(w,s))return 'Already owned';if(w.packages.some(k=>k.partId===s.partId&&k.variantId===s.variantId))return 'Already on its way';
  if(w.packages.length>=DELIVERY.maxOpen)return 'Too many packages on the way. Wait for a delivery.';
  const deal=dailyDeals(DELIVERY.shopId).find(d=>d.partId===s.partId&&d.variantId===s.variantId),price=deal?deal.price:part.creditPrice;
  if(expected!==undefined&&price>expected)return 'That deal just ended. The price is now '+price+' Credit.';if(w.credit+w.testCredit<price)return 'Not enough Credit';
  const test=Math.min(price,w.testCredit);w.testCredit-=test;w.credit-=price-test;
  const pkg={id:'pkg-'+crateId().slice(1,19),partId:s.partId,variantId:s.variantId,price,ordered:now,arrives:now+DELIVERY.seconds*1000};w.packages.push(pkg);
  const gains=record(p.progress,{purchases:1},crateId,dayKey());settle(p,gains);
  return {pkg,gains};}).then(r=>{if(typeof r!=='string'&&(r.gains.completed.length||r.gains.levelsUp.length))this.onGains(r.gains);return r;});}
 /** Delivers every package whose time has come; returns what arrived (nothing twice). */
 deliver(now=Date.now()){return this.update<Package[]>(p=>{
  const due=p.wallet.packages.filter(k=>k.arrives<=now);if(!due.length)return 'none';
  p.wallet.packages=p.wallet.packages.filter(k=>k.arrives>now);
  for(const k of due){const key=catalogKey(k);if(!p.wallet.owned.includes(key))p.wallet.owned.push(key);}
  return due;});}
 /** Opens one crate: never a duplicate, and the crate is gone once opened. */
 openCrate(id:string){return this.update<CrateResult>(p=>{
  const crate=p.progress.crates.find(c=>c.id===id);if(!crate)return 'That crate is already open.';
  const result=openCrate(crate,p.wallet.owned);
  p.progress.crates=p.progress.crates.filter(c=>c.id!==id);p.progress.stats.cratesOpened++;
  if(result.item)p.wallet.owned.push(ownershipKey(result.item));
  p.wallet.credit=Math.min(CREDIT_POLICY.maxBalance,p.wallet.credit+result.credit);return result;});}
 /** A purchase and the mission progress it makes, in one transaction. `edit` returns how many items it bought. */
 private purchase(edit:(w:AlphaWallet)=>number|string):Promise<string>{
  return this.update<Gains>(p=>{const bought=edit(p.wallet);if(typeof bought==='string')return bought;
   const gains=record(p.progress,{purchases:bought},crateId);settle(p,gains);return gains;})
   .then(r=>{if(typeof r==='string')return r;if(r.completed.length||r.levelsUp.length)this.onGains(r);return 'ok';});
 }
 private transact(edit:(w:AlphaWallet)=>string){
  const run=()=>{const profile=loadProfile(),w=structuredClone(profile.wallet),result=edit(w);
   if(result!=='ok')return result;profile.wallet=w;if(!saveProfile(profile,true))return 'Saving failed — nothing was charged or granted.';
   this.onChange();return 'ok';};
  const operation=this.queue.then(()=>typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request('swf-alpha-wallet',run):run());
  this.queue=operation.then(()=>{},()=>{});return operation;
 }
 reward(eventId:string,points:number){return this.transact(w=>{if(w.receipts.includes(eventId))return 'already recorded';if(!Number.isFinite(points)||points<=0)return 'no reward';
  const sum=w.remainder+Math.floor(points);w.credit=Math.min(CREDIT_POLICY.maxBalance,w.credit+Math.floor(sum/CREDIT_POLICY.pointsPerCredit));w.remainder=sum%CREDIT_POLICY.pointsPerCredit;w.receipts.push(eventId);return 'ok';});}
 /**
  * Buys one colourway. With `shopId`, today's deal price applies when the item
  * is one of that shop's deals (re-derived here, never taken from the caller);
  * `expected` guards against the price rising between showing it and buying.
  */
 buy(s:PartSelection,shopId?:string,expected?:number){return this.purchase(w=>{const part=catalogEntry(s.partId),variant=part?.variants.find(v=>v.id===s.variantId);if(!part||!variant||variant.exclusive)return 'Product unavailable';if(owns(w,s))return 'Already owned';if(w.packages.some(k=>k.partId===s.partId&&k.variantId===s.variantId))return 'Already on its way from your phone order';
  const deal=shopId?dailyDeals(shopId).find(d=>d.partId===s.partId&&d.variantId===s.variantId):undefined;
  const price=deal?deal.price:part.creditPrice;if(expected!==undefined&&price>expected)return 'That deal just ended. The price is now '+price+' Credit.';if(w.credit+w.testCredit<price)return 'Not enough Credit';
  const test=Math.min(price,w.testCredit);w.testCredit-=test;w.credit-=price-test;w.owned.push(ownershipKey(s));return 1;});}
 /** A complete Sometimes Summer board in one transaction; only missing parts are charged. */
 buyCompleteBoard(deckVariant:string){return this.purchase(w=>{
  const deck=LONGBOARD_PARTS.find(p=>p.category==='deck')!;if(!deck.variants.some(v=>v.id===deckVariant))return 'Product unavailable';
  const selections=completeBoardSelections(deckVariant,loadProfile().longboard);
  const {missing,price}=bundlePrice(selections,s=>ownsSelection(w,s));if(!missing.length)return 'Already owned';
  if(w.credit+w.testCredit<price)return 'Not enough Credit';
  const test=Math.min(price,w.testCredit);w.testCredit-=test;w.credit-=price-test;for(const s of missing)w.owned.push(catalogKey(s));return missing.length;});}
 equip(s:PartSelection,expectedRevision:number){
  const run=()=>{const profile=loadProfile();if((profile.equipmentRevision??0)!==expectedRevision)return {error:'Your setup changed in another tab. Reopen the menu and retry.'};
   const part=catalogEntry(s.partId);if(!part?.variants.some(v=>v.id===s.variantId)||!owns(profile.wallet,s))return {error:'You do not own this colorway.'};
   // Compatibility is by rideable: a board part only ever fills a board slot.
   if(part.rideable==='longboard')profile.longboard[part.category as LongboardCategory]={...s};
   else if(part.category==='wheels'){profile.scooter.frontWheel={...s};profile.scooter.rearWheel={...s};}else (profile.scooter as Record<string,PartSelection>)[part.category]={...s};
   profile.equipmentRevision=expectedRevision+1;if(!saveProfile(profile))return {error:'Could not save. Your equipped setup is unchanged.'};return {profile};};
  const op=this.queue.then(()=>typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request('swf-alpha-wallet',run):run());this.queue=op.then(()=>{},()=>{});
  // Equipping anything counts for the "Customize your ride" Starter mission.
  return op.then(r=>{if(r.profile)void this.track({},undefined,['customize']);return r;});
 }
 /** Switches the ridden rideable without touching either saved build. */
 setRideable(kind:'scooter'|'longboard',expectedRevision:number){
  const run=()=>{const profile=loadProfile();if((profile.equipmentRevision??0)!==expectedRevision)return {error:'Your setup changed in another tab. Reopen the menu and retry.'};
   if(kind==='longboard'&&!ownsBoard(profile.wallet,profile.longboard))return {error:'Own a complete Sometimes Summer board first.'};
   profile.activeRideable=kind;profile.equipmentRevision=expectedRevision+1;if(!saveProfile(profile))return {error:'Could not save. Your rideable is unchanged.'};return {profile};};
  const op=this.queue.then(()=>typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request('swf-alpha-wallet',run):run());this.queue=op.then(()=>{},()=>{});return op;
 }
 setTestCredit(amount:number,owner:boolean){if(!owner)return Promise.resolve('Owner access required');return this.transact(w=>{w.testCredit=Math.max(0,Math.min(CREDIT_POLICY.maxBalance,Math.floor(amount)||0));return 'ok';});}
}
