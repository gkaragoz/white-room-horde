"""Chibi character kit: builds rigged low-poly (Valheim-style) characters and exports GLBs.

Run headless:
  blender -b --factory-startup --python tools/blender/make_chibi.py
Through Llama wrapper: exec this file with globals {"__name__": "__main__", "__file__": path}.
Globals / env: OUT_DIR (default packages/client/public/models/characters), PREVIEW (render lineup).
Rules: idempotent, only own objects exported, validates before writing, names [A-Za-z0-9_-].
"""
import bpy, bmesh, math, os, json, random, sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/make_chibi.py")))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
g = globals()
OUT_DIR = g.get("OUT_DIR") or os.environ.get("OUT_DIR") or os.path.join(REPO, "packages", "client", "public", "models", "characters")
PREVIEW = g.get("PREVIEW", os.environ.get("PREVIEW", "1") == "1")
PREVIEW_PATH = g.get("PREVIEW_PATH") or os.path.join(REPO, "tools", "blender", "out", "characters_lineup.png")
ONLY = g.get("ONLY") or ([x for x in os.environ.get("ONLY", "").split(",") if x] or None)

BONES = ["root", "hips", "spine", "head", "arm.L", "arm.R", "hand.L", "hand.R", "thigh.L", "thigh.R", "foot.L", "foot.R"]
BUDGET = {"player": 1500, "grunt": 650, "runner": 650, "tank": 900, "exploder": 900, "spitter": 900, "shielder": 900, "spawner": 900,
          "boss": 4000, "acc": 500}
LOW = (8, 4, 8)  # sphere segments, rings, cylinder segments for crowd enemies (VAT instanced x500)
HIGH = (10, 6, 10)
SEG, RINGS, CYL = 10, 6, 10


def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


# ---------------------------------------------------------------- materials / texture
def paint_image():
    import numpy as np
    rng = np.random.default_rng(7)
    n = 128
    low = rng.random((9, 9))
    xs = np.linspace(0, 8, n)
    x0 = np.floor(xs).astype(int).clip(0, 7)
    f = xs - x0
    row = low[:, x0] * (1 - f) + low[:, x0 + 1] * f
    img = row[x0, :] * (1 - f)[:, None] + row[x0 + 1, :] * f[:, None]
    img = (img + 0.25 * rng.random((n, n))) / 1.25
    lv = np.array([0.74, 0.84, 0.93, 1.0])
    q = np.digitize(img, [0.35, 0.5, 0.68])
    mult = lv[q]
    srgb = np.where(mult <= 0.0031308, mult * 12.92, 1.055 * mult ** (1 / 2.4) - 0.055)
    px = np.ones((n, n, 4), dtype=np.float32)
    px[..., 0] = px[..., 1] = px[..., 2] = srgb
    im = bpy.data.images.get("wrh_paint") or bpy.data.images.new("wrh_paint", n, n, alpha=False)
    im.pixels.foreach_set(px.ravel())
    im.update()
    im.pack()
    return im


def make_materials(tint_hex=None):
    """Returns (fixed, tint). fixed = vertex color x paint texture, tint = white x paint texture."""
    im = paint_image()
    mats = []
    for name in ("fixed", "tint"):
        m = bpy.data.materials.new("wrh_" + name + ("" if tint_hex is None else tint_hex.strip("#")))
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        b = nt.nodes.new("ShaderNodeBsdfPrincipled")
        b.inputs["Roughness"].default_value = 0.95
        for nme in ("Specular IOR Level",):
            try:
                b.inputs[nme].default_value = 0.05
            except Exception:
                pass
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = im
        tex.interpolation = "Closest"
        if name == "fixed":
            va = nt.nodes.new("ShaderNodeVertexColor")
            va.layer_name = "Col"
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs[0].default_value = 1.0
            nt.links.new(va.outputs["Color"], mix.inputs[6])
            nt.links.new(tex.outputs["Color"], mix.inputs[7])
            nt.links.new(mix.outputs[2], b.inputs["Base Color"])
        elif tint_hex:
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs[0].default_value = 1.0
            mix.inputs[6].default_value = (*lin(tint_hex), 1)
            nt.links.new(tex.outputs["Color"], mix.inputs[7])
            nt.links.new(mix.outputs[2], b.inputs["Base Color"])
        else:
            nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
        nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
        mats.append(m)
    return mats[0], mats[1]


