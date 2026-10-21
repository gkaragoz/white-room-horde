"""Render the 20 difficulty-multiplier icons: warm orange-red toy badges, 128x128, to packages/client/public/mods/<id>.webp.

  blender -b --factory-startup --python tools/blender/make_mod_icons.py
  ONLY=tough,brutal ...     a few      SHEET=contact.png ...   also write a contact sheet

Reuses the helpers, palette and renderer of make_icons.py (its source is executed without the final main() call), so the look
matches the other icon sets; only the glyphs and the shared plate colour are new. Every mod is a 'harder' modifier, so every
badge has the same plate; glyphs are cream with yellow accents and dark details.
"""
import os

_here = os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/make_mod_icons.py")))
_repo = os.path.abspath(os.path.join(_here, "..", ".."))
os.environ.setdefault("OUT_DIR", os.path.join(_repo, "packages", "client", "public", "mods"))
_src = open(os.path.join(_here, "make_icons.py"), encoding="utf-8").read()
_src = _src[:_src.rindex("\nmain()")]
exec(compile(_src, "make_icons.py", "exec"), globals())

PLATE = "#e8562b"
GOLD = "#ffc933"
PALE = "#b9c4d6"


def M(layers, glyph=CREAM, accent=GOLD):
    return I(PLATE, layers, glyph=glyph, accent=accent)


def stroke(pts, w, tok):
    return [(capsule(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w), tok) for i in range(len(pts) - 1)]


def slash():
    return [(capsule(4.6, 4.6, 19.4, 19.4, 1.9), "p"), (capsule(4.6, 4.6, 19.4, 19.4, 1.05), "d")]


def figure(cx, cy, s, tok):
    return [(circ(cx, cy - 2.2 * s, 1.5 * s), tok), (rrect(cx - 1.7 * s, cy - 0.5 * s, 3.4 * s, 4.4 * s, 1.0 * s), tok)]


def eyes(cx, cy, d=2.6, s=1.1):
    out = []
    for sx in (-1, 1):
        x = cx + sx * d
        out.append((poly([(x - sx * s * 1.1, cy - s * 0.2), (x + sx * s * 1.1, cy - s * 1.0), (x + sx * s * 1.1, cy + s * 0.9), (x - sx * s * 1.1, cy + s * 0.9)]), "d"))
    return out


def rotpoly(pts, deg):
    return poly(rot(pts, 12, 12, deg))


