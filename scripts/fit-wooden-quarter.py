import bpy
import math
import os
import bisect
from collections import Counter
from mathutils import Matrix, Vector

SOURCE = r"C:\Users\NickO\Downloads\wooden skate ramp 3d model.glb"
OUT = r"C:\Users\NickO\Documents\ChatGPT\Scooter Rider\work\claude-release-lan\artifacts\ramp-import"
os.makedirs(OUT, exist_ok=True)


def bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return lo, hi, hi - lo


def frame_camera(camera, objects, direction):
    lo, hi, size = bounds(objects)
    center = (lo + hi) * 0.5
    distance = max(size) * 1.8
    camera.location = center + Vector(direction).normalized() * distance
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.lens = 52


def render(name, objects, direction):
    frame_camera(camera, objects, direction)
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=SOURCE)
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
raw_lo, raw_hi, raw_size = bounds(meshes)
z_levels = Counter(round((obj.matrix_world @ vertex.co).z, 4) for obj in meshes for vertex in obj.data.vertices)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 960
scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.world.color = (0.035, 0.035, 0.045)

bpy.ops.object.camera_add()
camera = bpy.context.object
scene.camera = camera
bpy.ops.object.light_add(type='AREA', location=(4, -4, 6))
bpy.context.object.data.energy = 1100
bpy.context.object.data.shape = 'DISK'
bpy.context.object.data.size = 5
bpy.ops.object.light_add(type='AREA', location=(-4, 3, 2))
bpy.context.object.data.energy = 700
bpy.context.object.data.size = 4

render('ramp-raw-perspective.png', meshes, (1.3, -1.5, 0.9))
render('ramp-raw-side.png', meshes, (1, 0, 0.12))

