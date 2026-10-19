"""Scenery props: chunky low-poly GLBs for the arena surroundings (crate, barrel, cone, lamp, pallet, tyres, sandbags, bench,
plant, barrier, container, sign). Same toy style as the weapons; buried and coplanar faces are removed so nothing flickers.

Run headless:  blender -b --factory-startup --python tools/blender/make_props.py
Conventions: origin at the middle of the base, Z up in Blender (Y up in the game), about 1 unit = 1 game unit.
"""
import bpy, math, os, json
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/make_props.py")))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.environ.get("OUT_DIR") or os.path.join(REPO, "packages", "client", "public", "models", "props")

kit_path = os.path.join(HERE, "make_chibi.py")
K = {"__name__": "kit", "__file__": kit_path, "NO_RUN": True}
exec(compile(open(kit_path, encoding="utf-8").read(), kit_path, "exec"), K)
Builder, make_materials = K["Builder"], K["make_materials"]
HIGH = K["HIGH"]

# reuse the face culling of the weapon script without running it
_src = open(os.path.join(HERE, "make_weapons.py"), encoding="utf-8").read()
_a = _src.index("def cull_hidden(mesh):")
_b = _src.index("def build(wid, fn, mats):")
exec(compile(_src[_a:_b], "cull", "exec"), globals())

WOOD, WOOD2, WOOD3 = "#B88A55", "#8F6A3F", "#D3AA72"
STEEL, STEEL2 = "#8A94A3", "#5E6877"
RED, BLUE, ORANGE, YELLOW, WHITE, BLACK, GREEN = "#D1453B", "#3E7CC8", "#F08A2C", "#F2C43B", "#F2F2F2", "#2E3138", "#5FA55A"
BUDGET = 700


def crate(b):
    b.box("root", (0, 0, 0.5), (1.0, 1.0, 1.0), WOOD)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box("root", (sx * 0.46, sy * 0.46, 0.5), (0.1, 0.1, 1.02), WOOD2)
    for z in (0.06, 0.94):
        b.box("root", (0, 0, z), (1.02, 1.02, 0.1), WOOD2)
    b.box("root", (0, 0.51, 0.5), (0.9, 0.03, 0.12), WOOD3, rot=(0, 0, 0))
    b.box("root", (0.51, 0, 0.5), (0.03, 0.9, 0.12), WOOD3)


def crate_stack(b):
    b.box("root", (-0.4, 0, 0.45), (0.9, 0.9, 0.9), WOOD)
    b.box("root", (0.55, 0.1, 0.4), (0.8, 0.8, 0.8), WOOD3)
    b.box("root", (-0.3, 0.05, 1.3), (0.8, 0.8, 0.8), WOOD2, rot=(0, 0, 0.35))
    for (x, y, z, s) in ((-0.4, 0, 0.45, 0.9), (0.55, 0.1, 0.4, 0.8)):
        for sx in (-1, 1):
            b.box("root", (x + sx * s * 0.46, y + s * 0.46, z), (0.08, 0.08, s * 1.02), BLACK)
            b.box("root", (x + sx * s * 0.46, y - s * 0.46, z), (0.08, 0.08, s * 1.02), BLACK)


def barrel(b, color=RED):
    b.cyl("root", (0, 0, 0.5), 0.42, 1.0, color)
    for z in (0.18, 0.5, 0.82):
        b.cyl("root", (0, 0, z), 0.44, 0.07, STEEL2)
    b.cyl("root", (0, 0, 1.0), 0.36, 0.05, STEEL)
    b.cyl("root", (0.14, 0.1, 1.04), 0.07, 0.05, BLACK)


def barrel_blue(b):
    barrel(b, BLUE)


def cone(b):
    b.box("root", (0, 0, 0.04), (0.6, 0.6, 0.08), BLACK)
    b.cyl("root", (0, 0, 0.42), 0.24, 0.7, ORANGE, r2=0.07)
    b.cyl("root", (0, 0, 0.32), 0.19, 0.12, WHITE, r2=0.16)
    b.cyl("root", (0, 0, 0.55), 0.13, 0.1, WHITE, r2=0.1)


def lamp(b):
    b.cyl("root", (0, 0, 0.1), 0.2, 0.2, STEEL2)
    b.cyl("root", (0, 0, 1.8), 0.07, 3.4, STEEL)
    b.box("root", (0.3, 0, 3.5), (0.8, 0.12, 0.1), STEEL)
    b.box("root", (0.62, 0, 3.4), (0.4, 0.28, 0.14), STEEL2)
    b.box("root", (0.62, 0, 3.31), (0.32, 0.22, 0.04), "#FFF2B8")


def pallet(b):
    for y in (-0.4, 0, 0.4):
        b.box("root", (0, y, 0.18), (1.2, 0.2, 0.08), WOOD3)
    for x in (-0.5, 0, 0.5):
        b.box("root", (x, 0, 0.1), (0.16, 0.9, 0.12), WOOD2)
    for y in (-0.4, 0.4):
        b.box("root", (0, y, 0.03), (1.2, 0.2, 0.06), WOOD)
    b.box("root", (0.1, 0, 0.5), (0.7, 0.7, 0.5), WOOD, rot=(0, 0, 0.2))


def tyres(b):
    for k, (x, y, z) in enumerate(((0, 0, 0.17), (0.08, 0.04, 0.5), (-0.06, 0, 0.83))):
        b.torus("root", (x, y, z), 0.36, 0.17, BLACK, major=12, minor=6)
    b.cyl("root", (0.0, 0.0, 0.5), 0.24, 0.9, "#22252B")


