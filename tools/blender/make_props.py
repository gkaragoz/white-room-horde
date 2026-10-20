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
exec(compile(open(os.path.join(HERE, "meshclean.py"), encoding="utf-8").read(), "meshclean", "exec"), globals())

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


# ---------------------------------------------------------------- night/survival set
def strut(b, p1, p2, r, color, seg=4):
    """A thin prism between two points (square or triangular section) for lattice work."""
    a, c = Vector(p1), Vector(p2)
    d = c - a
    L = d.length
    d = d / L
    rx = math.asin(max(-1.0, min(1.0, -d.y)))
    ry = math.atan2(d.x, d.z)
    old = b.cylseg
    b.cylseg = seg
    b.cyl("root", tuple((a + c) / 2), r, L, color, rot=(rx, ry, 0))
    b.cylseg = old


def pine_tree(b):
    b.cyl("root", (0, 0, 0.3), 0.13, 0.6, "#7A5230")
    for (z, r, d, col) in ((0.75, 0.82, 0.7, "#2C7A48"), (1.2, 0.66, 0.65, "#35905A"), (1.65, 0.5, 0.6, "#2C7A48"), (2.05, 0.34, 0.55, "#3FA264")):
        b.cyl("root", (0, 0, z), r, d, col, r2=0.0)


def rock(b):
    for (x, y, z, r, sc, rz, col) in ((0.0, 0.0, 0.42, 0.62, (1.0, 0.85, 0.75), 0.4, "#8E939C"),
                                      (0.62, 0.25, 0.28, 0.42, (1.0, 1.0, 0.7), 1.1, "#A3A8B0"),
                                      (-0.55, 0.3, 0.26, 0.4, (0.9, 1.1, 0.68), 2.0, "#767B85"),
                                      (0.15, -0.6, 0.22, 0.34, (1.2, 0.9, 0.65), 0.2, "#9298A2"),
                                      (-0.3, -0.45, 0.14, 0.22, (1.0, 1.0, 0.7), 0.9, "#B0B5BD")):
        b.sphere("root", (x, y, z), r, sc, col, rot=(0.15, 0.2, rz), seg=7, rings=5)


def hay_bale(b):
    straw, strap, dark = "#E2BC4F", "#8A6A32", "#C9A23C"
    for (x, y, z, rz) in ((-0.35, 0, 0.3, 0.05), (0.45, 0.05, 0.3, -0.08), (0.05, 0.0, 0.9, 0.12)):
        b.box("root", (x, y, z), (0.85, 0.6, 0.58), straw, rot=(0, 0, rz))
        for sx in (-1, 1):
            b.box("root", (x + sx * 0.2 * math.cos(rz), y + sx * 0.2 * math.sin(rz), z), (0.05, 0.64, 0.62), strap, rot=(0, 0, rz))
        b.box("root", (x, y - 0.31, z + 0.1), (0.7, 0.03, 0.08), dark, rot=(0, 0, rz))
    b.box("root", (0.7, -0.35, 0.05), (0.3, 0.1, 0.08), "#E2BC4F", rot=(0, 0, 0.6))


def dumpster(b):
    green, dgreen = "#3C8F55", "#2A6B3E"
    b.box("root", (0, 0, 0.62), (1.7, 0.9, 0.7), green)
    b.box("root", (0, 0, 0.3), (1.5, 0.8, 0.1), dgreen)
    for z in (0.45, 0.8):
        b.box("root", (0, 0, z), (1.76, 0.96, 0.07), dgreen)
    b.box("root", (0, 0, 0.985), (1.5, 0.76, 0.02), "#1E2A22")
    b.box("root", (0, 0.2, 1.38), (1.72, 0.96, 0.07), dgreen, rot=(-0.85, 0, 0))    # open lid
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.cyl("root", (sx * 0.65, sy * 0.38, 0.12), 0.12, 0.1, BLACK, rot=(math.pi / 2, 0, 0))
    b.box("root", (0.3, -0.05, 1.08), (0.3, 0.3, 0.22), RED, rot=(0.3, 0.2, 0.5))
    b.box("root", (-0.4, -0.1, 1.07), (0.3, 0.25, 0.2), "#E8E2D0", rot=(0.1, 0.4, 0.2))
    b.box("root", (0.85, -0.49, 0.62), (0.5, 0.03, 0.1), YELLOW)


