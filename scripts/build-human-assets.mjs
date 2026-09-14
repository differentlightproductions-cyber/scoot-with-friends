// Reproducible CC0 mesh preparation. No MakeHuman application code is used.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {MeshoptSimplifier} from 'meshoptimizer';
import {handFrames,handPoses} from './human-hand-frames.mjs';
await MeshoptSimplifier.ready;
function levels(mesh){const indices=[],uvs=new Map();for(const f of mesh.faces){f.forEach(([i,t])=>uvs.set(i,t));for(let j=1;j<f.length-1;j++)indices.push(f[0][0],f[j][0],f[j+1][0]);}mesh.lod={};for(const [name,ratio,error]of [['low',.28,.005],['medium',.6,.002]]){const [out]=MeshoptSimplifier.simplify(new Uint32Array(indices),new Float32Array(mesh.positions.flat()),3,Math.floor(indices.length*ratio/3)*3,error,['LockBorder']);const faces=[];for(let i=0;i<out.length;i+=3)faces.push([...out.slice(i,i+3)].map(v=>[v,uvs.get(v)]));mesh.lod[name]=faces;}return mesh;}
const root='assets-source/humans/',base=[],uv=[],faces=[];let group='';
for(const line of readFileSync(root+'base.obj','utf8').split(/\r?\n/)){const a=line.trim().split(/\s+/);if(a[0]==='v')base.push(a.slice(1).map(Number));if(a[0]==='vt')uv.push(a.slice(1).map(Number));if(a[0]==='g')group=a[1];if(a[0]==='f'&&group==='body')faces.push(a.slice(1).map(s=>s.split('/').map(n=>Number(n)-1)));}
const rig=JSON.parse(readFileSync(root+'default.mhskel')),weights=JSON.parse(readFileSync(root+'default_weights.mhw')).weights;
const names=['hips','torso','head','neck','upper.R','lower.R','hand.R','thigh.R','shin.R','foot.R','upper.L','lower.L','hand.L','thigh.L','shin.L','foot.L'];
function category(n){const side=n.endsWith('.L')?'.L':'.R';if(n.startsWith('upperarm'))return 'upper'+side;if(n.startsWith('lowerarm'))return 'lower'+side;if(/finger|wrist|metacarpal/.test(n))return 'hand'+side;if(n.startsWith('upperleg'))return 'thigh'+side;if(n.startsWith('lowerleg'))return 'shin'+side;if(/toe|foot/.test(n))return 'foot'+side;if(n.startsWith('neck'))return 'neck';if(/spine0[123]|clavicle|shoulder|breast/.test(n))return 'torso';if(/pelvis|root|spine0[45]/.test(n))return 'hips';return 'head';}
const vw=base.map(()=>new Map());for(const [bone,list] of Object.entries(weights))for(const [i,w] of list){const b=names.indexOf(category(bone));vw[i].set(b,(vw[i].get(b)||0)+w);}
const si=[],sw=[];for(const weights of vw){let w=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4);if(!w.length)w=[[0,1]];const sum=w.reduce((s,a)=>s+a[1],0);while(w.length<4)w.push([0,0]);si.push(w.map(a=>a[0]));sw.push(w.map(a=>a[1]/sum));}
const bodyIds=[...new Set(faces.flatMap(f=>f.map(v=>v[0])))];
const nearestCache=new Map();function nearest(i){if(vw[i].size)return vw[i];if(nearestCache.has(i))return nearestCache.get(i);const p=base[i];let nearest=-1,distance=Infinity;for(const j of bodyIds){const d=base[j].reduce((n,v,k)=>n+(v-p[k])**2,0);if(d<distance){distance=d;nearest=j;}}const result=vw[nearest];nearestCache.set(i,result);return result;}
function garment(name,folder,points){
 const prefix=root+'system/'+folder+'/'+name+'/'+name,refs=[],remove=[];let mode='',scales=[1,1,1];
 for(const line of readFileSync(prefix+'.mhclo','utf8').split(/\r?\n/)){const a=line.trim().split(/\s+/);if(a[0]==='verts'){mode='verts';continue;}if(a[0]==='delete_verts'){mode='delete';continue;}if(/^[xyz]_scale$/.test(a[0])){const k='xyz'.indexOf(a[0][0]);scales[k]=Math.abs(points[+a[1]][k]-points[+a[2]][k])/(+a[3]);}if(!/^\d/.test(line.trim()))continue;if(mode==='verts')refs.push(a.map(Number));if(mode==='delete')for(let i=0;i<a.length;i++){if(a[i+1]==='-'){for(let j=+a[i];j<=+a[i+2];j++)remove.push(j);i+=2;}else remove.push(+a[i]);}}
 const positions=[],skinIndex=[],skinWeight=[],uv=[],faces=[];
 for(const r of refs){const ids=r.length===1?[r[0]]:r.slice(0,3),ws=r.length===1?[1]:r.slice(3,6);positions.push([0,1,2].map(k=>ids.reduce((s,i,j)=>s+points[i][k]*ws[j],0)+(r[6+k]??0)*scales[k]).map((n,k)=>k===1?(n+8.1676)*.09+.14:n*.09));const sum=new Map();ids.forEach((id,i)=>nearest(id).forEach((w,b)=>sum.set(b,(sum.get(b)||0)+w*ws[i])));const sorted=[...sum].filter(a=>a[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,4);const total=sorted.reduce((s,a)=>s+a[1],0);while(sorted.length<4)sorted.push([0,0]);skinIndex.push(sorted.map(a=>a[0]));skinWeight.push(sorted.map(a=>a[1]/total));}
 for(const line of readFileSync(prefix+'.obj','utf8').split(/\r?\n/)){const a=line.trim().split(/\s+/);if(a[0]==='vt')uv.push(a.slice(1).map(Number));if(a[0]==='f')faces.push(a.slice(1).map(s=>s.split('/').map(n=>+n-1)));}
 return levels({positions,skinIndex,skinWeight,uv,faces,remove});
}
const definitions={hips:['root','head'],torso:['spine02','head'],head:['head','head'],neck:['neck01','head']};
mkdirSync('public/models/humans',{recursive:true});
for(const [person,target] of ['male.target','rider2.target','female.target'].entries()){
 const points=base.map(p=>[...p]);for(const line of readFileSync(root+target,'utf8').split(/\r?\n/)){if(!/^\d/.test(line))continue;const [i,...d]=line.split(/\s+/).map(Number);for(let k=0;k<3;k++)points[i][k]+=d[k];}
 // Original identity refinements: jaw/chin, cheek width and nose bridge vary.
 for(const p of points){const face=Math.max(0,1-Math.abs(p[1]-7.15)/1.0);if(p[2]>.5){p[0]*=1+face*([.025,-.025,-.04][person]);p[2]+=face*([.035,-.03,.015][person]);}}
 const convert=p=>p.map((n,k)=>k===1?(n+8.1676)*.09+.14:n*.09);
 const avg=(bone,end)=>{const ids=rig.joints[rig.bones[bone][end]];return convert(ids.reduce((v,i)=>v.map((n,k)=>n+points[i][k]/ids.length),[0,0,0]));};
 const anchors=names.map(n=>{const side=n.endsWith('.L')?'.L':'.R';if(n.startsWith('upper.'))return [avg('upperarm01'+side,'head'),avg('upperarm02'+side,'tail')];if(n.startsWith('lower.'))return [avg('lowerarm01'+side,'head'),avg('lowerarm02'+side,'tail')];if(n.startsWith('thigh.'))return [avg('upperleg01'+side,'head'),avg('upperleg02'+side,'tail')];if(n.startsWith('shin.'))return [avg('lowerleg01'+side,'head'),avg('lowerleg02'+side,'tail')];if(n.startsWith('foot.'))return [avg('foot'+side,'head'),avg('foot'+side,'tail')];if(n.startsWith('hand.'))return [avg('wrist'+side,'head'),avg('wrist'+side,'tail')];if(n==='head'){const a=avg('head','head'),b=avg('head','tail');return [a.map((v,k)=>(v+b[k])/2),b];}return [avg(...definitions[n]),avg(n==='neck'?'neck03':n==='hips'?'spine04':'spine01','tail')];});
 const garments={};for(const [style,n]of [['tee','06'],['hoodie','02'],['jacket','05']])garments[style]=garment('male_casualsuit'+n,'clothes',points);
 const hairName=['short01','afro01','ponytail01'][person];copyFileSync(root+'system/hair/'+hairName+'/'+(hairName==='afro01'?'afro':hairName)+'_diffuse.png',`public/models/humans/hair-${person+1}.png`);
 const hair=garment(['short01','afro01','ponytail01'][person],'hair',points);
 const out=levels({revision:'anatomical-riders-1',names,anchors,eyes:[avg('eye.R','head'),avg('eye.L','head')],positions:points.map(convert),skinIndex:si,skinWeight:sw,uv,faces,garments,hair});
 out.handFrames=handFrames(out,rig);
 out.handPoses=handPoses(out,rig,weights);
 writeFileSync(`public/models/humans/rider-${person+1}.json`,JSON.stringify(out,(_,value)=>typeof value==='number'?Math.round(value*1e6)/1e6:value));
 console.log(`Rider ${person+1}: ${faces.length} authored quads, ${points.length} source vertices`);
 const skin=[['young_caucasian_male','young_lightskinned_male_diffuse.png'],['young_african_male','young_darkskinned_male_diffuse.png'],['young_asian_female','young_lightskinned_female_diffuse3.png']][person];copyFileSync(root+'system/skins/'+skin[0]+'/'+skin[1],`public/models/humans/skin-${person+1}.png`);
}
