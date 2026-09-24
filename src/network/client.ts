import {activeLayout} from '../editor/layout';
﻿import * as THREE from 'three';
import {RiderModel} from '../scooter/model';
import type {Simulation} from '../physics/simulation';
import type {LocalProfile} from '../data/loadout';
import {PROTOCOL,CONTENT,POSE_KEYS} from './protocol';
const pick=(v:any,keys:string[])=>Object.fromEntries(keys.map(k=>[k,v[k]]));
export function capture(s:Simulation){
 const p:any={};for(const k of POSE_KEYS)if(typeof s[k as keyof Simulation]==='number'||typeof s[k as keyof Simulation]==='boolean'||typeof s[k as keyof Simulation]==='string')p[k]=s[k as keyof Simulation];
 Object.assign(p,{position:s.position.toArray(),airWeight:{shift:s.airWeight.shift},bodyFlip:pick(s.bodyFlip,['active','angle','velocity']),manual:pick(s.manual,['active','pitch','nose']),dropIn:pick(s.dropIn,['phase','lean']),emote:s.emote,heldItem:s.heldItem,sitting:s.sitting?{id:s.sitting.id}:null,fastplant:s.fastplant?{time:s.fastplant.time,foot:s.fastplant.foot.toArray(),launched:s.fastplant.launched}:null});
 p.board=pick(s.board,['lean','slide','slideSide','tuck','brake','pushTimer','travel','surfaceRoll']);
 p.tricks=pick(s.tricks,['stance','naturalDirection','quarterAir','yaw','visualPose','poseBlend','poseSide','fingerTime','fingerHand']);
 for(const k of ['deck','bars','bri','kickless','decade'] as const)p.tricks[k]={...pick(s.tricks[k],['angle','velocity','mismatch']),reversals:[],reversalAge:s.tricks[k].reversalAge??1};
 p.crash=s.crash?{age:s.crash.age,rest:s.crash.rest,rider:{position:s.crash.rider.translation(),rotation:s.crash.rider.rotation()},scooter:{position:s.crash.scooter.translation(),rotation:s.crash.scooter.rotation()}}:null;
 return JSON.parse(JSON.stringify(p));
}
type Remote={model:RiderModel;name:string;label:HTMLDivElement;samples:{at:number;state:any}[];appearance:string;chat:string;chatUntil:number};
export class FreeRide {
 badge=document.createElement('div');ws:WebSocket|null=null;id='';code='';secret='';generation='';owner='';locked=false;status='Solo';lastError='';roster:any[]=[];remotes=new Map<string,Remote>();muted=new Set<string>();
 map='outdoor';loadMap=async(_map:string)=>{};prepare=async()=>{};onChange=()=>{};onLost=()=>{};onJoined=()=>{};seq=0;private timer:number;private intentional=false;private retryUntil=0;
 constructor(private scene:THREE.Scene,private profile:LocalProfile,private sim:()=>Simulation){this.badge.className='network-status';this.badge.hidden=true;document.body.append(this.badge);try{const saved=JSON.parse(sessionStorage.getItem('swf-room-resume')||'null');if(saved?.endpoint===this.endpoint){this.secret=saved.secret;this.code=saved.code;}}catch{}this.timer=window.setInterval(()=>{if(this.status==='Connected'&&!document.hidden)this.send({type:'pose',seq:++this.seq,generation:this.generation,pose:capture(this.sim())});},50);}
 get lan(){return ['127.0.0.1','localhost'].includes(location.hostname)&&(window as any).__SWF_LAN__===true;}
 get endpoint(){return this.lan?'ws://'+location.host+'/lan-room':import.meta.env.VITE_ROOM_SERVER_URL||(import.meta.env.DEV?'ws://127.0.0.1:8787':'');}
 send(value:any){if(this.ws?.readyState===WebSocket.OPEN&&this.ws.bufferedAmount<65536)this.ws.send(JSON.stringify(value));}
 private async revision(){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(activeLayout??null)));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
 async changeMap(map:string){if(this.owner!==this.id){this.lastError='Only the room owner can choose a destination.';this.onChange();return;}if(!['outdoor','techno_gravity','b_hill'].includes(map)){this.lastError='Warehouse rooms are not ready yet.';this.onChange();return;}this.status='Loading';this.onLost();await this.loadMap(map);this.send({type:'map',map,mapRevision:await this.revision()});}
 private async receiveMap(m:any){this.status='Loading';this.generation=m.generation;this.map=m.map;this.clear();this.onLost();try{await this.loadMap(m.map);this.send({type:'ready',generation:m.generation,mapRevision:await this.revision()});}catch{this.lastError='Could not load the room destination. Leave and retry.';this.onChange();}}
 async connect(mode:'create'|'join'|'resume',name='Rider',code=''){
  if(mode!=='resume')await this.prepare();
  const mapRevision=await this.revision();
  if(!this.endpoint){this.status='Online server not configured. Solo is available.';this.onChange();return;}
  this.intentional=false;this.status=mode==='resume'?'Reconnecting':'Connecting';this.onChange();const ws=this.ws=new WebSocket(this.endpoint);
  ws.onopen=()=>this.send({type:mode,mapRevision,protocol:PROTOCOL,content:CONTENT,name,code:mode==='resume'?this.code:code,secret:mode==='resume'?this.secret:undefined,appearance:this.profile});
  ws.onmessage=e=>{if(this.ws!==ws)return;let m;try{m=JSON.parse(e.data);}catch{return;}
   if(m.type==='welcome'){this.id=m.id;this.secret=m.secret;this.code=m.code;this.generation=m.generation;this.status='Connected';this.retryUntil=0;try{sessionStorage.setItem('swf-room-resume',JSON.stringify({endpoint:this.endpoint,secret:this.secret,code:this.code}));}catch{}if(m.map!=='outdoor'||this.map!==m.map){void this.receiveMap(m);}else this.onJoined();}
   if(m.type==='map')void this.receiveMap(m);
   if(m.type==='ready'&&m.generation===this.generation){this.status='Connected';this.onJoined();}
   if(m.type==='error'){this.lastError=m.message;if(!this.id)this.status=m.message;this.onChange();return;}
   if(m.type==='roster'){this.owner=m.owner;this.locked=m.locked;this.roster=m.players;for(const info of m.players){if(info.id===this.id)continue;let remote=this.remotes.get(info.id);if(!remote){const model=new RiderModel(this.scene),label=document.createElement('div');label.className='remote-name';document.body.append(label);remote={model,name:info.name,label,samples:[],appearance:'',chat:'',chatUntil:0};this.remotes.set(info.id,remote);}const key=JSON.stringify(info.appearance);if(remote.appearance!==key){remote.model.applyProfile({...structuredClone(this.profile),...info.appearance,activeRideable:info.appearance.rideable??'scooter',longboard:info.appearance.longboard??structuredClone(this.profile.longboard)});remote.appearance=key;}}
    for(const [id]of this.remotes)if(!m.players.some((p:any)=>p.id===id))this.remove(id);
   }
   if(m.type==='snapshot'&&m.generation===this.generation){const at=performance.now();for(const p of m.players){const r=this.remotes.get(p.id);if(!r)continue;const last=r.samples.at(-1);if(last&&new THREE.Vector3(...p.pose.position).distanceTo(new THREE.Vector3(...last.state.position))>8)r.samples=[];r.samples.push({at,state:p.pose});if(r.samples.length>8)r.samples.shift();}}
   if(m.type==='chat'&&!this.muted.has(m.id)){const r=this.remotes.get(m.id);if(r){r.chat=m.message;r.chatUntil=performance.now()+5000;}}
   if(m.type!=='snapshot')this.onChange();
  };
  ws.onclose=e=>{if(this.ws!==ws)return;this.onLost();if(this.intentional||[4001,4003].includes(e.code)){this.status='Disconnected';this.clear();}else if(this.secret){this.retryUntil||=Date.now()+30000;if(Date.now()<this.retryUntil){this.status='Reconnecting';window.setTimeout(()=>{if(!this.intentional)this.connect('resume');},1000);}else{this.status='Disconnected';this.clear();}}else this.status='Disconnected';this.onChange();};
 }
 leave(){this.intentional=true;this.send({type:'leave'});this.ws?.close();this.ws=null;this.clear();this.status='Solo';this.secret=this.code=this.id='';try{sessionStorage.removeItem('swf-room-resume');}catch{}this.onChange();}
 private remove(id:string){const r=this.remotes.get(id);if(!r)return;r.model.dispose();r.label.remove();this.remotes.delete(id);}
 private clear(){for(const id of this.remotes.keys())this.remove(id);this.roster=[];}
 render(camera:THREE.Camera,dt:number){this.badge.hidden=this.status==='Solo';this.badge.textContent=this.status+(this.status==='Connected'?' / '+this.roster.length+' riders':'');const target=performance.now()-100;for(const r of this.remotes.values()){
   while(r.samples.length>2&&r.samples[1].at<=target)r.samples.shift();const a=r.samples[0],b=r.samples[1]??a;if(!a){r.model.root.visible=false;continue;}r.model.root.visible=true;
   const t=THREE.MathUtils.clamp((target-a.at)/Math.max(1,b.at-a.at),0,1),p=structuredClone(t<.5?a.state:b.state);
   for(const key of ['yaw','pitch','roll','elapsed'])p[key]=THREE.MathUtils.lerp(a.state[key],b.state[key],t);
   for(const k of ['angle','velocity'])p.bodyFlip[k]=THREE.MathUtils.lerp(a.state.bodyFlip[k],b.state.bodyFlip[k],t);
   for(const channel of ['deck','bars','bri','kickless','decade'])for(const k of ['angle','velocity'])if(a.state.tricks[channel]&&b.state.tricks[channel])p.tricks[channel][k]=THREE.MathUtils.lerp(a.state.tricks[channel][k],b.state.tricks[channel][k],t);
   p.position=new THREE.Vector3().fromArray(a.state.position).lerp(new THREE.Vector3().fromArray(b.state.position),t);p.previousPosition=p.position;p.previousYaw=p.yaw;
   if(p.fastplant)p.fastplant.foot=new THREE.Vector3().fromArray(p.fastplant.foot);
   if(p.crash)for(const key of ['rider','scooter']){const body=p.crash[key];p.crash[key]={translation:()=>body.position,rotation:()=>body.rotation};}
   r.model.update(p as Simulation,dt,1);
   const point=p.position.clone().add(new THREE.Vector3(0,2,0)),distance=point.distanceTo(this.sim().position);point.project(camera);r.label.hidden=distance>35||Math.abs(point.x)>1||Math.abs(point.y)>1||point.z>1;
   r.label.textContent=r.name+(r.chatUntil>performance.now()?'\n'+r.chat:'');r.label.style.left=(point.x*.5+.5)*innerWidth+'px';r.label.style.top=(-point.y*.5+.5)*innerHeight+'px';
 }}
}
