"""Render the 90 class card illustrations: one small low-poly toy diorama per card (docs/DESIGN.md section 9).

  blender -b --factory-startup --python tools/blender/make_class_cards.py                 all 90 cards
  ONLY=rallycry,tank blender -b --factory-startup --python tools/blender/make_class_cards.py
  OUT_DIR=some/dir ...                                                                    default packages/client/public/cards
  SHEETS=some/dir ...                                                                     also write one contact sheet per class there

Same toy look as make_cards.py (the 36 + 50 universal cards), kept in its own file so both can be rendered in parallel.
Each class has a motif (soldier: flag, tags, helmet; medic: red cross, syringe; heavy: plates, shield; scout: boots, wings;
demolisher: bombs, rockets; ranger: bow, arrows, eye; berserker: axe, blood, horns; swordsman: blades, whirl;
hammerer: hammers, cracks, anvil) and every card adds a second element that matches its name / effect
(clock = cooldown, rings = radius, hourglass = duration, starburst = damage, arrows = more of something ...).
The ids and names come from tools/cards/classes.py. The script fails if an icon is missing or looks empty.
"""

import bpy, bmesh, os, math, sys
from mathutils import Vector, Euler

HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/make_class_cards.py")))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.environ.get("OUT_DIR") or os.path.join(REPO, "packages", "client", "public", "cards")
ONLY = [x for x in os.environ.get("ONLY", "").split(",") if x] or None
SHEETS = os.environ.get("SHEETS")
sys.path.insert(0, os.path.join(REPO, "tools", "cards"))
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
_cur = []


def reset():
    global coll, _cur
    _cur = []
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
    _cur.append(obj)
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





# ------------------------------------------------------------------------------------------------ groups and parts
# Everything below is built in local coordinates and dropped into the scene through G(loc, scale, rot): a group that
# moves, scales and tilts a part. tilt = rotation in the picture plane (positive = clockwise as seen from the camera).

BROWN, STONE, CYAN, DKRED, LEAF, SAND = "#8a5a2b", "#9a9486", "#7fe3ff", "#8a1f1f", "#7fcf6a", "#e6d3a3"


class G:
    def __init__(self, loc=(0, 0, 0), sc=1.0, rot=(0, 0, 0)):
        self.loc, self.sc, self.rot = loc, sc, rot

    def __enter__(self):
        global _cur
        self.outer = _cur
        _cur = []
        return self

    def __exit__(self, *a):
        global _cur
        e = bpy.data.objects.new("grp", None)
        coll.objects.link(e)
        e.location = Vector(self.loc)
        e.rotation_euler = Euler([math.radians(a_) for a_ in self.rot], "XYZ")
        e.scale = Vector((self.sc,) * 3)
        for o in _cur:
            o.parent = e
        _cur = self.outer
        _cur.append(e)


def T(a):
    """tilt in the picture plane"""
    return (0, a, 0)


def flat(pts, d, m, loc=(0, 0, 0), tilt=0, bevel=0.02):
    """An outline in the XZ plane (x right, y = up) extruded d along the view axis."""
    return prism(pts, d, m, loc, (90, tilt, 0), bevel)


def disc(r, d, m, loc=(0, 0, 0), verts=24):
    return cyl(r, d, m, loc, (90, 0, 0), verts)


def dome(r, m, loc=(0, 0, 0), scale=(1, 1, 1), seg=14, rings=8):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True)
    return _finish("dome", bm, m, loc, (0, 0, 0), scale, 0.0)


def METAL():
    return mat(STEEL, 0.3, 0.8)


def DARKM():
    return mat(DARK, 0.4, 0.5)


# ---- symbols (the "second element" that says what the card changes)

def clock(loc=(0, 0, 0), s=1.0, col=RED):
    with G(loc, s):
        disc(0.62, 0.16, mat(col, 0.4), (0, 0, 0))
        disc(0.5, 0.2, mat(WHITE), (0, -0.02, 0))
        for a in range(0, 360, 90):
            box(0.07, 0.05, 0.12, mat(DARK), (math.sin(math.radians(a)) * 0.38, -0.13, math.cos(math.radians(a)) * 0.38), (0, -a, 0), 0.0)
        box(0.08, 0.05, 0.36, mat(DARK), (0, -0.13, 0.15), bevel=0.0)
        box(0.3, 0.05, 0.08, mat(DARK), (0.13, -0.13, 0), bevel=0.0)
        sphere(0.07, mat(DARK), (0, -0.13, 0), seg=8, rings=6)
        for sx in (-1, 1):
            sphere(0.17, mat(col, 0.4), (sx * 0.42, 0, 0.55), (1, 0.6, 1), seg=8, rings=6)


def hourglass(loc=(0, 0, 0), s=1.0):
    with G(loc, s):
        wood = mat(BROWN, 0.5)
        for z in (-0.95, 0.95):
            cyl(0.62, 0.14, wood, (0, 0, z), (0, 0, 0), 12)
        glass = mat("#d8f0ff", 0.1)
        cyl(0.05, 0.85, glass, (0, 0, 0.47), (0, 0, 0), 12, r2=0.5)
        cyl(0.5, 0.85, glass, (0, 0, -0.47), (0, 0, 0), 12, r2=0.05)
        sand = mat(YELLOW, 0.5)
        cyl(0.04, 0.55, sand, (0, 0, 0.62), (0, 0, 0), 10, r2=0.33)
        cyl(0.36, 0.45, sand, (0, 0, -0.68), (0, 0, 0), 10, r2=0.04)
        for a in (30, 150, 270):
            cyl(0.05, 1.8, wood, (0.55 * math.cos(math.radians(a)), 0.55 * math.sin(math.radians(a)), 0), (0, 0, 0), 6)


def rings(loc=(0, 0, 0), s=1.0, cols=(YELLOW, ORANGE, RED), r0=0.55, step=0.42, thick=0.07):
    with G(loc, s):
        for i, c in enumerate(cols):
            torus(r0 + i * step, thick, mat(c, 0.4, emit=0.3), (0, 0, 0), (0, 0, 0), 36, 6)


def glint(loc=(0, 0, 0), s=1.0, col=WHITE, n=4):
    with G(loc, s):
        flat(star_points(n, 0.7, 0.16), 0.1, mat(col, 0.3, emit=0.5), bevel=0.0)


def sparkle(loc=(0, 0, 0), s=1.0, col="#bff3ff"):
    glint(loc, s, col, 4)


def drop(loc=(0, 0, 0), s=1.0, col=RED):
    with G(loc, s):
        m = mat(col, 0.3)
        sphere(0.36, m, (0, 0, -0.1), seg=12, rings=8)
        cyl(0.33, 0.7, m, (0, 0, 0.3), (0, 0, 0), 12, r2=0.0)


def bolt(loc=(0, 0, 0), s=1.0, col=YELLOW):
    with G(loc, s):
        flat([(0.15, 1.0), (-0.55, 0.0), (-0.1, 0.0), (-0.3, -1.0), (0.55, 0.1), (0.05, 0.1), (0.4, 1.0)], 0.3, mat(col, 0.4, emit=0.3))


def up_arrow(loc=(0, 0, 0), s=1.0, col=GREEN):
    with G(loc, s):
        flat([(0, 1), (0.7, 0.2), (0.28, 0.2), (0.28, -0.9), (-0.28, -0.9), (-0.28, 0.2), (-0.7, 0.2)], 0.25, mat(col, 0.4, emit=0.15))


def chevrons(loc=(0, 0, 0), s=1.0, n=3, col=BLUE):
    """speed chevrons pointing right"""
    with G(loc, s):
        for k in range(n):
            flat([(0, 0.8), (0.6, 0), (0, -0.8), (-0.26, -0.8), (0.34, 0), (-0.26, 0.8)], 0.22, mat(col, 0.4, emit=0.1), (-0.7 + k * 0.7, 0, 0))


def streaks(loc=(0, 0, 0), s=1.0, col=YELLOW, n=3):
    with G(loc, s):
        for k in range(n):
            box(1.0 - k * 0.2, 0.08, 0.1, mat(col, 0.4, emit=0.2), (0, 0, (k - (n - 1) / 2) * 0.4), bevel=0.0)


def starburst(loc=(0, 0, 0), s=1.0, n=10, back=0.5, cols=(ORANGE, YELLOW)):
    with G(loc, s):
        burst(mat(cols[0], emit=0.3), (0, back, 0), n, 0.85, 1.45)
        burst(mat(cols[1], emit=0.4), (0, back - 0.2, 0), n, 0.5, 1.0)


def heart(loc=(0, 0, 0), s=1.0, col=RED, cross_=False):
    with G(loc, s):
        r = mat(col, 0.4)
        sphere(0.62, r, (-0.45, 0, 0.35), seg=14, rings=10)
        sphere(0.62, r, (0.45, 0, 0.35), seg=14, rings=10)
        cyl(1.0, 1.15, r, (0, 0, -0.38), (180, 0, 45), 4, r2=0.05)
        if cross_:
            plus((0, -0.62, 0.12), 0.8, WHITE)


def plus(loc=(0, 0, 0), s=1.0, col=RED):
    with G(loc, s):
        box(0.34, 0.14, 1.0, mat(col), (0, 0, 0), bevel=0.03)
        box(1.0, 0.14, 0.34, mat(col), (0, 0, 0), bevel=0.03)


def feather(loc=(0, 0, 0), s=1.0, tilt=0, col=WHITE, edge=BLUE):
    with G(loc, s):
        pts = [(0, -1), (0.28, -0.3), (0.42, 0.3), (0.22, 0.85), (0, 1.1), (-0.12, 0.7), (-0.3, 0.1), (-0.2, -0.5)]
        flat(pts, 0.08, mat(col, 0.5), (0, 0, 0), tilt)
        box(0.05, 0.1, 2.1, mat(edge), (0, 0, 0), (0, tilt, 0), 0.0)


def wing(loc=(0, 0, 0), s=1.0, side=1, col=WHITE):
    with G(loc, s, (0, 0, 0)):
        for i, (ang, ln) in enumerate(((20, 1.0), (45, 1.15), (68, 1.1), (90, 0.95))):
            a = ang * side
            f = [(0, 0), (0.2, ln * 0.3), (0.17, ln * 0.8), (0, ln), (-0.17, ln * 0.8), (-0.2, ln * 0.3)]
            flat(f, 0.06, mat(col if i % 2 else "#e8f1ff", 0.5), (0, -0.01 * i, 0), a, 0.01)


