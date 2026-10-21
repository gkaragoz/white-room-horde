"""Render the upgrade card illustrations: one small low-poly toy diorama per card (docs/DESIGN.md section 9).

  blender -b --factory-startup --python tools/blender/make_cards.py                 all cards
  ONLY=damage,crit blender -b --factory-startup --python tools/blender/make_cards.py
  OUT_DIR=some/dir ...                                                              default packages/client/public/cards
  SHEET=contact.png ...                                                             also write a contact sheet of the renders

Every card is built from a handful of primitives in the game's flat-shaded toy look and rendered with a transparent
background at 256x256 (the UI puts it on a rarity coloured plate). Decorations that face the viewer sit at negative Y,
the camera looks from the front-right. The 50 universal cards and the wide LEVEL UP badge (ONLY=levelup,
-> public/ui/levelup.png, 512x192) live in the last batch; their PNGs were palette-quantized (96 colours, ~8 KB each) after rendering. The script checks that each image really has content and fails otherwise.
"""
import bpy, bmesh, os, math, sys
from mathutils import Vector, Euler

HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/make_cards.py")))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.environ.get("OUT_DIR") or os.path.join(REPO, "packages", "client", "public", "cards")
UI_DIR = os.path.join(REPO, "packages", "client", "public", "ui")
WIDE = {"levelup": (512, 192)}  # non-card art: name -> pixel size, written to public/ui (or OUT_DIR)
ONLY = [x for x in os.environ.get("ONLY", "").split(",") if x] or None
SIZE = 256


def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c] + [1.0]


_mats = {}


def mat(hex_color, rough=0.55, metal=0.0, emit=0.0):
    key = (hex_color, rough, metal, emit)
    if key not in _mats:
        m = bpy.data.materials.new("m_" + hex_color.lstrip("#") + str(len(_mats)))
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = lin(hex_color)
        b.inputs["Roughness"].default_value = rough
        b.inputs["Metallic"].default_value = metal
        if emit:
            b.inputs["Emission Color"].default_value = lin(hex_color)
            b.inputs["Emission Strength"].default_value = emit
        _mats[key] = m
    return _mats[key]


# palette
CREAM, BRASS, RED, ORANGE, YELLOW, GREEN, BLUE, STEEL, DARK, WHITE, PINK, PURPLE, OLIVE = (
    "#f3e9d6", "#d9a441", "#d8362e", "#ff8a2a", "#ffd23a", "#47b86a", "#2f8fe8", "#aeb6c4", "#3a352d", "#fffaf0", "#ff6b9a", "#9a63ff", "#6e7a45",
)

coll = None


def reset():
    global coll
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    coll = bpy.context.scene.collection


def _finish(name, bm, m, loc, rot, scale, bevel):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(m)
    for p in mesh.polygons:
        p.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    obj.location = Vector(loc)
    obj.rotation_euler = Euler([math.radians(a) for a in rot], "XYZ")
    obj.scale = Vector(scale)
    if bevel:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
    return obj


def box(sx, sy, sz, m, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.025):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((sx, sy, sz)), verts=bm.verts)
    return _finish("box", bm, m, loc, rot, (1, 1, 1), bevel)


def cyl(r, h, m, loc=(0, 0, 0), rot=(0, 0, 0), verts=14, r2=None, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=h)
    return _finish("cyl", bm, m, loc, rot, (1, 1, 1), bevel)


def sphere(r, m, loc=(0, 0, 0), scale=(1, 1, 1), seg=12, rings=8):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    return _finish("sphere", bm, m, loc, (0, 0, 0), scale, 0.0)


def torus(R, r, m, loc=(0, 0, 0), rot=(0, 0, 0), maj=24, mnr=8, arc=360.0):
    """A ring (or an arc of one) lying in the XY plane."""
    bm = bmesh.new()
    n = max(3, int(maj * arc / 360.0))
    rings = []
    for i in range(n + (1 if arc < 360 else 0)):
        a = math.radians(arc) * i / n
        ring = []
        for j in range(mnr):
            b = 2 * math.pi * j / mnr
            x = (R + r * math.cos(b)) * math.cos(a)
            y = (R + r * math.cos(b)) * math.sin(a)
            ring.append(bm.verts.new((x, y, r * math.sin(b))))
        rings.append(ring)
    count = len(rings) if arc < 360 else n
    for i in range(count - (1 if arc < 360 else 0)):
        a_ring, b_ring = rings[i], rings[(i + 1) % len(rings)]
        for j in range(mnr):
            bm.faces.new((a_ring[j], a_ring[(j + 1) % mnr], b_ring[(j + 1) % mnr], b_ring[j]))
    return _finish("torus", bm, m, loc, rot, (1, 1, 1), 0.0)


