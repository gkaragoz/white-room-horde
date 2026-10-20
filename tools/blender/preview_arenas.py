"""Concept renders of vertical arenas (ramps, bridges, underpasses, tunnels) and the props they would need.

  blender -b --factory-startup --python tools/blender/preview_arenas.py
  env: OUT_DIR (default tools/blender/out/arena_previews), ONLY=name,name

Greybox in the game's own colours, seen from the game's camera (orthographic, 28 degrees up, 30 degrees yaw), with a player
and a few enemies for scale. Nothing here goes into the game: it is for choosing a direction before the layered map code
is written. Heights are in the game's world units (a player is about 1.5 high), ramps are exact 30 and 45 degree slopes.
"""
import math
import os

import bpy
import bmesh
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT_DIR = os.environ.get("OUT_DIR", os.path.join(ROOT, "tools", "blender", "out", "arena_previews"))
ONLY = [s for s in os.environ.get("ONLY", "").split(",") if s]
T30, T45 = math.tan(math.radians(30)), math.tan(math.radians(45))


def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


_mats = {}


def mat(color, rough=0.85):
    key = (color, rough)
    if key not in _mats or _mats[key].name not in bpy.data.materials:
        m = bpy.data.materials.new("m" + color)
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (*lin(color), 1)
        b.inputs["Roughness"].default_value = rough
        _mats[key] = m
    return _mats[key]


def put(o, color, rough=0.85):
    o.data.materials.clear()
    o.data.materials.append(mat(color, rough))
    return o


def box(x, y, z0, sx, sy, sz, color, rz=0.0):
    """A box standing on height z0 with footprint sx by sy centred on (x, y), height sz."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z0 + sz / 2))
    o = bpy.context.active_object
    o.scale = (sx, sy, sz)
    o.rotation_euler[2] = math.radians(rz)
    return put(o, color)


def cyl(x, y, z0, r, h, color, seg=16):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=seg, location=(x, y, z0 + h / 2))
    return put(bpy.context.active_object, color)


def mesh_obj(name, verts, faces, color):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    for p in me.polygons:
        p.use_smooth = False
    return put(o, color)


def ramp(x, y, z0, width, run, rise, color, rz=0.0, side="#D9CDB4"):
    """A solid wedge rising along +x (before rotation) from z0 to z0+rise over `run`; centred on (x, y) at its low end."""
    w = width / 2
    v = [(0, -w, 0), (run, -w, 0), (run, w, 0), (0, w, 0), (run, -w, rise), (run, w, rise)]
    f = [(0, 3, 2, 1), (1, 2, 5, 4), (0, 1, 4), (3, 5, 2), (0, 4, 5, 3)]
    o = mesh_obj("ramp", v, f, color)
    o.location = (x, y, z0)
    o.rotation_euler[2] = math.radians(rz)
    return o


def ramp_at(x, y, z0, width, angle, rise, color, rz=0.0):
    run = rise / math.tan(math.radians(angle))
    return ramp(x, y, z0, width, run, rise, color, rz), run


def rail(x0, y0, x1, y1, z0, h=0.9, color="#6C7A89"):
    dx, dy = x1 - x0, y1 - y0
    n = max(2, int(math.hypot(dx, dy) / 1.2))
    ang = math.degrees(math.atan2(dy, dx))
    box((x0 + x1) / 2, (y0 + y1) / 2, z0 + h - 0.1, math.hypot(dx, dy), 0.12, 0.1, color, ang)
    for i in range(n + 1):
        t = i / n
        box(x0 + dx * t, y0 + dy * t, z0, 0.12, 0.12, h, color)


def tunnel(x, y, z0, width, height, length, rz=0.0, shell="#BDB2A0"):
    """An arched tunnel along +x (before rotation): half-round roof on short walls, open at both ends, dark inside."""
    r = width / 2
    wall = max(0.0, height - r)
    t = 0.5
    arc = 12
    verts, faces = [], []

    def ring(off, rad):
        pts = [(off, -rad, 0.0), (off, -rad, wall)]
        for i in range(1, arc):
            a = math.pi * i / arc
            pts.append((off, -math.cos(a) * rad, wall + math.sin(a) * rad))
        pts += [(off, rad, wall), (off, rad, 0.0)]
        return pts

    inner, outer = ring(0, r), ring(0, r + t)
    n = len(inner)
    for xx in (0.0, length):
        for p in inner:
            verts.append((xx, p[1], p[2]))
    for xx in (0.0, length):
        for p in outer:
            verts.append((xx, p[1], p[2]))
    # indices: inner0 [0..n), inner1 [n..2n), outer0 [2n..3n), outer1 [3n..4n)
    for i in range(n - 1):
        faces.append((i, i + 1, n + i + 1, n + i))  # inner surface
        faces.append((2 * n + i, 3 * n + i, 3 * n + i + 1, 2 * n + i + 1))  # outer surface
        faces.append((i, 2 * n + i, 2 * n + i + 1, i + 1))  # front lip
        faces.append((n + i, n + i + 1, 3 * n + i + 1, 3 * n + i))  # back lip
    faces.append((0, n, 3 * n, 2 * n))
    faces.append((n - 1, 3 * n + n - 1, n + n - 1, 2 * n - 1 + 0))
    o = mesh_obj("tunnel", verts, [tuple(reversed(f)) for f in faces], shell)
    o.location = (x, y, z0)
    o.rotation_euler[2] = math.radians(rz)
    # dark floor inside so the mouth reads as a hole
    b = box(x, y, z0 + 0.01, length, width, 0.02, "#3B3A40", rz)
    b.location = Vector((x, y, z0 + 0.01)) + Vector((math.cos(math.radians(rz)), math.sin(math.radians(rz)), 0)) * (length / 2)
    return o


def person(x, y, z0, color, s=1.0):
    """A chibi stand-in: capsule body and a big round head."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.42 * s, location=(x, y, z0 + 0.55 * s))
    put(bpy.context.active_object, color)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5 * s, location=(x, y, z0 + 1.25 * s))
    put(bpy.context.active_object, color)


