import * as THREE from 'three';
/** Folded edge thickness at collars, cuffs, waist and ankle/shorts openings. */
export function clothEdges(g:THREE.BufferGeometry){
 const position=g.getAttribute('position'),normal=g.getAttribute('normal'),uv=g.getAttribute('uv'),skin=g.getAttribute('skinIndex'),weight=g.getAttribute('skinWeight'),source=Array.from(g.index!.array);
 const p=Array.from(position.array),u=Array.from(uv.array),s=Array.from(skin.array),w=Array.from(weight.array),edges=new Map<string,{a:number;b:number;count:number;slot:number}>();
 const key=(i:number)=>[position.getX(i),position.getY(i),position.getZ(i)].map(v=>Math.round(v*1e5)).join(',');
 for(let n=0;n<source.length;n+=3)for(let e=0;e<3;e++){const a=source[n+e],b=source[n+(e+1)%3],id=[key(a),key(b)].sort().join('/'),entry=edges.get(id);if(entry)entry.count++;else edges.set(id,{a,b,count:1,slot:g.groups.find(x=>n>=x.start&&n<x.start+x.count)?.materialIndex??0});}
 const slots=g.groups.map(group=>source.slice(group.start,group.start+group.count));
 for(const {a,b,count,slot}of edges.values())if(count===1){const start=p.length/3;for(const [i,inside]of [[a,0],[b,0],[a,1],[b,1]]){p.push(position.getX(i)-normal.getX(i)*.0035*inside,position.getY(i)-normal.getY(i)*.0035*inside,position.getZ(i)-normal.getZ(i)*.0035*inside);u.push(uv.getX(i),uv.getY(i));for(let k=0;k<4;k++){s.push(skin.array[i*4+k]);w.push(weight.array[i*4+k]);}}slots[slot].push(start,start+1,start+2,start+1,start+3,start+2);}
 g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(u,2));g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(s,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(w,4));g.setIndex(slots.flat());g.clearGroups();let start=0;slots.forEach((indices,slot)=>{g.addGroup(start,indices.length,slot);start+=indices.length;});g.computeVertexNormals();
}