def prism(points, depth, m, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.02):
    """Extrude a 2D outline (list of (x, y)) along Z, centred on Z = 0."""
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, -depth / 2)) for x, y in points]
    face = bm.faces.new(verts)
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    top = [v for v in res["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((0, 0, depth)), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _finish("prism", bm, m, loc, rot, (1, 1, 1), bevel)


def star_points(n, r_out, r_in):
    pts = []
    for i in range(n * 2):
        a = math.pi / n * i + math.pi / 2
        r = r_out if i % 2 == 0 else r_in
        pts.append((r * math.cos(a), r * math.sin(a)))
    return pts


def bullet(m_body, m_tip, loc=(0, 0, 0), rot=(0, 0, 0), s=1.0):
    """A bullet standing along Z."""
    cyl(0.22 * s, 0.7 * s, m_body, (loc[0], loc[1], loc[2] + 0.35 * s), rot, 14)
    cyl(0.22 * s, 0.45 * s, m_tip, (loc[0], loc[1], loc[2] + 0.92 * s), rot, 14, r2=0.02 * s)
    cyl(0.25 * s, 0.1 * s, m_tip, (loc[0], loc[1], loc[2] + 0.02 * s), rot, 14)


def burst(m, center=(0, 0, 0), n=9, r_in=0.9, r_out=1.5, thick=0.25, tilt=0):
    """Spiky explosion shape in the XZ plane behind an object."""
    pts = []
    for i in range(n * 2):
        a = math.pi / n * i
        r = r_out if i % 2 == 0 else r_in
        pts.append((r * math.cos(a), r * math.sin(a)))
    return prism(pts, thick, m, center, (90 + tilt, 0, 0), bevel=0.0)


# ------------------------------------------------------------------------------------------------ icons

def icon_damage():
    burst(mat(ORANGE, emit=0.3), (0, 0.5, 0.7), 10, 0.85, 1.45)
    burst(mat(YELLOW, emit=0.4), (0, 0.3, 0.7), 10, 0.5, 1.0)
    bullet(mat(BRASS, 0.3, 0.9), mat(RED, 0.4), (0, 0, -0.5), (0, 0, 0), 1.15)


def icon_rate():
    bolt = [(0.15, 1.0), (-0.55, 0.0), (-0.1, 0.0), (-0.3, -1.0), (0.55, 0.1), (0.05, 0.1), (0.4, 1.0)]
    prism(bolt, 0.35, mat(YELLOW, 0.4, emit=0.25), (0, 0, 0.1), (90, 0, 0))
    for i in range(3):
        bullet(mat(BRASS, 0.3, 0.9), mat(RED), (-0.6 + i * 0.6, 0.0, -0.9), (0, 0, 0), 0.5)


def icon_speed():
    # running shoe with speed streaks and a little wing
    box(1.7, 0.75, 0.28, mat(WHITE), (0, 0, -0.55), bevel=0.04)
    box(1.1, 0.7, 0.75, mat(BLUE), (-0.28, 0, -0.08))
    box(0.75, 0.68, 0.5, mat("#52a8f0"), (0.55, 0, -0.26))
    box(0.45, 0.72, 0.55, mat(WHITE), (-0.75, 0, 0.38))
    box(0.8, 0.05, 0.1, mat(YELLOW), (0.1, -0.38, -0.1), (0, 0, 20), bevel=0.0)
    for k, z in enumerate((-0.5, 0.0, 0.5)):
        box(0.9 - k * 0.1, 0.08, 0.1, mat(YELLOW), (-1.5, -0.2, z), bevel=0.0)
    prism([(0, 0), (0.95, 0.5), (0.35, 0.02), (0.85, -0.22)], 0.1, mat(WHITE), (-0.95, -0.2, 0.55), (90, 0, 150))


def icon_hp():
    r = mat(RED, 0.4)
    sphere(0.62, r, (-0.45, 0, 0.35), seg=14, rings=10)
    sphere(0.62, r, (0.45, 0, 0.35), seg=14, rings=10)
    cyl(1.0, 1.15, r, (0, 0, -0.38), (180, 0, 0), 4, r2=0.05).rotation_euler = Euler((math.radians(180), 0, math.radians(45)), "XYZ")
    box(0.26, 0.16, 0.8, mat(WHITE), (0, -0.62, 0.12), bevel=0.03)
    box(0.8, 0.16, 0.26, mat(WHITE), (0, -0.62, 0.12), bevel=0.03)


def icon_pierce():
    # an arrow drilled straight through a shield
    pts = [(0, 1.1), (0.85, 0.75), (0.85, -0.05), (0.45, -0.75), (0, -1.1), (-0.45, -0.75), (-0.85, -0.05), (-0.85, 0.75)]
    prism(pts, 0.3, mat(BLUE, 0.4), (0, 0, 0), (90, 0, 0), 0.04)
    prism([(x * 0.62, y * 0.62) for x, y in pts], 0.34, mat(STEEL, 0.3, 0.8), (0, -0.03, 0), (90, 0, 0), 0.03)
    cyl(0.07, 3.0, mat(BRASS, 0.5), (0, -0.2, 0.05), (0, 90, 0), 8)
    cyl(0.24, 0.65, mat(RED, 0.4), (1.7, -0.2, 0.05), (0, 90, 0), 10, r2=0.0)
    for dz in (-1, 1):
        prism([(0, 0), (0.55, 0.32 * dz), (0.45, 0.0), (0.55, -0.32 * dz)], 0.05, mat(YELLOW), (-1.2, -0.2, 0.05), (90, 0, 0), 0.0)


def _toy_gun(color, y, z, s=1.0):
    """A chunky toy pistol in side view, facing right, placed at depth y and height z."""
    g = mat(color, 0.45)
    box(1.4 * s, 0.34, 0.46 * s, g, (0.0, y, z), bevel=0.05)
    box(0.9 * s, 0.24, 0.26 * s, mat(DARK, 0.4, 0.5), (1.05 * s, y, z + 0.06 * s), bevel=0.04)
    box(0.34 * s, 0.32, 0.8 * s, g, (-0.4 * s, y, z - 0.55 * s), (0, 12, 0), 0.05)
    box(0.14 * s, 0.2, 0.14 * s, mat(YELLOW), (1.4 * s, y, z + 0.25 * s), bevel=0.02)


def icon_arsenal():
    _toy_gun(GREEN, 0.7, 1.15, 0.9)
    _toy_gun(RED, 0.35, 0.55, 0.95)
    _toy_gun(BLUE, 0.0, -0.1, 1.0)
    burst(mat(YELLOW, emit=0.3), (0.2, 1.0, 0.45), 8, 1.55, 1.9, 0.1)


def icon_heal():
    box(1.9, 1.3, 1.4, mat(WHITE, 0.5), (0, 0, 0), (0, 0, 0), 0.08)
    box(0.5, 0.12, 1.0, mat(RED), (0, -0.68, 0), bevel=0.02)
    box(1.0, 0.12, 0.5, mat(RED), (0, -0.68, 0), bevel=0.02)
    box(0.5, 0.9, 0.2, mat(STEEL, 0.4, 0.8), (0, 0, 0.78), bevel=0.03)
    box(0.5, 0.2, 0.3, mat(STEEL, 0.4, 0.8), (0, -0.45, 0.7), bevel=0.03)
    box(1.9, 0.05, 0.1, mat("#d9d0bd"), (0, -0.66, -0.3), bevel=0.0)


def icon_ammo():
    box(2.1, 1.3, 0.9, mat(OLIVE, 0.6), (0, 0, -0.3), bevel=0.06)
    box(2.15, 1.35, 0.12, mat("#59622f"), (0, 0, 0.18), bevel=0.04)
    for i in range(5):
        bullet(mat(BRASS, 0.3, 0.9), mat(RED), (-0.8 + i * 0.4, 0.0, 0.2), (0, 0, 0), 0.5)
    box(1.0, 0.04, 0.22, mat(YELLOW), (0, 0.67, -0.3), bevel=0.0)


def icon_grenades():
    for off, s in ((-0.55, 1.0), (0.7, 0.85)):
        sphere(0.65 * s, mat(GREEN, 0.5), (off, 0, -0.1), (1, 1, 1.1))
        cyl(0.22 * s, 0.35 * s, mat(STEEL, 0.35, 0.8), (off, 0, 0.7 * s), (0, 0, 0), 10)
        torus(0.28 * s, 0.05 * s, mat(STEEL, 0.4, 0.8), (off + 0.2 * s, 0, 1.0 * s), (90, 0, 0))
        box(0.5 * s, 0.1, 0.12, mat(STEEL, 0.4, 0.8), (off + 0.3 * s, 0, 0.78 * s), (0, 0, 15), 0.01)
        for z in (-0.35, -0.1, 0.15):
            box(1.2 * s, 0.05, 0.05, mat("#2f7e49"), (off, 0.62 * s, z * s), bevel=0.0)


def icon_medic():
    glass = mat("#cfe9ff", 0.1)
    cyl(0.34, 1.7, glass, (0, 0, 0.1), (0, 0, 0), 14)
    cyl(0.36, 0.8, mat(GREEN, 0.3), (0, 0, -0.25), (0, 0, 0), 14)
    cyl(0.42, 0.14, mat(STEEL, 0.4, 0.8), (0, 0, 1.02), (0, 0, 0), 14)
    cyl(0.1, 0.9, mat(STEEL, 0.4, 0.8), (0, 0, 1.45), (0, 0, 0), 10)
    box(0.9, 0.16, 0.12, mat(STEEL, 0.4, 0.8), (0, 0, 1.9))
    cyl(0.035, 0.75, mat(STEEL, 0.2, 1.0), (0, 0, -1.05), (0, 0, 0), 8, r2=0.0)
    cyl(0.55, 0.14, mat(WHITE), (0.95, -0.5, -0.45), (90, 0, 0), 20)
    box(0.2, 0.1, 0.6, mat(GREEN), (0.95, -0.6, -0.45), bevel=0.02)
    box(0.6, 0.1, 0.2, mat(GREEN), (0.95, -0.6, -0.45), bevel=0.02)


def icon_magnet():
    torus(0.78, 0.3, mat(RED, 0.35, 0.3), (0, 0, 0.2), (90, 0, 0), arc=180, maj=28, mnr=10)
    for sx in (-1, 1):
        box(0.64, 0.64, 0.6, mat(STEEL, 0.3, 0.9), (0.78 * sx, 0, -0.38), bevel=0.04)
        box(0.66, 0.66, 0.14, mat(BLUE if sx < 0 else RED, 0.4), (0.78 * sx, 0, -0.18), bevel=0.02)
    for x, z in ((-0.5, -1.25), (0.15, -1.45), (0.6, -1.2), (-0.1, -1.1)):
        sphere(0.13, mat(DARK, 0.4, 0.8), (x, 0.0, z), seg=8, rings=6)


def icon_luck():
    g1, g2 = mat(GREEN, 0.5), mat("#2f9a52", 0.5)
    for ang in (45, 135, 225, 315):
        a = math.radians(ang)
        dx, dz = math.cos(a), math.sin(a)
        px, pz = -dz, dx
        cx, cz = dx * 0.62, dz * 0.62 + 0.45
        for side in (-1, 1):
            sphere(0.4, g1, (cx + px * 0.27 * side + dx * 0.2, 0, cz + pz * 0.27 * side + dz * 0.2), (1, 0.4, 1), seg=12, rings=8)
        box(0.7, 0.05, 0.06, g2, (dx * 0.5, -0.17, dz * 0.5 + 0.45), (0, -ang, 0), 0.0)
    cyl(0.08, 1.2, mat("#2f7e49"), (0.28, 0, -0.5), (0, 0, 14), 8)
    box(0.7, 0.7, 0.7, mat(WHITE, 0.4), (-1.15, -0.2, -1.0), (20, 0, 30), 0.08)
    for p_ in ((-1.15, -0.58, -1.0), (-0.98, -0.52, -1.17), (-1.32, -0.52, -0.83)):
        sphere(0.08, mat(DARK), p_, seg=6, rings=4)


def icon_scholar():
    for sx, rz in ((-1, 8), (1, -8)):
        box(1.0, 1.4, 0.16, mat(PURPLE), (0.52 * sx, 0, -0.5), (75, 0, rz), 0.03)
        box(0.9, 1.25, 0.1, mat(WHITE), (0.5 * sx, 0.1, -0.42), (75, 0, rz))
    prism(star_points(5, 0.6, 0.27), 0.22, mat(YELLOW, 0.35, emit=0.3), (0, 0, 0.9), (90, 0, 0))


def icon_blast():
    burst(mat(RED, emit=0.3), (0, 0.6, 0.2), 12, 1.0, 1.8)
    burst(mat(ORANGE, emit=0.4), (0, 0.4, 0.2), 12, 0.7, 1.35)
    burst(mat(YELLOW, emit=0.5), (0, 0.2, 0.2), 12, 0.4, 0.9)
    sphere(0.55, mat(DARK, 0.4, 0.3), (0, -0.2, -0.05), seg=14, rings=10)
    cyl(0.14, 0.25, mat(STEEL, 0.4, 0.8), (0, -0.2, 0.55))
    sphere(0.1, mat(YELLOW, emit=1.0), (0.18, -0.2, 0.95), seg=6, rings=4)


def icon_quickhands():
    box(0.75, 0.5, 1.5, mat(DARK, 0.45, 0.6), (0, 0, -0.1), (0, 0, 10), 0.05)
    for k in range(4):
        box(0.55, 0.52, 0.18, mat(BRASS, 0.3, 0.8), (0.02 * k, 0, 0.45 - k * 0.3), (0, 0, 10), 0.02)
    torus(1.15, 0.12, mat(BLUE, 0.4), (0, 0.35, 0), (90, 0, 0), arc=270, maj=28, mnr=8)
    cyl(0.3, 0.3, mat(BLUE, 0.4), (1.05, 0.35, 0.55), (0, 0, 90), 3, r2=0.0)


def icon_roll():
    for k in range(3):
        c = mat([BLUE, "#52a8f0", "#8ac4f5"][k], 0.4)
        prism([(0, 0.8), (0.7, 0), (0, -0.8), (-0.28, -0.8), (0.42, 0), (-0.28, 0.8)], 0.3, c, (-0.8 + k * 0.8, 0, 0), (90, 0, 0), bevel=0.02)
    for z in (-0.9, 0.9):
        box(1.6, 0.06, 0.08, mat(STEEL), (-0.3, 0.2, z), bevel=0.0)


def icon_armor():
    pts = [(0, 1.1), (0.85, 0.75), (0.85, -0.05), (0.45, -0.75), (0, -1.1), (-0.45, -0.75), (-0.85, -0.05), (-0.85, 0.75)]
    prism(pts, 0.3, mat(STEEL, 0.3, 0.9), (0, 0, 0), (90, 0, 0), 0.05)
    prism([(x * 0.75, y * 0.75) for x, y in pts], 0.3, mat(BLUE, 0.4), (0, -0.07, 0), (90, 0, 0), 0.03)
    prism(star_points(5, 0.46, 0.2), 0.2, mat(YELLOW, 0.35, emit=0.2), (0, -0.2, 0.05), (90, 0, 0), 0.0)


def icon_crit():
    burst(mat(RED, emit=0.3), (0, 0.5, 0), 16, 0.95, 1.55)
    torus(0.75, 0.1, mat(DARK, 0.4), (0, 0.1, 0), (90, 0, 0))
    torus(0.38, 0.08, mat(DARK, 0.4), (0, 0.1, 0), (90, 0, 0))
    for ang in (0, 90, 180, 270):
        a = math.radians(ang)
        box(0.5, 0.1, 0.1, mat(DARK), (math.cos(a) * 0.75, 0.1, math.sin(a) * 0.75), (0, -ang, 0), 0.0)
    sphere(0.22, mat(YELLOW, emit=0.6), (0, 0.1, 0), seg=10, rings=8)


def icon_sharp():
    cyl(0.5, 1.8, mat(DARK, 0.4, 0.7), (0, 0, 0), (0, 90, 0), 16)
    cyl(0.62, 0.35, mat(STEEL, 0.3, 0.9), (0.95, 0, 0), (0, 90, 0), 16)
    cyl(0.5, 0.1, mat("#9ad0ff", 0.05), (1.14, 0, 0), (0, 90, 0), 16)
    torus(0.35, 0.05, mat(RED, emit=0.8), (1.18, 0, 0), (0, 90, 0))
    cyl(0.4, 0.5, mat(STEEL, 0.3, 0.9), (-0.95, 0, 0), (0, 90, 0), 16, r2=0.3)
    box(0.35, 0.1, 0.35, mat(STEEL, 0.3, 0.9), (0, 0, 0.6))


def icon_sprint():
    for k in range(5):
        a = math.radians(-50 + k * 25)
        sphere(0.9, mat([WHITE, "#f1f6ff", "#e3ecff", "#d3e2ff", "#c0d6ff"][k], 0.5), (math.sin(a) * 0.8 - 0.3, 0, math.cos(a) * 0.8 - 0.4), (0.22, 0.12, 1.1), seg=10, rings=6).rotation_euler = Euler((0, a, 0), "XYZ")
    box(0.18, 0.16, 0.5, mat(YELLOW), (-1.0, 0, -0.9), (0, 0, 0), 0.02)
    for z in (-0.5, 0.0, 0.5):
        box(0.9, 0.06, 0.08, mat(YELLOW), (-1.25, 0.2, z), bevel=0.0)


def icon_bulk():
    box(0.14, 0.14, 2.3, mat(STEEL, 0.3, 0.9), (0, 0, 0), (0, 90, 0), 0.0)
    for sx in (-1, 1):
        cyl(0.7, 0.25, mat(DARK, 0.4, 0.5), (0.95 * sx, 0, 0), (0, 90, 0), 16)
        cyl(0.55, 0.25, mat(DARK, 0.4, 0.5), (0.7 * sx, 0, 0), (0, 90, 0), 16)
        cyl(0.4, 0.18, mat(RED, 0.4), (1.12 * sx, 0, 0), (0, 90, 0), 16)
    for z in (0.55, -0.55):
        box(2.0, 0.05, 0.05, mat(YELLOW), (0, 0.8, z), bevel=0.0)


def icon_vampire():
    drop = mat(RED, 0.25)
    sphere(0.5, drop, (0, 0, -0.75), seg=14, rings=10)
    cyl(0.46, 0.9, drop, (0, 0, -0.1), (0, 0, 0), 14, r2=0.02)
    box(1.7, 0.3, 0.3, mat(PURPLE), (0, 0, 1.0), bevel=0.05)
    for sx in (-1, 1):
        cyl(0.2, 0.95, mat(WHITE, 0.3), (0.55 * sx, 0, 0.45), (180, 0, 0), 10, r2=0.02)


def icon_tempo():
    cyl(0.95, 1.9, mat(CREAM, 0.5), (0, 0, -0.1), (0, 0, 0), 4, r2=0.45).rotation_euler = Euler((0, 0, math.radians(45)), "XYZ")
    box(1.3, 1.3, 0.14, mat(BRASS, 0.35, 0.7), (0, 0, -1.1), bevel=0.04)
    cyl(0.04, 1.9, mat(DARK, 0.4, 0.8), (0.0, 0.62, 0.1), (0, 20, 0), 8)
    box(0.35, 0.22, 0.28, mat(RED), (-0.25, 0.62, 0.7), (0, 20, 0), 0.03)
    sphere(0.14, mat(YELLOW, emit=0.4), (0.0, 0.68, 0.95), seg=8, rings=6)


def icon_marksman():
    for r, c in ((1.15, WHITE), (0.85, RED), (0.55, WHITE), (0.25, RED)):
        cyl(r, 0.14 + (1.15 - r) * 0.08, mat(c, 0.5), (0, 0, 0), (90, 0, 0), 28)
    # a bullet stuck in the bull's eye, seen from the side
    cyl(0.2, 0.9, mat(BRASS, 0.3, 0.9), (-1.0, -0.35, 0.0), (0, 90, 0), 14)
    cyl(0.2, 0.5, mat(DARK, 0.3), (-0.3, -0.35, 0.0), (0, 90, 0), 14, r2=0.03)
    cyl(0.23, 0.1, mat(BRASS, 0.3, 0.9), (-1.48, -0.35, 0.0), (0, 90, 0), 14)
    for k in (0.5, 0.9):
        box(0.7, 0.05, 0.07, mat(YELLOW), (-1.7 - k * 0.2, -0.3, 0.3 - k * 0.5), bevel=0.0)


def icon_ironskin():
    box(1.9, 0.5, 1.7, mat(STEEL, 0.3, 0.9), (0, 0, 0), (0, 0, 0), 0.14)
    box(1.2, 0.5, 1.0, mat("#8a93a3", 0.3, 0.9), (0, -0.05, 0.05), (0, 0, 0), 0.1)
    box(0.3, 0.52, 1.5, mat(RED), (0, -0.06, 0.0), bevel=0.04)
    for x, z in ((-0.8, 0.68), (0.8, 0.68), (-0.8, -0.68), (0.8, -0.68)):
        sphere(0.11, mat(BRASS, 0.3, 0.8), (x, -0.3, z), seg=8, rings=6)
    for sx in (-1, 1):
        box(0.55, 0.45, 0.4, mat(STEEL, 0.3, 0.9), (1.1 * sx, 0, 0.75), (0, 0, 20 * sx), 0.1)


ICONS = [
    "damage", "rate", "speed", "hp", "pierce", "arsenal", "heal", "ammo", "grenades", "medic", "magnet", "luck", "scholar", "blast",
    "quickhands", "roll", "armor", "crit", "sharp", "sprint", "bulk", "vampire", "tempo", "marksman", "ironskin",
]


# ------------------------------------------------------------------------------------------------ second batch of icons
ICE, ICE2, TEAL, LIME = "#9fe0ff", "#d8f4ff", "#2fd2c0", "#8ef07a"


def glass(hex_color, alpha=0.45, emit=0.0):
    key = ("glass", hex_color, alpha, emit)
    if key not in _mats:
        m = mat(hex_color, 0.15, 0.0, emit)
        m = m.copy()
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Alpha"].default_value = alpha
        try:
            m.surface_render_method = "BLENDED"
        except Exception:
            pass
        _mats[key] = m
    return _mats[key]


def heart_pts(s=1.0, n=26):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x / 17 * s, (y + 2.5) / 17 * s))
    return pts


def spike(m, loc, ang_deg, r=0.14, ln=0.45):
    """A cone in the XZ plane pointing along ang_deg (0 = +X, 90 = up) with its base at loc."""
    a = math.radians(ang_deg)
    c = (loc[0] + math.cos(a) * ln / 2, loc[1], loc[2] + math.sin(a) * ln / 2)
    return cyl(r, ln, m, c, (0, 90 - ang_deg, 0), 8, r2=0.0)


def drop(m, loc, s=1.0):
    sphere(0.14 * s, m, (loc[0], loc[1], loc[2] - 0.05 * s), seg=10, rings=6)
    cyl(0.135 * s, 0.34 * s, m, (loc[0], loc[1], loc[2] + 0.13 * s), (0, 0, 0), 10, r2=0.0)


def icon_regen():
    prism(heart_pts(1.25), 0.42, mat("#3fcf63", 0.4), (0, 0.1, 0.05), (90, 0, 0), 0.05)
    prism(heart_pts(0.95), 0.1, mat("#7bef8d", 0.35, emit=0.15), (0, -0.28, 0.05), (90, 0, 0), 0.02)
    box(0.26, 0.14, 0.78, mat(WHITE), (0, -0.4, 0.05), bevel=0.03)
    box(0.78, 0.14, 0.26, mat(WHITE), (0, -0.4, 0.05), bevel=0.03)
    dm = mat("#6fd8ff", 0.2, emit=0.35)
    drop(dm, (-1.35, -0.1, 0.95), 1.0)
    drop(dm, (1.3, -0.1, 1.05), 0.85)
    drop(dm, (1.45, -0.1, -0.45), 0.7)
    prism(star_points(4, 0.22, 0.07), 0.06, mat(YELLOW, emit=0.5), (-1.45, -0.2, -0.5), (90, 0, 0), 0.0)