def sandbags(b):
    for k, (x, z) in enumerate(((-0.55, 0.16), (0.0, 0.16), (0.55, 0.16), (-0.28, 0.46), (0.28, 0.46))):
        b.box("root", (x, 0, z), (0.58, 0.4, 0.28), "#C4B48A", rot=(0, 0, 0.05 * (k % 2 * 2 - 1)))
        b.box("root", (x, 0.2, z + 0.02), (0.4, 0.02, 0.05), "#9C8E66")


def bench(b):
    b.box("root", (0, 0, 0.5), (1.5, 0.45, 0.08), WOOD)
    b.box("root", (0, 0.22, 0.85), (1.5, 0.08, 0.4), WOOD3)
    for sx in (-1, 1):
        b.box("root", (sx * 0.62, 0, 0.25), (0.1, 0.4, 0.5), STEEL2)
        b.box("root", (sx * 0.62, 0.2, 0.7), (0.1, 0.08, 0.5), STEEL2)


def plant(b):
    b.cyl("root", (0, 0, 0.25), 0.4, 0.5, "#B9694B", r2=0.3)
    b.cyl("root", (0, 0, 0.52), 0.42, 0.06, "#8F4E36")
    for (x, y, z, r) in ((0, 0, 0.95, 0.42), (0.28, 0.1, 0.78, 0.28), (-0.26, -0.12, 0.8, 0.3), (0.05, -0.25, 1.2, 0.26)):
        b.sphere("root", (x, y, z), r, (1, 1, 1), GREEN, seg=7, rings=5)


def barrier(b):
    b.box("root", (0, 0, 0.18), (1.8, 0.62, 0.36), "#BDC3CC")
    b.box("root", (0, 0, 0.6), (1.8, 0.38, 0.5), "#BDC3CC")
    for x in (-0.6, 0.0, 0.6):
        b.box("root", (x, 0.0, 0.58), (0.28, 0.4, 0.34), ORANGE, rot=(0, 0, 0))
    b.box("root", (0, 0, 0.88), (1.8, 0.3, 0.06), "#9AA2AD")


def container(b):
    b.box("root", (0, 0, 1.0), (4.0, 1.7, 1.9), BLUE)
    for k in range(9):
        x = -1.8 + k * 0.45
        b.box("root", (x, 0.86, 1.0), (0.12, 0.05, 1.8), "#2F5E99")
        b.box("root", (x, -0.86, 1.0), (0.12, 0.05, 1.8), "#2F5E99")
    b.box("root", (2.02, 0, 1.0), (0.06, 1.5, 1.7), "#2F5E99")
    for z in (0.5, 1.5):
        b.box("root", (2.05, 0, z), (0.05, 1.46, 0.05), STEEL)
    b.box("root", (0, 0, 1.97), (4.05, 1.75, 0.06), "#2F5E99")


def container_orange(b):
    container(b)


def sign(b):
    b.cyl("root", (0, 0, 0.7), 0.05, 1.4, STEEL)
    b.box("root", (0, 0, 1.45), (0.8, 0.06, 0.8), YELLOW, rot=(0, math.pi / 4, 0))
    b.box("root", (0, -0.04, 1.45), (0.1, 0.03, 0.46), BLACK)
    b.cyl("root", (0, -0.04, 1.2), 0.06, 0.03, BLACK, rot=(math.pi / 2, 0, 0))


PROPS = [("crate", crate), ("crate_stack", crate_stack), ("barrel", barrel), ("barrel_blue", barrel_blue), ("cone", cone), ("lamp", lamp),
         ("pallet", pallet), ("tyres", tyres), ("sandbags", sandbags), ("bench", bench), ("plant", plant), ("barrier", barrier),
         ("container", container), ("sign", sign)]


def build(pid, fn, mats):
    fixed, tint = mats
    b = Builder("prop_" + pid, 1.0, fixed, tint, HIGH)
    fn(b)
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
    mesh.name = "prop_" + pid
    mesh.data.name = "prop_" + pid
    print("prop", pid, "removed", removed)
    return mesh


def tris(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


def export(pid, mesh):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT_DIR, "prop_" + pid + ".glb"), export_format="GLB", use_selection=True, export_apply=False, export_yup=True)
    bb = [mesh.matrix_world @ Vector(c) for c in mesh.bound_box]
    size = [round(max(v[i] for v in bb) - min(v[i] for v in bb), 2) for i in range(3)]
    with open(os.path.join(OUT_DIR, "prop_" + pid + ".meta.json"), "w") as f:
        json.dump({"id": pid, "tris": tris(mesh.data), "size": size}, f, indent=1)


def run():
    os.makedirs(OUT_DIR, exist_ok=True)
    if bpy.app.background:
        for o in list(bpy.data.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    mats = make_materials()
    res, errs = {}, []
    for pid, fn in PROPS:
        mesh = build(pid, fn, mats)
        t = tris(mesh.data)
        if t > BUDGET:
            errs.append("%s: %d tris > %d" % (pid, t, BUDGET))
            continue
        export(pid, mesh)
        res[pid] = t
        bpy.data.objects.remove(mesh, do_unlink=True)
    if errs:
        raise ValueError("; ".join(errs))
    return res


RESULT = run()
print(RESULT)
