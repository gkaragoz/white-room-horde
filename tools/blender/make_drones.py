"""Drone kit: seven hovering (propeller-free, sci-fi) companions as low-poly GLBs in the game's toy look (docs/DRONES.md).

Run headless:  blender -b --factory-startup --python tools/blender/make_drones.py
               ONLY=healer,cryo ...   OUT_DIR=some/dir ...   PREVIEW=0 (skip the lineup render)

Conventions: the drone's centre is the origin, its nose points -Y (-Z in glTF), up is +Z (+Y in glTF). Every drone has
a separate `halo` node (a ring round the waist, origin in the middle, spun by the game), a `muzzle` empty (a second one, `muzzle_l`, for the
twin and the rocket pods), and the healer a `beam`, the tesla a `zap`, the cryo an `aura` and the collector a `pull` empty
at the point its effect starts. Parts that take the owner's colour use the tint material.
"""
import bpy, math, os, json, sys
from math import pi, atan2
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/make_drones.py")))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.environ.get("OUT_DIR") or os.path.join(REPO, "packages", "client", "public", "models", "drones")
PREVIEW = os.environ.get("PREVIEW", "1") == "1"
PREVIEW_PATH = os.path.join(REPO, "tools", "blender", "out", "drones_lineup.png")
ONLY = [x for x in os.environ.get("ONLY", "").split(",") if x] or None
BUDGET = 2400

kit_path = os.path.join(HERE, "make_chibi.py")
K = {"__name__": "kit", "__file__": kit_path, "NO_RUN": True}
exec(compile(open(kit_path, encoding="utf-8").read(), kit_path, "exec"), K)
Builder, make_materials, lin = K["Builder"], K["make_materials"], K["lin"]
HIGH = K["HIGH"]
exec(compile(open(os.path.join(HERE, "meshclean.py"), encoding="utf-8").read(), "meshclean", "exec"), globals())

WHITE, SHELL, DARK, DARK2, METAL, GLASS = "#EEF1F5", "#D7DDE6", "#454B58", "#2F343F", "#9AA0AB", "#7FE3FF"
GREEN, ICE, ORANGE, RED, YELLOW, PURPLE, BRASS = "#58D68D", "#8FD3FF", "#FF9A3C", "#E5484D", "#FFD23A", "#9A63FF", "#D9A441"


def halo(b, radius=0.5):
    """The anti-gravity halo: a ring round the waist that is its own object (origin in the middle) so the game can spin it."""
    ring = b.torus("root", (0, 0, 0), radius, 0.032, GLASS, major=22, minor=5)
    b.objs.remove(ring)
    bpy.ops.object.select_all(action="DESELECT")
    ring.select_set(True)
    bpy.context.view_layer.objects.active = ring
    ring.vertex_groups.clear()
    ring.name = "halo"
    ring.data.name = "halo"
    ring.location = (0, 0.0, 0.02)
    return ring


def chassis(b, accent=GREEN, core=0.34):
    """The shared sci-fi pod, no propellers: a two-tone hull with a visor, swept wings in the owner's colour, twin thruster
    nozzles at the back, an anti-gravity emitter disc with three nubs underneath, light strips, antennae and a spinning halo."""
    b.sphere("root", (0, 0, 0.03), core, (1.0, 1.2, 0.62), WHITE)                        # upper hull
    b.sphere("root", (0, 0.02, -0.1), core * 0.96, (0.94, 1.12, 0.5), DARK)              # lower hull
    b.sphere("root", (0, 0.08, 0.17), core * 0.5, (1.0, 1.15, 0.55), SHELL)              # dome
    b.box("root", (0, -core * 1.18, 0.05), (core * 1.0, 0.08, 0.1), GLASS)             # visor
    b.box("root", (0, -core * 1.14, -0.04), (core * 0.7, 0.05, 0.035), accent)         # light bar under the visor
    for sx in (-1, 1):
        # swept wings: a tinted plate and a darker blade behind it
        b.box("root", (sx * 0.52, 0.06, 0.0), (0.5, 0.34, 0.045), SHELL, tint=True, rot=(0, 0, sx * -0.42))
        b.box("root", (sx * 0.62, 0.2, 0.0), (0.38, 0.14, 0.04), DARK, rot=(0, 0, sx * -0.42))
        b.box("root", (sx * 0.58, 0.02, 0.03), (0.3, 0.025, 0.02), accent, rot=(0, 0, sx * -0.42))   # wing light
        # rear thruster nozzles
        b.cyl("root", (sx * 0.17, core * 1.26, -0.02), 0.1, 0.22, DARK2, rot=(pi / 2, 0, 0), r2=0.13)
        b.cyl("root", (sx * 0.17, core * 1.38, -0.02), 0.075, 0.05, accent, rot=(pi / 2, 0, 0))
        b.box("root", (sx * core * 0.98, 0.0, -0.06), (0.05, core * 0.8, 0.025), accent)  # side light strips
    # the anti-gravity emitter disc under the belly
    b.cyl("root", (0, 0.02, -0.25), 0.25, 0.07, DARK2)
    b.cyl("root", (0, 0.02, -0.295), 0.19, 0.03, accent)
    for a in (90, 210, 330):
        r = math.radians(a)
        b.cyl("root", (math.cos(r) * 0.16, 0.02 + math.sin(r) * 0.16, -0.32), 0.04, 0.05, METAL)
    b.sphere("root", (0, -0.05, -0.2), 0.075, (1, 1, 0.8), GLASS, seg=8, rings=5)       # camera lens
    b.cyl("root", (0.0, 0.34, 0.2), 0.012, 0.3, METAL, rot=(0.55, 0, 0))                 # antenna
    b.sphere("root", (0.0, 0.43, 0.34), 0.03, (1, 1, 1), accent, seg=5, rings=3)
    return [halo(b, 0.52)]


