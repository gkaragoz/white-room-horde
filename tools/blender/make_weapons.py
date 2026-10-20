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


def ar(b):
    b.box("root", (0, -0.55, 0.1), (0.25, 1.25, 0.3), DARK)                  # receiver
    b.box("root", (0, -1.1, 0.12), (0.22, 0.7, 0.26), DARK2)                 # handguard
    for k in range(4):
        b.box("root", (0, -0.85 - 0.14 * k, 0.12), (0.24, 0.04, 0.28), METAL)
    b.cyl("root", (0, -1.62, 0.12), 0.07, 0.5, METAL, rot=(math.pi / 2, 0, 0))   # barrel
    b.cyl("root", (0, -1.92, 0.12), 0.1, 0.16, DARK2, rot=(math.pi / 2, 0, 0))   # flash hider
    b.box("root", (0, -0.45, 0.34), (0.16, 0.34, 0.14), DARK2)               # optic body
    b.box("root", (0, -0.65, 0.34), (0.1, 0.05, 0.1), ACC)                   # lens front
    b.box("root", (0, -0.25, 0.34), (0.1, 0.05, 0.1), ACC2)                  # lens rear
    b.box("root", (0, -0.2, 0.26), (0.06, 0.5, 0.05), DARK2)                 # rail
    b.box("root", (0, 0.1, -0.2), (0.18, 0.2, 0.46), ACC, rot=(-0.18, 0, 0))  # grip
    b.box("root", (0, -0.35, -0.36), (0.15, 0.2, 0.56), ACC2, rot=(0.28, 0, 0))   # curved mag
    b.box("root", (0, 0.4, 0.04), (0.2, 0.62, 0.26), DARK2)                  # stock
    b.box("root", (0, 0.75, 0.02), (0.22, 0.08, 0.34), ACC)                  # butt pad
    b.box("root", (0, -1.75, 0.28), (0.05, 0.06, 0.1), ACC)                  # front sight
    return (0, -2.02, 0.12)


def minigun(b):
    b.cyl("root", (0, -0.5, 0.1), 0.2, 1.0, DARK, rot=(math.pi / 2, 0, 0))   # gearbox barrel
    b.box("root", (0, -0.1, 0.1), (0.46, 0.8, 0.46), DARK2)                  # rear housing
    b.box("root", (0, -0.1, 0.1), (0.5, 0.2, 0.3), ACC)                      # accent band
    b.cyl("root", (0, 0.45, 0.1), 0.22, 0.34, METAL, rot=(math.pi / 2, 0, 0))    # motor
    for k in range(6):                                                         # rotating barrel cluster
        a_ = 2 * math.pi * k / 6
        b.cyl("root", (math.cos(a_) * 0.2, -1.35, 0.1 + math.sin(a_) * 0.2), 0.055, 1.6, METAL, rot=(math.pi / 2, 0, 0))
    for y in (-0.8, -1.7):
        b.cyl("root", (0, y, 0.1), 0.31, 0.07, DARK2, rot=(math.pi / 2, 0, 0))   # barrel clamps
    b.cyl("root", (0, -2.14, 0.1), 0.33, 0.12, ACC, rot=(math.pi / 2, 0, 0))     # muzzle ring
    b.box("root", (0.36, -0.1, -0.02), (0.3, 0.5, 0.34), ACC2)               # ammo box
    b.box("root", (0.28, 0.1, 0.2), (0.1, 0.5, 0.08), METAL)                # ammo belt feed
    b.box("root", (0, -0.15, 0.42), (0.3, 0.7, 0.08), DARK2)                 # carry handle
    b.box("root", (0, 0.1, -0.24), (0.2, 0.22, 0.46), ACC, rot=(-0.15, 0, 0))     # grip
    b.box("root", (0, -0.55, -0.22), (0.16, 0.2, 0.34), DARK2)               # front grip
    return (0, -2.22, 0.1)


