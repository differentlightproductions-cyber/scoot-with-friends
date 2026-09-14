import {loadProfile,saveProfile} from './loadout';
import {PARTS,type PartSelection} from './scooterParts';
export interface AlphaWallet {credit:number;remainder:number;owned:string[];receipts:string[];testCredit:number}
export const CREDIT_POLICY={pointsPerCredit:100,maxBalance:10000000};
export const emptyWallet=():AlphaWallet=>({credit:0,remainder:0,owned:[],receipts:[],testCredit:0});
export const ownershipKey=(s:PartSelection)=>s.partId+':'+s.variantId;
export function owns(wallet:AlphaWallet,s:PartSelection){return PARTS.find(p=>p.id===s.partId)?.unlockType==='free'||wallet.owned.includes(ownershipKey(s));}
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
 buy(s:PartSelection){return this.transact(w=>{const part=PARTS.find(p=>p.id===s.partId);if(!part?.variants.some(v=>v.id===s.variantId))return 'Product unavailable';if(owns(w,s))return 'Already owned';
  const price=part.creditPrice??0;if(w.credit+w.testCredit<price)return 'Not enough Credit';
  const test=Math.min(price,w.testCredit);w.testCredit-=test;w.credit-=price-test;w.owned.push(ownershipKey(s));return 'ok';});}
 setTestCredit(amount:number,owner:boolean){if(!owner)return Promise.resolve('Owner access required');return this.transact(w=>{w.testCredit=Math.max(0,Math.min(CREDIT_POLICY.maxBalance,Math.floor(amount)||0));return 'ok';});}
}
