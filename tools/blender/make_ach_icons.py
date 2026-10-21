"""Render the achievement badges: one 128 px toy badge per achievement id, transparent, in the look of make_icons.py.

  blender -b --factory-startup --python tools/blender/make_ach_icons.py
  ONLY=kills_1,locked blender -b --factory-startup --python tools/blender/make_ach_icons.py
  OUT_DIR=some/dir   default packages/client/public/ach
  SHEET=contact.png  also write a contact sheet (SHEET_PX=56 shrinks every icon, to judge them at HUD size)

A badge is a rim whose shape and metal depend on the tier (0 bronze: plain disc, 1 silver: disc with a bead ring, 2 gold: scalloped,
3 platinum: spiked, icy, with a gem) around a coloured field that holds the motif of the achievement `group`. The motifs are
built from polygons in a 24x24 box (helpers below); table: tools/cards/achievements.py (ids, groups, tiers).
Also renders `locked` (the mystery badge of an unearned hidden achievement) and ../ui/ach_menu (the trophy of the menu button, 64 px).
"""
import bpy, os, sys, math, importlib.util
from math import cos, sin, pi

HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/make_ach_icons.py")))
sys.path.insert(0, HERE)
import icon_kit as kit  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.environ.get("OUT_DIR") or os.path.join(REPO, "packages", "client", "public", "ach")
UI_DIR = os.path.join(REPO, "packages", "client", "public", "ui")
ONLY = [x for x in os.environ.get("ONLY", "").split(",") if x] or None
SHEET = os.environ.get("SHEET")
SHEET_PX = int(os.environ.get("SHEET_PX", "0"))

_spec = importlib.util.spec_from_file_location("ach_table", os.path.join(REPO, "tools", "cards", "achievements.py"))
_tab = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_tab)

W, D, WHITE = "#fff6e6", "#3a352d", "#ffffff"
BLUE, RED, ORANGE, YELLOW, GREEN, STEEL, PURPLE, PINK, BRASS, NAVY, OLIVE, TEAL = (
    "#2f8fe8", "#d8362e", "#ff8a2a", "#ffd23a", "#47b86a", "#8e9aaf", "#9a63ff", "#ff6b9a", "#d9a441", "#2b3a52", "#6e7a45", "#2bb3b1",
)
BROWN, LBLUE, GREY, DRED, GOLD = "#8a5a2b", "#bfe6ff", "#c9d1dc", "#9c2620", "#ffc83a"

# tier -> (rim, rim shade, field edge)
TIERS = [
    ("#b5622a", "#3f1d08", "#5a2a0c"),
    ("#d5dce6", "#6f7a8a", "#6f7a8a"),
    ("#ffe45c", "#a8730c", "#d9a21a"),
    ("#e6f7ff", "#3f7fb0", "#3f7fb0"),
]


# ---- geometry (polygons are lists of (x, y) in the 24x24 box, y down) ----
def C(cx, cy, r, n=24):
    return [(cx + r * cos(2 * pi * i / n), cy + r * sin(2 * pi * i / n)) for i in range(n)]


def E(cx, cy, rx, ry, deg=0, n=24):
    return ROT([(cx + rx * cos(2 * pi * i / n), cy + ry * sin(2 * pi * i / n)) for i in range(n)], cx, cy, deg)


def R(x, y, w, h):
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


def RR(x, y, w, h, r):
    pts = []
    for cx, cy, a0 in ((x + w - r, y + r, -90), (x + w - r, y + h - r, 0), (x + r, y + h - r, 90), (x + r, y + r, 180)):
        for k in range(5):
            a = math.radians(a0 + k * 22.5)
            pts.append((cx + r * cos(a), cy + r * sin(a)))
    return pts


def ST(cx, cy, Ro, ri, n, rot=-90):
    return [(cx + (Ro if i % 2 == 0 else ri) * cos(math.radians(rot + i * 180 / n)), cy + (Ro if i % 2 == 0 else ri) * sin(math.radians(rot + i * 180 / n))) for i in range(2 * n)]


def CAP(x1, y1, x2, y2, r):
    a = math.atan2(y2 - y1, x2 - x1)
    pts = [(x2 + r * cos(a - pi / 2 + k * pi / 6), y2 + r * sin(a - pi / 2 + k * pi / 6)) for k in range(7)]
    pts += [(x1 + r * cos(a + pi / 2 + k * pi / 6), y1 + r * sin(a + pi / 2 + k * pi / 6)) for k in range(7)]
    return pts


def ROT(pts, cx, cy, deg):
    a = math.radians(deg)
    return [(cx + (x - cx) * cos(a) - (y - cy) * sin(a), cy + (x - cx) * sin(a) + (y - cy) * cos(a)) for x, y in pts]


def MV(pts, dx, dy):
    return [(x + dx, y + dy) for x, y in pts]


def SC(pts, k, cx=12, cy=12):
    return [(cx + (x - cx) * k, cy + (y - cy) * k) for x, y in pts]


def BZ(p0, p1, p2, n=8):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in [i / n for i in range(n + 1)]]