def eye(loc=(0, 0, 0), s=1.0, iris=GREEN, bull=False):
    with G(loc, s):
        pts = []
        for i in range(13):
            x = -1.2 + 2.4 * i / 12
            pts.append((x, 0.55 * (1 - (x / 1.2) ** 2)))
        for i in range(11, 0, -1):
            x = -1.2 + 2.4 * i / 12
            pts.append((x, -0.55 * (1 - (x / 1.2) ** 2)))
        flat(pts, 0.2, mat(WHITE, 0.4), (0, 0, 0), 0, 0.03)
        if bull:
            for k, c in enumerate((RED, WHITE, RED, DARK)):
                disc(0.5 - k * 0.12, 0.08, mat(c, 0.4), (0, -0.12 - k * 0.02, 0), 20)
        else:
            disc(0.46, 0.1, mat(iris, 0.4), (0, -0.12, 0), 20)
            disc(0.22, 0.1, mat(DARK), (0, -0.17, 0), 16)
            disc(0.09, 0.1, mat(WHITE), (-0.14, -0.22, 0.14), 8)


def crosshair(loc=(0, 0, 0), s=1.0, col=RED):
    with G(loc, s):
        torus(0.7, 0.07, mat(col, 0.4, emit=0.2), (0, 0, 0), (90, 0, 0), 28, 6)
        for a in (0, 90):
            box(0.08, 0.08, 1.9, mat(col, 0.4, emit=0.2), (0, 0, 0), (0, a, 0), 0.0)
        disc(0.1, 0.1, mat(col, 0.4, emit=0.3), (0, -0.04, 0), 10)


def crack(loc=(0, 0, 0), s=1.0, rot_z=0, n=5, col=DARK, w=0.12):
    """A zigzag fissure lying on the ground (XY plane)."""
    with G(loc, s, (0, 0, rot_z)):
        x, y = -0.9, 0.0
        for i in range(n):
            nx = x + 1.8 / n
            ny = (0.28 if i % 2 == 0 else -0.28) * (1 if i < n - 1 else 0.3)
            dx, dy = nx - x, ny - y
            box(math.hypot(dx, dy) + 0.05, w, 0.06, mat(col, 0.6), ((x + nx) / 2, (y + ny) / 2, 0), (0, 0, math.degrees(math.atan2(dy, dx))), 0.0)
            x, y = nx, ny


def slab(loc=(0, 0, 0), s=1.0, w=3.2, d=2.2, col=STONE):
    with G(loc, s):
        box(w, d, 0.32, mat(col, 0.7), (0, 0, -0.16), bevel=0.05)
        box(w + 0.1, d + 0.1, 0.12, mat("#7e7868", 0.7), (0, 0, -0.38), bevel=0.03)


def rock(loc=(0, 0, 0), s=1.0, col=STONE, rot=(20, 30, 10)):
    with G(loc, s):
        box(0.5, 0.45, 0.4, mat(col, 0.7), (0, 0, 0), rot, 0.06)


def swirl(loc=(0, 0, 0), s=1.0, col="#bfe3ff", arc=240, R=0.8, rot=(90, 0, 0)):
    with G(loc, s):
        torus(R, 0.07, mat(col, 0.4, emit=0.2), (0, 0, 0), rot, 28, 6, arc)


# ---- tools and weapons (all drawn upright along Z, tilt through G)

def sword(loc=(0, 0, 0), s=1.0, tilt=0, blade=STEEL, guard=BRASS, thin=1.0, bloody=False):
    with G(loc, s, T(tilt)):
        flat([(-0.15 * thin, -0.7), (0.15 * thin, -0.7), (0.15 * thin, 0.9), (0, 1.3), (-0.15 * thin, 0.9)], 0.09, mat(blade, 0.25, 0.9), (0, 0, 0), 0, 0.01)
        box(0.05, 0.12, 1.5, mat("#8c95a6", 0.3, 0.9), (0, -0.03, 0.2), bevel=0.0)
        box(0.85, 0.16, 0.16, mat(guard, 0.3, 0.8), (0, 0, -0.78), bevel=0.04)
        cyl(0.075, 0.55, mat(BROWN, 0.6), (0, 0, -1.1), (0, 0, 0), 8)
        sphere(0.13, mat(guard, 0.3, 0.8), (0, 0, -1.42), seg=8, rings=6)
        if bloody:
            for x, z in ((0.0, 0.7), (0.08, 0.2), (-0.05, -0.2)):
                drop((x, -0.07, z), 0.2, RED)


def axe(loc=(0, 0, 0), s=1.0, tilt=0, bloody=False):
    with G(loc, s, T(tilt)):
        cyl(0.09, 2.5, mat(BROWN, 0.6), (0, 0, 0), (0, 0, 0), 8)
        cyl(0.13, 0.25, mat(DARK), (0, 0, -1.25), (0, 0, 0), 8)
        flat([(0.05, 0.5), (0.5, 0.7), (1.0, 1.0), (1.1, 0.35), (1.1, -0.35), (1.0, -1.0), (0.5, -0.7), (0.05, -0.5)], 0.18, mat(STEEL, 0.25, 0.9), (0, 0, 0.75), 0, 0.03)
        if bloody:
            for x, z in ((1.05, 0.35), (1.05, -0.2)):
                drop((x, -0.12, z + 0.2), 0.22, RED)


def hammer(loc=(0, 0, 0), s=1.0, tilt=0, head=DARK, big=False):
    with G(loc, s, T(tilt)):
        cyl(0.11, 2.6, mat(BROWN, 0.6), (0, 0, -0.1), (0, 0, 0), 8)
        w = 1.9 if big else 1.5
        box(w, 0.85, 0.85, mat(head, 0.35, 0.7), (0, 0, 1.0), bevel=0.06)
        for sx in (-1, 1):
            box(0.16, 0.9, 0.9, mat(BRASS, 0.3, 0.8), (sx * (w / 2 - 0.1), 0, 1.0), bevel=0.03)
        box(0.3, 0.3, 0.14, mat(BRASS, 0.3, 0.8), (0, 0, 0.5), bevel=0.02)


def shield(loc=(0, 0, 0), s=1.0, col=BLUE, trim=STEEL, emblem=YELLOW, tilt=0):
    pts = [(0, 1.1), (0.85, 0.75), (0.85, -0.05), (0.45, -0.75), (0, -1.1), (-0.45, -0.75), (-0.85, -0.05), (-0.85, 0.75)]
    with G(loc, s):
        flat(pts, 0.3, mat(trim, 0.3, 0.9), (0, 0, 0), tilt, 0.05)
        flat([(x * 0.75, y * 0.75) for x, y in pts], 0.3, mat(col, 0.4), (0, -0.07, 0), tilt, 0.03)
        if emblem:
            flat(star_points(5, 0.42, 0.18), 0.2, mat(emblem, 0.35, emit=0.2), (0, -0.2, 0.05), 0, 0.0)


def helmet(loc=(0, 0, 0), s=1.0, col=OLIVE, cross_=False, dent=False, horns=False):
    with G(loc, s):
        dome(0.85, mat(col, 0.45, 0.2), (0, 0, -0.1), (1, 1.05, 0.95), 16, 10)
        cyl(0.95, 0.16, mat(col, 0.45, 0.2), (0, 0, -0.12), (0, 0, 0), 20)
        box(0.2, 0.12, 0.55, mat(col, 0.45, 0.2), (0, -0.95, -0.35), bevel=0.03)
        if cross_:
            disc(0.36, 0.1, mat(WHITE), (0, -0.84, 0.25), 18)
            plus((0, -0.91, 0.25), 0.45, RED)
        if dent:
            sphere(0.3, mat("#3f4724", 0.6), (0.4, -0.55, 0.3), (1, 0.5, 1), 8, 6)
            for k in range(3):
                box(0.5, 0.08, 0.07, mat(DARK), (0.4, -0.88, 0.1 + 0.12 * k), (0, 0, -20), 0.0)
        if horns:
            for sx in (-1, 1):
                with G((sx * 0.85, 0, 0.3), 1.0, T(sx * 40)):
                    cyl(0.2, 1.0, mat(CREAM, 0.5), (0, 0, 0.5), (0, 0, 0), 10, r2=0.03)


def boot(loc=(0, 0, 0), s=1.0, col=BLUE, sole=WHITE, tilt=0):
    with G(loc, s, T(tilt)):
        box(1.7, 0.75, 0.28, mat(sole), (0, 0, -0.55), bevel=0.04)
        box(1.1, 0.7, 0.75, mat(col), (-0.28, 0, -0.08))
        box(0.75, 0.68, 0.5, mat(col, 0.4), (0.55, 0, -0.26))
        box(0.45, 0.72, 0.55, mat(sole), (-0.75, 0, 0.38))


def bullet_up(loc=(0, 0, 0), s=1.0, tilt=0):
    with G(loc, s, T(tilt)):
        bullet(mat(BRASS, 0.3, 0.9), mat(RED, 0.4), (0, 0, -0.5), (0, 0, 0), 1.0)


def bomb(loc=(0, 0, 0), s=1.0, col=DARK, fuse=1.0, lit=True):
    with G(loc, s):
        sphere(0.75, mat(col, 0.35, 0.3), (0, 0, 0), seg=16, rings=10)
        cyl(0.2, 0.22, mat(STEEL, 0.35, 0.8), (0, 0, 0.78), (0, 0, 0), 10)
        for k in range(3):
            box(0.07, 0.07, 0.3 * fuse, mat(BROWN, 0.6), (0.06 * k, 0, 0.98 + k * 0.2 * fuse), (0, -25 * k, 0), 0.0)
        if lit:
            glint((0.18, -0.05, 1.28 + 0.3 * fuse), 0.35, YELLOW, 4)
        sphere(0.14, mat("#ffffff", 0.2), (-0.32, -0.55, 0.3), seg=6, rings=4)


def rocket(loc=(0, 0, 0), s=1.0, tilt=0, body=WHITE, nose=RED, flame=True):
    with G(loc, s, T(tilt)):
        cyl(0.3, 1.5, mat(body, 0.35, 0.3), (0, 0, 0), (0, 0, 0), 14)
        cyl(0.3, 0.7, mat(nose, 0.4), (0, 0, 1.1), (0, 0, 0), 14, r2=0.02)
        cyl(0.31, 0.12, mat(DARK), (0, 0, 0.55), (0, 0, 0), 14)
        for a in (0, 120, 240):
            with G((0, 0, -0.55), 1.0, (0, 0, a)):
                box(0.06, 0.6, 0.55, mat(nose, 0.4), (0, 0.4, 0), (0, 0, 0), 0.0)
        sphere(0.12, mat(CYAN, 0.1, emit=0.8), (0, -0.28, 0.3), seg=8, rings=6)
        if flame:
            cyl(0.22, 0.7, mat(ORANGE, emit=0.6), (0, 0, -1.1), (0, 0, 0), 10, r2=0.02).rotation_euler = Euler((math.radians(180), 0, 0))