# ---------------------------------------------------------------- parts
class Builder:
    def __init__(self, cid, S, fixed, tint, detail=HIGH):
        self.cid, self.S, self.fixed, self.tint = cid, S, fixed, tint
        self.seg, self.rings, self.cylseg = detail
        self.objs = []
        self.n = 0

    def _finish(self, bm, color, use_tint, bone):
        me = bpy.data.meshes.new("%s_p%d" % (self.cid, self.n))
        bm.to_mesh(me)
        bm.free()
        me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
        col = me.color_attributes["Col"]
        c = (*lin(color), 1) if color else (1, 1, 1, 1)
        for i in range(len(col.data)):
            col.data[i].color = c
        for p in me.polygons:
            p.use_smooth = False
        me.materials.append(self.tint if use_tint else self.fixed)
        ob = bpy.data.objects.new("%s_p%d" % (self.cid, self.n), me)
        self.n += 1
        bpy.context.scene.collection.objects.link(ob)
        vg = ob.vertex_groups.new(name=bone)
        vg.add(list(range(len(me.vertices))), 1.0, "REPLACE")
        self.objs.append(ob)
        return ob

    def _mat(self, center, scale, rot):
        S = self.S
        m = Matrix.Translation(Vector(center) * S)
        if rot != (0, 0, 0):
            m = m @ Matrix.Rotation(rot[2], 4, "Z") @ Matrix.Rotation(rot[1], 4, "Y") @ Matrix.Rotation(rot[0], 4, "X")
        return m @ Matrix.Diagonal((scale[0] * S, scale[1] * S, scale[2] * S, 1.0))

    def sphere(self, bone, center, r, scale=(1, 1, 1), color="#FFFFFF", tint=False, rot=(0, 0, 0), seg=None, rings=None):
        bm = bmesh.new()
        bm.loops.layers.uv.verify()
        bmesh.ops.create_uvsphere(bm, u_segments=seg or self.seg, v_segments=rings or self.rings, radius=r, matrix=self._mat(center, scale, rot), calc_uvs=True)
        return self._finish(bm, color, tint, bone)

    def box(self, bone, center, size, color="#FFFFFF", tint=False, rot=(0, 0, 0)):
        bm = bmesh.new()
        bm.loops.layers.uv.verify()
        bmesh.ops.create_cube(bm, size=1.0, matrix=self._mat(center, size, rot), calc_uvs=True)
        return self._finish(bm, color, tint, bone)

    def cyl(self, bone, center, r, depth, color="#FFFFFF", tint=False, rot=(0, 0, 0), r2=None):
        bm = bmesh.new()
        bm.loops.layers.uv.verify()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=self.cylseg, radius1=r, radius2=r if r2 is None else r2, depth=depth,
                              matrix=self._mat(center, (1, 1, 1), rot), calc_uvs=True)
        return self._finish(bm, color, tint, bone)

    def torus(self, bone, center, R, r, color="#FFFFFF", tint=False, rot=(0, 0, 0), scale=(1, 1, 1), major=12, minor=6):
        bm = bmesh.new()
        verts = []
        for i in range(major):
            a = 2 * math.pi * i / major
            ring = []
            for j in range(minor):
                b = 2 * math.pi * j / minor
                x = (R + r * math.cos(b)) * math.cos(a)
                y = (R + r * math.cos(b)) * math.sin(a)
                z = r * math.sin(b)
                ring.append(bm.verts.new((x, y, z)))
            verts.append(ring)
        bm.verts.ensure_lookup_table()
        uv = bm.loops.layers.uv.new("UVMap")
        for i in range(major):
            for j in range(minor):
                f = bm.faces.new((verts[i][j], verts[(i + 1) % major][j], verts[(i + 1) % major][(j + 1) % minor], verts[i][(j + 1) % minor]))
                for k, l in enumerate(f.loops):
                    l[uv].uv = ((i + (k in (1, 2))) / major, (j + (k in (2, 3))) / minor)
        bm.transform(self._mat(center, scale, rot))
        return self._finish(bm, color, tint, bone)


