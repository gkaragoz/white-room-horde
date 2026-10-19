"""Weapon kit: 5 chunky toy weapons as static low-poly GLBs (Valheim style) with `muzzle` and `grip` empties.

Run headless:  blender -b --factory-startup --python tools/blender/make_weapons.py
Conventions: grip at the origin, barrel points -Y, up is +Z (Blender). In the game the weapon attaches to hand.R.
"""
import bpy, math, os, json, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/make_weapons.py")))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
g = globals()
OUT_DIR = g.get("OUT_DIR") or os.environ.get("OUT_DIR") or os.path.join(REPO, "packages", "client", "public", "models", "weapons")
PREVIEW = os.environ.get("PREVIEW", "1") == "1"
PREVIEW_PATH = os.path.join(REPO, "tools", "blender", "out", "weapons_lineup.png")

kit_path = os.path.join(HERE, "make_chibi.py")
K = {"__name__": "kit", "__file__": kit_path, "NO_RUN": True}
exec(compile(open(kit_path, encoding="utf-8").read(), kit_path, "exec"), K)
Builder, make_materials, lin = K["Builder"], K["make_materials"], K["lin"]
HIGH = K["HIGH"]

DARK, DARK2, ACC, ACC2, METAL = "#6F737C", "#555962", "#F9E16C", "#FFB84A", "#9AA0AB"
BUDGET = 500


def stripe(b, x, y, z, sx, sy, sz, col=ACC):
    b.box("root", (x, y, z), (sx, sy, sz), col)


def pistol(b):
    b.box("root", (0, -0.32, 0.13), (0.22, 0.8, 0.24), DARK)                 # slide
    b.box("root", (0, -0.32, 0.27), (0.09, 0.62, 0.05), DARK2)               # top rib
    for k in range(4):                                                         # slide serrations
        b.box("root", (0.115, 0.0 - 0.07 * k, 0.15), (0.02, 0.035, 0.16), DARK2)
        b.box("root", (-0.115, 0.0 - 0.07 * k, 0.15), (0.02, 0.035, 0.16), DARK2)
    b.box("root", (0, 0.04, 0.3), (0.13, 0.06, 0.08), DARK2)                 # rear sight
    b.box("root", (0, -0.7, 0.3), (0.05, 0.06, 0.08), ACC)                   # front sight
    b.box("root", (0, -0.27, -0.02), (0.22, 0.66, 0.11), DARK2)              # frame
    b.cyl("root", (0, -0.78, 0.12), 0.085, 0.14, METAL, rot=(math.pi / 2, 0, 0))   # muzzle
    b.box("root", (0, 0.08, -0.24), (0.2, 0.22, 0.5), ACC, rot=(-0.2, 0, 0))  # grip
    for sx in (-1, 1):
        b.box("root", (sx * 0.105, 0.08, -0.24), (0.025, 0.16, 0.34), ACC2, rot=(-0.2, 0, 0))
    b.torus("root", (0, -0.12, -0.12), 0.075, 0.022, DARK2, rot=(0, math.pi / 2, 0), major=8, minor=4)   # trigger guard
    b.box("root", (0, -0.1, -0.08), (0.05, 0.04, 0.1), METAL)               # trigger
    b.box("root", (0, 0.12, -0.52), (0.2, 0.24, 0.06), ACC2, rot=(-0.2, 0, 0))   # mag base
    return (0, -0.86, 0.12)


def smg(b):
    b.box("root", (0, -0.5, 0.1), (0.26, 1.1, 0.3), DARK)                    # receiver
    b.box("root", (0, -0.45, 0.3), (0.16, 0.8, 0.07), DARK2)                 # top rail
    for k in range(5):
        b.box("root", (0, -0.2 - 0.14 * k, 0.345), (0.14, 0.04, 0.03), METAL)
    b.box("root", (0, 0.1, -0.2), (0.18, 0.2, 0.46), ACC, rot=(-0.18, 0, 0))  # grip
    b.box("root", (0, -0.3, -0.36), (0.15, 0.2, 0.56), ACC2, rot=(0.1, 0, 0))  # magazine
    b.box("root", (0, -0.62, -0.38), (0.17, 0.22, 0.14), ACC2)               # mag base plate
    b.box("root", (0, -0.85, -0.2), (0.16, 0.22, 0.32), DARK2)               # foregrip
    b.cyl("root", (0, -1.3, 0.1), 0.115, 0.5, METAL, rot=(math.pi / 2, 0, 0))   # suppressor
    for k in range(3):
        b.cyl("root", (0, -1.12 - 0.15 * k, 0.1), 0.125, 0.05, DARK2, rot=(math.pi / 2, 0, 0))
    b.box("root", (0, 0.3, 0.06), (0.16, 0.5, 0.2), DARK2)                   # stock
    b.box("root", (0, 0.58, 0.04), (0.2, 0.08, 0.3), ACC)                    # butt pad
    b.box("root", (0, -0.03, 0.34), (0.06, 0.06, 0.1), DARK2)                # rear sight
    b.box("root", (0, -0.98, 0.3), (0.05, 0.06, 0.1), ACC)                   # front sight
    return (0, -1.58, 0.1)


