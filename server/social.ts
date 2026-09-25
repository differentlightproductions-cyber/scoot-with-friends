import {createHash,randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import type {WebSocket} from 'ws';

const idPattern=/^[a-f0-9]{64}$/;
const namePattern=/^[\p{L}\p{N} _-]{1,24}$/u;
export const friendIdForCredential=(credential:unknown)=>typeof credential==='string'&&idPattern.test(credential)?createHash('sha256').update(credential,'hex').digest('hex'):null;

type Person={id:string;name:string;friends:Set<string>;requests:Set<string>};
type Invite={id:string;from:string;to:string;code:string;generation:string;expiresAt:number};
type StoredPerson={id:string;name:string;friends:string[];requests:string[]};
type SocialOptions={file?:string;send:(ws:WebSocket|null,message:any)=>void;inviteActive:(invite:Invite)=>boolean};

export function createSocial({file,send,inviteActive}:SocialOptions){
 const people=new Map<string,Person>(),sockets=new Map<string,WebSocket>(),identities=new WeakMap<WebSocket,string>(),invites=new Map<string,Invite>();
 const attempts=new Map<string,{at:number;n:number}>();
 if(file&&existsSync(file)){
  const stored=JSON.parse(readFileSync(file,'utf8')) as {people?:StoredPerson[]};
  if(!Array.isArray(stored.people)||stored.people.length>5000)throw Error('Invalid room social file.');
  for(const p of stored.people)if(idPattern.test(p.id)&&namePattern.test(p.name))people.set(p.id,{id:p.id,name:p.name,friends:new Set((p.friends??[]).filter(id=>idPattern.test(id)).slice(0,64)),requests:new Set((p.requests??[]).filter(id=>idPattern.test(id)).slice(0,64))});
 }
 const save=()=>{if(!file)return;mkdirSync(dirname(file),{recursive:true});const temp=file+'.'+process.pid+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify({version:1,people:[...people.values()].map(p=>({id:p.id,name:p.name,friends:[...p.friends],requests:[...p.requests]}))}));renameSync(temp,file);};
 if(file&&!existsSync(file))save();
 const isOnline=(id:string)=>sockets.get(id)?.readyState===1;
 const view=(id:string)=>{const p=people.get(id);return {id,name:p?.name??'Rider'};};
 const state=(id:string)=>{
  const p=people.get(id)!;
  const outgoing=[...people.values()].filter(other=>other.requests.has(id)).slice(0,64).map(other=>view(other.id));
  const now=Date.now();
  return {type:'social-state',friendId:id,name:p.name,persistent:!!file,friends:[...p.friends].filter(fid=>people.has(fid)).map(fid=>({...view(fid),online:isOnline(fid)})),requests:[...p.requests].filter(fid=>people.has(fid)).map(view),outgoing,invites:[...invites.values()].filter(i=>i.to===id&&i.expiresAt>now&&inviteActive(i)).map(i=>({id:i.id,from:i.from,name:view(i.from).name,expiresAt:i.expiresAt}))};
 };
 const refresh=(...ids:string[])=>{for(const id of new Set(ids)){const ws=sockets.get(id);if(ws)send(ws,state(id));}};
 const error=(ws:WebSocket,message:string)=>send(ws,{type:'social-error',message});
 const limit=(id:string,max:number)=>{const now=Date.now();let item=attempts.get(id);if(!item||now-item.at>60000){item={at:now,n:0};attempts.set(id,item);}return ++item.n<=max;};
 const cleanupInvites=()=>{const now=Date.now();for(const [id,i]of invites)if(i.expiresAt<=now||!inviteActive(i))invites.delete(id);};
 function auth(ws:WebSocket,m:any){
  const id=friendIdForCredential(m.credential),name=typeof m.name==='string'?m.name.trim():'';
  if(!id||!namePattern.test(name)){error(ws,'Check your guest name or social credential.');return false;}
  let p=people.get(id);if(!p){if(people.size>=5000){error(ws,'Social service full.');return false;}p={id,name,friends:new Set(),requests:new Set()};people.set(id,p);save();}
  else if(p.name!==name){p.name=name;save();}
  sockets.get(id)?.close(4001,'Replaced social connection');sockets.set(id,ws);identities.set(ws,id);cleanupInvites();
  refresh(id,...p.friends);return true;
 }
 function disconnect(ws:WebSocket){const id=identities.get(ws);if(!id||sockets.get(id)!==ws)return;sockets.delete(id);refresh(...(people.get(id)?.friends??[]));}
 function handle(ws:WebSocket,m:any){
  const id=identities.get(ws);if(!id||sockets.get(id)!==ws)return;
  const p=people.get(id)!;
  if(m.type==='social-name'){
   const name=typeof m.name==='string'?m.name.trim():'';if(!namePattern.test(name)){error(ws,'Check your guest name.');return;}
   if(p.name!==name){p.name=name;save();refresh(id,...p.friends,...[...people.values()].filter(other=>other.requests.has(id)||p.requests.has(other.id)).map(other=>other.id));}return;
  }
  if(m.type==='friend-request'){
   const target=people.get(m.friendId);if(!target||target.id===id){error(ws,'Friend code not found.');return;}
   if(p.friends.has(target.id)){error(ws,'Already friends.');return;}
   if(target.requests.size>=64||[...people.values()].filter(other=>other.requests.has(id)).length>=64||!limit(id,10)){error(ws,'Friend request limit reached.');return;}
   target.requests.add(id);save();refresh(id,target.id);return;
  }
  if(m.type==='friend-accept'){
   const target=people.get(m.friendId);if(!target||!p.requests.has(target.id)){error(ws,'Friend request unavailable.');return;}
   if(p.friends.size>=64||target.friends.size>=64){error(ws,'Friend list full.');return;}
   p.requests.delete(target.id);target.requests.delete(id);p.friends.add(target.id);target.friends.add(id);save();refresh(id,target.id);return;
  }
  if(m.type==='friend-decline'||m.type==='friend-remove'){
   const target=people.get(m.friendId);if(!target)return;
   p.requests.delete(target.id);target.requests.delete(id);
   if(m.type==='friend-remove'){p.friends.delete(target.id);target.friends.delete(id);for(const [inviteId,i]of invites)if(i.from===id&&i.to===target.id||i.from===target.id&&i.to===id)invites.delete(inviteId);}
   save();refresh(id,target.id);return;
  }
  if(m.type==='invite-accept'||m.type==='invite-decline'){
   cleanupInvites();const i=invites.get(m.id);if(!i||i.to!==id){error(ws,'Invite unavailable.');return;}
   invites.delete(i.id);if(m.type==='invite-accept'){
    if(!p.friends.has(i.from)||!isOnline(i.from)||!inviteActive(i)){error(ws,'Invite expired or room unavailable.');refresh(id);return;}
    send(ws,{type:'invite-accepted',code:i.code,from:i.from,name:view(i.from).name});
   }
   refresh(id);return;
  }
  error(ws,'Unknown social action.');
 }
 function invite(from:string,to:string,code:string,generation:string){
  const p=people.get(from),target=people.get(to),ws=sockets.get(from);
  if(!p||!target||!p.friends.has(to)||!target.friends.has(from))return 'Only friends can be invited.';
  if(!limit('invite:'+from,6))return 'Invite limit reached.';
  cleanupInvites();if([...invites.values()].filter(i=>i.to===to).length>=10)return 'Too many pending invites.';
  const i={id:randomUUID(),from,to,code,generation,expiresAt:Date.now()+300000};if(!inviteActive(i))return 'Room unavailable for invite.';invites.set(i.id,i);refresh(to);send(ws??null,{type:'invite-sent',friendId:to});return null;
 }
 return {auth,handle,disconnect,invite,isAuthed:(ws:WebSocket)=>identities.has(ws),isOnline,close:()=>{sockets.clear();invites.clear();},persistent:!!file};
}
