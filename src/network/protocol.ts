import {PARTS,CATEGORIES} from '../data/scooterParts';
import {RIDERS} from '../data/riders';
import {CLOTHING} from '../data/outfits';
export const PROTOCOL=1,CONTENT='swf-2026-09-sesh-1';
export function appearance(value:any){
 if(!value||!RIDERS.some(r=>r.id===value.riderId)||!['skinny','regular','chunky'].includes(value.bodyBuild))return null;
 const outfit:any={};for(const slot of ['head','top','bottom','shoes']){if(!CLOTHING.some(c=>c.category===slot&&c.id===value.outfit?.[slot]))return null;outfit[slot]=value.outfit[slot];}
 const scooter:any={};for(const slot of [...CATEGORIES.filter(c=>c!=='wheels'),'frontWheel','rearWheel']){const category=slot.includes('Wheel')?'wheels':slot;const fallback=PARTS.find(p=>p.category===category);/* Griptape arrived later: a peer without it gets the default sheet. */const item=value.scooter?.[slot]??(category==='griptape'&&fallback?{partId:fallback.id,variantId:fallback.variants[0].id}:undefined);if(!PARTS.some(p=>p.id===item?.partId&&p.category===category&&p.variants.some(v=>v.id===item.variantId)))return null;scooter[slot]={partId:item.partId,variantId:item.variantId};}
 return {riderId:value.riderId,bodyBuild:value.bodyBuild,outfit,scooter};
}
// Render state only. No wallet, ownership, scripts, URLs or claimed sender ID.
export const POSE_KEYS=['airWeight','bodyFlip','charge','compression','crash','dropIn','elapsed','emote','fastplant','getUpTimer','grounded','heldItem','landTimer','landingCompression','manual','pitch','popTimer','position','pushTimer','rampLean','roll','running','sitting','speed','state','steer','tricks','walking','yaw'] as const;
export function pose(value:any){
 if(!value||typeof value!=='object'||!Array.isArray(value.position)||value.position.length!==3)return null;
 let count=0;const valid=(v:any,depth=0):boolean=>{if(++count>600||depth>6)return false;if(v===null||typeof v==='boolean')return true;if(typeof v==='number')return Number.isFinite(v)&&Math.abs(v)<=100000;if(typeof v==='string')return v.length<=64;if(Array.isArray(v))return v.length<=20&&v.every(x=>valid(x,depth+1));if(typeof v==='object')return Object.keys(v).length<=40&&Object.entries(v).every(([k,x])=>!['__proto__','constructor','prototype'].includes(k)&&valid(x,depth+1));return false;};
 const numeric=(o:any,keys:string[])=>o&&keys.every(k=>typeof o[k]==='number'&&Number.isFinite(o[k]));
 if(!numeric(value,['yaw','pitch','roll','speed','elapsed','charge','compression','getUpTimer','landTimer','landingCompression','popTimer','pushTimer','rampLean','steer'])||!numeric(value.bodyFlip,['angle','velocity'])||!numeric(value.airWeight,['shift'])||!numeric(value.manual,['pitch'])||!value.dropIn||!value.tricks)return null;
 for(const k of ['deck','bars','bri','kickless'])if(!numeric(value.tricks[k],['angle','velocity','mismatch']))return null;
 if(!['regular','goofy'].includes(value.tricks.stance)||!numeric(value.tricks,['naturalDirection','poseBlend','poseSide','fingerTime','fingerHand']))return null;
 if(value.fastplant&&(!numeric(value.fastplant,['time'])||!Array.isArray(value.fastplant.foot)||value.fastplant.foot.length!==3||!value.fastplant.foot.every((n:any)=>typeof n==='number'&&Number.isFinite(n))||typeof value.fastplant.launched!=='boolean'))return null;
 if(value.emote&&!numeric(value.emote,['time','duration']))return null;
 if(value.emote&&!['wave','nod','shake','point','clap','celebrate','sit','laugh','facepalm','drink','eat','drink-fountain','vend','place'].includes(value.emote.id))return null;
 if(value.crash&&(!numeric(value.crash,['age','rest'])||!['rider','scooter'].every(k=>numeric(value.crash[k]?.position,['x','y','z'])&&numeric(value.crash[k]?.rotation,['x','y','z','w']))))return null;
 if(!valid(value)||!value.position.every((n:any)=>typeof n==='number'&&Number.isFinite(n)))return null;
 if(!['Grounded','Airborne','Walking','Bail','Manual','Grinding','Fakie','Stall','Riding','Pushing','Charging','Preloading','NoseManual','Landing','SketchyLanding','Sitting','DropInReady','DropInCommit'].includes(value.state))return null;
 return Object.fromEntries(POSE_KEYS.filter(k=>k in value).map(k=>[k,value[k]]));
}