def tent(b):
    old = b.cylseg
    b.cylseg = 3
    b.cyl("root", (0, 0, 0.3), 0.62, 1.9, "#D9C58A", rot=(math.pi / 2, -math.pi / 2, 0))
    for sy in (-1, 1):                                # orange trim triangles at the ends and a dark door
        b.cyl("root", (0, sy * 0.96, 0.27), 0.5, 0.04, "#E5772B", rot=(math.pi / 2, -math.pi / 2, 0))
    b.cyl("root", (0, -0.99, 0.2), 0.38, 0.04, "#4A3A2A", rot=(math.pi / 2, -math.pi / 2, 0))
    b.cylseg = old
    b.box("root", (0, 0, 0.93), (0.05, 1.9, 0.05), BLACK)
    for (x, y, sx) in ((0.85, -0.9, 1), (-0.85, -0.9, -1), (0.85, 0.9, 1), (-0.85, 0.9, -1)):
        strut(b, (x * 0.62, y * 1.05, 0.4), (x, y * 1.05, 0.04), 0.012, "#E7DDB8", 4)
        b.box("root", (x, y * 1.05, 0.03), (0.07, 0.07, 0.07), "#B07A45")


def generator(b):
    yel = "#F2C43B"
    b.box("root", (0, 0, 0.5), (1.0, 0.6, 0.55), yel)
    b.box("root", (0, 0, 0.8), (1.04, 0.64, 0.06), "#C99C22")
    b.box("root", (0, 0, 0.14), (1.1, 0.7, 0.08), BLACK)
    for sx in (-1, 1):
        b.box("root", (sx * 0.48, 0, 0.35), (0.08, 0.62, 0.45), BLACK)
        b.cyl("root", (sx * 0.4, 0.38, 0.14), 0.14, 0.1, BLACK, rot=(math.pi / 2, 0, 0))
    b.box("root", (0, -0.31, 0.52), (0.6, 0.04, 0.34), "#2E3138")
    b.cyl("root", (-0.16, -0.35, 0.56), 0.05, 0.05, RED, rot=(math.pi / 2, 0, 0))
    b.cyl("root", (0.0, -0.35, 0.56), 0.05, 0.05, GREEN, rot=(math.pi / 2, 0, 0))
    b.cyl("root", (0.16, -0.35, 0.56), 0.05, 0.05, "#F08A2C", rot=(math.pi / 2, 0, 0))
    b.box("root", (0, -0.35, 0.44), (0.34, 0.03, 0.06), "#8A94A3")
    b.cyl("root", (-0.32, 0.1, 1.02), 0.07, 0.45, STEEL2)
    b.cyl("root", (-0.32, 0.1, 1.26), 0.1, 0.06, BLACK)
    b.cyl("root", (0.3, 0.12, 0.9), 0.1, 0.1, RED)
    b.box("root", (0, 0.32, 1.0), (0.8, 0.05, 0.05), STEEL)
    for sx in (-1, 1):
        b.box("root", (sx * 0.4, 0.32, 0.9), (0.05, 0.05, 0.2), STEEL)


def wreck_car(b):
    body, cab, rust = "#C2552B", "#A8431F", "#7A3A20"
    b.box("root", (0, 0, 0.5), (1.9, 0.95, 0.38), body, rot=(0, 0, 0.04))
    b.box("root", (-0.2, 0, 0.84), (1.0, 0.82, 0.34), cab, rot=(0, 0, 0.04))
    b.box("root", (-0.2, -0.42, 0.86), (0.84, 0.03, 0.2), "#35465A")
    b.box("root", (-0.2, 0.42, 0.86), (0.84, 0.03, 0.2), "#35465A")
    b.box("root", (0.28, 0, 0.86), (0.04, 0.7, 0.2), "#35465A")
    b.box("root", (0.74, 0, 0.78), (0.6, 0.9, 0.05), rust, rot=(0, -0.6, 0.04))      # popped bonnet
    b.box("root", (0.97, 0, 0.4), (0.06, 0.96, 0.16), "#8A94A3")
    b.box("root", (0.97, -0.3, 0.52), (0.04, 0.2, 0.1), "#FFF2B8")
    b.box("root", (-1.0, 0.3, 0.5), (0.05, 0.2, 0.1), "#E0405A")
    for (x, y) in ((0.62, 0.5), (-0.62, 0.5), (-0.62, -0.5)):
        b.cyl("root", (x, y, 0.22), 0.22, 0.14, "#2E3138", rot=(math.pi / 2, 0, 0))
        b.cyl("root", (x, y * 1.12, 0.22), 0.1, 0.06, STEEL, rot=(math.pi / 2, 0, 0))
    b.cyl("root", (0.62, -0.52, 0.2), 0.05, 0.14, STEEL2, rot=(math.pi / 2, 0, 0))     # bare axle stub
    b.torus("root", (1.2, -0.95, 0.09), 0.17, 0.09, "#2E3138", major=10, minor=5)      # the wheel that rolled off