def barrel(loc=(0, 0, 0), s=1.0, col=RED):
    with G(loc, s):
        cyl(0.62, 1.4, mat(col, 0.45, 0.3), (0, 0, 0), (0, 0, 0), 16)
        for z in (-0.45, 0.45):
            cyl(0.65, 0.12, mat(STEEL, 0.35, 0.8), (0, 0, z), (0, 0, 0), 16)
        flat(star_points(3, 0.3, 0.12), 0.05, mat(YELLOW), (0, -0.63, 0.0), 0, 0.0)


def skull(loc=(0, 0, 0), s=1.0, col=CREAM, horns=False, flame=False):
    with G(loc, s):
        sphere(0.78, mat(col, 0.5), (0, 0, 0.2), (1, 0.95, 1.0), seg=14, rings=10)
        box(0.95, 0.7, 0.45, mat(col, 0.5), (0, -0.05, -0.55), bevel=0.06)
        for sx in (-1, 1):
            sphere(0.22, mat(DARK), (sx * 0.32, -0.66, 0.15), (1, 0.5, 1.1), 8, 6)
            if flame:
                sphere(0.08, mat(ORANGE, emit=1.0), (sx * 0.32, -0.8, 0.15), seg=6, rings=4)
        box(0.12, 0.1, 0.2, mat(DARK), (0, -0.74, -0.2), (0, 0, 0), 0.0)
        for k in range(4):
            box(0.1, 0.06, 0.2, mat(DARK), (-0.3 + k * 0.2, -0.43, -0.78), bevel=0.0)
        if horns:
            for sx in (-1, 1):
                with G((sx * 0.62, 0, 0.7), 1.0, T(sx * 35)):
                    cyl(0.22, 1.3, mat(BRASS, 0.4), (0, 0, 0.6), (0, 0, 0), 10, r2=0.03)


def bone(loc=(0, 0, 0), s=1.0, tilt=0, ln=2.0):
    with G(loc, s, T(tilt)):
        m = mat(CREAM, 0.5)
        cyl(0.14, ln, m, (0, 0, 0), (0, 0, 0), 8)
        for z in (-ln / 2, ln / 2):
            for sx in (-1, 1):
                sphere(0.2, m, (sx * 0.14, 0, z), seg=8, rings=6)


def anvil(loc=(0, 0, 0), s=1.0, col="#4a4f5c"):
    with G(loc, s):
        m = mat(col, 0.35, 0.7)
        box(1.5, 0.9, 0.3, m, (0, 0, -0.75), bevel=0.04)
        box(0.8, 0.6, 0.6, m, (0, 0, -0.35), bevel=0.04)
        box(1.9, 0.95, 0.45, mat("#5b6272", 0.3, 0.8), (0, 0, 0.17), bevel=0.05)
        cyl(0.4, 0.8, mat("#5b6272", 0.3, 0.8), (1.2, 0, 0.17), (0, 90, 0), 4, r2=0.05)


def fist(loc=(0, 0, 0), s=1.0, col=STEEL, tilt=0):
    with G(loc, s, T(tilt)):
        m = mat(col, 0.3, 0.8)
        box(1.3, 0.95, 1.1, m, (0, 0, 0), bevel=0.08)
        for k in range(4):
            box(0.3, 0.3, 0.55, m, (-0.48 + k * 0.32, -0.62 + 0.04 * k * 0, 0.1), (0, 0, 0), 0.05)
            box(0.28, 0.3, 0.3, mat("#8d95a3", 0.3, 0.8), (-0.48 + k * 0.32, -0.74, -0.12), (0, 0, 0), 0.05)
        box(0.45, 0.55, 0.3, m, (0.62, -0.35, -0.25), (0, 0, 0), 0.05)
        box(1.4, 1.05, 0.5, mat(BRASS, 0.35, 0.7), (0, 0, -0.85), bevel=0.06)


def syringe(loc=(0, 0, 0), s=1.0, tilt=0, liquid=ORANGE):
    with G(loc, s, T(tilt)):
        cyl(0.34, 1.7, mat("#cfe9ff", 0.1), (0, 0, 0.1), (0, 0, 0), 14)
        cyl(0.36, 0.8, mat(liquid, 0.3, emit=0.2), (0, 0, -0.25), (0, 0, 0), 14)
        cyl(0.42, 0.14, METAL(), (0, 0, 1.02), (0, 0, 0), 14)
        cyl(0.1, 0.9, METAL(), (0, 0, 1.45), (0, 0, 0), 10)
        box(0.9, 0.16, 0.12, METAL(), (0, 0, 1.9))
        cyl(0.04, 0.9, mat(STEEL, 0.2, 1.0), (0, 0, -1.15), (0, 0, 0), 8, r2=0.0)


def bow(loc=(0, 0, 0), s=1.0, tilt=0, arrow_=False):
    with G(loc, s, T(tilt)):
        torus(1.1, 0.09, mat(BROWN, 0.5), (0, 0, 0), (90, -90, 0), 28, 8, 180)
        box(0.03, 0.03, 2.2, mat(CREAM, 0.5), (0.02, 0, 0), bevel=0.0)
        box(0.2, 0.16, 0.4, mat(DARK), (-1.1, 0, 0), bevel=0.03)
        if arrow_:
            arrow((0.55, 0, 0), 1.0, 0, 2.3)


def arrow(loc=(0, 0, 0), s=1.0, tilt=0, ln=2.4, col=BRASS, head=STEEL, fl=RED):
    """An arrow along +X."""
    with G(loc, s, T(tilt)):
        cyl(0.05, ln, mat(col, 0.5), (0, 0, 0), (0, 90, 0), 8)
        cyl(0.17, 0.45, mat(head, 0.3, 0.8), (ln / 2 + 0.15, 0, 0), (0, 90, 0), 4, r2=0.0)
        for dz in (-1, 1):
            flat([(0, 0), (0.45, 0.28 * dz), (0.4, 0.0), (0.45, -0.28 * dz)], 0.05, mat(fl), (-ln / 2 + 0.2, 0, 0), 0, 0.0)
        for dy in (-1, 1):
            box(0.4, 0.28 * dy, 0.05, mat(fl), (-ln / 2 + 0.25, 0.14 * dy, 0), bevel=0.0)


def tank_toy(loc=(0, 0, 0), s=1.0):
    with G(loc, s):
        for sy in (-1, 1):
            box(2.2, 0.45, 0.6, mat(DARK, 0.5), (0, sy * 0.72, -0.4), bevel=0.15)
            for x in (-0.75, 0, 0.75):
                cyl(0.2, 0.5, mat(STEEL, 0.4, 0.6), (x, sy * 0.72, -0.4), (90, 0, 0), 10)
        box(2.0, 1.1, 0.55, mat(OLIVE, 0.5), (0, 0, -0.15), bevel=0.06)
        cyl(0.62, 0.45, mat("#7f8c4f", 0.5), (-0.1, 0, 0.3), (0, 0, 0), 14)
        cyl(0.1, 1.4, DARKM(), (1.0, 0, 0.35), (0, 90, 0), 10)
        cyl(0.15, 0.2, DARKM(), (1.7, 0, 0.35), (0, 90, 0), 10)
        flat(star_points(5, 0.3, 0.13), 0.05, mat(WHITE), (0, -0.62, -0.12), 0, 0.0)


def gauge(loc=(0, 0, 0), s=1.0):
    with G(loc, s):
        disc(1.0, 0.25, mat(DARK, 0.4), (0, 0, 0), 28)
        disc(0.85, 0.3, mat(WHITE), (0, -0.01, 0), 28)
        torus(0.68, 0.09, mat(GREEN), (0, -0.16, 0), (90, 0, 0), 28, 6, 90).rotation_euler = Euler((math.radians(90), math.radians(-30), 0))
        torus(0.68, 0.09, mat(RED), (0, -0.16, 0), (90, 0, 0), 28, 6, 70).rotation_euler = Euler((math.radians(90), math.radians(-120), 0))
        box(0.08, 0.06, 0.8, mat(RED, 0.3), (0.25, -0.2, 0.28), (0, 35, 0), 0.0)
        sphere(0.12, mat(DARK), (0, -0.2, 0), seg=8, rings=6)


def tag(loc=(0, 0, 0), s=1.0, tilt=0, col=STEEL):
    with G(loc, s, T(tilt)):
        flat([(-0.5, -0.7), (0.5, -0.7), (0.5, 0.45), (0.25, 0.75), (-0.25, 0.75), (-0.5, 0.45)], 0.1, mat(col, 0.3, 0.85), bevel=0.02)
        disc(0.1, 0.12, mat(DARK), (0, 0, 0.6), 8)
        for k in range(3):
            box(0.6 - k * 0.1, 0.05, 0.08, mat(DARK), (0, -0.07, 0.1 - k * 0.22), bevel=0.0)


def helmet_cap(loc=(0, 0, 0), s=1.0, col="#4f5a8c"):
    with G(loc, s):
        dome(0.8, mat(col, 0.5), (0, 0, -0.05), (1, 1, 0.8), 14, 8)
        cyl(0.86, 0.14, mat(DARK, 0.4), (0, 0, -0.08), (0, 0, 0), 18)
        box(1.1, 0.7, 0.1, mat(DARK, 0.4), (0, -0.7, -0.08), bevel=0.02)
        flat(star_points(5, 0.28, 0.12), 0.05, mat(YELLOW, emit=0.3), (0, -0.78, 0.2), 0, 0.0)



# ------------------------------------------------------------------------------------------------ the 90 icons
# One motif per class, a second element per card (clock = cooldown, rings = radius, hourglass = duration,
# starburst = damage, up arrow = more of something ...).

ICONS = {}


def ic(cid):
    def deco(fn):
        ICONS[cid] = fn
        return fn
    return deco


DECO = (1.35, -0.75, -0.85)  # where the small second element sits


def flag(loc=(0, 0, 0), s=1.0, col=BLUE, emblem=YELLOW, tilt=0):
    with G(loc, s, T(tilt)):
        cyl(0.07, 3.0, mat(STEEL, 0.3, 0.8), (0, 0, 0), (0, 0, 0), 8)
        sphere(0.13, mat(BRASS, 0.3, 0.8), (0, 0, 1.55), seg=8, rings=6)
        flat([(0.05, 1.35), (0.55, 1.45), (1.05, 1.3), (1.55, 1.4), (1.55, 0.35), (1.05, 0.25), (0.55, 0.4), (0.05, 0.3)], 0.07, mat(col, 0.5), (0, 0, 0), 0, 0.0)
        flat(star_points(5, 0.3, 0.13), 0.05, mat(emblem, 0.4, emit=0.2), (0.8, -0.05, 0.85), 0, 0.0)
        box(0.9, 0.9, 0.12, mat(STONE, 0.7), (0, 0, -1.55), bevel=0.04)