def shotgun(b):
    b.box("root", (0, -0.8, 0.1), (0.22, 1.8, 0.24), DARK)                   # barrel block
    b.box("root", (0, -0.8, -0.1), (0.18, 1.5, 0.16), DARK2)                 # magazine tube
    b.box("root", (0, -0.78, -0.1), (0.32, 0.56, 0.28), ACC)                 # pump
    for k in range(3):
        b.box("root", (0, -0.62 - 0.14 * k, -0.1), (0.34, 0.03, 0.3), ACC2)
    b.box("root", (0, 0.12, -0.04), (0.22, 0.78, 0.34), ACC2, rot=(-0.1, 0, 0))   # stock
    b.box("root", (0, 0.55, -0.1), (0.24, 0.1, 0.4), DARK2, rot=(-0.1, 0, 0))     # butt pad
    b.box("root", (0, -0.04, -0.3), (0.18, 0.18, 0.38), DARK2, rot=(-0.2, 0, 0))  # grip
    b.box("root", (0, -0.1, 0.0), (0.24, 0.5, 0.3), DARK)                    # receiver
    b.cyl("root", (0, -1.72, 0.1), 0.14, 0.12, METAL, rot=(math.pi / 2, 0, 0))
    b.box("root", (0, -1.6, 0.26), (0.05, 0.06, 0.08), ACC)                  # bead sight
    return (0, -1.8, 0.1)


def hmg(b):
    b.box("root", (0, -0.6, 0.12), (0.4, 1.55, 0.42), DARK)                  # receiver
    b.box("root", (0, -0.6, 0.38), (0.32, 1.3, 0.08), DARK2)                 # top cover
    b.cyl("root", (0, -1.6, 0.14), 0.16, 0.95, METAL, rot=(math.pi / 2, 0, 0))   # barrel shroud
    for k in range(4):
        b.cyl("root", (0, -1.3 - 0.24 * k, 0.14), 0.18, 0.05, DARK2, rot=(math.pi / 2, 0, 0))
    b.cyl("root", (0, -2.12, 0.14), 0.2, 0.22, DARK2, rot=(math.pi / 2, 0, 0))   # muzzle brake
    b.cyl("root", (0, -0.3, -0.3), 0.36, 0.42, ACC, rot=(0, math.pi / 2, 0))     # ammo drum
    b.cyl("root", (0.0, -0.3, -0.3), 0.14, 0.5, DARK2, rot=(0, math.pi / 2, 0))  # drum hub
    b.box("root", (0, -0.52, 0.5), (0.36, 0.7, 0.1), DARK2)                  # carry handle top
    for sx in (-1, 1):
        b.box("root", (sx * 0.16, -0.52, 0.42), (0.05, 0.08, 0.16), DARK2)
        b.box("root", (sx * 0.24, -1.35, -0.26), (0.07, 0.07, 0.66), DARK2, rot=(0, sx * 0.32, 0))   # bipod legs
        b.box("root", (sx * 0.34, -1.35, -0.58), (0.14, 0.2, 0.06), ACC2)    # bipod feet
    b.box("root", (0, 0.2, -0.24), (0.2, 0.22, 0.46), ACC2, rot=(-0.15, 0, 0))     # grip
    b.box("root", (0, 0.35, 0.1), (0.34, 0.5, 0.38), DARK2)                  # stock block
    b.box("root", (0, 0.62, 0.1), (0.38, 0.08, 0.42), ACC)                   # butt plate
    b.box("root", (0, -0.9, 0.42), (0.05, 0.06, 0.1), ACC)                   # front sight
    return (0, -2.26, 0.14)