def icon_thorns():
    steel, dk = mat(STEEL, 0.3, 0.8), mat("#5d6676", 0.35, 0.8)
    cyl(1.0, 0.3, dk, (0, 0, 0), (90, 0, 0), 20, bevel=0.02)
    torus(0.92, 0.1, steel, (0, -0.1, 0), (90, 0, 0), maj=24, mnr=6)
    cyl(0.62, 0.12, mat(RED, 0.4), (0, -0.19, 0), (90, 0, 0), 20)
    cyl(0.3, 0.2, steel, (0, -0.28, 0), (90, 0, 0), 14, r2=0.22)
    sp = mat("#ffe39a", 0.3, 0.3, emit=0.2)
    cyl(0.17, 0.62, sp, (0, -0.66, 0), (90, 0, 0), 8, r2=0.0)
    for k in range(10):
        a = k * 36
        spike(sp, (math.cos(math.radians(a)) * 0.95, 0, math.sin(math.radians(a)) * 0.95), a, 0.16, 0.5)
    for k in range(5):
        a = math.radians(18 + k * 72)
        cyl(0.11, 0.38, sp, (math.cos(a) * 0.55, -0.4, math.sin(a) * 0.55), (90, 0, 0), 8, r2=0.0)


def icon_shock():
    torus(1.15, 0.13, mat("#3ca0ff", 0.3, emit=0.8), (0, 0.15, 0), (90, 0, 0), maj=28, mnr=8)
    torus(0.9, 0.05, mat("#bfe6ff", 0.3, emit=0.6), (0, 0.1, 0), (90, 0, 0), maj=28, mnr=6)
    bolt = [(0.2, 1.15), (-0.7, -0.05), (-0.12, -0.05), (-0.35, -1.15), (0.7, 0.2), (0.1, 0.2), (0.5, 1.15)]
    prism(bolt, 0.4, mat(YELLOW, 0.4, emit=0.45), (0, -0.05, 0.02), (90, 0, 0), 0.04)
    prism([(x * 0.55 + 0.04, y * 0.62) for x, y in bolt], 0.14, mat("#fff7c2", 0.4, emit=0.8), (0, -0.28, 0.0), (90, 0, 0), 0.02)
    for (x, z, s) in ((-1.45, 0.9, 0.3), (1.45, -0.85, 0.3), (1.35, 1.0, 0.2), (-1.4, -0.9, 0.22)):
        prism(star_points(4, s, s * 0.3), 0.06, mat("#9fd4ff", emit=0.8), (x, -0.1, z), (90, 0, 0), 0.0)


def icon_volatile():
    sphere(0.95, mat("#2f2b3d", 0.35, 0.3), (0, 0, -0.25), seg=16, rings=12)
    torus(0.93, 0.05, mat(RED, 0.4, emit=0.8), (0, 0, -0.25), (90, 0, 0), maj=24, mnr=6)
    cyl(0.26, 0.3, mat(STEEL, 0.4, 0.8), (0, 0, 0.78), (0, 0, 0), 12)
    cyl(0.04, 0.5, mat("#8a6a3a", 0.6), (0.12, 0, 1.1), (0, 0, -25), 6)
    sphere(0.14, mat(YELLOW, emit=1.2), (0.25, 0, 1.38), seg=8, rings=6)
    prism(star_points(4, 0.34, 0.1), 0.06, mat(ORANGE, emit=1.0), (0.25, -0.02, 1.38), (90, 0, 0), 0.0)
    bone = mat("#f4f0e6", 0.5)
    sphere(0.42, bone, (0, -0.74, -0.12), (1.0, 0.45, 0.88), seg=12, rings=8)
    box(0.34, 0.2, 0.2, bone, (0, -0.84, -0.46), bevel=0.02)
    for sx in (-1, 1):
        sphere(0.11, mat("#16131c", 0.4), (sx * 0.16, -0.9, -0.08), (1, 0.4, 1.1), seg=8, rings=6)
    box(0.07, 0.04, 0.1, mat("#16131c"), (0, -0.95, -0.27), bevel=0.0)


def icon_frost():
    ic, ic2 = mat(ICE, 0.15, 0.1, emit=0.25), mat(ICE2, 0.15, 0.0, emit=0.3)
    for k in range(6):
        a = 90 + k * 60
        ar = math.radians(a)
        box(1.5, 0.2, 0.2, ic, (math.cos(ar) * 0.75, 0, math.sin(ar) * 0.75), (0, -a, 0), 0.03)
        for f, sgn in ((0.95, 1), (0.95, -1), (0.55, 1), (0.55, -1)):
            ba = a + sgn * 55
            br = math.radians(ba)
            bx, bz = math.cos(ar) * f, math.sin(ar) * f
            ln = 0.5 if f > 0.8 else 0.36
            box(ln, 0.17, 0.17, ic2, (bx + math.cos(br) * ln / 2, 0, bz + math.sin(br) * ln / 2), (0, -ba, 0), 0.02)
        prism([(0, 0.0), (0.12, 0.2), (0, 0.4), (-0.12, 0.2)], 0.18, ic2, (math.cos(ar) * 1.55, 0, math.sin(ar) * 1.55), (90, 90 - a, 0), 0.0)
    cyl(0.34, 0.3, mat("#ffffff", 0.2, emit=0.4), (0, -0.05, 0), (90, 0, 0), 6, bevel=0.02)
    cyl(0.18, 0.34, mat("#5fb8f5", 0.2, emit=0.4), (0, -0.07, 0), (90, 0, 0), 6)


def icon_scavenger():
    box(1.35, 0.9, 0.7, mat(OLIVE, 0.6), (0, 0.15, -0.2), bevel=0.06)
    box(1.4, 0.95, 0.1, mat("#59622f"), (0, 0.15, 0.18), bevel=0.03)
    for i in range(4):
        bullet(mat(BRASS, 0.3, 0.9), mat(RED), (-0.42 + i * 0.28, 0.15, 0.2), (0, 0, 0), 0.34)
    box(0.7, 0.04, 0.16, mat(YELLOW), (0, -0.33, -0.2), bevel=0.0)
    gm = mat("#46d46b", 0.35, emit=0.15)
    for start in (30, 210):
        torus(1.35, 0.12, gm, (0, -0.45, 0.0), (90, -start, 0), maj=30, mnr=8, arc=125)
        e = math.radians(start + 125)
        tx, tz = -math.sin(e), math.cos(e)
        px, pz = math.cos(e) * 1.35, math.sin(e) * 1.35
        cyl(0.3, 0.5, gm, (px + tx * 0.18, -0.45, pz + tz * 0.18), (0, math.degrees(math.atan2(tx, tz)), 0), 3, r2=0.0)


def icon_adrenaline():
    before = set(coll.objects)
    cyl(0.46, 1.8, mat("#e4f1ff", 0.15), (0, 0, 0.1), (0, 0, 0), 14)
    cyl(0.48, 1.15, mat("#ff5a00", 0.25, emit=0.6), (0, 0, -0.22), (0, 0, 0), 14)
    cyl(0.56, 0.14, mat(STEEL, 0.4, 0.8), (0, 0, 1.05), (0, 0, 0), 14)
    box(1.3, 0.2, 0.16, mat(STEEL, 0.4, 0.8), (0, 0, 1.12))
    cyl(0.13, 0.9, mat(STEEL, 0.4, 0.8), (0, 0, 1.55), (0, 0, 0), 10)
    cyl(0.42, 0.14, mat(DARK, 0.4, 0.5), (0, 0, 2.05), (0, 0, 0), 14)
    cyl(0.52, 0.2, mat(STEEL, 0.4, 0.8), (0, 0, -0.9), (0, 0, 0), 14, r2=0.12)
    cyl(0.06, 0.8, mat(STEEL, 0.2, 1.0), (0, 0, -1.4), (0, 0, 0), 8, r2=0.0).rotation_euler.x = math.radians(180)
    for z in (0.3, 0.6, 0.9):
        box(0.26, 0.05, 0.06, mat(DARK), (0.3, -0.47, z - 0.5), bevel=0.0)
    new = [o for o in coll.objects if o not in before]
    rotate_group(new, -32)
    for o in new:
        o.location.x -= 0.2
    om = mat("#ff9a2a", 0.2, emit=1.6)
    for (x, z, s) in ((1.3, -1.0, 0.16), (1.7, -0.4, 0.11), (0.9, -1.55, 0.1)):
        drop(om, (x, -0.1, z), s * 4.5)
    for k, a in enumerate((20, 50, 80)):
        ar = math.radians(a)
        box(0.5, 0.06, 0.07, mat("#ffd23a", emit=1.0), (1.55 + math.cos(ar) * 0.35, -0.2, -0.95 + math.sin(ar) * 0.35), (0, -a, 0), 0.0)


def rotate_group(objs, ang_deg):
    rot = Euler((0, math.radians(ang_deg), 0)).to_matrix()
    for o in objs:
        o.location = rot @ o.location
        m = rot @ o.rotation_euler.to_matrix()
        o.rotation_euler = m.to_euler()


def icon_barrier():
    R = 1.45
    tile = glass("#5fd9ff", 0.42, emit=0.35)
    rim = glass("#bff4ff", 0.7, emit=0.6)

    def tile_at(pol, azi, rad):
        p, a = math.radians(pol), math.radians(azi)
        n = Vector((math.sin(p) * math.cos(a), math.sin(p) * math.sin(a), math.cos(p)))
        loc = n * R
        rx = math.asin(max(-1.0, min(1.0, -n.y)))
        ry = math.atan2(n.x, n.z)
        c = cyl(rad, 0.1, tile, loc, (math.degrees(rx), math.degrees(ry), 0), 6)
        return c
    tile_at(0, 0, 0.36)
    for k in range(6):
        tile_at(30, k * 60, 0.34)
    for k in range(12):
        tile_at(58, k * 30 + 15, 0.3)
    for k in range(14):
        tile_at(84, k * (360 / 14), 0.28)
    torus(R * 1.02, 0.1, rim, (0, 0, 0), (0, 0, 0), maj=32, mnr=8)
    cyl(1.3, 0.12, mat("#2a3a55", 0.4, 0.4), (0, 0, -0.08), (0, 0, 0), 24)
    # a little emblem inside the dome
    pts = [(0, 0.6), (0.4, 0.4), (0.4, -0.05), (0.2, -0.4), (0, -0.55), (-0.2, -0.4), (-0.4, -0.05), (-0.4, 0.4)]
    prism(pts, 0.14, mat(YELLOW, 0.35, emit=0.5), (0, -0.2, 0.55), (90, 0, 0), 0.02)


def icon_secondwind():
    wm = mat(WHITE, 0.45)
    wing = [(0, 0.0), (0.55, 0.5), (1.3, 0.8), (1.1, 0.58), (1.6, 0.42), (1.2, 0.3), (1.5, 0.05), (1.05, 0.02), (1.2, -0.3), (0.6, -0.12)]
    for sx in (-1, 1):
        prism([(sx * x, y) for x, y in wing], 0.16, wm, (sx * 0.62, 0.3, 0.0), (90, 0, 0), 0.02)
        prism([(sx * x * 0.78, y * 0.78 - 0.05) for x, y in wing], 0.1, mat("#cfe8ff", 0.45), (sx * 0.62, 0.2, 0.03), (90, 0, 0), 0.0)
    prism(heart_pts(1.05), 0.44, mat("#ff4f6d", 0.4), (0, -0.05, -0.05), (90, 0, 0), 0.05)
    prism(heart_pts(0.78), 0.1, mat("#ff8aa0", 0.35, emit=0.15), (0, -0.32, -0.02), (90, 0, 0), 0.02)
    prism(star_points(4, 0.2, 0.06), 0.06, mat(YELLOW, emit=0.6), (-0.4, -0.4, 0.28), (90, 0, 0), 0.0)
    prism(star_points(4, 0.26, 0.08), 0.06, mat(YELLOW, emit=0.6), (1.6, -0.2, 1.05), (90, 0, 0), 0.0)
    prism(star_points(4, 0.18, 0.06), 0.06, mat(YELLOW, emit=0.6), (-1.7, -0.2, 0.95), (90, 0, 0), 0.0)


def icon_rage():
    fm, fd = mat("#ee4a3e", 0.4), mat("#bf2f28", 0.45)
    for k in range(9):
        a = 15 + k * 40
        ar = math.radians(a)
        ln = 1.0 if k % 2 == 0 else 0.7
        fl = [(-0.2, 0), (-0.26, ln * 0.35), (-0.08, ln * 0.75), (0.0, ln), (0.1, ln * 0.7), (0.27, ln * 0.38), (0.2, 0)]
        prism(fl, 0.14, mat(ORANGE if k % 2 else "#ff5a22", emit=0.5), (math.cos(ar) * 1.0, 0.6, math.sin(ar) * 1.0 + 0.05), (90, 90 - a, 0), 0.0)
        fl2 = [(x * 0.55, y * 0.6) for x, y in fl]
        prism(fl2, 0.1, mat(YELLOW, emit=0.7), (math.cos(ar) * 1.0, 0.5, math.sin(ar) * 1.0 + 0.05), (90, 90 - a, 0), 0.0)
    box(1.7, 0.9, 1.25, fd, (0, 0.55, 0.12), bevel=0.1)
    for i in range(4):
        x = -0.64 + i * 0.425
        box(0.42, 0.55, 0.5, fm, (x, 0.05, 0.38), bevel=0.07)
        box(0.42, 0.5, 0.44, fd if i % 2 else fm, (x, -0.18, -0.04), bevel=0.07)
    box(1.25, 0.34, 0.36, fm, (0.0, -0.5, -0.42), (0, 0, 7), 0.08)
    box(1.3, 0.8, 0.5, mat("#2d2a33", 0.4, 0.3), (0, 0.55, -0.82), bevel=0.06)
    for x in (-0.45, 0.0, 0.45):
        sphere(0.07, mat(BRASS, 0.3, 0.8), (x, 0.1, -0.82), seg=8, rings=6)
    for k, (dx, dz, s) in enumerate(((0.0, 0.0, 1.0), (0.0, 0.0, 1.0))):
        pass
    # anger mark
    for ang in (45, 135):
        box(0.55, 0.06, 0.12, mat("#ffd23a", emit=0.8), (1.15, -0.5, 1.15), (0, -ang, 0), 0.0)
    for ang in (0, 90):
        box(0.42, 0.06, 0.1, mat("#ffd23a", emit=0.8), (1.15, -0.5, 1.15), (0, -ang, 0), 0.0)


ICONS += ["regen", "thorns", "shock", "volatile", "frost", "scavenger", "adrenaline", "barrier", "secondwind", "rage"]


