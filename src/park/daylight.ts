import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Park } from './park';
import { OUTDOOR, terrainHeight } from './park';
import type { SkyDome } from '../art/sky';
import { BOULDER_CITY, tonight } from '../art/stars';
import { moonAt, moonSky, sunForPhase, type MoonState } from '../art/moon';
import { SkyDome as Dome } from '../art/sky';
import { MAX_PARTICLE_LAMPS, particleLight, parkLampLight } from '../art/particle-light';
import { lampPost, sodiumLamp } from './props';
export type DayPhase='day'|'sunset'|'night'|'sunrise';
/** Lowest the shadow-casting light goes (radians, about 24 degrees): shadows at most ~2.2x an object's height. */
export const MIN_SHADOW_ELEVATION=THREE.MathUtils.degToRad(24);
/** How far back along the light the sun's shadow camera stands (its far plane is 150 m). */
export const SHADOW_DISTANCE=70;
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
 /**
  * Where the beam lands (#75): a little of its light bounces back off the ramp,
  * wall or ground it hits, softly filling the rider and whatever is beside it.
  */
 private bounce=new THREE.PointLight(0xffe8cc,0,7,2);
 private beamRay=new RAPIER.Ray({x:0,y:0,z:0},{x:0,y:-1,z:0});private beamDir=new THREE.Vector3();private bounceTarget=0;
 private heading=new THREE.Vector3();
 private evening?:number;private sidereal=NaN;private ambientBase?:number;
 /** The real moon (#74): worked out every few seconds; `live` places it in the real sky, otherwise it hangs where the night light is. */
 moon?:MoonState;private moonDir=new THREE.Vector3();private moonSun=new THREE.Vector3();private moonClock=99;private moonLive:boolean|null=null;
 /** How much moonlight reaches the ground (0 new or set .. 1 full and high). */
 moonlight=1;
 /** Lamp heads (xyz, reach) that light falling snow, rain and leaves at night (#74). */
 private lampHeads:THREE.Vector4[]=[];private lampTints:number[]=[];
 phase:DayPhase='day';
 constructor(private park:Park){
  park.scene.traverse(o=>{if(o instanceof THREE.DirectionalLight)this.sun=o;if(o instanceof THREE.HemisphereLight)this.ambient=o;});
  if(!OUTDOOR)return;
  // Checked from screenshots, not just coordinates:
  // [21,-34] removed: it stood in the sidewalk entrance beside the rack.
  // [-42,-20] stood inside the scooter rack slab; it now closes the same service
  // row beyond the fountain and trash can, in line with the furniture (#58).
  // [50,-28] stood in the dirt off the end of the east service row; it now
  // ends that row on its pad, in line with the fountain (#58).
  // [-20,32] stood a metre onto the wood park riding apron; it now sits on the
  // lawn just past the apron edge.
  // The parking lamp (first [20,-73], then [24,-84]) never had a good spot in
  // the lot: a wheel stop, then the drive aisle beside a floodlight. It now
  // lights the south footpath from the verge between the floodlight poles.
  for(const [x,z] of [[-20,34.3],[-48.4,-18.6],[49.95,-28.62],[-75,30],[46,-94.4]]){
   const y=terrainHeight(x,z);
   this.lamps.push(lampPost(park,new THREE.Vector3(x,y,z)));
   // Real light on what is under it (#75), where a painted circle of light used to lie.
   this.lampHeads.push(new THREE.Vector4(x+1.05,y+5.8,z,11));this.lampTints.push(0xffdca0);
  }
  // Two dim sodium lights over the metal plaza (#44), on its street side away
  // from the parking lot: one tall behind the metal quarter, one by the street.
  for(const [x,z,yaw,h] of AMBER_POLES){sodiumLamp(park,new THREE.Vector3(x,terrainHeight(x,z),z),yaw,h);this.lampHeads.push(new THREE.Vector4(x+Math.cos(yaw)*1.7,terrainHeight(x,z)+h+.15,z-Math.sin(yaw)*1.7,13));this.lampTints.push(0xff9a3c);}
  this.flashlight.name='Rider flashlight';
  // A real headlamp's beam (#75): a hot centre inside the reflector's ring and a
  // ragged, slightly wide edge, not a perfect disc. It casts shadows, so a ramp,
  // rail or the bars block and shape it; the shadow map is drawn only while it is on.
  this.flashlight.map=beamPattern();
  // Whether it casts, and the map's size, follow the graphics preset (render/fidelity.ts).
  this.flashlight.castShadow=park.scene.userData.fidelity!=='low';
  const s=this.flashlight.shadow;s.mapSize.set(256,256);s.camera.near=.2;s.camera.far=30;s.bias=-.0006;s.normalBias=.02;s.autoUpdate=false;s.needsUpdate=true;
  this.bounce.name='Headlamp bounce';
  park.scene.add(this.flashlight,this.flashlight.target,this.bounce);
 }
 /**
  * `flashlight`: the rider's torch at night (a setting). `yaw`: which way the
  * rider faces, for the beam.
  */
 update(dt:number,phase:DayPhase,player:THREE.Vector3,renderer?:THREE.WebGLRenderer,options:{flashlight?:boolean;yaw?:number;sidereal?:number;live?:boolean;now?:Date}={}){
  this.phase=phase;
  const p=phases[phase],a=1-Math.exp(-dt*.9);
  // An outdoor map's sky dome sets the light: its sun direction swings the key
  // light (long shadows at sunset), its horizon colours the distance haze and
  // it renders the environment every material reflects.
  const dome=this.park.scene.userData.sky as SkyDome|undefined;
  if(dome){
   this.stepMoon(dt,dome,!!options.live,options.now);
   dome.approach(phase,a);dome.step(dt,renderer);
   // The stars stand where they are tonight at 10 pm, or at the real hour when the sky is live.
   const lst=options.sidereal??(this.evening??=tonight());
   if(Math.abs(lst-this.sidereal)>.004){this.sidereal=lst;dome.stars.setSidereal(lst);}
   // Blowing dust (#74) turns the distance tan.
   if(this.park.scene.fog)this.park.scene.fog.color.copy(dome.horizon).lerp(this.color.set(0xc4ab88).multiplyScalar(1-.85*(dome.uniforms.uNight.value)),.6*THREE.MathUtils.clamp(this.park.scene.userData.dustHaze??0,0,1));
   // The key light follows the sun but never drops below MIN_SHADOW_ELEVATION:
   // at sunset the disc sits about 6 degrees up, which threw a 1.8 m rider's
   // shadow 17 m across the ground and past the edge of the shadow map. The sky
   // keeps its low sun and golden colour; shadows stay long but readable.
   const dir=this.shadowDir.copy(dome.sunDirection),minY=Math.sin(MIN_SHADOW_ELEVATION);
   if(dir.y<minY){const flat=Math.hypot(dir.x,dir.z)||1,k=Math.sqrt(1-minY*minY)/flat;dir.set(dir.x*k,minY,dir.z*k);}
   // The shadow camera stands SHADOW_DISTANCE back along the light so everything
   // up to rooftops and treetops is in front of it (#73: this used to shrink to
   // 1 m, clipping every shadow taller than half a metre).
   const offset=this.sun?.userData.shadowOffset as THREE.Vector3|undefined;
   if(offset)offset.copy(dir).multiplyScalar(SHADOW_DISTANCE);
   else if(this.sun)this.sun.position.copy(this.sun.target.position).addScaledVector(dir,SHADOW_DISTANCE);
  }
  if(!OUTDOOR&&!dome)return;
  if(this.park.scene.background instanceof THREE.Color)this.park.scene.background.lerp(this.sky.set(p.sky),a);
  if(this.park.scene.fog&&!dome)this.park.scene.fog.color.lerp(this.sky,a);
  this.park.scene.environmentIntensity+=(p.environment*(1-.3*(this.park.scene.userData.storm??0))-this.park.scene.environmentIntensity)*a;
  // Cloud cover (snowfall, rain; see weather.ts) hides the sun: the key light
  // and its shadows fade, and a storm dims the whole scene.
  const cloud=THREE.MathUtils.clamp(this.park.scene.userData.overcast??0,0,1),storm=THREE.MathUtils.clamp(this.park.scene.userData.storm??0,0,1);
  // At night the key light is moonlight: bright under a full moon, starlight-faint with none.
  const moonPower=1+p.night*(.3+.85*this.moonlight-1);
  if(this.sun){this.sun.color.lerp(this.color.set(p.sun),a);this.sun.intensity+=(p.power*moonPower*(1-.55*cloud-.3*storm)-this.sun.intensity)*a;}
  // A lightning strike (weather.ts) flashes the whole scene through the ambient light.
  this.ambientBase??=this.ambient?.intensity??0;
  this.ambientBase+=(p.ambient*(1-.28*storm)-this.ambientBase)*a;
  if(this.ambient)this.ambient.intensity=this.ambientBase+THREE.MathUtils.clamp(this.park.scene.userData.lightning??0,0,1)*4.2;
  // Path lamps, and any other fixture that registered its lens (props.ts floodlights).
  for(const m of [...this.lamps,...(this.park.scene.userData.lampLenses??[]) as THREE.MeshStandardMaterial[]])m.emissiveIntensity+=(p.night*2-m.emissiveIntensity)*a;
  for(const {lens,pool} of (this.park.scene.userData.amberLights??[]) as {lens:THREE.MeshStandardMaterial;pool:THREE.MeshBasicMaterial}[]){
   // Its light now falls on the ground for real (#75); the old painted pool stays hidden.
   lens.emissiveIntensity+=(p.night*2.4-lens.emissiveIntensity)*a;pool.opacity=0;pool.visible=false;
  }
  // The flashlight: chest height, a little ahead, aimed at the ground ~11 m on.
  // Off, the night is properly dark apart from the lamps, moon and stars.
  const beam=(options.flashlight??true)?p.night:0,yaw=options.yaw??0,f=this.heading.set(Math.sin(yaw),0,Math.cos(yaw));
  this.flashlight.intensity+=(beam*60-this.flashlight.intensity)*(1-Math.exp(-dt*8));
  this.flashlight.position.set(player.x+f.x*.35,player.y+1.35,player.z+f.z*.35);
  this.flashlight.target.position.set(player.x+f.x*11,player.y-.4,player.z+f.z*11);
  this.flashlight.target.updateMatrixWorld();
  const on=this.flashlight.intensity>.5;this.flashlight.shadow.autoUpdate=on;
  if(!on){this.bounceTarget=0;this.bounce.intensity=0;}
  this.bounce.intensity+=(this.bounceTarget-this.bounce.intensity)*(1-Math.exp(-dt*10));
  this.nightLevel=p.night;
  this.lightParticles(dome,cloud);
 }
 /** Weather particles at night (#74): dark but for the headlamp, the lamps and the moon. */
 private lightParticles(dome:SkyDome|undefined,cloud:number){
  const L=particleLight,night=dome?dome.uniforms.uNight.value:this.nightLevel;
  L.uNightDark.value=THREE.MathUtils.clamp((night-.1)/.8,0,1);
  L.uNightBase.value=.1+.3*this.moonlight*(1-cloud);
  L.uBeamOn.value=THREE.MathUtils.clamp(this.flashlight.intensity/60,0,1);
  L.uBeamPos.value.copy(this.flashlight.position);
  L.uBeamDir.value.copy(this.flashlight.target.position).sub(this.flashlight.position).normalize();
  L.uMoonToward.value.copy(this.moonDir);L.uMoonGlint.value=this.moonlight*(1-cloud);
  for(let i=0;i<MAX_PARTICLE_LAMPS;i++){const head=this.lampHeads[i],out=L.uParkLamps.value[i];if(head){out.set(head.x,head.y,head.z,head.w*Math.min(1,night*1.5));parkLampLight.uParkLampTint.value[i].set(this.lampTints[i]);}else out.w=0;}
  parkLampLight.uParkLampPower.value=22*THREE.MathUtils.smoothstep(night,.15,.8);
 }
 private stepMoon(dt:number,dome:SkyDome,live:boolean,now=new Date()){
  this.moonClock+=dt;
  if(this.moonClock>5||live!==this.moonLive||!this.moon){
   this.moonClock=0;this.moonLive=live;
   if(live){const sky=moonSky(now,BOULDER_CITY.lat,BOULDER_CITY.lon);this.moon=sky.state;this.moonDir.copy(sky.moon);this.moonSun.copy(sky.sun);}
   else{this.moon=moonAt(now);this.moonDir.copy(Dome.NIGHT_DIRECTION);sunForPhase(this.moonDir,this.moon,this.moonSun);}
   // Live, the night's key light (and its shadows) comes from the moon while it is up.
   dome.nightDirection=live&&this.moonDir.y>.08?this.moonDir:null;
  }
  const up=THREE.MathUtils.smoothstep(this.moonDir.y,-.02,.2);
  this.moonlight=this.moon!.illumination*up;
  // Not live, the moon shows only as it gets dark (its stand-in spot is the night light's).
  dome.setMoon(this.moonDir,this.moonSun,this.moon!.illumination,live?1:THREE.MathUtils.smoothstep(dome.uniforms.uNight.value,.3,.9));
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
  this.bounceFrom(position,direction);
 }
 /** Finds what the beam's centre hits (surfaces only: not the rider, rails or coping) and puts the bounce there. */
 private bounceFrom(position:THREE.Vector3,direction:THREE.Vector3){
  const d=this.beamDir.copy(direction).normalize(),start=.4,r=this.beamRay;
  r.origin={x:position.x+d.x*start,y:position.y+d.y*start,z:position.z+d.z*start};r.dir={x:d.x,y:d.y,z:d.z};
  const hit=this.park.world.castRay(r,28,true,undefined,(1<<16)|1);
  if(!hit){this.bounceTarget=0;return;}
  const t=hit.timeOfImpact+start,beam=THREE.MathUtils.clamp(this.flashlight.intensity/60,0,1);
  // Back off the surface toward the lamp so the bounce lights the rider's side of it, not the inside.
  this.bounce.position.copy(position).addScaledVector(d,Math.max(.3,t-.6));
  this.bounceTarget=beam*1.6*THREE.MathUtils.clamp(8/(t*t+4),.05,1.2);
 }
}

