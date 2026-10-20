"""Loot dropped by enemies: chunky, readable, Team-Fortress-2-style pickups (ammo box, medkit, grenade, weapon case,
shield, speed bolt, quad crystal, nuke, ice crystal). Same toy kit, clean-up and export as the props.

Run headless:  blender -b --factory-startup --python tools/blender/make_pickups.py
Conventions: model centred on the origin (they spin and bob in the game), Z up in Blender (Y up in the game), about 1 unit wide.
"""
import bpy, math, os, json
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/make_pickups.py")))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.environ.get("OUT_DIR") or os.path.join(REPO, "packages", "client", "public", "models", "pickups")

_src = open(os.path.join(HERE, "make_props.py"), encoding="utf-8").read()
_head = _src[:_src.index("def crate(b):")].replace("tools/blender/make_props.py", "tools/blender/make_pickups.py")
_tail = _src[_src.index("def build(pid, fn, mats):"):].replace('"prop_"', '"pickup_"').replace("'prop_'", "'pickup_'")
exec(compile(_head, "head", "exec"), globals())
OUT_DIR = os.environ.get("OUT_DIR") or os.path.join(REPO, "packages", "client", "public", "models", "pickups")

OLIVE, OLIVE2, GOLD, PURPLE, PURPLE2, ICE, ICE2, CREAM = "#6F8140", "#4C5A2B", "#E8B93C", "#A25BE6", "#6E36B0", "#8FDCF7", "#D8F4FF", "#F4EFE2"
PI = math.pi


def ammo(b):
    b.box("root", (0, 0, -0.1), (1.0, 0.62, 0.55), OLIVE)
    b.box("root", (0, 0, 0.2), (1.04, 0.66, 0.14), OLIVE2)
    b.box("root", (0, 0, -0.1), (0.14, 0.66, 0.6), OLIVE2)
    b.box("root", (0, 0, 0.3), (0.5, 0.1, 0.1), STEEL)
    for x in (-0.28, 0, 0.28):
        b.cyl("root", (x, 0, 0.5), 0.09, 0.34, GOLD)
        b.cyl("root", (x, 0, 0.7), 0.09, 0.14, RED, r2=0.02)
    b.box("root", (0.3, -0.33, -0.1), (0.3, 0.03, 0.2), YELLOW)


def health(b):
    b.box("root", (0, 0, 0), (1.0, 0.46, 0.76), WHITE)
    b.box("root", (0, 0, 0.42), (1.04, 0.5, 0.1), STEEL2)
    b.box("root", (0, 0, 0.52), (0.4, 0.14, 0.1), STEEL)
    for y in (-0.235, 0.235):
        b.box("root", (0, y, 0.0), (0.2, 0.03, 0.52), RED)
        b.box("root", (0, y, 0.0), (0.52, 0.03, 0.2), RED)
    b.box("root", (-0.52, 0, 0), (0.03, 0.46, 0.76), "#D9D9D9")
    b.box("root", (0.52, 0, 0), (0.03, 0.46, 0.76), "#D9D9D9")


def grenade(b):
    b.sphere("root", (0, 0, 0), 0.4, (1, 1, 1.15), GREEN)
    for z in (-0.22, 0, 0.22):
        b.cyl("root", (0, 0, z), 0.41, 0.05, "#3F7A3B")
    b.cyl("root", (0, 0, 0.48), 0.14, 0.18, STEEL)
    b.box("root", (0.17, 0, 0.46), (0.3, 0.1, 0.07), STEEL2, rot=(0, 0.35, 0))
    b.torus("root", (-0.18, 0, 0.5), 0.12, 0.03, GOLD, rot=(PI / 2, 0, 0), major=10, minor=5)


