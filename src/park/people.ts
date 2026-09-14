import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {tailored} from '../scooter/geometry';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
export function addParkPeople(scene:THREE.Scene) {
 const skin=new THREE.MeshStandardMaterial({color:0xb98f70,roughness:.95});
 const pants=new THREE.MeshStandardMaterial({color:0x344c52,roughness:1});
 const shoes=new THREE.MeshStandardMaterial({color:0x252c2e,roughness:.9});
 for(const [i,x,z] of [[0,31,-37],[1,34,-37],[2,-26,32],[3,88,29],[4,28,-109],[5,-36,-65]]) {
  const lod=new THREE.LOD();lod.position.set(x,0,z);lod.rotation.y=i*1.7;lod.name='Park visitor';
  const shirt=new THREE.MeshStandardMaterial({color:[0xa66b48,0xd4c9ad,0x657c59][i%3],roughness:1});
  for(const [distance,segments] of [[0,10],[28,6]]){
   const group=new THREE.Group(),skinParts:THREE.BufferGeometry[]=[],pantsParts:THREE.BufferGeometry[]=[],shoeParts:THREE.BufferGeometry[]=[],shirtParts:THREE.BufferGeometry[]=[];
   shirtParts.push(tailored([[-.22,.16,.105],[.13,.2,.115],[.22,.08,.065]],segments).translate(0,1.12,0));
   skinParts.push(new THREE.SphereGeometry(.125,segments,6).scale(.9,1.1,1).translate(0,1.48,0));
   skinParts.push(new THREE.CylinderGeometry(.05,.055,.14,segments).translate(0,1.33,0));
   for(const sign of [-1,1]){
    shirtParts.push(new THREE.CylinderGeometry(.075,.07,.23,segments).rotateZ(sign*.18).translate(sign*.2,1.16,0));
    skinParts.push(new THREE.CylinderGeometry(.038,.05,.31,segments).rotateZ(sign*.08).translate(sign*.23,.9,.015));
    skinParts.push(new THREE.SphereGeometry(.052,6,4).scale(.8,1.3,.8).translate(sign*.245,.73,.025));
    pantsParts.push(tailored([[-.36,.065,.065],[0,.075,.078],[.38,.093,.08]],segments).translate(sign*.093,.5,0));
    shoeParts.push(new RoundedBoxGeometry(.11,.08,.24,1,.025).translate(sign*.095,.08,.05));
    if(distance===0)shoeParts.push(new THREE.SphereGeometry(.012,4,3).translate(sign*.045,1.5,.113));
   }
   for(const [parts,mat] of [[skinParts,skin],[pantsParts,pants],[shoeParts,shoes],[shirtParts,shirt]] as const){
    const normalized=parts.map(g=>{const n=g.index?g.toNonIndexed():g;n.deleteAttribute('uv');return n;});
    const mesh=new THREE.Mesh(mergeGeometries(normalized),mat);mesh.castShadow=distance===0;group.add(mesh);
    parts.forEach(g=>g.dispose());normalized.forEach(g=>g.dispose());
   }
   lod.addLevel(group,distance);
  }
  lod.addLevel(new THREE.Group(),95);scene.add(lod);
 }
}
