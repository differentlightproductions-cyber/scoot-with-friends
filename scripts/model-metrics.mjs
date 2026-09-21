import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const paths=process.argv.slice(2);
if(!paths.length) paths.push('public/models/park/wooden-quarter.glb','public/models/park/small-box.glb','public/models/park/large-box.glb','public/models/park/wood-hub.glb');
for (const path of paths) {
  const bytes=readFileSync(path),gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const primitives=(gltf.meshes??[]).flatMap(mesh=>mesh.primitives);
  console.log(JSON.stringify({file:path,bytes:bytes.length,triangles:primitives.reduce((n,p)=>n+(p.indices===undefined?gltf.accessors[p.attributes.POSITION].count:gltf.accessors[p.indices].count)/3,0),vertices:primitives.reduce((n,p)=>n+gltf.accessors[p.attributes.POSITION].count,0),textures:gltf.images?.length??0,sha256:createHash('sha256').update(bytes).digest('hex')}));
}
