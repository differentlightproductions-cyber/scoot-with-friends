import * as THREE from "three";
// Elliptical cross sections keep clothing silhouettes soft with a small,
// predictable vertex budget. Used independently for modular clothing pieces.
export function tailored(rings: [number,number,number][], sides=32) {
  const curve=new THREE.CatmullRomCurve3(rings.map(([y,w,d])=>new THREE.Vector3(w,y,d)),false,'centripetal');
  rings=curve.getPoints(Math.max(12,(rings.length-1)*4)).map(p=>[p.y,p.x,p.z]);
  const p:number[]=[], indices:number[]=[],uv:number[]=[];
  for(const [y,width,depth] of rings) for(let i=0;i<sides;i++) {
    const a=i/sides*Math.PI*2;
    p.push(Math.cos(a)*width,y,Math.sin(a)*depth);uv.push(i/sides,(y-rings[0][0])/(rings.at(-1)![0]-rings[0][0]));
  }
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<sides;i++){
    const a=j*sides+i,b=j*sides+(i+1)%sides,c=a+sides,d=b+sides;
    indices.push(a,c,b,b,c,d);
  }
  for(let i=1;i<sides-1;i++) {indices.push(0,i,i+1);
    const top=(rings.length-1)*sides;indices.push(top,top+i+1,top+i);}
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
