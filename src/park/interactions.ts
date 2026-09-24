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
import {ITEM_KINDS,receiveItem,consumeItem,itemLabel,type ItemKind} from '../data/items';
import {tube} from '../scooter/surfaces';
import type { ScooterLoadout } from '../data/scooterParts';
import { LongboardAssembly } from '../longboard/assembly';
import type { LongboardLoadout } from '../data/longboardParts';
import type { RideableKind } from '../data/catalog';
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
  const clusters:{x:number;z:number;vending:boolean;spread:number;facing?:1|-1}[]=OUTDOOR
   ?[{x:22,z:-31.4,vending:false,spread:2.2},{x:-42,z:-20,vending:true,spread:3},{x:48,z:-25.5,vending:true,spread:3}]
   :ACTIVE_MAP==="techno_gravity"?[{x:5.2,z:-6,vending:true,spread:2.4,facing:-1}]:[{x:24,z:-31,vending:true,spread:3}];
  for(const [index,cluster] of clusters.entries()){
   const {x,z,spread}=cluster,f=cluster.facing??1;
   const y=terrainHeight(x,z),base=new THREE.Vector3(x,y,z);
   // Offsets are authored for a machine facing +z; a mirrored cluster flips
   // both axes, which leaves every axis-aligned box and collider valid.
   const at=(origin:THREE.Vector3,dx:number,dy:number,dz:number)=>origin.clone().add(new THREE.Vector3(dx*f,dy,dz*f));
   for(const dx of [-.85,0,.85]){
    park.box(new THREE.Vector3(x+dx,y+.26,z),new THREE.Vector3(.045,.52,.55),0x43585c,true);
   }
   park.box(new THREE.Vector3(x,y+.035,z),new THREE.Vector3(2.3,.07,.8),0x556567,true);
   const rackId=`rack-${index}`;
   this.items.push({id:rackId,interactionType:'rack',position:base.clone(),radius:2,prompt:s=>this.stored?.rackId===rackId?'Grab '+rideName(this.stored.rideable):s.hasScooter?'Store '+rideName(s.rideable):rideName(this.stored?.rideable??s.rideable)+' stored at another rack',action:s=>this.rack(s,rackId,base)});
   if(cluster.vending){
   const machine=at(base,spread,0,0);
   const shell=park.box(at(machine,0,.95,0),new THREE.Vector3(1.05,1.9,.7),0x335e62,true);
   shell.name='Refresh vending machine';
   // Cabinet depth and side/back treatment, so the machine is not a plain slab
   // with the same face repeated on every side.
   park.box(at(machine,0,1.93,0),new THREE.Vector3(1.11,.09,.76),0x2a4d50,false);
   park.box(at(machine,0,.06,0),new THREE.Vector3(1.09,.12,.74),0x24393c,true);
   for(const s of [-1,1])park.box(at(machine,s*.53,.95,0),new THREE.Vector3(.02,1.76,.66),0x2b5054,false);
   park.box(at(machine,0,.95,-.36),new THREE.Vector3(.99,1.76,.02),0x2b5054,false);
   park.box(at(machine,-.14,1.15,.365),new THREE.Vector3(.61,.95,.03),0x1f3039,false);
   for(let row=0;row<3;row++)for(let col=0;col<3;col++)park.box(at(machine,-.35+col*.21,.8+row*.3,.395),new THREE.Vector3(.105,.19,.025),[0x9ccfd4,0xea884b,0x84a762][row],false);
   for(let row=0;row<4;row++)park.box(at(machine,.36,.85+row*.15,.37),new THREE.Vector3(.13,.07,.02),0xded4ac,false);
   park.box(at(machine,0,.36,.365),new THREE.Vector3(.55,.17,.03),0x17272e,false);
   this.items.push({id:`vending-${index}`,interactionType:'vending',position:machine,radius:1.8,prompt:()=> 'Choose Drink / Snack · Free',action:s=>this.openOptions('VENDING',[...ITEM_KINDS.map(kind=>({label:kind as string,detail:'Free · tap to pay with your phone',action:()=>this.vend(s,kind,machine)})),{label:'Cancel',detail:'',action:()=>{}}],'Pick a drink or snack')});
   }
   const fountain=at(base,-spread,0,0);
   park.box(at(fountain,0,.44,0),new THREE.Vector3(.28,.88,.36),0x748e86,true);
   park.box(at(fountain,0,.9,0),new THREE.Vector3(.55,.1,.48),0xaec1b7,true);
   park.box(at(fountain,.17,.99,.08),new THREE.Vector3(.06,.12,.07),0xd4ded2,false);
   this.items.push({id:`fountain-${index}`,interactionType:'fountain',position:fountain,radius:1.5,prompt:()=> 'Use Fountain',action:s=>this.fountain(s,fountain)});
  }
  for(const bench of park.benches)this.items.push({id:bench.id,interactionType:'bench',position:new THREE.Vector3(bench.x,bench.base,bench.z),radius:Math.max(1.3,bench.length/2+.3),prompt:()=> 'Sit',action:()=>{}});
  scene.add(this.prop,this.water);this.prop.visible=false;this.water.visible=false;
 }
 dispose(){this.prompt.remove();for(const group of [this.prop,this.water]){group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});group.removeFromParent();}}
 private rack(s:Simulation,id:string,base:THREE.Vector3){
  if(this.online){this.openOptions('RACKS',[{label:'OK',detail:'Shared rack storage is still in testing online',action:()=>{}}],'Unavailable in a room');return;}
  if(this.active)return;
  if(this.stored){
   if(this.stored.rackId!==id)return;
   const stored=this.stored;
   this.active={type:'grab',time:0,duration:.65,start:stored.mesh.position.clone(),end:s.position.clone().add(new THREE.Vector3(.48,-.22,0)),from:stored.mesh.quaternion.clone(),to:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),s.yaw),mesh:stored.mesh,finish:()=>{
    s.hasScooter=true;s.rideable=stored.rideable;stored.mesh.removeFromParent();stored.mesh.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.stored=null;
   }};
  }else if(s.hasScooter){
   const board=s.rideable==='longboard',mesh=new THREE.Group();
   if(board)new LongboardAssembly(mesh,this.profile.longboard);else new ScooterAssembly(mesh).build(this.profile.scooter);this.park.scene.add(mesh);
   const loadout=structuredClone(board?this.profile.longboard:this.profile.scooter);s.hasScooter=false;
   const start=s.position.clone().add(new THREE.Vector3(Math.cos(s.yaw)*.48,-.22,-Math.sin(s.yaw)*.48));
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
 private useHeld(s:Simulation){const item=this.profile.pockets.entries.find(i=>i.id===this.profile.pockets.held);if(!item||item.state==='empty'||this.active||!s.walking)return;const a=this.action(s,item.kind==='Chips'?'eat':'drink',2.4);a.itemId=item.id;}
 private fountain(s:Simulation,source:THREE.Vector3){if(this.active)return;this.profile.pockets.held=null;saveProfile(this.profile);s.position.set(source.x,source.y+.22,source.z+.62);s.previousPosition.copy(s.position);s.body.setTranslation(s.position,true);s.yaw=s.previousYaw=Math.PI;
  const a=this.action(s,'drink-fountain',2.8);a.source=source;
  this.water.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});this.water.clear();
  const points=Array.from({length:13},(_,i)=>{const t=i/12;return new THREE.Vector3(.17*(1-t),1.04-.075*t+Math.sin(t*Math.PI)*.13,.08+t*.10);});
  const stream=new THREE.Mesh(tube(points,.008),new THREE.MeshBasicMaterial({color:0xa6e4f0,transparent:true,opacity:.75}));this.water.add(stream);const splash=new THREE.Mesh(new THREE.TorusGeometry(.04,.005,5,20),new THREE.MeshBasicMaterial({color:0xc5edf4,transparent:true,opacity:.6}));splash.rotation.x=Math.PI/2;splash.position.set(0,.965,.18);this.water.add(splash);this.water.position.copy(source);
 }
 private refreshProp(){const item=this.profile.pockets.entries.find(i=>i.id===this.profile.pockets.held),key=item?item.id+item.state:'';if(key===this.propKey)return;this.propKey=key;
  this.prop.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});this.prop.clear();if(!item)return;const snack=item.kind==='Chips';
  const mesh=new THREE.Mesh(snack?new THREE.BoxGeometry(.10,.14,item.state==='empty'?.008:.045):new THREE.CylinderGeometry(.030,.030,item.kind==='Soda'?.115:.15,24),new THREE.MeshStandardMaterial({color:snack?0xd4a34c:item.kind==='Soda'?0xc96842:item.kind==='Water'?0x86c3d5:0x7ea567,roughness:.45,metalness:item.kind==='Soda'?.4:0}));this.prop.add(mesh);
  if(!snack){const lid=new THREE.Mesh(new THREE.CylinderGeometry(.029,.029,.005,24),new THREE.MeshStandardMaterial({color:0xc1cac9,metalness:.75,roughness:.28}));lid.position.y=item.kind==='Soda'?.058:.075;this.prop.add(lid);if(item.state!=='sealed'){const hole=new THREE.Mesh(new THREE.CircleGeometry(.009,12),new THREE.MeshBasicMaterial({color:0x172425}));hole.rotation.x=-Math.PI/2;hole.position.set(0,lid.position.y+.003,.01);this.prop.add(hole);}}
 }
 update(s:Simulation,input:InputFrame,dt:number,enabled=true):InputFrame{
  this.current=s;
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
  if(this.profile.pockets.held){this.prompt.hidden=false;this.prompt.textContent=({pushDeck:'X',leftModifier:'LB',rightModifier:'RB'})[this.profile.pockets.useAction]+' / Use held item · D-pad Down / Phone';if(input.pressed[this.profile.pockets.useAction]){this.useHeld(s);return emptyInput();}}
  const near=this.items.filter(i=>i.position.distanceTo(s.position)<i.radius).sort((a,b)=>a.position.distanceToSquared(s.position)-b.position.distanceToSquared(s.position))[0];
  if(near){this.prompt.hidden=false;this.prompt.textContent=`B / keyboard B · ${near.prompt(s)}`;
   if(input.pressed.brakeBars&&near.interactionType!=='bench'){near.action(s);return {...input,pressed:{...input.pressed,brakeBars:false}};}
  }else if(!s.hasScooter){this.prompt.hidden=false;this.prompt.textContent=rideName(this.stored?.rideable??s.rideable)+' stored · Return to its rack to grab it';}
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
