import * as THREE from 'three';
import type { Park } from './park';
import { OUTDOOR, ACTIVE_MAP, terrainHeight } from './park';
import type { Simulation } from '../physics/simulation';
import type { InputFrame } from '../input/input';
import { emptyInput } from '../input/input';
import { ScooterAssembly } from '../scooter/assembly';
import type { RiderModel } from '../scooter/model';
import type { LocalProfile } from '../data/loadout';
import type { ScooterLoadout } from '../data/scooterParts';
export interface Interactable {
 id:string; interactionType:'rack'|'vending'|'fountain'|'bench'; position:THREE.Vector3;
 radius:number; prompt:(s:Simulation)=>string; action:(s:Simulation)=>void;
}
interface StoredRide {ownerId:string; rackId:string; slot:number; loadout:ScooterLoadout; mesh:THREE.Group}
export class WorldInteractions {
 readonly items:Interactable[]=[];
 readonly prompt=document.createElement('div');
 stored:StoredRide|null=null;
 active: {type:string; time:number; duration:number; start:THREE.Vector3; end:THREE.Vector3; from:THREE.Quaternion; to:THREE.Quaternion; mesh?:THREE.Group; finish?:()=>void}|null=null;
 readonly prop=new THREE.Group();
 private profile:LocalProfile;
 private sequence=0;
 constructor(public park:Park,profile:LocalProfile){
  this.profile=profile;this.prompt.className='world-prompt';this.prompt.hidden=true;document.body.append(this.prompt);
  const scene=park.scene;
  const locations=OUTDOOR?[[22,-34],[-42,-20],[52,-28]]:ACTIVE_MAP==="techno_gravity"?[[6,-8]]:[[24,-31]];
  for(const [index,[x,z]] of locations.entries()){
   const y=terrainHeight(x,z),base=new THREE.Vector3(x,y,z);
   for(const dx of [-.85,0,.85]){
    park.box(new THREE.Vector3(x+dx,y+.26,z),new THREE.Vector3(.045,.52,.55),0x43585c,true);
   }
   park.box(new THREE.Vector3(x,y+.035,z),new THREE.Vector3(2.3,.07,.8),0x556567,true);
   const rackId=`rack-${index}`;
   this.items.push({id:rackId,interactionType:'rack',position:base.clone(),radius:2,prompt:s=>this.stored?.rackId===rackId?'Grab Scooter':s.hasScooter?'Store Scooter':'Scooter stored at another rack',action:s=>this.rack(s,rackId,base)});
   const machine=base.clone().add(new THREE.Vector3(3,0,0));
   const shell=park.box(machine.clone().add(new THREE.Vector3(0,.95,0)),new THREE.Vector3(1.05,1.9,.7),0x335e62,true);
   shell.name='Refresh vending machine';
   park.box(machine.clone().add(new THREE.Vector3(-.14,1.15,.365)),new THREE.Vector3(.61,.95,.03),0x1f3039,false);
   for(let row=0;row<3;row++)for(let col=0;col<3;col++)park.box(machine.clone().add(new THREE.Vector3(-.35+col*.21,.8+row*.3,.395)),new THREE.Vector3(.105,.19,.025),[0x9ccfd4,0xea884b,0x84a762][row],false);
   for(let row=0;row<4;row++)park.box(machine.clone().add(new THREE.Vector3(.36,.85+row*.15,.37)),new THREE.Vector3(.13,.07,.02),0xded4ac,false);
   park.box(machine.clone().add(new THREE.Vector3(0,.36,.365)),new THREE.Vector3(.55,.17,.03),0x17272e,false);
   this.items.push({id:`vending-${index}`,interactionType:'vending',position:machine,radius:1.8,prompt:()=> 'Get Drink / Snack · Free',action:s=>this.consume(s,['Water','Sports drink','Soda','Chips'][this.sequence++%4],machine)});
   const fountain=base.clone().add(new THREE.Vector3(-3,0,0));
   park.box(fountain.clone().add(new THREE.Vector3(0,.44,0)),new THREE.Vector3(.28,.88,.36),0x748e86,true);
   park.box(fountain.clone().add(new THREE.Vector3(0,.9,0)),new THREE.Vector3(.55,.1,.48),0xaec1b7,true);
   park.box(fountain.clone().add(new THREE.Vector3(.17,.99,.08)),new THREE.Vector3(.06,.12,.07),0xd4ded2,false);
   this.items.push({id:`fountain-${index}`,interactionType:'fountain',position:fountain,radius:1.5,prompt:()=> 'Use Fountain',action:s=>this.consume(s,'Fountain',fountain)});
  }
  for(const bench of park.benches)this.items.push({id:bench.id,interactionType:'bench',position:new THREE.Vector3(bench.x,bench.base,bench.z),radius:Math.max(1.3,bench.length/2+.3),prompt:()=> 'Sit',action:()=>{}});
  scene.add(this.prop);this.prop.visible=false;
 }
 dispose(){this.prompt.remove();}
 private rack(s:Simulation,id:string,base:THREE.Vector3){
  if(this.active)return;
  if(this.stored){
   if(this.stored.rackId!==id)return;
   const stored=this.stored;
   this.active={type:'grab',time:0,duration:.65,start:stored.mesh.position.clone(),end:s.position.clone().add(new THREE.Vector3(.48,-.22,0)),from:stored.mesh.quaternion.clone(),to:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),s.yaw),mesh:stored.mesh,finish:()=>{
    this.profile.scooter=structuredClone(stored.loadout);s.hasScooter=true;stored.mesh.removeFromParent();stored.mesh.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.stored=null;
   }};
  }else if(s.hasScooter){
   const mesh=new THREE.Group();new ScooterAssembly(mesh).build(this.profile.scooter);this.park.scene.add(mesh);
   const loadout=structuredClone(this.profile.scooter);s.hasScooter=false;
   const start=s.position.clone().add(new THREE.Vector3(Math.cos(s.yaw)*.48,-.22,-Math.sin(s.yaw)*.48));
   mesh.position.copy(start);
   this.stored={ownerId:'local-player',rackId:id,slot:1,loadout,mesh};
   this.active={type:'store',time:0,duration:.65,start,end:base.clone().add(new THREE.Vector3(.25,.07,0)),from:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),s.yaw),to:new THREE.Quaternion(),mesh};
  }
  s.emote={id:'place',time:0,duration:.65};
 }
 private consume(s:Simulation,item:string,position:THREE.Vector3){
  const delta=position.clone().sub(s.position);s.yaw=Math.atan2(delta.x,delta.z);s.previousYaw=s.yaw;
  const type=item==='Fountain'?'drink-fountain':item==='Chips'?'eat':'drink';
  s.emote={id:type,time:0,duration:2.4};
  this.active={type,time:0,duration:2.4,start:new THREE.Vector3(),end:new THREE.Vector3(),from:new THREE.Quaternion(),to:new THREE.Quaternion()};
  this.prop.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});this.prop.clear();
  const snack=item==='Chips';
  const mesh=new THREE.Mesh(snack?new THREE.BoxGeometry(.1,.15,.045):new THREE.CylinderGeometry(.027,.032,.14,8),new THREE.MeshStandardMaterial({color:snack?0xdb9950:item==='Water'?0x96cddf:0x8dae61,roughness:.5}));
  this.prop.add(mesh);this.prop.visible=item!=='Fountain';
  s.events.emit({type:'worldInteraction',interaction:type,item});
 }
 update(s:Simulation,input:InputFrame,dt:number,enabled=true):InputFrame{
  this.prompt.hidden=true;
  if(!enabled)return input;
  if(!s.hasScooter && !s.walking){s.walking=true;s.running=false;}
  if(!s.hasScooter)input={...input,pressed:{...input.pressed,body:false}};
  if(this.active){
   const a=this.active;
   const interrupted=!s.walking||s.state==='Bail'||Math.hypot(input.steer,input.lean)>.15||input.pressed.hop||input.pressed.body;
   if(interrupted&&!a.mesh){this.active=null;s.emote=null;this.prop.visible=false;return input;}
   a.time+=dt;
   if(a.mesh){const t=THREE.MathUtils.smoothstep(a.time/a.duration,0,1);a.mesh.position.copy(a.start).lerp(a.end,t);a.mesh.position.y+=Math.sin(t*Math.PI)*.22;a.mesh.quaternion.copy(a.from).slerp(a.to,t);}
   if(a.time>=a.duration){a.finish?.();this.active=null;this.prop.visible=false;s.emote=null;}
   return emptyInput();
  }
  if(!s.walking||!s.grounded||s.state==='Bail'||s.sitting)return input;
  const near=this.items.filter(i=>i.position.distanceTo(s.position)<i.radius).sort((a,b)=>a.position.distanceToSquared(s.position)-b.position.distanceToSquared(s.position))[0];
  if(near){this.prompt.hidden=false;this.prompt.textContent=`B / F · ${near.prompt(s)}`;
   if(input.pressed.brakeBars&&near.interactionType!=='bench'){near.action(s);return {...input,pressed:{...input.pressed,brakeBars:false}};}
  }else if(!s.hasScooter){this.prompt.hidden=false;this.prompt.textContent='Scooter stored · Return to its rack to grab it';}
  return input;
 }
 render(rider:RiderModel){
  rider.scooter.visible=!this.stored || this.active?.type==='grab'&&this.active.time>=this.active.duration;
  if(this.prop.visible){rider.hands[0].getWorldPosition(this.prop.position);rider.hands[0].getWorldQuaternion(this.prop.quaternion);}
 }
}