def healer(b):
    r = chassis(b, GREEN)
    b.box("root", (0, 0.1, 0.27), (0.22, 0.07, 0.07), GREEN)                         # top cross, bar one
    b.box("root", (0, 0.1, 0.27), (0.07, 0.22, 0.07), GREEN)                         # bar two
    b.cyl("root", (0, -0.42, -0.02), 0.11, 0.22, DARK, rot=(pi / 2, 0, 0), r2=0.16)   # emitter housing
    b.torus("root", (0, -0.55, -0.02), 0.16, 0.025, GREEN, rot=(pi / 2, 0, 0), major=10, minor=4)
    b.sphere("root", (0, -0.5, -0.02), 0.095, (1, 1, 1), "#B8FFD8", seg=8, rings=5)  # the glowing lens
    for sx in (-1, 1):
        b.box("root", (sx * 0.28, 0.0, 0.0), (0.06, 0.34, 0.16), WHITE)              # side cells
        b.box("root", (sx * 0.3, 0.0, 0.0), (0.03, 0.2, 0.07), GREEN)
    return r, {"muzzle": (0, -0.62, -0.02), "beam": (0, -0.55, -0.02)}


def cryo(b):
    r = chassis(b, ICE)
    for k in range(6):
        a = k * pi / 3
        b.box("root", (math.cos(a) * 0.3, math.sin(a) * 0.3 + 0.02, -0.04), (0.28, 0.06, 0.06), ICE, rot=(0, 0, a))  # six frost spikes round the waist
    b.cyl("root", (0, 0.02, -0.28), 0.0, 0.3, ICE, rot=(pi, 0, 0), r2=0.13)         # crystal under the belly
    b.sphere("root", (0, 0.02, 0.28), 0.1, (1, 1, 1.3), "#D9F3FF", seg=6, rings=4)     # crystal on top
    b.torus("root", (0, 0.02, 0.02), 0.44, 0.03, ICE, major=14, minor=4)              # the field ring
    return r, {"aura": (0, 0.02, 0.0)}


def rocket(b):
    r = chassis(b, ORANGE, core=0.34)
    for sx in (-1, 1):
        b.box("root", (sx * 0.4, -0.05, -0.02), (0.22, 0.62, 0.3), DARK)             # pod
        for yy, zz in ((-0.1, 0.07), (-0.1, -0.09), (0.12, 0.07), (0.12, -0.09)):
            b.cyl("root", (sx * 0.4, yy - 0.18, zz), 0.055, 0.4, METAL, rot=(pi / 2, 0, 0))   # tubes
            b.cyl("root", (sx * 0.4, yy - 0.4, zz), 0.045, 0.1, ORANGE, rot=(pi / 2, 0, 0), r2=0.02)  # warhead tips
        b.box("root", (sx * 0.4, -0.05, 0.16), (0.2, 0.5, 0.04), ORANGE, tint=True)
    b.box("root", (0, -0.1, 0.22), (0.2, 0.3, 0.1), DARK2)                           # targeting block
    return r, {"muzzle": (0.4, -0.62, 0.0), "muzzle_l": (-0.4, -0.62, 0.0)}


def gun(b):
    r = chassis(b, YELLOW)
    b.box("root", (0, -0.34, -0.1), (0.2, 0.46, 0.2), DARK)                          # receiver
    b.cyl("root", (0, -0.78, -0.1), 0.05, 0.75, METAL, rot=(pi / 2, 0, 0))             # long barrel
    b.cyl("root", (0, -0.62, -0.1), 0.085, 0.3, DARK2, rot=(pi / 2, 0, 0))             # shroud
    b.cyl("root", (0, -1.16, -0.1), 0.075, 0.1, YELLOW, rot=(pi / 2, 0, 0))            # muzzle brake
    b.box("root", (0, -0.1, 0.24), (0.2, 0.28, 0.16), DARK2)                         # ammo box
    b.box("root", (0, -0.1, 0.34), (0.1, 0.2, 0.04), YELLOW)
    return r, {"muzzle": (0, -1.22, -0.1)}


