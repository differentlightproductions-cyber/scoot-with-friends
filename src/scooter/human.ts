import {legFrame} from './limb-frame';
import * as THREE from 'three';
import {detailTexture,lathe,tube} from './surfaces';
import {fittedPoint,type BodyBuild} from './body-fit';
import {fittedHeadwear} from './headwear';
import {clothEdges} from './cloth-edges';
export interface HumanRig {hideHead?:boolean;rider:THREE.Group;hips:THREE.Object3D;torso:THREE.Object3D;head:THREE.Object3D;neck:THREE.Object3D;helmet:THREE.Object3D;upperArms:THREE.Object3D[];forearms:THREE.Object3D[];hands:THREE.Object3D[];thighs:THREE.Object3D[];shins:THREE.Object3D[];shoes:THREE.Object3D[]}
export type CharacterQuality='low'|'medium'|'high';
type MeshAsset={positions:number[][];skinIndex:number[][];skinWeight:number[][];uv:number[][];faces:number[][][];remove?:number[];lod?:Record<string,number[][][]>};
type Asset=MeshAsset&{handPoses:Record<string,{open:number[];closed:number[]}>;names:string[];anchors:number[][][];eyes:number[][];handFrames:{across:number[];along:number[];normal:number[];length:number}[];garments:Record<string,MeshAsset>;hair:MeshAsset};
const assets=new Map<string,Asset>(),requests=new Map<string,Promise<void>>();
export function loadHuman(id:string){
 const key=['rider-01','rider-02','rider-03'].includes(id)?id:'rider-01';
 if(assets.has(key))return Promise.resolve();
 if(!requests.has(key))requests.set(key,fetch(`/models/humans/rider-${Number(key.slice(-2))}.json`).then(r=>{if(!r.ok)throw Error('Character asset could not load');return r.json();}).then(data=>{assets.set(key,data);}));
 return requests.get(key)!;
}
const V=(a:number[])=>new THREE.Vector3().fromArray(a);
const up=new THREE.Vector3(0,1,0);
/** Anatomical CC0 topology, authored garments and a semantic pose adapter.
 * No collider, gameplay event or simulation object is created by this class. */