def sniper(b):
    b.cyl("root", (0, -1.2, 0.12), 0.065, 1.9, METAL, rot=(math.pi / 2, 0, 0))   # long barrel
    b.box("root", (0, -0.45, 0.1), (0.22, 1.0, 0.28), DARK)                  # receiver
    b.cyl("root", (0, -2.18, 0.12), 0.1, 0.22, DARK2, rot=(math.pi / 2, 0, 0))   # muzzle brake
    for k in range(3):
        b.cyl("root", (0, -2.0 - 0.07 * k, 0.12), 0.115, 0.03, METAL, rot=(math.pi / 2, 0, 0))
    b.cyl("root", (0, -0.45, 0.3), 0.11, 0.8, DARK2, rot=(math.pi / 2, 0, 0))    # scope tube
    b.cyl("root", (0, -0.86, 0.3), 0.15, 0.1, ACC, rot=(math.pi / 2, 0, 0))      # objective lens
    b.cyl("root", (0, -0.04, 0.3), 0.13, 0.1, ACC2, rot=(math.pi / 2, 0, 0))     # eyepiece
    for y in (-0.65, -0.25):
        b.box("root", (0, y, 0.2), (0.1, 0.08, 0.12), DARK2)                # scope mounts
    b.box("root", (0, 0.3, 0.02), (0.2, 0.8, 0.34), ACC2, rot=(-0.04, 0, 0))   # stock
    b.box("root", (0, 0.35, 0.22), (0.2, 0.5, 0.1), ACC)                     # cheek rest
    b.box("root", (0, 0.72, -0.02), (0.22, 0.1, 0.42), DARK2)                # butt pad
    b.box("root", (0, -0.15, -0.3), (0.12, 0.16, 0.3), DARK2)                # small mag
    b.box("root", (0, 0.12, -0.2), (0.18, 0.18, 0.4), ACC, rot=(-0.18, 0, 0))   # grip
    b.box("root", (0.18, -0.25, 0.14), (0.14, 0.06, 0.05), METAL)            # bolt handle
    b.sphere("root", (0.28, -0.25, 0.14), 0.06, (1, 1, 1), ACC, seg=6, rings=4)
    for sx in (-1, 1):
        b.box("root", (sx * 0.14, -1.5, -0.12), (0.05, 0.05, 0.4), DARK2, rot=(0, sx * 0.35, 0))   # folded bipod
    return (0, -2.32, 0.12)


# support (left) hand target for runtime two-bone IK; grip (right hand) is the origin
GRIP_L = {"pistol": (0, -0.18, -0.22), "smg": (0, -0.85, -0.22), "ar": (0, -1.1, -0.04), "shotgun": (0, -0.78, -0.22), "hmg": (0, -1.0, -0.14),
          "minigun": (0, -0.55, -0.42), "sniper": (0, -0.95, -0.08),
          "revolver": (0, -0.55, -0.18), "mp": (0, -0.55, -0.2), "dbl": (0, -0.6, -0.12), "dmr": (0, -1.0, -0.06), "flamer": (0, -0.75, -0.18), "gl": (0, -0.75, -0.2), "railgun": (0, -1.0, -0.06), "crossbow": (0, -0.9, -0.1), "plasma": (0, -0.9, -0.14), "rocket": (0, -0.45, -0.22), "nailgun": (0, -0.5, -0.18), "autoshotgun": (0, -1.0, -0.12), "akimbo": (0.36, -0.2, -0.22), "frostgun": (0, -0.9, -0.08), "sawlauncher": (0, -0.6, -0.2), "arcthrower": (0, -0.55, -0.12), "sword": (0, 0.02, 0.0), "hammer": (0, -0.55, 0.0)}


def revolver(b):
    b.box("root", (0, -0.12, 0.05), (0.2, 0.55, 0.34), DARK)                 # frame
    b.cyl("root", (0, -0.42, 0.12), 0.25, 0.46, METAL, rot=(math.pi / 2, 0, 0))   # cylinder drum
    for k in range(6):                                                         # chamber marks
        a = k * math.pi / 3
        b.cyl("root", (0.17 * math.cos(a), -0.67, 0.12 + 0.17 * math.sin(a)), 0.045, 0.04, DARK2, rot=(math.pi / 2, 0, 0))
    b.cyl("root", (0, -1.12, 0.2), 0.085, 1.0, DARK, rot=(math.pi / 2, 0, 0))   # barrel
    b.box("root", (0, -1.0, 0.07), (0.12, 0.9, 0.12), DARK2)                 # ejector shroud
    b.box("root", (0, -1.62, 0.3), (0.05, 0.08, 0.1), ACC)                   # front sight
    b.box("root", (0, 0.1, 0.27), (0.07, 0.16, 0.14), METAL, rot=(0.5, 0, 0))   # hammer
    b.box("root", (0, 0.13, -0.26), (0.2, 0.26, 0.5), ACC2, rot=(-0.28, 0, 0))   # wooden grip
    b.box("root", (0, 0.2, -0.54), (0.22, 0.28, 0.08), METAL, rot=(-0.28, 0, 0))   # butt cap
    b.torus("root", (0, -0.04, -0.12), 0.1, 0.025, DARK2, rot=(0, math.pi / 2, 0), major=8, minor=4)
    return (0, -1.64, 0.2)