/** The headlamp's beam pattern: its projected light, looking down the beam. */
function beamPattern(){
 const n=256,c=document.createElement('canvas');c.width=c.height=n;const g=c.getContext('2d')!,image=g.createImageData(n,n);
 // Fixed "random" ripples round the rim, so the edge is irregular but never flickers.
 const ripple=(a:number)=>.045*Math.sin(a*5+.7)+.03*Math.sin(a*11+2.1)+.02*Math.sin(a*23+4.4);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  // A little wider than tall, as lamp reflectors spread the beam sideways.
  const u=(x+.5)/n*2-1,v=((y+.5)/n*2-1)*1.12,r=Math.hypot(u,v),a=Math.atan2(v,u),edge=.93+ripple(a);
  const hot=Math.exp(-r*r*18)*.9,ring=Math.exp(-Math.pow((r-.42)*9,2))*.16,body=.5*(1-THREE.MathUtils.smoothstep(r,.2,edge));
  const fall=1-THREE.MathUtils.smoothstep(r,edge-.12,edge+.04),value=Math.min(1,(hot+ring+body+.12)*fall);
  const i=(y*n+x)*4,warm=value*255;image.data[i]=warm;image.data[i+1]=warm*.985;image.data[i+2]=warm*.95;image.data[i+3]=255;
 }
 g.putImageData(image,0,0);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.name='Headlamp beam';return t;
}