def build_armature(cid, S, head_top=1.5):
    arm = bpy.data.armatures.new(cid + "_arm")
    ob = bpy.data.objects.new(cid + "_rig", arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name, head, tail, parent=None):
        b = arm.edit_bones.new(name)
        b.head = Vector(head) * S
        b.tail = Vector(tail) * S
        if parent:
            b.parent = arm.edit_bones[parent]
        return b

    bone("root", (0, 0, 0), (0, 0, 0.12))
    bone("hips", (0, 0, 0.3), (0, 0, 0.5), "root")
    bone("spine", (0, 0, 0.5), (0, 0, 0.85), "hips")
    bone("head", (0, 0, 0.85), (0, 0, head_top), "spine")
    for sx, side in ((1, "L"), (-1, "R")):
        bone("arm." + side, (sx * 0.3, 0, 0.68), (sx * 0.36, 0, 0.5), "spine")
        bone("hand." + side, (sx * 0.36, 0, 0.5), (sx * 0.36, 0, 0.36), "arm." + side)
        bone("thigh." + side, (sx * 0.2, 0, 0.3), (sx * 0.2, 0, 0.15), "hips")
        bone("foot." + side, (sx * 0.2, 0, 0.15), (sx * 0.2, -0.12, 0.04), "thigh." + side)
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def finalize(cid, S, objs, rig):
    """Join parts into one mesh, parent to the rig with an Armature modifier."""
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    mesh = bpy.context.view_layer.objects.active
    mesh.name = cid + "_mesh"
    mesh.data.name = cid + "_mesh"
    mod = mesh.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    mesh.parent = rig
    return mesh


# ---------------------------------------------------------------- character specs
DARK, GLOVE = "#61656F", "#3F3F45"


def body_parts(b, head_c, body_c, slim=1.0, head_k=1.0, tint_body=False, belt=DARK, glove=GLOVE, arms=True):
    """Shared chibi anatomy. Rest pose: arms down."""
    b.sphere("head", (0, 0, 1.05), 0.46 * head_k, (1, 1, 0.95), head_c)
    b.sphere("spine", (0, 0, 0.5), 0.34, (slim, 0.85 * slim, 1.15), body_c, tint=tint_body)
    b.sphere("spine", (0, 0, 0.62), 0.37, (1.02 * slim, 0.9 * slim, 0.55), belt)
    b.sphere("hips", (0, 0, 0.3), 0.25, (slim, 0.85 * slim, 0.7), belt)
    for sx, side in ((1, "L"), (-1, "R")):
        if arms:
            b.sphere("arm." + side, (sx * 0.34 * slim, 0, 0.56), 0.11, (1, 1, 1.6), body_c, tint=tint_body)
            b.sphere("hand." + side, (sx * 0.36 * slim, 0, 0.38), 0.1, (1, 1, 1), glove)
        b.sphere("thigh." + side, (sx * 0.2, 0, 0.27), 0.12, (1, 1, 1.3), belt)
        b.sphere("foot." + side, (sx * 0.2, -0.04, 0.13), 0.13, (1, 1.3, 1), belt)


def spec_player(b):
    body_parts(b, "#FDFDFD", "#FFFFFF", tint_body=True)


def spec_grunt(b):
    body_parts(b, "#E1FDD3", "#C4E5B3")


def spec_runner(b):
    body_parts(b, "#FFDABC", "#F9B37C", slim=0.8, head_k=1.15)


def spec_tank(b):
    body_parts(b, "#D3C4E1", "#AD95C4", slim=1.35, head_k=0.8)
    for sx in (-1, 1):
        b.box("spine", (sx * 0.52, 0, 0.66), (0.16, 0.5, 0.5), "#7C7C89")
    b.box("spine", (0, -0.4, 0.55), (0.55, 0.14, 0.5), "#5B6B85")


def spec_exploder(b):
    body_parts(b, "#FFE08A", "#FFC93C", belt="#2B2D33")
    b.cyl("head", (0, 0, 1.55), 0.06, 0.2, "#2B2D33")
    b.sphere("head", (0, 0, 1.68), 0.07, (1, 1, 1), "#FF9A3C")
    for z in (0.46, 0.6):
        b.box("spine", (0, -0.31, z), (0.5, 0.06, 0.07), "#2B2D33")


def spec_spitter(b):
    body_parts(b, "#A9EEF2", "#55D6E0")
    b.sphere("head", (0, -0.34, 1.0), 0.2, (1.2, 0.5, 0.8), "#1E5560")
    b.sphere("head", (0, -0.31, 0.94), 0.09, (1, 0.5, 1), "#8FF06A")


