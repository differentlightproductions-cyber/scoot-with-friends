import * as THREE from 'three';
import type { Park } from './park';
import { OUTDOOR, terrainHeight } from './park';
import type { SkyDome } from '../art/sky';
export type DayPhase='day'|'sunset'|'night'|'sunrise';
const phases={day:{sky:0xb3d2df,sun:0xffedce,power:3.2,ambient:1.15,environment:.35,night:0},sunset:{sky:0xb28283,sun:0xffa05f,power:2,ambient:.75,environment:.24,night:.35},night:{sky:0x111d31,sun:0x9bb9e8,power:.42,ambient:.34,environment:.11,night:1},sunrise:{sky:0xccabb1,sun:0xffc695,power:1.7,ambient:1.25,environment:.28,night:.25}};
export class Daylight {
 private sky=new THREE.Color();private color=new THREE.Color();
 private lamps:THREE.MeshStandardMaterial[]=[];
 private sun?:THREE.DirectionalLight;private ambient?:THREE.HemisphereLight;
 private light=new THREE.PointLight(0xffdca4,0,35,1.5);
 phase:DayPhase='day';
 constructor(private park:Park){
  park.scene.traverse(o=>{if(o instanceof THREE.DirectionalLight)this.sun=o;if(o instanceof THREE.HemisphereLight)this.ambient=o;});
  if(!OUTDOOR)return;
  // Checked from screenshots, not just coordinates:
  // [21,-34] removed: it stood in the sidewalk entrance beside the rack.
  // [-42,-20] stood inside the scooter rack slab; it now closes the same service
  // row beyond the fountain, in line with the furniture.
  // [-20,32] stood a metre onto the wood park riding apron; it now sits on the
  // lawn just past the apron edge.
  // The parking lamp (first [20,-73], then [24,-84]) never had a good spot in
  // the lot: a wheel stop, then the drive aisle beside a floodlight. It now
  // lights the south footpath from the verge between the floodlight poles.
  for(const [x,z] of [[-20,34.3],[-47.3,-20],[50,-28],[-75,30],[46,-94.4]]){
   const y=terrainHeight(x,z);
   park.box(new THREE.Vector3(x,y+.09,z),new THREE.Vector3(.52,.18,.52),0x6a7472,true);
   park.box(new THREE.Vector3(x,y+3,z),new THREE.Vector3(.12,6,.12),0x485757,true);
   park.box(new THREE.Vector3(x+.5,y+5.9,z),new THREE.Vector3(1.1,.08,.08),0x485757,false);
   const lamp=park.box(new THREE.Vector3(x+1,y+5.87,z),new THREE.Vector3(.65,.12,.36),0xffe2aa,false);
   const mat=lamp.material as THREE.MeshStandardMaterial;mat.emissive.set(0xffd698);this.lamps.push(mat);
   const pool=new THREE.Mesh(new THREE.CircleGeometry(5,24),new THREE.MeshBasicMaterial({color:0xffdc9a,transparent:true,opacity:0,depthWrite:false}));
   pool.rotation.x=-Math.PI/2;pool.position.set(x+1,y+.025,z);pool.name='Lamp pool';park.scene.add(pool);
  }
  this.light.position.set(0,6,0);park.scene.add(this.light);
 }
 update(dt:number,phase:DayPhase,player:THREE.Vector3,renderer?:THREE.WebGLRenderer){
  this.phase=phase;
  const p=phases[phase],a=1-Math.exp(-dt*.9);
  // An outdoor map's sky dome sets the light: its sun direction swings the key
  // light (long shadows at sunset), its horizon colours the distance haze and
  // it renders the environment every material reflects.
  const dome=this.park.scene.userData.sky as SkyDome|undefined;
  if(dome){
   dome.approach(phase,a);dome.step(dt,renderer);
   if(this.park.scene.fog)this.park.scene.fog.color.copy(dome.horizon);
   const offset=this.sun?.userData.shadowOffset as THREE.Vector3|undefined;
   if(offset)offset.copy(dome.sunDirection).multiplyScalar(offset.length()||60);
   else if(this.sun)this.sun.position.copy(this.sun.target.position).addScaledVector(dome.sunDirection,60);
  }
  if(!OUTDOOR&&!dome)return;
  if(this.park.scene.background instanceof THREE.Color)this.park.scene.background.lerp(this.sky.set(p.sky),a);
  if(this.park.scene.fog&&!dome)this.park.scene.fog.color.lerp(this.sky,a);
  this.park.scene.environmentIntensity+=(p.environment-this.park.scene.environmentIntensity)*a;
  if(this.sun){this.sun.color.lerp(this.color.set(p.sun),a);this.sun.intensity+=(p.power-this.sun.intensity)*a;}
  if(this.ambient)this.ambient.intensity+=(p.ambient-this.ambient.intensity)*a;
  this.lamps.forEach(m=>m.emissiveIntensity+=(p.night*2-m.emissiveIntensity)*a);
  this.park.scene.children.forEach(o=>{if(o.name==='Lamp pool'){const m=(o as THREE.Mesh).material as THREE.MeshBasicMaterial;m.opacity+=(p.night*.095-m.opacity)*a;}});
  this.light.intensity+=(p.night*7-this.light.intensity)*a;
  this.light.position.set(player.x,5,player.z);
 }
}
