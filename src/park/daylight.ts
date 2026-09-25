import * as THREE from 'three';
import type { Park } from './park';
import { OUTDOOR, terrainHeight } from './park';
import type { SkyDome } from '../art/sky';
import { tonight } from '../art/stars';
import { lampPost, sodiumLamp } from './props';
export type DayPhase='day'|'sunset'|'night'|'sunrise';
/** Lowest the shadow-casting light goes (radians, about 24 degrees): shadows at most ~2.2x an object's height. */
export const MIN_SHADOW_ELEVATION=THREE.MathUtils.degToRad(24);
const phases={day:{sky:0xb3d2df,sun:0xffedce,power:3.2,ambient:1.15,environment:.35,night:0},sunset:{sky:0xb28283,sun:0xffa05f,power:2,ambient:.75,environment:.24,night:.35},night:{sky:0x111d31,sun:0x9bb9e8,power:.3,ambient:.2,environment:.07,night:1},sunrise:{sky:0xccabb1,sun:0xffc695,power:1.7,ambient:1.25,environment:.28,night:.25}};
/** [x, z, yaw, height] of the metal plaza's amber street lights; checked in renders. */
export const AMBER_POLES:[number,number,number,number][]=[[-76,29.2,Math.PI/2,9.5],[-52,29.2,Math.PI/2,7]];
export class Daylight {
 private sky=new THREE.Color();private color=new THREE.Color();private shadowDir=new THREE.Vector3();
 private lamps:THREE.MeshStandardMaterial[]=[];
 private sun?:THREE.DirectionalLight;private ambient?:THREE.HemisphereLight;
 /**
  * The rider's headlamp (#44, #64): a beam ahead of the rider at night, when the
  * setting is on, aimed from the lamp on their head by aimLamp(). It is the park's one moving light (it replaced the glow that
  * used to follow the rider) and stays in the scene at zero by day, so turning
  * it on or off never changes the light count and recompiles every shader.
  */
 private flashlight=new THREE.SpotLight(0xfff0da,0,40,.62,.55,1.25);
 private heading=new THREE.Vector3();
 private evening?:number;private sidereal=NaN;private ambientBase?:number;
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
   this.lamps.push(lampPost(park,new THREE.Vector3(x,y,z)));
   const pool=new THREE.Mesh(new THREE.CircleGeometry(5,24),new THREE.MeshBasicMaterial({color:0xffdc9a,transparent:true,opacity:0,depthWrite:false}));
   pool.rotation.x=-Math.PI/2;pool.position.set(x+1,y+.025,z);pool.name='Lamp pool';park.scene.add(pool);
  }
  // Two dim sodium lights over the metal plaza (#44), on its street side away
  // from the parking lot: one tall behind the metal quarter, one by the street.
  for(const [x,z,yaw,h] of AMBER_POLES)sodiumLamp(park,new THREE.Vector3(x,terrainHeight(x,z),z),yaw,h);
  this.flashlight.name='Rider flashlight';
  park.scene.add(this.flashlight,this.flashlight.target);
 }
 /**
  * `flashlight`: the rider's torch at night (a setting). `yaw`: which way the
  * rider faces, for the beam.
  */
 update(dt:number,phase:DayPhase,player:THREE.Vector3,renderer?:THREE.WebGLRenderer,options:{flashlight?:boolean;yaw?:number;sidereal?:number}={}){
  this.phase=phase;
  const p=phases[phase],a=1-Math.exp(-dt*.9);
  // An outdoor map's sky dome sets the light: its sun direction swings the key
  // light (long shadows at sunset), its horizon colours the distance haze and
  // it renders the environment every material reflects.
  const dome=this.park.scene.userData.sky as SkyDome|undefined;
  if(dome){
   dome.approach(phase,a);dome.step(dt,renderer);
   // The stars stand where they are tonight at 10 pm, or at the real hour when the sky is live.
   const lst=options.sidereal??(this.evening??=tonight());
   if(Math.abs(lst-this.sidereal)>.004){this.sidereal=lst;dome.stars.setSidereal(lst);}
   if(this.park.scene.fog)this.park.scene.fog.color.copy(dome.horizon);
   // The key light follows the sun but never drops below MIN_SHADOW_ELEVATION:
   // at sunset the disc sits about 6 degrees up, which threw a 1.8 m rider's
   // shadow 17 m across the ground and past the edge of the shadow map. The sky
   // keeps its low sun and golden colour; shadows stay long but readable.
   const dir=this.shadowDir.copy(dome.sunDirection),minY=Math.sin(MIN_SHADOW_ELEVATION);
   if(dir.y<minY){const flat=Math.hypot(dir.x,dir.z)||1,k=Math.sqrt(1-minY*minY)/flat;dir.set(dir.x*k,minY,dir.z*k);}
   const offset=this.sun?.userData.shadowOffset as THREE.Vector3|undefined;
   if(offset)offset.copy(dir).multiplyScalar(offset.length()||60);
   else if(this.sun)this.sun.position.copy(this.sun.target.position).addScaledVector(dir,60);
  }
  if(!OUTDOOR&&!dome)return;
  if(this.park.scene.background instanceof THREE.Color)this.park.scene.background.lerp(this.sky.set(p.sky),a);
  if(this.park.scene.fog&&!dome)this.park.scene.fog.color.lerp(this.sky,a);
  this.park.scene.environmentIntensity+=(p.environment*(1-.3*(this.park.scene.userData.storm??0))-this.park.scene.environmentIntensity)*a;
  // Cloud cover (snowfall, rain; see weather.ts) hides the sun: the key light
  // and its shadows fade, and a storm dims the whole scene.
  const cloud=THREE.MathUtils.clamp(this.park.scene.userData.overcast??0,0,1),storm=THREE.MathUtils.clamp(this.park.scene.userData.storm??0,0,1);
  if(this.sun){this.sun.color.lerp(this.color.set(p.sun),a);this.sun.intensity+=(p.power*(1-.55*cloud-.3*storm)-this.sun.intensity)*a;}
  // A lightning strike (weather.ts) flashes the whole scene through the ambient light.
  this.ambientBase??=this.ambient?.intensity??0;
  this.ambientBase+=(p.ambient*(1-.28*storm)-this.ambientBase)*a;
  if(this.ambient)this.ambient.intensity=this.ambientBase+THREE.MathUtils.clamp(this.park.scene.userData.lightning??0,0,1)*4.2;
  // Path lamps, and any other fixture that registered its lens (props.ts floodlights).
  for(const m of [...this.lamps,...(this.park.scene.userData.lampLenses??[]) as THREE.MeshStandardMaterial[]])m.emissiveIntensity+=(p.night*2-m.emissiveIntensity)*a;
  this.park.scene.children.forEach(o=>{if(o.name==='Lamp pool'){const m=(o as THREE.Mesh).material as THREE.MeshBasicMaterial;m.opacity+=(p.night*.095-m.opacity)*a;}});
  for(const {lens,pool} of (this.park.scene.userData.amberLights??[]) as {lens:THREE.MeshStandardMaterial;pool:THREE.MeshBasicMaterial}[]){
   lens.emissiveIntensity+=(p.night*2.4-lens.emissiveIntensity)*a;pool.opacity+=(p.night*.13-pool.opacity)*a;
  }
  // The flashlight: chest height, a little ahead, aimed at the ground ~11 m on.
  // Off, the night is properly dark apart from the lamps, moon and stars.
  const beam=(options.flashlight??true)?p.night:0,yaw=options.yaw??0,f=this.heading.set(Math.sin(yaw),0,Math.cos(yaw));
  this.flashlight.intensity+=(beam*60-this.flashlight.intensity)*(1-Math.exp(-dt*8));
  this.flashlight.position.set(player.x+f.x*.35,player.y+1.35,player.z+f.z*.35);
  this.flashlight.target.position.set(player.x+f.x*11,player.y-.4,player.z+f.z*11);
  this.flashlight.target.updateMatrixWorld();
  this.nightLevel=p.night;
 }
 /** How dark it is (0 day .. 1 night), as the lights last saw it. */
 nightLevel=0;
 /**
  * Aims the beam from the headlamp itself: from its lens along the way the head
  * faces, so it turns with every look, flip and spin (first person: the eye).
  */
 aimLamp(position:THREE.Vector3,direction:THREE.Vector3){
  this.flashlight.position.copy(position);
  this.flashlight.target.position.copy(position).addScaledVector(direction,11);
  this.flashlight.target.updateMatrixWorld();
 }
}
