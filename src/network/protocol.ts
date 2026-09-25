import {PARTS,CATEGORIES} from '../data/scooterParts';
import {sanitizeAvatar} from '../avatar/config';
import {validLongboard} from '../data/longboardParts';
export const PROTOCOL=2,CONTENT='swf-2026-09-room-build-2';
export function appearance(value:any){
 if(!value||typeof value!=='object')return null;
 // The rider is only a small configuration; anything unknown falls back to the default rider.
 const avatar=sanitizeAvatar(value.avatar);
 const scooter:any={};for(const slot of [...CATEGORIES.filter(c=>c!=='wheels'),'frontWheel','rearWheel']){const category=slot.includes('Wheel')?'wheels':slot;const fallback=PARTS.find(p=>p.category===category);/* Griptape arrived later: a peer without it gets the default sheet. */const item=value.scooter?.[slot]??(category==='griptape'&&fallback?{partId:fallback.id,variantId:fallback.variants[0].id}:undefined);if(!PARTS.some(p=>p.id===item?.partId&&p.category===category&&p.variants.some(v=>v.id===item.variantId)))return null;scooter[slot]={partId:item.partId,variantId:item.variantId};}
 // Which rideable others see, and the board they see it as. Cosmetic only.
 const rideable=(value.rideable??value.activeRideable)==='longboard'?'longboard':'scooter';
 return {avatar,scooter,rideable,longboard:validLongboard(value.longboard)};
}
// Render state only. No wallet, ownership, scripts, URLs or claimed sender ID.
export const POSE_KEYS=['airWeight','board','rideable','bodyFlip','charge','compression','crash','diveFlip','dropIn','elapsed','emote','fastplant','flipRoll0','flipYaw0','getUpTimer','grinding','grounded','heldItem','jumpOn','landTimer','landingCompression','mantle','manual','pitch','popTimer','position','pushTimer','rampLean','roll','running','sitting','speed','state','steer','swim','tricks','walking','yaw'] as const;
export function pose(value:any){
 if(!value||typeof value!=='object'||!Array.isArray(value.position)||value.position.length!==3)return null;
 let count=0;const valid=(v:any,depth=0):boolean=>{if(++count>600||depth>6)return false;if(v===null||typeof v==='boolean')return true;if(typeof v==='number')return Number.isFinite(v)&&Math.abs(v)<=100000;if(typeof v==='string')return v.length<=64;if(Array.isArray(v))return v.length<=20&&v.every(x=>valid(x,depth+1));if(typeof v==='object')return Object.keys(v).length<=40&&Object.entries(v).every(([k,x])=>!['__proto__','constructor','prototype'].includes(k)&&valid(x,depth+1));return false;};
 const numeric=(o:any,keys:string[])=>o&&keys.every(k=>typeof o[k]==='number'&&Number.isFinite(o[k]));
 if(!numeric(value,['yaw','pitch','roll','speed','elapsed','charge','compression','getUpTimer','landTimer','landingCompression','popTimer','pushTimer','rampLean','steer'])||!numeric(value.bodyFlip,['angle','velocity'])||!numeric(value.airWeight,['shift'])||!numeric(value.manual,['pitch'])||!value.dropIn||!value.tricks)return null;
 for(const k of ['deck','bars','bri','kickless'])if(!numeric(value.tricks[k],['angle','velocity','mismatch']))return null;
 if(value.tricks.decade!==undefined&&!numeric(value.tricks.decade,['angle','velocity','mismatch']))return null;
 if(!['regular','goofy'].includes(value.tricks.stance)||!numeric(value.tricks,['naturalDirection','poseBlend','poseSide','fingerTime','fingerHand']))return null;
 if(value.fastplant&&(!numeric(value.fastplant,['time'])||!Array.isArray(value.fastplant.foot)||value.fastplant.foot.length!==3||!value.fastplant.foot.every((n:any)=>typeof n==='number'&&Number.isFinite(n))||typeof value.fastplant.launched!=='boolean'))return null;
 if(value.rideable!==undefined&&!['scooter','longboard'].includes(value.rideable))return null;
 if(value.board!==undefined&&(typeof value.board!=='object'||!Object.values(value.board).every(n=>typeof n==='number'&&Number.isFinite(n))))return null;
 if(value.emote&&!numeric(value.emote,['time','duration']))return null;
 if(value.emote&&!['wave','nod','shake','point','clap','celebrate','sit','laugh','facepalm','cheer','shrug','drink','eat','drink-fountain','vend','place'].includes(value.emote.id))return null;
 if(value.crash&&(!numeric(value.crash,['age','rest'])||!['rider','scooter'].every(k=>numeric(value.crash[k]?.position,['x','y','z'])&&numeric(value.crash[k]?.rotation,['x','y','z','w']))))return null;
 if(value.flipYaw0!==undefined&&typeof value.flipYaw0!=='number'||value.flipRoll0!==undefined&&typeof value.flipRoll0!=='number'||value.jumpOn!==undefined&&typeof value.jumpOn!=='boolean'||value.grinding!==undefined&&typeof value.grinding!=='boolean')return null;
 if(value.swim&&(!numeric(value.swim,['time','stroke','speed'])||(value.swim.out!==null&&value.swim.out!==undefined)))return null;
 if(value.diveFlip&&(!numeric(value.diveFlip,['angle','side','twist','dir','sideDir','twistDir'])||!['dir','sideDir','twistDir'].every(k=>[-1,0,1].includes(value.diveFlip[k]))))return null;
 if(value.mantle&&(!['vault','mantle','climb'].includes(value.mantle.kind)||!numeric(value.mantle,['time','duration'])||!['edge','forward'].every(k=>Array.isArray(value.mantle[k])&&value.mantle[k].length===3&&value.mantle[k].every((n:any)=>typeof n==='number'&&Number.isFinite(n)))))return null;
 if(!valid(value)||!value.position.every((n:any)=>typeof n==='number'&&Number.isFinite(n)))return null;
 if(!['Grounded','Airborne','Walking','Bail','Manual','Grinding','Fakie','Stall','Riding','Pushing','Charging','Preloading','NoseManual','Landing','SketchyLanding','Sitting','DropInReady','DropInCommit'].includes(value.state))return null;
 return Object.fromEntries(POSE_KEYS.filter(k=>k in value).map(k=>[k,value[k]]));
}