def mp(b):
    b.box("root", (0, -0.3, 0.1), (0.2, 0.9, 0.24), DARK)                    # slide
    b.box("root", (0, -0.3, 0.26), (0.08, 0.7, 0.05), DARK2)
    b.box("root", (0, -0.62, 0.0), (0.12, 0.36, 0.1), ACC)                   # compensator block
    for k in range(3):
        b.box("root", (0, -0.78 - 0.07 * k, 0.12), (0.16, 0.04, 0.2), METAL)
    b.box("root", (0, 0.08, -0.22), (0.19, 0.22, 0.46), DARK2, rot=(-0.18, 0, 0))   # grip
    b.box("root", (0, -0.05, -0.62), (0.15, 0.2, 0.86), ACC, rot=(0.05, 0, 0))     # extended magazine
    b.box("root", (0, -0.03, -1.07), (0.18, 0.24, 0.1), ACC2)                # mag base
    b.box("root", (0, 0.4, 0.02), (0.05, 0.6, 0.05), METAL)                  # wire stock top
    b.box("root", (0, 0.68, -0.12), (0.18, 0.06, 0.34), DARK2)               # stock plate
    b.box("root", (0, 0.1, 0.3), (0.12, 0.05, 0.08), DARK2)                  # rear sight
    b.box("root", (0, -0.62, 0.3), (0.05, 0.06, 0.09), ACC)                  # front sight
    return (0, -0.98, 0.12)


def dbl(b):
    for sx in (-1, 1):
        b.cyl("root", (sx * 0.075, -0.95, 0.12), 0.095, 1.65, DARK, rot=(math.pi / 2, 0, 0))   # two barrels
        b.cyl("root", (sx * 0.075, -1.8, 0.12), 0.11, 0.1, METAL, rot=(math.pi / 2, 0, 0))
    b.box("root", (0, -0.95, 0.24), (0.1, 1.55, 0.05), DARK2)                # rib
    b.box("root", (0, -0.55, -0.1), (0.3, 0.7, 0.2), ACC)                    # forend
    b.box("root", (0, -0.02, 0.04), (0.3, 0.45, 0.34), DARK2)                # receiver / hinge
    b.cyl("root", (0, -0.28, 0.0), 0.08, 0.34, METAL, rot=(0, math.pi / 2, 0))   # hinge pin
    b.box("root", (0, 0.5, -0.06), (0.24, 0.9, 0.36), ACC2, rot=(-0.12, 0, 0))   # stock
    b.box("root", (0, 0.98, -0.12), (0.26, 0.1, 0.46), DARK2, rot=(-0.12, 0, 0))
    b.box("root", (0, 0.04, -0.28), (0.16, 0.16, 0.34), DARK2, rot=(-0.2, 0, 0))   # grip
    b.box("root", (0, -1.8, 0.28), (0.05, 0.06, 0.08), ACC)
    for sx in (-1, 1):
        b.box("root", (sx * 0.16, -0.04, 0.0), (0.02, 0.34, 0.06), METAL)    # locking lugs
    return (0, -1.86, 0.12)


def dmr(b):
    b.cyl("root", (0, -1.05, 0.12), 0.07, 1.5, METAL, rot=(math.pi / 2, 0, 0))   # barrel
    b.box("root", (0, -0.35, 0.12), (0.24, 1.1, 0.3), DARK)                  # receiver
    b.box("root", (0, -0.9, 0.0), (0.18, 0.8, 0.2), ACC)                     # handguard
    b.box("root", (0, -0.3, 0.32), (0.14, 0.9, 0.06), DARK2)                 # top rail
    b.cyl("root", (0, -0.28, 0.36), 0.1, 0.5, DARK2, rot=(math.pi / 2, 0, 0))    # short scope
    b.cyl("root", (0, -0.55, 0.36), 0.13, 0.08, ACC2, rot=(math.pi / 2, 0, 0))
    b.cyl("root", (0, 0.0, 0.36), 0.12, 0.08, ACC2, rot=(math.pi / 2, 0, 0))
    b.box("root", (0, -0.28, 0.27), (0.1, 0.1, 0.1), DARK2)
    b.cyl("root", (0, -1.84, 0.12), 0.1, 0.24, DARK2, rot=(math.pi / 2, 0, 0))   # muzzle brake
    b.box("root", (0, -0.4, -0.28), (0.14, 0.2, 0.46), ACC2, rot=(0.1, 0, 0))   # magazine
    b.box("root", (0, 0.1, -0.2), (0.18, 0.2, 0.42), ACC, rot=(-0.18, 0, 0))    # grip
    b.box("root", (0, 0.5, 0.08), (0.2, 0.9, 0.28), ACC2)                    # skeleton stock
    b.box("root", (0, 0.5, 0.2), (0.16, 0.5, 0.08), DARK2)
    b.box("root", (0, 0.98, 0.04), (0.22, 0.08, 0.4), DARK2)
    b.box("root", (0.14, -0.1, 0.14), (0.1, 0.2, 0.05), METAL)               # charging handle
    return (0, -2.0, 0.12)


