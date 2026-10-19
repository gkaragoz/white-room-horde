"""Render the upgrade card illustrations: one small low-poly toy diorama per card (docs/DESIGN.md section 9).

  blender -b --factory-startup --python tools/blender/make_cards.py                 all cards
  ONLY=damage,crit blender -b --factory-startup --python tools/blender/make_cards.py
  OUT_DIR=some/dir ...                                                              default packages/client/public/cards
  SHEET=contact.png ...                                                             also write a contact sheet of the renders

Every card is built from a handful of primitives in the game's flat-shaded toy look and rendered with a transparent
background at 256x256 (the UI puts it on a rarity coloured plate). Decorations that face the viewer sit at negative Y,
the camera looks from the front-right. The script checks that each image really has content and fails otherwise.
"""
import bpy, bmesh, os, math, sys
from mathutils import Vector, Euler

HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/make_cards.py")))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.environ.get("OUT_DIR") or os.path.join(REPO, "packages", "client", "public", "cards")
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


# ------------------------------------------------------------------------------------------------ rendering

def setup_scene():
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE"
    except TypeError:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x = sc.render.resolution_y = SIZE
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
    cam.data.ortho_scale = max(max(xs) - min(xs), max(ys) - min(ys)) * 1.22
    cam.data.clip_end = 60
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name + ".png")
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
    for name in names:
        reset()
        _mats.clear()
        globals()["icon_" + name]()
        path = frame_and_render(name)
        cov = coverage(path)
        report[name] = round(cov, 3)
        print("card %-11s coverage %.0f%%" % (name, cov * 100))
        if cov < 0.08 or cov > 0.92:
            raise ValueError("card %s looks wrong: %.0f%% of the image is covered" % (name, cov * 100))
    sheet_path = os.environ.get("SHEET")
    if sheet_path:
        contact_sheet(sheet_path, names)
    return report


RESULT = run()
print(RESULT)
