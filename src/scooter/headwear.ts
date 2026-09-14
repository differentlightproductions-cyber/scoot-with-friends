import * as THREE from 'three';
import {tube} from './surfaces';
export function fittedHeadwear(points:THREE.Vector3[],kind:string,color:number,quality:string){
 const group=new THREE.Group();group.name='Head-fitted '+kind;if(kind==='none')return group;
 const skull=points.filter(p=>p.y>.02&&p.y<.25&&Math.abs(p.x)<.16),bounds=new THREE.Box3().setFromPoints(skull);
 let rx=Math.max(.073,Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x))+.004);
 let rz=Math.max(.083,(bounds.max.z-bounds.min.z)/2+.005);const cz=(bounds.max.z+bounds.min.z)/2;
 const crown=bounds.max.y+.009,helmet=['helmet','vented','visor'].includes(kind),segments=quality==='low'?32:64,rows=quality==='low'?12:22;
 const rimAt=(phi:number)=>helmet?-.008+(Math.cos(phi)>0?.063:.028)*Math.cos(phi):kind==='beanie'?.030+.024*Math.cos(phi):.025;
 // A human crown is squarer than an ellipsoid. Fit its full profile, not
 // just the extrema; otherwise the upper temples can poke through the shell.
 const shell=new THREE.MeshStandardMaterial({color,roughness:helmet?.42:.92,metalness:helmet?.12:0,side:THREE.DoubleSide}),liner=new THREE.MeshStandardMaterial({color:0x282c2d,roughness:1,side:THREE.DoubleSide});
 const rings:THREE.Vector3[][]=[];
 for(let inner=0;inner<2;inner++){
  const p:number[]=[],indices:number[]=[],ring:THREE.Vector3[]=[];
  for(let j=0;j<=rows;j++)for(let k=0;k<=segments;k++){
   const phi=k/segments*Math.PI*2,theta=j/rows*Math.PI/2;
   const rim=rimAt(phi),radial=Math.pow(Math.sin(theta),.7);
   const point=new THREE.Vector3((rx-inner*.0045)*radial*Math.sin(phi),(crown-inner*.0045)*Math.cos(theta)+rim*(1-Math.cos(theta)),cz+(rz-inner*.0045)*radial*Math.cos(phi));
   p.push(...point.toArray());if(j===rows)ring.push(point);
   if(j<rows&&k<segments){const vent=kind==='vented'&&j/rows>.35&&j/rows<.67&&(k%Math.floor(segments/8)<2);if(!vent){const a=j*(segments+1)+k;indices.push(a,a+1,a+segments+1,a+1,a+segments+2,a+segments+1);}}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setIndex(indices);geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,inner?liner:shell);mesh.castShadow=true;group.add(mesh);rings.push(ring);
 }
 const rimPositions:number[]=[],rimIndices:number[]=[];for(let k=0;k<=segments;k++){rimPositions.push(...rings[0][k].toArray(),...rings[1][k].toArray());if(k<segments){const a=k*2;rimIndices.push(a,a+1,a+2,a+1,a+3,a+2);}}
 const rim=new THREE.BufferGeometry();rim.setAttribute('position',new THREE.Float32BufferAttribute(rimPositions,3));rim.setIndex(rimIndices);rim.computeVertexNormals();group.add(new THREE.Mesh(rim,liner));
 if(helmet){
  const strapMat=new THREE.MeshStandardMaterial({color:0x303b3f,roughness:1,side:THREE.DoubleSide});
  const strap=(path:THREE.Vector3[])=>{const curve=new THREE.CatmullRomCurve3(path),p:number[]=[],ix:number[]=[];for(let i=0;i<=20;i++){const point=curve.getPoint(i/20);p.push(point.x-.004,point.y,point.z,point.x+.004,point.y,point.z);if(i<20){const a=i*2;ix.push(a,a+1,a+2,a+1,a+3,a+2);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();group.add(new THREE.Mesh(g,strapMat));};
  // Both branches start on the rim, then meet below the ear. The shell is
  // asymmetric: a fixed x/z attachment leaves a loose end behind the head.
  const onRim=(phi:number)=>new THREE.Vector3(rx*Math.sin(phi),-.008+(Math.cos(phi)>0?.063:.028)*Math.cos(phi),cz+rz*Math.cos(phi));
  const chinPoints=points.filter(p=>Math.abs(p.x)<.045&&p.y<-.025&&p.z>cz+.03);
  const chinY=chinPoints.length?Math.min(...chinPoints.map(p=>p.y))-.008:-.095;
  const chinZ=chinPoints.length?Math.max(...chinPoints.filter(p=>p.y<chinY+.035).map(p=>p.z))-.012:cz+.085;
  for(const side of [-1,1]){const join=new THREE.Vector3(side*.071,chinY+.044,cz+.035);strap([onRim(side*1.05),new THREE.Vector3(side*(rx-.008),-.052,cz+.060),join]);strap([onRim(side*2.15),new THREE.Vector3(side*(rx-.003),-.063,cz-.025),join]);strap([join,new THREE.Vector3(side*.045,chinY+.012,chinZ-.005),new THREE.Vector3(0,chinY,chinZ)]);}
  const buckle=new THREE.Mesh(new THREE.BoxGeometry(.019,.009,.009),new THREE.MeshStandardMaterial({color:0x495559,roughness:.6}));buckle.position.set(.028,chinY+.005,chinZ);group.add(buckle);
 }
 if(kind==='cap'||kind==='visor'){const shape=new THREE.Shape();shape.moveTo(-.078,.065);shape.quadraticCurveTo(-.108,.16,0,.184);shape.quadraticCurveTo(.108,.16,.078,.065);shape.quadraticCurveTo(0,.095,-.078,.065);const brim=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.003,bevelEnabled:true,bevelSize:.001,bevelThickness:.001,bevelSegments:2,steps:1,curveSegments:16}),shell);brim.rotation.x=Math.PI/2;brim.position.set(0,.027,cz);group.add(brim);}
 if(kind==='beanie')for(const t of [0,.004,.008])group.add(new THREE.Mesh(tube(rings[0].map(p=>p.clone().add(new THREE.Vector3(0,t,0))),.0025),shell));
 group.userData.fit={rx,rz,cz,crown};return group;
}
