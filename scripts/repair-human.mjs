import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const source = process.argv[2];
const output = process.argv[3];
if (!source || !output) throw new Error('usage: node repair-human.mjs source.glb output.glb');
const data = readFileSync(source);
const jsonLength = data.readUInt32LE(12);
const json = JSON.parse(data.subarray(20, 20 + jsonLength));
const binHeader = 20 + jsonLength;
const binLength = data.readUInt32LE(binHeader);
const bin = Buffer.from(data.subarray(binHeader + 8, binHeader + 8 + binLength));
const skin = json.skins[0];
const accessor = json.accessors[skin.inverseBindMatrices];
const view = json.bufferViews[accessor.bufferView];
const offset = view.byteOffset + (accessor.byteOffset || 0);

const mul = (a, b) => Array.from({ length: 16 }, (_, c) => {
  const col = c >> 2, row = c & 3;
  return a[row] * b[col * 4] + a[4 + row] * b[col * 4 + 1] + a[8 + row] * b[col * 4 + 2] + a[12 + row] * b[col * 4 + 3];
});
const inv = m => {
  const a = Array(16), out = Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) a[r * 4 + c] = m[c * 4 + r];
  for (let i = 0; i < 16; i++) out[i] = i % 5 === 0 ? 1 : 0;
  for (let c = 0; c < 4; c++) {
    let p = c; for (let r = c + 1; r < 4; r++) if (Math.abs(a[r * 4 + c]) > Math.abs(a[p * 4 + c])) p = r;
    for (let k = 0; k < 4; k++) [a[c * 4 + k], a[p * 4 + k]] = [a[p * 4 + k], a[c * 4 + k]], [out[c * 4 + k], out[p * 4 + k]] = [out[p * 4 + k], out[c * 4 + k]];
    const d = a[c * 4 + c]; if (Math.abs(d) < 1e-10) throw new Error('singular bind matrix');
    for (let k = 0; k < 4; k++) a[c * 4 + k] /= d, out[c * 4 + k] /= d;
    for (let r = 0; r < 4; r++) if (r !== c) { const f = a[r * 4 + c]; for (let k = 0; k < 4; k++) a[r * 4 + k] -= f * a[c * 4 + k], out[r * 4 + k] -= f * out[c * 4 + k]; }
  }
  return Array.from({ length: 16 }, (_, c) => out[(c & 3) * 4 + (c >> 2)]);
};
const globals = new Map();
// Source exporter wrote bind-space axes 90 degrees away from the mesh: rotate
// the armature rest frame +90 degrees around glTF Y while leaving mesh data put.
const restCorrection = [0,0,-1,0, 0,1,0,0, 1,0,0,0, 0,0,0,1];
skin.joints.forEach((nodeIndex, i) => {
  const ibm = Array.from({ length: 16 }, (_, k) => data.readFloatLE(binHeader + 8 + offset + i * 64 + k * 4));
  globals.set(nodeIndex, mul(restCorrection, inv(ibm)));
});
const parent = new Map();
json.nodes.forEach((node, i) => node.children?.forEach(child => parent.set(child, i)));
for (const nodeIndex of skin.joints) {
  const p = parent.get(nodeIndex), global = globals.get(nodeIndex);
  json.nodes[nodeIndex].matrix = p != null && globals.has(p) ? mul(inv(globals.get(p)), global) : global;
  delete json.nodes[nodeIndex].translation; delete json.nodes[nodeIndex].rotation; delete json.nodes[nodeIndex].scale;
}
// Correct inverse binds before any importer sees the file.
for (let i = 0; i < skin.joints.length; i++) {
  const corrected = inv(globals.get(skin.joints[i]));
  for (let k = 0; k < 16; k++) bin.writeFloatLE(corrected[k], offset + i * 64 + k * 4);
}

