import * as THREE from 'three';
import {tube} from '../scooter/surfaces';
import {buildHeadwear,buildShoe} from '../avatar/parts';
import {defaultAvatar} from '../avatar/config';
type Box=(x:number,y:number,z:number,w:number,h:number,l:number,c?:number,solid?:boolean)=>THREE.Mesh;
export function refineShop(scene:THREE.Scene,box:Box){
 const steel=new THREE.MeshStandardMaterial({color:0x475456,metalness:.55,roughness:.42}),rubber=new THREE.MeshStandardMaterial({color:0x232b2b,roughness:.95});
 // Repeating vinyl tiles are one static draw, with narrow grout spacing.
 const tile=new THREE.InstancedMesh(new THREE.BoxGeometry(.985,.008,.985),new THREE.MeshStandardMaterial({color:0x626962,roughness:.85}),210);let n=0;const m=new THREE.Matrix4();for(let x=-7;x<=7;x++)for(let z=-4;z<=8;z++){if((x+z)%2===0){m.makeTranslation(x,.017,z);tile.setMatrixAt(n++,m);}}tile.count=n;tile.receiveShadow=true;scene.add(tile);
 for(const x of [-7.82,7.82]){box(x,.37,2,.07,.7,13.8,0x777f76,false);box(x,.75,2,.08,.035,13.8,0x303f3d,false);box(x,.05,2,.09,.10,13.8,0x2d3735,false);}
 for(const x of [-5.8,5.8])for(const z of [0,3,6]){
  box(x,.08,z,1.04,.1,2.7,0x131c1c,false);
  for(const dz of [-.88,0,.88]){box(x,.31,z+dz,.96,.40,.018,0x3a4643,false);box(x+(x<0?.51:-.51),.34,z+dz,.018,.025,.22,0x9ba19c,false);}
  // Warm-white shelf strips, static and economical; no light per product.
  const strip=box(x,.91,z,.026,.015,2.5,0xecebdc,false);(strip.material as THREE.MeshStandardMaterial).emissive.set(0xecebdc);(strip.material as THREE.MeshStandardMaterial).emissiveIntensity=.5;
  for(const dz of [-1.32,1.32])box(x,.88,z+dz,.99,.018,.018,0x7d8885,false);
 }
 for(let i=0;i<4;i++){
  const root=new THREE.Group(),shirt=new THREE.Shape();shirt.moveTo(-.07,.26);for(const [x,y]of [[-.14,.25],[-.25,.13],[-.19,.06],[-.13,.10],[-.13,-.22],[.13,-.22],[.13,.10],[.19,.06],[.25,.13],[.14,.25],[.07,.26],[.055,.205],[-.055,.205]])shirt.lineTo(x,y);shirt.closePath();
  const cloth=new THREE.MeshStandardMaterial({color:[0xa99c7c,0x344d40,0x273942,0xa15745][i],roughness:.94});const garment=new THREE.Mesh(new THREE.ExtrudeGeometry(shirt,{depth:.02,bevelEnabled:true,bevelThickness:.009,bevelSize:.008,bevelSegments:2,steps:1}),cloth);garment.castShadow=true;root.add(garment);
  const collar=new THREE.Mesh(tube([new THREE.Vector3(-.06,.238,.026),new THREE.Vector3(0,.20,.034),new THREE.Vector3(.06,.238,.026)],.008),cloth);root.add(collar);
  const hanger=new THREE.Mesh(tube([new THREE.Vector3(-.17,.23,0),new THREE.Vector3(0,.32,0),new THREE.Vector3(.17,.23,0),new THREE.Vector3(-.17,.23,0)],.003),steel);root.add(hanger);
  root.rotation.y=Math.PI/2;root.position.set(-7.62,1.91,-2.5+i*1.1);scene.add(root);box(-7.73,2.28,-2.5+i*1.1,.25,.014,.014,0x566362,false);
 }
 // Display stock is built from the same avatar parts the riders wear.
 for(let i=0;i<5;i++){const helmet=buildHeadwear({...defaultAvatar(),headwear:i===2?'beanie':i===4?'cap':'helmet'},new THREE.MeshPhysicalMaterial({color:[0x354746,0xae6a50,0xaeb1a0][i%3],roughness:.35,clearcoat:.7}),rubber,'high');helmet.position.set(-7.57,2.55,-2+i*1.25);helmet.rotation.y=Math.PI/2;scene.add(helmet);box(-7.6,2.40,-2+i*1.25,.35,.025,.43,0x5a6863,false);}
 for(let i=0;i<4;i++){const shoe=buildShoe(['skate','chunky','sneaker','high-top'][i],new THREE.MeshStandardMaterial({color:i%2?0x8e8978:0x26363b,roughness:.8}),new THREE.MeshStandardMaterial({color:0xefece4,roughness:.8}),new THREE.MeshStandardMaterial({color:0xf4f2ec,roughness:.8}),'high');shoe.position.set(-7.56,.98,-2+i*.95);shoe.rotation.y=Math.PI/2;scene.add(shoe);box(-7.6,.89,-2+i*.95,.37,.025,.6,0x5a6863,false);}
 // Counter joints, workbench drawers, wall service board and clear aisle edges.
 for(const x of [1.35,2.4,3.45])box(x,.53,7.11,.018,.91,.025,0x59625b,false);
 for(const z of [-2,2,6])for(const x of [-3,3])box(x,3.22,z,1.12,.026,.025,0x6e7770,false);
 box(-6.6,.46,8,1.9,.62,1.1,0x3d4945,false);for(const y of [.3,.52,.72])box(-6.6,y,7.42,1.8,.022,.022,0x87918a,false);
}
