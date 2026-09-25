import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { drinkingFountain, scooterRack, vendingMachine } from './props';
import { DIVE_DOCK } from "./dive-dock";
import * as THREE from 'three';
import type { Park } from './park';
import { OUTDOOR, ACTIVE_MAP, terrainHeight } from './park';
import type { Simulation } from '../physics/simulation';
import type { InputFrame } from '../input/input';
import { emptyInput } from '../input/input';
import { ScooterAssembly } from '../scooter/assembly';
import type { RiderModel } from '../scooter/model';
import type { LocalProfile } from '../data/loadout';
import {saveProfile} from '../data/loadout';
import {ITEM_KINDS,VENDING_KINDS,SINGLE_USE,isNovelty,receiveItem,consumeItem,itemLabel,type ItemKind,type NoveltyKind} from '../data/items';
import {tube} from '../scooter/surfaces';
import type { ScooterLoadout } from '../data/scooterParts';
import { LongboardAssembly } from '../longboard/assembly';
import type { LongboardLoadout } from '../data/longboardParts';
import type { RideableKind } from '../data/catalog';
import { sideSign, walkSide } from '../core/stance';
/** Where the ride stands beside the rider (Regular right, Goofy left; stance.ts), in world space. */
const besideRider=(s:Simulation)=>{const k=sideSign(walkSide(s.tricks.stance))*.48;return s.position.clone().add(new THREE.Vector3(Math.cos(s.yaw)*k,-.22,-Math.sin(s.yaw)*k));};
export interface Interactable {
 id:string; interactionType:'rack'|'vending'|'fountain'|'bench'; position:THREE.Vector3;
 radius:number; prompt:(s:Simulation)=>string; action:(s:Simulation)=>void;
}
interface StoredRide {ownerId:string; rackId:string; slot:number; rideable:RideableKind; loadout:ScooterLoadout|LongboardLoadout; mesh:THREE.Group}
const rideName=(kind:RideableKind)=>kind==='longboard'?'Longboard':'Scooter';
export class WorldInteractions {
 readonly items:Interactable[]=[];
 online=false;
 readonly prompt=document.createElement('div');
 stored:StoredRide|null=null;
 active: {type:string; time:number; duration:number; start:THREE.Vector3; end:THREE.Vector3; from:THREE.Quaternion; to:THREE.Quaternion; mesh?:THREE.Group; finish?:()=>void;itemId?:string;source?:THREE.Vector3;opened?:boolean;consumed?:boolean}|null=null;
 readonly prop=new THREE.Group();
 private profile:LocalProfile;
 private sequence=0;
 private propKey='';private current:Simulation|null=null;private water=new THREE.Group();
 get waterActive(){return this.water.visible;}
 /** Shows a choice on the rider's phone (vending machines, notices). */
 openOptions:(title:string,options:{label:string;detail?:string;action:()=>void}[],sub?:string)=>void=()=>{};
 constructor(public park:Park,profile:LocalProfile){
  this.profile=profile;this.prompt.className='world-prompt';this.prompt.hidden=true;document.body.append(this.prompt);
  const scene=park.scene;
  // Service clusters. `vending:false` keeps the rack and fountain at a location
  // while leaving no machine, collider, prompt or interaction behind.
  // [22,-34] is the main sidewalk entrance: its machine and the lamp beside it
  // are removed, and the rack and fountain step back off the walking line into
  // the paved margin so the entrance keeps a clear continuous width.
  // [55,-28] used to sit square in front of the BMX sign and gate, so the whole
  // cluster shifts clear of the opening and faces the approach instead.
  // `facing` is the way the machine front points along z: +1 toward +z, -1
  // toward -z (the whole cluster is mirrored). At Techno Gravity the machine
  // stood out on the sidewalk showing its plain back to everyone arriving from
  // the street; it now backs onto the storefront and faces the approach.
  // The lake's dive dock gets a rack of its own (no fountain): rack the ride, go for a dip.
  const clusters:{x:number;z:number;vending:boolean;spread:number;facing?:1|-1;fountain?:boolean}[]=OUTDOOR
   ?[{x:22,z:-31.4,vending:false,spread:2.2},{x:-42,z:-20,vending:true,spread:3},{x:48,z:-25.5,vending:true,spread:3},{x:DIVE_DOCK.rack[0],z:DIVE_DOCK.rack[1],vending:false,spread:2.2,fountain:false}]
   :ACTIVE_MAP==="techno_gravity"?[{x:5.2,z:-6,vending:true,spread:2.4,facing:-1}]
   // The Church: a rack and machine at the corner of the front lot, by the sidewalk.
   :ACTIVE_MAP==="church"?[{x:25.5,z:-41,vending:true,spread:3}]:[{x:24,z:-31,vending:true,spread:3}];
  for(const [index,cluster] of clusters.entries()){
   const {x,z,spread}=cluster,f=cluster.facing??1;
   const y=terrainHeight(x,z),base=new THREE.Vector3(x,y,z);
   // Offsets are authored for a machine facing +z; a mirrored cluster flips
   // both axes, which leaves every axis-aligned box and collider valid.
   const at=(origin:THREE.Vector3,dx:number,dy:number,dz:number)=>origin.clone().add(new THREE.Vector3(dx*f,dy,dz*f));
   const yaw=f===1?0:Math.PI;
   scooterRack(park,base,yaw);
   const rackId=`rack-${index}`;
   this.items.push({id:rackId,interactionType:'rack',position:base.clone(),radius:2,prompt:s=>this.stored?.rackId===rackId?'Grab '+rideName(this.stored.rideable):s.hasScooter?'Store '+rideName(s.rideable):rideName(this.stored?.rideable??s.rideable)+' stored at another rack',action:s=>this.rack(s,rackId,base)});
   if(cluster.vending){
   const machine=at(base,spread,0,0);
   vendingMachine(park,machine,yaw);
   this.items.push({id:`vending-${index}`,interactionType:'vending',position:machine,radius:1.8,prompt:()=> 'Choose Drink / Snack · Free',action:s=>this.openOptions('VENDING',[...VENDING_KINDS.map(kind=>({label:kind as string,detail:'Free · tap to pay with your phone',action:()=>this.vend(s,kind,machine)})),{label:'Cancel',detail:'',action:()=>{}}],'Pick a drink or snack')});
   }
   if(cluster.fountain===false)continue;
   const fountain=at(base,-spread,0,0);
   drinkingFountain(park,fountain,yaw);
   this.items.push({id:`fountain-${index}`,interactionType:'fountain',position:fountain,radius:1.5,prompt:()=> 'Use Fountain',action:s=>this.fountain(s,fountain)});
  }
  for(const bench of park.benches)this.items.push({id:bench.id,interactionType:'bench',position:new THREE.Vector3(bench.x,bench.base,bench.z),radius:Math.max(1.3,bench.length/2+.3),prompt:()=> 'Sit',action:()=>{}});
  scene.add(this.prop,this.water);this.prop.visible=false;this.water.visible=false;
 }
 dispose(){this.prompt.remove();for(const group of [this.prop,this.water]){group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});group.removeFromParent();}}
 /**
  * Into the water: the ride is left lying at the water's edge where the rider
  * went in, and is grabbed back like a rack (B beside it). Works online too:
  * it never leaves this rider's own world.
  */
 parkAtShore(s:Simulation,x:number,z:number,yaw:number){
  if(this.stored||!s.hasScooter)return;
  const board=s.rideable==='longboard',mesh=new THREE.Group();
  if(board)new LongboardAssembly(mesh,this.profile.longboard);else new ScooterAssembly(mesh).build(this.profile.scooter);
  const y=terrainHeight(x,z);
  // A scooter lies on its side; a board sits wheels down.
  mesh.position.set(x,y+(board?.0:.13),z);
  mesh.quaternion.setFromEuler(new THREE.Euler(0,yaw,board?0:Math.PI/2,'YXZ'));
  this.park.scene.add(mesh);
  this.stored={ownerId:'local-player',rackId:'shore',slot:1,rideable:s.rideable,loadout:structuredClone(board?this.profile.longboard:this.profile.scooter),mesh};
  s.hasScooter=false;
  const at=mesh.position.clone();
  this.dropShore();
  this.items.push({id:'shore',interactionType:'rack',position:at,radius:2.2,prompt:()=>'Grab your '+rideName(this.stored?.rideable??s.rideable).toLowerCase(),action:s=>this.rack(s,'shore',at,true)});
 }
 private dropShore(){const i=this.items.findIndex(i=>i.id==='shore');if(i>=0)this.items.splice(i,1);}
 private rack(s:Simulation,id:string,base:THREE.Vector3,own=false){
  if(this.online&&!own){this.openOptions('RACKS',[{label:'OK',detail:'Shared rack storage is still in testing online',action:()=>{}}],'Unavailable in a room');return;}
  if(this.active)return;
  if(this.stored){
   if(this.stored.rackId!==id)return;
   const stored=this.stored;
   this.active={type:'grab',time:0,duration:.65,start:stored.mesh.position.clone(),end:besideRider(s),from:stored.mesh.quaternion.clone(),to:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),s.yaw),mesh:stored.mesh,finish:()=>{
    s.hasScooter=true;s.rideable=stored.rideable;stored.mesh.removeFromParent();stored.mesh.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.stored=null;
   }};
  }else if(s.hasScooter){
   const board=s.rideable==='longboard',mesh=new THREE.Group();
   if(board)new LongboardAssembly(mesh,this.profile.longboard);else new ScooterAssembly(mesh).build(this.profile.scooter);this.park.scene.add(mesh);
   const loadout=structuredClone(board?this.profile.longboard:this.profile.scooter);s.hasScooter=false;
   const start=besideRider(s);
   mesh.position.copy(start);
   this.stored={ownerId:'local-player',rackId:id,slot:1,rideable:s.rideable,loadout,mesh};
   // A board stands nose-up in the slot rather than borrowing the scooter's pose.
   const to=board?new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2+.12,0,0)):new THREE.Quaternion();
   this.active={type:'store',time:0,duration:.65,start,end:base.clone().add(new THREE.Vector3(.25,board?.5:.07,board?.06:0)),from:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),s.yaw),to,mesh};
  }
  s.emote={id:'place',time:0,duration:.65};
 }
 private action(s:Simulation,type:string,duration:number){s.running=false;s.velocity.set(0,0,0);s.body.setLinvel(s.velocity,true);s.emote={id:type,time:0,duration};this.active={type,time:0,duration,start:new THREE.Vector3(),end:new THREE.Vector3(),from:new THREE.Quaternion(),to:new THREE.Quaternion()};return this.active;}
 private vend(s:Simulation,kind:ItemKind,source:THREE.Vector3){if(this.active||this.profile.pockets.entries.length>=48)return;const a=this.action(s,'vend',.75);a.source=source;a.finish=()=>{receiveItem(this.profile.pockets,kind);saveProfile(this.profile);s.events.emit({type:'worldInteraction',interaction:'vend',item:kind});};}
 /** Pocket contents grouped for the phone's ITEMS app: one entry per kind and state. */
 itemGroups(){const pockets=this.profile.pockets;return ITEM_KINDS.flatMap(kind=>(['sealed','opened','empty'] as const).map(state=>pockets.entries.filter(i=>i.kind===kind&&i.state===state))).filter(g=>g.length).map(items=>({items,label:itemLabel(items[0]),kind:items[0].kind,state:items[0].state,held:items.some(i=>i.id===pockets.held)}));}
 hold(id:string|null){this.profile.pockets.held=id;saveProfile(this.profile);}
 discard(id:string){const pockets=this.profile.pockets;pockets.entries=pockets.entries.filter(i=>i.id!==id);if(pockets.held===id)pockets.held=null;saveProfile(this.profile);}
 /** Takes the item in hand and uses it (on foot only). */
 use(s:Simulation,id:string){this.hold(id);this.useHeld(s);}
 private useHeld(s:Simulation){const item=this.profile.pockets.entries.find(i=>i.id===this.profile.pockets.held);if(!item||item.state==='empty'||this.active||!s.walking)return;
  if(isNovelty(item.kind)){this.useNovelty(s,item.id,item.kind);return;}
  const a=this.action(s,item.kind==='Chips'?'eat':'drink',2.4);a.itemId=item.id;}
 /**
  * Novelties (#55): each has its gesture (from the emotes other riders already
  * understand), its sound and a little effect. A popper is used up and left as
  * litter in the hand; the rest can be used again.
  */
 private useNovelty(s:Simulation,id:string,kind:NoveltyKind){
  const gesture:Record<NoveltyKind,[string,number]>={'Rubber Duck':['point',1.1],'Kazoo':['cheer',1.4],'Foam Finger':['cheer',1.6],'Party Popper':['celebrate',1.6],'Bubble Wand':['wave',2.2]};
  const [emote,duration]=gesture[kind];
  this.action(s,emote,duration);
  s.events.emit({type:'worldInteraction',interaction:'novelty',item:kind});
  if(kind==='Party Popper')this.burst(s,'confetti');
  if(kind==='Bubble Wand')this.burst(s,'bubbles');
  if(SINGLE_USE.has(kind)){consumeItem(this.profile.pockets,id);saveProfile(this.profile);}
 }
 /** Confetti from a popper or bubbles from a wand, in front of the rider, fading on their own. */
 private effects:{points:THREE.Points;velocity:Float32Array;age:number;life:number;float:boolean}[]=[];
 private burst(s:Simulation,kind:'confetti'|'bubbles'){
  const n=kind==='confetti'?90:16,pos=new Float32Array(n*3),color=new Float32Array(n*3),velocity=new Float32Array(n*3);
  const f=new THREE.Vector3(Math.sin(s.yaw),0,Math.cos(s.yaw)),origin=s.position.clone().addScaledVector(f,.35).add(new THREE.Vector3(0,1.45,0)),c=new THREE.Color();
  const palette=[0xff4f7a,0xffd23f,0x35b6ff,0xc6ff00,0xb36bff,0xffffff];
  for(let i=0;i<n;i++){pos.set([origin.x,origin.y,origin.z],i*3);
   const spread=kind==='confetti'?2.2:.35,up=kind==='confetti'?2.6+Math.random()*2:.25+Math.random()*.35;
   velocity.set([f.x*(kind==='confetti'?2.4:.8)*Math.random()+(Math.random()-.5)*spread,up,f.z*(kind==='confetti'?2.4:.8)*Math.random()+(Math.random()-.5)*spread],i*3);
   c.setHex(kind==='confetti'?palette[i%palette.length]:0xd8f4ff);color.set([c.r,c.g,c.b],i*3);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(color,3));
  const m=new THREE.PointsMaterial({size:kind==='confetti'?.045:.09,vertexColors:true,transparent:true,opacity:kind==='confetti'?1:.55,depthWrite:false});
  const points=new THREE.Points(g,m);points.frustumCulled=false;this.park.scene.add(points);
  this.effects.push({points,velocity,age:0,life:kind==='confetti'?1.8:3.2,float:kind==='bubbles'});
 }
 private stepEffects(dt:number){
  for(const e of this.effects){e.age+=dt;const p=e.points.geometry.getAttribute('position') as THREE.BufferAttribute;
   for(let i=0;i<p.count;i++){const v=e.velocity;if(e.float){v[i*3+1]=Math.max(.05,v[i*3+1]-dt*.05);v[i*3]+=Math.sin(e.age*3+i)*dt*.2;}else{v[i*3+1]-=9.8*dt*.55;v[i*3]*=1-dt*1.8;v[i*3+2]*=1-dt*1.8;v[i*3+1]=Math.max(v[i*3+1],-1.2);}
    p.setXYZ(i,p.getX(i)+v[i*3]*dt,p.getY(i)+v[i*3+1]*dt,p.getZ(i)+v[i*3+2]*dt);}
   p.needsUpdate=true;(e.points.material as THREE.PointsMaterial).opacity=Math.max(0,1-e.age/e.life)*(e.float?.55:1);}
  for(const e of this.effects.filter(e=>e.age>=e.life)){e.points.removeFromParent();e.points.geometry.dispose();(e.points.material as THREE.Material).dispose();}
  this.effects=this.effects.filter(e=>e.age<e.life);
 }
 private fountain(s:Simulation,source:THREE.Vector3){if(this.active)return;this.profile.pockets.held=null;saveProfile(this.profile);s.position.set(source.x,source.y+.22,source.z+.62);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);s.yaw=s.previousYaw=Math.PI;
  const a=this.action(s,'drink-fountain',2.8);a.source=source;
  this.water.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});this.water.clear();
  const points=Array.from({length:13},(_,i)=>{const t=i/12;return new THREE.Vector3(.17*(1-t),1.04-.075*t+Math.sin(t*Math.PI)*.13,.08+t*.10);});
  const stream=new THREE.Mesh(tube(points,.008),new THREE.MeshBasicMaterial({color:0xa6e4f0,transparent:true,opacity:.75}));this.water.add(stream);const splash=new THREE.Mesh(new THREE.TorusGeometry(.04,.005,5,20),new THREE.MeshBasicMaterial({color:0xc5edf4,transparent:true,opacity:.6}));splash.rotation.x=Math.PI/2;splash.position.set(0,.965,.18);this.water.add(splash);this.water.position.copy(source);
 }
 private refreshProp(){const item=this.profile.pockets.entries.find(i=>i.id===this.profile.pockets.held),key=item?item.id+item.state:'';if(key===this.propKey)return;this.propKey=key;
  this.prop.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});this.prop.clear();if(!item)return;
  if(isNovelty(item.kind)){this.prop.add(noveltyProp(item.kind,item.state==='empty'));return;}
  const snack=item.kind==='Chips';
  const mesh=new THREE.Mesh(snack?new THREE.BoxGeometry(.10,.14,item.state==='empty'?.008:.045):new THREE.CylinderGeometry(.030,.030,item.kind==='Soda'?.115:.15,24),new THREE.MeshStandardMaterial({color:snack?0xd4a34c:item.kind==='Soda'?0xc96842:item.kind==='Water'?0x86c3d5:0x7ea567,roughness:.45,metalness:item.kind==='Soda'?.4:0}));this.prop.add(mesh);
  if(!snack){const lid=new THREE.Mesh(new THREE.CylinderGeometry(.029,.029,.005,24),new THREE.MeshStandardMaterial({color:0xc1cac9,metalness:.75,roughness:.28}));lid.position.y=item.kind==='Soda'?.058:.075;this.prop.add(lid);if(item.state!=='sealed'){const hole=new THREE.Mesh(new THREE.CircleGeometry(.009,12),new THREE.MeshBasicMaterial({color:0x172425}));hole.rotation.x=-Math.PI/2;hole.position.set(0,lid.position.y+.003,.01);this.prop.add(hole);}}
 }
 update(s:Simulation,input:InputFrame,dt:number,enabled=true):InputFrame{
  this.current=s;this.stepEffects(dt);
  if(this.stored?.rackId!=='shore')this.dropShore();
  this.prompt.hidden=true;
  if((!s.walking||s.state==='Bail')&&this.profile.pockets.held){this.profile.pockets.held=null;saveProfile(this.profile);}
  s.heldItem=this.profile.pockets.entries.find(i=>i.id===this.profile.pockets.held)?.kind??null;
  this.refreshProp();this.water.visible=this.active?.type==='drink-fountain'&&this.active.time>.35&&this.active.time<2.35;
  if(!enabled){this.water.visible=false;return input;}
  if(!s.hasScooter && !s.walking){s.walking=true;s.running=false;}
  if(!s.hasScooter)input={...input,pressed:{...input.pressed,body:false}};
  if(this.active){
   const a=this.active;
   const interrupted=!s.walking||s.state==='Bail'||Math.hypot(input.steer,input.lean)>.15||input.pressed.hop||input.pressed.body;
   if(interrupted&&!a.mesh){this.active=null;s.emote=null;this.water.visible=false;return input;}
   a.time+=dt;
   if(a.itemId){const item=this.profile.pockets.entries.find(i=>i.id===a.itemId);if(item&&!a.opened&&a.time>.42){a.opened=true;if(item.state==='sealed'){item.state='opened';saveProfile(this.profile);s.events.emit({type:'worldInteraction',interaction:'open',item:item.kind});}}if(!a.consumed&&a.time>1.35){a.consumed=true;consumeItem(this.profile.pockets,a.itemId);saveProfile(this.profile);}}
   if(a.mesh){const t=THREE.MathUtils.smoothstep(a.time/a.duration,0,1);a.mesh.position.copy(a.start).lerp(a.end,t);a.mesh.position.y+=Math.sin(t*Math.PI)*.22;a.mesh.quaternion.copy(a.from).slerp(a.to,t);}
   if(a.time>=a.duration){a.finish?.();this.active=null;this.water.visible=false;s.emote=null;}
   return emptyInput();
  }
  if(!s.walking||!s.grounded||s.state==='Bail'||s.sitting)return input;
  // An empty can or wrapper has no use: With Friends offers the trash can or a throw instead (#58).
  if(this.profile.pockets.entries.some(i=>i.id===this.profile.pockets.held&&i.state!=='empty')){this.prompt.hidden=false;this.prompt.textContent=({pushDeck:'X',leftModifier:'LB',rightModifier:'RB'})[this.profile.pockets.useAction]+' / Use held item · Hold D-pad Down / Phone';if(input.pressed[this.profile.pockets.useAction]){this.useHeld(s);return emptyInput();}}
  const near=this.items.filter(i=>i.position.distanceTo(s.position)<i.radius).sort((a,b)=>a.position.distanceToSquared(s.position)-b.position.distanceToSquared(s.position))[0];
  if(near){this.prompt.hidden=false;this.prompt.textContent=`B / keyboard B · ${near.prompt(s)}`;
   if(input.pressed.brakeBars&&near.interactionType!=='bench'){near.action(s);return {...input,pressed:{...input.pressed,brakeBars:false}};}
  }else if(!s.hasScooter){this.prompt.hidden=false;this.prompt.textContent=rideName(this.stored?.rideable??s.rideable)+(this.stored?.rackId==='shore'?' left at the water\'s edge · Go back to grab it':' stored · Return to its rack to grab it');}
  return input;
 }
 render(rider:RiderModel){
  if(this.stored){
   const board=this.stored.rideable==='longboard',current=board?this.profile.longboard:this.profile.scooter;
   if(JSON.stringify(this.stored.loadout)!==JSON.stringify(current)){this.stored.mesh.clear();if(board)new LongboardAssembly(this.stored.mesh,this.profile.longboard);else new ScooterAssembly(this.stored.mesh).build(this.profile.scooter);this.stored.loadout=structuredClone(current);}
  }
  // The rider model chooses which rideable to show; a stored one is hidden from the rider until grabbed.
  if(this.stored&&!(this.active?.type==='grab'&&this.active.time>=this.active.duration)){rider.scooter.visible=false;rider.board.visible=false;}
  this.refreshProp();this.prop.visible=!!this.profile.pockets.held&&!!this.current?.walking&&this.current?.state!=='Bail';
  if(this.prop.visible){rider.root.updateMatrixWorld(true);rider.hands[0].getWorldQuaternion(this.prop.quaternion);this.prop.position.copy(rider.hands[0].localToWorld(new THREE.Vector3(0,-.035,.075)));this.prop.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2));}
 }
}