export class HumanCharacter {
 group=new THREE.Group();private bones:THREE.Bone[]=[];private mesh:THREE.SkinnedMesh;
 private eyes:THREE.Mesh[]=[];private materials:THREE.MeshStandardMaterial[];
 private headwear:THREE.Group;private sourceFrames:THREE.Matrix4[]=[];
 private drivers:THREE.Object3D[];private skeleton:THREE.Skeleton;
 constructor(private model:HumanRig,public id:string,public quality:CharacterQuality,private outfit:{top:string;bottom:string;head:string},colors:number[],public bodyBuild:BodyBuild='regular'){
  const data=assets.get(id)!;if(!data)throw Error('Human must be loaded before construction');
  this.group.name='Anatomical rider '+id;this.group.userData.quality=quality;
  model.hands.forEach((hand,i)=>{hand.userData.palmLength=data.handFrames[i].length;});
  this.drivers=[model.hips,model.torso,model.head,model.neck,model.upperArms[0],model.forearms[0],model.hands[0],model.thighs[0],model.shins[0],model.shoes[0],model.upperArms[1],model.forearms[1],model.hands[1],model.thighs[1],model.shins[1],model.shoes[1]];
  data.names.forEach((name,i)=>{const [a,b]=data.anchors[i].map(V),limb=/upper\.|lower\.|thigh\.|shin\.|neck/.test(name),frame=new THREE.Matrix4();
   if(name==='head')a.add(new THREE.Vector3(0,-.04,-.008));
   if(limb)frame.compose(a.clone().lerp(b,.5),/thigh\.|shin\./.test(name)?legFrame(a,b):new THREE.Quaternion().setFromUnitVectors(up,b.clone().sub(a).normalize()),new THREE.Vector3(1,a.distanceTo(b),1));
   else frame.makeTranslation(a.x,a.y,a.z);
   this.sourceFrames.push(frame);const bone=new THREE.Bone();bone.name='rider:'+name;bone.matrixAutoUpdate=false;bone.matrix.copy(frame);this.group.add(bone);this.bones.push(bone);
  });
  this.materials=colors.map((color,i)=>new THREE.MeshStandardMaterial({color,roughness:i===0?.88:.96,side:THREE.DoubleSide}));
  this.materials.forEach(m=>m.userData.characterQuality=quality);
  const skinTexture=new THREE.TextureLoader().load(`/models/humans/skin-${Number(id.slice(-2))}-${quality}.webp`);skinTexture.colorSpace=THREE.SRGBColorSpace;this.materials[0].map=skinTexture;this.materials[0].color.set(0xffffff);
  if(quality!=='low')for(const m of this.materials.slice(1)){m.bumpMap=detailTexture('fabric');m.bumpScale=.00035;}
  const opened:number[][]=[[],[]],blinked:number[]=[];
  const p:number[]=[],indices:number[][]=[[],[],[]],skin:number[]=[],weights:number[]=[],uv:number[]=[];const cache=new Map<string,number>();
  const positions=data.positions.map((p,i)=>fittedPoint(V(p),data.skinIndex[i],data.skinWeight[i],data.anchors,data.names,bodyBuild)),grid=quality==='low'?.004:quality==='medium'?.002:0;
  const garment=data.garments[outfit.top==='long-sleeve'?'hoodie':outfit.top]??data.garments.tee,covered=new Set(garment.remove);
  const normals=positions.map(()=>new THREE.Vector3());for(const f of data.faces){const ids=f.map(v=>v[0]),n=positions[ids[1]].clone().sub(positions[ids[0]]).cross(positions[ids[2]].clone().sub(positions[ids[0]]));ids.forEach(i=>normals[i].add(n));}normals.forEach(n=>n.normalize());
  const isTop=(i:number)=>{const p=positions[i],w=data.skinWeight[i],b=data.skinIndex[i];const arm=b.reduce((n,v,k)=>n+(/upper\.|lower\./.test(data.names[v])?w[k]:0),0);return p.y>1.0&&p.y<1.48&&Math.abs(p.x)<.24||arm>.35&& (outfit.top!=='tee'||p.y>1.27);};
  const isPants=(i:number)=>positions[i].y<1.01&&positions[i].y>(outfit.bottom==='shorts'?.56:.19)&&Math.abs(positions[i].x)<.29;
  for(const face of data.lod?.[quality]??data.faces){
   const ids=face.map(v=>v[0]);const center=ids.reduce((p,i)=>p.add(positions[i]),new THREE.Vector3()).divideScalar(ids.length);
   // The anatomical feet are covered by the authored sneakers, never rendered through them.
   if(center.y<.205)continue;
   if(ids.some(i=>covered.has(i))&&!(outfit.bottom==='shorts'&&center.y<.59))continue;
   const slot=0;
   const normal=new THREE.Vector3().subVectors(positions[ids[1]],positions[ids[0]]).cross(new THREE.Vector3().subVectors(positions[ids[2]],positions[ids[0]])).normalize();
   const dst=face.map(([i,t])=>{
    const pos=positions[i].clone(),relaxed=pos.clone();
    if(slot){const loose=slot===1?(outfit.top==='tee'?.017:.029):.015;pos.addScaledVector(normals[i],loose);const fold=Math.sin(pos.y*80+pos.x*23)*.0015*Math.sin(pos.z*29);pos.addScaledVector(normals[i],fold);}
    // The hand mesh uses the real fingers from the source mesh, bent into a
    // compact authored grip in the semantic hand frame rather than flat strips.
    const dominant=data.skinIndex[i][0],name=data.names[dominant];
    if(data.handPoses[i]){pos.fromArray(data.handPoses[i].closed);relaxed.fromArray(data.handPoses[i].open);}
    const uvKey=grid?(data.uv[t]??[0,0]).map(v=>Math.round(v/(quality==='low'?.04:.02))).join(','):t;
    const key=slot+':'+(grid?pos.toArray().map(v=>Math.round(v/grid)).join(','):i)+':'+uvKey+':'+data.skinIndex[i][0];
    let index=cache.get(key);if(index===undefined){index=p.length/3;cache.set(key,index);p.push(...pos.toArray());for(let side=0;side<2;side++)opened[side].push(...(name===('hand.'+(side===0?'R':'L'))?relaxed:pos).toArray());const lid=pos.clone();if(name==='head'&&quality!=='low')for(const pt of data.eyes){const e=V(pt),dx=Math.abs(pos.x-e.x),dy=pos.y-e.y;if(dx<.021&&Math.abs(dy)<.024&&pos.z>e.z-.012){const strength=(1-dx/.021)*Math.max(0,1-Math.abs(Math.abs(dy)-.01)/.016);lid.y+=(dy>0?-.016:.006)*strength;}}blinked.push(...lid.toArray());uv.push(...(data.uv[t]??[0,0]).slice(0,2));skin.push(...data.skinIndex[i]);weights.push(...data.skinWeight[i]);}return index;
   });
   for(let n=1;n<dst.length-1;n++)if(new Set([dst[0],dst[n],dst[n+1]]).size===3)indices[slot].push(dst[0],dst[n],dst[n+1]);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skin,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));geometry.setIndex(indices.flat());let start=0;indices.forEach((list,i)=>{geometry.addGroup(start,list.length,i);start+=list.length;});geometry.computeVertexNormals();geometry.morphAttributes.position=[...opened,blinked].map(a=>new THREE.Float32BufferAttribute(a,3));
  this.mesh=new THREE.SkinnedMesh(geometry,this.materials);this.mesh.castShadow=true;this.mesh.frustumCulled=false;this.mesh.name='Continuous anatomical body and tailored garments';this.group.add(this.mesh);model.rider.add(this.group);this.group.updateMatrixWorld(true);this.skeleton=new THREE.Skeleton(this.bones);this.mesh.bind(this.skeleton);
  this.addClothing(garment);
  if(outfit.top==='hoodie'){const hood=new THREE.Mesh(lathe([[.06,-.06],[.082,-.045],[.10,.005],[.09,.07],[.075,.075],[.084,.01],[.067,-.035],[.06,-.045]],quality==='low'?16:32),this.materials[1]);hood.position.set(0,.17,-.11);hood.rotation.x=.7;hood.scale.z=.65;hood.name='Folded cloth hood with lined opening';this.bones[1].add(hood);}