# ============================================================================================== soldier

@ic("rallycry")
def _():
    flag((-0.3, 0, 0), 0.95)
    hourglass(DECO, 0.55)
    for k, r in enumerate((0.5, 0.8)):
        torus(r, 0.05, mat(YELLOW, emit=0.3), (-0.75, -0.3, 0.9), (90, 0, 0), 24, 5, 100).rotation_euler = Euler((math.radians(90), math.radians(-130 + 0), 0))


@ic("drillsergeant")
def _():
    helmet_cap((0, 0, 0.3), 1.6)
    rings((0, 0, -0.95), 1.0, (YELLOW, BRASS, OLIVE))


@ic("standardissue")
def _():
    tag((-0.55, 0, 0.1), 1.3, -12)
    tag((0.3, -0.1, -0.1), 1.3, 14, "#c9d0dc")
    bullet_up((1.35, -0.4, -0.85), 0.9)
    box(1.7, 0.08, 0.08, mat(STEEL, 0.3, 0.8), (-0.1, 0.1, 1.05), (0, 20, 0), 0.0)


@ic("fieldrations")
def _():
    cyl(0.8, 1.2, mat(OLIVE, 0.5), (-0.15, 0, -0.1), (0, 0, 0), 18)
    for z in (-0.4, 0.2):
        cyl(0.83, 0.1, mat("#59622f", 0.5), (-0.15, 0, z), (0, 0, 0), 18)
    cyl(0.84, 0.5, mat(CREAM, 0.5), (-0.15, 0, -0.1), (0, 0, 0), 18)
    box(0.5, 0.05, 0.3, mat(RED), (-0.15, -0.85, -0.1), bevel=0.0)
    cyl(0.45, 0.12, mat(STEEL, 0.3, 0.9), (-0.15, 0, 0.55), (0, 0, 0), 14)
    torus(0.18, 0.04, mat(STEEL, 0.3, 0.9), (0.1, 0, 0.66), (0, 0, 0), 12, 6)
    heart((1.4, -0.45, 0.95), 0.5)


@ic("battlehardened")
def _():
    helmet((0, 0, 0.35), 1.15, OLIVE, dent=True)
    chevrons((0, -0.4, -1.05), 0.42, 3, YELLOW)


@ic("tacticalreload")
def _():
    box(0.8, 0.5, 1.7, mat(DARK, 0.45, 0.6), (-0.4, 0, 0.1), (0, 8, 0), 0.05)
    for k in range(5):
        box(0.62, 0.52, 0.16, mat(BRASS, 0.3, 0.8), (-0.4 + 0.02 * k, 0, 0.7 - k * 0.3), (0, 8, 0), 0.02)
    torus(0.85, 0.12, mat(GREEN, 0.4, emit=0.2), (0.85, -0.3, -0.25), (90, 0, 0), 28, 8, 270).rotation_euler = Euler((math.radians(90), math.radians(40), 0))
    flat([(0, 0.5), (0.5, -0.3), (-0.5, -0.3)], 0.2, mat(GREEN, 0.4, emit=0.2), (1.62, -0.3, -0.45), 20, 0.0)


@ic("suppression")
def _():
    for k, z in enumerate((0.7, 0.0, -0.7)):
        with G((-0.4 + 0.25 * (k % 2), -0.1 * k, z), 0.8, T(90)):
            bullet(mat(BRASS, 0.3, 0.9), mat(RED, 0.4), (0, 0, -0.5))
        streaks((-1.55, -0.2 * k, z), 0.7, YELLOW, 2)
    for k in range(3):
        box(0.7, 0.8, 0.45, mat(SAND, 0.8), (1.0, 0.2, -0.85 + k * 0.45), (0, 0, 5 * k - 5), 0.12)
    box(0.7, 0.8, 0.45, mat(SAND, 0.8), (1.0, 0.2, -0.85), (0, 0, 0), 0.12)


@ic("officer")
def _():
    helmet_cap((-0.1, 0, 0.1), 1.2)
    clock(DECO, 0.65)


@ic("vanguard")
def _():
    chevrons((-0.5, 0, 0), 1.1, 3, OLIVE)
    bullet_up((1.2, -0.3, -0.9), 0.9, 90)


@ic("warhero")
def _():
    starburst((0, 0, 0.35), 1.25, 12, 0.6)
    flat([(-0.5, 0.4), (-0.1, 0.4), (0.7, -1.2), (0.2, -1.2)], 0.1, mat(RED, 0.5), (0, -0.15, 0.7), 0, 0.0)
    flat([(0.5, 0.4), (0.1, 0.4), (-0.7, -1.2), (-0.2, -1.2)], 0.1, mat(BLUE, 0.5), (0, -0.2, 0.7), 0, 0.0)
    disc(0.85, 0.2, mat(BRASS, 0.25, 0.9), (0, -0.3, -0.5))
    flat(star_points(5, 0.65, 0.28), 0.1, mat(YELLOW, 0.3, emit=0.4), (0, -0.45, -0.5), 0, 0.0)


# ============================================================================================== medic

@ic("bigheart")
def _():
    heart((0, 0, 0.35), 1.25, RED, True)
    rings((0, 0, -1.15), 1.3, (PINK, "#ff9ab8", WHITE))


@ic("quickpatch")
def _():
    with G((-0.2, 0, 0), 1.2, T(-30)):
        box(2.2, 0.3, 0.9, mat("#e8c9a0", 0.6), bevel=0.12)
        box(0.9, 0.34, 0.9, mat(WHITE, 0.6), (0, -0.02, 0), bevel=0.05)
        plus((0, -0.2, 0), 0.5, RED)
        for sx in (-1, 1):
            for dz in (-0.2, 0.2):
                disc(0.05, 0.34, mat("#c9a77c"), (sx * 0.8, -0.02, dz), 6)
    clock(DECO, 0.7)


@ic("triageexpert")
def _():
    starburst((0, 0.3, 0.1), 1.3, 10, 0.8, (YELLOW, "#fff6c9"))
    box(1.7, 0.18, 2.3, mat(BROWN, 0.5), (0, 0, 0), bevel=0.06)
    box(1.45, 0.1, 2.0, mat(WHITE, 0.5), (0, -0.12, -0.03), bevel=0.02)
    box(0.7, 0.2, 0.3, METAL(), (0, -0.14, 1.1), bevel=0.04)
    plus((0, -0.2, 0.15), 0.8, RED)
    for z in (-0.65, -0.9):
        box(1.0, 0.05, 0.08, mat(DARK), (0, -0.18, z), bevel=0.0)


@ic("sterilize")
def _():
    cyl(0.62, 1.25, mat("#cfe9ff", 0.1), (-0.25, 0, -0.1), (0, 0, 0), 14)
    cyl(0.64, 0.7, mat(CYAN, 0.2, emit=0.2), (-0.25, 0, -0.35), (0, 0, 0), 14)
    cyl(0.25, 0.4, mat(WHITE), (-0.25, 0, 0.7), (0, 0, 0), 12)
    box(0.8, 0.18, 0.2, mat(RED, 0.4), (0.0, 0, 1.0), (0, 0, 0), 0.04)
    plus((-0.25, -0.64, -0.1), 0.5, RED)
    for x, z, s_ in ((1.1, 0.5, 0.55), (0.9, -0.5, 0.4), (1.45, -0.15, 0.3)):
        sparkle((x, -0.3, z), s_)


@ic("adrenalshot")
def _():
    syringe((-0.3, 0, -0.1), 1.0, 40, ORANGE)
    bolt((1.35, -0.4, 0.8), 0.6)


@ic("pharmacist")
def _():
    cyl(0.6, 1.4, mat("#d98a1f", 0.3), (-0.4, 0, -0.1), (0, 0, 0), 16)
    cyl(0.64, 0.35, mat(WHITE), (-0.4, 0, 0.75), (0, 0, 0), 16)
    box(0.75, 0.05, 0.6, mat(WHITE), (-0.4, -0.62, -0.1), bevel=0.0)
    plus((-0.4, -0.66, -0.1), 0.4, RED)
    for k, (x, z, t) in enumerate(((0.9, -0.85, 25), (1.45, -0.55, -30))):
        with G((x, -0.2, z), 0.8, T(t)):
            cyl(0.28, 0.8, mat(WHITE), (0, 0, 0.3), (90, 0, 0), 10).rotation_euler = Euler((0, math.radians(90), 0))
            sphere(0.28, mat(RED if k else BLUE, 0.4), (0.4, 0, 0), seg=10, rings=6)
            sphere(0.28, mat(WHITE), (-0.4, 0, 0), seg=10, rings=6)
    heart((1.3, -0.2, 0.9), 0.5)


@ic("healingaura")
def _():
    for r, c in ((1.45, "#9be8b0"), (1.15, GREEN)):
        torus(r, 0.09, mat(c, 0.4, emit=0.4), (0, 0.3, 0.1), (90, 0, 0), 36, 6)
    plus((0, 0, 0.1), 1.35, RED)
    for x, z in ((-1.45, -1.0), (1.4, -1.1), (1.45, 1.1)):
        plus((x, -0.2, z), 0.35, GREEN)


@ic("lifeforce")
def _():
    heart((-0.2, 0, 0.1), 1.2, DKRED)
    up_arrow((1.3, -0.4, 0.5), 0.8)
    drop((1.3, -0.4, -0.85), 0.8, RED)


@ic("combatmedic")
def _():
    helmet((-0.1, 0, 0.2), 1.2, OLIVE, cross_=True)
    bullet_up((1.45, -0.4, -0.75), 0.85, 20)


@ic("miracle")
def _():
    starburst((0, 0.8, 0.2), 1.1, 12, 0.8, (ORANGE, YELLOW))
    wing((0.3, -0.1, -0.1), 1.7, 1, "#cfe3ff")
    wing((-0.3, -0.1, -0.1), 1.7, -1, "#cfe3ff")
    plus((0, -0.5, 0.1), 1.3, RED)
    clock((1.45, -0.7, -1.0), 0.7, YELLOW)


# ============================================================================================== heavy

@ic("ironwill")
def _():
    shield((-0.1, 0, 0.1), 1.5, STEEL, DARK, RED)
    hourglass(DECO, 0.55)