/** The novelty in the hand (#55), in the prop's frame: the hand holds it at the origin, up is +y. */
function noveltyProp(kind:NoveltyKind,spent:boolean){
 const g=new THREE.Group(),mat=(color:number,roughness=.5,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
 if(kind==='Rubber Duck'){
  const yellow=mat(0xffd21f,.35),body=new THREE.Mesh(new THREE.SphereGeometry(.045,20,14),yellow);body.scale.set(1,.78,1.25);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.029,18,12),yellow);head.position.set(0,.043,.03);
  const beak=new THREE.Mesh(new THREE.SphereGeometry(.014,12,8),mat(0xff7a1a,.4));beak.scale.set(1.3,.45,1.4);beak.position.set(0,.038,.06);
  const tail=new THREE.Mesh(new THREE.ConeGeometry(.018,.03,10),yellow);tail.rotation.x=-2.2;tail.position.set(0,.02,-.055);
  g.add(body,head,beak,tail);
  for(const x of [-.013,.013]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.005,8,6),mat(0x111111,.2));eye.position.set(x,.052,.052);g.add(eye);}
  g.position.y=.03;
 }else if(kind==='Kazoo'){
  const pts=[new THREE.Vector2(.009,-.06),new THREE.Vector2(.013,-.02),new THREE.Vector2(.013,.03),new THREE.Vector2(.017,.06)];
  const tube=new THREE.Mesh(new THREE.LatheGeometry(pts,18),mat(0xe0303a,.3,.2));tube.rotation.x=Math.PI/2;
  const dome=new THREE.Mesh(new THREE.CylinderGeometry(.009,.011,.012,14),mat(0xd8dde0,.3,.7));dome.position.set(0,.017,.005);
  g.add(tube,dome);(tube.material as THREE.MeshStandardMaterial).side=THREE.DoubleSide;
 }else if(kind==='Foam Finger'){
  const foam=mat(0x1f6fff,.95),palm=new THREE.Mesh(new RoundedBoxGeometry(.14,.16,.05,3,.02),foam);palm.position.y=.06;
  const finger=new THREE.Mesh(new THREE.CapsuleGeometry(.026,.14,6,12),foam);finger.position.set(-.025,.22,0);
  const thumb=new THREE.Mesh(new THREE.CapsuleGeometry(.022,.05,6,10),foam);thumb.rotation.z=-1;thumb.position.set(.075,.1,0);
  const band=new THREE.Mesh(new RoundedBoxGeometry(.12,.035,.055,2,.01),mat(0xffffff,.9));band.position.y=-.03;
  g.add(palm,finger,thumb,band);
 }else if(kind==='Party Popper'){
  const cone=new THREE.Mesh(new THREE.ConeGeometry(.024,.1,20,1,true),new THREE.MeshStandardMaterial({color:spent?0x8a6a8a:0xff4fb0,roughness:.25,metalness:.55,side:THREE.DoubleSide}));cone.rotation.x=Math.PI;cone.position.y=.04;
  g.add(cone);
  if(!spent){const cap=new THREE.Mesh(new THREE.CircleGeometry(.024,20),mat(0xffd23f,.3,.4));cap.rotation.x=-Math.PI/2;cap.position.y=.09;const string=new THREE.Mesh(new THREE.CylinderGeometry(.0015,.0015,.05,5),mat(0xffffff,.8));string.position.y=-.035;g.add(cap,string);}
 }else{
  const stick=new THREE.Mesh(new THREE.CylinderGeometry(.005,.005,.2,8),mat(0x7fd6ff,.3));stick.position.y=.06;
  const loop=new THREE.Mesh(new THREE.TorusGeometry(.03,.004,8,24),mat(0x7fd6ff,.3));loop.position.y=.19;
  const film=new THREE.Mesh(new THREE.CircleGeometry(.028,20),new THREE.MeshPhysicalMaterial({color:0xffffff,transparent:true,opacity:.18,roughness:0,iridescence:1,side:THREE.DoubleSide}));film.position.y=.19;
  g.add(stick,loop,film);
 }
 g.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=true;});
 return g;
}