def flamer(b):
    b.cyl("root", (0, -0.5, 0.1), 0.12, 1.3, DARK2, rot=(math.pi / 2, 0, 0))     # pipe
    b.box("root", (0, -0.2, 0.06), (0.28, 0.7, 0.32), DARK)                  # body
    for sx in (-1, 1):                                                         # fuel bottles on the sides
        b.cyl("root", (sx * 0.3, -0.2, 0.0), 0.15, 0.95, ACC, rot=(math.pi / 2, 0, 0))
        b.sphere("root", (sx * 0.3, -0.68, 0.0), 0.15, (1, 1, 1), ACC, seg=8, rings=4)
        b.cyl("root", (sx * 0.3, 0.3, 0.0), 0.07, 0.06, METAL, rot=(math.pi / 2, 0, 0))
    b.cyl("root", (0, -1.2, 0.1), 0.2, 0.34, METAL, rot=(math.pi / 2, 0, 0), r2=0.13)   # flared nozzle
    b.cyl("root", (0, -1.42, 0.1), 0.23, 0.1, DARK2, rot=(math.pi / 2, 0, 0))
    b.sphere("root", (0, -1.55, 0.1), 0.08, (1, 1, 1), "#FF9A2E", seg=6, rings=4)   # pilot light
    b.box("root", (0, 0.12, -0.24), (0.18, 0.2, 0.44), ACC2, rot=(-0.2, 0, 0))     # grip
    b.box("root", (0, 0.4, 0.04), (0.16, 0.5, 0.2), DARK2)                   # stock
    b.cyl("root", (0, -0.2, 0.38), 0.05, 0.3, METAL)                         # pressure gauge stem
    b.sphere("root", (0, -0.2, 0.5), 0.1, (1, 1, 0.5), "#F4F0E6", seg=8, rings=4)   # gauge face
    return (0, -1.6, 0.1)


def gl(b):
    b.cyl("root", (0, -0.7, 0.14), 0.22, 1.3, DARK, rot=(math.pi / 2, 0, 0))     # fat launch tube
    b.cyl("root", (0, -1.4, 0.14), 0.27, 0.18, METAL, rot=(math.pi / 2, 0, 0))   # muzzle ring
    for k in range(3):
        b.cyl("root", (0, -0.5 - 0.3 * k, 0.14), 0.25, 0.05, DARK2, rot=(math.pi / 2, 0, 0))
    b.box("root", (0, -0.05, 0.1), (0.3, 0.6, 0.4), DARK2)                   # receiver
    b.cyl("root", (0, -0.15, -0.1), 0.34, 0.3, ACC, rot=(math.pi / 2, 0, 0))     # revolving drum
    b.cyl("root", (0, -0.15, -0.1), 0.1, 0.34, DARK2, rot=(math.pi / 2, 0, 0))
    b.box("root", (0, 0.4, 0.04), (0.22, 0.6, 0.3), ACC2)                    # stock
    b.box("root", (0, 0.74, 0.0), (0.24, 0.08, 0.4), DARK2)
    b.box("root", (0, 0.06, -0.3), (0.18, 0.18, 0.4), ACC, rot=(-0.2, 0, 0))   # grip
    b.box("root", (0, -0.7, -0.15), (0.14, 0.2, 0.3), DARK2)                 # foregrip
    b.box("root", (0, -0.35, 0.46), (0.06, 0.4, 0.14), METAL)                # ladder sight
    b.box("root", (0, -0.28, 0.52), (0.1, 0.04, 0.06), ACC)
    return (0, -1.5, 0.14)


