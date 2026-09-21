import * as THREE from 'three';
import type { Fidelity } from '../render/fidelity';
import { ACTIVE_MAP } from './park';
export type WeatherMode='day'|'sunset'|'night'|'sunrise'|'snow';
type Hook={compile:THREE.Material['onBeforeCompile'];cache:()=>string};
/** Visual-only weather: shader coverage and flakes, never collision geometry. */
export class Weather {
 private group=new THREE.Group();private flakes?:THREE.Points;private quality:Fidelity='high';private mode:WeatherMode='day';private coverage={value:0};private hooked=new Map<THREE.MeshStandardMaterial,Hook>();private scanAge=99;
 constructor(private scene:THREE.Scene){this.group.name='Visual weather';scene.add(this.group);}
 update(dt:number,mode:WeatherMode,player:THREE.Vector3,quality:Fidelity){
  const outdoors=ACTIVE_MAP==='outdoor'||ACTIVE_MAP==='b_hill';if(!outdoors){this.coverage.value=0;this.group.visible=false;return;}
  if(quality!==this.quality){this.quality=quality;this.buildFlakes();}if(mode==='snow'&&this.mode!=='snow')this.coverage.value=Math.max(.12,this.coverage.value);this.mode=mode;
  this.coverage.value=THREE.MathUtils.clamp(this.coverage.value+(mode==='snow'?dt/28:-dt/3),0,1);this.group.visible=mode==='snow';
  this.scanAge+=dt;if(this.scanAge>1){this.scanAge=0;this.scan();}if(mode!=='snow')return;if(!this.flakes)this.buildFlakes();
  const positions=this.flakes!.geometry.getAttribute('position') as THREE.BufferAttribute;
  for(let i=0;i<positions.count;i++){let y=positions.getY(i)-dt*(1.2+(i%7)*.08);if(y<-.5)y=10+(i%17)*.45;positions.setY(i,y);positions.setX(i,positions.getX(i)+Math.sin(i*17+performance.now()*.001)*dt*.1);}positions.needsUpdate=true;this.flakes!.position.copy(player);
 }
 private scan(){this.scene.traverse(object=>{if(!(object instanceof THREE.Mesh)||object instanceof THREE.SkinnedMesh||this.dynamic(object))return;for(const material of Array.isArray(object.material)?object.material:[object.material])if(material instanceof THREE.MeshStandardMaterial&&!material.transparent&&!material.userData.characterQuality&&!this.hooked.has(material))this.hook(material);});}
 private dynamic(object:THREE.Object3D){for(let item:THREE.Object3D|null=object;item;item=item.parent)if(item.userData.weatherDynamic)return true;return false;}
 private hook(material:THREE.MeshStandardMaterial){
  const compile=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material),coverage=this.coverage;
  material.onBeforeCompile=(shader,renderer)=>{compile(shader,renderer);shader.uniforms.uSnowCoverage=coverage;
   shader.vertexShader=shader.vertexShader.replace('void main() {','varying vec3 vSnowWorld;\nvoid main() {').replace('#include <begin_vertex>','#include <begin_vertex>\nvSnowWorld = transformed;');
   shader.fragmentShader=shader.fragmentShader.replace('void main() {','uniform float uSnowCoverage;\nvarying vec3 vSnowWorld;\nvoid main() {').replace('#include <lights_physical_fragment>',`float snowUp = smoothstep(0.42, 0.84, inverseTransformDirection(normal, viewMatrix).y);
float snowAmount = smoothstep(0.03, 0.9, uSnowCoverage) * snowUp;
float snowGrain = fract(sin(dot(floor(vSnowWorld * 7.0).xz, vec2(12.9898, 78.233))) * 43758.5453);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.94, 0.97) + step(0.986, snowGrain) * 0.18, snowAmount);
roughnessFactor = mix(roughnessFactor, mix(0.68, 0.28, step(0.986, snowGrain) * 0.35), snowAmount);
#include <lights_physical_fragment>`);
  };material.customProgramCacheKey=()=>cache()+'|swf-snow-v1';material.needsUpdate=true;this.hooked.set(material,{compile,cache});
 }
 private buildFlakes(){
  if(this.flakes){this.flakes.removeFromParent();this.flakes.geometry.dispose();(this.flakes.material as THREE.Material).dispose();}
  const count=this.quality==='low'?100:this.quality==='medium'?260:520,positions=new Float32Array(count*3);for(let i=0;i<count;i++){const a=i*2.399,r=3+((i*47)%170)/10;positions[i*3]=Math.cos(a)*r;positions[i*3+1]=((i*83)%140)/10;positions[i*3+2]=Math.sin(a)*r;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));this.flakes=new THREE.Points(geometry,new THREE.PointsMaterial({color:0xf7fbff,size:this.quality==='low'?.07:.1,transparent:true,opacity:.82,depthWrite:false}));this.flakes.frustumCulled=false;this.group.add(this.flakes);this.group.visible=this.mode==='snow';
 }
 dispose(){if(this.flakes){this.flakes.geometry.dispose();(this.flakes.material as THREE.Material).dispose();}for(const [material,hook]of this.hooked){material.onBeforeCompile=hook.compile;material.customProgramCacheKey=hook.cache;material.needsUpdate=true;}this.hooked.clear();this.group.removeFromParent();}
}