def icon_drone():
    """A toy quadcopter: pod, visor, four arms with guard rings and rotors, skids and an antenna."""
    body = mat(WHITE, 0.4)
    sphere(0.62, body, (0, 0, 0), (1.0, 1.08, 0.66), seg=16, rings=10)
    sphere(0.62, mat(DARK, 0.45), (0, 0, -0.16), (0.9, 1.0, 0.45), seg=14, rings=8)
    sphere(0.38, mat(CREAM, 0.45), (0, 0.12, 0.27), (1, 1.05, 0.55), seg=12, rings=8)
    box(0.74, 0.13, 0.15, mat("#7fe3ff", 0.1, emit=0.9), (0, -0.64, 0.06), bevel=0.04)
    box(0.5, 0.1, 0.05, mat(GREEN, emit=0.8), (0, -0.66, -0.07), bevel=0.0)
    for sx, sy in ((1, -1), (-1, -1), (1, 1), (-1, 1)):
        ax, ay = sx * 1.12, sy * 0.98
        ang = math.degrees(math.atan2(ay, ax))
        box(math.hypot(ax, ay) * 0.95, 0.14, 0.12, mat(DARK, 0.4), (ax / 2, ay / 2, 0.06), (0, 0, ang), 0.03)
        cyl(0.19, 0.22, mat(DARK, 0.4), (ax, ay, 0.1), (0, 0, 0), 12)
        cyl(0.19, 0.06, mat(RED if sy < 0 else BLUE, 0.4), (ax, ay, 0.0), (0, 0, 0), 12)
        torus(0.5, 0.035, mat(STEEL, 0.3, 0.8), (ax, ay, 0.24), (0, 0, 0), 28, 6)
        for r in (0, 90):
            box(0.92, 0.09, 0.035, mat("#2b3340", 0.5), (ax, ay, 0.3), (0, 0, r + 25 * sx), 0.0)
    for sx in (-1, 1):
        box(0.07, 1.3, 0.07, mat(DARK, 0.4), (0.4 * sx, 0.0, -0.62), bevel=0.0)
        for sy in (-0.45, 0.45):
            box(0.06, 0.06, 0.32, mat(DARK, 0.4), (0.4 * sx, sy, -0.46), bevel=0.0)
    cyl(0.025, 0.55, mat(STEEL, 0.3, 0.8), (0, 0.5, 0.55), (-25, 0, 0), 8)
    sphere(0.06, mat(YELLOW, emit=0.8), (0, 0.6, 0.8), seg=8, rings=6)

ICONS += ["drone"]


# ------------------------------------------------------------------------------------------------ third batch: the 50 universal cards
GOLD, BROWN, BROWN2, SKY = "#ffc933", "#9a6a3a", "#6b4226", "#7fd4ff"


def new_since(before):
    return [o for o in coll.objects if o not in before]


def disc(r, h, m, loc, verts=24):
    """A round plate facing the camera."""
    return cyl(r, h, m, loc, (90, 0, 0), verts)


def plus(x, z, s, y=-0.4, c=RED):
    box(s * 0.34, 0.14, s, mat(c), (x, y, z), bevel=0.03)
    box(s, 0.14, s * 0.34, mat(c), (x, y, z), bevel=0.03)


def sparkle(x, z, s=0.25, y=-0.3, c=YELLOW):
    prism(star_points(4, s, s * 0.3), 0.06, mat(c, emit=0.6), (x, y, z), (90, 0, 0), 0.0)


def gear(x, z, y, r, n, m, hole=True):
    disc(r, 0.22, m, (x, y, z), n * 2)
    for k in range(n):
        a = 2 * math.pi * k / n
        box(r * 0.42, 0.22, r * 0.34, m, (x + math.cos(a) * r, y, z + math.sin(a) * r), (0, -math.degrees(a), 0), 0.0)
    if hole:
        disc(r * 0.35, 0.26, mat(DARK), (x, y - 0.02, z), 12)


def coin(x, z, y, r, thick=0.16, c=GOLD):
    disc(r, thick, mat(c, 0.3, 0.8), (x, y, z), 20)
    torus(r * 0.72, r * 0.07, mat("#e0a21f", 0.3, 0.7), (x, y - thick / 2, z), (90, 0, 0), maj=20, mnr=5)


def arc(R, r, m, loc, start, sweep, maj=48, mnr=6):
    """An arc of a ring facing the camera, starting at `start` degrees (0 = +X, 90 = up) and sweeping counter-clockwise."""
    t = torus(R, r, m, loc, (0, 0, 0), maj, mnr, arc=sweep)
    t.rotation_mode = "XZY"
    t.rotation_euler = (math.radians(90), 0, math.radians(-start))
    return t


def tilt(objs, deg, about=(0, 0)):
    """Rotate a group in the camera plane (around Y) about a point (x, z)."""
    for o in objs:
        o.location.x -= about[0]
        o.location.z -= about[1]
    rotate_group(objs, deg)
    for o in objs:
        o.location.x += about[0]
        o.location.z += about[1]


def icon_glasscannon():
    gl = glass("#8fd8ff", 0.6, emit=0.2)
    before = set(coll.objects)
    cyl(0.55, 2.0, gl, (0, 0, 0), (0, 90, 0), 18)
    torus(0.58, 0.1, glass("#d8f4ff", 0.8, emit=0.4), (1.0, 0, 0), (0, 90, 0), maj=18, mnr=6)
    sphere(0.6, gl, (-1.0, 0, 0), seg=14, rings=10)
    box(1.3, 0.7, 0.2, mat(BROWN, 0.6), (-0.1, 0, -0.55), bevel=0.04)
    tilt(new_since(before), 18, (0, 0))
    disc(0.62, 0.22, mat(BROWN2, 0.6), (-0.1, -0.5, -0.78), 16)
    disc(0.12, 0.26, mat(BRASS, 0.3, 0.8), (-0.1, -0.52, -0.78), 8)
    crack = [(0.0, 0.5), (-0.22, 0.25), (0.05, 0.1), (-0.3, -0.2), (-0.08, -0.22), (-0.35, -0.55), (-0.18, -0.2), (0.12, -0.05), (-0.12, 0.18), (0.14, 0.32)]
    prism(crack, 0.06, mat(DARK), (0.15, -0.58, 0.3), (90, 0, 0), 0.0)
    for (x, z, a) in ((1.5, 1.3, 20), (-1.4, 0.8, 100), (1.7, -0.5, 200)):
        prism([(0, 0.2), (0.14, -0.12), (-0.14, -0.12)], 0.05, glass("#bfeaff", 0.8, emit=0.3), (x, -0.2, z), (90, 0, a), 0.0)
    sparkle(1.1, 1.5, 0.25, c="#ffffff")


def icon_padding():
    pk = mat("#f7a8c4", 0.7)
    vest = [(-0.5, 1.0), (-0.95, 0.8), (-1.15, 0.0), (-1.0, -1.0), (1.0, -1.0), (1.15, 0.0), (0.95, 0.8), (0.5, 1.0), (0.0, 0.45)]
    prism(vest, 0.5, pk, (0, 0, 0), (90, 0, 0), 0.12)
    for z in (0.35, -0.15, -0.65):
        box(2.0, 0.06, 0.06, mat("#d9729a"), (0, -0.28, z), bevel=0.0)
    for x in (-0.65, 0.0, 0.65):
        box(0.06, 0.06, 1.7, mat("#d9729a"), (x, -0.28, -0.1), bevel=0.0)
    for x in (-0.35, 0.35):
        for z in (0.1, -0.4):
            sphere(0.09, mat(YELLOW, 0.4), (x, -0.33, z), seg=8, rings=6)
    box(0.12, 0.06, 1.35, mat(WHITE), (0, -0.3, -0.35), bevel=0.0)


def icon_lightfoot():
    fm = mat(WHITE, 0.6)
    before = set(coll.objects)
    box(0.12, 0.08, 2.5, mat("#b9d3ec"), (0, 0, 0), bevel=0.0)
    for k in range(9):
        z = -1.0 + k * 0.28
        w = 0.95 - abs(z - 0.1) * 0.25
        for s in (-1, 1):
            prism([(0, 0), (s * w, 0.28), (s * w * 0.95, -0.02), (0, -0.2)], 0.07, fm if k % 2 else mat("#e8f1fb"), (0, 0, z), (90, 0, 0), 0.0)
    tilt(new_since(before), -35, (0, 0))
    sk = mat("#ffd9b0")
    sphere(0.4, sk, (1.15, 0.0, -0.95), (1, 0.5, 1.3), seg=10, rings=8)
    for (x, z, r) in ((0.9, -0.5, 0.11), (1.1, -0.45, 0.11), (1.3, -0.45, 0.1), (1.45, -0.55, 0.09)):
        sphere(r, sk, (x, -0.08, z), seg=8, rings=6)
    for z in (-0.8, -0.3, 0.2):
        box(0.7, 0.05, 0.07, mat(SKY), (-1.45, -0.2, z - 0.2), bevel=0.0)


def icon_snack():
    ck = mat("#d99a52", 0.7)
    disc(1.15, 0.38, ck, (0, 0, 0), 22)
    disc(1.0, 0.1, mat("#e6ad66", 0.7), (0, -0.2, 0), 22)
    cc = mat("#4a2a18", 0.5)
    for (x, z) in ((-0.4, 0.4), (0.3, 0.5), (-0.15, -0.2), (0.45, -0.25), (-0.6, -0.5), (0.0, -0.7), (0.65, 0.15)):
        box(0.22, 0.1, 0.18, cc, (x, -0.3, z), (0, 0, 20 * x), 0.02)
    for (x, z) in ((-1.4, -0.8), (1.45, -0.7), (1.2, -1.05)):
        sphere(0.1, ck, (x, -0.1, z), seg=6, rings=4)
    plus(1.15, 1.05, 0.5, -0.3, "#47b86a")


def icon_hoarder():
    sk = mat("#b58a56", 0.8)
    sphere(1.0, sk, (0, 0, -0.35), (1.05, 0.85, 0.95), seg=14, rings=10)
    cyl(0.4, 0.5, sk, (0, 0, 0.55), (0, 0, 0), 12, r2=0.28)
    torus(0.33, 0.07, mat(RED), (0, 0, 0.52), (0, 0, 0), maj=14, mnr=6)
    for sx in (-1, 1):
        prism([(0, 0), (sx * 0.4, 0.2), (sx * 0.3, -0.2)], 0.08, mat(RED), (sx * 0.12, 0.0, 0.5), (90, 0, 0), 0.0)
    disc(0.35, 0.1, mat("#d1a572"), (0, -0.78, -0.35), 4)
    for (x, z, r) in ((-0.45, 0.85, 0.3), (0.1, 0.95, 0.26), (0.5, 0.78, 0.28)):
        coin(x, z, -0.15, r)
    coin(1.35, -1.1, -0.3, 0.38)
    coin(-1.4, -1.05, -0.3, 0.34)
    sparkle(1.4, 0.8, 0.28)


def icon_quickstep():
    disc(0.95, 0.3, mat(WHITE, 0.3), (0, 0, -0.1), 28)
    torus(0.95, 0.12, mat(RED, 0.4), (0, -0.15, -0.1), (90, 0, 0), maj=28, mnr=6)
    box(0.3, 0.3, 0.2, mat(RED, 0.4), (0, 0, 1.02), bevel=0.03)
    box(0.12, 0.24, 0.26, mat(STEEL, 0.3, 0.8), (0.0, 0, 0.82))
    for k in range(12):
        a = math.radians(k * 30)
        box(0.08, 0.05, 0.2 if k % 3 == 0 else 0.1, mat(DARK), (math.sin(a) * 0.75, -0.17, -0.1 + math.cos(a) * 0.75), (0, -k * 30, 0), 0.0)
    nd = prism([(0, 0), (0.1, 0.62), (-0.1, 0.62)], 0.05, mat(RED), (0, -0.2, -0.1), (90, 0, 0), 0.0)
    rotate_group([nd], 35)
    for z in (-0.7, -0.1, 0.5):
        box(0.8, 0.07, 0.1, mat(YELLOW), (-1.6, -0.1, z), bevel=0.0)


def icon_bookworm():
    box(2.2, 0.3, 1.5, mat("#3b6fb8"), (0, 0.15, -0.55), bevel=0.05)
    box(2.0, 0.34, 1.3, mat(WHITE), (0.02, 0.0, -0.55), bevel=0.03)
    for z in (-0.3, -0.6, -0.9):
        box(1.6, 0.36, 0.04, mat("#d8d0bd"), (0.0, 0.0, z), bevel=0.0)
    g = mat("#5fd16a", 0.45)
    pts = [(-0.85, 0.05), (-0.45, 0.2), (-0.05, 0.1), (0.35, 0.3), (0.7, 0.2)]
    for i, (x, z) in enumerate(pts):
        sphere(0.34 - i * 0.015, g, (x, -0.1, z + 0.1), seg=12, rings=8)
    head = (0.72, -0.1, 0.62)
    sphere(0.46, g, head, seg=14, rings=10)
    for sx in (-1, 1):
        torus(0.17, 0.035, mat(DARK), (head[0] + sx * 0.2, -0.46, head[2] + 0.05), (90, 0, 0), maj=14, mnr=5)
        sphere(0.06, mat(DARK), (head[0] + sx * 0.2, -0.47, head[2] + 0.05), seg=6, rings=4)
    box(0.18, 0.04, 0.04, mat(DARK), (head[0], -0.46, head[2] + 0.06), bevel=0.0)
    box(0.34, 0.04, 0.07, mat(RED), (head[0], -0.5, head[2] - 0.2), bevel=0.0)


def icon_steadyhands():
    box(2.5, 0.7, 0.55, mat("#ffcf40", 0.4), (0, 0, -0.5), bevel=0.06)
    box(0.9, 0.72, 0.4, mat("#c9f0ff", 0.1), (0, -0.01, -0.5), bevel=0.04)
    sphere(0.19, mat("#47d46b", 0.2, emit=0.4), (0.0, -0.36, -0.5), (1.3, 0.4, 1.0), seg=10, rings=6)
    for x in (-0.55, 0.55):
        box(0.05, 0.74, 0.4, mat(DARK), (x * 0.9, -0.01, -0.5), bevel=0.0)
    torus(0.7, 0.07, mat(DARK), (0, -0.1, 0.85), (90, 0, 0), maj=26, mnr=6)
    for a in (0, 90, 180, 270):
        r = math.radians(a)
        box(0.5, 0.1, 0.09, mat(DARK), (math.cos(r) * 0.8, -0.1, 0.85 + math.sin(r) * 0.8), (0, -a, 0), 0.0)
    sphere(0.14, mat(RED, emit=0.7), (0, -0.1, 0.85), seg=8, rings=6)