def spec_shielder(b):
    body_parts(b, "#C9D4E4", "#8FA3BF", head_k=0.95)
    b.box("arm.L", (0.5, -0.32, 0.56), (0.08, 0.62, 0.84), "#5B6B85")
    b.box("arm.L", (0.5, -0.36, 0.56), (0.1, 0.1, 0.4), "#8FA3BF")


def spec_spawner(b):
    body_parts(b, "#F5D9DE", "#E8B4BC", slim=1.15)
    rnd = random.Random(5)
    for (x, z) in ((0.2, 0.7), (-0.22, 0.55), (0.0, 0.85), (0.3, 0.45), (-0.3, 0.8)):
        b.sphere("spine", (x, 0.3, z), 0.14 + rnd.random() * 0.05, (1, 1, 1), "#F3E3C3")


def crown(b, color="#FFC93C"):
    ring = b.cyl("head", (0, 0, 1.52), 0.34, 0.1, color)
    for k in range(6):
        a = 2 * math.pi * k / 6
        b.cyl("head", (0.31 * math.cos(a), 0.31 * math.sin(a), 1.68), 0.075, 0.26, color, r2=0.0)


def spec_dev_grunt(b):
    body_parts(b, "#B8E3A8", "#7DBE6A", slim=1.2)
    crown(b)
    for sx in (-1, 1):
        b.cyl("head", (sx * 0.42, 0, 1.36), 0.09, 0.34, "#F3E3C3", rot=(0, sx * 0.7, 0), r2=0.0)


def spec_kral_tank(b):
    body_parts(b, "#B39BD6", "#7B5CA6", slim=1.4, head_k=0.85)
    crown(b)
    for sx in (-1, 1):
        b.box("spine", (sx * 0.56, 0, 0.7), (0.2, 0.6, 0.6), "#7C7C89")
        b.box("spine", (sx * 0.6, 0, 0.98), (0.12, 0.3, 0.3), "#7C7C89")
    b.box("spine", (0, -0.42, 0.55), (0.7, 0.16, 0.6), "#5B6B85")


def spec_sayaci_ana(b):
    body_parts(b, "#F0C1C9", "#D98E9A", slim=1.3)
    crown(b)
    rnd = random.Random(9)
    for k in range(9):
        a = 2 * math.pi * k / 9
        b.sphere("spine", (0.38 * math.cos(a), 0.38 * math.sin(a) + 0.1, 0.55 + 0.12 * (k % 3)), 0.15 + rnd.random() * 0.05, (1, 1, 1), "#F3E3C3")


def spec_suru_lideri(b):
    body_parts(b, "#FFC48F", "#F28C38", slim=0.9, head_k=1.1)
    crown(b)
    b.cyl("spine", (0, 0.32, 0.8), 0.12, 0.5, "#5B2B2B", rot=(0.4, 0, 0), r2=0.0)


# accessories live in character space; the client attaches them to the head bone
def acc_bandana(b):  # accessories use HIGH detail
    b.torus("head", (0, 0, 1.19), 0.44, 0.06, "#FFFFFF", tint=True, scale=(1, 1, 1))
    b.box("head", (0.2, 0.38, 1.17), (0.16, 0.05, 0.22), "#FFFFFF", tint=True, rot=(0.3, 0.2, 0.5))


def acc_headphones(b):
    for sx in (-1, 1):
        b.cyl("head", (sx * 0.47, 0, 1.05), 0.17, 0.12, "#2B2D33", rot=(0, math.pi / 2, 0))
    b.torus("head", (0, 0, 1.05), 0.47, 0.03, "#2B2D33", rot=(math.pi / 2, 0, 0), scale=(1, 0.4, 1), major=10, minor=4)


def acc_helmet(b):
    b.sphere("head", (0, 0, 1.2), 0.5, (1, 1, 0.65), "#7C8794")
    b.box("head", (0, -0.4, 1.28), (0.1, 0.1, 0.3), "#FFC93C")


def acc_cap(b):
    b.sphere("head", (0, 0, 1.22), 0.48, (1, 1, 0.6), "#FFFFFF", tint=True)
    b.box("head", (0, -0.46, 1.17), (0.52, 0.4, 0.05), "#FFFFFF", tint=True, rot=(0.15, 0, 0))


