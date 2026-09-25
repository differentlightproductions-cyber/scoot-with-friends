import * as THREE from 'three';
import type { Fidelity } from '../render/fidelity';
import { ACTIVE_MAP, terrainHeight } from './park';
export type WeatherMode='sunny'|'fall'|'snow'|'rain';
type Hook={compile:THREE.Material['onBeforeCompile'];cache:()=>string};
/** What the weather needs to know about the rider this frame (all optional). */
export interface WeatherRider{camera?:THREE.Vector3;velocity?:THREE.Vector3;yaw?:number;riding?:boolean;grounded?:boolean;landing?:number}
const TAU=Math.PI*2;
// Snowfall as falling ice crystals, in world space, so the rider moves through
// it rather than carrying a snow globe along:
//  - Flake sizes follow an exponential (Gunn-Marshall-like) distribution:
//    many small crystals, few large aggregates.
//  - Each falls at its terminal velocity, v = 0.8 D^0.16 m/s (Locatelli &
//    Hobbs, unrimed aggregates, D in mm): about 0.8-1.1 m/s. Snow is slow.
//  - Snow has so little inertia that it moves with the air: a mean wind that
//    veers and gusts, plus eddies that swirl neighbouring flakes together.
//  - Plates and dendrites flutter as they fall: a spiral or side-to-side
//    sway of a few centimetres, about once a second.
// Flakes live in a box around the camera and wrap at its faces.
const BOX=new THREE.Vector3(28,14,28);
/** Sprite size (world metres at 1 m) for a flake of `mm` millimetres: exaggerated so it reads on screen. */
const spriteSize=(mm:number)=>.018+mm*.011;
function softDisc(){
 const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d')!;
 const r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.45,'rgba(255,255,255,.85)');r.addColorStop(1,'rgba(255,255,255,0)');
 g.fillStyle=r;g.fillRect(0,0,64,64);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