  this.headwear=new THREE.Group();this.headwear.name='Hair and seated eyes';this.group.add(this.headwear);
  const headAnchor=V(data.anchors[2][0]).add(new THREE.Vector3(0,-.04,-.008)),eyeMat=new THREE.MeshStandardMaterial({color:0xd6cec2,roughness:.7}),iris=new THREE.MeshStandardMaterial({color:id==='rider-03'?0x67756a:0x342a23,roughness:.7});
  for(const pt of data.eyes){const e=new THREE.Mesh(new THREE.SphereGeometry(.016,quality==='high'?24:12,12),eyeMat);e.position.copy(V(pt).sub(headAnchor));e.scale.set(1,.9,1);this.headwear.add(e);this.eyes.push(e);const pupil=new THREE.Mesh(new THREE.SphereGeometry(.0055,16,12),iris);pupil.position.z=.016;pupil.scale.z=.35;e.add(pupil);const black=new THREE.Mesh(new THREE.SphereGeometry(.0024,12,8),new THREE.MeshStandardMaterial({color:0x141619,roughness:.8}));black.position.z=.0026;pupil.add(black);}
  if(outfit.head==='none')this.addHair(data.hair);
  const used=new Set(data.faces.flatMap(f=>f.map(v=>v[0])));const skull=data.positions.filter((_,i)=>used.has(i)&&data.names[data.skinIndex[i][0]]==='head').map(p=>V(p).sub(headAnchor));
  this.headwear.add(fittedHeadwear(skull,outfit.head,model.helmet instanceof THREE.Mesh?(model.helmet.material as THREE.MeshStandardMaterial).color.getHex():0xb84836,quality));
  this.model.helmet.visible=false;
  this.update(0);
 }
 private addHair(asset:MeshAsset){
  const p:number[]=[],uv:number[]=[],skin:number[]=[],weight:number[]=[],index:number[]=[],cache=new Map<string,number>();
  for(const f of asset.lod?.[this.quality]??asset.faces){const head=assets.get(this.id)!.anchors[2][0];if(this.outfit.head!=='none'&&f.every(([i])=>asset.positions[i][1]>head[1]-.018))continue;const vertices=f.map(([i,t])=>{const key=i+':'+t;let n=cache.get(key);if(n===undefined){n=p.length/3;cache.set(key,n);p.push(...asset.positions[i]);uv.push(...asset.uv[t].slice(0,2));skin.push(2,0,0,0);weight.push(1,0,0,0);}return n;});for(let i=1;i<vertices.length-1;i++)index.push(vertices[0],vertices[i],vertices[i+1]);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skin,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weight,4));g.setIndex(index);g.computeVertexNormals();const map=new THREE.TextureLoader().load(`/models/humans/hair-${Number(this.id.slice(-2))}-${this.quality}.webp`);map.colorSpace=THREE.SRGBColorSpace;const mat=new THREE.MeshStandardMaterial({map,alphaTest:.5,side:THREE.DoubleSide,roughness:1});const mesh=new THREE.SkinnedMesh(g,mat);mesh.name='Authored hairstyle';mesh.castShadow=true;mesh.frustumCulled=false;this.group.add(mesh);this.group.updateMatrixWorld(true);mesh.bind(this.skeleton,this.mesh.bindMatrix);
 }
 private addClothing(asset:MeshAsset){
  const p:number[]=[],uv:number[]=[],skin:number[]=[],weight:number[]=[],index:number[][]=[[],[]],cache=new Map<string,number>();
  const parents=asset.positions.map((_,i)=>i);const find=(i:number):number=>parents[i]===i?i:parents[i]=find(parents[i]);for(const f of asset.faces)for(const a of f)parents[find(a[0])]=find(f[0][0]);const tops=new Map<number,number>();asset.positions.forEach((p,i)=>tops.set(find(i),Math.max(tops.get(find(i))??0,p[1])));
  for(const f of asset.lod?.[this.quality]??asset.faces){
   if(this.outfit.bottom==='shorts'&&f.every(([i])=>asset.positions[i][1]<.59))continue;
   const slot=(tops.get(find(f[0][0]))??0)>1.25?0:1;
   const vertices=f.map(([i,t])=>{
    const key=i+':'+t;let idx=cache.get(key);if(idx!==undefined)return idx;
    idx=p.length/3;cache.set(key,idx);const data=assets.get(this.id)!;
    const joints=[...asset.skinIndex[i]],weights=[...asset.skinWeight[i]],rest=V(asset.positions[i]);
    // A shirt hem is supported by the pelvis, not the nearby thigh. Nearest
    // body weights otherwise pull individual hem vertices between the legs.
    if(slot===0&&rest.y<1.15)for(let k=0;k<4;k++)if(/thigh|shin|foot/.test(data.names[joints[k]]))joints[k]=0;
    const point=fittedPoint(rest,joints,weights,data.anchors,data.names,this.bodyBuild);
    if(slot===0){const hem=1-THREE.MathUtils.smoothstep(rest.y,.96,1.16);point.x*=1+hem*.08;point.z+=Math.sign(point.z-data.anchors[0][0][2])*hem*.018;}
    if(this.outfit.bottom==='shorts')point.y=Math.max(.59,point.y);
    p.push(...point.toArray());uv.push(...asset.uv[t].slice(0,2));skin.push(...joints);weight.push(...weights);return idx;
   });
   for(let n=1;n<vertices.length-1;n++)index[slot].push(vertices[0],vertices[n],vertices[n+1]);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skin,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weight,4));g.setIndex(index.flat());g.addGroup(0,index[0].length,0);g.addGroup(index[0].length,index[1].length,1);g.computeVertexNormals();clothEdges(g);const m=new THREE.SkinnedMesh(g,this.materials.slice(1));m.name='Constructed cloth: collar, sleeves, waistband, pockets and trousers';m.castShadow=true;m.frustumCulled=false;this.group.add(m);this.group.updateMatrixWorld(true);m.bind(this.skeleton,this.mesh.bindMatrix);
 }
 update(time:number){
  this.drivers.forEach((d,i)=>{d.updateMatrix();this.bones[i].matrix.copy(d.matrix);});
  // First person, local rider only: the head bone collapses to the top of the
  // neck so face, eyes and hair never sit in front of the lens. Remote riders
  // are separate models and keep their heads.
  const hidden=!!this.model.hideHead;if(hidden){const collar=new THREE.Vector3(0,.12,-.02).applyMatrix4(this.bones[1].matrix),tiny=new THREE.Matrix4().makeTranslation(collar.x,collar.y,collar.z).scale(new THREE.Vector3(.001,.001,.001));this.bones[2].matrix.copy(tiny);this.bones[3].matrix.copy(tiny);}
  this.headwear.visible=!hidden;this.eyes.forEach(e=>e.visible=!hidden);
  this.headwear.position.copy(this.model.head.position);this.headwear.quaternion.copy(this.model.head.quaternion);
  this.model.helmet.position.z=this.model.head.position.z+.006;
  const blink=this.quality==='low'?0:Math.max(0,1-Math.abs((time%4.7)-.16)/.065);this.eyes.forEach(e=>e.scale.y=.9*(1-blink*.94));if(this.mesh.morphTargetInfluences){this.mesh.morphTargetInfluences[0]=this.model.hands[0].userData.openHand??0;this.mesh.morphTargetInfluences[1]=this.model.hands[1].userData.openHand??0;this.mesh.morphTargetInfluences[2]=blink;}
 }
 dispose(){this.group.removeFromParent();const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.group.traverse(o=>{if(o instanceof THREE.Mesh){geometry.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});geometry.forEach(g=>g.dispose());materials.forEach(m=>{const map=(m as THREE.MeshStandardMaterial).map;if(map&&/models\/humans/.test(map.image?.src??""))map.dispose();m.dispose();});this.skeleton.dispose();}
}