def acc_goggles(b):
    b.torus("head", (0, 0, 1.1), 0.46, 0.04, "#2B2D33", rot=(0, 0, 0), major=12, minor=4)
    for sx in (-1, 1):
        b.cyl("head", (sx * 0.2, -0.43, 1.1), 0.14, 0.1, "#9FD8E6", rot=(math.pi / 2, 0, 0))


# id, builder, scale, budget key, head_top
SPECS = [
    ("player_base", spec_player, 1.5, "player", 1.5),
    ("grunt", spec_grunt, 1.35, "grunt", 1.5),
    ("runner", spec_runner, 1.05, "runner", 1.55),
    ("tank", spec_tank, 2.5, "tank", 1.45),
    ("exploder", spec_exploder, 1.3, "exploder", 1.7),
    ("spitter", spec_spitter, 1.35, "spitter", 1.5),
    ("shielder", spec_shielder, 1.5, "shielder", 1.5),
    ("spawner", spec_spawner, 1.5, "spawner", 1.5),
    ("boss_dev_grunt", spec_dev_grunt, 3.0, "boss", 1.7),
    ("boss_kral_tank", spec_kral_tank, 4.0, "boss", 1.7),
    ("boss_sayaci_ana", spec_sayaci_ana, 3.5, "boss", 1.7),
    ("boss_suru_lideri", spec_suru_lideri, 2.5, "boss", 1.7),
    ("acc_bandana", acc_bandana, 1.5, "acc", 1.5),
    ("acc_headphones", acc_headphones, 1.5, "acc", 1.5),
    ("acc_helmet", acc_helmet, 1.5, "acc", 1.5),
    ("acc_cap", acc_cap, 1.5, "acc", 1.5),
    ("acc_goggles", acc_goggles, 1.5, "acc", 1.5),
]


def tri_count(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


def validate(cid, mesh, rig, budget):
    errs = []
    t = tri_count(mesh.data)
    if t > BUDGET[budget]:
        errs.append("%s: %d tris > budget %d" % (cid, t, BUDGET[budget]))
    if len(mesh.data.materials) > 2:
        errs.append("%s: too many materials" % cid)
    names = sorted(b.name for b in rig.data.bones)
    if names != sorted(BONES):
        errs.append("%s: bones %s" % (cid, names))
    return errs, t


def export(cid, mesh, rig, tris, out_dir):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    mesh.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    path = os.path.join(out_dir, cid + ".glb")
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=False, export_yup=True)
    for extra in (dict(export_skins=True, export_animations=False), dict(export_skins=True)):
        try:
            bpy.ops.export_scene.gltf(**kw, **extra)
            break
        except TypeError:
            continue
    mats = [m.name for m in mesh.data.materials]
    zs = [v.co.z for v in mesh.data.vertices]
    meta = {"id": cid, "tris": tris, "bones": BONES, "materials": mats, "height": round(max(zs) - min(zs), 3),
            "attach": "head" if cid.startswith("acc_") else None}
    with open(os.path.join(out_dir, cid + ".meta.json"), "w") as f:
        json.dump(meta, f, indent=1)
    return meta