def barrel(x, y, z0):
    cyl(x, y, z0, 0.5, 1.1, "#C84B3C")


def crate(x, y, z0, s=1.0):
    box(x, y, z0, s, s, s, "#A9794B")


def floor_slab(w, d, z=0.0, color="#EAE3D4", thick=0.6):
    return box(0, 0, z - thick, w, d, thick, color)


def setup_render(sc, w=1280, h=720, ortho=44):
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            pass
    sc.render.resolution_x, sc.render.resolution_y = w, h
    try:
        sc.eevee.taa_render_samples = 48
    except Exception:
        pass
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.exposure = 0.0
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*lin("#EDE3D0"), 1)
    bg.inputs["Strength"].default_value = 0.9
    sc.world = world
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 20))
    sun = bpy.context.active_object
    sun.data.energy = 2.6
    sun.data.angle = math.radians(4)
    sun.data.color = lin("#FFE2B8")
    sun.rotation_euler = tuple(math.radians(a) for a in (48, 0, 20))
    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = ortho
    # the game's camera: 28 degrees above the horizon, yawed 30 degrees
    cam.rotation_euler = (math.radians(90 - 28), 0, math.radians(30 + 180 - 180))
    back = cam.rotation_euler.to_matrix() @ Vector((0, 0, 60))
    cam.location = Vector((0, 0, 1.2)) + back
    cam.data.clip_end = 400
    sc.camera = cam
    return cam


def render(name, ortho, builder):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()
    builder()
    sc = bpy.context.scene
    setup_render(sc, ortho=ortho)
    os.makedirs(OUT_DIR, exist_ok=True)
    sc.render.filepath = os.path.join(OUT_DIR, name + ".png")
    sc.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    print("rendered", name)


# ------------------------------------------------------------------ the concepts
def ramp_top(x, y, z_top, width, angle, rise, dir_deg, color):
    """A ramp whose high end is at (x, y) on height z_top and which descends toward dir_deg (degrees, 0 = +x)."""
    run = rise / math.tan(math.radians(angle))
    d = math.radians(dir_deg)
    low = (x + math.cos(d) * run, y + math.sin(d) * run)
    ramp(low[0], low[1], z_top - rise, width, run, rise, color, rz=dir_deg + 180)
    return run


