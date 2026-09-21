"""Fit the supplied textured mesh; keep original and UVs. Blender background script."""
import bpy, json, math, os, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
mode=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'small'
source,width,length,rise,run,deck,asset = {
 'small':('skate ramp 3d model.glb',5.,13.,1.4,2.75,1.75,'small-box'),
 'large':('big box ramp.glb',12.,17.,2.3,4.,1.65,'large-box'),
 'hub':('wood hub bc.glb',.62,12.7,1.82,3.45,1.75,'wood-hub'),
}[mode]
OUT=os.path.join(ROOT,'artifacts',asset+'-fit');os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(os.path.expanduser('~'),'Downloads',source))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join()
obj=bpy.context.object
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
# Simplify the intact source before bending it. Collapsing the already-bent
# transfer can join its closely overlapping underside and destroy the roof.
if mode=='large':
 mod=obj.modifiers.new('Browser derivative','DECIMATE');mod.ratio=.06
 bpy.ops.object.modifier_apply(modifier=mod.name)
verts=obj.data.vertices
lo=Vector(tuple(min(v.co[a] for v in verts) for a in range(3)))
hi=Vector(tuple(max(v.co[a] for v in verts) for a in range(3)))
size=hi-lo
assert size.y>size.z, f'Unexpected source run/height axes {size}'
tree=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get())
# Straighten the source's irregular width along its run. Keep the actual mesh,
# using a sampled cross-section envelope rather than inventing a second ramp.
rows=201; cols=33
widths=[[float('inf'),float('-inf')] for _ in range(rows)]
for v in verts:
 i=min(rows-1,max(0,round((v.co.y-lo.y)/size.y*(rows-1))))
 widths[i][0]=min(widths[i][0],v.co.x);widths[i][1]=max(widths[i][1],v.co.x)
for i,w in enumerate(widths):
 if not math.isfinite(w[0]):widths[i]=widths[max(0,i-1)][:]