def sword(b):
    """A broad blade along -Y: leather grip, golden cross-guard, pommel, a ridge down the flat of the blade and a pointed tip."""
    b.cyl("root", (0, -0.12, 0.0), 0.06, 0.4, DARK, rot=(math.pi / 2, 0, 0))              # grip
    b.sphere("root", (0, 0.1, 0.0), 0.11, (1, 1, 1), ACC2)                                  # pommel
    b.box("root", (0, -0.36, 0.0), (0.8, 0.12, 0.14), ACC)                                  # cross-guard
    for sx in (-1, 1):
        b.sphere("root", (sx * 0.42, -0.36, 0.0), 0.09, (1, 1, 1), ACC2)                    # guard tips
    b.box("root", (0, -1.2, 0.0), (0.4, 1.6, 0.07), "#E6EBF4")                              # blade
    b.box("root", (0, -1.2, 0.0), (0.12, 1.55, 0.11), "#B9C2D2")                             # fuller ridge
    b.cyl("root", (0, -2.14, 0.0), 0.2, 0.34, "#E6EBF4", rot=(math.pi / 2, 0, 0), r2=0.0)   # tip
    return (0, -2.2, 0.0)


def hammer(b):
    """A big war hammer: long wooden haft, an iron head with brass faces and a spike on the back."""
    b.cyl("root", (0, -0.7, 0.0), 0.075, 1.9, "#8A5A32", rot=(math.pi / 2, 0, 0))            # haft
    b.sphere("root", (0, 0.3, 0.0), 0.12, (1, 1, 1), DARK2)                                 # butt
    for k in range(3):
        b.cyl("root", (0, -0.2 - 0.25 * k, 0.0), 0.095, 0.05, DARK2, rot=(math.pi / 2, 0, 0))   # grip bands
    b.box("root", (0, -1.72, 0.0), (0.46, 0.5, 0.5), "#4A4F5A")                              # iron head
    b.box("root", (0.38, -1.72, 0.0), (0.2, 0.56, 0.56), ACC)                                # striking face
    b.box("root", (-0.38, -1.72, 0.0), (0.2, 0.56, 0.56), ACC)
    b.box("root", (0, -1.72, 0.0), (0.9, 0.18, 0.18), "#2E323B")                              # binding
    b.cyl("root", (0, -1.72, 0.34), 0.1, 0.34, "#9AA0AB", r2=0.0)                            # spike on top
    return (0, -1.9, 0.0)


# ---------------------------------------------------------------- v0.19: ten more guns
CYAN, CYAN2, ICE, FIRE, GLOW = "#6FE8FF", "#2FA8D8", "#C8F4FF", "#FF7A2A", "#B8FF6A"


def railgun(b):
    b.box("root", (0, -0.6, 0.1), (0.3, 1.5, 0.3), DARK)                      # spine
    for sx in (-1, 1):
        b.box("root", (sx * 0.15, -1.45, 0.14), (0.07, 1.5, 0.12), METAL)       # twin rails
        b.box("root", (sx * 0.18, -0.9, 0.05), (0.05, 0.9, 0.2), DARK2)         # rail braces
    for k in range(4):
        b.torus("root", (0, -0.5 - 0.36 * k, 0.12), 0.2, 0.04, CYAN, rot=(math.pi / 2, 0, 0), major=8, minor=4)   # coil rings
    b.box("root", (0, -0.2, 0.34), (0.16, 0.5, 0.1), ACC)                      # top rib
    b.box("root", (0, 0.12, -0.22), (0.2, 0.22, 0.5), ACC2, rot=(-0.2, 0, 0))   # grip
    b.box("root", (0, 0.55, 0.02), (0.24, 0.8, 0.34), DARK2)                   # stock
    b.sphere("root", (0, -2.18, 0.14), 0.07, (1, 1, 1), CYAN, seg=6, rings=4)   # glowing tip
    return (0, -2.26, 0.14)