def weapon(b):
    b.box("root", (0, 0, -0.1), (1.0, 0.6, 0.5), ORANGE)
    b.box("root", (0, 0, 0.18), (1.04, 0.64, 0.1), "#B8631A")
    for x in (-0.44, 0.44):
        b.box("root", (x, 0, -0.1), (0.12, 0.64, 0.54), BLACK)
    b.box("root", (0, 0, 0.36), (0.46, 0.1, 0.1), STEEL)
    # a gun on top so it reads as "weapon"
    b.box("root", (0, 0, 0.5), (0.7, 0.14, 0.16), STEEL2)
    b.box("root", (-0.28, 0, 0.4), (0.16, 0.14, 0.26), BLACK, rot=(0, 0.3, 0))
    b.cyl("root", (0.42, 0, 0.52), 0.05, 0.3, STEEL, rot=(0, PI / 2, 0))


def shield(b):
    b.cyl("root", (0, 0, 0), 0.52, 0.16, STEEL, rot=(PI / 2, 0, 0))
    b.cyl("root", (0, -0.04, 0), 0.44, 0.16, BLUE, rot=(PI / 2, 0, 0))
    b.box("root", (0, -0.14, 0), (0.14, 0.06, 0.6), WHITE)
    b.box("root", (0, -0.14, 0), (0.6, 0.06, 0.14), WHITE)
    b.box("root", (0, 0.08, 0), (0.16, 0.14, 0.7), STEEL2)


def haste(b):
    b.cyl("root", (0, 0, -0.38), 0.5, 0.12, ORANGE)
    b.box("root", (0.12, 0, 0.3), (0.34, 0.2, 0.7), YELLOW, rot=(0, 0.45, 0))
    b.box("root", (-0.12, 0, -0.14), (0.34, 0.2, 0.7), YELLOW, rot=(0, 0.45, 0))
    b.box("root", (0, 0, 0.08), (0.62, 0.2, 0.2), YELLOW)
    b.box("root", (0, -0.12, 0.08), (0.3, 0.04, 0.1), WHITE)


def quad(b):
    b.cyl("root", (0, 0, 0.3), 0.46, 0.6, PURPLE, r2=0.02)
    b.cyl("root", (0, 0, -0.3), 0.46, 0.6, PURPLE2, r2=0.02, rot=(PI, 0, 0))
    for k in range(4):
        a = k * PI / 2 + PI / 4
        b.sphere("root", (math.cos(a) * 0.55, math.sin(a) * 0.55, 0), 0.1, (1, 1, 1), GOLD, seg=8, rings=5)


def nuke(b):
    b.cyl("root", (0, 0, 0), 0.36, 0.7, RED)
    b.cyl("root", (0, 0, 0.5), 0.36, 0.3, RED, r2=0.05)
    b.cyl("root", (0, 0, -0.4), 0.3, 0.2, STEEL2, r2=0.36)
    b.cyl("root", (0, 0, 0.12), 0.38, 0.1, YELLOW)
    b.cyl("root", (0, 0, -0.1), 0.38, 0.1, BLACK)
    for k in range(4):
        a = k * PI / 2
        b.box("root", (math.cos(a) * 0.36, math.sin(a) * 0.36, -0.38), (0.34 if k % 2 == 0 else 0.06, 0.34 if k % 2 else 0.06, 0.34), YELLOW, rot=(0, 0, 0))


def freeze(b):
    b.cyl("root", (0, 0, 0.08), 0.28, 0.9, ICE, r2=0.02)
    b.cyl("root", (0, 0, -0.5), 0.5, 0.1, ICE2)
    for k in range(5):
        a = k * 2 * PI / 5
        c, s = math.cos(a), math.sin(a)
        b.cyl("root", (c * 0.28, s * 0.28, -0.12), 0.13, 0.6, ICE2 if k % 2 else ICE, r2=0.02, rot=(-s * 0.5, c * 0.5, 0))


PROPS = [("ammo", ammo), ("health", health), ("grenade", grenade), ("weapon", weapon), ("shield", shield), ("haste", haste), ("quad", quad), ("nuke", nuke), ("freeze", freeze)]
exec(compile(_tail, "tail", "exec"), globals())