def twin(b):
    r = chassis(b, YELLOW, core=0.34)
    b.box("root", (0, -0.3, -0.1), (0.5, 0.4, 0.2), DARK)                            # twin receiver
    for sx in (-1, 1):
        b.cyl("root", (sx * 0.15, -0.66, -0.1), 0.045, 0.62, METAL, rot=(pi / 2, 0, 0))
        b.cyl("root", (sx * 0.15, -0.5, -0.1), 0.075, 0.26, DARK2, rot=(pi / 2, 0, 0))
        b.cyl("root", (sx * 0.15, -0.99, -0.1), 0.07, 0.08, YELLOW, rot=(pi / 2, 0, 0))
        b.cyl("root", (sx * 0.27, 0.05, 0.12), 0.12, 0.2, DARK2, rot=(0, pi / 2, 0))   # ammo drum
        b.cyl("root", (sx * 0.27, 0.05, 0.12), 0.07, 0.24, YELLOW, rot=(0, pi / 2, 0))
    return r, {"muzzle": (0.15, -1.04, -0.1), "muzzle_l": (-0.15, -1.04, -0.1)}


def tesla(b):
    r = chassis(b, PURPLE)
    b.cyl("root", (0, 0.04, 0.3), 0.07, 0.3, METAL)                                   # mast
    for k in range(4):
        b.torus("root", (0, 0.04, 0.2 + k * 0.1), 0.16 - k * 0.025, 0.028, PURPLE if k % 2 else BRASS, major=10, minor=4)
    b.sphere("root", (0, 0.04, 0.58), 0.12, (1, 1, 1), "#E6D6FF", seg=8, rings=5)      # the discharge ball
    for sx in (-1, 1):
        b.box("root", (sx * 0.14, -0.4, -0.04), (0.04, 0.46, 0.04), METAL)           # prongs
        b.sphere("root", (sx * 0.14, -0.66, -0.04), 0.05, (1, 1, 1), "#E6D6FF", seg=6, rings=4)
    return r, {"muzzle": (0, -0.66, -0.04), "zap": (0, 0.04, 0.6)}


def collector(b):
    r = chassis(b, BRASS, core=0.35)
    b.cyl("root", (0, -0.36, -0.06), 0.1, 0.34, DARK, rot=(pi / 2, 0, 0), r2=0.26)   # the intake funnel
    b.torus("root", (0, -0.52, -0.06), 0.27, 0.035, BRASS, rot=(pi / 2, 0, 0), major=12, minor=4)
    b.box("root", (0, 0.2, 0.2), (0.34, 0.3, 0.2), DARK2)                            # cargo bay
    b.box("root", (0, 0.2, 0.27), (0.26, 0.22, 0.05), BRASS, tint=True)
    for sx in (-1, 1):
        b.box("root", (sx * 0.2, -0.3, -0.26), (0.07, 0.18, 0.08), RED)              # magnet arms
        b.box("root", (sx * 0.2, -0.38, -0.26), (0.07, 0.06, 0.08), WHITE)
    b.box("root", (0, -0.3, -0.26), (0.33, 0.08, 0.06), DARK)
    return r, {"pull": (0, -0.55, -0.06)}


DRONES = [("healer", healer), ("cryo", cryo), ("rocket", rocket), ("gun", gun), ("twin", twin), ("tesla", tesla), ("collector", collector)]


def cull_hidden(mesh):
    """Delete faces that z-fight or cannot be seen: faces buried inside another part, and coplanar faces that lie on top
    of a larger one. The parts are separate boxes and cylinders glued together, so without this the overlapping
    polygons flicker."""
    import bmesh
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm, epsilon=1e-5)
    dirs = [Vector(d).normalized() for d in ((1, 0.31, 0.17), (-0.27, 1, 0.23), (0.19, -0.33, 1))]

    def inside(p):
        votes = 0
        for d in dirs:
            n, o = 0, p.copy()
            for _ in range(64):
                hit = tree.ray_cast(o, d)
                if hit[0] is None:
                    break
                n += 1
                o = hit[0] + d * 1e-4
            votes += n % 2
        return votes >= 2

    kill = set()
    for f in bm.faces:
        c = f.calc_center_median()
        # buried only when the centre and every corner region are inside another part (a tall wall with one hoop
        # around its middle is not buried)
        pts = [c] + [v.co * 0.85 + c * 0.15 for v in f.verts]
        if all(inside(p + f.normal * 0.006) for p in pts):
            kill.add(f.index)
    # coplanar duplicates: same plane and same facing, the smaller face goes
    faces = [f for f in bm.faces if f.index not in kill]
    for i, a in enumerate(faces):
        if a.index in kill:
            continue
        ca, na = a.calc_center_median(), a.normal
        for b in faces[i + 1:]:
            if b.index in kill or na.dot(b.normal) < 0.999:
                continue
            if abs((b.calc_center_median() - ca).dot(na)) > 2e-3:
                continue
            small, big = (a, b) if a.calc_area() <= b.calc_area() else (b, a)
            # the smaller one is hidden when its centre lies within the bigger face's footprint
            cs = small.calc_center_median()
            bb = [v.co for v in big.verts]
            lo = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
            hi = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
            if all(lo[k] - 1e-4 <= cs[k] <= hi[k] + 1e-4 for k in range(3)):
                kill.add(small.index)
                if small is a:
                    break
    doomed = [f for f in bm.faces if f.index in kill]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(mesh.data)
    bm.free()
    return len(kill)