@ic("plating")
def _():
    for k in range(3):
        box(2.0, 1.4, 0.3, mat(STEEL if k != 1 else "#98a1b3", 0.3, 0.85), (0.08 * (k - 1), 0.03 * k, -0.75 + k * 0.5), (0, 0, 8 * (k - 1)), 0.05)
        for sx in (-1, 1):
            for sy in (-1, 1):
                sphere(0.09, mat(BRASS, 0.3, 0.8), (0.08 * (k - 1) + sx * 0.8, sy * 0.5, -0.57 + k * 0.5), seg=6, rings=4)
    up_arrow((1.55, -0.5, 0.2), 0.6, BLUE)


@ic("slowandsteady")
def _():
    dome(1.1, mat("#3f9a55", 0.5), (0, 0, -0.4), (1.1, 1.0, 0.9), 12, 7)
    for a in range(0, 360, 60):
        sphere(0.2, mat("#7fcf6a", 0.5), (0.55 * math.cos(math.radians(a)), 0.55 * math.sin(math.radians(a)) * 0.9, 0.2), (1, 1, 0.6), 6, 4)
    sphere(0.22, mat("#7fcf6a", 0.5), (0, 0, 0.45), (1, 1, 0.6), 6, 4)
    sphere(0.4, mat("#9ad98a", 0.5), (1.35, -0.1, -0.25), seg=10, rings=7)
    sphere(0.07, mat(DARK), (1.55, -0.4, -0.15), seg=6, rings=4)
    for sx, sy in ((0.7, -0.8), (-0.7, -0.8), (0.7, 0.8), (-0.7, 0.8)):
        sphere(0.25, mat("#9ad98a", 0.5), (sx, sy, -0.55), (1, 1, 0.7), 8, 5)
    box(0.8, 0.06, 0.2, mat(YELLOW), (0.0, -1.1, -0.9), (0, 0, 0), 0.0)


@ic("shoulderpads")
def _():
    for sx in (-1, 1):
        dome(0.9, mat(STEEL, 0.3, 0.9), (sx * 0.95, 0, -0.5), (1, 1, 1.0), 14, 8)
        cyl(0.95, 0.15, mat(BRASS, 0.3, 0.8), (sx * 0.95, 0, -0.5), (0, 0, 0), 16)
        cyl(0.12, 0.5, METAL(), (sx * 0.95, 0, 0.45), (0, 0, 0), 8, r2=0.0)
        for a in (-45, 45):
            cyl(0.1, 0.4, METAL(), (sx * 0.95 + math.sin(math.radians(a)) * 0.6, 0, -0.05 + 0.0), (0, a, 0), 8, r2=0.0)
    chevrons((0, -0.5, 0.9), 0.4, 3, BLUE)


@ic("bulwark")
def _():
    box(1.5, 0.3, 2.5, mat(STEEL, 0.3, 0.85), (-0.15, 0, 0), bevel=0.07)
    box(1.2, 0.34, 2.2, mat("#4a5f8c", 0.4), (-0.15, -0.02, 0), bevel=0.05)
    box(1.25, 0.38, 0.22, mat(STEEL, 0.3, 0.85), (-0.15, -0.02, 0.0), bevel=0.03)
    box(0.22, 0.38, 2.2, mat(STEEL, 0.3, 0.85), (-0.15, -0.02, 0.0), bevel=0.03)
    for sx in (-1, 1):
        for sz in (-1, 1):
            sphere(0.09, mat(BRASS, 0.3, 0.8), (-0.15 + sx * 0.5, -0.2, sz * 0.9), seg=6, rings=4)
    clock((1.2, -0.6, -0.85), 0.65)


@ic("suppressivefire")
def _():
    with G((-0.2, 0, 0), 1.0):
        for a in range(0, 360, 72):
            cyl(0.14, 2.2, METAL(), (0, 0.42 * math.cos(math.radians(a)), 0.42 * math.sin(math.radians(a))), (0, 90, 0), 10)
        cyl(0.7, 0.3, DARKM(), (-0.5, 0, 0), (0, 90, 0), 12)
        cyl(0.7, 0.3, DARKM(), (0.7, 0, 0), (0, 90, 0), 12)
        cyl(0.6, 0.5, mat(OLIVE, 0.5), (-1.0, 0, 0), (0, 90, 0), 12)
        for a in range(0, 360, 72):
            sphere(0.08, mat(YELLOW, emit=0.8), (1.18, 0.42 * math.cos(math.radians(a)), 0.42 * math.sin(math.radians(a))), seg=6, rings=4)
    glint((1.7, -0.3, 0.4), 0.6, YELLOW)
    streaks((1.6, -0.4, -0.55), 0.7, ORANGE, 3)


@ic("immovable")
def _():
    flat([(-0.9, -0.9), (0.9, -0.9), (0.65, 0.6), (-0.65, 0.6)], 1.2, mat("#3c4150", 0.35, 0.7), (-0.2, 0, 0), 0, 0.06)
    torus(0.42, 0.11, mat("#3c4150", 0.35, 0.7), (-0.2, 0, 0.85), (90, 0, 0), 20, 8)
    box(1.1, 0.06, 0.28, mat(YELLOW), (-0.2, -0.62, -0.2), bevel=0.0)
    hourglass(DECO, 0.55)


@ic("hammerdown")
def _():
    starburst((0.15, 0.3, 0.6), 1.2, 10, 0.5)
    hammer((-0.2, 0, -0.15), 0.9, -35)
    bullet_up((1.3, -0.5, -0.9), 0.8)


@ic("tank")
def _():
    tank_toy((0, 0, 0.1), 1.0)
    heart((0.2, -0.6, 1.25), 0.4)


@ic("walkingfortress")
def _():
    cyl(0.9, 2.0, mat(STONE, 0.7), (0, 0, 0.2), (0, 0, 0), 12)
    for a in range(0, 360, 45):
        box(0.3, 0.3, 0.35, mat("#aaa496", 0.7), (1.0 * math.cos(math.radians(a)) * 0.9, 0.9 * math.sin(math.radians(a)), 1.4), (0, 0, a), 0.03)
    box(0.5, 0.1, 0.8, mat(DARK), (0, -0.92, -0.35), bevel=0.02)
    box(0.25, 0.1, 0.5, mat(DARK), (0, -0.9, 0.6), bevel=0.02)
    flag((0.0, 0, 1.4), 0.35, RED)
    for sx in (-1, 1):
        cyl(0.18, 0.9, DARKM(), (sx * 0.4, 0, -1.2), (0, 0, 0), 8)
        box(0.7, 0.55, 0.28, DARKM(), (sx * 0.4 + 0.15, -0.05, -1.65), bevel=0.04)
        cyl(0.12, 0.5, METAL(), (sx * 1.0, -0.1, 0.2), (0, sx * 90, 0), 8, r2=0.0)


# ============================================================================================== scout

@ic("adrenalinerush")
def _():
    boot((-0.1, 0, -0.35), 1.15)
    wing((-0.55, 0.2, 0.2), 1.0, -1)
    hourglass(DECO, 0.55)


@ic("featherfoot")
def _():
    feather((0, 0, 0.1), 1.3, 35, WHITE, BLUE)
    chevrons((-1.2, -0.3, -0.9), 0.4, 3, BLUE)
    boot((1.2, -0.3, -0.85), 0.45)


@ic("slingshot")
def _():
    cyl(0.13, 1.5, mat(BROWN, 0.6), (-0.3, 0, -0.65), (0, 0, 0), 8)
    for sx in (-1, 1):
        cyl(0.12, 1.2, mat(BROWN, 0.6), (-0.3 + sx * 0.5, 0, 0.55), (0, sx * 25, 0), 8)
        sphere(0.12, mat(BROWN, 0.6), (-0.3 + sx * 0.78, 0, 1.15))
        box(0.8, 0.05, 0.07, mat(RED), (-0.3 + sx * 0.37, 0, 1.08), (0, -sx * 5, 0), 0.0)
    sphere(0.28, mat(STONE, 0.6), (-0.3, 0, 1.1), seg=8, rings=6)
    streaks((1.2, -0.3, 0.2), 0.8, BLUE, 3)
    chevrons((1.0, -0.4, -0.7), 0.35, 2, BLUE)


@ic("hitandrun")
def _():
    starburst((-0.55, 0.2, 0.3), 0.9, 8, 0.3, (RED, YELLOW))
    chevrons((0.2, -0.5, 0.25), 0.85, 3, BLUE)
    clock(DECO, 0.65)


@ic("eagleeye")
def _():
    for sx in (-1, 1):
        disc(0.62, 1.1, mat("#2a2724", 0.4, 0.4), (sx * 0.7, 0, 0), 18)
        disc(0.72, 0.3, mat("#4a5f8c", 0.4, 0.4), (sx * 0.7, -0.6, 0), 18)
        disc(0.55, 0.1, mat(CYAN, 0.05, emit=0.9), (sx * 0.7, -0.78, 0), 18)
        disc(0.18, 0.1, mat(WHITE, 0.2, emit=0.8), (sx * 0.7 - 0.18, -0.84, 0.2), 8)
    box(0.5, 0.4, 0.5, DARKM(), (0, -0.1, 0), bevel=0.05)
    glint((1.65, -0.8, 0.95), 0.65, YELLOW)
    glint((-1.65, -0.8, -0.9), 0.4, WHITE)


@ic("slipstream")
def _():
    for z, ln, c in ((0.75, 2.4, "#bfe3ff"), (0.0, 3.0, "#8ac4f5"), (-0.75, 2.2, "#bfe3ff")):
        box(ln, 0.14, 0.16, mat(c, 0.4, emit=0.3), (-0.3 + (0.3 if z == 0 else 0), 0, z), bevel=0.04)
    torus(0.38, 0.08, mat("#bfe3ff", 0.4, emit=0.3), (1.35, 0, 0.38), (90, 0, 0), 24, 6, 270).rotation_euler = Euler((math.radians(90), math.radians(-90), 0))
    torus(0.38, 0.08, mat("#8ac4f5", 0.4, emit=0.3), (1.45, 0, -0.38), (90, 0, 0), 24, 6, 270).rotation_euler = Euler((math.radians(90), math.radians(90), 0))
    chevrons((-1.4, -0.3, 0.0), 0.35, 2, BLUE)
    boot((-0.2, -0.3, 0.0), 0.5, tilt=0)


@ic("overdrive")
def _():
    gauge((-0.15, 0, 0.2), 1.35)
    hourglass(DECO, 0.5)
    cyl(0.25, 0.7, mat(ORANGE, emit=0.6), (-1.2, 0.4, -0.9), (0, 90, 0), 10, r2=0.02)