def block_with_tunnels(x0, x1, y0, y1, z0, h, color, tunnels):
    """A solid block with round-topped tunnels cut through it along y: tunnels = [(x_centre, width, height)]."""
    block = box((x0 + x1) / 2, (y0 + y1) / 2, z0, x1 - x0, y1 - y0, h, color)
    for xc, width, height in tunnels:
        r = width / 2
        wall = max(0.05, height - r)
        cutters = []
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=(y1 - y0) + 2, vertices=32, location=(xc, (y0 + y1) / 2, z0 + wall))
        c1 = bpy.context.active_object
        c1.rotation_euler[0] = math.radians(90)
        cutters.append(c1)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(xc, (y0 + y1) / 2, z0 + wall / 2 - 0.01))
        c2 = bpy.context.active_object
        c2.scale = (width, (y1 - y0) + 2, wall + 0.02)
        cutters.append(c2)
        for c in cutters:
            bpy.context.view_layer.objects.active = block
            m = block.modifiers.new("cut", "BOOLEAN")
            m.operation = "DIFFERENCE"
            m.object = c
            m.solver = "EXACT"
            bpy.ops.object.modifier_apply(modifier=m.name)
            bpy.data.objects.remove(c, do_unlink=True)
        box(xc, (y0 + y1) / 2, z0 + 0.01, width, y1 - y0, 0.04, "#8E877A")
    return block


def walls(w, d, z=0.0, h=1.6, color="#C9B79C"):
    box(0, d / 2 + 0.4, z, w + 1.6, 0.8, h, color)
    box(0, -d / 2 - 0.4, z, w + 1.6, 0.8, h, color)
    box(w / 2 + 0.4, 0, z, 0.8, d, h, color)
    box(-w / 2 - 0.4, 0, z, 0.8, d, h, color)


def cover(points):
    for x, y in points:
        box(x, y, 0, 3.0, 1.2, 1.4, "#B7C0A8")


def ramp_yard():
    """A sunken pit in the middle: two 30 degree ramps and two 45 degree ramps lead down into it."""
    W, D, depth = 44, 32, 3.0
    pit_w, pit_d = 18, 14
    box(0, (D + pit_d) / 4, -0.6, W, (D - pit_d) / 2, 0.6, "#EAE3D4")
    box(0, -(D + pit_d) / 4, -0.6, W, (D - pit_d) / 2, 0.6, "#EAE3D4")
    box(-(W + pit_w) / 4, 0, -0.6, (W - pit_w) / 2, pit_d, 0.6, "#EAE3D4")
    box((W + pit_w) / 4, 0, -0.6, (W - pit_w) / 2, pit_d, 0.6, "#EAE3D4")
    box(0, 0, -depth - 0.6, pit_w, pit_d, 0.6, "#D9D1BF")
    box(0, pit_d / 2 + 0.1, -depth, pit_w, 0.2, depth, "#D8CCB3")
    box(0, -pit_d / 2 - 0.1, -depth, pit_w, 0.2, depth, "#D8CCB3")
    box(pit_w / 2 + 0.1, 0, -depth, 0.2, pit_d, depth, "#D8CCB3")
    box(-pit_w / 2 - 0.1, 0, -depth, 0.2, pit_d, depth, "#D8CCB3")
    ramp_top(-pit_w / 2, 3.5, 0, 3.6, 30, depth, 0, "#F2C879")
    ramp_top(pit_w / 2, -3.5, 0, 3.6, 30, depth, 180, "#F2C879")
    ramp_top(3, pit_d / 2, 0, 3.6, 45, depth, -90, "#F2A65A")
    ramp_top(-3, -pit_d / 2, 0, 3.6, 45, depth, 90, "#F2A65A")
    for i in range(-1, 3):
        barrel(i * 2.0 + 1, 0.2, -depth)
    crate(4, -2, -depth, 1.4)
    crate(-5, 2.5, -depth, 1.4)
    walls(W, D)
    cover([(-14, 10), (14, -10), (-16, -9), (15, 11)])
    person(-13, 6, 0, "#4AA8FF")
    person(13, -6, 0, "#FF6B6B")
    person(0, -1, -depth, "#7FB069", 1.1)
    person(3.2, 0.5, -depth, "#7FB069")
    person(-4, 1.5, -depth, "#7FB069")