def tombstone(b):
    st = "#A9AEB8"
    b.box("root", (0, 0, 0.05), (0.85, 0.4, 0.1), "#8A8F99")
    b.sphere("root", (0, 0, 0.66), 0.42, (1, 0.3, 1.6), st, seg=10, rings=6)       # rounded stone
    b.box("root", (0, -0.13, 0.72), (0.08, 0.03, 0.36), "#5E6877")
    b.box("root", (0, -0.13, 0.8), (0.26, 0.03, 0.08), "#5E6877")
    b.sphere("root", (0, -0.62, 0.0), 0.5, (0.9, 1.1, 0.3), "#5A4636", seg=8, rings=4)
    b.box("root", (0.82, 0.05, 0.4), (0.09, 0.09, 0.8), WOOD2, rot=(0.0, 0.12, 0.08))
    for sx in (-1, 1):
        b.box("root", (0.82 + sx * 0.14, 0.05, 0.58 - sx * 0.01), (0.19, 0.09, 0.09), WOOD2, rot=(0.0, 0.12, 0.08))


def campfire(b):
    for k in range(8):
        a = 2 * math.pi * k / 8
        b.box("root", (0.62 * math.cos(a), 0.62 * math.sin(a), 0.12), (0.3, 0.22, 0.24), "#8E939C" if k % 2 else "#A9AEB8", rot=(0, 0, a + 0.3))
    b.cyl("root", (0, 0, 0.05), 0.5, 0.1, "#3A2F2A")
    for k in range(3):
        a = k * math.pi / 3 + 0.3
        b.cyl("root", (0.1 * math.cos(a + 1.6), 0.1 * math.sin(a + 1.6), 0.2 + 0.08 * k), 0.09, 0.95, "#6B4423",
              rot=(0, math.pi / 2 - 0.2, a))
    b.cyl("root", (0, 0, 0.5), 0.3, 0.8, "#FF6A1A", r2=0.0)
    b.cyl("root", (0.14, 0.08, 0.42), 0.17, 0.6, "#FF9A24", r2=0.0)
    b.cyl("root", (-0.14, -0.05, 0.4), 0.15, 0.5, "#FF9A24", r2=0.0)
    b.cyl("root", (0, 0, 0.42), 0.18, 0.62, "#FFD93A", r2=0.0)
    b.cyl("root", (0, 0, 0.36), 0.09, 0.45, "#FFF3A0", r2=0.0)


def fuel_tank(b):
    red = "#C8483A"
    b.cyl("root", (0, 0, 0.95), 0.5, 1.6, red, rot=(0, math.pi / 2, 0))
    for sx in (-1, 1):
        b.cyl("root", (sx * 0.82, 0, 0.95), 0.52, 0.06, "#8A94A3", rot=(0, math.pi / 2, 0))
    for sx in (-1, 1):
        b.cyl("root", (sx * 0.45, 0, 0.95), 0.515, 0.14, YELLOW, rot=(0, math.pi / 2, 0))
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box("root", (sx * 0.5, sy * 0.36, 0.3), (0.1, 0.1, 0.6), STEEL2)
        b.box("root", (sx * 0.5, 0, 0.5), (0.1, 0.8, 0.08), STEEL2)
    b.cyl("root", (0.2, 0, 1.5), 0.14, 0.12, STEEL)
    b.cyl("root", (0.2, 0, 1.6), 0.08, 0.1, BLACK)
    b.box("root", (-0.45, -0.5, 1.0), (0.18, 0.05, 0.18), "#F2F2F2")
    b.cyl("root", (0.6, -0.53, 0.55), 0.05, 0.14, BLACK, rot=(math.pi / 2, 0, 0))


def picnic_table(b):
    for y in (-0.27, 0.0, 0.27):
        b.box("root", (0, y, 0.78), (1.9, 0.25, 0.07), WOOD)
    for sy in (-1, 1):
        b.box("root", (0, sy * 0.74, 0.46), (1.9, 0.28, 0.07), WOOD3)
        for sx in (-1, 1):
            strut(b, (sx * 0.65, sy * 0.12, 0.72), (sx * 0.65, sy * 0.78, 0.0), 0.05, WOOD2, 4)
            b.box("root", (sx * 0.65, sy * 0.52, 0.4), (0.1, 0.1, 0.05), WOOD2)
    for sx in (-1, 1):
        b.box("root", (sx * 0.65, 0, 0.7), (0.1, 0.4, 0.07), WOOD2)


def neon_sign(b):
    b.box("root", (0, 0, 0.08), (0.6, 0.6, 0.16), STEEL2)
    b.cyl("root", (0, 0, 1.55), 0.07, 3.0, STEEL2)
    b.box("root", (0, 0, 3.25), (1.7, 0.12, 0.95), "#241C3A")
    pink, cyan = "#FF3FA4", "#35F2F0"
    for sy in (-1, 1):
        y = sy * 0.085
        for (cx, cz, sx_, sz_) in ((0, 3.67, 1.5, 0.07), (0, 2.83, 1.5, 0.07), (-0.78, 3.25, 0.07, 0.8), (0.78, 3.25, 0.07, 0.8)):
            b.box("root", (cx, y, cz), (sx_, 0.04, sz_), pink)
        b.box("root", (0, y, 3.25), (0.4, 0.04, 0.4), cyan, rot=(0, math.pi / 4, 0))
        b.box("root", (-0.5, y, 3.25), (0.28, 0.04, 0.07), cyan)
        b.box("root", (0.5, y, 3.25), (0.28, 0.04, 0.07), cyan)
    b.box("root", (0, 0, 3.78), (0.1, 0.1, 0.1), STEEL2)