@ic("ghostwalk")
def _():
    m = mat("#eaf2ff", 0.6)
    dome(0.95, m, (0, 0, 0.1), (1, 0.9, 1.15), 14, 8)
    cyl(0.95, 1.1, m, (0, 0, -0.45), (0, 0, 0), 14)
    for k in range(5):
        cyl(0.19, 0.4, m, (-0.76 + k * 0.38, 0, -1.1), (0, 0, 0), 8, r2=0.02)
    for sx in (-1, 1):
        sphere(0.2, mat(DARK), (sx * 0.34, -0.8, 0.3), (1, 0.5, 1.3), 8, 6)
    sphere(0.14, mat(DARK), (0, -0.9, -0.1), (1, 0.5, 1.3), 8, 6)
    for x, z in ((1.3, -0.2), (1.55, 0.35), (1.8, 0.95)):
        sparkle((x, -0.3, z), 0.25, "#bfe3ff")


def seg(p0, p1, col=YELLOW, w=0.13, y=-0.3):
    dx, dz = p1[0] - p0[0], p1[1] - p0[1]
    box(math.hypot(dx, dz), w, w, mat(col, 0.4, emit=0.3), ((p0[0] + p1[0]) / 2, y, (p0[1] + p1[1]) / 2), (0, -math.degrees(math.atan2(dz, dx)), 0), 0.0)


@ic("trickshot")
def _():
    box(0.3, 1.2, 2.5, mat(STONE, 0.7), (1.35, 0, 0.0), bevel=0.05)
    seg((-1.3, -1.0), (1.15, 0.0))
    seg((1.15, 0.0), (-0.1, 1.0))
    with G((-0.35, -0.3, 1.2), 0.9, T(-51)):
        bullet(mat(BRASS, 0.3, 0.9), mat(RED, 0.4), (0, 0, -0.5))
    crosshair((-1.35, -0.3, 1.1), 0.55)
    glint((1.15, -0.7, 0.0), 0.5, WHITE)


@ic("lightning")
def _():
    bolt((0, 0, 0.1), 1.5)
    for k in range(3):
        with G((1.0, -0.2 - 0.15 * k, -0.8 + 0.55 * k), 0.5, T(90)):
            bullet(mat(BRASS, 0.3, 0.9), mat(RED, 0.4), (0, 0, -0.5))
    streaks((1.85, -0.3, -0.25), 0.5, YELLOW, 3)


# ============================================================================================== demolisher

@ic("biggerboom")
def _():
    burst(mat(RED, emit=0.3), (0, 0.6, 0.3), 12, 1.0, 1.8)
    burst(mat(ORANGE, emit=0.4), (0, 0.4, 0.3), 12, 0.7, 1.35)
    bomb((0, -0.2, 0.0), 0.85)
    rings((0, 0, -1.2), 1.15, (YELLOW, ORANGE, RED))


@ic("morerockets")
def _():
    rocket((-1.0, 0, -0.1), 0.75, -20)
    rocket((0, 0, 0.15), 0.85, 0, RED, YELLOW)
    rocket((1.0, 0, -0.1), 0.75, 20)
    glint((0, -0.3, -1.35), 0.4, ORANGE)


@ic("shortfuse2")
def _():
    bomb((-0.2, 0, -0.1), 1.0, DARK, 0.45)
    clock(DECO, 0.65)


@ic("payload")
def _():
    starburst((0.9, 0.4, 0.7), 0.9, 10, 0.5, (RED, YELLOW))
    rocket((-0.4, 0, -0.1), 1.15, 50, "#d9d0bd", RED, True)
    box(0.9, 0.9, 0.8, mat(OLIVE, 0.6), (1.0, -0.2, -1.0), (0, 0, 15), 0.06)
    flat(star_points(3, 0.28, 0.11), 0.05, mat(YELLOW), (1.0, -0.66, -1.0), 0, 0.0)


@ic("bombbelt")
def _():
    box(2.7, 0.3, 0.55, mat(BROWN, 0.6), (0, 0, -0.5), (0, 0, 0), 0.06)
    box(0.35, 0.34, 0.65, mat(BRASS, 0.3, 0.8), (1.0, 0, -0.5), bevel=0.03)
    for k, x in enumerate((-0.85, 0, 0.85)):
        cyl(0.27, 1.4, mat(RED, 0.4), (x, -0.05, 0.3), (0, 0, 0), 12)
        cyl(0.04, 0.45, mat(BROWN), (x, -0.05, 1.25), (0, 0, 0), 6)
        glint((x, -0.1, 1.6), 0.3, YELLOW)
        box(0.4, 0.34, 0.14, mat(WHITE), (x, -0.05, 0.3), bevel=0.0)
    plus((1.2, -0.4, 1.0), 0.4, YELLOW)