def overpass():
    """A bridge across a sunken road: fight on the deck, drop to the road, run under it."""
    W, D, deck = 46, 30, 4.0
    road_w = 10
    side = (W - road_w) / 2
    box(-(road_w / 2 + side / 2), 0, -0.6, side, D, 0.6, "#EAE3D4")
    box(road_w / 2 + side / 2, 0, -0.6, side, D, 0.6, "#EAE3D4")
    box(0, 0, -2.6, road_w, D, 0.6, "#D3CBB9")
    box(road_w / 2 + 0.1, 0, -2.0, 0.2, D, 2.0, "#D8CCB3")
    box(-road_w / 2 - 0.1, 0, -2.0, 0.2, D, 2.0, "#D8CCB3")
    for y in (-10, -5, 0, 5, 10):
        box(0, y, -1.99, 0.3, 2.0, 0.02, "#F4EBC8")
    bx = 9.0
    box(0, 0, deck - 0.8, 2 * bx, 6.4, 0.8, "#E3D3B0")
    for sx in (-4.5, 4.5):
        for sy in (-2.6, 2.6):
            box(sx, sy, -2.0, 1.2, 1.2, deck - 0.8 + 2.0, "#B7A78C")
    ramp_top(bx, 0, deck, 5.0, 30, deck, 0, "#F2C879")
    ramp_top(-bx, 0, deck, 5.0, 30, deck, 180, "#F2C879")
    rail(-bx, -3.2, bx, -3.2, deck)
    rail(-bx, 3.2, bx, 3.2, deck)
    walls(W, D)
    cover([(-18, 9), (-16, -10), (17, 10), (19, -9)])
    barrel(-2, -6, -2.0)
    barrel(2, 7, -2.0)
    crate(1, -2, -2.0, 1.4)
    person(-3, 1.2, deck, "#4AA8FF")
    person(4, -1, deck, "#FF6B6B")
    person(0, 3.5, -2.0, "#7FB069", 1.1)
    person(-1, -4, -2.0, "#7FB069")
    person(1.5, 10, -2.0, "#7FB069")
    person(15, 6, 0, "#7FB069")


def depot_tunnel():
    """A raised platform with a tunnel through it: the same ground is a place to fight on and a place to run under."""
    W, D, h = 46, 32, 4.0
    floor_slab(W, D)
    block_with_tunnels(-9, 9, -8, 8, 0, h, "#D9CDB4", [(-3.0, 5.0, 3.4)])
    box(0, 0, h, 18.4, 16.4, 0.3, "#EDE3CC")
    ramp_top(9.2, -2, h, 5.0, 30, h, 0, "#F2C879")
    ramp_top(-9.2, 4, h, 4.0, 45, h, 180, "#F2A65A")
    rail(-9, -8.2, 9, -8.2, h)
    rail(-9, 8.2, 9, 8.2, h)
    walls(W, D)
    cover([(-16, 11), (15, -11), (17, 10), (-17, -10)])
    barrel(8, -12, 0)
    barrel(-9, 12, 0)
    person(3, 3, h, "#4AA8FF")
    person(6, -2, h, "#FF6B6B")
    person(-3, -4, 0, "#7FB069", 1.1)
    person(-3, 0, 0, "#7FB069")
    person(-14, 4, 0, "#7FB069")


def tunnel_hub():
    """A plaza below a bank with three tunnels: enemies pour out of them, players can cut through or run along the top."""
    W, D = 46, 34
    floor_slab(W, D)
    bank = 4.0
    block_with_tunnels(-18, 18, 8, 16, 0, bank, "#D9CDB4", [(-10, 4.4, 3.2), (0, 4.4, 3.2), (10, 4.4, 3.2)])
    box(0, 12, bank, 36.4, 8.4, 0.3, "#EDE3CC")
    ramp_top(-18.2, 12, bank, 4.0, 30, bank, 180, "#F2C879")
    ramp_top(18.2, 12, bank, 4.0, 45, bank, 0, "#F2A65A")
    rail(-18, 7.8, 18, 7.8, bank)
    walls(W, D)
    cover([(-12, -4), (12, -5), (0, -9), (-17, -11), (17, -11)])
    barrel(-5, -2, 0)
    barrel(6, -3, 0)
    crate(0, -1, 0, 1.4)
    person(0, -6, 0, "#4AA8FF")
    person(4, -7, 0, "#FF6B6B")
    person(0, 5, 0, "#7FB069", 1.1)
    person(-10, 6, 0, "#7FB069")
    person(10, 5.5, 0, "#7FB069")
    person(-6, 12, bank, "#7FB069")


