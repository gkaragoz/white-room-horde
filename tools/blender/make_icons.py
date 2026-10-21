"""Render the game's icon set: one badge per icon (a coloured disc with a raised glyph), 128x128, transparent.

  blender -b --factory-startup --python tools/blender/make_icons.py                 all icons
  ONLY=bolt,heart blender -b --factory-startup --python tools/blender/make_icons.py
  OUT_DIR=some/dir ...                                                              default packages/client/public/icons
  SHEET=contact.png ...                                                             also write a contact sheet

The look is made by tools/blender/icon_kit.py. Glyphs are drawn here as vector shapes in a 24x24 box (the helpers below build
the path strings); layer colours: 'g' glyph, 'p' plate (used to knock a hole out of a glyph), 'a' accent, 'd' dark, 'w' white.
The script fails when an image comes out empty.
"""
import bpy, os, sys, math
from math import cos, sin, pi

HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/make_icons.py")))
sys.path.insert(0, HERE)
import icon_kit as kit  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.environ.get("OUT_DIR") or os.path.join(REPO, "packages", "client", "public", "icons")
ONLY = [x for x in os.environ.get("ONLY", "").split(",") if x] or None
SHEET = os.environ.get("SHEET")

CREAM, DARK, WHITE = "#fff6e6", "#3a352d", "#ffffff"
BLUE, RED, ORANGE, YELLOW, GREEN, STEEL, PURPLE, PINK, BRASS, NAVY, OLIVE, TEAL = (
    "#2f8fe8", "#d8362e", "#ff8a2a", "#ffd23a", "#47b86a", "#8e9aaf", "#9a63ff", "#ff6b9a", "#d9a441", "#2b3a52", "#6e7a45", "#2bb3b1",
)


# ---- path helpers (24x24 box) ----
def f(v):
    return ("%.2f" % v).rstrip("0").rstrip(".")


def poly(pts):
    return "M" + " L".join("%s %s" % (f(x), f(y)) for x, y in pts) + " Z"


def circ(cx, cy, r):
    return "M%s %s a%s %s 0 1 0 %s 0 a%s %s 0 1 0 %s 0 Z" % (f(cx - r), f(cy), f(r), f(r), f(2 * r), f(r), f(r), f(-2 * r))


def rect(x, y, w, h):
    return poly([(x, y), (x + w, y), (x + w, y + h), (x, y + h)])


def rrect(x, y, w, h, r):
    pts = []
    for cx, cy, a0 in ((x + w - r, y + r, -90), (x + w - r, y + h - r, 0), (x + r, y + h - r, 90), (x + r, y + r, 180)):
        for k in range(5):
            a = math.radians(a0 + k * 22.5)
            pts.append((cx + r * cos(a), cy + r * sin(a)))
    return poly(pts)


def star(cx, cy, R, r, n, rot=-90):
    pts = []
    for i in range(2 * n):
        a = math.radians(rot + i * 180 / n)
        rad = R if i % 2 == 0 else r
        pts.append((cx + rad * cos(a), cy + rad * sin(a)))
    return poly(pts)


def capsule(x1, y1, x2, y2, r):
    a = math.atan2(y2 - y1, x2 - x1)
    pts = []
    for k in range(7):
        t = a - pi / 2 + k * pi / 6
        pts.append((x2 + r * cos(t), y2 + r * sin(t)))
    for k in range(7):
        t = a + pi / 2 + k * pi / 6
        pts.append((x1 + r * cos(t), y1 + r * sin(t)))
    return poly(pts)


def rot(pts, cx, cy, deg):
    a = math.radians(deg)
    return [(cx + (x - cx) * cos(a) - (y - cy) * sin(a), cy + (x - cx) * sin(a) + (y - cy) * cos(a)) for x, y in pts]


