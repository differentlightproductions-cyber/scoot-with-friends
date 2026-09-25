import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
export type Fidelity='low'|'medium'|'high';
/**
 * Render resolution per preset, from the screen's own ratio (capped at 1.5 so a
 * 3x phone is not asked for 3x): Low draws 25% under it, Medium at it, High 35%
 * over it (supersampled on an ordinary 1x screen), never above 2.
 */
export const fidelityPixelRatio=(quality:Fidelity,device:number)=>{const base=Math.min(device||1,1.5);return +Math.min(2,base*(quality==='low'?.75:quality==='high'?1.35:1)).toFixed(3);};
export class VisualFidelity {
 quality:Fidelity='high';environment:THREE.Texture;private shadowLights:{light:THREE.DirectionalLight;offset:THREE.Vector3}[]=[];
 private scene?:THREE.Scene;private materialFeatures=new Map<THREE.MeshStandardMaterial,{bump:THREE.Texture|null;rough:THREE.Texture|null}>();
 constructor(private renderer:THREE.WebGLRenderer){const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();}
 apply(scene:THREE.Scene,quality:Fidelity){
  this.quality=quality;this.scene=scene;this.shadowLights=[];scene.environment=scene.userData.skyEnvironment??this.environment;scene.environmentIntensity=.35;
  const low=quality==='low',high=quality==='high';this.renderer.setPixelRatio(fidelityPixelRatio(quality,devicePixelRatio));
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
 /**
  * The sun's shadow map follows the rider (#73). It moves only in whole shadow
  * texels across the light's own view, so still shadows keep exactly the same
  * texels as the frustum slides: no crawling edges on the ground, and no jump
  * when the rider climbs a ramp (height used to round to whole metres).
  */
 update(player:THREE.Vector3,dt:number){
  const toLight=this.axisZ,right=this.axisX,up=this.axisY;
  for(const {light,offset}of this.shadowLights){
   const cam=light.shadow.camera,texel=(cam.right-cam.left)/light.shadow.mapSize.x;
   // The shadow camera's own axes (Matrix4.lookAt with world up, as three.js builds it).
   toLight.copy(offset).normalize();right.set(0,1,0).cross(toLight);if(right.lengthSq()<1e-8)right.set(1,0,0);right.normalize();up.copy(toLight).cross(right);
   const snap=(v:number)=>Math.round(v/texel)*texel;
   light.target.position.copy(right).multiplyScalar(snap(player.dot(right))).addScaledVector(up,snap(player.dot(up))).addScaledVector(toLight,player.dot(toLight));
   light.position.copy(offset).add(light.target.position);light.target.updateMatrixWorld();
  }
 }
 private axisX=new THREE.Vector3();private axisY=new THREE.Vector3();private axisZ=new THREE.Vector3();
 disposeScene(){this.materialFeatures.clear();this.scene=undefined;}
}
