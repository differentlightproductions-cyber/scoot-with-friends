import {loadProfile,saveProfile} from './loadout';
import {type PartSelection} from './scooterParts';
import {catalogEntry,ownershipKey as catalogKey,ownsSelection,ownsBoard,bundlePrice,completeBoardSelections} from './catalog';
import {LONGBOARD_PARTS,type LongboardCategory} from './longboardParts';
export interface AlphaWallet {credit:number;remainder:number;owned:string[];receipts:string[];testCredit:number}
export const CREDIT_POLICY={pointsPerCredit:100,maxBalance:10000000};
export const emptyWallet=():AlphaWallet=>({credit:0,remainder:0,owned:[],receipts:[],testCredit:0});
export const ownershipKey=catalogKey;
export function owns(wallet:AlphaWallet,s:PartSelection){return ownsSelection(wallet,s);}
export function validWallet(value:any):AlphaWallet{
 const w=emptyWallet();if(!value)return w;
 for(const k of ['credit','remainder','testCredit'] as const)if(Number.isSafeInteger(value[k])&&value[k]>=0)w[k]=Math.min(value[k],CREDIT_POLICY.maxBalance);
 w.owned=Array.isArray(value.owned)?[...new Set<string>(value.owned.filter((s:any)=>typeof s==='string'))]:[];
 w.receipts=Array.isArray(value.receipts)?[...new Set<string>(value.receipts.filter((s:any)=>typeof s==='string'))]:[];return w;
}
/** Local alpha entitlement transaction. There is no paid balance or payment path. */
export class CreditEconomy {
 private queue=Promise.resolve();onChange=()=>{};
 private transact(edit:(w:AlphaWallet)=>string){
  const run=()=>{const profile=loadProfile(),w=structuredClone(profile.wallet),result=edit(w);
   if(result!=='ok')return result;profile.wallet=w;if(!saveProfile(profile,true))return 'Saving failed — nothing was charged or granted.';
   this.onChange();return 'ok';};
  const operation=this.queue.then(()=>typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request('swf-alpha-wallet',run):run());
  this.queue=operation.then(()=>{},()=>{});return operation;
 }
 reward(eventId:string,points:number){return this.transact(w=>{if(w.receipts.includes(eventId))return 'already recorded';if(!Number.isFinite(points)||points<=0)return 'no reward';
  const sum=w.remainder+Math.floor(points);w.credit=Math.min(CREDIT_POLICY.maxBalance,w.credit+Math.floor(sum/CREDIT_POLICY.pointsPerCredit));w.remainder=sum%CREDIT_POLICY.pointsPerCredit;w.receipts.push(eventId);return 'ok';});}
 buy(s:PartSelection){return this.transact(w=>{const part=catalogEntry(s.partId);if(!part?.variants.some(v=>v.id===s.variantId))return 'Product unavailable';if(owns(w,s))return 'Already owned';
  const price=part.creditPrice;if(w.credit+w.testCredit<price)return 'Not enough Credit';
  const test=Math.min(price,w.testCredit);w.testCredit-=test;w.credit-=price-test;w.owned.push(ownershipKey(s));return 'ok';});}
 /** A complete Sometimes Summer board in one transaction; only missing parts are charged. */
 buyCompleteBoard(deckVariant:string){return this.transact(w=>{
  const deck=LONGBOARD_PARTS.find(p=>p.category==='deck')!;if(!deck.variants.some(v=>v.id===deckVariant))return 'Product unavailable';
  const selections=completeBoardSelections(deckVariant,loadProfile().longboard);
  const {missing,price}=bundlePrice(selections,s=>ownsSelection(w,s));if(!missing.length)return 'Already owned';
  if(w.credit+w.testCredit<price)return 'Not enough Credit';
  const test=Math.min(price,w.testCredit);w.testCredit-=test;w.credit-=price-test;for(const s of missing)w.owned.push(catalogKey(s));return 'ok';});}
 equip(s:PartSelection,expectedRevision:number){
  const run=()=>{const profile=loadProfile();if((profile.equipmentRevision??0)!==expectedRevision)return {error:'Your setup changed in another tab. Reopen the menu and retry.'};
   const part=catalogEntry(s.partId);if(!part?.variants.some(v=>v.id===s.variantId)||!owns(profile.wallet,s))return {error:'You do not own this colorway.'};
   // Compatibility is by rideable: a board part only ever fills a board slot.
   if(part.rideable==='longboard')profile.longboard[part.category as LongboardCategory]={...s};
   else if(part.category==='wheels'){profile.scooter.frontWheel={...s};profile.scooter.rearWheel={...s};}else (profile.scooter as Record<string,PartSelection>)[part.category]={...s};
   profile.equipmentRevision=expectedRevision+1;if(!saveProfile(profile))return {error:'Could not save. Your equipped setup is unchanged.'};return {profile};};
  const op=this.queue.then(()=>typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request('swf-alpha-wallet',run):run());this.queue=op.then(()=>{},()=>{});return op;
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