HEART = "M12 19.5 C12 19.5 4.5 14.8 4.5 9.6 C4.5 7.2 6.3 5.5 8.5 5.5 C10 5.5 11.3 6.3 12 7.6 C12.7 6.3 14 5.5 15.5 5.5 C17.7 5.5 19.5 7.2 19.5 9.6 C19.5 14.8 12 19.5 12 19.5 Z"
SHIELD = "M12 4 L18.5 6.5 V12 C18.5 15.8 15.7 18.5 12 20 C8.3 18.5 5.5 15.8 5.5 12 V6.5 Z"
SHIELD_IN = "M12 6.4 L16.3 8 V12 C16.3 14.6 14.5 16.6 12 17.8 C9.5 16.6 7.7 14.6 7.7 12 V8 Z"
BOLT = poly([(13.6, 3.8), (6.6, 13.2), (10.8, 13.2), (9.6, 20.2), (17.4, 10.2), (13.2, 10.2)])
FLAME = "M12 3.8 C12.8 7.4 17.2 9.4 17.2 14.4 A5.2 5.2 0 0 1 6.8 14.4 C6.8 11.8 8.4 10.6 9.4 9 C9.9 10.8 11 10.8 11.1 9.2 C11.2 7.4 11.5 5.4 12 3.8 Z"
FLAME_IN = "M12 11.2 C12.5 12.8 14.4 13.6 14.4 15.6 A2.4 2.4 0 0 1 9.6 15.6 C9.6 14.4 10.6 13.8 11.1 12.6 C11.5 12.2 11.9 11.8 12 11.2 Z"
CHECK = poly([(4.6, 12.6), (6.8, 10.4), (10, 13.6), (17.2, 6.4), (19.4, 8.6), (10, 18)])
SKULL_TOP = circ(12, 11, 6.6)
CROWN = poly([(4.5, 17.5), (5.4, 8), (9, 12), (12, 5.6), (15, 12), (18.6, 8), (19.5, 17.5)])
SWORD = poly([(17.6, 3.6), (20.4, 6.4), (11, 15.8), (8.2, 13)])
SWORD_G = poly([(5.4, 11.8), (12.2, 18.6), (10.6, 20.2), (3.8, 13.4)])
SWORD_H = poly([(3.8, 20.2), (4.6, 16.4), (7.6, 19.4)])
HAMMER_H = poly([(5.4, 18.6), (7.2, 20.4), (15.6, 11.2), (13.8, 9.4)])
HAMMER_B = poly(rot([(9.2, 4.2), (18.6, 4.2), (18.6, 9.2), (9.2, 9.2)], 13.9, 6.7, 40))
MAGNET = "M6 5 H10 V13 C10 14.8 14 14.8 14 13 V5 H18 V13 C18 19 6 19 6 13 Z"
BOOT = poly([(6, 5.5), (11.2, 5.5), (11.2, 11.6), (17.6, 13.6), (18.8, 17.4), (18.8, 19), (6, 19)])
BOOK = poly([(5, 6.2), (11.4, 6.8), (11.4, 18.2), (5, 17.6)]) + " " + poly([(19, 6.2), (12.6, 6.8), (12.6, 18.2), (19, 17.6)])
CLOVER = circ(9.4, 9.4, 3.4) + " " + circ(14.6, 9.4, 3.4) + " " + circ(9.4, 14.6, 3.4) + " " + circ(14.6, 14.6, 3.4)
BULLET = poly([(12, 3.6), (15.4, 7.6), (15.4, 15.4), (8.6, 15.4), (8.6, 7.6)])


def U(open_=False):
    # shackle of a padlock as one outline (no hole)
    dx = 3.2 if open_ else 0
    return "M%s 10.5 V7.4 C%s 4.8 %s 3.2 %s 3.2 C%s 3.2 %s 4.8 %s 7.4 V%s H%s V7.4 C%s 6 %s 5.4 %s 5.4 C%s 5.4 %s 6 %s 7.4 V10.5 Z" % (
        f(8 + dx), f(8 + dx), f(9.8 + dx), f(12 + dx), f(14.2 + dx), f(16 + dx), f(16 + dx), f(8 if open_ else 10.5), f(13.8 + dx), f(13.8 + dx), f(13 + dx), f(12 + dx), f(11 + dx), f(10.2 + dx), f(10.2 + dx),
    )


# (plate colour, [(path, token)...]); tokens: g glyph, p plate, a accent, d dark, w white
def I(plate, layers, glyph=CREAM, accent=YELLOW):
    return {"plate": plate, "glyph": glyph, "accent": accent, "layers": layers}


