import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { canopy } from '../park/art';
export type Fidelity='low'|'medium'|'high';
export class VisualFidelity {
 quality:Fidelity='high';environment:THREE.Texture;private shadowLights:{light:THREE.DirectionalLight;offset:THREE.Vector3}[]=[];
 private scene?:THREE.Scene;private materialFeatures=new Map<THREE.MeshStandardMaterial,{bump:THREE.Texture|null;rough:THREE.Texture|null}>();
 private treeMatrices:THREE.Matrix4[]=[];private treeColors:THREE.Color[]=[];private farTrees?:THREE.InstancedMesh;private nearTrees?:THREE.InstancedMesh;private age=1;
 constructor(private renderer:THREE.WebGLRenderer){const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();}
 apply(scene:THREE.Scene,quality:Fidelity){
  this.quality=quality;this.scene=scene;this.shadowLights=[];scene.environment=this.environment;scene.environmentIntensity=.35;
  const low=quality==='low',high=quality==='high';this.renderer.setPixelRatio(Math.min(devicePixelRatio,low?.85:high?1.7:1.15));
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=high?THREE.PCFSoftShadowMap:THREE.PCFShadowMap;
  const size=high?2048:low?512:1024;
  scene.traverse(o=>{
   if(o instanceof THREE.DirectionalLight){if(!o.userData.shadowOffset)o.userData.shadowOffset=o.position.clone().sub(o.target.position);this.shadowLights.push({light:o,offset:o.userData.shadowOffset});if(!o.target.parent)scene.add(o.target);if(o.shadow.mapSize.x!==size){o.shadow.map?.dispose();o.shadow.map=null;o.shadow.mapSize.set(size,size);}Object.assign(o.shadow.camera,{left:low?-12:-24,right:low?12:24,top:low?12:24,bottom:low?-12:-24});o.shadow.camera.updateProjectionMatrix();o.shadow.bias=-.0002;o.shadow.normalBias=.012;}
   if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial){
    if(!this.materialFeatures.has(m))this.materialFeatures.set(m,{bump:m.bumpMap,rough:m.roughnessMap});const saved=this.materialFeatures.get(m)!;
    const materialLow=m.userData.characterQuality?m.userData.characterQuality==='low':low;
    m.bumpMap=materialLow?null:saved.bump;m.roughnessMap=materialLow?null:saved.rough;m.envMapIntensity=m.metalness>.5?(low?.45:.8):.15;
    if(m.map)m.map.anisotropy=high?Math.min(8,this.renderer.capabilities.getMaxAnisotropy()):2;m.needsUpdate=true;
   }
  });
  const crowns=scene.getObjectByName('tree-crowns') as THREE.InstancedMesh|undefined;
  if(crowns){
   if(this.farTrees!==crowns){this.treeMatrices=[];this.treeColors=[];for(let i=0;i<crowns.count;i++){const m=new THREE.Matrix4(),c=new THREE.Color();crowns.getMatrixAt(i,m);crowns.getColorAt(i,c);this.treeMatrices.push(m);this.treeColors.push(c);}}
   if(this.nearTrees){this.nearTrees.removeFromParent();this.nearTrees.geometry.dispose();this.nearTrees=undefined;}
   crowns.geometry.dispose();crowns.geometry=canopy(1);this.farTrees=crowns;
   (crowns.material as THREE.MeshStandardMaterial).vertexColors=true;(crowns.material as THREE.MeshStandardMaterial).flatShading=false;(crowns.material as THREE.MeshStandardMaterial).needsUpdate=true;
   if(high){this.nearTrees=new THREE.InstancedMesh(canopy(2),crowns.material,this.treeMatrices.length);this.nearTrees.name='Nearby layered foliage';this.nearTrees.castShadow=true;scene.add(this.nearTrees);}
   this.age=1;this.update(new THREE.Vector3(),1);
  }
  scene.userData.fidelity=quality;
 }
 update(player:THREE.Vector3,dt:number){
  for(const {light,offset}of this.shadowLights){const x=Math.round(player.x*16)/16,z=Math.round(player.z*16)/16;light.target.position.set(x,Math.round(player.y),z);light.position.copy(offset).add(light.target.position);light.target.updateMatrixWorld();}
  this.age+=dt;if(this.age<.3||!this.farTrees)return;this.age=0;let near=0,far=0;
  const range=this.quality==='low'?85:this.quality==='medium'?130:190;
  this.treeMatrices.forEach((m,i)=>{const dx=m.elements[12]-player.x,dz=m.elements[14]-player.z,d=Math.hypot(dx,dz);if(d>range)return;const target=this.nearTrees&&d<38?this.nearTrees:this.farTrees!;const index=target===this.nearTrees?near++:far++;target.setMatrixAt(index,m);target.setColorAt(index,this.treeColors[i]);});
  for(const [tree,count] of [[this.farTrees,far],[this.nearTrees,near]] as const)if(tree){tree.count=count;tree.instanceMatrix.needsUpdate=true;if(tree.instanceColor)tree.instanceColor.needsUpdate=true;tree.computeBoundingSphere();}
 }
 disposeScene(){this.materialFeatures.clear();this.scene=undefined;this.farTrees=this.nearTrees=undefined;this.treeMatrices=[];this.treeColors=[];}
}
