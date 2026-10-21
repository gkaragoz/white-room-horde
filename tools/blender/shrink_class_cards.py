"""Palette-quantise the class card PNGs written by make_class_cards.py (about 50 KB -> 10 KB each, same look).

  python tools/blender/shrink_class_cards.py [dir]      needs Pillow; default dir packages/client/public/cards
Only the 90 ids of tools/cards/classes.py are touched.
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "cards"))
import classes  # noqa: E402

d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "packages", "client", "public", "cards")
before = after = 0
for k in classes.CLASSES:
    for cid, *_ in classes.T[k]:
        p = os.path.join(d, cid + ".png")
        before += os.path.getsize(p)
        im = Image.open(p).convert("RGBA")
        im.quantize(colors=128, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(p, optimize=True)
        after += os.path.getsize(p)
print("class cards: %.0f KB -> %.0f KB" % (before / 1024, after / 1024))