def icon_bruiser():
    rm = mat("#e03a2e", 0.4)
    sphere(1.0, rm, (0, 0, 0.2), (1.1, 0.95, 0.95), seg=16, rings=10)
    sphere(0.5, rm, (0.7, -0.15, -0.1), (1.1, 0.9, 0.8), seg=10, rings=8)
    sphere(0.42, mat("#f0594a", 0.4), (-0.35, -0.7, 0.6), (1.0, 0.5, 0.85), seg=10, rings=8)
    box(1.4, 1.0, 0.65, mat(WHITE, 0.5), (-0.05, 0.0, -0.95), bevel=0.1)
    box(1.45, 1.05, 0.14, mat("#2f3a56"), (-0.05, 0.0, -0.78), bevel=0.03)
    for (x, z) in ((-1.55, 0.8), (-1.65, 0.1), (-1.55, -0.6)):
        box(0.55, 0.07, 0.1, mat(YELLOW), (x, -0.2, z), bevel=0.0)
    burst(mat(YELLOW, emit=0.5), (0.9, 0.7, 1.0), 8, 0.3, 0.6, 0.06)


def icon_patience():
    shell = mat("#e8a04a", 0.5)
    sphere(1.0, shell, (-0.15, 0, 0.45), (1.0, 0.65, 1.0), seg=14, rings=10)
    for R, c in ((0.78, "#c47a2c"), (0.5, "#e8a04a"), (0.25, "#c47a2c")):
        torus(R, 0.07, mat(c, 0.5), (-0.15, -0.5, 0.45), (90, 0, 0), maj=22, mnr=5)
    body = mat("#9bd36a", 0.5)
    box(2.3, 0.7, 0.4, body, (0.1, 0, -0.55), bevel=0.19)
    sphere(0.4, body, (1.25, 0, -0.35), (1.0, 0.9, 1.15), seg=10, rings=8)
    for sx in (0.0, 1.0):
        cyl(0.04, 0.8, body, (1.1 + sx * 0.4, 0.0, 0.15), (0, 0, 0), 6)
        sphere(0.11, body, (1.1 + sx * 0.4, 0, 0.58), seg=8, rings=6)
        sphere(0.04, mat(DARK), (1.1 + sx * 0.4, -0.08, 0.6), seg=6, rings=4)
    box(0.24, 0.04, 0.05, mat(DARK), (1.55, -0.34, -0.45), (0, 0, -20), 0.0)
    prism(heart_pts(0.5), 0.06, mat(PINK), (-1.3, -0.1, 1.2), (90, 0, 0), 0.0)


def icon_grit():
    sphere(1.15, mat("#ffd23a", 0.5), (0, 0.1, 0), (1.05, 0.9, 1.0), seg=18, rings=12)
    box(1.35, 0.2, 0.62, mat("#2a1f22"), (0, -0.78, -0.4), bevel=0.1)
    wt = mat(WHITE, 0.4)
    for i in range(5):
        x = -0.52 + i * 0.26
        box(0.22, 0.12, 0.26, wt, (x, -0.9, -0.28), bevel=0.03)
        box(0.22, 0.12, 0.26, wt, (x, -0.9, -0.52), bevel=0.03)
    for sx in (-1, 1):
        sphere(0.17, mat(DARK), (0.42 * sx, -0.95, 0.3), (1, 0.4, 1.2), seg=8, rings=6)
        box(0.6, 0.12, 0.16, mat(DARK), (0.42 * sx, -0.95, 0.62), (0, 0, -24 * sx), 0.02)
    for (x, z) in ((1.55, 0.9), (-1.55, 0.9)):
        box(0.4, 0.06, 0.08, mat(RED, emit=0.5), (x, -0.4, z), (0, 0, 50 * (1 if x > 0 else -1)), 0.0)


def icon_scrappile():
    gear(-0.45, -0.1, -0.1, 0.85, 8, mat("#8f98a8", 0.4, 0.8))
    gear(0.9, 0.55, -0.35, 0.5, 6, mat(BRASS, 0.35, 0.8))
    gear(0.95, -0.75, -0.2, 0.4, 6, mat("#c0603a", 0.4, 0.6))
    for (x, z, a) in ((-1.45, -0.85, 30), (-0.2, -1.1, -10)):
        cyl(0.07, 0.8, mat(STEEL, 0.3, 0.9), (x, -0.5, z), (0, 90, a), 6)
        cyl(0.17, 0.12, mat(STEEL, 0.3, 0.9), (x + 0.4, -0.5, z), (0, 90, a), 6)
    box(0.3, 0.3, 0.3, mat(STEEL, 0.3, 0.9), (-1.1, -0.5, 0.75), (20, 0, 30), 0.02)
    cyl(0.16, 0.5, mat(GREEN, 0.5), (0.2, -0.65, -1.15), (0, 90, 0), 8)
    sparkle(1.55, 1.2, 0.28, c=BRASS)


def icon_tinker():
    steel = mat(STEEL, 0.3, 0.9)
    before = set(coll.objects)
    box(0.34, 0.2, 2.5, steel, (0, 0, 0), bevel=0.06)
    torus(0.5, 0.2, steel, (0, 0, 1.3), (90, 0, 0), maj=18, mnr=6, arc=300)
    box(0.34, 0.24, 0.5, mat(RED), (0, 0, -0.9), bevel=0.04)
    tilt(new_since(before), 35, (0, 0))
    before = set(coll.objects)
    box(0.26, 0.2, 2.1, mat(YELLOW, 0.4), (0, -0.15, -0.2), bevel=0.06)
    cyl(0.08, 0.9, steel, (0, -0.15, 1.2), (0, 0, 0), 8, r2=0.03)
    box(0.18, 0.1, 0.18, mat(DARK), (0, -0.15, 1.65))
    tilt(new_since(before), -35, (0, 0))
    gear(0, -0.4, -0.3, 0.38, 8, mat(BRASS, 0.3, 0.8))


def icon_sprinter():
    cyl(0.07, 3.0, mat(STEEL, 0.3, 0.9), (-1.1, 0, 0), (0, 0, 0), 8)
    sphere(0.12, mat(YELLOW, 0.3, 0.7), (-1.1, 0, 1.55), seg=8, rings=6)
    for r in range(4):
        for c in range(5):
            col = DARK if (r + c) % 2 == 0 else WHITE
            box(0.42, 0.06, 0.38, mat(col, 0.5), (-0.85 + c * 0.42 + r * 0.03, 0.0, 1.35 - r * 0.38), (0, 0, 0), 0.0)
    for k, z in enumerate((-0.2, -0.65, -1.1)):
        for dx in (0.3, 0.9):
            prism([(0, 0), (0.55, 0.28), (0, 0.56), (0.15, 0.28)], 0.12, mat(RED if k % 2 else ORANGE), (dx + k * 0.5, -0.1, z), (90, 0, 0), 0.0)
    for z in (-0.4, -0.9):
        box(0.8, 0.06, 0.07, mat(YELLOW), (-1.6, -0.2, z), bevel=0.0)


def icon_itchytrigger():
    g = mat("#4a5568", 0.4, 0.5)
    box(1.6, 0.55, 0.5, g, (0.1, 0, 0.55), bevel=0.06)
    box(0.7, 0.45, 0.3, mat(DARK, 0.4, 0.6), (1.2, 0, 0.6), bevel=0.04)
    box(0.5, 0.5, 1.1, g, (-0.45, 0, -0.1), (0, 15, 0), 0.06)
    torus(0.38, 0.06, g, (0.35, 0, 0.0), (90, 0, 0), maj=20, mnr=6)
    box(0.12, 0.2, 0.42, mat(RED, 0.4), (0.35, 0, 0.1), (0, -20, 0), 0.02)
    fm = mat("#ffd0a8", 0.6)
    sphere(0.3, fm, (0.55, -0.1, -0.45), (1.0, 0.8, 1.6), seg=10, rings=8)
    box(0.22, 0.05, 0.1, mat("#ffe6d0"), (0.55, -0.4, -0.3), bevel=0.0)
    for (x, z) in ((1.3, 0.1), (1.55, -0.2), (1.1, -0.45)):
        drop(mat("#6fd8ff", 0.2, emit=0.35), (x, -0.4, z), 0.9)
    for k in (-1, 1):
        box(0.4, 0.06, 0.07, mat(YELLOW), (0.85 + 0.25 * k, -0.4, -0.95), (0, 0, 60 * k), 0.0)


def icon_stout():
    wd = mat(BROWN, 0.7)
    sphere(1.1, wd, (0, 0, 0), (0.95, 0.95, 1.05), seg=14, rings=10)
    cyl(0.95, 0.12, mat(BROWN2), (0, 0, 1.12), (0, 0, 0), 16)
    for z, w in ((-0.55, 0.78), (0.55, 0.78), (0.0, 1.03)):
        torus(w * 1.07, 0.07, mat(STEEL, 0.3, 0.9), (0, 0, z), (0, 0, 0), maj=22, mnr=6)
    for x in (-0.55, -0.2, 0.2, 0.55):
        box(0.04, 0.04, 1.9, mat(BROWN2), (x, -0.9, 0.0), bevel=0.0)
    disc(0.35, 0.08, mat(CREAM, 0.5), (0, -1.04, 0.0), 16)
    plus(0, 0, 0.42, -1.1, "#47b86a")


def icon_luckypenny():
    coin(0, 0, 0, 1.2, 0.3)
    prism(star_points(5, 0.62, 0.28), 0.1, mat(YELLOW, 0.3, 0.3, emit=0.4), (0, -0.2, 0), (90, 0, 0), 0.0)
    torus(0.98, 0.04, mat("#e0a21f"), (0, -0.16, 0), (90, 0, 0), maj=26, mnr=4)
    for (x, z, s) in ((1.5, 1.1, 0.34), (-1.5, 0.9, 0.25), (1.4, -1.05, 0.2), (-1.35, -1.0, 0.3)):
        sparkle(x, z, s, c="#ffffff")


def icon_helpinghand():
    gm = mat(WHITE, 0.55)
    box(1.2, 0.6, 1.2, gm, (0, 0, -0.2), bevel=0.12)
    for i, (x, h) in enumerate(((-0.45, 1.0), (-0.15, 1.2), (0.15, 1.15), (0.45, 0.95))):
        box(0.26, 0.5, h, gm, (x, 0, 0.4 + h / 2 - 0.2), bevel=0.08)
    box(0.34, 0.5, 0.8, gm, (-0.88, 0, 0.1), (0, 0, -40), 0.08)
    box(1.35, 0.7, 0.4, mat(RED, 0.5), (0, 0, -0.95), bevel=0.06)
    prism(heart_pts(0.6), 0.1, mat(RED, 0.4), (0, -0.35, -0.15), (90, 0, 0), 0.0)
    sparkle(-1.4, 1.2, 0.3, c=PINK)
    sparkle(1.3, 1.45, 0.25, c=YELLOW)


def icon_shortfuse():
    for i, x in enumerate((-0.65, 0.0, 0.65)):
        cyl(0.33, 2.0, mat(RED if i != 1 else "#e8503a", 0.5), (x, 0, -0.1), (0, 0, 0), 12)
        cyl(0.34, 0.12, mat(CREAM), (x, 0, 0.5), (0, 0, 0), 12)
        cyl(0.34, 0.12, mat(CREAM), (x, 0, -0.7), (0, 0, 0), 12)
    box(2.0, 0.76, 0.2, mat(BROWN2), (0, 0, -0.1), bevel=0.04)
    cyl(0.05, 0.4, mat("#3a352d"), (0, 0, 1.15), (0, 0, 0), 6)
    burst(mat(ORANGE, emit=1.0), (0, -0.2, 1.5), 8, 0.2, 0.55, 0.06)
    burst(mat(YELLOW, emit=1.2), (0, -0.25, 1.5), 8, 0.1, 0.32, 0.06)


def icon_peptalk():
    before = set(coll.objects)
    cyl(0.9, 1.3, mat(RED, 0.4), (0.35, 0, 0), (0, 90, 0), 18, r2=0.3)
    cyl(0.32, 0.9, mat(DARK, 0.4), (-0.7, 0, 0), (0, 90, 0), 14)
    box(0.34, 0.3, 0.8, mat(DARK, 0.4), (-0.3, 0, -0.6), (0, 0, 0), 0.05)
    torus(0.92, 0.08, mat(WHITE), (1.0, 0, 0), (0, 90, 0), maj=18, mnr=6)
    tilt(new_since(before), 20, (0, 0))
    for k, r in enumerate((0.8, 1.15, 1.5)):
        arc(r, 0.06, mat(YELLOW, emit=0.4), (1.5, -0.1, 0.4), -35, 70, 24, 5)
    sparkle(-1.2, 1.1, 0.35)
    sparkle(1.9, -0.7, 0.25, c=ORANGE)


def icon_overclock():
    disc(1.25, 0.34, mat("#2a2f3a", 0.4, 0.5), (0, 0, 0), 28)
    disc(1.08, 0.1, mat("#e8eef7", 0.5), (0, -0.2, 0), 28)
    for k, (a0, a1, c) in enumerate(((-130, -30, "#47b86a"), (-30, 40, YELLOW), (40, 130, RED))):
        arc(0.92, 0.09, mat(c, emit=0.4), (0, -0.26, 0), 90 - a1, a1 - a0, 64, 5)
    for k in range(9):
        a = math.radians(-130 + k * 32.5)
        box(0.05, 0.05, 0.22, mat(DARK), (math.sin(a) * 0.62, -0.26, math.cos(a) * 0.62), (0, -math.degrees(a), 0), 0.0)
    nd = prism([(0, 0.0), (0.07, 0.1), (0.0, 0.85), (-0.07, 0.1)], 0.06, mat(RED, emit=0.6), (0, -0.3, 0), (90, 0, 0), 0.0)
    rotate_group([nd], 50)
    disc(0.15, 0.12, mat(DARK), (0, -0.34, 0), 10)
    burst(mat(ORANGE, emit=0.6), (0.95, -0.4, 1.05), 6, 0.12, 0.34, 0.05)
    sparkle(-1.2, 1.1, 0.25)


def icon_heavyhitter():
    before = set(coll.objects)
    cyl(0.1, 3.0, mat(BROWN, 0.6), (0, 0, -0.1), (0, 0, 0), 8)
    box(1.7, 0.95, 0.95, mat("#7c8696", 0.3, 0.9), (0, 0, 1.2), bevel=0.08)
    box(0.35, 1.0, 1.0, mat(RED, 0.4), (0.0, 0, 1.2), bevel=0.04)
    box(0.15, 0.2, 0.2, mat(DARK), (0, 0, -1.55), bevel=0.0)
    tilt(new_since(before), -35, (0, 0))
    burst(mat(YELLOW, emit=0.5), (-0.9, 0.7, -0.9), 9, 0.55, 1.05, 0.1)
    burst(mat(ORANGE, emit=0.4), (-0.9, 0.6, -0.9), 9, 0.3, 0.8, 0.1)


