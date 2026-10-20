"""Render the weapon icons of the HUD inventory list: one transparent PNG per weapon GLB, in profile with the barrel to the right.

  blender -b --factory-startup --python tools/blender/make_weapon_icons.py
  ONLY=pistol,ar blender -b --factory-startup --python tools/blender/make_weapon_icons.py
  OUT_DIR=some/dir ...                                       default packages/client/public/ui

Same flat toy look as the upgrade cards (tools/blender/make_cards.py): two soft sun lights, a warm world, a dark outline.
The guns point along -Y in Blender with the grip at the origin; the camera sits on the -X side, a little in front of the
muzzle and above, so the barrel runs to the right. The script fails when an image comes out empty.
"""
import bpy, os, math, sys
from mathutils import Vector, Euler

HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/make_weapon_icons.py")))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
MODELS = os.path.join(REPO, "packages", "client", "public", "models", "weapons")
OUT_DIR = os.environ.get("OUT_DIR") or os.path.join(REPO, "packages", "client", "public", "ui")
ONLY = [x for x in os.environ.get("ONLY", "").split(",") if x] or None
W, H = 192, 96
IDS = ["pistol", "smg", "ar", "shotgun", "hmg", "minigun", "sniper", "revolver", "mp", "dbl", "dmr", "flamer", "gl", "sword", "hammer", "railgun", "crossbow", "plasma", "rocket", "nailgun", "autoshotgun", "akimbo", "frostgun", "sawlauncher", "arcthrower"]


def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c] + [1.0]


def setup_scene():
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE"
    except TypeError:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x, sc.render.resolution_y = W, H
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.eevee.taa_render_samples = 48
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"
    sc.render.line_thickness = 1.0
    vl = bpy.context.view_layer
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new("outline")
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    ls.linestyle.color = (0.17, 0.12, 0.07)
    ls.linestyle.thickness = 1.3
    w = bpy.data.worlds.new("w") if not bpy.data.worlds else bpy.data.worlds[0]
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = lin("#fff1dc")
    bg.inputs["Strength"].default_value = 0.8


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def render(weapon):
    sc = bpy.context.scene
    coll = sc.collection
    clear()
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, "weapon_%s.glb" % weapon))
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in [o for o in bpy.data.objects if o.type not in ("MESH",)]:
        if o.type in ("EMPTY", "ARMATURE") and not o.children:
            bpy.data.objects.remove(o, do_unlink=True)
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.0
    sun.data.color = (1.0, 0.92, 0.8)
    sun.data.angle = math.radians(25)
    sun.rotation_euler = Euler((math.radians(55), math.radians(8), math.radians(-40)), "XYZ")
    coll.objects.link(sun)
    fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "SUN"))
    fill.data.energy = 1.0
    fill.data.color = (0.75, 0.85, 1.0)
    fill.rotation_euler = Euler((math.radians(60), 0, math.radians(140)), "XYZ")
    coll.objects.link(fill)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type = "ORTHO"
    coll.objects.link(cam)
    sc.camera = cam
    el, az = math.radians(20), math.radians(28)
    view = Vector((-math.cos(el) * math.cos(az), -math.cos(el) * math.sin(az), math.sin(el)))
    cam.rotation_euler = (-view).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    corners = []
    for o in meshes:
        eo = o.evaluated_get(dg)
        for c in eo.bound_box:
            corners.append(o.matrix_world @ Vector(c))
    ctr = sum(corners, Vector()) / len(corners)
    right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
    up = cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
    xs = [(c - ctr).dot(right) for c in corners]
    ys = [(c - ctr).dot(up) for c in corners]
    cx = (max(xs) + min(xs)) / 2
    cy = (max(ys) + min(ys)) / 2
    cam.location = ctr + right * cx + up * cy + view * 12
    cam.data.ortho_scale = max(max(xs) - min(xs), (max(ys) - min(ys)) * (W / H)) * 1.1
    cam.data.clip_end = 60
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, "wpn_%s.png" % weapon)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def coverage(path):
    img = bpy.data.images.load(path)
    px = list(img.pixels)
    n = len(px) // 4
    solid = sum(1 for i in range(n) if px[i * 4 + 3] > 0.5)
    bpy.data.images.remove(img)
    return solid / n


def run():
    setup_scene()
    bad = []
    for wid in IDS:
        if ONLY and wid not in ONLY:
            continue
        path = render(wid)
        cov = coverage(path)
        print("icon", wid, "coverage %.2f" % cov)
        if cov < 0.08:
            bad.append(wid)
    if bad:
        raise ValueError("empty icons: " + ", ".join(bad))


run()