def ARC(cx, cy, r, a0, a1, w, n=14):
    o = [(cx + (r + w / 2) * cos(math.radians(a0 + (a1 - a0) * i / n)), cy + (r + w / 2) * sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
    i_ = [(cx + (r - w / 2) * cos(math.radians(a0 + (a1 - a0) * i / n)), cy + (r - w / 2) * sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
    return o + i_[::-1]


def HEARTP(cx=12, cy=12, s=0.62):
    return [(cx + s * 16 * sin(t) ** 3 / 1.0 * 0.5, cy - s * (13 * cos(t) - 5 * cos(2 * t) - 2 * cos(3 * t) - cos(4 * t)) * 0.5) for t in [2 * pi * i / 40 for i in range(40)]]


SHIELDP = [(12, 4)] + [(18.8, 6.4), (18.8, 11)] + BZ((18.8, 11), (18.2, 17), (12, 20.4))[1:] + BZ((12, 20.4), (5.8, 17), (5.2, 11))[1:] + [(5.2, 6.4)]


def X(layers, k=1.0, dx=0, dy=0, deg=0):
    """Transform a motif (list of (polys, colour)) about the centre."""
    out = []
    for polys, col in layers:
        ps = [polys] if isinstance(polys[0][0], (int, float)) else polys
        ps = [MV(SC(ROT(p, 12, 12, deg), k), dx, dy) for p in ps]
        out.append((ps, col))
    return out


def L(col, *polys):
    return (list(polys), col)


# ---- motifs: lists of (polys, colour); colours are hex ----
def skull(col=W, eye=D):
    return [
        L(col, MV(C(0, 0, 7), 12, 10.4), MV(RR(0, 0, 7.6, 6, 1.4), 8.2, 14)),
        L(eye, C(9.2, 10.8, 2.0), C(14.8, 10.8, 2.0)),
        L(eye, [(12, 12.8), (10.9, 15), (13.1, 15)], R(10.2, 16.4, 0.9, 2.8), R(12.9, 16.4, 0.9, 2.8)),
    ]


def wing(side, col, cx, cy, k=1.0):
    # a feathered wing pointing up and outwards, side=-1 left, +1 right
    feathers = []
    for i, (ang, ln) in enumerate(((-75, 9), (-50, 10), (-28, 9.5), (-8, 8))):
        a = math.radians(ang)
        tipx, tipy = cx + side * ln * k * cos(a) * 1.0, cy + ln * k * sin(a)
        feathers.append(CAP(cx, cy + i * 0.8 * k, tipx, tipy, 1.6 * k))
    return L(col, *feathers)


def m_kills():
    return [L(W, MV(C(0, 0, 7.2), 12, 10.2), MV(RR(0, 0, 8, 6.4, 1.6), 8, 13.6))] + [L(D, C(9, 10.4, 2.2), C(15, 10.4, 2.2), [(12, 12.6), (10.8, 15), (13.2, 15)], R(10.2, 16.2, 0.9, 3), R(12.9, 16.2, 0.9, 3))]


def m_damage():
    return [L(RED, ST(12, 12, 10.5, 5.2, 9)), L(ORANGE, ST(12, 12, 8, 4, 9, -70)), L(YELLOW, ST(12, 12, 5, 2.6, 8)), L(WHITE, C(12, 12, 2.2))]


def m_bosses():
    return [
        L(YELLOW, [(6, 5.4), (8, 8.6), (10, 4.8), (12, 8.6), (14, 4.8), (16, 8.6), (18, 5.4), (17.6, 10), (6.4, 10)]),
        L(GREEN, MV(RR(0, 0, 13, 11, 4), 5.5, 9)),
        L("#2a6f3a", [(5, 10.4), (3, 7), (7.4, 9.6)], [(19, 10.4), (21, 7), (16.6, 9.6)]),
        L(YELLOW, [(7.2, 13.2), (11, 14.6), (7.8, 16)], [(16.8, 13.2), (13, 14.6), (16.2, 16)]),
        L(RED, C(9, 14.6, 0.9), C(15, 14.6, 0.9)),
        L(WHITE, [(8, 18.6), (9.4, 18.6), (8.7, 21)], [(14.6, 18.6), (16, 18.6), (15.3, 21)]),
    ]


def m_floor():
    return [
        L("#7d879a", R(7, 9, 10, 12)),
        L("#7d879a", R(6, 6, 2.4, 3.4), R(10.8, 6, 2.4, 3.4), R(15.6, 6, 2.4, 3.4)),
        L(W, R(8, 11, 8, 10)),
        L("#2b3a52", *[R(8, 11 + i * 2.5, 8, 0.4) for i in range(1, 4)]),
        L(D, [(10.6, 21), (10.6, 16.6)] + BZ((10.6, 16.6), (12, 14.4), (13.4, 16.6))[1:] + [(13.4, 21)]),
        L(RED, [(12, 1.6), (18, 3.6), (12, 5.6)], R(11.4, 1.6, 1, 5)),
    ]


def m_runkills():
    s1 = X(skull(WHITE and "#e3d3b4"), 0.5, -4.5, 4)
    s2 = X(skull("#e3d3b4"), 0.5, 4.5, 4)
    s3 = X(skull(W), 0.62, 0, -2.4)
    return s1 + s2 + s3


def m_maxhit():
    ham = [L(D, ROT(R(11, 9, 2, 12), 12, 15, 35)), L(STEEL, ROT(RR(6.5, 3.6, 11, 6, 1), 12, 6.6, 35))]
    return [L(YELLOW, ST(12, 12, 10.6, 5.6, 10)), L(ORANGE, ST(12, 12, 8, 4.4, 10, -72))] + X(ham, 0.9, 0.4, 0.4)


def m_crits():
    return [L(RED, C(12, 12, 9.6)), L(WHITE, C(12, 12, 7.2)), L(RED, C(12, 12, 4.8)), L(WHITE, C(12, 12, 2.6)),
            L(D, R(11.4, 1.6, 1.2, 4.4), R(11.4, 18, 1.2, 4.4), R(1.6, 11.4, 4.4, 1.2), R(18, 11.4, 4.4, 1.2)),
            L(YELLOW, ST(17.4, 6.4, 5.2, 2.0, 4, -90))]


def m_shots():
    def bullet(x, tone):
        return [L(BRASS, R(x, 10, 4.4, 10)), L(tone, [(x, 10), (x + 2.2, 3.2), (x + 4.4, 10)]), L(D, R(x, 17.2, 4.4, 1)), L("#a87a2a", R(x - 0.4, 20, 5.2, 1.4))]
    return bullet(3.2, "#ff9a3a") + bullet(9.8, "#ff9a3a") + bullet(16.4, "#ff9a3a")


def m_revives():
    hand = [L(PINK and "#f2c8a0", RR(6, 17, 12, 4, 1.6)), L("#f2c8a0", *[CAP(7.6 + i * 2.9, 17.2, 7.6 + i * 2.9, 15.4, 1.2) for i in range(4)])]
    return [L(PINK, SC(HEARTP(12, 9, 0.62), 1.35, 12, 9)), L(WHITE, R(11, 4.8, 2, 7.6), R(8.2, 7.6, 7.6, 2))] + hand


def foot(x, y, deg):
    return [L(W, E(x, y + 1.2, 2.5, 3.6, deg), *[E(x - 1.7 + i * 1.15, y - 3, 0.62, 0.8, deg) for i in range(4)])] if False else [
        L(W, ROT(E(x, y + 1.4, 2.4, 3.4), x, y, deg)),
        L(W, *[ROT(E(x - 1.8 + i * 1.2, y - 3.2 - (0.5 if i in (1, 2) else 0), 0.62, 0.85), x, y, deg) for i in range(4)]),
    ]


def m_distance():
    return foot(8.4, 15.6, -10) + foot(15.6, 8.4, 12)


def m_dashes():
    return [L(WHITE, R(2, 8, 7, 1.4), R(1, 11.4, 9, 1.4), R(2, 14.8, 7, 1.4)),
            L(YELLOW, [(10, 4.6), (20.4, 12), (10, 19.4), (10, 14.8), (14.6, 12), (10, 9.2)]),
            L(WHITE, [(14.4, 6.8), (21.6, 12), (14.4, 17.2), (14.4, 14.6), (17.8, 12), (14.4, 9.4)])][:2] + [L("#7a4f00", [(13.6, 8.8), (17, 12), (13.6, 15.2), (13.6, 13.4), (14.8, 12), (13.6, 10.6)])]


def m_abilities():
    return [L("#ffec9a", C(12, 12, 10)), L(YELLOW, ST(12, 12, 9.2, 4, 5)), L(WHITE, ST(12, 12, 5.2, 2.2, 5)), L(WHITE, ST(19.4, 4.6, 2.6, 0.7, 4, -90))]


def m_grenades():
    return [L(OLIVE, C(12, 14, 7.4)), L("#55602f", R(5, 13, 14, 1.2), R(5, 16.2, 14, 1.2)), L(STEEL, RR(9.6, 4.6, 4.8, 3.8, 0.8)), L(STEEL, [(13.4, 5.4), (19, 3.4), (19.6, 5.4), (14, 7.6)]),
            L(YELLOW, ARC(17.6, 8.6, 2.6, 0, 360, 1.1, 18)), L(WHITE, C(9, 11.6, 1.4))]


def m_barrels():
    return [L(RED, RR(5.4, 7, 13.2, 14, 3)), L(DRED, R(5.4, 9.6, 13.2, 1.6), R(5.4, 16.6, 13.2, 1.6)), L(YELLOW, [(12, 11.6), (14, 14.6), (12.6, 14.6), (13.4, 17.4), (10.2, 14), (11.6, 14)]),
            L(ORANGE, [(12, 0.8), (14.8, 4), (13.6, 6.4), (10.4, 6.4), (9.4, 3.4)]), L(YELLOW, [(12, 3.2), (13.2, 5), (10.8, 5)])]


def m_pickups():
    return [L(BROWN, RR(3.4, 7.4, 17.2, 13.4, 1.2)), L("#5e3b17", R(3.4, 7.4, 17.2, 2.2)), L("#b07a3d", R(3.4, 12, 17.2, 0.8), R(3.4, 16.4, 17.2, 0.8)),
            L("#5e3b17", CAP(5, 10, 19, 19.6, 0.7), CAP(19, 10, 5, 19.6, 0.7)), L(YELLOW, ST(18.6, 4.8, 3.6, 1.2, 4, -90))]


def m_healed():
    return [L(W, CAP(9.8, 5.8, 14.2, 5.8, 1.4)), L("#cfd6df", R(9, 5, 1.4, 3.4), R(13.6, 5, 1.4, 3.4)), L(WHITE, RR(3.8, 8, 16.4, 12.6, 2.4)), L(RED, R(10.6, 10.4, 2.8, 7.8), R(8.1, 12.9, 7.8, 2.8))]


def m_taken():
    return [L(STEEL, SHIELDP), L("#6f7a8a", C(8.6, 9, 1.6), C(15.2, 13.6, 1.8), C(10.4, 16, 1.2)),
            L(D, [(12.6, 4.8), (11, 8.2), (13, 9.6), (11.4, 13.2), (12.4, 13.4), (14, 9.4), (12, 8.2), (13.6, 5)])]


def m_games():
    return [L("#4a5568", RR(2.2, 7, 19.6, 11, 4.5), C(5.8, 17, 2.8), C(18.2, 17, 2.8)), L(WHITE, RR(3.2, 8, 17.6, 9.4, 4)),
            L(D, R(6.4, 11.4, 5, 1.8), R(8, 9.8, 1.8, 5)), L(RED, C(16.2, 14, 1.2)), L(BLUE, C(18.8, 11.6, 1.2)), L(GREEN, C(16.2, 9.6, 1.2)), L(YELLOW, C(13.8, 11.8, 1.2))]


def m_time():
    return [L(BROWN, R(4.4, 3.2, 15.2, 2.2), R(4.4, 18.6, 15.2, 2.2)), L(LBLUE, [(6.2, 5.4), (17.8, 5.4), (12.8, 12), (17.8, 18.6), (6.2, 18.6), (11.2, 12)]),
            L(YELLOW, [(8, 6), (16, 6), (12, 10.6)], [(12, 14.4), (16.4, 18.2), (7.6, 18.2)])]


def m_levels():
    def chev(y, col):
        return L(col, [(12, y), (20.4, y + 6.4), (20.4, y + 10), (12, y + 3.6), (3.6, y + 10), (3.6, y + 6.4)])
    return [chev(10.6, "#2e8a4d"), chev(6.6, GREEN), chev(2.6, "#9dec7a")]


def card(x, y, deg, col, sym):
    return [L("#bdb59f", ROT(RR(x - 4.2, y - 6, 8.4, 12, 1.2), x, y, deg)), L(WHITE, ROT(RR(x - 3.7, y - 5.5, 7.4, 11, 0.9), x, y, deg))] + sym(x, y, deg, col)


def pip_heart(x, y, deg, col):
    return [L(col, ROT(MV(SC(HEARTP(12, 12, 0.62), 0.7), x - 12, y - 12 + 0.4), x, y, deg))]


def pip_spade(x, y, deg, col):
    return [L(col, ROT(MV(SC([(12 + (px - 12), 24 - py) for px, py in HEARTP(12, 12, 0.62)], 0.55, 12, 12), x - 12, y - 12 - 0.4), x, y, deg), ROT(MV([(11, 15), (13, 15), (13.8, 18), (10.2, 18)], x - 12, y - 12 - 1.4), x, y, deg))]


def m_cards():
    return card(8.6, 12.6, -16, D, pip_spade) + card(15, 11.6, 14, RED, pip_heart)


def m_mods():
    return [L(RED, [(12, 1.6), (16.8, 7.4), (19.4, 12.4), (19.4, 15.4)] + BZ((19.4, 15.4), (18.6, 21.4), (12, 21.6))[1:] + BZ((12, 21.6), (5.4, 21.4), (4.6, 15.4))[1:] + [(4.6, 12.4), (7.6, 9), (8.6, 11.4), (10, 8), (10.8, 4.6)]),
            L(ORANGE, [(12, 8.6), (15.6, 13), (16.2, 16)] + BZ((16.2, 16), (15.4, 20), (12, 20.2))[1:] + BZ((12, 20.2), (8.6, 20), (7.8, 16))[1:] + [(8.6, 12.6), (10.6, 11.6)])] + X(skull(W, RED), 0.42, 0, 5.2)


def m_score():
    return [L(BRASS, R(8, 18.4, 8, 2.8)), L(YELLOW, R(10.6, 14.4, 2.8, 4.2)),
            L(YELLOW, [(6.6, 3.4), (17.4, 3.4), (16.6, 10)] + BZ((16.6, 10), (15.6, 14.6), (12, 14.8))[1:] + BZ((12, 14.8), (8.4, 14.6), (7.4, 10))[1:]),
            L(YELLOW, ARC(6.4, 7.2, 2.6, 80, 280, 1.5, 10), ARC(17.6, 7.2, 2.6, -100, 100, 1.5, 10)), L(WHITE, ST(12, 8.4, 3, 1.3, 5)), L("#ffffff", R(8.2, 4.6, 1.2, 5))]


# weapons (drawn horizontally in the box, width about 20)
def m_wk_sniper():
    return [L(D, R(2, 11.4, 6, 3.6), [(1.6, 11.2), (6, 11.2), (6, 16.4), (3.4, 16.4)]), L(STEEL, R(6, 11.8, 4.4, 2.8), R(10, 12.2, 12, 1.8)), L("#6f7a8a", R(19.6, 11.6, 2.4, 2.6)),
            L("#5b6475", RR(8.4, 8.2, 7.4, 3, 1.2)), L(TEAL, C(8.2, 9.7, 1.5), C(15.8, 9.7, 1.5)), L(D, R(10.4, 14.4, 2, 3.6), [(15, 14), (17.6, 14), (19.6, 19.4), (18, 19.4)])]


def m_wk_shotgun():
    return [L(BROWN, [(1.6, 10), (8, 11.6), (8, 14.6), (3.4, 17.4), (1.6, 15)]), L(STEEL, R(8, 11.2, 13.6, 1.8), R(8, 13.2, 13.6, 1.8)), L("#6f7a8a", R(21, 11.2, 1.4, 3.8)),
            L(BROWN, RR(11.6, 14.6, 6, 2.6, 1.1)), L("#6f7a8a", R(7.4, 10.8, 3, 4.6))]


def m_wk_minigun():
    return [L(D, RR(2, 9, 6, 7, 1.6)), L(STEEL, C(9.6, 12.5, 3.2)), L(STEEL, R(9.6, 9.6, 12, 1.5), R(9.6, 11.8, 12, 1.5), R(9.6, 14, 12, 1.5)), L("#6f7a8a", R(13.6, 9, 1.6, 7), R(19, 9, 1.6, 7)),
            L(ORANGE, C(9.6, 12.5, 1.3)), L(D, [(3.4, 16), (7, 16), (6, 20), (3, 20)])]


def m_wk_flamer():
    return [L(RED, RR(2, 8.6, 10, 8, 3)), L(DRED, R(5.6, 8.6, 1.4, 8)), L(STEEL, R(11.6, 11, 6, 3), R(16.4, 10.2, 2.4, 4.6)),
            L(ORANGE, [(18.8, 12.6), (21, 8.4), (22, 11), (23.2, 7.6), (24, 12.6), (23, 17.2), (21, 14.6), (20.2, 17)]), L(YELLOW, [(19.6, 12.6), (21.6, 10.6), (22.4, 12.6), (21.2, 15)]),
            L(D, [(5, 16.6), (8.6, 16.6), (7.6, 20.4), (4.6, 20.4)])]


def m_wk_gl():
    return [L(D, [(1.6, 9.6), (7, 11), (7, 14), (3.2, 16.4)]), L(OLIVE, RR(6.4, 9.4, 11, 6, 2)), L(STEEL, RR(16.6, 9.8, 5.4, 5.2, 1)), L(BRASS, C(11.6, 12.4, 3.4)), L("#a87a2a", C(11.6, 12.4, 1.6)),
            L(D, R(8.4, 15.4, 2.4, 3.8)), L(RED, C(21.6, 12.4, 1.1))]


def m_wk_railgun():
    return [L(D, [(1.6, 10), (6, 10.6), (6, 14.4), (2.4, 15.8)]), L(STEEL, RR(5.6, 9.6, 12, 2.6, 1), RR(5.6, 12.8, 12, 2.6, 1)), L(TEAL, R(6, 12.2, 11.6, 0.8)),
            L("#6f7a8a", R(8.4, 8.8, 1.6, 7.4), R(12.4, 8.8, 1.6, 7.4), R(16.4, 8.8, 1.6, 7.4)), L(STEEL, R(17.6, 10.2, 4.6, 4.6)), L(TEAL, C(22, 12.5, 1.2)), L(D, R(7, 16, 2.4, 3.8))]


def m_wk_sword():
    return [L(STEEL, [(18.6, 2.8), (21.2, 5.4), (10.6, 16), (8, 13.4)]), L(WHITE, [(18.6, 2.8), (19.6, 3.8), (9.2, 14.4), (8.6, 13.8)]), L(BRASS, [(4.6, 12.4), (11.6, 19.4), (10, 21), (3, 14)]),
            L(BROWN, [(2.2, 21.8), (3.8, 17), (7, 20.4)]), L(BRASS, C(2.4, 21.6, 1.5))]


def hammer(col_head="#9aa6ba"):
    return [L(BROWN, ROT(R(11, 8, 2.4, 14), 12.2, 15, 38)), L(col_head, ROT(RR(5.4, 2.6, 13.4, 7, 1.6), 12.2, 6, 38)), L("#6f7a8a", ROT(R(5.4, 2.6, 2.4, 7), 12.2, 6, 38))]


def m_wk_hammer():
    return hammer()


def axe():
    return [L(BROWN, ROT(R(11, 4, 2.2, 17.4), 12, 12, 32)), L(STEEL, ROT([(13, 3.8), (21.4, 5.6), (21.4, 12.4), (13, 11.6), (14.8, 7.8)], 12, 12, 32)), L(WHITE, ROT([(14.4, 5.4), (19.8, 6.6), (19.8, 8)], 12, 12, 32))]


def m_class_soldier():
    return [L("#5b7a2d", BZ((4, 14), (4, 4.4), (12, 4.4), 8) + BZ((12, 4.4), (20, 4.4), (20, 14), 8)[1:]), L("#4a6624", RR(2.4, 13.4, 19.2, 3.2, 1.4)),
            L(YELLOW, ST(12, 9.6, 3.2, 1.4, 5)), L(D, R(4, 17, 16, 1.4))]


def m_class_medic():
    return [L(WHITE, C(12, 12, 9.4)), L(RED, R(9.6, 4.4, 4.8, 15.2), R(4.4, 9.6, 15.2, 4.8))]


def m_class_heavy():
    return [L("#5b6a82", SHIELDP), L("#7d8cA6", SC(SHIELDP, 0.78, 12, 12.2)), L("#5b6a82", R(11, 5.4, 2, 12)), L(D, C(8.4, 8.4, 0.9), C(15.6, 8.4, 0.9), C(8.6, 14, 0.9), C(15.4, 14, 0.9)),
            L(YELLOW, ST(12, 11, 2.8, 1.2, 5))]


def m_class_scout():
    return [L(BROWN, [(7, 6), (12.4, 6), (12.4, 12.6), (18.6, 15), (19.4, 19), (7, 19)]), L(D, R(6.6, 17.4, 12.8, 2.2)),
            L(WHITE, CAP(6, 9, 2.4, 5, 1.2), CAP(6.4, 11.6, 1.6, 9.6, 1.2), CAP(6.2, 14, 1.8, 14, 1.2))] + [L(WHITE, CAP(5.6, 8.4, 2.2, 5.2, 1.1), CAP(5.4, 11.2, 1.2, 9, 1.1))][:0]


def m_class_demolisher():
    return [L(D, C(11.6, 14, 7.4)), L("#5a5348", C(9.2, 11.6, 1.8)), L(STEEL, RR(9.2, 4.8, 4.8, 3.4, 0.8)), L(BROWN, BZ((13, 5), (15.4, 2.4), (18.4, 4.6), 5) + BZ((18.4, 4.6), (16, 3.8), (14, 6.4), 5)[::-1][:0] + [(18, 5.6), (14, 7)]),
            L(ORANGE, ST(19.2, 3.6, 3.2, 1.2, 5)), L(YELLOW, ST(19.2, 3.6, 1.8, 0.7, 5))]


def m_class_ranger():
    return [L(BROWN, ARC(14, 12, 8.4, 110, 250, 1.8, 12) if False else ARC(9, 12, 8.4, -70, 70, 1.8, 12)), L(W, R(8.4 + 1.8, 3.8, 0.7, 16.6) if False else CAP(13, 3.8, 13, 20.2, 0.3)),
            L(STEEL, CAP(3.6, 12, 19, 12, 0.6)), L(STEEL, [(22, 12), (18.6, 9.8), (18.6, 14.2)]), L(RED, [(3, 12), (6, 9.6), (6.6, 10.4), (4.8, 12), (6.6, 13.6), (6, 14.4)])]


def m_class_berserker():
    return axe()


def m_class_swordsman():
    a = [L("#cdd5e1", [(18.6, 2.8), (21.2, 5.4), (10.6, 16), (8, 13.4)]), L(BRASS, [(4.6, 12.4), (11.6, 19.4), (10, 21), (3, 14)]), L(BROWN, [(2.2, 21.8), (3.8, 17), (7, 20.4)])]
    b = [(MVall(ps), col) for ps, col in a]
    return a + b


def MVall(ps):
    return [[(24 - x, y) for x, y in p] for p in ps]


def m_class_hammerer():
    return X(hammer(GOLD), 0.9, 0, 1.4) + [L(WHITE, ARC(12, 14, 9.6, 200, 250, 1.1, 6), ARC(12, 14, 9.6, 290, 340, 1.1, 6))]


# hidden
def m_hidden_untouchable():
    return [L("#8fd3ff", C(12, 12, 9.8)), L("#cdeeff", C(12, 12, 8.4)), L(WHITE, ARC(12, 12, 6.4, 190, 260, 1.8, 8)), L(WHITE, C(16.6, 16.4, 0.9)),
            L(YELLOW, ST(12, 12.6, 3.6, 1.5, 5)), L(WHITE, ST(18.6, 5.2, 1.8, 0.5, 4, -90))]


def m_hidden_speedrun_loss():
    return [L(STEEL, R(10.4, 1.6, 3.2, 3)), L(STEEL, CAP(18.6, 4.4, 20.2, 6, 0.9)), L(WHITE, C(12, 13.2, 8.8)), L(RED, ARC(12, 13.2, 7.4, -90, -30, 1.4, 6)), ] + X(skull(D, WHITE), 0.5, 0, 2.4)


def m_hidden_minimalist():
    return [L(STEEL, RR(2.6, 7.8, 16, 4.6, 1)), L("#6f7a8a", R(2.6, 7.8, 5, 2)), L(BROWN, [(11.2, 12.4), (17, 12.4), (15.2, 20), (10, 20)]), L(D, [(8.8, 12.4), (8.8, 15.6), (10.4, 15.6), (10.4, 12.4)]),
            L(YELLOW, ST(20, 5, 2.4, 1, 4, -90))]


def m_hidden_glass():
    return [L("#dff4ff", [(12, 2.6), (20, 7), (20, 17), (12, 21.4), (4, 17), (4, 7)]), L("#8fcdf0", [(12, 12), (20, 7), (20, 17), (12, 21.4)]), L("#b5e3fa", [(12, 12), (4, 7), (4, 17), (12, 21.4)]),
            L(WHITE, [(12, 2.6), (20, 7), (12, 12), (4, 7)]), L("#4a8ab5", [(12, 3), (11, 8), (13.4, 11), (10.6, 15.4), (12.4, 21)] + [(13.2, 21), (11.8, 15.6), (14.2, 11), (12, 7.8), (12.6, 3.4)])]


def m_hidden_masochist():
    return [L(STEEL, ARC(12, 12.4, 10, 0, 360, 2.0, 36)), L("#6f7a8a", *[R(11.2, 1.4 + 0.0, 1.6, 2.4)])][:1] + [L("#6f7a8a", *[CAP(12 + 10 * cos(math.radians(a)), 12.4 + 10 * sin(math.radians(a)), 12 + 10 * cos(math.radians(a + 8)), 12.4 + 10 * sin(math.radians(a + 8)), 0.01) for a in ()])][:0] + X(skull(W), 0.66, 0, 0.2)


def m_hidden_savior():
    lw = X([wing(-1, WHITE, 11.2, 14.4)], 1, 0, 0)
    rw = X([wing(1, WHITE, 12.8, 14.4)], 1, 0, 0)
    return lw + rw + [L(YELLOW, ARC(12, 4.6, 3.6, 0, 360, 1.5, 24)), L(PINK, HEARTP(12, 14.6, 0.5))]


def m_hidden_firebug():
    return [L(RED, [(12, 1.8), (16.2, 7), (19.4, 12.4), (19.4, 15.4)] + BZ((19.4, 15.4), (18.6, 21.4), (12, 21.6))[1:] + BZ((12, 21.6), (5.4, 21.4), (4.6, 15.4))[1:] + [(4.6, 12.4), (7.6, 8.6), (9, 11.2), (10.6, 7.4), (10.8, 4.4)]),
            L(ORANGE, [(12, 8), (15.6, 13), (16.2, 16)] + BZ((16.2, 16), (15.4, 20.4), (12, 20.4))[1:] + BZ((12, 20.4), (8.6, 20.4), (7.8, 16))[1:] + [(8.6, 12.6), (10.4, 11.8)]),
            L(YELLOW, [(12, 13), (14, 16.4), (13.6, 18.6), (12, 19.4), (10.4, 18.6), (10, 16.4)]), L(YELLOW, C(4.4, 6, 0.9), C(19.8, 7.6, 0.8), C(6, 2.6, 0.6))]


def m_hidden_marathon():
    return [L("#8fd3ff", R(5, 4, 14, 7)), L(YELLOW, C(16.4, 7, 2)), L("#4a8f4a", [(5, 11), (5, 9.6), (8, 8), (10.4, 9.6), (12.6, 8.4), (15, 11)]),
            L("#4a5568", [(10.6, 9.4), (13.4, 9.4), (21.8, 22), (2.2, 22)]), L(YELLOW, R(11.6, 10.6, 0.8, 1.8), R(11.4, 14.2, 1.2, 2.6), R(11.1, 18.6, 1.8, 3.2))]


def m_hidden_flawless():
    return [L(GOLD, [(3.6, 17.4), (4.8, 7), (9, 11.6), (12, 4.6), (15, 11.6), (19.2, 7), (20.4, 17.4)]), L("#c9921a", R(3.6, 17.4, 16.8, 2.8)), L(RED, C(12, 14.4, 1.4)), L(BLUE, C(7.4, 14.8, 1.0)), L(GREEN, C(16.6, 14.8, 1.0)),
            L(WHITE, ST(19.6, 4.4, 3.6, 0.9, 4, -90), ST(4, 3.4, 2.2, 0.6, 4, -90))]


def m_hidden_hoarder():
    c1 = card(7.4, 13.6, -22, D, pip_spade)
    c2 = card(16.6, 13.6, 22, RED, pip_heart)
    c3 = card(12, 11.4, 0, RED, pip_heart)
    fall = [L(WHITE, ROT(RR(1.6, 1.4, 3.6, 5, 0.6), 3.4, 3.8, -20)), L(WHITE, ROT(RR(18.8, 1.8, 3.6, 5, 0.6), 20.6, 4.2, 28))]
    return c1 + c2 + c3 + fall + [L(YELLOW, ST(12, 3.4, 2.4, 0.9, 4, -90))][:0]


def m_locked():
    return [L("#8d95ab", ARC(12, 9.2, 4.2, 170, 450, 2.8, 20), CAP(12, 12.8, 12, 15, 1.4)), L("#8d95ab", C(12, 19, 1.6))]


def m_trophy():
    return [L("#a8730c", R(7, 19.6, 10, 2.8)), L("#d19a1c", R(10.4, 15, 3.2, 5)),
            L(GOLD, [(5.4, 2.6), (18.6, 2.6), (17.6, 10)] + BZ((17.6, 10), (16.4, 15.8), (12, 16))[1:] + BZ((12, 16), (7.6, 15.8), (6.4, 10))[1:]),
            L(GOLD, ARC(5.2, 7, 3.2, 70, 290, 1.7, 10), ARC(18.8, 7, 3.2, -110, 110, 1.7, 10)), L(WHITE, ST(12, 8.8, 3.6, 1.5, 5)), L(WHITE, R(7.6, 4.4, 1.5, 6))]


# group -> (field colour, motif, scale)
MOTIFS = {
    "kills": ("#7a2433", m_kills, 0.7), "damage": ("#3b2a6b", m_damage, 0.74), "bosses": ("#4b2a5e", m_bosses, 0.72), "floor": ("#2f4f7a", m_floor, 0.7),
    "runkills": ("#6b2a2a", m_runkills, 0.8), "maxhit": ("#2a3b66", m_maxhit, 0.74), "crits": ("#7a3b1c", m_crits, 0.72), "shots": ("#3f4650", m_shots, 0.72),
    "revives": ("#2f7a58", m_revives, 0.7), "distance": ("#6e4a2a", m_distance, 0.92), "dashes": ("#25508f", m_dashes, 0.72), "abilities": ("#4a2f8f", m_abilities, 0.74),
    "grenades": ("#3d4a2a", m_grenades, 0.72), "barrels": ("#4a3f2a", m_barrels, 0.7), "pickups": ("#2f6a6e", m_pickups, 0.72), "healed": ("#2f7a58", m_healed, 0.72),
    "taken": ("#3a4660", m_taken, 0.7), "games": ("#3a3f8f", m_games, 0.76), "time": ("#2f5f7a", m_time, 0.7), "levels": ("#1f5a3a", m_levels, 0.72),
    "cards": ("#2f5a4a", m_cards, 0.74), "mods": ("#5a1f2a", m_mods, 0.72), "score": ("#5a3f8f", m_score, 0.74),
    "wk_sniper": ("#33415c", m_wk_sniper, 0.82), "wk_shotgun": ("#5a3a2a", m_wk_shotgun, 0.82), "wk_minigun": ("#2f3f4a", m_wk_minigun, 0.82), "wk_flamer": ("#6a2f1c", m_wk_flamer, 0.78),
    "wk_gl": ("#3a4a2a", m_wk_gl, 0.82), "wk_railgun": ("#1f3f5f", m_wk_railgun, 0.82), "wk_sword": ("#33415c", m_wk_sword, 0.76), "wk_hammer": ("#4a3a5a", m_wk_hammer, 0.76),
    "class_soldier": ("#3f5a2a", m_class_soldier, 0.76), "class_medic": ("#2f7a58", m_class_medic, 0.72), "class_heavy": ("#3a4660", m_class_heavy, 0.74), "class_scout": ("#7a4f1c", m_class_scout, 0.76),
    "class_demolisher": ("#6a2a1c", m_class_demolisher, 0.74), "class_ranger": ("#4b2f7a", m_class_ranger, 0.76), "class_berserker": ("#7a1f1f", m_class_berserker, 0.74),
    "class_swordsman": ("#33415c", m_class_swordsman, 0.74), "class_hammerer": ("#5a3f1c", m_class_hammerer, 0.74),
    "hidden_untouchable": ("#1f4f8f", m_hidden_untouchable, 0.76), "hidden_speedrun_loss": ("#5a1f2a", m_hidden_speedrun_loss, 0.72), "hidden_minimalist": ("#3a3f4a", m_hidden_minimalist, 0.76),
    "hidden_glass": ("#2a4f6a", m_hidden_glass, 0.72), "hidden_masochist": ("#3a2a4f", m_hidden_masochist, 0.76), "hidden_savior": ("#2f5f8f", m_hidden_savior, 0.74),
    "hidden_firebug": ("#4a1f1f", m_hidden_firebug, 0.72), "hidden_marathon": ("#2f4f7a", m_hidden_marathon, 0.72), "hidden_flawless": ("#4b2a6e", m_hidden_flawless, 0.74),
    "hidden_hoarder": ("#2a5a4a", m_hidden_hoarder, 0.74),
}


def shade(h, k):
    h = h.lstrip("#")
    return "#%02x%02x%02x" % tuple(min(255, int(int(h[i:i + 2], 16) * k)) for i in (0, 2, 4))


def rim_shape(tier):
    if tier == 2:
        return [(12 + (10.5 + 0.9 * abs(cos(6 * 2 * pi * i / 96 / 2 * 2 / 2))) * cos(2 * pi * i / 96), 12 + (10.5 + 0.9 * abs(cos(6 * 2 * pi * i / 96 / 2 * 2 / 2))) * sin(2 * pi * i / 96)) for i in range(96)]
    if tier == 3:
        return ST(12, 12, 11.9, 9.8, 12)
    return C(12, 12, 11.2, 40)


def badge(field, motif, k, tier):
    rim, rim_d, edge = TIERS[tier]
    layers = [([rim_shape(tier)], rim_d), ([C(12, 12, 10.2 if tier != 2 else 9.9, 40)], rim)]
    if tier == 1:
        layers.append(([ARC(12, 12, 9.95, 0, 360, 0.5, 40)], "#a9b3c2"))
    if tier == 3:
        layers.append(([ARC(12, 12, 9.95, 0, 360, 0.5, 40)], "#ffffff"))
    layers.append(([C(12, 12, 9.0, 40)], edge))
    layers.append(([C(12, 12, 8.5, 40)], field))
    layers += X(motif(), k * 1.16)
    if tier == 3:  # gem
        layers.append(([[(12, 0.2), (14.6, 2.8), (12, 6.2), (9.4, 2.8)]], "#7a3cf0"))
        layers.append(([[(12, 0.2), (14.6, 2.8), (12, 2.8)]], "#d6baff"))
        layers.append(([[(9.4, 2.8), (12, 2.8), (12, 6.2)]], "#5b27c4"))
    return layers


def locked_badge():
    layers = [([C(12, 12, 11.2, 40)], "#2a2f3d"), ([C(12, 12, 10.2, 40)], "#5a6378"), ([C(12, 12, 9.0, 40)], "#232736"), ([C(12, 12, 8.5, 40)], "#2c3144")]
    return layers + X(m_locked(), 0.9)


def path_of(polys):
    return " ".join("M" + " L".join("%.2f %.2f" % p for p in poly) + " Z" for poly in polys)


def spec_layers(layers):
    return [(path_of(polys), col) for polys, col in layers]


def has_content(path):
    img = bpy.data.images.load(path)
    px = list(img.pixels)
    n = sum(1 for i in range(3, len(px), 4) if px[i] > 0.5)
    bpy.data.images.remove(img)
    return n / (len(px) / 4)


def render(name, layers, out_dir, size=None):
    objs = kit.build(spec_layers(layers))
    out = os.path.join(out_dir, name + kit.EXT)
    kit.place_and_render(objs, out)
    cover = has_content(out)
    print("ach", name, "coverage %.2f" % cover)
    return out, cover


def write_sheet(paths, cols=10):
    from_px = SHEET_PX or kit.SIZE
    S = kit.SIZE
    rows = (len(paths) + cols - 1) // cols
    img = bpy.data.images.new("sheet", cols * S, rows * S, alpha=True)
    buf = [0.0] * (cols * S * rows * S * 4)
    for k in range(len(buf) // 4):
        buf[k * 4:k * 4 + 4] = [0.93, 0.9, 0.84, 1.0]
    for i, p in enumerate(paths):
        im = bpy.data.images.load(p)
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


def main():
    kit.setup_scene()
    os.makedirs(OUT_DIR, exist_ok=True)
    jobs = []
    for aid, group, tier, *_ in _tab.rows():
        assert group in MOTIFS, group
        field, motif, k = MOTIFS[group]
        jobs.append((aid, lambda field=field, motif=motif, k=k, tier=tier: badge(field, motif, k, tier)))
    jobs.append(("locked", locked_badge))
    bad, paths = [], []
    for name, fn in jobs:
        if ONLY and name not in ONLY:
            continue
        out, cover = render(name, fn(), OUT_DIR)
        paths.append(out)
        if cover < 0.25:
            bad.append((name, cover))
    if not ONLY or "ach_menu" in ONLY:
        os.makedirs(UI_DIR, exist_ok=True)
        size = kit.SIZE
        kit.SIZE = 64
        kit.setup_scene()
        render("ach_menu", m_trophy(), UI_DIR)
        kit.SIZE = size
    if SHEET:
        write_sheet(paths)
    if bad:
        raise SystemExit("empty icons: %s" % bad)


main()