ICONS = {
    # classes
    "class_0": I(BLUE, [(star(12, 12, 8.2, 3.6, 5), "a")], accent=YELLOW),
    "class_1": I(GREEN, [(rect(10, 5, 4, 14), "g"), (rect(5, 10, 14, 4), "g")], glyph=WHITE),
    "class_2": I(OLIVE, [(SHIELD, "g"), (SHIELD_IN, "a")], accent=STEEL),
    "class_3": I(ORANGE, [(BOOT, "g"), (rect(5.5, 17.6, 14.4, 2.2), "d"), (rect(2.4, 8, 3, 1.4), "g"), (rect(1.8, 11, 3.6, 1.4), "g")]),
    "class_4": I(RED, [(circ(11.2, 14, 6), "d"), (rect(10.2, 5.4, 2.4, 3.2), "g"), (star(16.6, 6.2, 3, 1.3, 5), "a")], accent=YELLOW),
    "class_5": I(PURPLE, [(circ(12, 12, 8), "g"), (circ(12, 12, 5.6), "a"), (circ(12, 12, 3.6), "g"), (circ(12, 12, 1.6), "a")], accent=RED),
    "class_6": I("#b3261e", [(FLAME, "a"), (FLAME_IN, "g")], accent=ORANGE),
    "class_7": I(STEEL, [(SWORD, "g"), (SWORD_G, "a"), (SWORD_H, "d")], accent=BRASS),
    "class_8": I(BRASS, [(HAMMER_H, "d"), (HAMMER_B, "g")]),
    # weapon statistics
    "stat_dmg": I(RED, [(star(12, 12, 8.4, 4.4, 8), "g"), (star(12, 12, 4.4, 2.2, 6), "a")], accent=YELLOW),
    "stat_rate": I(YELLOW, [(BOLT, "d")]),
    "stat_dps": I(ORANGE, [(FLAME, "g"), (FLAME_IN, "a")], accent=YELLOW),
    "stat_range": I(BLUE, [(circ(12, 12, 7.2, ), "g"), (circ(12, 12, 5, ), "p"), (circ(12, 12, 2.2), "g"), (rect(11.2, 2.8, 1.6, 5, ), "g"), (rect(11.2, 16.2, 1.6, 5), "g"), (rect(2.8, 11.2, 5, 1.6), "g"), (rect(16.2, 11.2, 5, 1.6), "g")]),
    "stat_acc": I(TEAL, [(circ(12, 12, 7.4), "g"), (circ(12, 12, 5.2), "p"), (circ(12, 12, 3), "g"), (circ(12, 12, 1.2), "p")]),
    "stat_mag": I(STEEL, [(rrect(5.6, 7.4, 12.8, 11, 1.4), "g"), (rect(5, 5.4, 14, 3, ), "a"), (rect(8, 11, 2, 5), "p"), (rect(11, 11, 2, 5), "p"), (rect(14, 11, 2, 5), "p")], accent=BRASS),
    "stat_reload": I(BLUE, [(circ(12, 12, 7), "g"), (circ(12, 12, 4.4), "p"), (rect(12, 5.2, 6.6, 6.8), "p"), (poly([(11.2, 3.6), (18, 8.6), (11.2, 13.4)]), "g")]),
    "stat_pierce": I(PURPLE, [(poly([(3.6, 10.4), (14.2, 10.4), (14.2, 6.6), (20.6, 12), (14.2, 17.4), (14.2, 13.6), (3.6, 13.6)]), "g")]),
    "stat_blast": I(ORANGE, [(star(12, 12, 9, 5.2, 12), "g"), (star(12, 12, 5.2, 2.8, 8), "a")], accent=YELLOW),
    "stat_ammo": I(OLIVE, [(rrect(5, 9, 14, 10, 1.2), "g"), (rect(4, 6.8, 16, 3.6), "a"), (rect(11, 6.8, 2, 12.2), "p")], accent=BRASS),
    # HUD and screens
    "hud_grenade": I(OLIVE, [(circ(11.6, 14, 6), "g"), (rect(10, 5.2, 3.2, 3.6), "a"), (poly([(13, 5.8), (17.6, 4.4), (17.6, 6.4), (13, 7.6)]), "g")], accent=STEEL),
    "hud_dash": I(BLUE, [(poly([(4, 6), (10.6, 12), (4, 18), (4, 14.6), (7, 12), (4, 9.4)]), "g"), (poly([(11, 6), (17.6, 12), (11, 18), (11, 14.6), (14, 12), (11, 9.4)]), "g")]),
    "hud_ability": I(PURPLE, [(star(12, 12, 8.4, 3.8, 5), "a")], accent=YELLOW),
    "hud_check": I(GREEN, [(CHECK, "g")], glyph=WHITE),
    "hud_cross": I(RED, [(poly(rot([(10.6, 4.6), (13.4, 4.6), (13.4, 19.4), (10.6, 19.4)], 12, 12, 45)), "g"), (poly(rot([(10.6, 4.6), (13.4, 4.6), (13.4, 19.4), (10.6, 19.4)], 12, 12, -45)), "g")], glyph=WHITE),
    "hud_skull": I(DARK, [(SKULL_TOP, "g"), (rect(8.8, 14.6, 6.4, 4.6), "g"), (circ(9.2, 11.2, 1.9), "p"), (circ(14.8, 11.2, 1.9), "p"), (rect(10.6, 15.4, 0.9, 2.6), "p"), (rect(12.5, 15.4, 0.9, 2.6), "p")]),
    "hud_lock": I(STEEL, [(U(False), "g"), (rrect(6.2, 10.4, 11.6, 9.4, 1.4), "g"), (circ(12, 14.4, 1.6), "p"), (rect(11.3, 14.8, 1.4, 3.2), "p")]),
    "hud_unlock": I(GREEN, [(U(True), "g"), (rrect(6.2, 10.4, 11.6, 9.4, 1.4), "g"), (circ(12, 14.4, 1.6), "p"), (rect(11.3, 14.8, 1.4, 3.2), "p")]),
    "hud_link": I(BLUE, [(capsule(8.6, 15.4, 12.4, 11.6, 2.6), "g"), (capsule(11.6, 12.4, 15.4, 8.6, 2.6), "g")]),
    "hud_party": I(PINK, [(poly([(4.8, 19.6), (9.4, 8.6), (15.4, 14.6)]), "g"), (circ(14.6, 6.4, 1.3), "a"), (circ(18.4, 10.4, 1.2), "g"), (circ(17.4, 5.2, 0.9), "g"), (circ(19, 14, 1), "a")], accent=YELLOW),
    "hud_pause": I(NAVY, [(rect(7, 5.4, 3.8, 13.2), "g"), (rect(13.2, 5.4, 3.8, 13.2), "g")]),
    "hud_left": I(NAVY, [(poly([(15.6, 4.6), (6.4, 12), (15.6, 19.4)]), "g")]),
    "hud_right": I(NAVY, [(poly([(8.4, 4.6), (17.6, 12), (8.4, 19.4)]), "g")]),
    "hud_star": I(BRASS, [(star(12, 12, 8.4, 3.8, 5), "g")]),
    "tb_lang": I(BLUE, [(circ(12, 12, 8), "g"), (rect(11.2, 4, 1.6, 16, ), "p"), (rect(4, 11.2, 16, 1.6), "p"), (rect(5.4, 7.2, 13.2, 1.3), "p"), (rect(5.4, 15.5, 13.2, 1.3), "p")]),
    "tb_ctl": I(STEEL, [(rrect(2.8, 6.6, 18.4, 11, 1.6), "g"), (rect(5, 9, 2.4, 2.2), "p"), (rect(8.8, 9, 2.4, 2.2), "p"), (rect(12.6, 9, 2.4, 2.2), "p"), (rect(16.4, 9, 2.4, 2.2), "p"), (rect(6.4, 13, 11.2, 2.2), "p")]),
    "tb_set": I(NAVY, [(star(12, 12, 8.8, 6.6, 8), "g"), (circ(12, 12, 3.2), "p")]),
    # chips (squad cards, power-ups)
    "chip_damage": I(RED, [(poly([(17.6, 3.6), (20.4, 6.4), (11, 15.8), (8.2, 13)]), "g"), (poly([(5.4, 11.8), (12.2, 18.6), (10.6, 20.2), (3.8, 13.4)]), "g")]),
    "chip_rate": I(YELLOW, [(poly([(4, 6), (10.6, 12), (4, 18), (4, 14.6), (7, 12), (4, 9.4)]), "d"), (poly([(11, 6), (17.6, 12), (11, 18), (11, 14.6), (14, 12), (11, 9.4)]), "d")]),
    "chip_pierce": I(PURPLE, [(poly([(3.6, 10.4), (14.2, 10.4), (14.2, 6.6), (20.6, 12), (14.2, 17.4), (14.2, 13.6), (3.6, 13.6)]), "g")]),
    "chip_crit": I(ORANGE, [(star(12, 12, 8.6, 3.2, 4), "g"), (star(12, 12, 4.6, 2, 4, -45), "a")], accent=YELLOW),
    "chip_blast": I(ORANGE, [(star(12, 12, 9, 5.2, 12), "g"), (star(12, 12, 5.2, 2.8, 8), "a")], accent=YELLOW),
    "chip_speed": I(TEAL, [(poly([(7.6, 5), (15.6, 12), (7.6, 19), (7.6, 15.6), (11, 12), (7.6, 8.4)]), "g"), (rect(3.4, 9, 3, 1.5), "g"), (rect(3.4, 13.5, 3, 1.5), "g")]),
    "chip_hp": I(PINK, [(HEART, "g")]),
    "chip_armor": I(STEEL, [(SHIELD, "g"), (SHIELD_IN, "a")], accent=BLUE),
    "chip_magnet": I(RED, [(MAGNET, "g"), (rect(6, 5, 4, 3), "a"), (rect(14, 5, 4, 3), "a")], accent=STEEL),
    "chip_luck": I(GREEN, [(CLOVER, "g"), (rect(11.2, 14, 1.6, 6.6), "g")]),
    "chip_scholar": I(BLUE, [(BOOK, "g"), (rect(11.4, 6.8, 1.2, 11.4), "a")], accent=YELLOW),
    "chip_medic": I(GREEN, [(rect(10, 5, 4, 14), "g"), (rect(5, 10, 14, 4), "g")], glyph=WHITE),
    "chip_quick": I(BLUE, [(circ(12, 12, 7), "g"), (circ(12, 12, 4.4), "p"), (rect(12, 5.2, 6.6, 6.8), "p"), (poly([(11.2, 3.6), (18, 8.6), (11.2, 13.4)]), "g")]),
    "chip_roll": I(TEAL, [(circ(12, 12, 7), "g"), (circ(12, 12, 4.4), "p"), (rect(5.4, 12, 6.6, 6.8), "p"), (poly([(12.8, 20.4), (6, 15.4), (12.8, 10.6)]), "g")]),
    "chip_vampire": I("#7a1c2e", [(poly([(7.6, 5.4), (16.4, 5.4), (14.4, 12.4), (12, 19.2), (9.6, 12.4)]), "g")]),
    "chip_haste": I(YELLOW, [(BOLT, "d")]),
    "chip_quad": I(PURPLE, [(star(12, 12, 8.6, 3.4, 4), "a"), (circ(12, 12, 2.4), "g")], accent=YELLOW),
    # game over statistics
    "go_reached": I(BLUE, [(poly([(4.6, 19), (4.6, 11), (12, 4.6), (19.4, 11), (19.4, 19), (14.6, 19), (14.6, 14), (9.4, 14), (9.4, 19)]), "g")]),
    "go_kills": I(DARK, [(SKULL_TOP, "g"), (rect(8.8, 14.6, 6.4, 4.6), "g"), (circ(9.2, 11.2, 1.9), "p"), (circ(14.8, 11.2, 1.9), "p")]),
    "go_time": I(BLUE, [(circ(12, 12, 8), "g"), (rect(11.2, 6.4, 1.6, 6.4), "p"), (rect(11.2, 11.2, 5, 1.6), "p")]),
    "go_damage": I(RED, [(star(12, 12, 8.4, 4.4, 8), "g"), (star(12, 12, 4.4, 2.2, 6), "a")], accent=YELLOW),
    "go_taken": I(STEEL, [(SHIELD, "g"), (poly([(11, 7), (13, 7), (12.6, 13), (11.4, 13)]), "p"), (circ(12, 15.2, 1.1), "p")]),
    "go_healed": I(PINK, [(HEART, "g"), (rect(11, 8.6, 2, 6.4), "p"), (rect(8.8, 10.8, 6.4, 2), "p")]),
    "go_maxhit": I(YELLOW, [(BOLT, "d")]),
    "go_crits": I(ORANGE, [(star(12, 12, 8.6, 3.2, 4), "g"), (star(12, 12, 4.6, 2, 4, -45), "a")], accent=YELLOW),
    "go_shots": I(BRASS, [(BULLET, "g"), (rect(8.6, 16.4, 6.8, 2.6), "a")], accent=STEEL),
    "go_hits": I(TEAL, [(circ(12, 12, 7.2), "g"), (circ(12, 12, 5), "p"), (circ(12, 12, 2.2), "g"), (rect(11.2, 2.8, 1.6, 5), "g"), (rect(11.2, 16.2, 1.6, 5), "g"), (rect(2.8, 11.2, 5, 1.6), "g"), (rect(16.2, 11.2, 5, 1.6), "g")]),
    "go_swings": I(STEEL, [(SWORD, "g"), (SWORD_G, "a"), (SWORD_H, "d")], accent=BRASS),
    "go_grenades": I(OLIVE, [(circ(11.6, 14, 6), "g"), (rect(10, 5.2, 3.2, 3.6), "a"), (poly([(13, 5.8), (17.6, 4.4), (17.6, 6.4), (13, 7.6)]), "g")], accent=STEEL),
    "go_barrels": I(RED, [(rrect(6.6, 4.8, 10.8, 14.4, 2.2), "g"), (rect(6.6, 8, 10.8, 1.5), "d"), (rect(6.6, 14.6, 10.8, 1.5), "d")]),
    "go_revives": I(GREEN, [(rect(10, 5, 4, 14), "g"), (rect(5, 10, 14, 4), "g")], glyph=WHITE),
    "go_pickups": I(BRASS, [(poly([(6.8, 9), (17.2, 9), (18.8, 19.8), (5.2, 19.8)]), "g"), (rect(9.4, 5.2, 5.2, 3.8), "g"), (rect(10.4, 11.4, 3.2, 2.2), "p")]),
    "go_dashes": I(BLUE, [(poly([(4, 6), (10.6, 12), (4, 18), (4, 14.6), (7, 12), (4, 9.4)]), "g"), (poly([(11, 6), (17.6, 12), (11, 18), (11, 14.6), (14, 12), (11, 9.4)]), "g")]),
    "go_abilities": I(PURPLE, [(star(12, 12, 8.4, 3.8, 5), "a")], accent=YELLOW),
    "go_distance": I(ORANGE, [(BOOT, "g"), (rect(5.5, 17.6, 14.4, 2.2), "d")]),
    "go_boss": I(RED, [(CROWN, "a"), (rect(4.5, 17.6, 15, 2.6), "a")], accent=YELLOW),
    "go_downs": I(NAVY, [(poly([(10, 4.6), (14, 4.6), (14, 11.4), (18.2, 11.4), (12, 19.4), (5.8, 11.4), (10, 11.4)]), "g")]),
    "go_dps": I(RED, [(rect(5, 13, 3.4, 6.4), "g"), (rect(10.3, 8.6, 3.4, 10.8), "g"), (rect(15.6, 4.6, 3.4, 14.8), "g")]),
    "go_kpm": I(TEAL, [(circ(12, 13.2, 6.8), "g"), (rect(10.4, 3.8, 3.2, 2.4), "g"), (rect(11.2, 8.4, 1.6, 5.2), "p"), (rect(11.2, 12, 4, 1.6), "p")]),
    "go_clicks": I(STEEL, [(rrect(7, 4.4, 10, 15.6, 5), "g"), (rect(7, 10.4, 10, 1.3), "p"), (rect(11.4, 4.4, 1.2, 6), "p")]),
    "go_keys": I(NAVY, [(rrect(2.8, 6.6, 18.4, 11, 1.6), "g"), (rect(5, 9, 2.4, 2.2), "p"), (rect(8.8, 9, 2.4, 2.2), "p"), (rect(12.6, 9, 2.4, 2.2), "p"), (rect(16.4, 9, 2.4, 2.2), "p"), (rect(6.4, 13, 11.2, 2.2), "p")]),
    "go_combo": I(ORANGE, [(FLAME, "g"), (FLAME_IN, "a")], accent=YELLOW),
    # difficulty (one skull each, drawn 1-3 times by the menu)
    "diff_skull": I(DARK, [(SKULL_TOP, "g"), (rect(8.8, 14.6, 6.4, 4.6), "g"), (circ(9.2, 11.2, 1.9), "p"), (circ(14.8, 11.2, 1.9), "p"), (rect(10.6, 15.4, 0.9, 2.6), "p"), (rect(12.5, 15.4, 0.9, 2.6), "p")]),
    "app": I(BLUE, [(SKULL_TOP, "g"), (rect(8.4, 14.6, 7.2, 5), "g"), (circ(9, 11.4, 2.2), "p"), (circ(15, 11.4, 2.2), "p")]),
}