@ic("shrapnel")
def _():
    sphere(0.7, mat(GREEN, 0.5), (0, 0, -0.05), (1, 1, 1.1), 14, 10)
    cyl(0.22, 0.35, METAL(), (0, 0, 0.78), (0, 0, 0), 10)
    for a in range(0, 360, 45):
        r = 1.25 if (a // 45) % 2 else 1.6
        with G((r * math.cos(math.radians(a)), -0.35, r * math.sin(math.radians(a)) - 0.05), 0.4, T(90 - a)):
            flat([(0, 1), (0.4, -0.6), (-0.4, -0.6)], 0.15, mat(ORANGE if a % 90 else STEEL, 0.4, 0.5, 0.2), (0, 0, 0), 0, 0.0)


@ic("carpetbomb")
def _():
    for k in range(4):
        with G((-1.3 + k * 0.9, -0.1, 0.9 - k * 0.45), 0.42, T(-20)):
            sphere(0.5, mat(DARK, 0.35, 0.3), (0, 0, 0), (1, 1, 1.2))
            for a in (0, 120, 240):
                with G((0, 0, 0.7), 1.0, (0, 0, a)):
                    box(0.05, 0.45, 0.4, mat(RED), (0, 0.25, 0), bevel=0.0)
        box(0.05, 0.05, 0.9, mat("#ffffff", 0.5), (-1.3 + k * 0.9 - 0.05, -0.1, 0.0 - k * 0.45 + 0.0), (0, 0, 0), 0.0)
    slab((0, 0, -1.1), 1.0, 3.4, 1.4, "#6e6a5e")
    for k in range(3):
        starburst((-0.9 + k * 0.9, -0.2, -0.75), 0.28, 8, 0.2)


@ic("demoexpert")
def _():
    box(1.6, 1.2, 0.7, mat(BROWN, 0.6), (-0.3, 0, -0.9), bevel=0.06)
    cyl(0.1, 0.9, METAL(), (-0.3, 0, -0.2), (0, 0, 0), 8)
    box(1.1, 0.25, 0.25, mat(RED, 0.4), (-0.3, 0, 0.35), bevel=0.06)
    for sx in (-1, 1):
        cyl(0.23, 1.2, mat(RED, 0.4), (1.25 + sx * 0.0 + 0.25 * sx, -0.3, -0.5), (0, 0, 0), 12)
    cyl(0.05, 0.6, DARKM(), (0.5, -0.4, -0.7), (0, 90, 25), 6)
    glint((1.5, -0.55, 0.3), 0.35, YELLOW)


@ic("blastsuit")
def _():
    flat([(-0.9, 1.1), (-0.4, 1.1), (0, 0.7), (0.4, 1.1), (0.9, 1.1), (1.1, 0.2), (0.8, -0.3), (0.8, -1.2), (-0.8, -1.2), (-0.8, -0.3), (-1.1, 0.2)], 0.45, mat(ORANGE, 0.5), (0, 0, 0), 0, 0.08)
    for sx in (-1, 1):
        box(0.28, 0.5, 2.0, mat(YELLOW, 0.4), (sx * 0.4, 0, -0.1), (0, 0, 0), 0.0)
        box(0.5, 0.15, 0.4, mat("#c96a14", 0.6), (sx * 0.5, -0.28, -0.7), bevel=0.03)
    for z in (0.1, -0.35):
        box(0.95, 0.3, 0.1, mat(STEEL, 0.3, 0.8), (0, -0.25, z), bevel=0.0)
    glint((1.45, -0.3, 0.8), 0.45, YELLOW)


@ic("armageddon")
def _():
    sphere(0.4, mat(DARK, 0.7), (0, 0, -0.9), (1.0, 1.0, 1.0), 10, 6)
    cyl(0.4, 1.2, mat("#a85a2a", 0.6), (0, 0, -0.4), (0, 0, 0), 10, r2=0.28)
    for x, z, r in ((-0.55, 0.45, 0.6), (0.55, 0.45, 0.6), (0, 0.8, 0.7), (0, 0.3, 0.55)):
        sphere(r, mat(ORANGE if x else RED, 0.5, emit=0.4), (x, 0, z), seg=10, rings=7)
    sphere(0.45, mat(YELLOW, emit=0.5), (0, -0.3, 0.9), seg=10, rings=7)
    for x in (-1.3, 1.3):
        rocket((x, 0, 0.9), 0.5, 180 + (-20 if x < 0 else 20), flame=False)
    rocket((0, 0.5, 1.7), 0.5, 180, flame=False)


# ============================================================================================== ranger

@ic("longshot")
def _():
    arrow((-0.2, 0, 0.5), 1.3, 20, 3.0)
    with G((1.55, 0, -0.25), 0.55):
        for k, c in enumerate((RED, WHITE, RED)):
            disc(0.85 - k * 0.27, 0.12, mat(c, 0.5), (0, 0.05 * k * -1, 0), 20)
    for k in range(4):
        box(0.18, 0.06, 0.06, mat(DARK), (-1.6 + k * 0.45, -0.3, -0.5 + k * 0.1), (0, 15, 0), 0.0)


@ic("quickdraw")
def _():
    bow((-0.3, 0, 0), 1.0, 0, True)
    clock(DECO, 0.65)


@ic("heavybolts")
def _():
    starburst((0.2, 0.4, 0.1), 1.25, 9, 0.6)
    with G((-0.1, 0, 0), 1.6, T(0)):
        cyl(0.15, 2.4, mat(BROWN, 0.5), (0, 0, 0), (0, 90, 0), 8)
        cyl(0.36, 0.9, mat(STEEL, 0.3, 0.9), (1.5, 0, 0), (0, 90, 0), 4, r2=0.0)
        for dz in (-1, 1):
            flat([(0, 0), (0.55, 0.32 * dz), (0.45, 0.0), (0.55, -0.32 * dz)], 0.05, mat(DARK), (-1.0, 0, 0), 0, 0.0)
        for x in (0.45, 0.8):
            cyl(0.2, 0.12, mat(BRASS, 0.3, 0.8), (x, 0, 0), (0, 90, 0), 8)


@ic("hawkeye")
def _():
    eye((0, 0, 0), 1.2, YELLOW)
    for sx in (-1, 1):
        feather((sx * 0.95, 0.1, 0.78), 0.55, sx * 55, "#b07a3c", DARK)
    glint((1.45, -0.3, -0.85), 0.55, YELLOW)


@ic("camouflage")
def _():
    for x, z, r, c in ((-0.7, -0.4, 0.75, "#3f9a55"), (0.6, -0.3, 0.8, "#2f7e49"), (0, 0.35, 0.85, LEAF), (-0.2, -0.65, 0.7, "#2f7e49"), (0.8, 0.45, 0.5, "#3f9a55")):
        sphere(r, mat(c, 0.6), (x, 0, z), seg=10, rings=7)
    for sx in (-1, 1):
        disc(0.2, 0.1, mat(YELLOW, 0.4), (0.0 + sx * 0.32, -0.78, 0.1), 12)
        disc(0.08, 0.1, mat(DARK), (sx * 0.32, -0.84, 0.1), 8)
    for x, z, a in ((-1.1, 0.5, 30), (1.2, -0.1, -40)):
        flat([(0, -0.4), (0.3, 0), (0, 0.5), (-0.3, 0)], 0.08, mat("#b8e06a", 0.5), (x, -0.5, z), a)
    chevrons((1.3, -0.3, -0.9), 0.3, 2, GREEN)


@ic("bigquiver")
def _():
    with G((-0.1, 0, -0.2), 1.0, T(12)):
        for k, c in enumerate((RED, YELLOW, BLUE, GREEN, RED, ORANGE)):
            a = k * 0.3 - 0.75
            cyl(0.04, 1.5, mat(BRASS), (a * 0.7, 0.1 * (k % 2), 1.0), (0, 0, 0), 6)
            flat([(0, 0), (0.18, 0.5), (0, 0.35), (-0.18, 0.5)], 0.05, mat(c), (a * 0.7, 0.1 * (k % 2), 1.55), 0, 0.0)
        cyl(0.62, 2.0, mat(BROWN, 0.6), (0, 0, 0), (0, 0, 0), 12, r2=0.5)
        cyl(0.66, 0.14, mat(BRASS, 0.3, 0.8), (0, 0, 0.9), (0, 0, 0), 12)
        cyl(0.62, 0.14, mat(BRASS, 0.3, 0.8), (0, 0, -0.7), (0, 0, 0), 12)
    plus((1.4, -0.4, 0.8), 0.5, GREEN)


@ic("piercing")
def _():
    for x in (-0.3, 0.7):
        box(0.28, 1.4, 1.9, mat("#c9a77c", 0.7), (x, 0, 0), (0, 0, 0), 0.05)
        box(0.3, 1.45, 0.16, mat(BROWN, 0.7), (x, 0, 0.6), bevel=0.02)
    arrow((0.1, -0.1, 0.0), 1.2, 0, 3.2, BRASS, STEEL, RED)
    glint((1.7, -0.6, 0.0), 0.5, YELLOW)


@ic("steadyaim")
def _():
    bow((-0.45, 0.4, 0), 1.0)
    crosshair((0.35, -0.3, 0), 1.2, RED)


@ic("headhunter")
def _():
    skull((-0.2, 0, 0), 1.15)
    arrow((0.55, -0.55, 0.45), 1.0, -18, 2.2)
    crosshair((1.3, -0.5, -0.9), 0.4)


@ic("deadeye")
def _():
    eye((0, 0, 0.5), 1.1, GREEN, True)
    for k, a in enumerate((-35, 0, 35)):
        arrow((-0.9 + k * 0.9, -0.2, -1.05), 0.55, 90 + a * 0.6, 1.4)


# ============================================================================================== berserker

@ic("bloodlust")
def _():
    axe((-0.5, 0, 0), 1.0, 12, True)
    hourglass(DECO, 0.55)
    drop((1.2, -0.3, 0.9), 0.6, RED)


@ic("thickhide")
def _():
    disc(1.4, 0.3, mat("#7a4a22", 0.7), (0, 0, 0), 20)
    disc(1.15, 0.34, mat("#9a6a38", 0.7), (0, -0.03, 0), 20)
    for a in range(0, 360, 30):
        sphere(0.09, mat(BRASS, 0.3, 0.8), (1.28 * math.sin(math.radians(a)), -0.18, 1.28 * math.cos(math.radians(a))), seg=6, rings=4)
    for a in (45, 135):
        box(0.1, 0.06, 2.2, mat(DARK, 0.7), (0, -0.2, 0), (0, a, 0), 0.0)
    sphere(0.3, mat(STEEL, 0.3, 0.9), (0, -0.2, 0), (1, 0.6, 1), 10, 7)


@ic("ragingbull")
def _():
    box(1.5, 1.0, 1.4, mat("#7a4a22", 0.6), (0, 0, 0.1), bevel=0.15)
    box(1.0, 0.6, 0.8, mat("#d8b68c", 0.6), (0, -0.7, -0.45), bevel=0.12)
    for sx in (-1, 1):
        with G((sx * 0.9, 0, 0.7), 1.0, T(sx * 30)):
            cyl(0.18, 1.2, mat(CREAM, 0.5), (0, 0, 0.5), (0, 0, 0), 10, r2=0.03)
        sphere(0.17, mat(RED, 0.4, emit=0.8), (sx * 0.4, -0.52, 0.45), seg=8, rings=6)
        sphere(0.1, mat(DARK), (sx * 0.22, -1.0, -0.45), seg=6, rings=4)
        flat([(0, 0), (0.55 * sx, 0.12), (0.5 * sx, -0.2)], 0.1, mat(DARK), (sx * 0.4, -0.55, 0.7), 0, 0.0)
    torus(0.26, 0.05, mat(BRASS, 0.3, 0.8), (0, -1.05, -0.7), (90, 0, 0), 16, 6)


@ic("battlecry")
def _():
    with G((-0.5, 0, -0.1), 1.2, T(65)):
        cyl(0.12, 2.4, mat(CREAM, 0.5), (0, 0, 0.2), (0, 0, 0), 12, r2=0.7)
        for z in (-0.6, 0.0, 0.7):
            cyl(0.14 + (z + 1.0) * 0.17, 0.12, mat(BRASS, 0.3, 0.8), (0, 0, z), (0, 0, 0), 12)
        sphere(0.17, mat(BRASS, 0.3, 0.8), (0, 0, -1.05), seg=8, rings=6)
    for k, r in enumerate((0.55, 0.9, 1.25)):
        torus(r, 0.05, mat(RED, 0.4, emit=0.3), (0.65, -0.3, 0.55), (90, 0, 0), 24, 5, 80).rotation_euler = Euler((math.radians(90), math.radians(40), 0))
    clock(DECO, 0.55)


@ic("bonecrusher")
def _():
    bone((-0.55, 0, 0.1), 1.0, 25, 1.7)
    bone((0.55, 0, -0.2), 1.0, -35, 1.5)
    burst(mat(RED, emit=0.3), (0, 0.5, 0), 10, 0.5, 0.95)
    hammer((1.15, -0.4, 0.4), 0.45, 40)


@ic("adrenalinejunkie")
def _():
    sphere(0.95, mat(RED, 0.2), (-0.2, 0, -0.35), seg=14, rings=10)
    sphere(0.82, mat(DKRED, 0.3, emit=0.2), (-0.2, 0, -0.45), seg=12, rings=8)
    cyl(0.3, 0.9, mat("#cfe9ff", 0.1), (-0.2, 0, 0.7), (0, 0, 0), 12)
    cyl(0.34, 0.3, mat(BROWN, 0.6), (-0.2, 0, 1.3), (0, 0, 0), 12)
    for x, z, r in ((-0.55, -0.1, 0.12), (0.0, 0.2, 0.09), (-0.3, 0.45, 0.07)):
        sphere(r, mat("#ff9a8a", 0.2), (x, -0.85, z), seg=6, rings=4)
    bolt((1.45, -0.3, 0.2), 0.7)


@ic("unstoppable")
def _():
    helmet((-0.3, 0, 0.1), 1.2, STEEL, horns=True)
    streaks((-1.9, -0.3, 0.0), 0.7, RED, 3)
    hourglass(DECO, 0.55)


@ic("meatgrinder")
def _():
    cyl(1.0, 1.0, mat(STEEL, 0.3, 0.8), (-0.1, 0, 0.8), (0, 0, 0), 14, r2=0.5).rotation_euler = Euler((math.radians(180), 0, 0))
    box(1.3, 1.1, 0.9, mat("#7c8494", 0.3, 0.8), (-0.1, 0, -0.35), bevel=0.06)
    cyl(0.45, 0.8, mat("#7c8494", 0.3, 0.8), (1.0, 0, -0.35), (0, 90, 0), 12)
    for x, z in ((1.55, -0.3), (1.85, -0.65), (1.5, -0.8)):
        sphere(0.2, mat("#e0555f", 0.5), (x, 0, z), (1, 1, 0.8), 8, 6)
    sphere(0.3, mat("#e0555f", 0.5), (-0.1, 0, 1.15), seg=8, rings=6)
    box(0.12, 0.12, 1.2, METAL(), (-1.0, 0, -0.35), bevel=0.02)
    cyl(0.12, 0.8, mat(BROWN, 0.6), (-1.0, -0.4, 0.2), (90, 0, 0), 8)
    box(1.4, 0.06, 0.12, mat(RED), (-0.1, -0.58, -0.35), bevel=0.0)


@ic("scarred")
def _():
    heart((0, 0, 0.3), 1.35, RED)
    pts = [(-0.55, 1.0), (-0.15, 0.4), (-0.35, 0.1), (0.1, -0.5), (-0.1, -0.7)]
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        box(math.hypot(x1 - x0, z1 - z0), 0.1, 0.1, mat("#e8c9a0", 0.6), ((x0 + x1) / 2, -0.85, (z0 + z1) / 2 + 0.0), (0, -math.degrees(math.atan2(z1 - z0, x1 - x0)), 0), 0.0)
    for (x, z) in ((-0.35, 0.65), (0.0, 0.0), (0.0, -0.45)):
        box(0.5, 0.08, 0.08, mat(DARK), (x - 0.02, -0.9, z), (0, -25, 0), 0.0)
    for x, z in ((1.35, -0.8), (-1.3, 0.9)):
        box(0.7, 0.2, 0.3, mat("#e8c9a0", 0.6), (x, -0.4, z), (0, 20, 0), 0.05)


@ic("berserkgod")
def _():
    starburst((0, 0.6, 0.1), 1.5, 12, 0.8, (RED, ORANGE))
    skull((0, 0, -0.1), 1.1, CREAM, True, True)
    bolt((1.55, -0.4, -0.3), 0.7)
    bolt((-1.55, -0.4, -0.3), 0.7)


# ============================================================================================== swordsman

@ic("whirlwind")
def _():
    sword((0, 0, 0.1), 1.0, 0)
    for k, (z, r) in enumerate(((-0.8, 0.55), (-0.3, 0.85), (0.3, 1.1), (0.9, 1.3))):
        torus(r, 0.07, mat("#bfe3ff" if k % 2 else "#8ac4f5", 0.4, emit=0.3), (0.0, 0, z), (0, 0, 0), 32, 6)


@ic("sharpedge")
def _():
    sword((0, 0, 0), 1.25, 40)
    glint((0.15, -0.3, 1.45), 0.7, WHITE)
    glint((-0.8, -0.3, 0.5), 0.35, WHITE)
    glint((1.4, -0.3, 0.7), 0.3, YELLOW)


@ic("featherstep")
def _():
    sword((0.3, 0, 0), 1.0, 0)
    feather((-0.85, -0.3, 0.1), 1.2, -20, WHITE, BLUE)
    chevrons((1.3, -0.3, -0.9), 0.3, 2, BLUE)


@ic("fastblades")
def _():
    sword((0, 0.05, 0.0), 1.0, 40)
    sword((0, 0, 0.0), 1.0, -40, "#d9deea")
    clock(DECO, 0.65)


@ic("riposte")
def _():
    sword((-0.4, 0, 0.1), 1.1, 12)
    disc(0.95, 0.3, mat(STEEL, 0.3, 0.9), (0.95, -0.3, -0.45), 18)
    disc(0.75, 0.34, mat(RED, 0.4), (0.95, -0.34, -0.45), 18)
    for a in range(0, 360, 60):
        cyl(0.11, 0.45, METAL(), (0.95 + 0.98 * math.sin(math.radians(a)) * 0.9, -0.3, -0.45 + 0.98 * math.cos(math.radians(a)) * 0.9), (0, a, 0), 6, r2=0.0)
    sphere(0.28, METAL(), (0.95, -0.55, -0.45), (1, 0.6, 1), 8, 6)


@ic("duelist")
def _():
    sword((-0.1, 0, 0), 1.2, 25, STEEL, BRASS, 0.5)
    dome(0.4, mat(BRASS, 0.3, 0.8), (-0.1 - 0.35, 0, -0.7), (1, 1, 0.7)).rotation_euler = Euler((math.radians(0), math.radians(25), 0))
    starburst((1.2, 0.2, 0.8), 0.5, 8, 0.3, (RED, YELLOW))
    glint((1.45, -0.3, -0.7), 0.45, WHITE)


@ic("bladedancer")
def _():
    sword((0, 0, 0), 1.0, 0)
    for z, rot in ((0.0, 0), (0.5, 40)):
        torus(1.15, 0.09, mat(RED, 0.5, emit=0.2), (0, 0, z), (0, rot * 0, 0), 32, 6, 270)
    flat([(0, 0.5), (0.6, -0.3), (-0.6, -0.3)], 0.15, mat(RED, 0.5), (1.15, -0.1, 0.0), 0, 0.0)
    hourglass(DECO, 0.5)


@ic("swiftcut")
def _():
    flat([(-1.3, 0.2), (-0.6, 0.9), (0.6, 1.2), (1.5, 0.7), (0.5, 0.75), (-0.5, 0.5)], 0.14, mat("#eaf5ff", 0.3, emit=0.4), (0, 0, 0), 0, 0.0)
    sword((0.5, 0, -0.35), 0.85, 55)
    streaks((-1.5, -0.2, -0.5), 0.8, BLUE, 3)
    glint((1.6, -0.3, 0.9), 0.4, WHITE)


@ic("masterswordsman")
def _():
    sword((0, 0, -0.35), 1.15, 0)
    with G((0, 0, 1.5), 0.75):
        box(1.6, 0.4, 0.5, mat(BRASS, 0.3, 0.8), bevel=0.05)
        for k, x in enumerate((-0.65, 0, 0.65)):
            flat([(-0.25, 0), (0.25, 0), (0, 0.6 + 0.2 * (k == 1))], 0.3, mat(BRASS, 0.3, 0.8), (x, 0, 0.25), 0, 0.02)
            sphere(0.1, mat(RED, 0.3), (x, -0.22, 0.95 if k == 1 else 0.85), seg=6, rings=4)
    drop((1.3, -0.3, -0.9), 0.55, RED)


@ic("stormcaller2")
def _():
    sword((0, 0, -0.55), 0.95, 0)
    for x, z, r in ((-0.6, 1.4, 0.5), (0.5, 1.4, 0.55), (0, 1.75, 0.55), (-0.1, 1.35, 0.5)):
        sphere(r, mat("#6c7486", 0.7), (x, 0.0, z + 0.0), (1.1, 1, 0.8), 10, 6)
    bolt((0.2, -0.4, 0.9), 0.4)
    for k, (z, r) in enumerate(((-0.6, 0.6), (-0.1, 0.85), (0.4, 1.1))):
        torus(r, 0.06, mat("#bfe3ff", 0.4, emit=0.3), (0, 0, z - 0.3), (0, 0, 0), 32, 6)


# ============================================================================================== hammerer

@ic("widerslam")
def _():
    slab((0, 0, -0.9), 1.0, 3.3, 2.3)
    rings((0, 0, -0.7), 1.25, (YELLOW, ORANGE), 0.4, 0.45, 0.08)
    crack((0, 0, -0.72), 0.9, 30, 5)
    hammer((0, 0, 0.35), 0.8, 0, DARK)


@ic("heavierhammer")
def _():
    hammer((-0.3, 0, 0), 1.2, 15, "#2d303a", True)
    up_arrow((1.35, -0.4, -0.2), 0.75)
    box(0.7, 0.3, 0.3, mat(STEEL, 0.3, 0.8), (1.3, -0.5, -1.0), (0, 0, 0), 0.04)


@ic("groundshaker")
def _():
    slab((0, 0, -0.9), 1.0, 3.4, 2.3)
    crack((-0.4, 0, -0.72), 1.2, 15, 6)
    hammer((-0.4, 0, 0.35), 0.75, 20, DARK)
    clock(DECO, 0.6)


@ic("aftershock")
def _():
    slab((0, 0, -0.9), 1.0, 3.3, 2.3)
    crack((0, 0, -0.72), 0.9, -20, 5)
    crack((0, 0, -0.72), 0.9, 70, 4)
    for x, y, z in ((-0.9, -0.2, 0.2), (0.8, 0.1, 0.6), (0.2, -0.3, 1.1), (-0.3, 0.3, 0.7)):
        rock((x, y, z), 0.8)
    starburst((0, 0.6, 0.35), 0.8, 9, 0.2)


@ic("thickskull")
def _():
    skull((0, 0, -0.1), 1.2)
    box(1.4, 0.3, 0.3, mat(BRASS, 0.3, 0.8), (0, -0.55, 0.78), (0, 0, 0), 0.05)
    for a in (0, 120, 240):
        glint((1.2 * math.cos(math.radians(a)) * 0.9, -0.45, 1.25 + 0.3 * math.sin(math.radians(a))), 0.38, YELLOW)
    hammer((1.5, -0.4, -0.5), 0.45, -35)


@ic("quakeboots")
def _():
    slab((0, 0, -0.9), 1.0, 3.3, 2.3)
    boot((-0.1, 0, 0.0), 1.15, BROWN, "#3a352d")
    crack((0.4, -0.3, -0.72), 1.0, -15, 5)
    chevrons((1.45, -0.2, 0.2), 0.35, 2, ORANGE)


@ic("earthsplitter")
def _():
    for sx in (-1, 1):
        box(1.35, 2.2, 0.5, mat(STONE, 0.7), (sx * 0.95, 0, -0.9), (0, sx * 10, 0), 0.06)
    box(0.7, 2.0, 0.3, mat(ORANGE, 0.4, emit=1.0), (0, 0, -1.1), (0, 0, 0), 0.0)
    hammer((0, -0.2, 0.3), 0.85, 0, DARK)
    for x, z in ((-0.25, 0.1), (0.3, -0.35)):
        glint((x, -0.7, z), 0.28, YELLOW)
    rings((0, 0, -0.55), 1.2, (ORANGE, RED), 0.55, 0.45, 0.07)


@ic("forge")
def _():
    anvil((0, 0, -0.55), 1.0)
    heart((-0.2, -0.1, 0.85), 0.7, "#ff5a2a")
    for x, z in ((0.5, 1.4), (-0.7, 1.55), (0.0, 1.9)):
        glint((x, -0.3, z), 0.3, YELLOW)


@ic("titanfist")
def _():
    starburst((0.15, 0.7, 0.35), 1.3, 10, 0.8)
    fist((0, 0, 0.1), 1.25, STEEL, 0)


@ic("worldbreaker")
def _():
    sphere(1.1, mat("#2f8fe8", 0.5), (-0.55, 0, 0.0), seg=14, rings=10)
    sphere(1.05, mat("#47b86a", 0.6), (0.55, 0.3, -0.05), seg=14, rings=10)
    box(0.18, 1.5, 3.0, mat(ORANGE, 0.4, emit=1.0), (0.0, 0, 0), (0, 0, 0), 0.0)
    hammer((1.2, -0.4, 0.55), 0.8, -35, DARK)
    clock((-1.4, -0.7, -0.95), 0.55, YELLOW)

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
    import classes
    ids = [c[0] for k in classes.CLASSES for c in classes.T[k]]
    missing = [i for i in ids if i not in ICONS]
    if missing:
        raise ValueError("no icon for: %s" % ", ".join(missing))
    setup_scene()
    report = {}
    names = [n for n in ids if not ONLY or n in ONLY]
    for name in names:
        reset()
        _mats.clear()
        ICONS[name]()
        path = frame_and_render(name)
        cov = coverage(path)
        report[name] = round(cov, 3)
        print("class card %-17s coverage %.0f%%" % (name, cov * 100))
        if cov < 0.05 or cov > 0.92:
            raise ValueError("card %s looks wrong: %.0f%% of the image is covered" % (name, cov * 100))
    if SHEETS:
        os.makedirs(SHEETS, exist_ok=True)
        for k in classes.CLASSES:
            got = [c[0] for c in classes.T[k] if c[0] in names]
            if got:
                contact_sheet(os.path.join(SHEETS, k + ".png"), got)
    return report


RESULT = run()
print(RESULT)
