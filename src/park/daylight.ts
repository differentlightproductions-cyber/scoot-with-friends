import * as THREE from 'three';
import type { Park } from './park';
import { OUTDOOR, terrainHeight } from './park';
export type DayPhase='day'|'sunset'|'night'|'sunrise';
const phases={day:{sky:0xb3d2df,sun:0xffedce,power:3.2,ambient:2.4,night:0},sunset:{sky:0xb28283,sun:0xffa05f,power:2,ambient:1.65,night:.35},night:{sky:0x172940,sun:0xadc7ee,power:.75,ambient:1.2,night:1},sunrise:{sky:0xccabb1,sun:0xffc695,power:1.7,ambient:1.8,night:.25}};
export class Daylight {
 private sky=new THREE.Color();private color=new THREE.Color();
 private lamps:THREE.MeshStandardMaterial[]=[];
 private sun?:THREE.DirectionalLight;private ambient?:THREE.HemisphereLight;
 private light=new THREE.PointLight(0xffdca4,0,35,1.5);
 phase:DayPhase='day';
 constructor(private park:Park){
  park.scene.traverse(o=>{if(o instanceof THREE.DirectionalLight)this.sun=o;if(o instanceof THREE.HemisphereLight)this.ambient=o;});
  if(!OUTDOOR)return;
  for(const [x,z] of [[21,-34],[-20,32],[-42,-20],[50,-28],[-75,30],[20,-73]]){
   const y=terrainHeight(x,z);
   park.box(new THREE.Vector3(x,y+3,z),new THREE.Vector3(.12,6,.12),0x485757,true);
   park.box(new THREE.Vector3(x+.5,y+5.9,z),new THREE.Vector3(1.1,.08,.08),0x485757,false);
   const lamp=park.box(new THREE.Vector3(x+1,y+5.87,z),new THREE.Vector3(.65,.12,.36),0xffe2aa,false);
   const mat=lamp.material as THREE.MeshStandardMaterial;mat.emissive.set(0xffd698);this.lamps.push(mat);
   const pool=new THREE.Mesh(new THREE.CircleGeometry(5,24),new THREE.MeshBasicMaterial({color:0xffdc9a,transparent:true,opacity:0,depthWrite:false}));
   pool.rotation.x=-Math.PI/2;pool.position.set(x+1,y+.025,z);pool.name='Lamp pool';park.scene.add(pool);
  }
  this.light.position.set(0,6,0);park.scene.add(this.light);
 }
 update(dt:number,phase:DayPhase,player:THREE.Vector3){
  this.phase=phase;if(!OUTDOOR)return;
  const p=phases[phase],a=1-Math.exp(-dt*.9);
  if(this.park.scene.background instanceof THREE.Color)this.park.scene.background.lerp(this.sky.set(p.sky),a);
  if(this.park.scene.fog)this.park.scene.fog.color.lerp(this.sky,a);
  if(this.sun){this.sun.color.lerp(this.color.set(p.sun),a);this.sun.intensity+=(p.power-this.sun.intensity)*a;}
  if(this.ambient)this.ambient.intensity+=(p.ambient-this.ambient.intensity)*a;
  this.lamps.forEach(m=>m.emissiveIntensity+=(p.night*2-m.emissiveIntensity)*a);
  this.park.scene.children.forEach(o=>{if(o.name==='Lamp pool'){const m=(o as THREE.Mesh).material as THREE.MeshBasicMaterial;m.opacity+=(p.night*.095-m.opacity)*a;}});
  this.light.intensity+=(p.night*7-this.light.intensity)*a;
  this.light.position.set(player.x,5,player.z);
 }
}