def mezzanine():
    """Two levels in one room: a mezzanine along the back wall reached by ramps from both ends, rails over the plaza."""
    W, D = 46, 34
    floor_slab(W, D)
    h = 3.4
    box(0, 12, h - 0.6, 30, 7, 0.6, "#E3D3B0")
    for x in (-14, -5, 5, 14):
        box(x, 9, 0, 1.2, 1.2, h - 0.6, "#B7A78C")
        box(x, 15, 0, 1.2, 1.2, h - 0.6, "#B7A78C")
    ramp_top(15, 12, h, 4.5, 30, h, 0, "#F2C879")
    ramp_top(-15, 12, h, 4.5, 45, h, 180, "#F2A65A")
    rail(-15, 8.4, 15, 8.4, h)
    walls(W, D)
    cover([(-12, -2), (11, -4), (0, -9), (-16, -10), (16, -11)])
    barrel(6, 4, 0)
    barrel(-7, 3, 0)
    person(-5, 12, h, "#4AA8FF")
    person(4, -4, 0, "#FF6B6B")
    person(10, 4, 0, "#7FB069")
    person(-2, 1, 0, "#7FB069", 1.1)
    person(12, 12, h, "#7FB069")


def props_sheet():
    """The pieces such maps are built from, side by side: ramps, rails, pillar, tunnel mouths, bridge segment, signs."""
    floor_slab(46, 22)
    ramp_top(-16, 5, 3, 3.4, 30, 3, 0, "#F2C879")
    ramp_top(-9, -2, 3, 3.4, 45, 3, 0, "#F2A65A")
    ramp_top(-16, -6, 1.2, 3.4, 30, 1.2, 0, "#F2C879")
    rail(-4, 6, 4, 6, 0)
    cyl(0, 2, 0, 0.7, 4.0, "#B7A78C")
    box(0, 2, 4.0, 2.2, 2.2, 0.4, "#D9CDB4")
    box(0, -4, 2.4, 8, 3.6, 0.7, "#E3D3B0")
    for x in (-3, 3):
        box(x, -4, 0, 1.0, 1.0, 2.4, "#B7A78C")
    rail(-4, -5.6, 4, -5.6, 3.1)
    rail(-4, -2.4, 4, -2.4, 3.1)
    block_with_tunnels(7, 14, 3, 9, 0, 4.0, "#D9CDB4", [(10.5, 3.6, 3.0)])
    block_with_tunnels(7, 14, -3, 1.5, 0, 4.4, "#D9CDB4", [(10.5, 5.6, 3.8)])
    box(9.5, -6.5, 0, 0.2, 0.2, 2.0, "#6C7A89")
    box(9.5, -6.5, 2.0, 0.2, 2.2, 1.0, "#F2C879")
    box(13, -6.5, 0, 0.2, 0.2, 2.0, "#6C7A89")
    box(13, -6.5, 2.0, 0.2, 2.2, 1.0, "#FF6B6B")
    crate(17, 4, 0, 1.4)
    crate(17, 4, 1.4, 1.0)
    barrel(19, 2, 0)
    person(17, -3, 0, "#4AA8FF")


SCENES = {
    "arena_ramp_yard": (50, ramp_yard),
    "arena_overpass": (52, overpass),
    "arena_depot_tunnel": (52, depot_tunnel),
    "arena_tunnel_hub": (52, tunnel_hub),
    "arena_mezzanine": (52, mezzanine),
    "props_sheet": (44, props_sheet),
}

if not globals().get("NO_RUN"):
    for name, (ortho, fn) in SCENES.items():
        if ONLY and name not in ONLY:
            continue
        render(name, ortho, fn)
