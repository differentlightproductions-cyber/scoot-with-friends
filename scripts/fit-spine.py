"""Fit the owner-supplied spine to the analytic park envelope."""
import bpy, json, os
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE=os.path.join(os.path.expanduser('~'),'Downloads','spinebc.glb')
OUT=os.path.join(ROOT,'artifacts','spine-fit'); os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SOURCE)
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
# Tripo exports a unit helper cube alongside the detailed asset.
for o in list(meshes):
 if len(o.data.polygons)==6:
  bpy.data.objects.remove(o,do_unlink=True); meshes.remove(o)
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]; bpy.ops.object.join(); obj=bpy.context.object
# Bake the imported glTF node hierarchy. Leaving the Tripo parent attached
# re-applies its normalization transform when exporting the fitted derivative.
world=obj.matrix_world.copy()
obj.data.transform(world)
obj.parent=None
obj.matrix_world.identity()
verts=obj.data.vertices
lo=Vector(tuple(min(v.co[a] for v in verts) for a in range(3)))
hi=Vector(tuple(max(v.co[a] for v in verts) for a in range(3)))
size=hi-lo
for v in verts:
 # Source X is the run and Y is width; rotate into the park's X-width/Z-run frame.
 source_x,source_y=v.co.x,v.co.y
 v.co.x=(source_y-(lo.y+hi.y)/2)*7/size.y
 v.co.y=-(source_x-(lo.x+hi.x)/2)*6.25/size.x
 v.co.z=(v.co.z-lo.z)*2.2/size.z
obj.data.update()
# Normalize the source's irregular cross-section width at each run station.
rows=401; widths=[[float('inf'),float('-inf')] for _ in range(rows)]
for v in verts:
 i=min(rows-1,max(0,round((v.co.y+3.125)/6.25*(rows-1))))
 widths[i][0]=min(widths[i][0],v.co.x); widths[i][1]=max(widths[i][1],v.co.x)
for i in range(rows):
 if widths[i][0]==float('inf'): widths[i]=widths[max(0,i-1)][:]
radius=(3*3+2.2*2.2)/(2*2.2)
def height(y):
 d=min(abs(y+3.125),abs(3.125-y),3); return radius-(max(0,radius*radius-d*d))**.5
pre_tree=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get())
tops=[]
for i in range(rows):
 y=-3.125+6.25*i/(rows-1); p,*_=pre_tree.ray_cast(Vector((0,y,5)),Vector((0,0,-1)))
 tops.append(p.z if p else (tops[-1] if tops else 0))
for v in verts:
 q=max(0,min(rows-1,(v.co.y+3.125)/6.25*(rows-1))); i=min(rows-2,int(q)); blend=q-i
 left=widths[i][0]*(1-blend)+widths[i+1][0]*blend; right=widths[i][1]*(1-blend)+widths[i+1][1]*blend
 v.co.x=((v.co.x-left)/max(.001,right-left)-.5)*7
 top=tops[i]*(1-blend)+tops[i+1]*blend
 v.co.z += height(v.co.y)-top
obj.data.update()
mod=obj.modifiers.new('Browser derivative','DECIMATE'); mod.ratio=.05
bpy.ops.object.modifier_apply(modifier=mod.name)
# Decimation can move the dense riding sheet slightly; restore its longitudinal envelope.
verts=obj.data.vertices; post_tree=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get()); post=[]
for i in range(rows):
 y=-3.125+6.25*i/(rows-1); p,*_=post_tree.ray_cast(Vector((0,y,5)),Vector((0,0,-1))); post.append(p.z if p else (post[-1] if post else 0))
for v in verts:
 q=max(0,min(rows-1,(v.co.y+3.125)/6.25*(rows-1))); i=min(rows-2,int(q)); b=q-i
 v.co.z += height(v.co.y)-(post[i]*(1-b)+post[i+1]*b)
obj.data.update()
obj.name='spine original textured mesh fitted'
metal=bpy.data.materials.new('Entry plate metal'); metal.diffuse_color=(.34,.37,.38,1); metal.metallic=.72; metal.roughness=.3
for helper in [o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.data.polygons)==6]:
 bpy.data.objects.remove(helper,do_unlink=True)
for side in (-1,1):
 bpy.ops.mesh.primitive_cube_add(location=(0,side*3.075,.0125),scale=(3.47,.0875,.0125))
 plate=bpy.context.object; plate.name=f'Spine entry plate {side:+d}'; plate.data.materials.append(metal)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public','models','park','spine.glb'),export_format='GLB',use_selection=True,export_apply=True)
# Audit downward coverage against the analytic two-curve profile.
tree=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get()); missing=0; max_error=0
for fx in (-.35,0,.35):
 for i in range(1,48):
  y=-3.125+6.25*i/48
  if abs(abs(y)-.125)<.16: continue # authored coping intentionally sits above the riding sheet
  p,*_=tree.ray_cast(Vector((fx*7,y,5)),Vector((0,0,-1)))
  if p:max_error=max(max_error,abs(p.z-height(y)))
  else:missing+=1
report={'source':SOURCE,'sourceBounds':list(size),'target':[7,6.25,2.2],'triangles':len(obj.data.polygons),'vertices':len(obj.data.vertices),'auditMissing':missing,'auditMaxError':max_error,'repair':'symmetric metal entry plates'}
with open(os.path.join(OUT,'fit.json'),'w') as f:json.dump(report,f,indent=2)
print('SPINE_FIT',report)
