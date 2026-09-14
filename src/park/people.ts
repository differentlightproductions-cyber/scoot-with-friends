import * as THREE from 'three';
import {loadHuman,HumanCharacter,type HumanRig} from '../scooter/human';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
const V=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
function visitor(id:string,quality:'low'|'medium',shirt:number){
 const rider=new THREE.Group(),point=(x:number,y:number,z:number)=>{const o=new THREE.Object3D();o.position.set(x,y,z);return o;};
 const rig:HumanRig={rider,hips:point(0,.89,0),torso:point(0,1.16,0),head:point(0,1.5,0),neck:point(0,1.34,0),helmet:new THREE.Object3D(),upperArms:[],forearms:[],hands:[],thighs:[],shins:[],shoes:[]};
 const limb=(a:THREE.Vector3,b:THREE.Vector3)=>{const o=new THREE.Object3D();o.position.copy(a).lerp(b,.5);o.quaternion.setFromUnitVectors(V(0,1,0),b.clone().sub(a).normalize());o.scale.y=a.distanceTo(b);return o;};
 rig.neck=limb(V(0,1.35,0),V(0,1.41,0));
 for(const s of [-1,1]){const shoulder=V(s*.18,1.33,0),elbow=V(s*.235,1.06,-.025),hand=V(s*.2,.83,.04),hip=V(s*.085,.9,0),knee=V(s*.10,.52,.025),foot=V(s*.10,.13,0);rig.upperArms.push(limb(shoulder,elbow));rig.forearms.push(limb(elbow,hand));rig.hands.push(point(hand.x,hand.y,hand.z));rig.thighs.push(limb(hip,knee));rig.shins.push(limb(knee,foot));rig.shoes.push(point(foot.x,foot.y,foot.z));
  const shoe=new THREE.Mesh(new RoundedBoxGeometry(.105,.09,.24,2,.025),new THREE.MeshStandardMaterial({color:0x303b3e,roughness:.8}));shoe.position.copy(foot).add(V(0,-.045,.04));rider.add(shoe);const sole=new THREE.Mesh(new RoundedBoxGeometry(.109,.022,.245,1,.011),new THREE.MeshStandardMaterial({color:0xd4d2c6,roughness:.9}));sole.position.copy(shoe.position).y-=.042;rider.add(sole);}
 const human=new HumanCharacter(rig,id,quality,{top:'tee',bottom:'chinos',head:'none'},[0xc69a76,shirt,0x344852]);human.update(1);rider.updateMatrixWorld(true);human.group.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.skeleton.update();});return rider;
}
export function addParkPeople(scene:THREE.Scene){
 for(const [i,x,z]of [[0,31,-37],[1,34,-37],[2,-26,32],[3,88,29],[4,28,-109],[5,-36,-65]]){
  const lod=new THREE.LOD();lod.position.set(x,0,z);lod.rotation.y=i*1.7;lod.name='Park visitor / anatomical';scene.add(lod);const id='rider-0'+(i%3+1);
  void loadHuman(id).then(()=>{if(!scene.children.includes(lod))return;const color=[0xa66b48,0xd4c9ad,0x657c59][i%3];lod.addLevel(visitor(id,'medium',color),0);lod.addLevel(visitor(id,'low',color),24);lod.addLevel(new THREE.Group(),80);}).catch(()=>{});
 }
}
