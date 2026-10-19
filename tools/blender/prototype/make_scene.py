import bpy, math, os, random, sys
from mathutils import Vector, Matrix

OUT = r"C:\blender_scenes\out"
VARIANTS = {
    "A_white_clean": dict(floor=(0.80, 0.81, 0.85), hero=(0.15, 0.55, 0.95), enemy=(0.55, 0.78, 0.45), blood=(0.45, 0.01, 0.02), sun=(1.0, 0.97, 0.92), sun_e=2.2, sun_rot=(52, 0, 35), ambient=0.45),
    "B_warm_pastel": dict(floor=(0.84, 0.80, 0.75), hero=(0.95, 0.45, 0.25), enemy=(0.55, 0.50, 0.80), blood=(0.5, 0.02, 0.03), sun=(1.0, 0.88, 0.75), sun_e=2.4, sun_rot=(48, 0, 55), ambient=0.4),
    "C_cool_clinical": dict(floor=(0.76, 0.82, 0.88), hero=(0.10, 0.75, 0.55), enemy=(0.80, 0.55, 0.60), blood=(0.4, 0.0, 0.03), sun=(0.92, 0.96, 1.0), sun_e=2.0, sun_rot=(58, 0, 20), ambient=0.5),
}
g = globals()
SEL = g.get("VARIANT_LIST", ["A_white_clean"])
CAMS = {"iso62": (62, 30, 17), "iso45": (45, 35, 17), "top78": (78, 12, 16)}
CAM_LIST = g.get("CAM_LIST", ["iso62", "iso45", "top78"])
SIZE = g.get("SIZE", (1280, 720))
SAMPLES = g.get("SAMPLES", 48)
os.makedirs(OUT, exist_ok=True)


def mat(name, color, rough=0.55):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    return m