# Blender import uses Y for width, X for run, and Z for height. Rotate in the
# ground plane to X-width/Y-run; glTF export converts Blender Z-up to game Y-up.
# Fit width/run now; height is reported for a deck-height-aware second pass.
# quarter envelope without altering topology, materials, or authored details.
axis_map = Matrix(((0, 1, 0, 0), (-1, 0, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))
for obj in meshes:
    obj.data.transform(axis_map @ obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
bpy.context.view_layer.update()
rot_lo, rot_hi, rot_size = bounds(meshes)
deck_candidates = [(count, level) for level, count in z_levels.items() if raw_lo.z + raw_size.z * 0.55 < level < raw_lo.z + raw_size.z * 0.85]
deck_level = max(deck_candidates)[1]
target = Vector((26.0, 8.0, 3.6 * raw_size.z / (deck_level - raw_lo.z)))
scale = Vector((target.x / rot_size.x, target.y / rot_size.y, target.z / rot_size.z))
for obj in meshes:
    obj.scale.x *= scale.x
    obj.scale.y *= scale.y
    obj.scale.z *= scale.z
bpy.context.view_layer.update()
fit_lo, fit_hi, fit_size = bounds(meshes)
offset = Vector((-((fit_lo.x + fit_hi.x) * 0.5), -((fit_lo.y + fit_hi.y) * 0.5), -fit_lo.z))
for obj in meshes:
    obj.location += offset
bpy.context.view_layer.update()

# Preserve the authored curve and deck details while moving their longitudinal
# split onto the game's 4.25 m transition / 3.75 m deck contract.
for obj in meshes:
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
pre_samples = {}
for obj in meshes:
    for vertex in obj.data.vertices:
        p = vertex.co
        if abs(p.x) <= 0.35 and p.z <= 3.72:
            key = round(p.y / 0.04) * 0.04
            pre_samples[key] = max(pre_samples.get(key, -1e9), p.z)
source_lip = min(y for y, height in pre_samples.items() if height >= 3.5)
target_lip = 0.25
for obj in meshes:
    for vertex in obj.data.vertices:
        y = vertex.co.y
        if y <= source_lip:
            vertex.co.y = -4.0 + (y + 4.0) * (target_lip + 4.0) / (source_lip + 4.0)
        else:
            vertex.co.y = target_lip + (y - source_lip) * (4.0 - target_lip) / (4.0 - source_lip)
bpy.context.view_layer.update()

# Conform the authored riding curve to the analytic collider while translating
# the framing with it. UVs, topology, coping, fasteners, and rails are untouched.
surface = {}
for obj in meshes:
    for vertex in obj.data.vertices:
        p = vertex.co
        if abs(p.x) <= 0.35 and p.z <= 3.72 and p.y <= target_lip:
            key = round(p.y / 0.04) * 0.04
            surface[key] = max(surface.get(key, -1e9), p.z)
surface_keys = sorted(surface)
surface_values = [sum(surface[surface_keys[j]] for j in range(max(0, i - 2), min(len(surface_keys), i + 3))) / (min(len(surface_keys), i + 3) - max(0, i - 2)) for i in range(len(surface_keys))]
def authored_height(y):
    i = bisect.bisect_left(surface_keys, y)
    if i <= 0: return surface_values[0]
    if i >= len(surface_keys): return surface_values[-1]
    a, b = surface_keys[i - 1], surface_keys[i]
    t = (y - a) / (b - a)
    return surface_values[i - 1] * (1 - t) + surface_values[i] * t
radius = (4.25 * 4.25 + 3.6 * 3.6) / (2 * 3.6)
def analytic_height(y):
    d = min(4.25, max(0.0, y + 4.0))
    return radius - math.sqrt(max(0.0, radius * radius - d * d))
for obj in meshes:
    for vertex in obj.data.vertices:
        if vertex.co.y <= target_lip and vertex.co.z <= 3.72:
            vertex.co.z += analytic_height(vertex.co.y) - authored_height(vertex.co.y)
# Keep the authored rail hierarchy but restore its intended 4.76 m total height.
post_curve_top = max(vertex.co.z for obj in meshes for vertex in obj.data.vertices)
for obj in meshes:
    for vertex in obj.data.vertices:
        if vertex.co.z > 3.6:
            vertex.co.z = 3.6 + (vertex.co.z - 3.6) * (4.7608 - 3.6) / (post_curve_top - 3.6)
bpy.context.view_layer.update()

# Close the source mesh's open underside at both outer boundaries. These caps
# follow the established riding profile and use a quiet structural finish.
cap_material = bpy.data.materials.new('Quarter structural side')
cap_material.diffuse_color = (0.055, 0.065, 0.065, 1)
cap_material.roughness = 0.88
for side in (-1, 1):
    verts, faces = [], []
    segments = 72
    for i in range(segments + 1):
        y = -4.0 + 8.0 * i / segments
        top = analytic_height(y) if y <= target_lip else 3.6
        verts.extend([(side * 13.03, y, 0.0), (side * 13.03, y, top)])
        if i:
            a = (i - 1) * 2
            tris = [(a, a + 1, a + 2), (a + 1, a + 3, a + 2)]
            faces.extend(tris if side < 0 else [tuple(reversed(tri)) for tri in tris])
    cap_mesh = bpy.data.meshes.new(f'Quarter side cap {side}')
    # Blender scene is X width, Y run, Z height.
    cap_mesh.from_pydata(verts, [], faces)
    cap_mesh.materials.append(cap_material)
    cap = bpy.data.objects.new(f'Quarter side cap {side}', cap_mesh)
    bpy.context.collection.objects.link(cap)
    meshes.append(cap)

render('ramp-fitted-perspective.png', meshes, (1.3, -1.5, 0.9))
render('ramp-fitted-side.png', meshes, (1, 0, 0.12))

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'wooden-ramp-fitted.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'wooden-ramp-fitted.glb'), export_format='GLB')

fit_lo, fit_hi, fit_size = bounds(meshes)
samples = {}
for obj in meshes:
    for vertex in obj.data.vertices:
        p = obj.matrix_world @ vertex.co
        if abs(p.x) > 0.35 or p.z > 3.72:
            continue
        key = round(p.y / 0.08) * 0.08
        samples[key] = max(samples.get(key, -1e9), p.z)
errors = []
fit_rows = []
for y, actual in sorted(samples.items()):
    d = min(4.25, max(0.0, y + 4.0))
    expected = radius - math.sqrt(max(0.0, radius * radius - d * d))
    error = actual - expected
    # Sparse center seams occasionally expose underside vertices rather than
    # the skin; exclude those absent-surface bins from the fit statistic.
    if -4.05 <= y <= 4.05 and actual >= expected - 0.25:
        errors.append(error)
        fit_rows.append((y, actual, expected, error))
fit_rms = math.sqrt(sum(error * error for error in errors) / len(errors)) if errors else float('nan')
fit_max = max((abs(error) for error in errors), default=float('nan'))
with open(os.path.join(OUT, 'inspection.txt'), 'w', encoding='utf-8') as report:
    report.write(f'raw bounds: {raw_size.x:.6f} x {raw_size.y:.6f} x {raw_size.z:.6f} m\n')
    report.write('axis mapping: Blender Y -> game X width; Blender Z -> game Y height; Blender X -> game Z run\n')
    report.write(f'detected deck/coping level: {deck_level:.6f} m; source bottom: {raw_lo.z:.6f} m\n')
    report.write('common source height levels: ' + repr(z_levels.most_common(12)) + '\n')
    report.write(f'fitted bounds: {fit_size.x:.6f} x {fit_size.y:.6f} x {fit_size.z:.6f} m\n')
    report.write(f'fit scale after rotation: {scale.x:.6f}, {scale.y:.6f}, {scale.z:.6f}\n')
    report.write(f'longitudinal profile remap: source lip y={source_lip:.4f} -> game lip y={target_lip:.4f}\n')
    report.write(f'center riding surface vs analytic: samples={len(errors)} rms={fit_rms:.6f} m max_abs={fit_max:.6f} m\n')
    report.write('profile samples y,actual,expected,error:\n')
    for row in fit_rows[::max(1, len(fit_rows) // 20)]:
        report.write('  ' + ', '.join(f'{value:.4f}' for value in row) + '\n')
    report.write(f'meshes: {len(meshes)}\n')
    for obj in meshes:
        report.write(f'{obj.name}: vertices={len(obj.data.vertices)} polygons={len(obj.data.polygons)} materials={len(obj.data.materials)}\n')