def crossbow(b):
    b.box("root", (0, -0.5, 0.06), (0.16, 1.4, 0.18), "#8B5A2B")              # stock
    b.box("root", (0, 0.35, 0.0), (0.2, 0.5, 0.3), "#6B4220")                  # butt
    b.box("root", (0, -1.12, 0.1), (1.6, 0.1, 0.12), DARK)                     # bow limbs
    for sx in (-1, 1):
        b.box("root", (sx * 0.86, -1.02, 0.1), (0.4, 0.1, 0.1), DARK2, rot=(0, 0, sx * 0.4))
    b.box("root", (0, -0.78, 0.18), (1.5, 0.025, 0.025), "#E8E0C8")            # bowstring
    b.box("root", (0, -0.98, 0.21), (0.05, 1.2, 0.05), METAL)                 # bolt
    b.cyl("root", (0, -1.62, 0.21), 0.06, 0.18, ACC, rot=(math.pi / 2, 0, 0), r2=0.0)   # bolt head
    b.box("root", (0, 0.1, -0.22), (0.18, 0.22, 0.46), "#6B4220", rot=(-0.2, 0, 0))
    b.box("root", (0, -0.2, 0.18), (0.1, 0.4, 0.05), ACC)                      # sight rail
    return (0, -1.74, 0.21)


def plasma(b):
    b.box("root", (0, -0.4, 0.1), (0.36, 1.2, 0.34), DARK)                    # body
    b.cyl("root", (0, -0.7, 0.34), 0.17, 0.9, GLOW, rot=(math.pi / 2, 0, 0))   # glowing cell
    b.cyl("root", (0, -1.4, 0.12), 0.13, 0.7, METAL, rot=(math.pi / 2, 0, 0))  # barrel
    b.torus("root", (0, -1.72, 0.12), 0.2, 0.05, CYAN, rot=(math.pi / 2, 0, 0), major=8, minor=4)   # emitter
    b.torus("root", (0, -1.5, 0.12), 0.18, 0.04, CYAN2, rot=(math.pi / 2, 0, 0), major=8, minor=4)
    b.box("root", (0, 0.1, -0.2), (0.2, 0.22, 0.46), ACC2, rot=(-0.2, 0, 0))   # grip
    b.box("root", (0, 0.5, 0.0), (0.26, 0.7, 0.3), DARK2)                      # stock
    b.box("root", (0, -0.9, -0.16), (0.14, 0.4, 0.3), DARK2)                   # foregrip block
    return (0, -2.0, 0.12)


def rocket(b):
    b.cyl("root", (0, -0.7, 0.1), 0.24, 1.9, DARK, rot=(math.pi / 2, 0, 0))    # tube
    b.cyl("root", (0, -1.75, 0.1), 0.28, 0.2, METAL, rot=(math.pi / 2, 0, 0))  # front lip
    b.cyl("root", (0, 0.35, 0.1), 0.3, 0.3, DARK2, rot=(math.pi / 2, 0, 0), r2=0.22)   # rear flare
    b.cyl("root", (0, -1.7, 0.1), 0.15, 0.3, FIRE, rot=(math.pi / 2, 0, 0), r2=0.0)    # rocket nose
    b.box("root", (0, -0.5, 0.38), (0.1, 0.8, 0.08), ACC)                      # sight rail
    b.box("root", (0, -0.3, -0.2), (0.16, 0.2, 0.4), ACC2)                     # fore grip
    b.box("root", (0, 0.1, -0.28), (0.2, 0.22, 0.46), ACC2, rot=(-0.2, 0, 0))  # grip
    b.box("root", (0, -0.7, 0.1), (0.6, 0.05, 0.05), DARK2)                    # band
    return (0, -1.9, 0.1)


def nailgun(b):
    b.box("root", (0, -0.25, 0.1), (0.3, 0.9, 0.34), "#FFB84A")                # housing
    b.box("root", (0, -0.25, 0.3), (0.2, 0.7, 0.08), DARK2)
    b.cyl("root", (0, -0.85, 0.12), 0.1, 0.5, METAL, rot=(math.pi / 2, 0, 0))  # nozzle
    b.box("root", (0, -0.55, -0.25), (0.14, 0.9, 0.18), DARK, rot=(0.0, 0, 0)) # nail strip magazine
    for k in range(5):
        b.box("root", (0, -0.2 - 0.17 * k, -0.34), (0.05, 0.05, 0.12), METAL)
    b.box("root", (0, 0.08, -0.2), (0.2, 0.22, 0.46), DARK2, rot=(-0.2, 0, 0))
    b.box("root", (0, 0.3, 0.1), (0.1, 0.4, 0.3), DARK)
    return (0, -1.1, 0.12)


