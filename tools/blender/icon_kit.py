"""Shared look of the game's icon set: a flat toy look (docs/DESIGN.md section 9) built from extruded, bevelled vector shapes.

Used by make_icons.py. An icon is a list of layers [(svg_path_d, '#rrggbb'), ...] drawn in a 24x24 box, bottom layer first.
Every layer becomes a curve extruded a little and bevelled, stacked a little higher than the one below, lit by a warm sun and a
cool fill, and outlined with a dark brown Freestyle line: the same light, outline and palette as the upgrade cards and the
weapon icons. The camera is orthographic and tilted a few degrees so the bevels catch the light.
"""
import bpy, os, math, tempfile
from mathutils import Vector

SIZE = int(os.environ.get("ICON_SIZE", "128"))
FORMAT = os.environ.get("ICON_FORMAT", "WEBP")  # PNG | WEBP
EXT = ".webp" if FORMAT == "WEBP" else ".png"
UNIT = 0.1  # Blender units per svg unit
OUTLINE = (0.17, 0.12, 0.07)

try:
    bpy.ops.preferences.addon_enable(module="io_curve_svg")
except Exception:  # already enabled
    pass


def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c] + [1.0]


_mats = {}


def mat(hex_color, rough=0.5):
    if hex_color not in _mats:
        m = bpy.data.materials.new("i_" + hex_color.lstrip("#"))
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = lin(hex_color)
        b.inputs["Roughness"].default_value = rough
        b.inputs["Metallic"].default_value = 0.0
        _mats[hex_color] = m
    return _mats[hex_color]


def setup_scene():
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE"
    except TypeError:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x = sc.render.resolution_y = SIZE
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = FORMAT
    sc.render.image_settings.color_mode = "RGBA"
    if FORMAT == "WEBP":
        sc.render.image_settings.quality = 92
    else:
        sc.render.image_settings.compression = 100
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.eevee.taa_render_samples = 64
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"
    sc.render.line_thickness = 1.0
    vl = bpy.context.view_layer
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new("outline")
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = False
    ls.linestyle.color = OUTLINE
    ls.linestyle.thickness = 2.2 * SIZE / 128
    w = bpy.data.worlds.new("w") if not bpy.data.worlds else bpy.data.worlds[0]
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = lin("#fff1dc")
    bg.inputs["Strength"].default_value = 0.85


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.curves):
        bpy.data.curves.remove(c)


def _import_layer(d, tmp):
    svg = os.path.join(tmp, "layer.svg")
    with open(svg, "w") as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="#000000" d="%s"/></svg>' % d)
    before = set(bpy.data.objects.keys())
    bpy.ops.import_curve.svg(filepath=svg)
    return [bpy.data.objects[n] for n in bpy.data.objects.keys() if n not in before]


def build(layers, tmp=None, depth=0.9, lift=0.8):
    """Import every layer, extrude and bevel it, and stack the layers. Returns the objects."""
    tmp = tmp or tempfile.gettempdir()
    clear()
    objs = []
    for i, (d, color) in enumerate(layers):
        parts = _import_layer(d, tmp)
        for o in parts:
            o.data.dimensions = "2D"
            o.data.fill_mode = "BOTH"
            o.data.use_fill_caps = True
            o.data.materials.clear()
            o.data.materials.append(mat(color))
            objs.append((o, i))
    return objs


def place_and_render(objs, out_path, depth=0.9, lift=0.8, bevel=0.22):
    """Scale to the 24-unit box, stack the layers, add the camera and lights, render."""
    sc = bpy.context.scene
    # the svg importer works in metres with 1 px = 0.001 m*scale: measure instead of assuming
    allv = []
    for o, i in objs:
        bpy.context.view_layer.update()
        allv.extend(o.matrix_world @ Vector(c) for c in o.bound_box)
    mn = Vector((min(v.x for v in allv), min(v.y for v in allv), 0))
    mx = Vector((max(v.x for v in allv), max(v.y for v in allv), 0))
    size = max(mx.x - mn.x, mx.y - mn.y)
    k = (24 * UNIT) / size if size > 0 else 1.0
    cx, cy = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2
    for o, i in objs:
        o.scale = (k, k, k)
        o.location = ((o.location.x - cx) * k, (o.location.y - cy) * k, i * lift * UNIT)
        o.data.extrude = (depth * UNIT) / k * 0.5  # half the depth each way
        o.data.bevel_depth = (bevel * UNIT) / k
        o.data.bevel_resolution = 2
        o.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.2
    sun.data.color = (1.0, 0.92, 0.8)
    sun.data.angle = math.radians(25)
    sun.rotation_euler = (math.radians(35), math.radians(-30), math.radians(20))
    fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "SUN"))
    fill.data.energy = 1.0
    fill.data.color = (0.8, 0.88, 1.0)
    fill.rotation_euler = (math.radians(60), math.radians(40), 0)
    sc.collection.objects.link(sun)
    sc.collection.objects.link(fill)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 24 * UNIT * 1.16
    cam.location = (0.12, -0.2, 6)
    cam.rotation_euler = (math.radians(4), math.radians(3), 0)
    sc.collection.objects.link(cam)
    sc.camera = cam
    sc.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