def grenade(b):
    b.sphere("root", (0, 0, 0), 0.26, (1, 1, 1.15), "#6FA05A", seg=9, rings=6)
    for z in (-0.12, 0.04, 0.18):
        b.box("root", (0, 0, z), (0.56, 0.03, 0.05), "#547A44")
        b.box("root", (0, 0, z), (0.03, 0.56, 0.05), "#547A44")
    b.cyl("root", (0, 0, 0.34), 0.1, 0.16, METAL)                           # fuse neck
    b.cyl("root", (0, 0, 0.44), 0.07, 0.08, DARK2)
    b.box("root", (0.12, 0.02, 0.2), (0.05, 0.12, 0.34), ACC, rot=(0, 0.12, 0))   # lever
    b.torus("root", (-0.13, 0, 0.4), 0.09, 0.024, ACC2, rot=(math.pi / 2, 0, 0), major=8, minor=4)   # pin ring
    return None


WEAPONS = [("pistol", pistol), ("smg", smg), ("shotgun", shotgun), ("hmg", hmg), ("grenade", grenade)]


def build(wid, fn, mats):
    fixed, tint = mats
    b = Builder("wpn_" + wid, 1.0, fixed, tint, HIGH)
    muzzle = fn(b)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in b.objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = b.objs[0]
    with bpy.context.temp_override(active_object=b.objs[0], selected_editable_objects=b.objs, selected_objects=b.objs):
        bpy.ops.object.join()
    mesh = bpy.context.view_layer.objects.active
    mesh.vertex_groups.clear()
    mesh.name = "weapon_" + wid
    mesh.data.name = "weapon_" + wid
    empties = []
    for nm, loc in (("grip", (0, 0, 0)), ("muzzle", muzzle)):
        if loc is None:
            continue
        e = bpy.data.objects.new(nm + "_" + wid if False else nm, None)
        e.empty_display_type = "PLAIN_AXES"
        e.empty_display_size = 0.15
        e.location = loc
        bpy.context.scene.collection.objects.link(e)
        e.parent = mesh
        empties.append(e)
    return mesh, empties


def tris(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


def export(wid, mesh, empties, out_dir):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    mesh.select_set(True)
    for e in empties:
        e.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    path = os.path.join(out_dir, "weapon_" + wid + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=False, export_yup=True)
    meta = {"id": wid, "tris": tris(mesh.data), "muzzle": [round(c, 3) for c in empties[-1].location] if len(empties) > 1 else None,
            "grip": [0, 0, 0], "forward": "-Y (Blender) / -Z (glTF)", "materials": [m.name for m in mesh.data.materials]}
    with open(os.path.join(out_dir, "weapon_" + wid + ".meta.json"), "w") as f:
        json.dump(meta, f, indent=1)
    return meta


def lineup(items):
    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            pass
    sc.render.resolution_x, sc.render.resolution_y = 1920, 760
    try:
        sc.eevee.taa_render_samples = 48
    except Exception:
        pass
    sc.view_settings.view_transform = "AgX"
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*lin("#E8D9C2"), 1)
    bg.inputs["Strength"].default_value = 0.55
    sc.world = w
    fm = make_materials("#E4E6ED")[1]
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -0.5))
    fl = bpy.context.active_object
    fl.scale = (30, 30, 0.1)
    fl.data.materials.append(fm)
    xs = [-5.4, -2.2, 1.2, 4.8, 7.2]
    for (wid, mesh, emp), x in zip(items, xs):
        mesh.location = (x, 0, 0)
        mesh.rotation_euler = (0, 0, math.radians(-80))
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 10))
    sun = bpy.context.active_object
    sun.data.energy = 3.6
    sun.data.angle = math.radians(3)
    sun.data.color = lin("#FFD7A0")
    sun.rotation_euler = tuple(math.radians(a) for a in (38, 0, 55))
    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 15
    cam.rotation_euler = (math.radians(55), 0, math.radians(0))
    cam.location = Vector((0.6, -0.4, 0.2)) + cam.rotation_euler.to_matrix() @ Vector((0, 0, 30))
    sc.camera = cam
    os.makedirs(os.path.dirname(PREVIEW_PATH), exist_ok=True)
    sc.render.filepath = PREVIEW_PATH
    sc.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)


def run():
    os.makedirs(OUT_DIR, exist_ok=True)
    if bpy.app.background:
        for o in list(bpy.data.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    mats = make_materials()
    items, res, errs = [], {}, []
    for wid, fn in WEAPONS:
        mesh, emp = build(wid, fn, mats)
        t = tris(mesh.data)
        if t > BUDGET:
            errs.append("%s: %d tris > %d" % (wid, t, BUDGET))
            continue
        res[wid] = export(wid, mesh, emp, OUT_DIR)["tris"]
        items.append((wid, mesh, emp))
    if errs:
        raise ValueError("; ".join(errs))
    if PREVIEW and bpy.app.background:
        lineup(items)
    return res


RESULT = run()
print(RESULT)