widths=[[min(widths[j][0] for j in range(max(0,i-2),min(rows,i+3))),max(widths[j][1] for j in range(max(0,i-2),min(rows,i+3)))] for i in range(rows)]
heightmap=[]
for i,(left,right) in enumerate(widths):
 y=lo.y+size.y*(i+.01)/(rows-.98);row=[]
 for j in range(cols):
  x=left+(right-left)*(j+.05)/(cols-.9)
  p,n,ix,d=tree.ray_cast(Vector((x,y,hi.z+size.z)),Vector((0,0,-1)))
  row.append(p.z-lo.z if p else None)
 valid=[h for h in row if h is not None]
 fallback=sorted(valid)[len(valid)//2] if valid else size.z*.012
 heightmap.append([fallback if h is None else h for h in row])
def sample2d(t,x):
 q=max(0,min(rows-1.00001,t*(rows-1)));i=int(q);blend=q-i
 left=widths[i][0]*(1-blend)+widths[i+1][0]*blend
 right=widths[i][1]*(1-blend)+widths[i+1][1]*blend
 f=max(0,min(1,(x-left)/max(1e-8,right-left)));c=f*(cols-1);j=min(cols-2,int(c));b=c-j
 top=(heightmap[i][j]*(1-b)+heightmap[i][j+1]*b)*(1-blend)+(heightmap[i+1][j]*(1-b)+heightmap[i+1][j+1]*b)*blend
 return f,top
samples=[]
for i in range(401):
 t=(i+.2)/401;y=lo.y+size.y*t
 hits=[]
 for f in [.4,.5,.6]:
  p,n,ix,d=tree.ray_cast(Vector((lo.x+size.x*f,y,hi.z+size.z)),Vector((0,0,-1)))
  if p:hits.append(p.z-lo.z)
 samples.append(sorted(hits)[len(hits)//2] if hits else None)
assert sum(h is None for h in samples)<8,'Too many holes in source riding surface'
for i,h in enumerate(samples):
 if h is None:samples[i]=samples[max(0,i-1)] or 0
peak=sorted(samples)[int(len(samples)*.98)]
plateau=[i for i,h in enumerate(samples) if h>peak*.985]
a,b=plateau[0]/400,plateau[-1]/400
# The shorter entry is the curved launch; flip run coordinates if necessary.
flip=False if mode=='hub' else (a<.06 or (b<.94 and a>1-b))
if flip:samples=samples[::-1];a,b=1-b,1-a
# A quarter-shaped source has no rear landing. Extend/bend its existing flat
# deck into the requested transfer; retain that deck's original UV texture.
if mode!='hub' and b>.94:b=a+(1-a)*.22
if mode!='hub':assert .06<a<b<.99,(a,b)
def surface(t):
 q=min(399.999,max(0,t*400));i=int(q)
 return samples[i]*(1-q+i)+samples[min(400,i+1)]*(q-i)
def remap(t):
 if mode=='hub':return t*length
 if t<a:return t/a*run
 if t<b:return run+(t-a)/(b-a)*deck
 return run+deck+(t-b)/(1-b)*(length-run-deck)
def height(d):
 if mode=='hub':
  if d<3.45:return .42+(1.82-.42)*d/3.45
  if d<5.2:return 1.82
  return 1.82-(1.82-.48)*(d-5.2)/7.5
 if d<run:
  r=(run**2+rise**2)/(2*rise)
  return r-math.sqrt(max(0,r*r-d*d))
 if d<run+deck:return rise
 t=max(0,min(1,(length-d)/(length-run-deck)));return rise*t*t*(3-2*t)
for v in verts:
 t=(v.co.y-lo.y)/size.y
 f,top=sample2d(t,v.co.x)
 if flip:t=1-t
 d=remap(t)
 # Preserve shell detail relative to its local top, while matching the riding profile.
 ratio=min(1.008,max(0,(v.co.z-lo.z))/max(size.z*.012,top))
 v.co.x=(f-.5)*width
 v.co.y=d-length/2
 v.co.z=height(d)*ratio
obj.data.update()
def audit(label):
 tree=BVHTree.FromPolygons([v.co.copy() for v in obj.data.vertices],[list(p.vertices) for p in obj.data.polygons])
 missing=0;error=0
 for fx in [.2,.5,.8]:
  for i in range(1,24):
   d=length*i/24;p,n,ix,dist=tree.ray_cast(Vector(((fx-.5)*width,d-length/2,rise+5)),Vector((0,0,-1)))
   if p:error=max(error,abs(p.z-height(d)))
   else:missing+=1
 print(label,'missing',missing,'max',error,flush=True)
if mode!='large':
 mod=obj.modifiers.new('Browser derivative','DECIMATE');mod.ratio=.06
 bpy.ops.object.modifier_apply(modifier=mod.name)
audit('FITTED DERIVATIVE')
obj.name=asset+' original Tripo mesh fitted'
obj.data.update()
capmat=bpy.data.materials.new('Matte charcoal repaired side');capmat.diffuse_color=(.03,.038,.036,1);capmat.use_nodes=True
bsdf=capmat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.03,.038,.036,1);bsdf.inputs['Roughness'].default_value=.9
for side in [-1,1]:
 points=[];faces=[]
 for i in range(201):
  d=length*i/200;points.extend([(side*(width/2+.006),d-length/2,0),(side*(width/2+.006),d-length/2,height(d))])
 for i in range(200):
  face=(i*2,i*2+1,i*2+3,i*2+2);faces.append(face if side>0 else face[::-1])
 mesh=bpy.data.meshes.new(asset+' side closure');mesh.from_pydata(points,[],faces);mesh.update()
 cap=bpy.data.objects.new(asset+' repaired side '+str(side),mesh);bpy.context.collection.objects.link(cap);cap.data.materials.append(capmat);cap.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public/models/park',asset+'.glb'),export_format='GLB',use_selection=True,export_apply=True)
report={'sourceBounds':list(size),'plateauStart':a,'plateauEnd':b,'flipSourceRun':flip,'target':[width,length,rise],'polygons':len(obj.data.polygons),'vertices':len(obj.data.vertices),'sourceProfile':samples}
with open(os.path.join(OUT,'fit.json'),'w') as f:json.dump(report,f,indent=2)
print('FIT',a,b,flip,'polygons',len(obj.data.polygons))
