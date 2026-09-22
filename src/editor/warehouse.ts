import * as THREE from 'three';
import { Park, ACTIVE_MAP } from '../park/park';
import { buildObject } from './assets';
import { blankLayout, makeObject, setActiveLayout, validateLayout, type ParkObject, type ParkLayout } from './layout';
import { emptyInput, type InputFrame } from '../input/input';
import type { Simulation } from '../physics/simulation';
export const BUILD_ASSETS=[['Small Quarter Pipe','Quarter Pipe',3,1.5,4],['Medium Quarter Pipe','Quarter Pipe',5,2.6,6],['Bank','Bank',4,1.3,4],['Launch Ramp','Launch Ramp',3,1.4,3],['Flat Rail','Flat Rail',.12,.65,5],['Down Rail','Down Rail',.12,1.1,5],['Small Grind Box','Grind Box',1.3,.5,3],['Large Box','Box Jump',5,1.6,8],['Ledge','Ledge',.6,.6,4],['Spine','Spine',4,1.8,5],['Hip / Transfer','Box Jump',4,1.3,5],['Bench','Bench',.65,.5,2.4],['Picnic Table','Picnic Table',2,1,2.4]] as const;
export class WarehouseBuilder {
 layout:ParkLayout=blankLayout();placement:ParkObject|null=null;selected:string|null=null;
 private built=new Map<string,{group:THREE.Group;handles:number[]}>();
 private ghost:THREE.Group|null=null;private cursor=new THREE.Vector3();private angle=0;private turnDelay=0;
 prompt=document.createElement('div');saveError='';
 constructor(private park:Park){this.prompt.className='world-prompt';this.prompt.hidden=true;document.body.append(this.prompt);
  if(ACTIVE_MAP==='warehouse'){try{const d=localStorage.getItem('swf-warehouse-v1');if(d)this.layout=validateLayout(JSON.parse(d));}catch{this.saveError='Saved warehouse could not be read; original save preserved.';}setActiveLayout(this.layout);for(const o of this.layout.objects)this.add(o);}
 }
 dispose(){this.prompt.remove();}
 options(s:Simulation){return BUILD_ASSETS.map(([label,type,w,h,l])=>({label,action:()=>{const o=makeObject(type,s.position.x+Math.sin(s.yaw)*5,s.position.z+Math.cos(s.yaw)*5);Object.assign(o,{width:w,height:h,length:l,radius:type==='Quarter Pipe'?l-1:2,deck:type==='Spine'?.2:1});this.begin(o);}}));}
 private add(o:ParkObject){const before=new Set<number>();this.park.world.forEachCollider(c=>before.add(c.handle));const group=buildObject(this.park,o);const handles:number[]=[];this.park.world.forEachCollider(c=>{if(!before.has(c.handle))handles.push(c.handle);});this.built.set(o.id,{group,handles});}
 private remove(id:string){const b=this.built.get(id);if(!b)return;for(const handle of b.handles){const c=this.park.world.getCollider(handle);if(c)this.park.world.removeCollider(c,true);this.park.railHandles.delete(handle);}this.park.rails=this.park.rails.filter(r=>!b.handles.includes(r.colliderHandle??-1));this.park.benches=this.park.benches.filter(v=>v.id!==id&&!v.id.startsWith(id));const objects=new Set<THREE.Object3D>();b.group.traverse(o=>objects.add(o));this.park.solids=this.park.solids.filter(o=>!objects.has(o));b.group.removeFromParent();b.group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.built.delete(id);}
 begin(o:ParkObject){this.placement=structuredClone(o);this.cursor.set(o.x,o.y,o.z);this.angle=o.rotation;
  // Reuse the exact asset factory in an isolated temporary world: preview has no live colliders.
  const temp=new THREE.Group();const existing=this.built.get(o.id)?.group;
  if(existing)this.ghost=existing.clone(true);
  else{const g=new THREE.Mesh(new THREE.BoxGeometry(o.width,o.height,o.length),new THREE.MeshBasicMaterial({color:0x96d7bd,wireframe:true}));g.position.y=o.height/2;temp.add(g);this.ghost=temp;}
  this.ghost.traverse(p=>{if(p instanceof THREE.Mesh){p.material=new THREE.MeshBasicMaterial({color:0x96d7bd,transparent:true,opacity:.4,wireframe:false,depthWrite:false});}});this.park.scene.add(this.ghost);}
 cancel(){if(this.ghost){this.ghost.removeFromParent();this.ghost.traverse(o=>{if(o instanceof THREE.Mesh)(o.material as THREE.Material).dispose();});}this.ghost=null;this.placement=null;this.prompt.hidden=true;}
 save(){try{localStorage.setItem('swf-warehouse-v1',JSON.stringify(this.layout));this.saveError='';}catch{this.saveError='Save unavailable · keep this page open or export layout';}}
 reset(){for(const id of [...this.built.keys()])this.remove(id);this.layout=blankLayout();setActiveLayout(this.layout);this.cancel();this.save();}
 editOptions(s:Simulation){const o=this.layout.objects.filter(o=>Math.hypot(o.x-s.position.x,o.z-s.position.z)<Math.max(o.width,o.length)/2+3).sort((a,b)=>Math.hypot(a.x-s.position.x,a.z-s.position.z)-Math.hypot(b.x-s.position.x,b.z-s.position.z))[0];if(!o)return [];
  return [{label:'Move / Rotate '+o.type,action:()=>this.begin(o)},{label:'Duplicate '+o.type,action:()=>{const copy=structuredClone(o);copy.id=makeObject(o.type).id;copy.x+=1;this.begin(copy);}},{label:'Delete '+o.type,action:()=>{this.remove(o.id);this.layout.objects=this.layout.objects.filter(v=>v.id!==o.id);this.save();}}];}
 update(s:Simulation,f:InputFrame,dt:number){this.prompt.hidden=true;if(!this.placement)return f;
  this.turnDelay=Math.max(0,this.turnDelay-dt);this.cursor.x+=f.steer*dt*6;this.cursor.z+=f.lean*dt*6;
  if(this.turnDelay===0&&(Math.abs(f.rx)>.4||f.pressed.leftModifier||f.pressed.rightModifier)){this.angle+=(f.pressed.leftModifier?-1:f.pressed.rightModifier?1:Math.sign(f.rx))*Math.PI/12;this.turnDelay=.16;}
  const o=this.placement;o.x=Math.round(THREE.MathUtils.clamp(this.cursor.x,-27,27)*4)/4;o.z=Math.round(THREE.MathUtils.clamp(this.cursor.z,-38,38)*4)/4;o.rotation=this.angle;
  this.ghost?.position.set(o.x,o.y,o.z);if(this.ghost)this.ghost.rotation.y=o.rotation;
  const radius=Math.hypot(o.width,o.length)/2;const valid=Math.abs(o.x)+radius<31&&Math.abs(o.z)+radius<43&&Math.hypot(o.x-s.position.x,o.z-s.position.z)>Math.min(radius+1,4)&&this.layout.objects.length<250;
  this.prompt.hidden=false;this.prompt.textContent=`${o.type} · LS move · RS / LB RB rotate · A place · B cancel${valid?'':' · Move clear of rider / walls'}${this.layout.objects.length>160?' · Heavy layout':''}`;
  if(f.pressed.brakeBars)this.cancel();
  else if(f.pressed.hop&&valid){this.remove(o.id);const index=this.layout.objects.findIndex(v=>v.id===o.id);if(index>=0)this.layout.objects[index]=o;else this.layout.objects.push(o);this.add(o);this.park.world.step();this.save();this.cancel();}
  return emptyInput();
 }
}