const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const sizes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
const accessorInfo = index => {
  const a = json.accessors[index], v = json.bufferViews[a.bufferView];
  return { a, offset: (v.byteOffset || 0) + (a.byteOffset || 0), stride: v.byteStride || components[a.type] * sizes[a.componentType] };
};
const primitive = json.meshes.flatMap(m => m.primitives).find(p => p.attributes.POSITION != null && p.attributes.JOINTS_0 != null);
const pos = accessorInfo(primitive.attributes.POSITION), joints = accessorInfo(primitive.attributes.JOINTS_0), weights = accessorInfo(primitive.attributes.WEIGHTS_0);
if (pos.a.componentType !== 5126 || joints.a.componentType !== 5123 || weights.a.componentType !== 5126) throw new Error('unexpected skin accessor layout');
const positionBytes = bin.subarray(pos.offset, pos.offset + pos.stride * pos.a.count);
const positionHash = createHash('sha256').update(positionBytes).digest('hex');
const points = Array.from({ length: pos.a.count }, (_, i) => [0, 1, 2].map(k => bin.readFloatLE(pos.offset + i * pos.stride + k * 4)));
const bbox = [0, 1, 2].map(k => [Math.min(...points.map(p => p[k])), Math.max(...points.map(p => p[k]))]);
const jointRecords = skin.joints.map((nodeIndex, jointIndex) => {
  const start = globals.get(nodeIndex).slice(12, 15);
  const child = json.nodes[nodeIndex].children?.find(n => globals.has(n));
  const end = child == null ? start : globals.get(child).slice(12, 15);
  return { jointIndex, name: json.nodes[nodeIndex].name || '', start, end };
});
const distSegment = (p, a, b) => {
  const ab=b.map((x,i)=>x-a[i]), ap=p.map((x,i)=>x-a[i]), l=ab.reduce((s,x)=>s+x*x,0);
  const t=l<1e-12?0:Math.max(0,Math.min(1,ap.reduce((s,x,i)=>s+x*ab[i],0)/l));
  return Math.hypot(...p.map((x,i)=>x-a[i]-ab[i]*t));
};
const allowed = p => {
  const side=p[0] <= 0 ? 'Left' : 'Right', y=p[1];
  const lateral=Math.abs(p[0]), armEdge=y>.80?.105:.075;
  if (y > .61 && lateral > armEdge) {
    const arm=jointRecords.filter(b => b.name.includes(side) && /Shoulder|Arm|ForeArm|Hand/.test(b.name));
    // Let inner sleeve/shoulder vertices blend into the upper torso instead of
    // switching groups at a single x/y plane.
    return lateral < .18 ? arm.concat(jointRecords.filter(b => /Spine2|Neck/.test(b.name))) : arm;
  }
  // The shirt collar and broad shoulder panels reach above 0.80; reserving
  // Head for the actual cranium avoids pulling those panels with head motion.
  if (y > .845) return jointRecords.filter(b => b.name.endsWith('Head'));
  if (y < .53) return jointRecords.filter(b => b.name.includes(side) && /UpLeg|Leg|Foot|Toe/.test(b.name));
  return jointRecords.filter(b => /Hips|Spine|Neck|Head/.test(b.name));
};
const primaryCounts={};
for (let i = 0; i < points.length; i++) {
  const candidates=allowed(points[i]).map(b=>[distSegment(points[i],b.start,b.end),b]).sort((a,b)=>a[0]-b[0]);
  const nearest=candidates[0][0], chosen=candidates.slice(0,4).filter(x=>x[0]-nearest<.055).map(([d,b])=>[Math.exp(-(d-nearest)/.018),b]);
  const total=chosen.reduce((s,x)=>s+x[0],0);
  primaryCounts[chosen[0][1].name]=(primaryCounts[chosen[0][1].name]||0)+1;
  for (let k=0;k<4;k++) {
    bin.writeUInt16LE(k<chosen.length?chosen[k][1].jointIndex:0,joints.offset+i*joints.stride+k*2);
    bin.writeFloatLE(k<chosen.length?chosen[k][0]/total:0,weights.offset+i*weights.stride+k*4);
  }
}
const outputPositionHash = createHash('sha256').update(bin.subarray(pos.offset, pos.offset + pos.stride * pos.a.count)).digest('hex');
const encoded = Buffer.from(JSON.stringify(json));
const paddedLength = (encoded.length + 3) & ~3;
const jsonChunk = Buffer.alloc(paddedLength, 0x20); encoded.copy(jsonChunk);
const result = Buffer.alloc(12 + 8 + paddedLength + 8 + bin.length);
result.write('glTF', 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
result.writeUInt32LE(paddedLength, 12); result.writeUInt32LE(0x4e4f534a, 16); jsonChunk.copy(result, 20);
result.writeUInt32LE(bin.length, 20 + paddedLength); result.writeUInt32LE(0x004e4942, 24 + paddedLength); bin.copy(result, 28 + paddedLength);
writeFileSync(output, result);
const report={ joints: skin.joints.length, restoredNodeTransforms: skin.joints.length, vertices: pos.a.count, bbox, positionHash, outputPositionHash, positionsIdentical: positionHash===outputPositionHash, primaryCounts, bytes: result.length };
writeFileSync(output.replace(/\.glb$/i,'.repair.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