def run():
    os.makedirs(OUT_DIR, exist_ok=True)
    old = None
    scn = None
    if bpy.app.background:
        for o in list(bpy.data.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:  # interactive Blender: never touch the user's open scene
        old = bpy.context.window.scene
        scn = bpy.data.scenes.new("wrh_chibi")
        bpy.context.window.scene = scn
    try:
        return _run()
    finally:
        if scn is not None:
            bpy.context.window.scene = old
            for o in list(scn.objects):
                bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.scenes.remove(scn)
            for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
                for d in [d for d in coll if d.users == 0]:
                    coll.remove(d)


def _run():
    fixed, tint = make_materials()
    made, results, errors = {}, {}, []
    for cid, fn, S, budget, head_top in SPECS:
        if ONLY and cid not in ONLY:
            continue
        b = Builder(cid, S, fixed, tint, LOW if budget in ("grunt", "runner", "tank", "exploder", "spitter", "shielder", "spawner") else HIGH)
        fn(b)
        rig = build_armature(cid, S, head_top)
        mesh = finalize(cid, S, b.objs, rig)
        errs, tris = validate(cid, mesh, rig, budget)
        if errs:
            errors += errs
            continue
        results[cid] = export(cid, mesh, rig, tris, OUT_DIR)
        made[cid] = (mesh, rig)
    if errors:
        raise ValueError("; ".join(errors))
    if PREVIEW:
        lineup(made)
    return {k: v["tris"] for k, v in results.items()}


# ---------------------------------------------------------------- lineup preview (Valheim lighting)
def lineup(made):
    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            pass
    sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
    try:
        sc.eevee.taa_render_samples = 64
    except Exception:
        pass
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.exposure = 0.1
    w = bpy.data.worlds.new("wrh_world")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*lin("#E8D9C2"), 1)
    bg.inputs["Strength"].default_value = 0.55
    sc.world = w
    # floor
    fm = make_materials("#E4E6ED")[1]
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 4, -0.06))
    fl = bpy.context.active_object
    fl.scale = (60, 40, 0.12)
    fl.data.materials.append(fm)
    # place rows
    pcols = ["#6CC4F9", "#F995B3", "#FDE56C", "#C4A0ED", "#FF9A6A"]
    accs = ["acc_bandana", "acc_headphones", "acc_helmet", "acc_cap", "acc_goggles"]
    row = 0
    x = -6.0
    placed = []

    def place(cid, loc, tint_hex=None):
        mesh, rig = made[cid]
        for o in (mesh, rig):
            o.location = loc
        if tint_hex:
            tm = bpy.data.materials.new("tint_" + tint_hex)
            _, t2 = make_materials(tint_hex)
            mesh.data.materials[1] = t2 if len(mesh.data.materials) > 1 else mesh.data.materials[0]

    pb = made.get("player_base")
    xs = [-6.4 + 3.2 * i for i in range(5)]
    if pb:
        mesh0, rig0 = pb
        for i, (col, ac) in enumerate(zip(pcols, accs)):
            if i == 0:
                m, r = mesh0, rig0
            else:
                m = mesh0.copy()
                m.data = mesh0.data.copy()
                bpy.context.scene.collection.objects.link(m)
                r = rig0.copy()
                r.data = rig0.data.copy()
                bpy.context.scene.collection.objects.link(r)
                m.parent = r
                for mod in m.modifiers:
                    if mod.type == "ARMATURE":
                        mod.object = r
            _, t2 = make_materials(col)
            m.data.materials[1] = t2
            r.location = (xs[i], 0, 0)
            if ac in made:
                am, ar = made[ac]
                ar.location = (xs[i], 0, 0)
                if am.data.materials and len(am.data.materials) > 1:
                    am.data.materials[1] = t2
                if ac == "acc_headphones" or ac == "acc_helmet" or ac == "acc_goggles":
                    pass
    ex = [-9.6 + 3.2 * i for i in range(7)]
    for i, cid in enumerate(["grunt", "runner", "tank", "exploder", "spitter", "shielder", "spawner"]):
        if cid in made:
            made[cid][1].location = (ex[i], 5.0, 0)
    bx = [-7.0 + 4.6 * i for i in range(4)]
    for i, cid in enumerate(["boss_dev_grunt", "boss_kral_tank", "boss_sayaci_ana", "boss_suru_lideri"]):
        if cid in made:
            made[cid][1].location = (bx[i], 11.5, 0)
    if os.environ.get("DEBUG_LINEUP"):
        for o in bpy.context.scene.objects:
            print("OBJ", o.name, o.type, tuple(round(c, 2) for c in o.location), tuple(round(c, 2) for c in o.dimensions), o.parent.name if o.parent else None)
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 10))
    sun = bpy.context.active_object
    sun.data.energy = 3.6
    sun.data.angle = math.radians(3)
    sun.data.color = lin("#FFD7A0")
    sun.rotation_euler = tuple(math.radians(a) for a in (38, 0, 55))
    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 32
    cam.rotation_euler = (math.radians(62), 0, math.radians(0))
    cam.location = Vector((0, 6.0, 0.8)) + cam.rotation_euler.to_matrix() @ Vector((0, 0, 30))
    sc.camera = cam
    os.makedirs(os.path.dirname(PREVIEW_PATH), exist_ok=True)
    sc.render.filepath = PREVIEW_PATH
    sc.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)


if not globals().get("NO_RUN"):
    RESULT = run()
    print(RESULT)