def icon_reinforced():
    steel = mat(STEEL, 0.3, 0.9)
    disc(1.25, 0.3, mat("#7c8aa3", 0.3, 0.8), (0, 0.05, 0), 24)
    disc(1.0, 0.16, mat(BLUE, 0.4), (0, -0.2, 0), 24)
    torus(1.25, 0.1, steel, (0, -0.2, 0), (90, 0, 0), maj=26, mnr=6)
    for a in (45, 135):
        box(2.3, 0.14, 0.26, steel, (0, -0.32, 0), (0, -a, 0), 0.03)
    sphere(0.3, mat(BRASS, 0.3, 0.8), (0, -0.4, 0), (1, 0.6, 1), seg=10, rings=6)
    for k in range(8):
        a = math.radians(k * 45 + 22)
        sphere(0.08, mat(BRASS, 0.3, 0.8), (math.cos(a) * 1.12, -0.36, math.sin(a) * 1.12), seg=6, rings=4)
    plus(1.2, 1.0, 0.55, -0.1, "#47b86a")


def icon_lifeline():
    torus(0.95, 0.35, mat(WHITE, 0.5), (0, 0, 0), (90, 0, 0), maj=32, mnr=10)
    for k in range(4):
        a = k * 90 + 45
        r = math.radians(a)
        box(0.5, 0.62, 0.72, mat(RED, 0.5), (math.cos(r) * 0.95, 0, math.sin(r) * 0.95), (0, -(a + 90), 0), 0.08)
    cyl(0.04, 1.8, mat(YELLOW, 0.7), (1.3, 0, -1.0), (0, 0, 0), 6)
    torus(0.45, 0.06, mat(CREAM, 0.7), (1.45, -0.1, -1.55), (90, 0, 0), maj=20, mnr=5)
    prism(heart_pts(0.45), 0.08, mat(PINK), (0, -0.45, 0), (90, 0, 0), 0.0)
    sparkle(-1.4, 1.3, 0.28)


def icon_sharpeyes():
    sphere(1.05, mat(WHITE, 0.3), (0, 0, 0), (1.45, 0.65, 0.9), seg=18, rings=12)
    disc(0.62, 0.12, mat("#2f8fe8", 0.3), (0, -0.62, 0), 22)
    disc(0.4, 0.14, mat(DARK, 0.2), (0, -0.66, 0), 18)
    torus(0.78, 0.04, mat(RED, emit=0.7), (0, -0.7, 0), (90, 0, 0), maj=24, mnr=4)
    for a in (0, 90, 180, 270):
        r = math.radians(a)
        box(0.34, 0.06, 0.06, mat(RED, emit=0.7), (math.cos(r) * 0.83, -0.7, math.sin(r) * 0.83), (0, -a, 0), 0.0)
    sphere(0.1, mat(WHITE, emit=0.9), (-0.14, -0.74, 0.14), seg=6, rings=4)
    for k in range(5):
        a = math.radians(-60 + k * 30)
        box(0.1, 0.1, 0.45, mat(DARK), (math.sin(a) * 1.0, -0.1, 0.95 + math.cos(a) * 0.35), (0, -math.degrees(a), 0), 0.0)


def icon_windrunner():
    sky = mat("#7fd4ff", 0.4, emit=0.15)
    for (R, z, c) in ((1.2, 0.5, "#7fd4ff"), (0.8, -0.3, "#b8ecff"), (0.5, -1.0, "#7fd4ff")):
        arc(R, 0.12, mat(c, 0.4, emit=0.25), (0.0, 0, z), -20 - R * 20, 240, 40, 6)
    for (x, z) in ((1.3, 0.95), (-1.35, -0.4)):
        sphere(0.2, sky, (x, 0, z), seg=8, rings=6)
    lf = mat("#5fd16a")
    prism([(0, 0), (0.45, 0.22), (0.9, 0), (0.45, -0.22)], 0.07, lf, (-0.6, -0.1, 0.6), (90, 0, 35), 0.0)
    box(0.5, 0.05, 0.05, mat("#2f7e49"), (-0.5, -0.15, 0.6), (0, 35, 0), 0.0)
    sparkle(1.4, -0.6, 0.25, c="#ffffff")


def icon_mender():
    pt = mat("#d9b27c", 0.8)
    box(1.8, 0.28, 1.8, pt, (0, 0, 0), (0, 0, 8), 0.08)
    for x in (-0.4, 0.0, 0.4):
        box(0.07, 0.3, 0.9, mat("#b58a56"), (x, -0.02, 0.0), (0, 0, 8), 0.0)
    sk = mat("#ff4f6d", 0.4)
    for (x, z) in ((-0.55, 0.65), (-0.55, -0.65), (0.55, 0.65), (0.55, -0.65)):
        for a in (45, 135):
            box(0.4, 0.07, 0.07, sk, (x, -0.2, z), (0, -a, 0), 0.0)
    before = set(coll.objects)
    box(0.07, 0.07, 2.4, mat(STEEL, 0.2, 1.0), (0, -0.3, 0), bevel=0.0)
    torus(0.1, 0.03, mat(STEEL, 0.2, 1.0), (0, -0.3, 1.1), (90, 0, 0), maj=12, mnr=4)
    cyl(0.07, 0.3, mat(STEEL, 0.2, 1.0), (0, -0.3, -1.3), (0, 0, 0), 6, r2=0.0)
    tilt(new_since(before), 40, (0, 0))
    arc(0.5, 0.025, sk, (1.0, -0.3, -0.9), 0, 260, 20, 4)
    plus(-1.15, 1.1, 0.5, -0.1, "#47b86a")


def icon_magnetic():
    torus(0.5, 0.08, mat(STEEL, 0.3, 0.9), (0, 0, 1.4), (90, 0, 0), maj=20, mnr=6)
    disc(1.05, 0.28, mat(BRASS, 0.3, 0.8), (0, 0, -0.1), 26)
    torus(1.05, 0.1, mat("#f0c25e", 0.3, 0.8), (0, -0.14, -0.1), (90, 0, 0), maj=26, mnr=6)
    torus(0.42, 0.18, mat(RED, 0.35, 0.3), (0, -0.2, -0.0), (90, 0, 0), maj=24, mnr=8, arc=180)
    for sx in (-1, 1):
        box(0.34, 0.2, 0.3, mat(STEEL, 0.3, 0.9), (0.42 * sx, -0.2, -0.28), bevel=0.02)
    for (x, z) in ((-1.4, -0.9), (1.45, -0.75), (-1.2, 0.8), (1.3, 0.85)):
        sphere(0.12, mat(DARK, 0.4, 0.8), (x, -0.1, z), seg=8, rings=6)
    sparkle(1.6, 1.4, 0.3, c="#7fd4ff")


def icon_prospector():
    before = set(coll.objects)
    cyl(0.09, 2.7, mat(BROWN, 0.6), (0, 0, -0.5), (0, 0, 0), 8)
    arc(0.95, 0.14, mat(STEEL, 0.3, 0.9), (0, 0, 0.5), 20, 140, 26, 6)
    cyl(0.14, 0.4, mat(STEEL, 0.3, 0.9), (0.9, 0, 0.2), (0, 150, 0), 6, r2=0.0)
    cyl(0.14, 0.4, mat(STEEL, 0.3, 0.9), (-0.9, 0, 0.2), (0, -150, 0), 6, r2=0.0)
    tilt(new_since(before), -25, (0, 0))
    ng = mat(GOLD, 0.25, 0.9)
    for (x, z, s) in ((0.9, -1.0, 0.45), (1.45, -1.15, 0.38), (1.15, -0.55, 0.36), (0.45, -1.2, 0.3)):
        sphere(s, ng, (x, -0.2, z), (1, 0.8, 0.8), seg=7, rings=5)
    sparkle(1.5, -0.2, 0.3, c="#ffffff")
    sparkle(0.6, -0.5, 0.2, c="#ffffff")


def icon_grenadepouch():
    gm = mat("#6e7a45", 0.7)
    box(1.8, 0.9, 1.5, gm, (0, 0, -0.35), bevel=0.15)
    prism([(-0.9, 0.0), (0.9, 0.0), (0.9, -0.5), (0.0, -0.95), (-0.9, -0.5)], 0.95, mat("#59622f", 0.7), (0, 0, 0.6), (90, 0, 0), 0.06)
    box(0.34, 0.1, 0.4, mat(BRASS, 0.3, 0.8), (0, -0.55, 0.28), bevel=0.02)
    sphere(0.48, mat(GREEN, 0.5), (-0.35, 0.0, 1.0), (1, 1, 1.1), seg=10, rings=8)
    cyl(0.16, 0.25, mat(STEEL, 0.4, 0.8), (-0.35, 0.0, 1.55), (0, 0, 0), 8)
    torus(0.2, 0.04, mat(STEEL, 0.4, 0.8), (-0.12, 0, 1.65), (90, 0, 0), maj=12, mnr=4)
    box(2.0, 0.06, 0.2, mat(BROWN2), (0, -0.46, -0.1), (0, 0, 0), 0.0)
    plus(1.35, 1.1, 0.5, -0.1, ORANGE)
    sphere(0.4, mat(GREEN, 0.5), (0.65, 0.15, 1.0), (1, 1, 1.1), seg=10, rings=8)


def icon_forcefield():
    cyl(1.1, 0.25, mat("#2a3a55", 0.4, 0.5), (0, 0, -1.0), (0, 0, 0), 20)
    cyl(0.5, 0.35, mat(STEEL, 0.3, 0.8), (0, 0, -0.78), (0, 0, 0), 14)
    sphere(1.45, glass("#5fd9ff", 0.28, emit=0.5), (0, 0, 0.15), seg=22, rings=14)
    for k, (z, R) in enumerate(((-0.55, 1.18), (-0.05, 1.45), (0.5, 1.36), (1.0, 1.0))):
        torus(R, 0.07, glass("#bff4ff", 0.85, emit=0.8), (0, 0, z + 0.15), (0, 0, 0), maj=32, mnr=6)
    sphere(0.38, mat(YELLOW, 0.3, emit=1.4), (0, 0, 0.1), seg=12, rings=8)
    prism(star_points(8, 0.7, 0.4), 0.08, mat("#fff7c2", emit=1.0), (0, -0.2, 0.1), (90, 0, 0), 0.0)
    for (x, z) in ((-1.55, 1.2), (1.5, 1.15), (1.6, -0.3)):
        sparkle(x, z, 0.25, c="#bff4ff")


def icon_spikedarmor():
    pts = [(-0.5, 1.05), (-1.0, 0.8), (-1.25, -0.1), (-1.0, -1.05), (1.0, -1.05), (1.25, -0.1), (1.0, 0.8), (0.5, 1.05), (0.0, 0.6)]
    prism(pts, 0.5, mat(STEEL, 0.3, 0.9), (0, 0, 0), (90, 0, 0), 0.08)
    prism([(x * 0.8, y * 0.8 - 0.02) for x, y in pts], 0.2, mat("#6f7b92", 0.3, 0.9), (0, -0.28, 0), (90, 0, 0), 0.04)
    box(0.18, 0.1, 1.4, mat(RED), (0, -0.4, -0.15), bevel=0.02)
    sp = mat("#ffe39a", 0.3, 0.3, emit=0.2)
    for (x, z) in ((-0.55, 0.4), (0.55, 0.4), (-0.6, -0.4), (0.6, -0.4), (0.0, -0.8), (0.0, 0.7)):
        cyl(0.17, 0.55, sp, (x, -0.55, z), (90, 0, 0), 8, r2=0.0)
    spike(sp, (-1.1, 0.0, 0.8), 130, 0.18, 0.55)
    spike(sp, (1.1, 0.0, 0.8), 50, 0.18, 0.55)
    spike(sp, (-1.2, 0.0, -0.1), 180, 0.18, 0.5)
    spike(sp, (1.2, 0.0, -0.1), 0, 0.18, 0.5)


def icon_quickstudy():
    gl = glass("#fff2a0", 0.75, emit=0.6)
    sphere(0.85, gl, (0, 0, 0.5), seg=16, rings=12)
    cyl(0.42, 0.35, mat(STEEL, 0.4, 0.8), (0, 0, -0.5), (0, 0, 0), 12, r2=0.3)
    cyl(0.3, 0.2, mat(DARK, 0.4), (0, 0, -0.78), (0, 0, 0), 12)
    bolt = [(0.12, 0.6), (-0.3, -0.05), (-0.04, -0.05), (-0.16, -0.6), (0.3, 0.1), (0.04, 0.1), (0.24, 0.6)]
    prism(bolt, 0.14, mat(ORANGE, emit=0.7), (0, -0.3, 0.55), (90, 0, 0), 0.0)
    for a in range(0, 360, 45):
        if a in (225, 270, 315):
            continue
        r = math.radians(a)
        box(0.35, 0.06, 0.07, mat(YELLOW, emit=0.8), (math.cos(r) * 1.3, -0.1, 0.5 + math.sin(r) * 1.3), (0, -a, 0), 0.0)
    before = set(coll.objects)
    box(0.22, 0.22, 1.5, mat(YELLOW, 0.5), (0, 0, 0), bevel=0.03)
    cyl(0.14, 0.4, mat("#ffdcb0"), (0, 0, -0.95), (0, 0, 0), 6, r2=0.0)
    box(0.24, 0.24, 0.2, mat(PINK), (0, 0, 0.82), bevel=0.03)
    pen = new_since(before)
    tilt(pen, 50, (0, 0))
    for o in pen:
        o.location += Vector((1.35, -0.2, -0.55))


def icon_fieldmedic():
    sphere(1.15, mat(OLIVE, 0.6), (0, 0, 0.1), (1.0, 0.95, 0.95), seg=18, rings=12)
    box(2.5, 1.5, 0.12, mat("#59622f", 0.6), (0, 0, -0.55), bevel=0.06)
    box(2.3, 0.1, 0.18, mat(DARK, 0.5), (0, -0.7, -0.3), bevel=0.0)
    disc(0.52, 0.12, mat(WHITE, 0.4), (0, -1.0, 0.25), 20)
    plus(0, 0.25, 0.72, -1.08)
    sparkle(-1.45, 1.2, 0.28, c="#ffffff")
    sparkle(1.5, 0.9, 0.22, c="#47b86a")