def autoshotgun(b):
    b.box("root", (0, -0.45, 0.1), (0.3, 1.4, 0.3), DARK)                     # receiver
    b.cyl("root", (0, -1.4, 0.16), 0.11, 1.0, METAL, rot=(math.pi / 2, 0, 0))  # barrel
    b.cyl("root", (0, -1.4, 0.0), 0.08, 1.0, DARK2, rot=(math.pi / 2, 0, 0))   # tube magazine
    b.cyl("root", (0, -0.5, -0.32), 0.3, 0.26, ACC, rot=(0, 0, 0))            # drum magazine
    b.cyl("root", (0, -0.5, -0.32), 0.12, 0.3, DARK2, rot=(0, 0, 0))
    b.box("root", (0, 0.1, -0.2), (0.2, 0.22, 0.46), ACC2, rot=(-0.2, 0, 0))   # grip
    b.box("root", (0, 0.5, 0.0), (0.24, 0.8, 0.32), DARK2)                     # stock
    b.box("root", (0, -0.3, 0.3), (0.12, 0.8, 0.07), ACC)                      # rail
    return (0, -1.92, 0.16)


def akimbo(b):
    for sx in (-1, 1):
        x = sx * 0.36
        b.box("root", (x, -0.32, 0.13), (0.2, 0.8, 0.22), DARK)               # slide
        b.box("root", (x, -0.27, -0.02), (0.2, 0.66, 0.1), DARK2)             # frame
        b.cyl("root", (x, -0.78, 0.12), 0.075, 0.14, METAL, rot=(math.pi / 2, 0, 0))
        b.box("root", (x, 0.08, -0.24), (0.18, 0.2, 0.46), ACC, rot=(-0.2, 0, 0))   # grip
        b.box("root", (x, -0.7, 0.28), (0.04, 0.05, 0.07), ACC2)
    b.box("root", (0, -0.1, 0.0), (0.7, 0.1, 0.1), DARK2)                      # the bridge that joins them
    return (0, -0.86, 0.12)


def frostgun(b):
    b.box("root", (0, -0.4, 0.1), (0.3, 1.2, 0.32), "#8FBFD8")                # body
    b.cyl("root", (0, -0.1, 0.3), 0.14, 0.7, CYAN2, rot=(math.pi / 2, 0, 0))   # coolant tank
    b.cyl("root", (0, -1.15, 0.14), 0.12, 0.7, METAL, rot=(math.pi / 2, 0, 0))
    for k in range(4):                                                         # ice crystals round the muzzle
        a = k * math.pi / 2 + 0.4
        b.cyl("root", (0.13 * math.cos(a), -1.5, 0.14 + 0.13 * math.sin(a)), 0.045, 0.34, ICE, rot=(math.pi / 2 + 0.2 * math.cos(a), 0.2 * math.sin(a), 0), r2=0.0)
    b.box("root", (0, 0.1, -0.2), (0.2, 0.22, 0.46), ACC2, rot=(-0.2, 0, 0))
    b.box("root", (0, 0.5, 0.0), (0.24, 0.7, 0.3), DARK2)
    b.sphere("root", (0, -0.45, 0.28), 0.09, (1, 1.6, 0.6), ICE, seg=6, rings=4)
    return (0, -1.62, 0.14)


def sawlauncher(b):
    b.box("root", (0, -0.35, 0.1), (0.4, 1.1, 0.4), DARK)                     # chunky body
    b.cyl("root", (0, -1.0, 0.14), 0.5, 0.1, METAL, rot=(0, 0, 0))            # saw disc (flat ring seen from above)
    b.torus("root", (0, -1.0, 0.14), 0.52, 0.06, ACC, major=10, minor=4)
    for k in range(8):                                                         # teeth
        a = k * math.pi / 4
        b.box("root", (0.55 * math.cos(a), -1.0 + 0.55 * math.sin(a), 0.14), (0.12, 0.12, 0.08), DARK2, rot=(0, 0, a))
    b.cyl("root", (0, -1.0, 0.14), 0.14, 0.2, DARK2)
    b.box("root", (0, 0.1, -0.2), (0.2, 0.22, 0.46), ACC2, rot=(-0.2, 0, 0))
    b.box("root", (0, 0.5, 0.0), (0.26, 0.7, 0.32), DARK2)
    b.box("root", (0, -0.6, -0.2), (0.14, 0.3, 0.3), ACC)
    return (0, -1.6, 0.14)