def tris(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


def build(did, fn, mats):
    fixed, tint = mats
    b = Builder("drone_" + did, 1.0, fixed, tint, HIGH)
    rotors, points = fn(b)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in b.objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = b.objs[0]
    with bpy.context.temp_override(active_object=b.objs[0], selected_editable_objects=b.objs, selected_objects=b.objs):
        bpy.ops.object.join()
    mesh = bpy.context.view_layer.objects.active
    mesh.vertex_groups.clear()
    removed = cull_hidden(mesh)
    print("drone", did, "removed hidden faces:", removed, clean_mesh(mesh))
    mesh.name = "drone_" + did
    mesh.data.name = "drone_" + did
    kids = []
    for r in rotors:
        r.parent = mesh
        kids.append(r)
    for nm, loc in points.items():
        e = bpy.data.objects.new(nm, None)
        e.empty_display_type = "PLAIN_AXES"
        e.empty_display_size = 0.12
        e.location = loc
        bpy.context.scene.collection.objects.link(e)
        e.parent = mesh
        kids.append(e)
    return mesh, kids, points


def export(did, mesh, kids, points, out_dir):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    mesh.select_set(True)
    for k in kids:
        k.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    path = os.path.join(out_dir, "drone_" + did + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=False, export_yup=True)
    meta = {"id": did, "tris": tris(mesh.data), "points": {k: [round(c, 3) for c in v] for k, v in points.items()}, "halo": True,
            "forward": "-Y (Blender) / -Z (glTF)", "materials": [m.name for m in mesh.data.materials]}
    with open(os.path.join(out_dir, "drone_" + did + ".meta.json"), "w") as f:
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
    sc.render.resolution_x, sc.render.resolution_y = int(os.environ.get('PW', '1800')), int(os.environ.get('PH', '760'))
    sc.view_settings.view_transform = "AgX"
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*lin("#E8D9C2"), 1)
    bg.inputs["Strength"].default_value = 0.6
    sc.world = w
    fm = make_materials("#E4E6ED")[1]
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -0.6))
    fl = bpy.context.active_object
    fl.scale = (40, 12, 0.1)
    fl.data.materials.append(fm)
    for i, (did, mesh, kids) in enumerate(items):
        mesh.location = ((i - (len(items) - 1) / 2) * 1.9, 0, 0.3)
        mesh.rotation_euler = (0, 0, math.radians(-35))
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 10))
    sun = bpy.context.active_object
    sun.data.energy = 3.6
    sun.data.angle = math.radians(3)
    sun.data.color = lin("#FFD7A0")
    sun.rotation_euler = tuple(math.radians(a) for a in (45, 0, 40))
    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = max(4.4, 1.9 * len(items) + 1.2)
    cam.rotation_euler = (math.radians(58), 0, 0)
    cam.location = Vector((0, 0, 0)) + cam.rotation_euler.to_matrix() @ Vector((0, 0, 20))
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
    for did, fn in DRONES:
        if ONLY and did not in ONLY:
            continue
        mesh, kids, points = build(did, fn, mats)
        t = tris(mesh.data) + sum(tris(k.data) for k in kids if k.type == "MESH")
        if t > BUDGET:
            errs.append("%s: %d tris > %d" % (did, t, BUDGET))
            continue
        res[did] = export(did, mesh, kids, points, OUT_DIR)["tris"] + sum(tris(k.data) for k in kids if k.type == "MESH")
        items.append((did, mesh, kids))
        for k in kids:
            k.name = "x_" + did + "_" + k.name  # free the names so the next drone exports clean `muzzle`/`beam`/...
    if errs:
        raise ValueError("; ".join(errs))
    if PREVIEW and bpy.app.background:
        lineup(items)
    return res


RESULT = run()
print(RESULT)