def radio_tower(b):
    steel = "#7C8794"
    levels = [(0.0, 0.5), (1.3, 0.38), (2.5, 0.28), (3.6, 0.2), (4.6, 0.13)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            strut(b, (sx * levels[0][1], sy * levels[0][1], 0.0), (sx * levels[-1][1], sy * levels[-1][1], levels[-1][0]), 0.05, steel, 4)
    for i, (z, h) in enumerate(levels[1:], 1):
        zp, hp = levels[i - 1]
        corners = ((1, 1), (-1, 1), (-1, -1), (1, -1))
        for k in range(4):
            c1, c2 = corners[k], corners[(k + 1) % 4]
            strut(b, (c1[0] * h, c1[1] * h, z), (c2[0] * h, c2[1] * h, z), 0.03, steel, 3)
            lo1 = (c1[0] * hp, c1[1] * hp, zp)
            hi2 = (c2[0] * h, c2[1] * h, z)
            strut(b, lo1, hi2, 0.025, "#B4BCC8", 3)
    b.box("root", (0, 0, 4.64), (0.4, 0.4, 0.06), STEEL2)
    b.cyl("root", (0, 0, 4.98), 0.03, 0.7, STEEL2)
    b.sphere("root", (0, 0, 5.38), 0.1, (1, 1, 1), "#FF2A2A", seg=8, rings=5)
    b.box("root", (0.26, 0, 4.85), (0.04, 0.3, 0.3), "#E8EDF2")
    b.box("root", (0, 0, 0.08), (1.1, 1.1, 0.16), "#6A7380")


def _skull(b, x, y, z, s, yaw, tilt=0.0):
    bone, dark = "#F1E8D2", "#2A2622"
    b.sphere("root", (x, y, z), 0.2 * s, (1, 1.05, 0.95), bone, rot=(tilt, 0, yaw), seg=7, rings=4)
    c, sn = math.cos(yaw), math.sin(yaw)

    def pt(dx, dy, dz):  # offset in the skull's local frame (face towards -Y), rotated by yaw
        return (x + (dx * c - dy * sn) * s, y + (dx * sn + dy * c) * s, z + dz * s)
    b.box("root", pt(0, -0.14, -0.1), (0.2 * s, 0.14 * s, 0.1 * s), bone, rot=(0, 0, yaw))
    for sx in (-1, 1):
        b.box("root", pt(sx * 0.08, -0.19, 0.03), (0.07 * s, 0.04 * s, 0.07 * s), dark, rot=(0, 0, yaw))


def _bone(b, p1, p2):
    strut(b, p1, p2, 0.045, "#F1E8D2", 6)
    for p in (p1, p2):
        b.sphere("root", p, 0.07, (1, 1, 1), "#F1E8D2", seg=6, rings=3)


def skull_pile(b):
    b.sphere("root", (0, 0, 0.0), 0.95, (1, 1, 0.32), "#6B5B4A", seg=14, rings=6)
    _skull(b, 0.0, 0.0, 0.64, 1.6, 0.3)
    _skull(b, -0.58, -0.22, 0.38, 1.3, 0.9, 0.2)
    _skull(b, 0.55, -0.28, 0.36, 1.3, -0.6)
    _skull(b, 0.2, 0.5, 0.3, 1.0, 2.5, 0.3)
    _bone(b, (-0.7, 0.35, 0.12), (-0.1, 0.55, 0.3))
    _bone(b, (0.7, 0.2, 0.1), (0.1, -0.5, 0.18))
    _bone(b, (-0.3, -0.7, 0.07), (0.45, -0.62, 0.1))
    _bone(b, (-0.2, 0.2, 0.55), (0.35, 0.3, 0.7))


PROPS += [("pine_tree", pine_tree), ("rock", rock), ("hay_bale", hay_bale), ("dumpster", dumpster), ("tent", tent),
          ("generator", generator), ("wreck_car", wreck_car), ("tombstone", tombstone), ("campfire", campfire),
          ("fuel_tank", fuel_tank), ("picnic_table", picnic_table), ("neon_sign", neon_sign), ("radio_tower", radio_tower),
          ("skull_pile", skull_pile)]


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
    removed = (removed, clean_mesh(mesh, floor=True))
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
