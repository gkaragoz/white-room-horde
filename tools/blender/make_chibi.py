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
          "special": 1300, "boss": 4000, "acc": 500}
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
    if cid.startswith("acc_"):  # hats and masks are static, so welding and de-overlapping them is safe
        _mc = os.path.join(os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/make_chibi.py"))), "meshclean.py")
        _ns = {}
        exec(compile(open(_mc, encoding="utf-8").read(), _mc, "exec"), _ns)
        print("clean", cid, _ns["clean_mesh"](mesh))
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


def spec_crawler(b):
    body_parts(b, "#D9E8C0", "#A3B58A", slim=0.85, head_k=0.9, belt="#6F7F58")
    for k, (x, z) in enumerate(((0.0, 0.78), (0.14, 0.62), (-0.14, 0.62))):
        b.cyl("spine", (x, 0.3, z), 0.07, 0.22, "#6F7F58", rot=(-0.9, 0, 0), r2=0.0)


def spec_leaper(b):
    body_parts(b, "#C4D6F2", "#7FA0D8", slim=0.95, head_k=0.85, belt="#4C6AA3")
    for sx, side in ((1, "L"), (-1, "R")):
        b.sphere("thigh." + side, (sx * 0.22, 0, 0.27), 0.2, (1, 1, 1.45), "#5C7DBA")
        b.cyl("arm." + side, (sx * 0.4, 0, 0.74), 0.07, 0.3, "#E8F0FF", rot=(0, sx * 0.5, 0), r2=0.0)


def spec_bloater(b):
    body_parts(b, "#CFE4A0", "#9FBF6A", slim=1.85, head_k=0.7, belt="#6E8C3A")
    rnd = random.Random(11)
    for (x, y, z) in ((0.3, -0.3, 0.45), (-0.35, -0.25, 0.55), (0.1, -0.42, 0.62), (0.4, 0.1, 0.4), (-0.2, -0.4, 0.38), (0.0, 0.35, 0.55)):
        b.sphere("spine", (x, y, z), 0.14 + rnd.random() * 0.06, (1, 1, 1), "#E8F06A")


def spec_screamer(b):
    body_parts(b, "#F3C9E6", "#D78BC1", slim=0.75, head_k=1.3, belt="#8C4F7A")
    b.sphere("head", (0, -0.4, 0.95), 0.27, (1.1, 0.5, 1.25), "#4A1030")
    for sx in (-1, 1):
        b.sphere("head", (sx * 0.34, -0.3, 1.2), 0.07, (1, 1, 1), "#FFF2A8")


# ---------------------------------------------------------------- the ten newer enemies (each with a carried prop)
def _goo(b, bone, x, y, z, r=0.1, c="#B8F060"):
    b.sphere(bone, (x, y, z), r, (1, 1, 0.8), c)


def spec_acider(b):
    """Toxic sprayer: a tank of acid on the back, a hose to a nozzle in the right hand, drips on the boots."""
    body_parts(b, "#E4F5B0", "#9ACD3C", slim=0.95, belt="#4A5A22", glove="#2E3A14")
    b.cyl("spine", (0, 0.33, 0.62), 0.2, 0.62, "#76B82A")
    b.sphere("spine", (0, 0.33, 0.94), 0.2, (1, 1, 0.55), "#76B82A")
    b.box("spine", (0, 0.33, 0.7), (0.5, 0.06, 0.08), "#3C4A1A")
    b.box("spine", (0, 0.33, 0.52), (0.5, 0.06, 0.08), "#3C4A1A")
    b.cyl("hand.R", (-0.36, -0.12, 0.4), 0.05, 0.42, "#4A5A22", rot=(1.35, 0, 0))
    b.sphere("hand.R", (-0.36, -0.34, 0.42), 0.075, (1, 1, 1), "#D8FF5A")
    for sx in (-1, 1):
        _goo(b, "foot." + ("L" if sx == 1 else "R"), sx * 0.2, -0.1, 0.05, 0.1)
    _goo(b, "hand.L", 0.36, 0, 0.28, 0.07)
    b.sphere("head", (0.15, -0.38, 1.02), 0.1, (1, 0.6, 1), "#B8F060")


def spec_rammer(b):
    """Bull: huge shoulders, horns, a nose ring and an iron plate across the brow."""
    body_parts(b, "#E8B9A0", "#B5543C", slim=1.3, head_k=0.82, belt="#4A2A22", glove="#2B1812")
    for sx in (-1, 1):
        side = "L" if sx == 1 else "R"
        b.sphere("arm." + side, (sx * 0.52, 0, 0.7), 0.24, (1, 1, 0.9), "#7A7F8C")
        b.cyl("arm." + side, (sx * 0.52, 0, 0.9), 0.06, 0.2, "#C9CED8", r2=0.0)
        b.cyl("head", (sx * 0.34, -0.08, 1.38), 0.1, 0.5, "#F2E6CC", rot=(0, -sx * 0.9, 0), r2=0.02)
    b.box("head", (0, -0.4, 1.08), (0.7, 0.12, 0.2), "#7A7F8C")
    b.torus("head", (0, -0.5, 0.86), 0.09, 0.025, "#D8B24A", rot=(1.57, 0, 0), major=8, minor=4)
    b.box("spine", (0, -0.33, 0.46), (0.62, 0.1, 0.5), "#7A7F8C")


def spec_mortar(b):
    """Grenadier: a mortar tube on the shoulder, a bandolier of shells and a helmet."""
    body_parts(b, "#E2DCB4", "#7A8A4A", belt="#4A4A2A", glove="#2E2E1A")
    b.cyl("spine", (-0.18, 0.2, 0.85), 0.13, 1.25, "#454B3A", rot=(0.35, -0.2, 0))
    b.cyl("spine", (-0.18, 0.2, 1.45), 0.18, 0.12, "#2B2F24", rot=(0.35, -0.2, 0))
    for k in range(3):
        b.box("spine", (-0.3 + k * 0.1, 0.38, 0.35), (0.06, 0.06, 0.28), "#6A6F5A", rot=(0, 0, 0.35 * k))
    for k in range(4):
        b.sphere("spine", (-0.24 + k * 0.16, -0.31, 0.56 - k * 0.04), 0.08, (1, 1, 1.5), "#D8B24A")
    b.sphere("head", (0, 0, 1.3), 0.4, (1.05, 1.05, 0.62), "#5C6640")
    b.box("head", (0, -0.34, 1.16), (0.5, 0.2, 0.05), "#434A30")


def spec_sledge(b):
    """Sledge brute: a giant hammer in the right hand, bandaged fists, broad and slow."""
    body_parts(b, "#E4D2C4", "#8A8D96", slim=1.35, head_k=0.8, belt="#3A3C44", glove="#D8C8AE")
    b.cyl("hand.R", (-0.4, -0.05, 0.72), 0.055, 1.05, "#8A5A32")
    b.box("hand.R", (-0.4, -0.05, 1.25), (0.62, 0.42, 0.4), "#555963")
    b.box("hand.R", (-0.4, -0.05, 1.25), (0.7, 0.3, 0.3), "#3F434C")
    b.box("hand.R", (-0.4, -0.05, 1.5), (0.2, 0.2, 0.08), "#555963")
    for sx in (-1, 1):
        side = "L" if sx == 1 else "R"
        b.box("arm." + side, (sx * 0.46, 0, 0.56), (0.2, 0.2, 0.22), "#D8C8AE")
    b.box("spine", (0, 0, 0.6), (0.9, 0.5, 0.1), "#B04A2C")


def spec_lamper(b):
    """Lamp spinner: a street lamp as a weapon, a hi-vis vest and a hard hat."""
    body_parts(b, "#F3E6B8", "#D9A441", slim=1.1, belt="#4A4A52", glove="#2E2E36")
    b.cyl("hand.R", (-0.4, -0.05, 0.95), 0.045, 1.9, "#4A5560")
    b.cyl("hand.R", (-0.4, -0.05, 0.08), 0.1, 0.12, "#363E48")
    b.box("hand.R", (-0.4, -0.3, 1.88), (0.1, 0.55, 0.08), "#4A5560")
    b.sphere("hand.R", (-0.4, -0.56, 1.8), 0.15, (1.2, 1.2, 0.7), "#FFF2A8")
    b.box("spine", (0, -0.31, 0.5), (0.58, 0.08, 0.5), "#FF8A1F")
    b.box("spine", (0, -0.35, 0.5), (0.6, 0.04, 0.07), "#E8EEF2")
    b.sphere("head", (0, 0, 1.32), 0.4, (1.05, 1.05, 0.6), "#F2D21F")
    b.cyl("head", (0, -0.28, 1.22), 0.34, 0.04, "#F2D21F")


def spec_reviver(b):
    """Shaman: a hooded robe, a staff with a glowing orb, floating bone charms."""
    body_parts(b, "#E6D9F2", "#6D4BA0", slim=1.0, head_k=0.85, belt="#3B2A5C", glove="#CDBBE8", arms=True)
    b.cyl("spine", (0, 0, 0.32), 0.42, 0.6, "#7A55B8", r2=0.2)
    b.sphere("head", (0, 0.04, 1.12), 0.5, (1.05, 1.05, 1.0), "#4A3478")
    b.sphere("head", (0, -0.28, 1.04), 0.2, (1, 0.5, 1.05), "#1A1030")
    for sx in (-1, 1):
        b.sphere("head", (sx * 0.1, -0.4, 1.06), 0.045, (1, 0.5, 1), "#7DFFB0")
    b.cyl("hand.L", (0.4, -0.05, 0.8), 0.04, 1.55, "#6B4A2A")
    b.sphere("hand.L", (0.4, -0.05, 1.62), 0.17, (1, 1, 1), "#7DFFB0")
    b.torus("hand.L", (0.4, -0.05, 1.62), 0.26, 0.03, "#C9B6F0", major=10, minor=4)
    for k, (x, y, z) in enumerate(((-0.4, -0.2, 1.3), (0.5, 0.2, 1.1), (-0.5, 0.3, 0.8))):
        b.sphere("spine", (x, y, z), 0.08, (1, 1, 1.2), "#F2EEDC")


def spec_marksman(b):
    """Sniper: slim, a long rifle with a scope, a beret and glowing red goggles."""
    body_parts(b, "#D8D8DE", "#4A4A56", slim=0.82, head_k=0.9, belt="#2A2A32", glove="#1E1E24")
    b.cyl("hand.R", (-0.2, -0.45, 0.62), 0.045, 1.5, "#33343C", rot=(1.5, 0, 0.1))
    b.cyl("hand.R", (-0.2, -0.45, 0.72), 0.06, 0.38, "#1E1F26", rot=(1.5, 0, 0.1))
    b.cyl("hand.R", (-0.22, -1.2, 0.6), 0.03, 0.2, "#1E1F26", rot=(1.5, 0, 0.1))
    b.sphere("hand.R", (-0.2, -1.22, 0.6), 0.05, (1, 1, 1), "#FF3B3B")
    for sx in (-1, 1):
        b.sphere("head", (sx * 0.16, -0.42, 1.1), 0.1, (1, 0.6, 1), "#FF3B3B")
    b.box("head", (0, -0.43, 1.1), (0.4, 0.05, 0.05), "#1E1E24")
    b.cyl("head", (0.05, 0, 1.45), 0.34, 0.1, "#7A2B2B")
    for k in range(5):
        b.box("spine", (-0.2 + k * 0.1, 0.3, 0.5 + 0.05 * (k % 2)), (0.14, 0.04, 0.3), "#5C7A3A", rot=(0, 0, 0.5 * (k - 2) * 0.3))


def spec_blinker(b):
    """Phase assassin: thin, cloaked in torn strips, a glowing eye slit and a dagger in each hand."""
    body_parts(b, "#D8E2FF", "#3A3F8C", slim=0.78, head_k=0.9, belt="#1E2255", glove="#10123A")
    b.sphere("head", (0, 0.02, 1.07), 0.48, (1.05, 1.05, 1.0), "#232766")
    b.box("head", (0, -0.43, 1.06), (0.34, 0.05, 0.06), "#5FF2FF")
    for k, (x, z, h) in enumerate(((-0.2, 0.5, 0.7), (0.0, 0.46, 0.9), (0.2, 0.5, 0.75), (-0.1, 0.4, 0.55))):
        b.box("spine", (x, 0.34, z), (0.14, 0.05, h), "#4A52B8", rot=(0.2, 0, 0))
    b.cyl("spine", (0, -0.1, 0.78), 0.4, 0.1, "#5FF2FF", r2=0.34)
    for sx in (-1, 1):
        side = "L" if sx == 1 else "R"
        b.cyl("hand." + side, (sx * 0.38, -0.1, 0.3), 0.04, 0.42, "#C8F4FF", rot=(2.4, 0, 0), r2=0.0)
        b.box("hand." + side, (sx * 0.38, -0.02, 0.4), (0.07, 0.06, 0.16), "#10123A")


def spec_magnetar(b):
    """Magnet golem: a riveted steel body with a big horseshoe magnet for a crown, red and blue poles."""
    body_parts(b, "#C8D0DC", "#7A8494", slim=1.2, head_k=0.78, belt="#363E4C", glove="#2B323E")
    b.sphere("head", (0, 0, 1.07), 0.42, (1, 1, 0.9), "#9AA4B4")
    b.box("head", (0, -0.4, 1.06), (0.46, 0.06, 0.1), "#FFE56A")
    b.box("head", (0, 0, 1.78), (0.82, 0.22, 0.2), "#C9D0DA")
    for sx, tip in ((-1, "#3B7BFF"), (1, "#FF3B3B")):
        b.box("head", (sx * 0.33, 0, 1.52), (0.2, 0.22, 0.5), "#C9D0DA")
        b.box("head", (sx * 0.33, 0, 1.24), (0.22, 0.24, 0.16), tip)
    for sx in (-1, 1):
        for z in (0.45, 0.62):
            b.sphere("spine", (sx * 0.28, -0.22, z), 0.045, (1, 1, 1), "#363E4C")
    b.sphere("spine", (0, -0.3, 0.52), 0.12, (1, 0.5, 1), "#FFE56A")


def spec_flamer(b):
    """Flame trooper: a gas mask, two fuel tanks on the back and a flamethrower with a lit pilot."""
    body_parts(b, "#E8D0C0", "#4A3A36", slim=1.0, belt="#2A2220", glove="#1E1816")
    b.sphere("head", (0, -0.36, 1.0), 0.16, (1, 0.7, 1), "#2E2A2A")
    b.cyl("head", (0, -0.5, 0.96), 0.08, 0.22, "#1E1C1C", rot=(1.57, 0, 0))
    for sx in (-1, 1):
        b.sphere("head", (sx * 0.17, -0.36, 1.12), 0.1, (1, 0.5, 1), "#FFB347")
        b.cyl("spine", (sx * 0.14, 0.33, 0.62), 0.11, 0.6, "#D8412A")
        b.sphere("spine", (sx * 0.14, 0.33, 0.92), 0.11, (1, 1, 0.6), "#D8412A")
    b.cyl("hand.R", (-0.28, -0.4, 0.5), 0.06, 0.8, "#363030", rot=(1.5, 0, 0))
    b.cyl("hand.R", (-0.28, -0.85, 0.5), 0.08, 0.14, "#1E1818", rot=(1.5, 0, 0))
    b.sphere("hand.R", (-0.28, -0.96, 0.5), 0.07, (1, 1, 1.3), "#FFB347")
    b.box("spine", (0, -0.3, 0.55), (0.58, 0.08, 0.1), "#F2A22C")


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


def spec_meteor_lord(b):
    """Meteor lord: scorched rock for shoulders and crown, a molten core glowing through the belly, a rock to throw."""
    body_parts(b, "#3E3A44", "#6E2A1C", slim=1.45, head_k=0.9, belt="#2A1E1E", glove="#2A1E1E")
    rnd = random.Random(21)
    for sx in (-1, 1):
        side = "L" if sx == 1 else "R"
        b.sphere("arm." + side, (sx * 0.58, 0, 0.72), 0.3, (1, 1, 0.9), "#4A4650")
        b.sphere("arm." + side, (sx * 0.6, 0.1, 0.98), 0.17, (1, 1, 1), "#FF7A1F")
    for k in range(7):
        a = 2 * math.pi * k / 7
        b.cyl("head", (0.34 * math.cos(a), 0.34 * math.sin(a), 1.5), 0.08 + rnd.random() * 0.04, 0.34, "#4A4650", r2=0.0)
    b.sphere("spine", (0, -0.3, 0.52), 0.22, (1, 0.55, 1), "#FFB347")
    b.sphere("hand.R", (-0.5, -0.1, 0.6), 0.34, (1, 1, 1), "#4A4650")
    b.sphere("hand.R", (-0.5, -0.38, 0.6), 0.13, (1, 0.5, 1), "#FF7A1F")


def spec_purger(b):
    """Purger: a tall white robe, a halo ring and one huge eye that decides who is judged."""
    body_parts(b, "#F4F0FF", "#E9E4F7", slim=1.1, head_k=0.9, belt="#B7A8E8", glove="#FFFFFF")
    b.cyl("spine", (0, 0, 0.3), 0.5, 0.65, "#F4F0FF", r2=0.27)
    b.torus("head", (0, 0.02, 1.72), 0.42, 0.045, "#FFD84A", major=14, minor=4)
    b.sphere("head", (0, -0.38, 1.08), 0.26, (1.1, 0.4, 1.1), "#FFFFFF")
    b.sphere("head", (0, -0.5, 1.08), 0.13, (1, 0.5, 1), "#D01040")
    b.sphere("head", (0, -0.55, 1.08), 0.06, (1, 0.5, 1), "#1A0A14")
    for sx in (-1, 1):
        b.sphere("spine", (sx * 0.62, 0.05, 0.9), 0.13, (0.6, 0.3, 1.8), "#FFFFFF")
        b.sphere("spine", (sx * 0.78, 0.05, 1.12), 0.1, (0.5, 0.25, 1.6), "#FFFFFF")
    b.cyl("hand.R", (-0.4, -0.08, 0.7), 0.05, 1.5, "#B7A8E8")
    b.box("hand.R", (-0.4, -0.08, 1.45), (0.5, 0.06, 0.34), "#D8DDE8")


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


def acc_crown(b):
    b.cyl("head", (0, 0, 1.5), 0.36, 0.12, "#FFC93C")
    for k in range(5):
        a = 2 * math.pi * k / 5
        b.cyl("head", (0.3 * math.cos(a), 0.3 * math.sin(a), 1.66), 0.08, 0.22, "#FFC93C", r2=0.0)
        b.sphere("head", (0.3 * math.cos(a), 0.3 * math.sin(a), 1.78), 0.05, (1, 1, 1), "#E0405A", seg=6, rings=4)


def acc_horns(b):
    for sx in (-1, 1):
        b.cyl("head", (sx * 0.3, 0.02, 1.58), 0.1, 0.34, "#C8242C", rot=(0, sx * 0.45, 0), r2=0.03)
        b.cyl("head", (sx * 0.4, 0.02, 1.78), 0.06, 0.2, "#C8242C", rot=(0, sx * 0.9, 0), r2=0.0)
    b.torus("head", (0, 0, 1.2), 0.45, 0.05, "#3A2A2E", major=12, minor=4)


def acc_tophat(b):
    b.cyl("head", (0, 0, 1.52), 0.5, 0.06, "#2B2D33")
    b.cyl("head", (0, 0, 1.78), 0.3, 0.46, "#2B2D33")
    b.cyl("head", (0, 0, 1.6), 0.31, 0.1, "#C8242C")


def acc_cowboy(b):
    b.cyl("head", (0, 0, 1.46), 0.62, 0.05, "#B07A45")
    b.cyl("head", (0, 0, 1.62), 0.32, 0.3, "#B07A45", r2=0.26)
    b.cyl("head", (0, 0, 1.52), 0.34, 0.07, "#7A4A28")
    for sx in (-1, 1):
        b.box("head", (sx * 0.55, 0, 1.5), (0.12, 0.5, 0.04), "#B07A45", rot=(0, sx * 0.3, 0))


def acc_ninja(b):
    b.torus("head", (0, 0, 1.22), 0.46, 0.07, "#FFFFFF", tint=True, major=12, minor=4)
    b.box("head", (0, -0.45, 1.22), (0.26, 0.06, 0.2), "#C8C8D0")           # plate
    b.box("head", (0.18, 0.5, 1.15), (0.1, 0.5, 0.05), "#FFFFFF", tint=True, rot=(0.6, 0, 0.25))
    b.box("head", (-0.1, 0.5, 1.1), (0.1, 0.45, 0.05), "#FFFFFF", tint=True, rot=(0.7, 0, -0.2))


def acc_mohawk(b):
    for k in range(6):
        y = -0.3 + k * 0.12
        b.cyl("head", (0, y, 1.55 - abs(k - 2.5) * 0.03), 0.07, 0.3 - abs(k - 2.5) * 0.03, "#FF4F9A", r2=0.0)


def acc_bunny(b):
    b.torus("head", (0, 0, 1.2), 0.45, 0.05, "#F4F0E6", major=12, minor=4)
    for sx in (-1, 1):
        b.sphere("head", (sx * 0.2, 0.05, 1.82), 0.13, (0.6, 0.5, 2.0), "#F4F0E6", seg=8, rings=5)
        b.sphere("head", (sx * 0.2, -0.02, 1.82), 0.07, (0.5, 0.4, 1.6), "#FFB0C8", seg=6, rings=4)


def acc_visor(b):
    b.torus("head", (0, 0, 1.1), 0.47, 0.04, "#2B2D33", major=12, minor=4)
    b.box("head", (0, -0.45, 1.1), (0.7, 0.1, 0.18), "#35D6FF")
    b.box("head", (0.38, -0.2, 1.1), (0.08, 0.4, 0.14), "#2B2D33")
    b.box("head", (-0.38, -0.2, 1.1), (0.08, 0.4, 0.14), "#2B2D33")


def acc_pirate(b):
    black, gold = "#26262E", "#E8B83A"
    b.sphere("head", (0, 0, 1.33), 0.5, (1, 1, 0.55), black, seg=8, rings=4)
    b.cyl("head", (0, 0, 1.38), 0.56, 0.06, black)
    for k in range(3):                       # three folded-up brim flaps (tricorn)
        a = math.radians(-90 + k * 120)
        b.box("head", (0.4 * math.cos(a), 0.4 * math.sin(a), 1.44), (0.34, 0.42, 0.08), "#3A3A44", rot=(0, -0.22, a))
    b.torus("head", (0, 0, 1.3), 0.5, 0.035, gold, major=10, minor=4)
    b.sphere("head", (0, -0.62, 1.5), 0.13, (1, 0.6, 0.95), "#F4F0E6", seg=7, rings=4)       # skull badge
    b.box("head", (0, -0.64, 1.4), (0.09, 0.07, 0.06), "#F4F0E6")
    for sx in (-1, 1):
        b.box("head", (sx * 0.04, -0.68, 1.51), (0.04, 0.03, 0.04), black)


def acc_wizard(b):
    purple, gold = "#5B3FA6", "#FFC93C"
    b.cyl("head", (0, 0, 1.43), 0.62, 0.05, purple)
    b.cyl("head", (0, 0, 1.6), 0.36, 0.3, purple, r2=0.25)
    b.cyl("head", (0, 0, 1.52), 0.38, 0.08, "#2B2F7A")
    b.cyl("head", (0, 0.02, 1.98), 0.25, 0.5, purple, r2=0.1, rot=(-0.12, 0, 0))
    b.cyl("head", (0, 0.1, 2.28), 0.1, 0.22, purple, r2=0.0, rot=(-0.35, 0, 0))
    for (x, z, s) in ((0.1, 1.85, 1.0), (-0.12, 1.65, 0.8)):
        b.box("head", (x, -0.3, z), (0.12 * s, 0.03, 0.12 * s), gold)
        b.box("head", (x, -0.3, z), (0.12 * s, 0.03, 0.12 * s), gold, rot=(0, math.pi / 4, 0))


def acc_viking(b):
    steel, bone = "#8C97A5", "#F3E3C3"
    b.sphere("head", (0, 0, 1.2), 0.5, (1, 1, 0.7), steel)
    b.torus("head", (0, 0, 1.18), 0.5, 0.05, "#B07A45", major=12, minor=4)
    b.box("head", (0, -0.5, 1.12), (0.1, 0.05, 0.3), steel)
    for sx in (-1, 1):
        b.cyl("head", (sx * 0.52, 0, 1.28), 0.11, 0.3, bone, rot=(0, sx * 1.0, 0), r2=0.08)
        b.cyl("head", (sx * 0.72, 0, 1.52), 0.08, 0.3, bone, rot=(0, sx * 0.35, 0), r2=0.0)


def acc_santa(b):
    red, white = "#D32F2F", "#FFFFFF"
    b.sphere("head", (0, 0, 1.25), 0.5, (1, 1, 0.65), red)
    b.cyl("head", (0, 0.1, 1.58), 0.3, 0.4, red, r2=0.1, rot=(-0.55, 0, 0))
    b.torus("head", (0, 0, 1.17), 0.49, 0.08, white, major=12, minor=4)
    b.sphere("head", (0, 0.36, 1.78), 0.13, (1, 1, 1), white, seg=8, rings=5)


def acc_chef(b):
    white = "#FAFAFA"
    b.cyl("head", (0, 0, 1.47), 0.4, 0.2, white, r2=0.38)
    b.cyl("head", (0, 0, 1.67), 0.38, 0.2, "#EDEDED", r2=0.4)
    b.sphere("head", (0, 0, 1.95), 0.33, (1, 1, 0.85), white, seg=8, rings=4)
    for (x, y) in ((0.3, 0.0), (-0.3, 0.0), (0.0, 0.3), (0.0, -0.3)):
        b.sphere("head", (x, y, 1.82), 0.2, (1, 1, 0.9), white, seg=8, rings=4)


def acc_astronaut(b):
    b.sphere("head", (0, 0, 1.07), 0.54, (1, 1, 0.92), "#F4F6FA")
    b.sphere("head", (0, -0.36, 1.1), 0.42, (1.0, 0.55, 0.85), "#2F9BFF", seg=10, rings=6)
    b.sphere("head", (0.14, -0.55, 1.26), 0.07, (1, 0.4, 0.7), "#BFE6FF", seg=6, rings=4)
    b.torus("head", (0, 0, 0.82), 0.44, 0.07, "#9AA3B2", major=12, minor=4)
    b.cyl("head", (0.35, 0.2, 1.52), 0.025, 0.28, "#9AA3B2", r2=0.025)
    b.sphere("head", (0.35, 0.2, 1.68), 0.06, (1, 1, 1), "#E0405A", seg=6, rings=4)


def acc_cat(b):
    band = "#2B2D33"
    b.torus("head", (0, 0, 1.24), 0.45, 0.05, band, major=12, minor=4)
    old = b.cylseg
    b.cylseg = 4
    for sx in (-1, 1):
        b.cyl("head", (sx * 0.28, 0.02, 1.6), 0.21, 0.42, "#3A3A44", r2=0.0, rot=(0, sx * 0.3, math.pi / 4))
        b.cyl("head", (sx * 0.28, -0.08, 1.56), 0.13, 0.3, "#FF8FB8", r2=0.0, rot=(0, sx * 0.3, math.pi / 4))
    b.cylseg = old


def acc_halo(b):
    b.torus("head", (0, 0, 1.85), 0.32, 0.06, "#FFE14A", major=14, minor=5)
    b.torus("head", (0, 0, 1.85), 0.32, 0.03, "#FFF6B0", major=14, minor=4, scale=(1, 1, 1.0))


def acc_alien(b):
    for sx in (-1, 1):
        b.cyl("head", (sx * 0.18, 0, 1.68), 0.03, 0.42, "#6AAA3A", rot=(0, sx * 0.35, 0), r2=0.03)
        b.sphere("head", (sx * 0.27, 0, 1.92), 0.11, (1, 1, 1), "#8CFF5A", seg=8, rings=5)
    b.torus("head", (0, 0, 1.4), 0.3, 0.05, "#6AAA3A", major=10, minor=4)
    b.sphere("head", (0, 0, 1.46), 0.2, (1, 1, 0.5), "#6AAA3A", seg=8, rings=4)


def acc_gasmask(b):
    dk, rub = "#3F4A3C", "#1F2420"
    b.sphere("head", (0, -0.27, 0.93), 0.33, (1, 0.8, 0.85), dk)
    for sx in (-1, 1):
        b.cyl("head", (sx * 0.17, -0.5, 0.88), 0.11, 0.16, "#5C6B58", rot=(math.pi / 2, 0, 0))
        b.cyl("head", (sx * 0.17, -0.6, 0.88), 0.08, 0.06, rub, rot=(math.pi / 2, 0, 0))
        b.cyl("head", (sx * 0.2, -0.4, 1.13), 0.1, 0.06, "#F2A93B", rot=(math.pi / 2, 0, 0))
    b.torus("head", (0, 0, 1.08), 0.47, 0.03, rub, major=12, minor=4)


def acc_beanie(b):
    b.sphere("head", (0, 0, 1.22), 0.5, (1, 1, 0.62), "#FFFFFF", tint=True)
    b.torus("head", (0, 0, 1.15), 0.49, 0.09, "#FFFFFF", tint=True, major=12, minor=4)
    b.sphere("head", (0, 0, 1.58), 0.14, (1, 1, 1), "#F4F0E6", seg=8, rings=5)


def acc_samurai(b):
    dark, red, gold = "#2E2F38", "#A8262C", "#E8B83A"
    b.sphere("head", (0, 0, 1.22), 0.5, (1, 1, 0.7), dark)
    b.cyl("head", (0, 0, 1.12), 0.62, 0.1, red, r2=0.52)       # flared neck guard
    b.box("head", (0, -0.5, 1.3), (0.5, 0.1, 0.07), red, rot=(0.25, 0, 0))
    b.cyl("head", (0, 0, 1.55), 0.12, 0.08, gold)
    for k in range(7):                                         # crescent crest
        th = math.radians(175 + k * 32)
        b.box("head", (0.32 * math.cos(th), -0.42, 1.68 + 0.32 * math.sin(th)), (0.17, 0.05, 0.09), gold, rot=(0, -(th + math.pi / 2), 0))
    b.box("head", (0, -0.42, 1.52), (0.08, 0.05, 0.14), gold)


def acc_shades(b):
    for sx in (-1, 1):
        b.box("head", (sx * 0.2, -0.44, 1.1), (0.27, 0.08, 0.17), "#15171D", rot=(0, 0, sx * 0.1))
        b.box("head", (sx * 0.27, -0.48, 1.15), (0.07, 0.02, 0.03), "#8FE0FF")
        b.box("head", (sx * 0.4, -0.27, 1.12), (0.04, 0.3, 0.04), "#15171D")
    b.box("head", (0, -0.44, 1.12), (0.14, 0.06, 0.05), "#15171D")


def acc_flowers(b):
    b.torus("head", (0, 0, 1.2), 0.45, 0.035, "#4E9B3E", major=10, minor=4)
    cols = ["#FF6FA5", "#FFFFFF", "#FFD23A", "#B07CFF", "#FF9A3C", "#FF5252"]
    for k in range(6):
        a = 2 * math.pi * k / 6 - math.pi / 2
        c = cols[k]
        p = (0.46 * math.cos(a), 0.46 * math.sin(a), 1.23)
        b.sphere("head", p, 0.1, (1, 1, 0.7), c, seg=6, rings=4)
        b.box("head", (p[0] * 1.07, p[1] * 1.07, p[2]), (0.05, 0.05, 0.05), "#FFD23A" if c != "#FFD23A" else "#FFFFFF")


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
    ("crawler", spec_crawler, 1.1, "grunt", 1.5),
    ("leaper", spec_leaper, 1.35, "tank", 1.5),
    ("bloater", spec_bloater, 1.9, "tank", 1.5),
    ("screamer", spec_screamer, 1.3, "tank", 1.5),
    ("acider", spec_acider, 1.35, "special", 1.5),
    ("rammer", spec_rammer, 1.9, "special", 1.5),
    ("mortar", spec_mortar, 1.4, "special", 1.5),
    ("sledge", spec_sledge, 2.2, "special", 1.5),
    ("lamper", spec_lamper, 1.6, "special", 1.5),
    ("reviver", spec_reviver, 1.5, "special", 1.5),
    ("marksman", spec_marksman, 1.4, "special", 1.5),
    ("blinker", spec_blinker, 1.15, "special", 1.5),
    ("magnetar", spec_magnetar, 2.0, "special", 1.5),
    ("flamer", spec_flamer, 1.4, "special", 1.5),
    ("boss_dev_grunt", spec_dev_grunt, 3.0, "boss", 1.7),
    ("boss_kral_tank", spec_kral_tank, 4.0, "boss", 1.7),
    ("boss_sayaci_ana", spec_sayaci_ana, 3.5, "boss", 1.7),
    ("boss_suru_lideri", spec_suru_lideri, 2.5, "boss", 1.7),
    ("boss_meteor_lord", spec_meteor_lord, 3.6, "boss", 1.7),
    ("boss_purger", spec_purger, 3.4, "boss", 1.7),
    ("acc_bandana", acc_bandana, 1.5, "acc", 1.5),
    ("acc_headphones", acc_headphones, 1.5, "acc", 1.5),
    ("acc_helmet", acc_helmet, 1.5, "acc", 1.5),
    ("acc_cap", acc_cap, 1.5, "acc", 1.5),
    ("acc_goggles", acc_goggles, 1.5, "acc", 1.5),
    ("acc_crown", acc_crown, 1.5, "acc", 1.5),
    ("acc_horns", acc_horns, 1.5, "acc", 1.5),
    ("acc_tophat", acc_tophat, 1.5, "acc", 1.5),
    ("acc_cowboy", acc_cowboy, 1.5, "acc", 1.5),
    ("acc_ninja", acc_ninja, 1.5, "acc", 1.5),
    ("acc_mohawk", acc_mohawk, 1.5, "acc", 1.5),
    ("acc_bunny", acc_bunny, 1.5, "acc", 1.5),
    ("acc_visor", acc_visor, 1.5, "acc", 1.5),
    ("acc_pirate", acc_pirate, 1.5, "acc", 1.5),
    ("acc_wizard", acc_wizard, 1.5, "acc", 1.5),
    ("acc_viking", acc_viking, 1.5, "acc", 1.5),
    ("acc_santa", acc_santa, 1.5, "acc", 1.5),
    ("acc_chef", acc_chef, 1.5, "acc", 1.5),
    ("acc_astronaut", acc_astronaut, 1.5, "acc", 1.5),
    ("acc_cat", acc_cat, 1.5, "acc", 1.5),
    ("acc_halo", acc_halo, 1.5, "acc", 1.5),
    ("acc_alien", acc_alien, 1.5, "acc", 1.5),
    ("acc_gasmask", acc_gasmask, 1.5, "acc", 1.5),
    ("acc_beanie", acc_beanie, 1.5, "acc", 1.5),
    ("acc_samurai", acc_samurai, 1.5, "acc", 1.5),
    ("acc_shades", acc_shades, 1.5, "acc", 1.5),
    ("acc_flowers", acc_flowers, 1.5, "acc", 1.5),
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
        b = Builder(cid, S, fixed, tint, LOW if budget in ("grunt", "runner", "tank", "exploder", "spitter", "shielder", "spawner", "special") else HIGH)
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
    bx = [-9.0 + 3.6 * i for i in range(6)]
    for i, cid in enumerate(["boss_dev_grunt", "boss_kral_tank", "boss_sayaci_ana", "boss_suru_lideri", "boss_meteor_lord", "boss_purger"]):
        if cid in made:
            made[cid][1].location = (bx[i], 11.5, 0)
    # anything else that was made (the newer enemies) goes in rows of five
    std = {"player_base", "grunt", "runner", "tank", "exploder", "spitter", "shielder", "spawner", "boss_dev_grunt", "boss_kral_tank", "boss_sayaci_ana", "boss_suru_lideri"} | set(accs)
    extra = [c for c in made if c not in std and not c.startswith("acc_")]
    for i, cid in enumerate(extra):
        made[cid][1].location = (-6.4 + 3.2 * (i % 5) - (len(extra) <= 5) * 0, 5.0 + 5.0 * (i // 5) - (6.0 if pb else 4.0) * (len(extra) > 0 and not pb), 0)
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
