"""Ice shard cluster for frozen enemies (instanced around the body by the client).

  blender -b --factory-startup --python tools/blender/make_ice.py
  env: OUT_DIR (default packages/client/public/models/props), PREVIEW=1 renders tools/blender/out/ice_shard.png

Six crystals of different height lean out of one base, each a jittered hexagonal prism that narrows to a point: not a perfect
crystal but the broken, uneven kind that grows out of a frozen thing. One mesh, one material, about 250 triangles.
"""
import bmesh
import bpy
import math
import os
import random
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/make_ice.py"))), "..", ".."))
OUT_DIR = os.environ.get("OUT_DIR", os.path.join(ROOT, "packages", "client", "public", "models", "props"))
PREVIEW = os.environ.get("PREVIEW", "1") == "1"
PREVIEW_PATH = os.path.join(ROOT, "tools", "blender", "out", "ice_shard.png")
rnd = random.Random(2610)


def crystal(bm, base, height, radius, lean_axis, lean):
    sides = 6
    verts_lo, verts_mid = [], []
    for k in range(sides):
        a = 2 * math.pi * k / sides + rnd.uniform(-0.18, 0.18)
        r = radius * rnd.uniform(0.85, 1.15)
        verts_lo.append(Vector((math.cos(a) * r, math.sin(a) * r, rnd.uniform(0, 0.06) * height)))
        r2 = radius * rnd.uniform(0.62, 0.8)
        verts_mid.append(Vector((math.cos(a + 0.1) * r2, math.sin(a + 0.1) * r2, height * rnd.uniform(0.62, 0.74))))
    apex = Vector((rnd.uniform(-0.05, 0.05) * radius, rnd.uniform(-0.05, 0.05) * radius, height))
    rot = Matrix.Rotation(lean, 4, lean_axis)
    pts = [rot @ v + base for v in verts_lo + verts_mid + [apex]]
    bv = [bm.verts.new(p) for p in pts]
    lo, mid, top = bv[:sides], bv[sides:2 * sides], bv[-1]
    for k in range(sides):
        j = (k + 1) % sides
        bm.faces.new((lo[k], lo[j], mid[j], mid[k]))
        bm.faces.new((mid[k], mid[j], top))
    bm.faces.new(list(reversed(lo)))


def build():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bm = bmesh.new()
    spec = [(0.0, 0.0, 1.0, 0.16, 0.0), (0.18, 0.06, 0.7, 0.12, 0.35), (-0.17, 0.1, 0.78, 0.13, -0.4), (0.06, -0.2, 0.55, 0.1, 0.5), (-0.1, -0.12, 0.42, 0.09, -0.55), (0.24, -0.1, 0.36, 0.08, 0.7)]
    for i, (x, y, h, r, lean) in enumerate(spec):
        axis = "Y" if i % 2 == 0 else "X"
        crystal(bm, Vector((x, y, 0)), h, r, axis, lean)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("ice_shard")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    ob = bpy.data.objects.new("ice_shard", me)
    bpy.context.scene.collection.objects.link(ob)
    mat = bpy.data.materials.new("ice")
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.55, 0.82, 1.0, 1)
    b.inputs["Roughness"].default_value = 0.12
    me.materials.append(mat)
    # Z up (Blender) becomes Y up in the glTF: the shard grows along +y in the game
    return ob


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def export(ob):
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT_DIR, "ice_shard.glb"), export_format="GLB", use_selection=True, export_yup=True)


def preview(ob):
    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            pass
    sc.render.resolution_x, sc.render.resolution_y = 800, 800
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.9, 0.88, 0.84, 1)
    sc.world = w
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, -0.02))
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 6))
    bpy.context.active_object.data.energy = 3.5
    bpy.context.active_object.rotation_euler = (math.radians(40), 0, math.radians(30))
    bpy.ops.object.camera_add(location=(2.2, -2.6, 1.5))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(70), 0, math.radians(40))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 2.4
    cam.location = (3, -3, 1.6)
    d = Vector((0, 0, 0.45)) - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    os.makedirs(os.path.dirname(PREVIEW_PATH), exist_ok=True)
    sc.render.filepath = PREVIEW_PATH
    bpy.ops.render.render(write_still=True)


ob = build()
print("tris", tri_count(ob))
export(ob)
if PREVIEW:
    preview(ob)