def put(obj, m, coll):
    obj.data.materials.append(m)
    for c in obj.users_collection:
        c.objects.unlink(obj)
    coll.objects.link(obj)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def sphere(coll, m, loc, r, scale=(1, 1, 1), seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    return put(o, m, coll)


def box(coll, m, loc, size, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    return put(o, m, coll)


def cyl(coll, m, loc, r, d, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d, location=loc, rotation=rot, vertices=20)
    return put(bpy.context.active_object, m, coll)


def weapon(coll, kind, acc, dark):
    P = []
    if kind == "pistol":
        P += [box(coll, dark, (0, -0.62, 0.66), (0.16, 0.5, 0.2)), box(coll, acc, (0, -0.5, 0.52), (0.14, 0.16, 0.3))]
    elif kind == "smg":
        P += [box(coll, dark, (0, -0.8, 0.66), (0.2, 0.95, 0.24)), box(coll, acc, (0, -0.65, 0.42), (0.12, 0.14, 0.4)),
              cyl(coll, acc, (0, -1.35, 0.68), 0.06, 0.3, (math.pi / 2, 0, 0))]
    elif kind == "shotgun":
        P += [box(coll, dark, (0, -1.0, 0.66), (0.18, 1.5, 0.2)), box(coll, acc, (0, -1.15, 0.54), (0.24, 0.4, 0.16)),
              box(coll, acc, (0, -0.35, 0.62), (0.2, 0.4, 0.3))]
    elif kind == "hmg":
        P += [box(coll, dark, (0, -1.0, 0.7), (0.3, 1.5, 0.34)), cyl(coll, acc, (0, -0.75, 0.38), 0.24, 0.3, (0, math.pi / 2, 0)),
              cyl(coll, dark, (0, -1.85, 0.7), 0.09, 0.5, (math.pi / 2, 0, 0)), box(coll, acc, (0, -0.2, 0.7), (0.26, 0.4, 0.3))]
    return P


def chibi(coll, loc, rz, body_m, head_m, dark_m, skin_m, gun=None, tilt=0.0, sc=1.35, head_k=1.0, slim=1.0, kind=None, acc=None):
    x, y, z = loc
    parts = []
    parts.append(sphere(coll, head_m, (x, y, z + 1.05), 0.46 * head_k, (1, 1, 0.95)))
    parts.append(sphere(coll, body_m, (x, y, z + 0.5), 0.34, (slim, 0.85 * slim, 1.15)))
    parts.append(sphere(coll, dark_m, (x, y, z + 0.62), 0.37, (1.02 * slim, 0.9 * slim, 0.55)))
    for s in (-1, 1):
        parts.append(sphere(coll, dark_m, (x + s * 0.2, y, z + 0.14), 0.13, (1, 1.3, 1)))
        parts.append(sphere(coll, skin_m, (x + s * 0.34, y - (0.5 if kind else 0.12), z + (0.62 if kind else 0.52)), 0.1))
        if kind:
            parts.append(sphere(coll, body_m, (x + s * 0.3, y - 0.22, z + 0.58), 0.1, (1, 2.2, 1)))
    if kind and gun:
        for p in weapon(coll, kind, acc, gun):
            p.location = (p.location.x + x, p.location.y + y, p.location.z + z)
            parts.append(p)
    e = bpy.data.objects.new("grp", None)
    coll.objects.link(e)
    e.location = (x, y, z)
    for p in parts:
        p.parent = e
        p.matrix_parent_inverse = Matrix.Translation(-Vector(e.location))
    e.rotation_euler = (tilt, 0, rz)
    e.scale = (sc, sc, sc)
    return e


def build(name, v, cam_cfg=(62, 30, 13)):
    if bpy.context.window:
        scn = bpy.data.scenes.new("wrh_" + name)
        bpy.context.window.scene = scn
    else:
        scn = bpy.context.scene
        for o in list(bpy.data.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    coll = bpy.data.collections.new("wrh_" + name)
    scn.collection.children.link(coll)
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scn.render.engine = eng
            break
        except TypeError:
            pass
    scn.render.resolution_x, scn.render.resolution_y = SIZE
    scn.render.resolution_percentage = 100
    scn.render.film_transparent = False
    try:
        scn.eevee.taa_render_samples = SAMPLES
    except Exception:
        pass
    scn.view_settings.view_transform = "Standard"
    scn.view_settings.look = "None"
    scn.view_settings.exposure = -0.2
    w = bpy.data.worlds.new("wrh_w_" + name)
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*v["floor"], 1)
    bg.inputs["Strength"].default_value = v["ambient"]
    scn.world = w

    floor_m = mat("floor", v["floor"], 0.9)
    hero_m = mat("hero", v["hero"])
    head_m = mat("head", (0.98, 0.98, 0.98), 0.4)
    dark_m = mat("dark", (0.12, 0.13, 0.16))
    skin_m = mat("glove", (0.05, 0.05, 0.06))
    enemy_m = mat("enemy", v["enemy"])
    ehead_m = mat("ehead", tuple(min(1, c + 0.2) for c in v["enemy"]), 0.5)
    gun_m = mat("gun", (0.95, 0.75, 0.15), 0.35)
    blood_m = mat("blood", v["blood"], 0.25)
    wall_m = mat("wall", tuple(c * 0.97 for c in v["floor"]), 0.9)
    crate_m = mat("crate", (0.82, 0.80, 0.78), 0.8)

    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    put(bpy.context.active_object, floor_m, coll)
    box(coll, wall_m, (0, 9, 1.2), (24, 0.6, 2.4))
    box(coll, wall_m, (-12, 0, 1.2), (0.6, 18, 2.4))
    for i in range(-5, 6):
        box(coll, mat("grid", tuple(c * 0.92 for c in v["floor"]), 0.9), (i * 2, 0, 0.003), (0.02, 40, 0.004))
        box(coll, mat("grid2", tuple(c * 0.92 for c in v["floor"]), 0.9), (0, i * 2, 0.003), (40, 0.02, 0.004))
    for loc, sz in (((-6, 5, 0.4), (1.2, 1.2, 0.8)), ((6, 4, 0.35), (1.0, 1.4, 0.7)), ((-8, -2, 0.3), (1, 1, 0.6))):
        box(coll, crate_m, loc, sz)

    random.seed(7)
    for _ in range(16):  # blood pools
        r = random.uniform(0.2, 0.7)
        x, y = random.uniform(-6, 6), random.uniform(-4, 5)
        o = sphere(coll, blood_m, (x, y, 0.01), r, (1, random.uniform(0.6, 1.2), 0.012), 16)
    for _ in range(40):  # splatter drops and gibs
        r = random.uniform(0.04, 0.14)
        x, y = random.uniform(-6.5, 6.5), random.uniform(-4.5, 5.5)
        sphere(coll, blood_m, (x, y, 0.02), r, (1, 1, 0.1), 10)
    for _ in range(14):
        x, y = random.uniform(-5, 5), random.uniform(-3, 4)
        box(coll, blood_m, (x, y, 0.1), (random.uniform(0.1, 0.25),) * 3, (random.random(), random.random(), random.random()))

    gun_dark = mat("gundark", (0.16, 0.17, 0.2), 0.4)
    heroes = (("pistol", v["hero"], -4.6), ("smg", (0.95, 0.3, 0.45), -1.6), ("shotgun", (0.98, 0.78, 0.15), 1.6), ("hmg", (0.55, 0.35, 0.85), 4.6))
    for i, (kind, col, hx) in enumerate(heroes):
        chibi(coll, (hx, -2.6 + (i % 2) * 0.5, 0), math.radians(180 + (i - 1.5) * -8), mat("hero%d" % i, col), head_m, dark_m, skin_m, gun_dark, kind=kind, acc=gun_m)
    nade = sphere(coll, mat("nade", (0.25, 0.55, 0.25)), (-3.2, -1.2, 0.18), 0.17)
    box(coll, gun_m, (-3.2, -1.2, 0.38), (0.06, 0.06, 0.1))
    runner_m = mat("runner", (0.95, 0.45, 0.2))
    rhead_m = mat("rhead", (1.0, 0.7, 0.5), 0.5)
    tank_m = mat("tank", (0.42, 0.3, 0.55))
    thead_m = mat("thead", (0.65, 0.55, 0.75), 0.5)
    plate_m = mat("plate", (0.2, 0.2, 0.25), 0.3)
    for (x, y) in ((-5.0, 3.6), (-2.6, 4.4), (0.4, 3.0), (3.4, 4.2), (5.4, 3.0)):
        chibi(coll, (x, y, 0), math.radians(random.uniform(-25, 25)), enemy_m, ehead_m, dark_m, skin_m)
    for (x, y) in ((-3.6, 1.0), (-1.6, 1.8), (0.8, 0.6), (2.6, 1.6), (4.6, 0.8)):
        chibi(coll, (x, y, 0), math.radians(random.uniform(-15, 15)), runner_m, rhead_m, dark_m, skin_m, tilt=0.45, sc=1.0, head_k=1.15, slim=0.8)
    for (x, y) in ((-1.0, 5.6), (2.0, 6.0)):
        t = chibi(coll, (x, y, 0), math.radians(random.uniform(-10, 10)), tank_m, thead_m, plate_m, skin_m, sc=2.2, head_k=0.8, slim=1.35)
        for s in (-1, 1):
            p = box(coll, plate_m, (x + s * 0.5, y, 0.62), (0.16, 0.5, 0.5))
            p.parent = t
            p.matrix_parent_inverse = Matrix.Translation(-Vector(t.location))
    for (x, y, tl) in ((-6.0, -0.4, 1.45), (6.2, -0.2, 1.5), (-0.4, -0.2, 1.4), (1.2, 0.0, 1.5)):
        chibi(coll, (x, y, 0.5), math.radians(random.uniform(0, 360)), enemy_m, ehead_m, dark_m, skin_m, tilt=tl)

    bpy.ops.object.light_add(type="SUN", location=(0, 0, 10))
    sun = bpy.context.active_object
    sun.data.energy = v["sun_e"]
    sun.data.color = v["sun"]
    sun.data.angle = math.radians(6)
    sun.rotation_euler = tuple(math.radians(a) for a in v["sun_rot"])
    for c in sun.users_collection:
        c.objects.unlink(sun)
    coll.objects.link(sun)

    bpy.ops.object.camera_add(location=(9, -9, 9))
    cam = bpy.context.active_object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = cam_cfg[2]
    cam.rotation_euler = (math.radians(cam_cfg[0]), 0, math.radians(cam_cfg[1]))
    cam.location = Vector((0.0, 1.6, 0.6)) + cam.rotation_euler.to_matrix() @ Vector((0, 0, 22))
    for c in cam.users_collection:
        c.objects.unlink(cam)
    coll.objects.link(cam)
    scn.camera = cam
    return scn, coll


def cleanup(scn, coll):
    for o in list(coll.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(coll)
    w = scn.world
    if len(bpy.data.scenes) > 1:
        bpy.data.scenes.remove(scn)
    else:
        scn.world = None
    if w:
        bpy.data.worlds.remove(w)
    for m in [m for m in bpy.data.materials if m.users == 0]:
        bpy.data.materials.remove(m)
    for me in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(me)


def run():
    old_scene = bpy.context.window.scene if bpy.context.window else None
    res = {}
    for name in SEL:
        for cn in CAM_LIST:
            scn, coll = build(name, VARIANTS[name], CAMS[cn])
            try:
                path = os.path.join(OUT, name + "__" + cn + ".png")
                scn.render.filepath = path
                scn.render.image_settings.file_format = "PNG"
                bpy.ops.render.render(write_still=True, scene=scn.name)
                res[name + "__" + cn] = os.path.getsize(path) if os.path.exists(path) else -1
            finally:
                if old_scene:
                    bpy.context.window.scene = old_scene
                cleanup(scn, coll)
    return res


RESULT = run()
print(RESULT)

