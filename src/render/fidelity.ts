import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
export type Fidelity='low'|'medium'|'high';
export class VisualFidelity {
 quality:Fidelity='high';environment:THREE.Texture;private shadowLights:{light:THREE.DirectionalLight;offset:THREE.Vector3}[]=[];
 private scene?:THREE.Scene;private materialFeatures=new Map<THREE.MeshStandardMaterial,{bump:THREE.Texture|null;rough:THREE.Texture|null}>();
 constructor(private renderer:THREE.WebGLRenderer){const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();}
 apply(scene:THREE.Scene,quality:Fidelity){
  this.quality=quality;this.scene=scene;this.shadowLights=[];scene.environment=scene.userData.skyEnvironment??this.environment;scene.environmentIntensity=.35;
  const low=quality==='low',high=quality==='high';this.renderer.setPixelRatio(Math.min(devicePixelRatio,low?.85:high?1.7:1.15));
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=high?THREE.PCFSoftShadowMap:THREE.PCFShadowMap;
  const size=high?2048:low?512:1024;
  scene.traverse(o=>{
   if(o instanceof THREE.DirectionalLight){if(!o.userData.shadowOffset)o.userData.shadowOffset=o.position.clone().sub(o.target.position);this.shadowLights.push({light:o,offset:o.userData.shadowOffset});if(!o.target.parent)scene.add(o.target);if(o.shadow.mapSize.x!==size){o.shadow.map?.dispose();o.shadow.map=null;o.shadow.mapSize.set(size,size);}Object.assign(o.shadow.camera,{left:low?-12:-24,right:low?12:24,top:low?12:24,bottom:low?-12:-24});o.shadow.camera.updateProjectionMatrix();o.shadow.bias=-.0002;o.shadow.normalBias=.012;}
   if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial){
    if(!this.materialFeatures.has(m))this.materialFeatures.set(m,{bump:m.bumpMap,rough:m.roughnessMap});const saved=this.materialFeatures.get(m)!;
    m.bumpMap=low?null:saved.bump;m.roughnessMap=low?null:saved.rough;m.envMapIntensity=m.metalness>.5?(low?.45:.8):.15;
    if(m.map)m.map.anisotropy=high?Math.min(8,this.renderer.capabilities.getMaxAnisotropy()):2;m.needsUpdate=true;
   }
  });
  // Scattered plants and rocks thin out evenly on lower settings (their
  // instances are pre-shuffled, so a leading fraction is an even subset).
  const density=low?.35:high?1:.65;
  scene.traverse(o=>{if(o instanceof THREE.InstancedMesh&&o.userData.scatterCount)o.count=Math.max(1,Math.round(o.userData.scatterCount*density));});
  scene.userData.fidelity=quality;
 }
 update(player:THREE.Vector3,dt:number){
  for(const {light,offset}of this.shadowLights){const x=Math.round(player.x*16)/16,z=Math.round(player.z*16)/16;light.target.position.set(x,Math.round(player.y),z);light.position.copy(offset).add(light.target.position);light.target.updateMatrixWorld();}
 }
 disposeScene(){this.materialFeatures.clear();this.scene=undefined;}
}