def resolve(spec):
    cols = {"g": spec["glyph"], "p": spec["plate"], "a": spec["accent"], "d": DARK, "w": WHITE}
    layers = [(kit_circle(12, 12, 11.4), shade(spec["plate"], 0.62)), (kit_circle(12, 12, 10.2), spec["plate"])]
    for d, tok in spec["layers"]:
        layers.append((d, cols[tok]))
    return layers


def kit_circle(cx, cy, r):
    return circ(cx, cy, r)


def shade(h, k):
    h = h.lstrip("#")
    c = [int(int(h[i:i + 2], 16) * k) for i in (0, 2, 4)]
    return "#%02x%02x%02x" % tuple(c)


def has_content(path):
    img = bpy.data.images.load(path)
    px = list(img.pixels)
    n = sum(1 for i in range(3, len(px), 4) if px[i] > 0.5)
    bpy.data.images.remove(img)
    return n / (len(px) / 4)


def main():
    kit.setup_scene()
    os.makedirs(OUT_DIR, exist_ok=True)
    names = [n for n in ICONS if not ONLY or n in ONLY]
    bad = []
    for n in names:
        objs = kit.build(resolve(ICONS[n]))
        out = os.path.join(OUT_DIR, n + kit.EXT)
        kit.place_and_render(objs, out)
        cover = has_content(out)
        if cover < 0.25:
            bad.append((n, cover))
        print("icon", n, "coverage %.2f" % cover)
    if SHEET:
        write_sheet(names)
    if bad:
        raise SystemExit("empty icons: %s" % bad)


def write_sheet(names):
    cols = 10
    rows = (len(names) + cols - 1) // cols
    S = kit.SIZE
    img = bpy.data.images.new("sheet", cols * S, rows * S, alpha=True)
    buf = [0.0] * (cols * S * rows * S * 4)
    for k in range(len(buf) // 4):
        buf[k * 4:k * 4 + 4] = [0.93, 0.9, 0.84, 1.0]
    for i, n in enumerate(names):
        im = bpy.data.images.load(os.path.join(OUT_DIR, n + kit.EXT))
        px = list(im.pixels)
        cx, cy = (i % cols) * S, (rows - 1 - i // cols) * S
        for y in range(S):
            for x in range(S):
                s = (y * S + x) * 4
                a = px[s + 3]
                d = ((cy + y) * cols * S + cx + x) * 4
                for c in range(3):
                    buf[d + c] = buf[d + c] * (1 - a) + px[s + c] * a
        bpy.data.images.remove(im)
    img.pixels[:] = buf
    img.filepath_raw = SHEET
    img.file_format = "PNG"
    img.save()


main()
