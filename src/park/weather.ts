import * as THREE from 'three';
import type { Fidelity } from '../render/fidelity';
import { ACTIVE_MAP, terrainHeight } from './park';
export type WeatherMode='day'|'sunset'|'night'|'sunrise'|'snow';
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
/** Visual-only weather: shader coverage, snowfall and kicked-up snow, never collision geometry. */
export class Weather {
 private group=new THREE.Group();private flakes?:THREE.Points;private spray?:THREE.Points;private disc=softDisc();
 private quality:Fidelity='high';private mode:WeatherMode='day';private coverage={value:0};private hooked=new Map<THREE.MeshStandardMaterial,Hook>();private scanAge=99;
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
  const outdoors=ACTIVE_MAP==='outdoor'||ACTIVE_MAP==='b_hill';if(!outdoors){this.coverage.value=0;this.group.visible=false;this.applyFog(0);return;}
  if(quality!==this.quality){this.quality=quality;this.buildFlakes();}if(mode==='snow'&&this.mode!=='snow')this.coverage.value=Math.max(.12,this.coverage.value);this.mode=mode;
  // Ground cover builds over about 45 s of snowfall and melts off in a few seconds after it.
  this.coverage.value=THREE.MathUtils.clamp(this.coverage.value+(mode==='snow'?dt/45:-dt/3),0,1);
  // Snowfall eases in and out over a few seconds instead of switching.
  this.intensity=THREE.MathUtils.clamp(this.intensity+(mode==='snow'?dt/4:-dt/2),0,1);
  this.group.visible=this.intensity>0||this.sprayAlive();
  // Falling snow greys the sky dome (art/sky.ts reads this).
  this.scene.userData.overcast=this.intensity;
  this.applyFog(this.intensity);
  this.scanAge+=dt;if(this.scanAge>1){this.scanAge=0;this.scan();}
  if(this.intensity>0){if(!this.flakes)this.buildFlakes();this.stepFlakes(Math.min(dt,.05),rider.camera??player);}
  else if(this.flakes)this.flakes.visible=false;
  this.stepSpray(Math.min(dt,.05),player,rider);
 }
 private stepFlakes(dt:number,centre:THREE.Vector3){
  const flakes=this.flakes!;flakes.visible=true;this.time+=dt;
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
  const compile=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material),key=cache(),coverage=this.coverage;
  material.onBeforeCompile=(shader,renderer)=>{compile(shader,renderer);shader.uniforms.uSnowCoverage=coverage;
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
   shader.fragmentShader=shader.fragmentShader.replace('void main() {',`uniform float uSnowCoverage;
varying vec3 vSnowWorld;
float snowHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float snowNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
 return mix(mix(snowHash(i), snowHash(i + vec2(1.0, 0.0)), f.x), mix(snowHash(i + vec2(0.0, 1.0)), snowHash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {`).replace('#include <lights_physical_fragment>',`float snowNy = inverseTransformDirection(normal, viewMatrix).y;
float snowUp = smoothstep(mix(0.9, 0.5, uSnowCoverage), mix(0.97, 0.78, uSnowCoverage), snowNy);
float snowPatch = snowNoise(vSnowWorld.xz * 0.35) * 0.65 + snowNoise(vSnowWorld.xz * 1.9) * 0.35;
float snowAmount = smoothstep(snowPatch * 0.7 - 0.05, snowPatch * 0.7 + 0.2, uSnowCoverage) * snowUp;
vec2 snowCell = floor(vSnowWorld.xz * 38.0);
float snowGlint = step(0.993, snowHash(snowCell)) * step(0.55, fract(snowHash(snowCell + 17.0) * 9.0 + dot(cameraPosition, vec3(0.61, 0.23, 0.47))));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.94, 0.97), snowAmount);
roughnessFactor = mix(roughnessFactor, mix(0.78, 0.08, snowGlint), snowAmount);
#include <lights_physical_fragment>`);
  };material.customProgramCacheKey=()=>key+'|swf-snow-v2';material.needsUpdate=true;this.hooked.set(material,{compile,cache});
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
 private buildSpray(){
  const count=this.quality==='low'?120:260,positions=new Float32Array(count*3),scale=new Float32Array(count),alpha=new Float32Array(count);
  for(let i=0;i<count;i++){scale[i]=.8+Math.random()*1.4;positions[i*3+1]=-1e4;}
  this.sprayVelocity=new Float32Array(count*3);this.sprayLife=new Float32Array(count);this.sprayNext=0;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aScale',new THREE.BufferAttribute(scale,1));geometry.setAttribute('aAlpha',new THREE.BufferAttribute(alpha,1));
  this.spray=new THREE.Points(geometry,flakeMaterial(this.disc,.06,.85));this.spray.frustumCulled=false;this.spray.visible=false;this.group.add(this.spray);
 }
 dispose(){
  for(const points of [this.flakes,this.spray])if(points){points.geometry.dispose();(points.material as THREE.Material).dispose();}
  this.disc.dispose();this.applyFog(0);
  for(const [material,hook]of this.hooked){material.onBeforeCompile=hook.compile;material.customProgramCacheKey=hook.cache;material.needsUpdate=true;}this.hooked.clear();this.group.removeFromParent();
 }
}
