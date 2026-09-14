import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { defaultScooter, selectedPart, type ScooterLoadout } from '../data/scooterParts';
import { lathe, extrusion, plate, tube, detailTexture, sidePlate } from './surfaces';
const v=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
/** Shared riding/preview/rack assembly. Animation origins and wheelbase stay unchanged. */
export class ScooterAssembly {
 deckPivot=new THREE.Group();barPivot=new THREE.Group();wheels:THREE.Mesh[]=[];
 gripSockets:THREE.Object3D[]=[];deckSocket=new THREE.Object3D();
 constructor(public root:THREE.Group){this.build(defaultScooter());}
 build(loadout:ScooterLoadout){
  const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>();
  this.root.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])ms.add(m);}});
  gs.forEach(g=>g.dispose());ms.forEach(m=>{const t=m as THREE.MeshStandardMaterial;t.map?.dispose();t.bumpMap?.dispose();t.roughnessMap?.dispose();m.dispose();});
  this.root.clear();this.deckPivot=new THREE.Group();this.barPivot=new THREE.Group();this.wheels=[];
  this.root.add(this.deckPivot,this.barPivot);this.deckPivot.position.z=this.barPivot.position.z=.3;
  const get=(slot:keyof ScooterLoadout)=>selectedPart(loadout[slot]);
  const mats=new Map<string,THREE.MeshStandardMaterial>();
  const mat=(color:number,finish='paint')=>{
   const key=color+'/'+finish;if(mats.has(key))return mats.get(key)!;
   const soft=['rubber','urethane','griptape'].includes(finish),chrome=finish==='steel'||color===0xb8cbc6;
   const parameters={color,metalness:soft?0:chrome?.92:.68,roughness:soft?finish==='urethane'?.66:.88:chrome?.24:.37,envMapIntensity:chrome?1.1:.65};
   const m=color===0x71989b?new THREE.MeshPhysicalMaterial({...parameters,metalness:.92,roughness:.24,iridescence:1,iridescenceIOR:1.35,iridescenceThicknessRange:[140,480]}):new THREE.MeshStandardMaterial(parameters);
   if(finish==='rubber'||finish==='griptape'){m.bumpMap=detailTexture(finish==='rubber'?'rubber':'grip');m.bumpScale=.00022;}
   if(chrome)m.roughnessMap=detailTexture('brushed');m.name=finish;mats.set(key,m);return m;
  };
  const batches=new Map<THREE.Object3D,Map<string,{geometries:THREE.BufferGeometry[];material:THREE.Material;part:string}>>();
  const add=(parent:THREE.Object3D,g:THREE.BufferGeometry,color:number,part:string,finish='paint',pos=v(0,0,0))=>{
   g.translate(pos.x,pos.y,pos.z);if(g.index){const n=g.toNonIndexed();g.dispose();g=n;}
   const m=mat(color,finish),key=part+'/'+m.uuid;let b=batches.get(parent);if(!b){b=new Map();batches.set(parent,b);}if(!b.has(key))b.set(key,{geometries:[],material:m,part});b.get(key)!.geometries.push(g);
  };
  const rod=(p:THREE.Object3D,a:THREE.Vector3,b:THREE.Vector3,r:number,c:number,id:string,finish='paint')=>{
   const g=new THREE.CylinderGeometry(r,r,a.distanceTo(b),24);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v(0,1,0),b.clone().sub(a).normalize()));add(p,g,c,id,finish,a.clone().add(b).multiplyScalar(.5));
  };
  const bolt=(p:THREE.Object3D,pos:THREE.Vector3,id:string,r=.007)=>{
   add(p,lathe([[0,-.003],[r,-.003],[r,.001],[r*.8,.003],[r*.42,.003],[r*.42,.001]],12).rotateZ(Math.PI/2),0xb8cbc6,id,'steel',pos);
   add(p,new THREE.CylinderGeometry(r*.39,r*.39,.002,6).rotateZ(Math.PI/2),0x263333,id,'steel',pos.clone().add(v(-.003,0,0)));
  };
  const d=get('deck'),length=d.part.shape==='street'?.74:d.part.shape==='light'?.57:.62,width=d.part.shape==='street'?.18:d.part.shape==='light'?.115:.135;
  add(this.deckPivot,plate(width,length-.10,.033,.017),d.variant.color,d.part.id,'paint',v(0,.092,-length/2+.04));
  add(this.deckPivot,plate(width*.89,length*.72,.003,.014),0x323d3f,'griptape','griptape',v(0,.111,-length*.47));
  for(const s of [-1,1]){
   add(this.deckPivot,plate(.010,length*.63,.005,.004),d.variant.color,d.part.id,'paint',v(s*width*.29,.073,-length*.46));
   const drop=new THREE.Shape();drop.moveTo(.09,.105);drop.lineTo(.045,.105);drop.quadraticCurveTo(.013,.098,-.012,.074);drop.quadraticCurveTo(-.027,.053,-.011,.039);drop.quadraticCurveTo(.007,.031,.02,.052);drop.lineTo(.041,.075);drop.lineTo(.09,.075);drop.closePath();
   const hole=new THREE.Path();hole.absellipse(0,.055,.0045,.0045,0,Math.PI*2,true);drop.holes.push(hole);
   add(this.deckPivot,sidePlate(drop,.01),d.variant.color,d.part.id,'paint',v(s*.027,0,-length));
  }
  // Curved twin-web neck with a real opening, like a forged/extruded freestyle frame.
  const neck=new THREE.Shape();neck.moveTo(-.158,.108);neck.bezierCurveTo(-.103,.121,-.091,.19,-.036,.254);neck.quadraticCurveTo(-.023,.263,.005,.243);neck.lineTo(.016,.177);neck.bezierCurveTo(-.044,.164,-.066,.109,-.055,.096);neck.lineTo(-.158,.087);neck.closePath();
  const window=new THREE.Path();window.moveTo(-.119,.12);window.bezierCurveTo(-.08,.145,-.073,.19,-.035,.226);window.lineTo(-.038,.189);window.quadraticCurveTo(-.070,.145,-.119,.12);neck.holes.push(window);
  for(const s of [-1,1])add(this.deckPivot,sidePlate(neck,.008,.003),d.variant.color,d.part.id,'paint',v(s*.025,0,0));
  rod(this.root,v(0,.17,.307),v(0,.319,.291),.033,d.variant.color,d.part.id);
  for(const yy of [.179,.309])add(this.root,new THREE.TorusGeometry(.033,.0012,8,32).rotateX(Math.PI/2),d.variant.color,d.part.id,'paint',v(0,yy,.307-(yy-.17)*.107));
  const bars=get('bars'),bw=bars.part.shape==='oversized'?.35:.29,br=bars.part.shape==='oversized'?.019:.016;
  rod(this.barPivot,v(0,.33,-.009),v(0,bars.part.shape==='y'?.91:1.01,-.04),br,bars.variant.color,bars.part.id);
  if(bars.part.shape!=='y')rod(this.barPivot,v(-bw,1.01,-.04),v(bw,1.01,-.04),br,bars.variant.color,bars.part.id);
  else add(this.barPivot,tube([v(-bw,1.01,-.04),v(-.19,1.01,-.04),v(-.095,.965,-.04),v(0,.942,-.04),v(.095,.965,-.04),v(.19,1.01,-.04),v(bw,1.01,-.04)],br),bars.variant.color,bars.part.id);
  add(this.barPivot,new THREE.TorusGeometry(br,.0013,8,28).rotateX(Math.PI/2),bars.variant.color,bars.part.id,'paint',v(0,bars.part.shape==='y'?.917:.99,-.039));
  if(bars.part.shape==='y')for(const s of [-1,1])add(this.barPivot,tube([v(0,.85,-.035),v(s*.025,.89,-.036),v(s*.067,.934,-.04),v(s*.10,.965,-.04)],.007),bars.variant.color,bars.part.id);
  const grips=get('grips');this.gripSockets=[];
  for(const s of [-1,1]){
   const r=grips.part.shape==='soft'?.029:.024;
   add(this.barPivot,lathe([[0,-.065],[r*.83,-.065],[r,-.06],[r,.06],[r*.88,.065],[0,.065]]).rotateZ(Math.PI/2),grips.variant.color,grips.part.id,'rubber',v(s*(bw-.055),1.01,-.04));
   for(let j=0;j<16;j++)add(this.barPivot,new THREE.TorusGeometry(r,.0012,6,24).rotateY(Math.PI/2),grips.variant.color,grips.part.id,'rubber',v(s*(bw-.115+j*.008),1.01,-.04));
   add(this.barPivot,lathe([[0,-.004],[r,-.004],[r+.002,0],[r,.006],[0,.006]]).rotateZ(Math.PI/2),0x263333,grips.part.id,'rubber',v(s*(bw+.014),1.01,-.04));
   const socket=new THREE.Object3D();socket.position.set(s*(bw-.05),1.01,-.04);this.barPivot.add(socket);this.gripSockets.push(socket);
  }
  const clamp=get('clamp'),n=clamp.part.shape==='triple'?3:2,h=n*.021;
  add(this.barPivot,new THREE.LatheGeometry([[.018,-h/2],[.027,-h/2],[.028,-h/2+.003],[.028,h/2-.003],[.027,h/2],[.018,h/2]].map(([x,y])=>new THREE.Vector2(x,y)),32,.09,Math.PI*2-.18),clamp.variant.color,clamp.part.id,'paint',v(0,.336+h/2,-.009));
  for(let i=0;i<n;i++){
   add(this.barPivot,extrusion([[-.020,-.007],[.020,-.007],[.023,.005],[.018,.009],[-.018,.009]],.012,.002),clamp.variant.color,clamp.part.id,'paint',v(0,.348+i*.021,-.035));
   rod(this.barPivot,v(-.024,.348+i*.021,-.035),v(.024,.348+i*.021,-.035),.003,0xb8cbc6,clamp.part.id,'steel');bolt(this.barPivot,v(-.026,.348+i*.021,-.035),clamp.part.id,.0055);
  }
  const hs=get('headset'),cp=get('compression');
  add(this.barPivot,lathe([[.017,0],[.032,0],[.035,.006],[.029,.014],[.018,.019],[.017,.019]]),hs.variant.color,hs.part.id,'steel',v(0,.316,-.009));
  add(this.barPivot,lathe([[.014,0],[.022,0],[.022,.015],[.020,.019],[.014,.019]]),cp.variant.color,cp.part.id,'steel',v(0,.335,-.009));
  const fork=get('fork');
  const blade=new THREE.Shape();blade.moveTo(-.006,.179);blade.quadraticCurveTo(.018,.176,.024,.151);blade.quadraticCurveTo(.026,.101,.059,.071);blade.quadraticCurveTo(.074,.049,.051,.035);blade.quadraticCurveTo(.031,.033,.028,.054);blade.quadraticCurveTo(.025,.102,-.012,.14);blade.quadraticCurveTo(-.019,.169,-.006,.179);
  const axleHole=new THREE.Path();axleHole.absellipse(.045,.055,.0045,.0045,0,Math.PI*2,true);blade.holes.push(axleHole);
  for(const s of [-1,1])add(this.barPivot,sidePlate(blade,fork.part.shape==='reinforced'?.013:.009,.002),fork.variant.color,fork.part.id,'paint',v(s*.024,0,0));
  add(this.barPivot,lathe([[0,0],[.028,0],[.03,.016],[.019,.03],[0,.03]]),fork.variant.color,fork.part.id,'paint',v(0,.15,.006));
  const bearings=get('bearings');
  for(const [slot,parent,z] of [['rearWheel',this.deckPivot,-length],['frontWheel',this.barPivot,.045]] as const){
   const w=get(slot),r=(w.part.compatibility.wheelDiameter??110)/2000;
   const tyre=lathe([[r*.67,-.011],[r*.86,-.0135],[r*.96,-.0105],[r,-.006],[r,.006],[r*.96,.0105],[r*.86,.0135],[r*.67,.011],[r*.67,-.011]],40).rotateZ(Math.PI/2);
   const wheel=new THREE.Mesh(tyre,mat(0x34403f,'urethane'));wheel.position.set(0,.055,z);wheel.userData.part=w.part.id;wheel.userData.slot=slot;wheel.castShadow=true;parent.add(wheel);this.wheels.push(wheel);
   add(wheel,lathe([[r*.55,-.009],[r*.7,-.011],[r*.74,-.006],[r*.74,.006],[r*.7,.011],[r*.55,.009],[r*.55,-.009]],32).rotateZ(Math.PI/2),w.variant.color,w.part.id,'metal');
   for(let i=0;i<5;i++)add(wheel,extrusion([[-.004,.008],[.004,.008],[.007,r*.58],[.002,r*.66],[-.004,r*.61]],.012,.0015).rotateY(Math.PI/2).rotateX(i*Math.PI*2/5),w.variant.color,w.part.id,'metal');
   add(wheel,lathe([[.005,-.014],[.011,-.014],[.013,-.009],[.013,.009],[.011,.014],[.005,.014],[.005,-.014]],24).rotateZ(Math.PI/2),bearings.variant.color,bearings.part.id,'steel');
   rod(parent,v(-.043,.055,z),v(.043,.055,z),.004,0xb8cbc6,bearings.part.id,'steel');for(const s of [-1,1])bolt(parent,v(s*.043,.055,z),bearings.part.id);
  }
  const brake=get('brake'),arc:THREE.Vector3[]=[];
  for(let j=0;j<=20;j++){const a=-.7+j/20*1.9;arc.push(v(0,.055+Math.cos(a)*.071,-length+Math.sin(a)*.071));}
  // Closed swept sheet profile, with thickness and rounded side edges.
  for(const s of [-1,1])add(this.deckPivot,tube(arc.map(p=>p.clone().add(v(s*.022,0,0))),.002),brake.variant.color,brake.part.id,'steel');
  const points:number[]=[],uv:number[]=[],idx:number[]=[];
  for(let i=0;i<arc.length;i++)for(const [x,y] of [[-.022,0],[.022,0],[-.022,-.003],[.022,-.003]]){points.push(x,arc[i].y+y,arc[i].z);uv.push((x+.022)/.044,i/20);}
  for(let i=0;i<20;i++){const a=i*4;for(const [u,w] of [[0,1],[3,2],[2,0],[1,3]])idx.push(a+u,a+w,a+4+u,a+w,a+4+w,a+4+u);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();add(this.deckPivot,g,brake.variant.color,brake.part.id,'steel');
  this.deckSocket=new THREE.Object3D();this.deckSocket.position.set(width*.55,.112,-length*.5);this.deckPivot.add(this.deckSocket);
  for(const [parent,groups] of batches)for(const b of groups.values()){
   const merged=mergeGeometries(b.geometries);const mesh=new THREE.Mesh(merged,b.material);mesh.userData.part=b.part;mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);b.geometries.forEach(g=>g.dispose());
  }
  const decal=(parent:THREE.Object3D,w:number,h:number,pos:THREE.Vector3,rotation:number,vertical=false)=>{
   const c=document.createElement('canvas');c.width=vertical?128:512;c.height=vertical?512:128;const ctx=c.getContext('2d')!;
   ctx.fillStyle='#e8eee7';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`italic 800 ${vertical?92:94}px Arial`;
   if(vertical)'LAZER'.split('').forEach((letter,i)=>ctx.fillText(letter,64,55+i*99));else ctx.fillText('LAZER',256,64);
   const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.MeshStandardMaterial({map:t,transparent:true,alphaTest:.1,roughness:.5,polygonOffset:true,polygonOffsetFactor:-1});
   const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);mesh.position.copy(pos);mesh.rotation.y=rotation;mesh.userData.part=parent===this.deckPivot?d.part.id:bars.part.id;mesh.name='Lazer product mark';parent.add(mesh);
  };
  decal(this.barPivot,.022,.18,v(0,.56,.001),0,true);
  for(const s of [-1,1])decal(this.deckPivot,.23,.025,v(s*(width/2+.003),.093,-length*.43),s*Math.PI/2);
  this.root.userData.loadout=structuredClone(loadout);this.root.userData.assetRevision='stylized-manufactured-1';
 }
}