ICONS = {
    "tough": M([
        (rrect(6, 9.5, 12, 11.6, 3), "g"), (rect(8.6, 16.4, 6.8, 1.6), "d"), (circ(9.4, 13.8, 1.6), "d"), (circ(14.6, 13.8, 1.6), "d"),
        ("M4.4 11.4 A7.6 7.6 0 0 1 19.6 11.4 Z", "a"), (rect(3.4, 10.4, 17.2, 2.2), "a"), (rect(11, 4.4, 2, 7), "a"),
    ], accent=PALE),
    "brutal": M([
        (star(12, 12, 10.8, 6.4, 9), "a"), (star(12, 12, 8.4, 5, 9), "p"),
        (rrect(6.6, 9.2, 10.8, 8.6, 2.2), "g"), (circ(8.4, 9.2, 1.9), "g"), (circ(11.2, 8.6, 1.9), "g"), (circ(14, 8.6, 1.9), "g"), (circ(16.4, 9.4, 1.8), "g"),
        (rect(10, 9.6, 0.7, 3.4), "d"), (rect(12.7, 9.6, 0.7, 3.4), "d"), (rect(7.6, 14.6, 8.6, 0.8), "d"),
        (rrect(8.4, 17, 7.4, 3.2, 1.2), "a"),
    ]),
    "horde": M(
        figure(7, 9.6, 0.95, "a") + figure(17, 9.6, 0.95, "a") + figure(12, 8.6, 0.95, "a")
        + figure(6, 15.4, 1.2, "g") + figure(18, 15.4, 1.2, "g") + figure(12, 14.4, 1.5, "g")),
    "sluggish": M([
        (capsule(4.6, 17.6, 17.4, 17.6, 2.4), "g"), (circ(19, 14.6, 2.6), "g"), (capsule(18.4, 13.2, 17.6, 8.4, 0.55), "g"), (capsule(20.2, 13.4, 21.6, 9.2, 0.55), "g"),
        (circ(17.6, 8.2, 0.9), "g"), (circ(21.6, 9, 0.9), "g"),
        (circ(10.6, 11.8, 6.6), "a"), (circ(10.6, 11.8, 4.6), "p"), (circ(10.6, 11.8, 3.2), "a"), (circ(10.6, 11.8, 1.6), "p"), (circ(19.4, 14.2, 0.6), "d"),
    ]),
    "fragile": M([
        (HEART, "g"),
    ] + stroke([(12, 6.4), (10, 10), (13.4, 12), (10.8, 15.6), (12.4, 19.8)], 0.85, "p")),
    "slowlearner": M([
        (poly([(3.6, 14.6), (11.4, 15.4), (11.4, 21.4), (3.6, 20.4)]) + " " + poly([(20.4, 14.6), (12.6, 15.4), (12.6, 21.4), (20.4, 20.4)]), "g"),
        (rect(11.4, 15.4, 1.2, 6), "a"),
        (poly([(7.6, 3.4), (16.4, 3.4), (12, 8.6)]) + " " + poly([(12, 8.6), (16.4, 13.6), (7.6, 13.6)]), "a"),
        (rect(6.6, 2.2, 10.8, 1.8), "d"), (rect(6.6, 13, 10.8, 1.8), "d"), (poly([(10.2, 12.2), (13.8, 12.2), (12, 10)]), "d"),
    ]),
    "scarce": M([
        (rrect(4, 11, 16, 9.4, 1.4), "g"), (rect(4, 14.2, 16, 1.5), "d"), (rect(10.6, 13, 2.8, 4), "a"),
        (rect(5, 10.2, 14, 2.6), "d"),
        (poly([(5, 10), (19, 10), (17.4, 3.8), (6.6, 3.8)]), "a"), (rect(5, 9.2, 14, 1.4), "d"),
    ]),
    "swift": M([
        (rect(1.6, 9, 6.6, 1.5), "a"), (rect(0.6, 12.2, 7.6, 1.5), "a"), (rect(2.2, 15.4, 6, 1.5), "a"),
        (circ(14.4, 13.2, 5.8), "g"), (poly([(13, 8.6), (7.6, 2.4), (9, 6.4), (5.6, 5.8), (8.8, 9.6)]), "a"),
        (poly([(16, 9), (21, 4.6), (19.6, 8.4), (22.4, 9)]), "a"),
    ] + eyes(14.4, 12.2, 2.2, 1.0) + [(rect(12.4, 15.6, 4, 1.2), "d")]),
    "elites": M([
        (circ(12, 14.4, 6.6), "g"),
        (poly([(5.8, 9.6), (6.4, 2.8), (9.4, 6.2), (12, 2.2), (14.6, 6.2), (17.6, 2.8), (18.2, 9.6)]), "a"),
        (rect(5.8, 8.8, 12.4, 1.8), "d"),
    ] + eyes(12, 14, 2.6, 1.2) + [(rect(9.4, 17.4, 5.2, 1.2), "d")]),
    "nohealing": M([
        (rect(9, 4.4, 6, 4), "g"), (rect(10.2, 5.6, 3.6, 1.6), "p"), (rrect(3.6, 7.6, 16.8, 12, 2.2), "g"),
        (rect(10.6, 10, 2.8, 7.2), "p"), (rect(8.4, 12.2, 7.2, 2.8), "p"),
    ] + slash()),
    "nobombs": M([
        (circ(11.6, 14.2, 6.4), "g"), (rect(9.8, 4.6, 3.6, 3.6), "a"), (poly([(13, 5.2), (18, 3.8), (18, 6), (13, 7.2)]), "g"),
        (rect(7, 12.8, 9.2, 1.1), "d"), (rect(7, 15.6, 9.2, 1.1), "d"),
    ] + slash()),
    "slowhands": M([
        (rrect(2.6, 4.6, 15.4, 5.8, 1.2), "g"), (poly([(5, 10.4), (11.4, 10.4), (11, 19), (6.4, 19)]), "g"),
        (poly([(11.4, 10.4), (15.6, 10.4), (15.6, 12), (12.6, 13.4)]), "g"), (rect(4.4, 6.2, 8, 1.1), "d"), (rect(17, 6, 1.6, 2.4), "d"),
        ("M12.4 21.6 C12.4 16.2 22.4 16.2 22.4 21.6 Z", "a"), (circ(22.8, 19.6, 1.5), "a"),
        (rect(14.2, 21.4, 2, 1.8), "a"), (rect(18.8, 21.4, 2, 1.8), "a"), (rect(15.2, 18.4, 0.8, 2.4), "d"), (rect(18.4, 18.2, 0.8, 2.6), "d"),
    ]),
    "weak": M([
        (rotpoly([(10, 11.4), (12, 10.6), (12.8, 12), (14, 10.4), (14, 17), (10, 17)], 40), "g"),
        (rotpoly([(7, 17), (17, 17), (17, 18.8), (7, 18.8)], 40) + " " + rotpoly([(11, 18.8), (13, 18.8), (13, 22.4), (11, 22.4)], 40), "a"),
        (rotpoly([(13.4, -0.4), (15.8, 3.2), (15.8, 6.6), (14, 8.4), (13.4, 7.2), (11, 8.4), (11.4, 3.2)], 70), "g"),
        (star(8, 7, 2.4, 1, 4), "d"),
    ]),
    "wide": M([
        (circ(12, 12, 10.6), "a"), (circ(12, 12, 8.4), "p"), (circ(12, 12, 6.6), "a"), (circ(12, 12, 4.8), "p"),
        (rrect(10.5, 6.6, 3, 7.4, 1.2), "g"), (circ(12, 16.8, 1.7), "g"),
    ]),
    "titanboss": M([
        (poly([(6.8, 9.6), (3.4, 2.6), (9.6, 6)]), "a"), (poly([(17.2, 9.6), (20.6, 2.6), (14.4, 6)]), "a"),
        (circ(12, 12.4, 7.8), "g"), (rect(8.2, 17.6, 7.6, 3.4), "g"),
        (poly([(7.6, 16.8), (9.4, 21.4), (10.6, 17)]), "a"), (poly([(16.4, 16.8), (14.6, 21.4), (13.4, 17)]), "a"),
    ] + eyes(12, 11.6, 3.2, 1.5) + [(rect(9.6, 15.6, 4.8, 1), "d")]),
    "lategame": M([
        (poly([(3, 21), (3, 18), (7, 18), (7, 14.6), (11, 14.6), (11, 11.2), (15, 11.2), (15, 7.8), (19, 7.8), (19, 21)]), "g"),
        (rect(3, 18, 4, 0.9), "d"), (rect(7, 14.6, 4, 0.9), "d"), (rect(11, 11.2, 4, 0.9), "d"), (rect(15, 7.8, 4, 0.9), "d"),
        (poly([(5.4, 1.8), (9.6, 7), (7, 7), (7, 10.4), (3.8, 10.4), (3.8, 7), (1.2, 7)]), "a"),
    ]),
    "hurry": M([
        (rect(1.6, 11, 4.6, 1.4), "a"), (rect(0.8, 14.2, 5.4, 1.4), "a"), (rect(2.4, 17.4, 3.8, 1.4), "a"),
        (rect(11, 2.8, 4.6, 2.4), "g"), (capsule(18.6, 6.6, 20, 5.2, 1.2), "g"),
        (circ(14, 13.6, 7.6), "g"), (circ(14, 13.6, 5.8), "a"), (rect(13.2, 8.8, 1.6, 5.6), "d"), (rect(13.2, 12.8, 4.6, 1.6), "d"), (circ(14, 13.6, 1.2), "d"),
    ]),
    "doomed": M([
        (rrect(2.4, 4.6, 19.2, 14.8, 2.4), "d"),
    ] + stroke([(3.8, 12.6), (7, 12.6), (8.6, 7.8), (10.8, 16.6), (12.2, 12.6), (14.2, 12.6)], 0.8, "a") + [
        (circ(18, 10.2, 2.7), "g"), (rect(16.4, 12, 3.2, 2.2), "g"), (circ(17, 10.2, 0.8), "d"), (circ(19, 10.2, 0.8), "d"),
    ]),
    "rushed": M([
        (poly([(5.2, 2.6), (7.6, 2.6), (13.4, 13.6), (11.6, 13.6)]), "g"), (poly([(10.6, 2.6), (13, 2.6), (18.8, 13.6), (17, 13.6)]), "g"), (poly([(16, 2.6), (18.4, 2.6), (22.8, 11), (21.2, 11)]), "g"),
        (poly([(2.6, 15), (9.4, 18.4), (2.6, 21.8)]), "a"), (poly([(10.4, 15), (17.2, 18.4), (10.4, 21.8)]), "a"), (rect(18, 15.4, 3, 6), "a"),
    ]),
    "longreload": M([
        (rrect(5.6, 3.6, 7.6, 17.4, 1.6), "g"), (rect(5.6, 3.6, 7.6, 3.4), "a"), (rect(6.8, 9.4, 5.2, 1), "d"), (rect(6.8, 12.4, 5.2, 1), "d"), (rect(6.8, 15.4, 5.2, 1), "d"),
        (circ(16.6, 15.4, 6.4), "d"), (circ(16.6, 15.4, 5.2), "g"), (rect(15.9, 11, 1.4, 4.9), "d"), (rect(15.9, 14.7, 3.8, 1.4), "d"),
    ]),
}

assert len(ICONS) == 20, len(ICONS)
_setup = kit.setup_scene


def _setup_small():
    _setup()
    bpy.context.scene.render.image_settings.quality = 82  # the 20 badges stay under 150 KB


kit.setup_scene = _setup_small
main()