def icon_dashmaster():
    before = set(coll.objects)
    box(1.0, 0.8, 1.7, mat(RED, 0.5), (0, 0, 0.35), bevel=0.1)
    box(1.1, 0.82, 0.25, mat(WHITE, 0.5), (0, 0, 1.15), bevel=0.04)
    box(1.9, 0.82, 0.55, mat("#2a2f3a", 0.5), (0.45, 0, -0.75), bevel=0.12)
    tilt(new_since(before), -20, (0, 0))
    for k, (x, z, s) in enumerate(((-1.2, -0.95, 1.1), (-1.5, -0.45, 0.8), (-1.0, -1.35, 0.7))):
        burst(mat([ORANGE, YELLOW, RED][k], emit=0.9), (x, 0.6 - k * 0.1, z), 7, 0.15 * s, 0.5 * s, 0.1)
    for z in (-0.1, 0.5, 1.1):
        box(0.8, 0.06, 0.08, mat(YELLOW), (-1.7, -0.3, z + 0.2), bevel=0.0)


def icon_demolition():
    steel = mat(STEEL, 0.3, 0.9)
    box(2.4, 0.4, 0.25, mat(YELLOW, 0.5), (-0.4, 0, 1.45), bevel=0.04)
    for k in range(5):
        torus(0.17, 0.05, steel, (0.5, 0, 1.2 - k * 0.3), (90 * (k % 2), 90 * ((k + 1) % 2), 0), maj=10, mnr=4)
    sphere(0.9, mat("#2f2b3d", 0.35, 0.6), (0.5, 0, -0.55), seg=16, rings=12)
    box(0.5, 0.06, 0.1, mat("#ffffff", 0.2), (0.15, -0.88, -0.2), (0, 0, 40), 0.0)
    brick = mat("#c46a3a", 0.7)
    for (x, z, a) in ((-1.2, -1.0, 15), (-0.7, -0.4, -25), (1.7, -1.2, 30), (1.9, -0.5, -10), (-1.5, -0.2, 40)):
        box(0.4, 0.28, 0.26, brick, (x, -0.2, z), (0, a, 0), 0.02)
    burst(mat(ORANGE, emit=0.5), (0.5, 0.7, -0.55), 10, 1.0, 1.5, 0.08)


def icon_riskreward():
    steel = mat(STEEL, 0.3, 0.9)
    cyl(0.1, 2.2, steel, (0, 0, -0.1), (0, 0, 0), 8)
    cyl(0.6, 0.15, steel, (0, 0, -1.2), (0, 0, 0), 14)
    sphere(0.16, mat(BRASS, 0.3, 0.8), (0, 0, 1.0), seg=8, rings=6)
    before = set(coll.objects)
    box(2.6, 0.14, 0.14, steel, (0, 0, 1.0), bevel=0.02)
    tilt(new_since(before), 10, (0, 1.0))
    for sx, dz in ((-1, -0.22), (1, 0.22)):
        x, z = 1.28 * sx, 1.0 + dz
        for dx in (-0.4, 0.4):
            box(0.03, 0.03, 0.8, steel, (x + dx * 0.9, 0, z - 0.45), bevel=0.0)
        cyl(0.62, 0.1, mat(BRASS, 0.3, 0.8), (x, 0, z - 0.9), (0, 0, 0), 16)
    for k in range(3):
        coin(-1.28, -0.2 + k * 0.2, 0.0, 0.42, 0.16)
    sphere(0.4, mat("#2f2b3d", 0.35, 0.4), (1.28, 0, 0.35), seg=12, rings=8)
    cyl(0.1, 0.16, steel, (1.28, 0, 0.75), (0, 0, 0), 8)
    sphere(0.07, mat(YELLOW, emit=1.2), (1.38, 0, 0.93), seg=6, rings=4)


def icon_stalwart():
    pts = [(-0.85, 1.25), (0.85, 1.25), (1.0, 1.0), (1.0, -0.6), (0.0, -1.3), (-1.0, -0.6), (-1.0, 1.0)]
    prism(pts, 0.4, mat("#7c8aa3", 0.3, 0.8), (0, 0, 0), (90, 0, 0), 0.08)
    prism([(x * 0.84, y * 0.86 + 0.02) for x, y in pts], 0.16, mat("#3d6fb5", 0.4), (0, -0.25, 0), (90, 0, 0), 0.04)
    box(0.14, 0.12, 1.9, mat(YELLOW, 0.4), (0, -0.38, 0.0), bevel=0.02)
    box(1.7, 0.12, 0.14, mat(YELLOW, 0.4), (0, -0.38, 0.15), bevel=0.02)
    sphere(0.38, mat(STEEL, 0.3, 0.9), (0, -0.42, 0.15), (1, 0.55, 1), seg=12, rings=8)
    for sx in (-1, 1):
        sphere(0.11, mat(BRASS, 0.3, 0.8), (0.6 * sx, -0.4, 0.95), seg=8, rings=6)
        sphere(0.11, mat(BRASS, 0.3, 0.8), (0.6 * sx, -0.4, -0.5), seg=8, rings=6)


def icon_armorpiercer():
    pl = mat("#7c8696", 0.3, 0.9)
    box(2.4, 0.45, 2.2, pl, (0, 0.3, 0), bevel=0.06)
    box(2.0, 0.1, 1.8, mat("#9aa5b8", 0.3, 0.9), (0, 0.04, 0), bevel=0.03)
    disc(0.55, 0.1, mat("#15121a"), (0, -0.04, 0), 16)
    for a in range(0, 360, 40):
        r = math.radians(a)
        L = 0.75 + (a % 80) / 160
        box(L, 0.05, 0.07, mat(DARK), (math.cos(r) * (0.55 + L / 2), -0.04, math.sin(r) * (0.55 + L / 2)), (0, -a, 0), 0.0)
    cyl(0.28, 1.0, mat(BRASS, 0.3, 0.9), (0, -0.9, 0), (90, 0, 0), 14)
    cyl(0.28, 0.8, mat("#2a2f3a", 0.3, 0.8), (0, -1.75, 0), (90, 0, 0), 14, r2=0.05)
    cyl(0.32, 0.14, mat(BRASS, 0.3, 0.9), (0, -0.4, 0), (90, 0, 0), 14)
    sparkle(1.4, 1.3, 0.3, c="#ffffff")


def icon_rapidreload():
    box(0.9, 0.55, 1.7, mat("#3a4350", 0.4, 0.7), (-0.1, 0, -0.2), (0, 0, 8), 0.07)
    for k in range(4):
        box(0.8, 0.57, 0.1, mat(STEEL, 0.4, 0.8), (-0.1 + 0.03 * k, 0, -0.9 + k * 0.38), (0, 0, 8), 0.0)
    for k in range(2):
        bullet(mat(BRASS, 0.3, 0.9), mat(RED), (-0.35 + k * 0.35, 0.0, 0.6), (0, 0, 8), 0.5)
    for (a, y) in ((20, -0.4), (200, -0.4)):
        arc(1.3, 0.12, mat(YELLOW, 0.4, emit=0.5), (0, y, -0.1), a, 100, 48, 6)
        e = math.radians(a + 100)
        tx, tz = -math.sin(e), math.cos(e)
        cyl(0.3, 0.42, mat(YELLOW, 0.4, emit=0.5), (math.cos(e) * 1.3 + tx * 0.16, y, math.sin(e) * 1.3 + tz * 0.16 - 0.1), (0, math.degrees(math.atan2(tx, tz)), 0), 3, r2=0.0)
    sparkle(0.9, 1.3, 0.25)


def icon_juggernaut():
    st = mat("#7c8aa3", 0.3, 0.9)
    box(1.7, 1.2, 1.6, st, (0, 0.1, -0.2), bevel=0.2)
    sphere(0.75, st, (0, 0, 0.2), (1.1, 0.95, 1.0), seg=16, rings=10)
    box(1.25, 0.3, 0.2, mat(DARK), (0, -0.7, 0.1), bevel=0.0)
    box(0.12, 0.3, 0.8, st, (0, -0.72, -0.1), bevel=0.02)
    box(0.9, 0.12, 0.1, mat("#ff4f3a", emit=0.9), (0, -0.78, 0.1), bevel=0.0)
    box(0.35, 0.9, 0.3, mat(RED, 0.5), (0, 0, 1.0), bevel=0.06)
    for sx in (-1, 1):
        sphere(0.55, mat("#aab4c8", 0.3, 0.9), (1.25 * sx, 0, -0.35), (1, 1, 0.75), seg=12, rings=8)
        spike(mat("#ffe39a", 0.3, 0.3), (1.25 * sx, -0.1, -0.1), 90, 0.14, 0.4)
    for x in (-0.6, 0.6):
        sphere(0.09, mat(BRASS, 0.3, 0.8), (x, -0.7, -0.6), seg=6, rings=4)


def icon_executioner():
    before = set(coll.objects)
    cyl(0.1, 3.0, mat(BROWN, 0.6), (0, 0, -0.1), (0, 0, 0), 8)
    blade = [(0, 0.55), (0.25, 0.7), (1.3, 1.2), (1.5, 0.3), (1.3, -0.6), (0.25, -0.35), (0, -0.45)]
    prism(blade, 0.12, mat("#c8cfdb", 0.2, 1.0), (0, 0, 0.9), (90, 0, 0), 0.02)
    prism([(0.3, 0.45), (1.2, 0.85), (1.3, 0.3), (1.2, -0.4), (0.3, -0.25)], 0.14, mat("#8f98a8", 0.25, 0.9), (0.05, -0.02, 0.9), (90, 0, 0), 0.0)
    tilt(new_since(before), 25, (0, 0))
    box(1.6, 1.1, 0.8, mat(BROWN2, 0.7), (0.0, 0, -1.2), bevel=0.05)
    disc(0.55, 0.06, mat(BROWN, 0.7), (0.0, -0.56, -1.2), 14)
    sparkle(1.7, 0.6, 0.3, c="#ffffff")
    drop(mat(RED, 0.3), (-1.4, -0.3, -0.8), 1.2)


def icon_blitz():
    before = set(coll.objects)
    cyl(0.42, 2.0, mat(RED, 0.4), (0, 0, 0), (0, 0, 0), 14)
    cyl(0.42, 0.9, mat(WHITE, 0.4), (0, 0, 1.4), (0, 0, 0), 14, r2=0.02)
    torus(0.43, 0.06, mat(YELLOW), (0, 0, 0.45), (0, 0, 0), maj=14, mnr=5)
    disc(0.16, 0.1, mat(SKY, 0.1, emit=0.5), (0, -0.4, 0.4), 10)
    for a in (0, 90, 180, 270):
        prism([(0, 0), (0.6, -0.5), (0.6, -1.0), (0, -0.7)], 0.08, mat(BLUE, 0.4), (0, 0, 0), (0, 0, 0), 0.0).rotation_euler = Euler((math.radians(90), 0, math.radians(a)), "XYZ")
    cyl(0.3, 0.5, mat(DARK, 0.4), (0, 0, -1.1), (0, 0, 0), 12, r2=0.4)
    cyl(0.25, 1.0, mat(ORANGE, emit=1.0), (0, 0, -1.7), (180, 0, 0), 10, r2=0.02)
    cyl(0.12, 0.8, mat(YELLOW, emit=1.3), (0, 0, -1.55), (180, 0, 0), 8, r2=0.02)
    tilt(new_since(before), -50, (0, 0))
    bolt = [(0.15, 0.5), (-0.35, -0.05), (-0.05, -0.05), (-0.2, -0.55), (0.35, 0.1), (0.05, 0.1), (0.3, 0.5)]
    prism(bolt, 0.1, mat(YELLOW, emit=0.7), (-1.35, -0.4, 1.0), (90, 0, 0), 0.0)
    for z in (-0.3, 0.2):
        box(0.7, 0.06, 0.08, mat(YELLOW), (-1.7, -0.3, z - 0.9), bevel=0.0)


def icon_bloodthirst():
    gd = mat(GOLD, 0.25, 0.9)
    cyl(0.14, 0.9, gd, (0, 0, -0.5), (0, 0, 0), 8)
    cyl(0.6, 0.18, gd, (0, 0, -1.1), (0, 0, 0), 14)
    sphere(0.2, gd, (0, 0, -0.5), seg=8, rings=6)
    cyl(0.95, 1.1, gd, (0, 0, 0.55), (180, 0, 0), 18, r2=0.55)
    cyl(0.9, 0.04, mat("#b0141c", 0.15, emit=0.3), (0, 0, 1.08), (0, 0, 0), 18)
    torus(0.95, 0.06, mat("#f0c25e", 0.3, 0.9), (0, 0, 1.1), (0, 0, 0), maj=22, mnr=5)
    dm = mat(RED, 0.2, emit=0.2)
    drop(dm, (0.78, -0.2, 0.2), 2.0)
    drop(dm, (-1.25, -0.2, 0.8), 1.5)
    drop(dm, (1.25, -0.2, -0.5), 1.1)


def icon_fortress():
    st = mat("#b9b3a5", 0.8)
    st2 = mat("#9a948a", 0.8)
    box(2.5, 1.0, 1.1, st, (0, 0, -0.65), bevel=0.04)
    for sx in (-1, 1):
        box(0.85, 1.05, 2.1, st2, (1.05 * sx, 0, 0.0), bevel=0.04)
        for dx in (-0.3, 0.0, 0.3):
            box(0.2, 0.3, 0.3, st2, (1.05 * sx + dx, 0, 1.2), bevel=0.02)
        box(0.12, 0.08, 0.5, mat(DARK), (1.05 * sx, -0.53, 0.3), bevel=0.0)
    for x in (-0.5, 0.0, 0.5):
        box(0.28, 0.9, 0.28, st, (x, 0, 0.0), bevel=0.02)
    prism([(-0.4, -1.1), (-0.4, -0.25), (0, 0.1), (0.4, -0.25), (0.4, -1.1)], 0.1, mat(BROWN2, 0.7), (0, -0.52, -0.1), (90, 0, 0), 0.0)
    cyl(0.04, 0.8, mat(DARK), (-1.05, 0, 2.0), (0, 0, 0), 6)
    prism([(0, 0), (0.55, 0.15), (0, 0.3)], 0.04, mat(RED), (-0.78, 0, 2.18), (90, 0, 0), 0.0)


