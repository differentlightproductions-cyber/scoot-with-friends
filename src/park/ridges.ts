import * as THREE from 'three';
/** Connected, deterministic desert ridges. No collision or random placement. */
export function addDesertRidges(scene:THREE.Scene){
 for(let layer=0;layer<3;layer++){
  const p:number[]=[],ix:number[]=[],colors:number[]=[],nx=100,nz=12;
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
   const x=-210+i*4.2,t=j/nz,z=105+layer*19+t*42;
   const broad=13+5*Math.sin(x*.025+layer*2)+3*Math.sin(x*.071+1.3)+1.4*Math.sin(x*.19+layer);
   const shoulder=Math.pow(Math.sin(Math.PI*t),.75),saddle=.8+.2*Math.sin(x*.043+t*2),y=-2+shoulder*(broad+layer*3)*saddle+Math.sin(x*.33+t*17)*shoulder*.7;
   p.push(x,y,z);const c=new THREE.Color().setHSL(.095,.20-layer*.025,.30+layer*.035+(1-shoulder)*.04+Math.sin(x*.15+t*8)*.025).convertSRGBToLinear();colors.push(c.r,c.g,c.b);
  }
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;ix.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(ix);g.computeVertexNormals();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,fog:false}));mesh.name='Connected desert ridge '+layer;scene.add(mesh);
 }
}