/** PointsMaterial with a per-point size attribute (aScale) and a fade for flakes right in front of the lens. */
function flakeMaterial(map:THREE.Texture,size:number,opacity:number){
 const m=new THREE.PointsMaterial({color:0xf7fbff,size,map,transparent:true,opacity,depthWrite:false,alphaTest:.02});
 m.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('uniform float size;','uniform float size;\nattribute float aScale;\nattribute float aAlpha;\nvarying float vFlakeAlpha;')
   .replace('gl_PointSize = size;','gl_PointSize = size * aScale;\n\tvFlakeAlpha = aAlpha * smoothstep( 0.35, 1.1, - mvPosition.z );');
  shader.fragmentShader=shader.fragmentShader.replace('void main() {','varying float vFlakeAlpha;\nvoid main() {').replace('#include <alphatest_fragment>','diffuseColor.a *= vFlakeAlpha;\n#include <alphatest_fragment>');
 };
 m.customProgramCacheKey=()=>'swf-flake-v2';return m;
}
/** A leaf silhouette (white, tinted per leaf by vertex colour): pointed ends and a midrib. */
function leafSprite(){
 const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d')!;
 g.fillStyle='#fff';g.beginPath();g.moveTo(32,4);g.bezierCurveTo(54,18,52,44,32,60);g.bezierCurveTo(12,44,10,18,32,4);g.fill();
 g.globalCompositeOperation='destination-out';g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=2;g.beginPath();g.moveTo(32,8);g.lineTo(32,58);g.stroke();
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
/** Falling leaves: a point per leaf, spun (aRot) and tumbled (aFlip squashes it edge-on) in the fragment shader. */
function leafMaterial(map:THREE.Texture,size:number){
 const m=new THREE.PointsMaterial({size,map,vertexColors:true,transparent:true,alphaTest:.35,depthWrite:false});
 m.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('uniform float size;','uniform float size;\nattribute float aScale;\nattribute float aAlpha;\nattribute float aRot;\nattribute float aFlip;\nvarying float vLeafAlpha;\nvarying float vLeafRot;\nvarying float vLeafFlip;')
   .replace('gl_PointSize = size;','gl_PointSize = size * aScale;\n\tvLeafAlpha = aAlpha * smoothstep( 0.35, 1.1, - mvPosition.z );\n\tvLeafRot = aRot;\n\tvLeafFlip = aFlip;');
  shader.fragmentShader=shader.fragmentShader.replace('void main() {','varying float vLeafAlpha;\nvarying float vLeafRot;\nvarying float vLeafFlip;\nvoid main() {')
   .replace('#include <map_particle_fragment>',`vec2 leafP = gl_PointCoord - 0.5;
float leafC = cos(vLeafRot), leafS = sin(vLeafRot);
leafP = mat2(leafC, -leafS, leafS, leafC) * leafP;
leafP.x /= max(0.18, abs(vLeafFlip));
vec2 leafUv = leafP + 0.5;
if (leafUv.x < 0.0 || leafUv.x > 1.0 || leafUv.y < 0.0 || leafUv.y > 1.0) discard;
diffuseColor *= texture2D(map, leafUv);
diffuseColor.rgb *= 0.78 + 0.22 * abs(vLeafFlip);`)
   .replace('#include <alphatest_fragment>','diffuseColor.a *= vLeafAlpha;\n#include <alphatest_fragment>');
 };
 m.customProgramCacheKey=()=>'swf-leaf-v1';return m;
}
const LEAF_COLORS=[0xd9861f,0xc4521c,0xa8341a,0xe0b233,0x9a6a2e,0xcf6f22];
/** Visual-only weather: shader coverage, snowfall and kicked-up snow, never collision geometry. */
export class Weather {
 private group=new THREE.Group();private flakes?:THREE.Points;private spray?:THREE.Points;private disc=softDisc();
 private quality:Fidelity='high';private mode:WeatherMode='sunny';private coverage={value:0};
 /** How settled the snow is on the ground, 0-1 (wheel tracks press into it). */
 get snowDepth(){return THREE.MathUtils.smoothstep(this.coverage.value,.35,.8);}
 /** How soaked the ground is (0..1): footprints turn to mud and wet prints (#61). */
 get wetness(){return this.wet.value;}
 // Rain: wet ground (0..1) builds while it rains and dries slowly after; fall: leaf litter.
 private wet={value:0};private litter={value:0};
 private drops?:THREE.LineSegments;private dropFall=new Float32Array(0);private leaves?:THREE.Points;private leafSpin=new Float32Array(0);private leafTumble=new Float32Array(0);private leafPhase=new Float32Array(0);private leafTex=leafSprite();
 /** How hard it is raining (0..1) and how many leaves are in the air, after easing. */
 rain=0;autumn=0;
 /**
  * Lightning: the flash envelope, the visible channel's flicker and seconds to
  * the next flash. `onThunder` hears each one (delay s, strength 0..1, distance km).
  */
 private flash=0;private channel=0;private flashAge=9;private nextBolt=6;private strokes:{at:number;hold:number;peak:number;decay:number;ground:boolean}[]=[];
 onThunder?:(delay:number,strength:number,km:number)=>void;
 /** Flashes so far and the last one (tests). */
 strikes=0;lastStrike:{ground:boolean;km:number}|null=null;private hooked=new Map<THREE.MeshStandardMaterial,Hook>();private scanAge=99;
 // Per flake: fall speed (m/s), flutter frequency (rad/s), amplitude (m), phase, and 1 for a spiral / 0 for a side-to-side sway.
 private fall=new Float32Array(0);private flutter=new Float32Array(0);private sway=new Float32Array(0);private phase=new Float32Array(0);private spiral=new Uint8Array(0);
 /** Hidden for an overhead photo (the phone's map). */
 setVisible(visible:boolean){this.group.visible=visible;}
 private time=0;private windAngle=Math.random()*TAU;private intensity=0;
 private fogBase=new WeakMap<THREE.Fog,{near:number;far:number}>();
 // Kicked-up snow: position, velocity and remaining life per particle.
 private sprayVelocity=new Float32Array(0);private sprayLife=new Float32Array(0);private sprayNext=0;private sprayDebt=0;private wasGrounded=true;
 constructor(private scene:THREE.Scene){this.group.name='Visual weather';scene.add(this.group);}
 /** Mean wind (m/s) at time t: veers slowly and gusts on a 5-15 s rhythm. */
 wind(t:number,out=new THREE.Vector3()){
  const angle=this.windAngle+.6*Math.sin(t*.031)+.25*Math.sin(t*.083+1.3);
  const speed=1.3*(1+.45*Math.sin(t*.41)+.25*Math.sin(t*.93+.7)+.15*Math.sin(t*2.1+2.1));
  return out.set(Math.cos(angle)*speed,0,Math.sin(angle)*speed);
 }
 update(dt:number,mode:WeatherMode,player:THREE.Vector3,quality:Fidelity,rider:WeatherRider={}){
  const outdoors=ACTIVE_MAP==='outdoor'||ACTIVE_MAP==='b_hill';if(!outdoors){this.coverage.value=0;this.wet.value=0;this.litter.value=0;this.rain=this.autumn=this.intensity=0;this.group.visible=false;this.applyFog(0);this.setSky(0,0,0);return;}
  if(quality!==this.quality){this.quality=quality;this.buildFlakes();if(this.drops)this.buildDrops();if(this.leaves)this.buildLeaves();}if(mode==='snow'&&this.mode!=='snow')this.coverage.value=Math.max(.12,this.coverage.value);this.mode=mode;
  // Ground cover builds over about 45 s of snowfall and melts off in a few seconds after it.
  this.coverage.value=THREE.MathUtils.clamp(this.coverage.value+(mode==='snow'?dt/45:-dt/3),0,1);
  // Snowfall eases in and out over a few seconds instead of switching.
  this.intensity=THREE.MathUtils.clamp(this.intensity+(mode==='snow'?dt/4:-dt/2),0,1);
  // Rain eases in over a few seconds; the ground soaks through in about 20 s and dries over a minute.
  this.rain=THREE.MathUtils.clamp(this.rain+(mode==='rain'?dt/5:-dt/3),0,1);
  this.wet.value=THREE.MathUtils.clamp(this.wet.value+(mode==='rain'?Math.max(.12-this.wet.value,0)+dt/20:-dt/60),0,1);
  // Fall: leaves drift down and gather on open ground over about 15 s.
  this.autumn=THREE.MathUtils.clamp(this.autumn+(mode==='fall'?dt/4:-dt/2),0,1);
  this.litter.value=THREE.MathUtils.clamp(this.litter.value+(mode==='fall'?Math.max(.15-this.litter.value,0)+dt/15:-dt/4),0,1);
  const d=Math.min(dt,.05),centre=rider.camera??player;
  this.time+=d;
  this.stepLightning(d);
  this.group.visible=this.intensity>0||this.rain>0||this.autumn>0||this.sprayAlive();
  // Falling snow and rain cloud over the sky dome (art/sky.ts) and dim the sun (daylight.ts).
  // The flash lights the scene through the park's own ambient light (daylight.ts):
  // a light of its own would put one more light in every material's shader.
  this.setSky(Math.max(this.intensity,this.rain),this.rain,this.flash*this.rain,this.channel*this.rain);
  this.applyFog(Math.max(this.intensity,this.rain*.7));
  this.scanAge+=dt;if(this.scanAge>1){this.scanAge=0;this.scan();}
  if(this.intensity>0){if(!this.flakes)this.buildFlakes();this.stepFlakes(d,centre);}
  else if(this.flakes)this.flakes.visible=false;
  if(this.rain>0){if(!this.drops)this.buildDrops();this.stepDrops(d,centre);this.splash(d,player);}
  else if(this.drops)this.drops.visible=false;
  if(this.autumn>0){if(!this.leaves)this.buildLeaves();this.stepLeaves(d,centre);}
  else if(this.leaves)this.leaves.visible=false;
  this.stepSpray(d,player,rider);
 }
 private setSky(overcast:number,storm:number,flash:number,channel=0){this.scene.userData.overcast=overcast;this.scene.userData.storm=storm;this.scene.userData.lightning=flash;this.scene.userData.lightningChannel=channel;}
 /** In heavy rain: the flash envelope from the current strike's strokes, and the next strike when it is due. */
 private stepLightning(dt:number){
  this.flashAge+=dt;
  if(this.rain>.6){this.nextBolt-=dt;if(this.nextBolt<=0)this.strike();}
  const t=this.flashAge;let flash=0,channel=0;
  for(const s of this.strokes){if(t<s.at)continue;const k=Math.exp(-Math.max(0,t-s.at-s.hold)/s.decay);flash=Math.max(flash,s.peak*k);if(s.ground)channel=Math.max(channel,k);}
  this.flash=flash;this.channel=channel;
 }
 /**
  * One flash, paced like a medium thunderstorm (#63): about four a minute,
  * 4 to 40 s apart. About a third reach the ground, 1-10 km off: several return
  * strokes 40-120 ms apart (the first holding its light a little, the continuing
  * current) flicker the light and draw a visible channel (sky-events.ts).
  * The rest light the cloud from inside, softer and longer, 2-15 km off. Thunder
  * follows at the speed of sound (about 2.9 s a km) and fades with distance.
  */
 strike(ground=Math.random()<.32,km=ground?1+9*Math.random()**1.4:2+13*Math.random()){
  this.nextBolt=Math.min(40,4-Math.log(1-Math.random())*11);
  this.flashAge=0;this.strikes++;this.lastStrike={ground,km};
  const count=ground?2+Math.floor(Math.random()*4):1+Math.floor(Math.random()*3);
  const light=ground?THREE.MathUtils.clamp(1.3-km/10,.35,1):THREE.MathUtils.clamp(.85-km/25,.25,.75);
  this.strokes=[];let at=0;
  for(let i=0;i<count;i++){this.strokes.push({at,hold:i===0?.05+Math.random()*.04:.01+Math.random()*.03,peak:light*(i===0?1:.45+Math.random()*.5),decay:ground?.035+Math.random()*.035:.09+Math.random()*.12,ground});at+=ground?.04+Math.random()*.08:.08+Math.random()*.25;}
  if(ground)(this.scene.userData.sky as {events?:{strike(distance:number):void}}|undefined)?.events?.strike(km*1000);
  this.onThunder?.(km*2.9,THREE.MathUtils.clamp(1.15-km/9,.1,1),km);
 }
 /** Rain: streaks along the drop's velocity (a drop falls 7-9 m/s and leans with the wind), wrapping around the camera. */
 private stepDrops(dt:number,centre:THREE.Vector3){
  const drops=this.drops!;drops.visible=true;(drops.material as THREE.LineBasicMaterial).opacity=.32*this.rain;
  const wind=this.wind(this.time),pos=drops.geometry.getAttribute('position') as THREE.BufferAttribute,p=pos.array as Float32Array,half=BOX.clone().multiplyScalar(.5);
  const n=pos.count/2,shown=Math.floor(n*this.rain);
  for(let i=0;i<n;i++){
   const k=i*6,vy=-this.dropFall[i],vx=wind.x*1.6,vz=wind.z*1.6;
   let x=p[k]+vx*dt,y=p[k+1]+vy*dt,z=p[k+2]+vz*dt;
   x=centre.x+((x-centre.x+half.x)%BOX.x+BOX.x)%BOX.x-half.x;
   y=centre.y+((y-centre.y+half.y)%BOX.y+BOX.y)%BOX.y-half.y;
   z=centre.z+((z-centre.z+half.z)%BOX.z+BOX.z)%BOX.z-half.z;
   const len=i<shown?.05:0;
   p[k]=x;p[k+1]=y;p[k+2]=z;p[k+3]=x-vx*len;p[k+4]=y-vy*len;p[k+5]=z-vz*len;
  }
  pos.needsUpdate=true;
 }
 /** Drops bursting on the ground around the rider: tiny upward sprays that settle at once. */
 private splash(dt:number,player:THREE.Vector3){
  if(!this.spray)this.buildSpray();
  this.sprayDebt+=dt*this.rain*(this.quality==='low'?40:110);
  while(this.sprayDebt>=1){this.sprayDebt--;const a=Math.random()*TAU,r=1+Math.random()*9,x=player.x+Math.cos(a)*r,z=player.z+Math.sin(a)*r;
   this.emit(x,terrainHeight(x,z)+.02,z,(Math.random()-.5)*.6,.9+Math.random()*.9,(Math.random()-.5)*.6,.18+Math.random()*.12);}
 }
 /** Leaves: slower than rain, tumbling and swinging side to side, carried by the wind. */
 private stepLeaves(dt:number,centre:THREE.Vector3){
  const leaves=this.leaves!;leaves.visible=true;
  const t=this.time,wind=this.wind(t),g=leaves.geometry,pos=g.getAttribute('position') as THREE.BufferAttribute,rot=g.getAttribute('aRot') as THREE.BufferAttribute,flip=g.getAttribute('aFlip') as THREE.BufferAttribute,alpha=g.getAttribute('aAlpha') as THREE.BufferAttribute;
  const p=pos.array as Float32Array,r=rot.array as Float32Array,f=flip.array as Float32Array,a=alpha.array as Float32Array,half=BOX.clone().multiplyScalar(.5),n=pos.count;
  for(let i=0;i<n;i++){
   const k=i*3,ph=this.leafPhase[i]+t*this.leafTumble[i];
   let x=p[k]+(wind.x*1.2+Math.cos(ph)*.9)*dt,y=p[k+1]-(.9+.5*Math.abs(Math.sin(ph)))*dt,z=p[k+2]+(wind.z*1.2+Math.sin(ph*.7)*.5)*dt;
   x=centre.x+((x-centre.x+half.x)%BOX.x+BOX.x)%BOX.x-half.x;
   y=centre.y+((y-centre.y+half.y)%BOX.y+BOX.y)%BOX.y-half.y;
   z=centre.z+((z-centre.z+half.z)%BOX.z+BOX.z)%BOX.z-half.z;
   p[k]=x;p[k+1]=y;p[k+2]=z;r[i]+=this.leafSpin[i]*dt;f[i]=Math.cos(ph*1.7);a[i]=i<n*this.autumn?1:0;
  }
  pos.needsUpdate=rot.needsUpdate=flip.needsUpdate=alpha.needsUpdate=true;
 }
 private stepFlakes(dt:number,centre:THREE.Vector3){
  const flakes=this.flakes!;flakes.visible=true;
  const t=this.time,wind=this.wind(t),positions=flakes.geometry.getAttribute('position') as THREE.BufferAttribute,alpha=flakes.geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
  const p=positions.array as Float32Array,a=alpha.array as Float32Array,half=BOX.clone().multiplyScalar(.5);
  for(let i=0;i<positions.count;i++){
   const k=i*3;let x=p[k],y=p[k+1],z=p[k+2];
   // Eddies: a smooth, slowly evolving velocity field, so nearby flakes swirl together.
   const ex=.45*Math.sin(z*.37+t*.7)+.25*Math.sin((x+z)*.91-t*1.3),ez=.45*Math.sin(x*.41-t*.6)+.25*Math.sin((x-z)*.83+t*1.1),ey=.18*Math.sin(x*.29+z*.33+t*.9);
   const w=this.flutter[i],ph=this.phase[i]+w*t,amp=this.sway[i]*w;
   // Flutter velocity: the derivative of a small circle (spiral) or a line (sway).
   const fx=-Math.sin(ph)*amp,fz=this.spiral[i]?Math.cos(ph)*amp:0;
   x+=(wind.x+ex+fx)*dt;z+=(wind.z+ez+fz)*dt;y+=(ey-this.fall[i])*dt;
   // Wrap into the box around the camera.
   x=centre.x+((x-centre.x+half.x)%BOX.x+BOX.x)%BOX.x-half.x;
   y=centre.y+((y-centre.y+half.y)%BOX.y+BOX.y)%BOX.y-half.y;
   z=centre.z+((z-centre.z+half.z)%BOX.z+BOX.z)%BOX.z-half.z;
   p[k]=x;p[k+1]=y;p[k+2]=z;a[i]=this.intensity*(i<positions.count*this.intensity?1:0);
  }
  positions.needsUpdate=true;alpha.needsUpdate=true;
 }
 /** Snow kicked up by the wheels and thrown out by a landing, once there is enough on the ground. */
 private stepSpray(dt:number,player:THREE.Vector3,rider:WeatherRider){
  if(!this.spray)this.buildSpray();
  const spray=this.spray!,positions=spray.geometry.getAttribute('position') as THREE.BufferAttribute,alpha=spray.geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
  const p=positions.array as Float32Array,a=alpha.array as Float32Array,v=this.sprayVelocity,life=this.sprayLife;
  const depth=THREE.MathUtils.smoothstep(this.coverage.value,.35,.8),velocity=rider.velocity,grounded=!!rider.grounded&&!!rider.riding;
  if(depth>0&&velocity){
   const speed=Math.hypot(velocity.x,velocity.z),yaw=rider.yaw??Math.atan2(velocity.x,velocity.z),fx=Math.sin(yaw),fz=Math.cos(yaw);
   // A rolling wheel throws powder up and back in proportion to speed.
   if(grounded&&speed>1.5){this.sprayDebt+=dt*depth*Math.min(1,(speed-1.5)/6)*90;
    while(this.sprayDebt>=1){this.sprayDebt--;const back=Math.random()<.5?-.32:.3;this.emit(player.x+fx*back,player.y-.18,player.z+fz*back,-fx*speed*(.15+Math.random()*.2)+(Math.random()-.5)*.8,.7+Math.random()*1.1,-fz*speed*(.15+Math.random()*.2)+(Math.random()-.5)*.8,.55+Math.random()*.5);}}
   // A landing blows snow out from under the deck.
   if(grounded&&!this.wasGrounded&&(rider.landing??0)>0){const n=Math.round(40*depth);for(let j=0;j<n;j++){const ang=Math.random()*TAU,out=1+Math.random()*2.2;this.emit(player.x,player.y-.18,player.z,Math.cos(ang)*out,.5+Math.random()*1.4,Math.sin(ang)*out,.6+Math.random()*.6);}}
  }
  this.wasGrounded=grounded;
  let alive=false;const wind=this.wind(this.time);
  for(let i=0;i<life.length;i++){
   if(life[i]<=0){a[i]=0;continue;}
   alive=true;life[i]-=dt;const k=i*3;
   // Powder is light: strong quadratic drag toward the wind, and gravity.
   const rx=v[k]-wind.x,ry=v[k+1],rz=v[k+2]-wind.z,drag=2.2*Math.hypot(rx,ry,rz);
   v[k]-=rx*drag*dt;v[k+1]-=(ry*drag+9.81)*dt;v[k+2]-=rz*drag*dt;
   p[k]+=v[k]*dt;p[k+1]+=v[k+1]*dt;p[k+2]+=v[k+2]*dt;
   // It settles back into the snow where it lands.
   if(p[k+1]<terrainHeight(p[k],p[k+2])+.01)life[i]=0;
   a[i]=Math.max(0,Math.min(1,life[i]*3))*.9;
  }
  positions.needsUpdate=true;alpha.needsUpdate=true;spray.visible=alive;
 }
 private sprayAlive(){for(let i=0;i<this.sprayLife.length;i++)if(this.sprayLife[i]>0)return true;return false;}
 private emit(x:number,y:number,z:number,vx:number,vy:number,vz:number,life:number){
  const spray=this.spray!,p=(spray.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array,i=this.sprayNext,k=i*3;
  this.sprayNext=(i+1)%this.sprayLife.length;p[k]=x;p[k+1]=y;p[k+2]=z;this.sprayVelocity[k]=vx;this.sprayVelocity[k+1]=vy;this.sprayVelocity[k+2]=vz;this.sprayLife[i]=life;
 }
 /** Falling snow cuts visibility: the fog closes in while it snows and lifts after. */
 private applyFog(amount:number){
  const fog=this.scene.fog;if(!(fog instanceof THREE.Fog))return;
  let base=this.fogBase.get(fog);if(!base){base={near:fog.near,far:fog.far};this.fogBase.set(fog,base);}
  fog.near=THREE.MathUtils.lerp(base.near,base.near*.45,amount);fog.far=THREE.MathUtils.lerp(base.far,base.far*.62,amount);
 }
 private scan(){this.scene.traverse(object=>{if(!(object instanceof THREE.Mesh)||object instanceof THREE.SkinnedMesh||this.dynamic(object))return;for(const material of Array.isArray(object.material)?object.material:[object.material])if(material instanceof THREE.MeshStandardMaterial&&!material.transparent&&!material.userData.characterQuality&&!this.hooked.has(material))this.hook(material);});}
 private dynamic(object:THREE.Object3D){for(let item:THREE.Object3D|null=object;item;item=item.parent)if(item.userData.weatherDynamic)return true;return false;}
 private hook(material:THREE.MeshStandardMaterial){
  // The program key is read before wrapping: the default key is the hook's own
  // source text, which after wrapping is this same wrapper for every material,
  // so materials with their own shader code (the lake) were handed another
  // material's compiled program.
  const compile=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material),key=cache(),coverage=this.coverage,wet=this.wet,litter=this.litter;
  // Plant cards (art/flora.ts names them "<kind> foliage") turn autumn colours instead of gathering litter.
  const foliage=/foliage/.test(material.name);
  material.onBeforeCompile=(shader,renderer)=>{compile(shader,renderer);shader.uniforms.uSnowCoverage=coverage;shader.uniforms.uWet=wet;shader.uniforms.uLitter=litter;
   shader.vertexShader=shader.vertexShader.replace('void main() {','varying vec3 vSnowWorld;\nvoid main() {').replace('#include <begin_vertex>',`#include <begin_vertex>
vec4 snowWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
snowWorld = instanceMatrix * snowWorld;
#endif
vSnowWorld = (modelMatrix * snowWorld).xyz;`);
   // Ground cover: settles first on flat, open surfaces in uneven patches and
   // spreads to steeper faces as it deepens; snow does not hold past about
   // 60 degrees. Fresh snow is bright and matte; a few crystals face the sun
   // and glint as the camera moves.
   shader.fragmentShader=(foliage?'#define SWF_FOLIAGE\n':'')+shader.fragmentShader.replace('void main() {',`uniform float uSnowCoverage, uWet, uLitter;
varying vec3 vSnowWorld;
float snowHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float snowNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
 return mix(mix(snowHash(i), snowHash(i + vec2(1.0, 0.0)), f.x), mix(snowHash(i + vec2(0.0, 1.0)), snowHash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {`).replace('#include <lights_physical_fragment>',`float snowNy = inverseTransformDirection(normal, viewMatrix).y;
// Each weather's work sits behind a branch on its own uniform, so a clear day
// (and the phone map's top-down photo) pays for none of the noise below.
float snowAmount = 0.0;
if (uSnowCoverage > 0.001) {
float snowUp = smoothstep(mix(0.9, 0.5, uSnowCoverage), mix(0.97, 0.78, uSnowCoverage), snowNy);
float snowPatch = snowNoise(vSnowWorld.xz * 0.35) * 0.65 + snowNoise(vSnowWorld.xz * 1.9) * 0.35;
snowAmount = smoothstep(snowPatch * 0.7 - 0.05, snowPatch * 0.7 + 0.2, uSnowCoverage) * snowUp;
vec2 snowCell = floor(vSnowWorld.xz * 38.0);
float snowGlint = step(0.993, snowHash(snowCell)) * step(0.55, fract(snowHash(snowCell + 17.0) * 9.0 + dot(cameraPosition, vec3(0.61, 0.23, 0.47))));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.94, 0.97), snowAmount);
roughnessFactor = mix(roughnessFactor, mix(0.78, 0.08, snowGlint), snowAmount);
}
#ifdef SWF_FOLIAGE
// Fall: canopies turn gold, orange and rust in patches, keeping their shading.
if (uLitter > 0.001) {
float fallPatch = snowNoise(vSnowWorld.xz * 0.21 + vSnowWorld.y * 0.35);
vec3 fallTint = mix(vec3(0.86, 0.55, 0.14), vec3(0.7, 0.24, 0.09), smoothstep(0.3, 0.75, fallPatch));
fallTint = mix(fallTint, vec3(0.93, 0.75, 0.26), smoothstep(0.72, 0.95, snowNoise(vSnowWorld.xz * 0.8 + 4.0)));
diffuseColor.rgb = mix(diffuseColor.rgb, fallTint * (0.45 + 1.1 * dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), uLitter * 0.8);
}
#else
// Fall: leaves lie on open, flat ground, one to a small cell, each turned its own way.
float leafMask = 0.0;
if (uLitter > 0.001) {
vec2 leafGrid = vSnowWorld.xz * 4.4, leafCell = floor(leafGrid);
vec2 leafAt = fract(leafGrid) - 0.5 - (vec2(snowHash(leafCell + 2.3), snowHash(leafCell + 5.9)) - 0.5) * 0.35;
float leafTurn = snowHash(leafCell + 8.1) * 6.2832;
vec2 leafQ = mat2(cos(leafTurn), -sin(leafTurn), sin(leafTurn), cos(leafTurn)) * leafAt;
float leafHere = step(1.0 - uLitter * 0.42, snowHash(leafCell + 11.7)) * smoothstep(0.8, 0.95, snowNy) * (1.0 - snowAmount);
leafMask = (1.0 - smoothstep(0.24, 0.29, length(vec2(leafQ.x * 2.1, leafQ.y)))) * leafHere;
float leafPick = snowHash(leafCell + 13.3);
vec3 leafColor = leafPick < 0.3 ? vec3(0.8, 0.43, 0.1) : leafPick < 0.55 ? vec3(0.62, 0.19, 0.08) : leafPick < 0.8 ? vec3(0.86, 0.67, 0.2) : vec3(0.45, 0.3, 0.15);
diffuseColor.rgb = mix(diffuseColor.rgb, leafColor * (0.85 + 0.3 * snowHash(leafCell + 1.1)), leafMask);
roughnessFactor = mix(roughnessFactor, 0.7, leafMask);
}
// Rain: everything darkens as it soaks; flat ground turns glossy and puddles
// collect in low patches, mirroring the sky.
if (uWet > 0.001) {
float wetUp = smoothstep(0.55, 0.95, snowNy);
float puddle = smoothstep(0.64, 0.74, snowNoise(vSnowWorld.xz * 0.23) * 0.7 + snowNoise(vSnowWorld.xz * 0.95) * 0.3) * wetUp * smoothstep(0.45, 1.0, uWet) * (1.0 - leafMask);
diffuseColor.rgb *= 1.0 - uWet * (0.22 + 0.14 * wetUp) - puddle * 0.18;
roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.42, uWet * wetUp);
roughnessFactor = mix(roughnessFactor, 0.05, puddle);
}
#endif
#include <lights_physical_fragment>`);
  };material.customProgramCacheKey=()=>key+(foliage?'|swf-weather-v4-foliage':'|swf-weather-v4');material.needsUpdate=true;this.hooked.set(material,{compile,cache});
 }
 private buildFlakes(){
  if(this.flakes){this.flakes.removeFromParent();this.flakes.geometry.dispose();(this.flakes.material as THREE.Material).dispose();}
  const count=this.quality==='low'?450:this.quality==='medium'?1100:2400,positions=new Float32Array(count*3),scale=new Float32Array(count),alpha=new Float32Array(count);
  this.fall=new Float32Array(count);this.flutter=new Float32Array(count);this.sway=new Float32Array(count);this.phase=new Float32Array(count);this.spiral=new Uint8Array(count);
  const base=spriteSize(1);
  for(let i=0;i<count;i++){
   positions[i*3]=(Math.random()-.5)*BOX.x;positions[i*3+1]=(Math.random()-.5)*BOX.y;positions[i*3+2]=(Math.random()-.5)*BOX.z;
   const mm=Math.min(7,.6-Math.log(1-Math.random()*.999)*1.3);
   this.fall[i]=.8*mm**.16*(.9+Math.random()*.2);
   this.flutter[i]=TAU*(.5+Math.random());this.sway[i]=.02+Math.random()*.08*Math.min(1,mm/2);this.phase[i]=Math.random()*TAU;this.spiral[i]=Math.random()<.5?1:0;
   scale[i]=spriteSize(mm)/base;alpha[i]=0;
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aScale',new THREE.BufferAttribute(scale,1));geometry.setAttribute('aAlpha',new THREE.BufferAttribute(alpha,1));
  this.flakes=new THREE.Points(geometry,flakeMaterial(this.disc,base,.9));this.flakes.frustumCulled=false;this.flakes.renderOrder=2;this.group.add(this.flakes);
 }
 private buildDrops(){
  if(this.drops){this.drops.removeFromParent();this.drops.geometry.dispose();(this.drops.material as THREE.Material).dispose();}
  const count=this.quality==='low'?700:this.quality==='medium'?1600:3200,positions=new Float32Array(count*6);
  this.dropFall=new Float32Array(count);
  for(let i=0;i<count;i++){const x=(Math.random()-.5)*BOX.x,y=(Math.random()-.5)*BOX.y,z=(Math.random()-.5)*BOX.z;positions.set([x,y,z,x,y,z],i*6);this.dropFall[i]=7+Math.random()*2;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  this.drops=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xc9d6e3,transparent:true,opacity:0,depthWrite:false}));
  this.drops.frustumCulled=false;this.drops.renderOrder=2;this.drops.name='Rain';this.group.add(this.drops);
 }
 private buildLeaves(){
  if(this.leaves){this.leaves.removeFromParent();this.leaves.geometry.dispose();(this.leaves.material as THREE.Material).dispose();}
  const count=this.quality==='low'?80:this.quality==='medium'?170:300,positions=new Float32Array(count*3),colors=new Float32Array(count*3),scale=new Float32Array(count),alpha=new Float32Array(count),rot=new Float32Array(count),flip=new Float32Array(count);
  this.leafSpin=new Float32Array(count);this.leafTumble=new Float32Array(count);this.leafPhase=new Float32Array(count);const c=new THREE.Color();
  for(let i=0;i<count;i++){
   positions.set([(Math.random()-.5)*BOX.x,(Math.random()-.5)*BOX.y,(Math.random()-.5)*BOX.z],i*3);
   c.set(LEAF_COLORS[i%LEAF_COLORS.length]).offsetHSL((Math.random()-.5)*.03,0,(Math.random()-.5)*.08);colors.set([c.r,c.g,c.b],i*3);
   scale[i]=.7+Math.random()*.7;rot[i]=Math.random()*TAU;flip[i]=1;this.leafSpin[i]=(Math.random()-.5)*5;this.leafTumble[i]=1.2+Math.random()*2.2;this.leafPhase[i]=Math.random()*TAU;
  }
  const geometry=new THREE.BufferGeometry();
  for(const [name,array,size] of [['position',positions,3],['color',colors,3],['aScale',scale,1],['aAlpha',alpha,1],['aRot',rot,1],['aFlip',flip,1]] as const)geometry.setAttribute(name,new THREE.BufferAttribute(array,size));
  this.leaves=new THREE.Points(geometry,leafMaterial(this.leafTex,.16));this.leaves.frustumCulled=false;this.leaves.renderOrder=2;this.leaves.name='Falling leaves';this.group.add(this.leaves);
 }
 private buildSpray(){
  const count=this.quality==='low'?120:260,positions=new Float32Array(count*3),scale=new Float32Array(count),alpha=new Float32Array(count);
  for(let i=0;i<count;i++){scale[i]=.8+Math.random()*1.4;positions[i*3+1]=-1e4;}
  this.sprayVelocity=new Float32Array(count*3);this.sprayLife=new Float32Array(count);this.sprayNext=0;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aScale',new THREE.BufferAttribute(scale,1));geometry.setAttribute('aAlpha',new THREE.BufferAttribute(alpha,1));
  this.spray=new THREE.Points(geometry,flakeMaterial(this.disc,.06,.85));this.spray.frustumCulled=false;this.spray.visible=false;this.group.add(this.spray);
 }
 dispose(){
  for(const points of [this.flakes,this.spray,this.leaves,this.drops])if(points){points.geometry.dispose();(points.material as THREE.Material).dispose();}
  this.disc.dispose();this.leafTex.dispose();this.applyFog(0);this.setSky(0,0,0);
  for(const [material,hook]of this.hooked){material.onBeforeCompile=hook.compile;material.customProgramCacheKey=hook.cache;material.needsUpdate=true;}this.hooked.clear();this.group.removeFromParent();
 }
}