def icon_chainreaction():
    burst(mat(ORANGE, emit=0.6), (-0.1, 0.7, 0.2), 12, 1.1, 1.7, 0.08)
    burst(mat(YELLOW, emit=0.8), (-0.1, 0.6, 0.2), 12, 0.6, 1.05, 0.08)
    for k, (x, z, s) in enumerate(((-1.15, -0.55, 0.62), (0.15, -0.35, 0.5), (1.3, -0.1, 0.4))):
        sphere(s, mat("#2f2b3d", 0.35, 0.4), (x, -0.2, z), seg=14, rings=10)
        cyl(s * 0.3, s * 0.35, mat(STEEL, 0.4, 0.8), (x, -0.2, z + s * 0.95), (0, 0, 0), 10)
        sphere(0.1, mat(YELLOW, emit=1.4), (x + 0.12, -0.2, z + s * 1.35), seg=6, rings=4)
        prism(star_points(4, 0.25, 0.08), 0.05, mat(ORANGE, emit=1.0), (x + 0.12, -0.25, z + s * 1.35), (90, 0, 0), 0.0)
    bolt = [(0.1, 0.3), (-0.2, -0.03), (-0.02, -0.03), (-0.1, -0.3), (0.2, 0.05), (0.03, 0.05), (0.15, 0.3)]
    for (x, z) in ((-0.5, -0.1), (0.7, 0.0)):
        prism(bolt, 0.08, mat(YELLOW, emit=0.9), (x, -0.55, z - 0.1), (90, 0, 0), 0.0)


def icon_treasurehunter():
    wd = mat(BROWN, 0.7)
    box(1.7, 1.1, 0.9, wd, (-0.2, 0, -0.55), bevel=0.06)
    cyl(0.55, 1.7, wd, (-0.2, 0, 0.0), (0, 90, 0), 16)
    box(1.75, 1.15, 0.12, mat(STEEL, 0.3, 0.9), (-0.2, 0, -0.1), bevel=0.02)
    for x in (-0.85, 0.45):
        box(0.16, 1.14, 1.4, mat(STEEL, 0.3, 0.9), (x, 0, -0.2), bevel=0.02)
    box(0.3, 0.12, 0.34, mat(GOLD, 0.3, 0.9), (-0.2, -0.58, -0.1), bevel=0.02)
    sphere(0.65, mat(GOLD, 0.25, 0.9), (-0.2, 0.0, 0.1), (1.2, 0.8, 0.5), seg=10, rings=6)
    for (x, z) in ((-0.55, 0.35), (0.05, 0.4)):
        coin(x, z, -0.45, 0.22, 0.1)
    # magnifier
    mx, mz = 1.3, 0.75
    torus(0.6, 0.1, mat(DARK, 0.4), (mx, -0.5, mz), (90, 0, 0), maj=22, mnr=6)
    disc(0.58, 0.05, glass("#c9f0ff", 0.55, emit=0.2), (mx, -0.5, mz), 22)
    h = box(0.18, 0.18, 0.9, mat(BROWN2, 0.6), (mx + 0.55, -0.5, mz - 0.95), (0, -40, 0), 0.03)
    sparkle(0.9, 1.5, 0.28, c="#ffffff")


def icon_sage():
    pm = mat("#6a4cc4", 0.6)
    cyl(1.35, 0.14, pm, (0, 0, -0.55), (0, 0, 0), 22)
    cyl(0.85, 1.9, pm, (0.1, 0, 0.45), (0, 0, 0), 18, r2=0.06)
    cyl(0.87, 0.28, mat(YELLOW, 0.4), (0, 0, -0.35), (0, 0, 0), 18)
    prism(star_points(5, 0.34, 0.15), 0.08, mat(YELLOW, emit=0.7), (0.0, -0.85, 0.2), (90, 0, 0), 0.0)
    sphere(0.16, mat(YELLOW, emit=1.2), (0.35, -0.5, 1.1), seg=8, rings=6)
    prism(star_points(4, 0.2, 0.07), 0.06, mat(WHITE, emit=0.9), (-0.2, -0.8, 0.8), (90, 0, 0), 0.0)
    beard = mat(WHITE, 0.7)
    sphere(0.7, beard, (0, -0.1, -1.05), (1.0, 0.5, 1.0), seg=12, rings=8)
    cyl(0.4, 0.9, beard, (0, -0.1, -1.55), (180, 0, 0), 10, r2=0.04)
    for sx in (-1, 1):
        sphere(0.09, mat(DARK), (0.28 * sx, -0.48, -0.75), seg=6, rings=4)
    sparkle(1.5, 0.9, 0.3, c="#ffffff")


def icon_phantom():
    wh = mat("#f2f6ff", 0.5, emit=0.15)
    sphere(0.95, wh, (0.2, 0, 0.45), (1.0, 0.8, 1.0), seg=16, rings=12)
    cyl(0.95, 1.4, wh, (0.2, 0, -0.35), (0, 0, 0), 16)
    for k in range(4):
        sphere(0.26, wh, (0.2 - 0.72 + k * 0.48, 0, -1.08), (1.0, 0.8, 0.9), seg=8, rings=6)
    for sx in (-1, 1):
        sphere(0.17, mat(DARK), (0.2 + 0.35 * sx, -0.62, 0.6), (1, 0.4, 1.4), seg=8, rings=6)
        sphere(0.05, mat("#7fe3ff", emit=1.5), (0.2 + 0.35 * sx, -0.7, 0.67), seg=6, rings=4)
    sphere(0.14, mat(DARK), (0.2, -0.65, 0.1), (1, 0.4, 1.3), seg=8, rings=6)
    for k, (z, w) in enumerate(((0.6, 0.9), (0.1, 1.1), (-0.5, 0.8))):
        box(w, 0.07, 0.12, mat("#9fd4ff", emit=0.6), (-1.35 - w / 2 + 0.5, -0.1, z), bevel=0.0)
    for (x, z) in ((-1.4, 1.2), (1.6, 1.0)):
        sparkle(x, z, 0.25, c="#bfe6ff")


def icon_titan():
    st = mat("#8a8f9a", 0.8)
    st2 = mat("#6e737e", 0.8)
    box(1.8, 1.0, 1.6, st, (0, 0.1, -0.35), bevel=0.15)
    box(1.1, 0.9, 0.7, st2, (0, 0, 0.75), bevel=0.1)
    for sx in (-1, 1):
        box(0.7, 0.8, 0.8, st2, (1.2 * sx, 0, -0.1), bevel=0.12)
        box(0.8, 0.9, 0.9, st, (1.35 * sx, -0.15, -1.15), bevel=0.15)
        for dx in (-0.25, 0.0, 0.25):
            box(0.16, 0.1, 0.2, st2, (1.35 * sx + dx, -0.6, -1.0), bevel=0.02)
        sphere(0.12, mat("#ffb12a", emit=2.0), (0.26 * sx, -0.46, 0.8), (1, 0.4, 0.8), seg=8, rings=6)
    box(0.5, 0.06, 0.1, mat(DARK), (0, -0.46, 0.55), bevel=0.0)
    mo = mat("#56a357", 0.8)
    sphere(0.34, mo, (-0.55, -0.45, 0.1), (1.3, 0.4, 0.7), seg=8, rings=6)
    sphere(0.28, mo, (0.5, -0.5, -0.5), (1.3, 0.4, 0.7), seg=8, rings=6)
    for a in (-1, 1):
        sparkle(1.4 * a, 1.2, 0.2, c="#ffffff")


def icon_levelup():
    """The LEVEL UP badge: a gold ribbon with swallow tails, a medal with an up arrow and a few sparkles."""
    gold, gold2, red2 = mat(GOLD, 0.3, 0.7), mat("#e0a21f", 0.35, 0.7), mat("#b82a24", 0.5)
    for sx in (-1, 1):
        # folded back tails behind the ribbon
        prism([(0, 0.45), (1.0, 0.45), (0.75, 0.0), (1.0, -0.45), (0, -0.45)], 0.2, red2, (sx * 1.75, 0.2, -0.1), (90, 0, 0 if sx > 0 else 180), 0.02)
    box(3.6, 0.35, 0.95, mat(RED, 0.45), (0, 0, 0), bevel=0.06)
    box(3.6, 0.37, 0.08, gold, (0, 0, 0.4), bevel=0.0)
    box(3.6, 0.37, 0.08, gold, (0, 0, -0.4), bevel=0.0)
    for sx in (-1, 1):
        for k in range(3):
            x = sx * (1.1 + k * 0.38)
            prism([(-0.14, -0.22), (0.14, 0), (-0.14, 0.22), (-0.04, 0)], 0.1, gold, (x, -0.2, 0), (90, 0, 90 if sx > 0 else -90), 0.0)
        prism(star_points(5, 0.2, 0.09), 0.08, mat(YELLOW, emit=0.5), (sx * 1.5, -0.2, 0.0), (90, 0, 0), 0.0)
    disc(1.15, 0.4, gold, (0, 0, 0), 28)
    torus(1.15, 0.14, gold2, (0, -0.2, 0), (90, 0, 0), maj=28, mnr=8)
    disc(0.9, 0.12, mat("#2f8fe8", 0.35), (0, -0.28, 0), 28)
    arrow = [(0, 0.8), (0.62, 0.05), (0.26, 0.05), (0.26, -0.7), (-0.26, -0.7), (-0.26, 0.05), (-0.62, 0.05)]
    prism([(x * 0.82, y * 0.82) for x, y in arrow], 0.14, mat(WHITE, 0.4), (0, -0.4, 0), (90, 0, 0), 0.03)
    for (x, z, sz) in ((-2.7, 0.75, 0.28), (2.7, 0.8, 0.24), (1.55, 0.95, 0.2), (-1.5, 0.95, 0.17)):
        prism(star_points(4, sz, sz * 0.3), 0.06, mat(YELLOW, emit=0.7), (x, -0.4, z), (90, 0, 0), 0.0)


ICONS += [
    "glasscannon", "padding", "lightfoot", "snack", "hoarder", "quickstep", "bookworm", "steadyhands", "bruiser", "patience",
    "grit", "scrappile", "tinker", "sprinter", "itchytrigger", "stout", "luckypenny", "helpinghand", "shortfuse", "peptalk",
    "overclock", "heavyhitter", "reinforced", "lifeline", "sharpeyes", "windrunner", "mender", "magnetic", "prospector", "grenadepouch",
    "forcefield", "spikedarmor", "quickstudy", "fieldmedic", "dashmaster", "demolition", "riskreward", "stalwart", "armorpiercer", "rapidreload",
    "juggernaut", "executioner", "blitz", "bloodthirst", "fortress", "chainreaction", "treasurehunter", "sage", "phantom", "titan",
]


# ------------------------------------------------------------------------------------------------ rendering

def setup_scene():
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE"
    except TypeError:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.eevee.taa_render_samples = 48
    # a dark outline gives the toys a sticker look and keeps light objects readable on the card plate
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"
    sc.render.line_thickness = 1.3
    vl = bpy.context.view_layer
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new("outline")
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    ls.linestyle.color = (0.17, 0.12, 0.07)
    ls.linestyle.thickness = 1.6
    w = bpy.data.worlds.new("w") if not bpy.data.worlds else bpy.data.worlds[0]
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = lin("#fff1dc")
    bg.inputs["Strength"].default_value = 0.75


def frame_and_render(name):
    sc = bpy.context.scene
    w_px, h_px = WIDE.get(name, (SIZE, SIZE))
    sc.render.resolution_x, sc.render.resolution_y = w_px, h_px
    sc.render.resolution_percentage = 100
    objs = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in [o for o in bpy.data.objects if o.type in ("LIGHT", "CAMERA")]:
        bpy.data.objects.remove(o, do_unlink=True)
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.2
    sun.data.color = (1.0, 0.9, 0.75)
    sun.data.angle = math.radians(25)
    sun.rotation_euler = Euler((math.radians(50), math.radians(8), math.radians(40)), "XYZ")
    coll.objects.link(sun)
    fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "SUN"))
    fill.data.energy = 0.9
    fill.data.color = (0.75, 0.85, 1.0)
    fill.rotation_euler = Euler((math.radians(60), 0, math.radians(-140)), "XYZ")
    coll.objects.link(fill)
    # camera: orthographic, looking slightly down from the front-right (the game's own view angle)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type = "ORTHO"
    coll.objects.link(cam)
    sc.camera = cam
    view = Vector((math.sin(math.radians(28)) * math.cos(math.radians(24)), -math.cos(math.radians(28)) * math.cos(math.radians(24)), math.sin(math.radians(24))))
    cam.rotation_euler = (-view).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()
    corners = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
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
    cam.data.ortho_scale = max(max(xs) - min(xs), (max(ys) - min(ys)) * w_px / h_px) * 1.12
    cam.data.clip_end = 60
    out_dir = (os.environ.get("OUT_DIR") or UI_DIR) if name in WIDE else OUT_DIR
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name + ".png")
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


def contact_sheet(path, names, cols=5):
    """All rendered cards on one image (for a quick look); needs numpy, which Blender ships."""
    import numpy as np
    rows = (len(names) + cols - 1) // cols
    canvas = np.zeros((rows * SIZE, cols * SIZE, 4), dtype=np.float32)
    canvas[...] = (0.91, 0.87, 0.79, 1.0)
    for i, n in enumerate(names):
        img = bpy.data.images.load(os.path.join(OUT_DIR, n + ".png"))
        a = np.array(img.pixels[:], dtype=np.float32).reshape(SIZE, SIZE, 4)
        bpy.data.images.remove(img)
        r, c = divmod(i, cols)
        y0 = (rows - 1 - r) * SIZE
        tile = canvas[y0:y0 + SIZE, c * SIZE:(c + 1) * SIZE]
        al = a[..., 3:4]
        tile[..., :3] = a[..., :3] * al + tile[..., :3] * (1 - al)
    out = bpy.data.images.new("sheet", cols * SIZE, rows * SIZE, alpha=True)
    out.pixels = canvas.reshape(-1).tolist()
    out.filepath_raw = path
    out.file_format = "PNG"
    out.save()


def run():
    setup_scene()
    report = {}
    names = [n for n in ICONS if not ONLY or n in ONLY]
    names += [n for n in WIDE if ONLY and n in ONLY]
    for name in names:
        reset()
        _mats.clear()
        globals()["icon_" + name]()
        path = frame_and_render(name)
        cov = coverage(path)
        report[name] = round(cov, 3)
        print("card %-11s coverage %.0f%%" % (name, cov * 100))
        if name in WIDE:
            continue
        if cov < 0.08 or cov > 0.92:
            raise ValueError("card %s looks wrong: %.0f%% of the image is covered" % (name, cov * 100))
    sheet_path = os.environ.get("SHEET")
    if sheet_path:
        contact_sheet(sheet_path, [n for n in names if n not in WIDE])
    return report


RESULT = run()
print(RESULT)