def arcthrower(b):
    b.box("root", (0, -0.3, 0.1), (0.3, 0.9, 0.32), DARK)                     # body
    b.cyl("root", (0, -0.1, 0.34), 0.16, 0.5, CYAN2, rot=(math.pi / 2, 0, 0))  # capacitor
    for sx in (-1, 1):
        b.cyl("root", (sx * 0.2, -1.0, 0.14), 0.04, 0.9, METAL, rot=(math.pi / 2, 0, 0))   # twin electrodes
        b.sphere("root", (sx * 0.2, -1.5, 0.14), 0.08, (1, 1, 1), "#FFFFA8", seg=6, rings=4)
    b.torus("root", (0, -0.85, 0.14), 0.26, 0.03, CYAN, rot=(math.pi / 2, 0, 0), major=8, minor=4)
    b.box("root", (0, 0.08, -0.2), (0.2, 0.22, 0.46), ACC2, rot=(-0.2, 0, 0))
    b.box("root", (0, 0.4, 0.04), (0.2, 0.6, 0.28), DARK2)
    return (0, -1.6, 0.14)



WEAPONS = [("pistol", pistol), ("smg", smg), ("ar", ar), ("shotgun", shotgun), ("hmg", hmg), ("minigun", minigun), ("sniper", sniper), ("grenade", grenade), ("revolver", revolver), ("mp", mp), ("dbl", dbl), ("dmr", dmr), ("flamer", flamer), ("gl", gl), ("sword", sword), ("hammer", hammer), ("railgun", railgun), ("crossbow", crossbow), ("plasma", plasma), ("rocket", rocket), ("nailgun", nailgun), ("autoshotgun", autoshotgun), ("akimbo", akimbo), ("frostgun", frostgun), ("sawlauncher", sawlauncher), ("arcthrower", arcthrower)]


exec(compile(open(os.path.join(HERE, "meshclean.py"), encoding="utf-8").read(), "meshclean", "exec"), globals())


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
    removed = cull_hidden(mesh)
    print("weapon", wid, "removed hidden/coplanar faces:", removed, clean_mesh(mesh))
    mesh.name = "weapon_" + wid
    mesh.data.name = "weapon_" + wid
    empties = []
    for nm, loc in (("grip", (0, 0, 0)), ("muzzle", muzzle), ("grip_l", GRIP_L.get(wid))):
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
    meta = {"id": wid, "tris": tris(mesh.data), "muzzle": [round(c, 3) for c in next(e for e in empties if e.name.startswith("muzzle")).location] if any(e.name.startswith("muzzle") for e in empties) else None,
            "grip_l": GRIP_L.get(wid),
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
    sc.render.resolution_x, sc.render.resolution_y = 1500, 1500
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
    order = ["pistol", "smg", "ar", "shotgun", "hmg", "minigun", "sniper", "grenade", "revolver", "mp", "dbl", "dmr", "flamer", "gl"]
    pos = {"pistol": (-8.4, 3.0), "smg": (-3.2, 3.0), "ar": (3.2, 3.0), "shotgun": (9.6, 3.0), "hmg": (-7.4, -3.2), "minigun": (-0.6, -3.2), "sniper": (6.8, -3.2), "grenade": (10.6, -3.2),
           "revolver": (-8.4, -9.4), "mp": (-3.2, -9.4), "dbl": (3.2, -9.4), "dmr": (9.6, -9.4), "flamer": (-4.0, -15.0), "gl": (4.0, -15.0), "railgun": (-8.4, -27.0), "crossbow": (-1.0, -27.0), "plasma": (6.4, -27.0), "rocket": (-8.4, -33.0), "nailgun": (-2.0, -33.0), "autoshotgun": (5.0, -33.0), "akimbo": (-8.4, -39.0), "frostgun": (-2.0, -39.0), "sawlauncher": (5.0, -39.0), "arcthrower": (-8.4, -45.0), "sword": (-2.0, -21.0), "hammer": (8.0, -21.0)}
    for (wid, mesh, emp) in items:
        x, y = pos[wid]
        mesh.location = (x + 1.2, y, 0)
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
    cam.data.ortho_scale = 70
    cam.rotation_euler = (math.radians(55), 0, math.radians(0))
    cam.location = Vector((1.2, -22.0, 0.2)) + cam.rotation_euler.to_matrix() @ Vector((0, 0, 30))
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
        for e in emp:  # free the names so the next weapon exports clean `grip`/`muzzle`/`grip_l`
            bpy.data.objects.remove(e, do_unlink=True)
        items.append((wid, mesh, []))
    if errs:
        raise ValueError("; ".join(errs))
    if PREVIEW and bpy.app.background:
        lineup(items)
    return res


RESULT = run()
print(RESULT)
