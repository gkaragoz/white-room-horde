"""Polished Valheim-style battle scene built from the chibi kit (posed rigs, weapons, VFX, props, post pass).

Run headless:  blender -b --factory-startup --python tools/blender/make_valheim_scene.py
Env: SIZE=1920x1080, SAMPLES=64, OUT=<png path>, POST=1 (numpy bloom/vignette/haze/grain)
Reuses tools/blender/make_chibi.py (Builder, rig, specs). Does not export anything.
"""
import bpy, bmesh, math, os, random, sys
from mathutils import Vector, Matrix, Quaternion

HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/make_valheim_scene.py")))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
g = globals()
W, H = [int(x) for x in os.environ.get("SIZE", "1920x1080").split("x")]
SAMPLES = int(os.environ.get("SAMPLES", "64"))
OUT = g.get("OUT") or os.environ.get("OUT") or os.path.join(REPO, "tools", "blender", "out", "valheim_scene.png")
POST = g.get("POST", os.environ.get("POST", "1") == "1")

kit_path = os.path.join(HERE, "make_chibi.py")
K = {"__name__": "kit", "__file__": kit_path, "NO_RUN": True}
exec(compile(open(kit_path, encoding="utf-8").read(), kit_path, "exec"), K)
Builder, build_armature, finalize, make_materials, lin = K["Builder"], K["build_armature"], K["finalize"], K["make_materials"], K["lin"]
LOW, HIGH = K["LOW"], K["HIGH"]

RND = random.Random(21)
scene = None


# ------------------------------------------------------------------ helpers
def emissive(name, hexc, strength):
    m = bpy.data.materials.new("emi_" + name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*lin(hexc), 1)
    e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs["Emission"], o.inputs["Surface"])
    return m


def static(name, fn, S=1.0, mats=None, detail=HIGH):
    """Build a joined, rig-less mesh with a Builder callback."""
    fixed, tint = mats
    b = Builder(name, S, fixed, tint, detail)
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
    mesh.name = name
    return mesh


def aim(rig, bone, direction):
    """Point a pose bone's Y axis along `direction` (armature space), keeping its head in place."""
    pb = rig.pose.bones[bone]
    cur = pb.matrix.copy()
    d = Vector(direction).normalized()
    ya = (cur.to_3x3() @ Vector((0, 1, 0))).normalized()
    q = ya.rotation_difference(d)
    m3 = q.to_matrix() @ cur.to_3x3()
    pb.matrix = Matrix.Translation(cur.translation) @ m3.to_4x4()
    bpy.context.view_layer.update()


def clone(base, loc, rz, scale=1.0):
    mesh, rig = base
    r = rig.copy()
    scene.collection.objects.link(r)
    m = mesh.copy()
    scene.collection.objects.link(m)
    m.parent = r
    for mod in m.modifiers:
        if mod.type == "ARMATURE":
            mod.object = r
    for o in (m, r):
        o.hide_render = False
        o.hide_viewport = False
    r.location = loc
    r.rotation_euler = (0, 0, rz)
    r.scale = (scale, scale, scale)
    return m, r


def base_char(cid, fn, S, head_top, detail, mats):
    fixed, tint = mats
    b = Builder(cid, S, fixed, tint, detail)
    fn(b)
    rig = build_armature(cid, S, head_top)
    mesh = finalize(cid, S, b.objs, rig)
    for o in (mesh, rig):
        o.hide_render = True
        o.hide_viewport = True
    return mesh, rig


# ------------------------------------------------------------------ poses (armature space, character faces -Y)
def pose_shoot(rig, jitter=0.0):
    aim(rig, "arm.R", (0.02, -1, 0.0))
    aim(rig, "hand.R", (0.02, -1, 0.0))
    aim(rig, "arm.L", (-0.55, -1, -0.05))
    aim(rig, "hand.L", (-0.7, -1, -0.05))
    aim(rig, "thigh.L", (0.1, -0.25, -1))
    aim(rig, "thigh.R", (-0.1, 0.35, -1))
    aim(rig, "foot.L", (0.1, -0.5, -0.6))
    aim(rig, "foot.R", (-0.1, -0.2, -0.7))


def pose_run(rig, phase=1.0, lean=0.35):
    aim(rig, "spine", (0, -lean, 1))
    aim(rig, "head", (0, -lean * 0.6, 1))
    aim(rig, "thigh.L", (0.05, -0.8 * phase, -1))
    aim(rig, "thigh.R", (-0.05, 0.8 * phase, -1))
    aim(rig, "foot.L", (0.05, -0.9 * phase, -0.5))
    aim(rig, "foot.R", (-0.05, 0.3 * phase, -0.9))
    aim(rig, "arm.L", (0.2, 0.9 * phase, -0.7))
    aim(rig, "hand.L", (0.2, 0.9 * phase, -0.7))
    aim(rig, "arm.R", (-0.2, -0.9 * phase, -0.7))
    aim(rig, "hand.R", (-0.2, -0.9 * phase, -0.7))


def pose_zombie(rig, lean=0.2, phase=0.35):
    aim(rig, "spine", (0, -lean, 1))
    aim(rig, "head", (0, -lean * 1.4, 1))
    aim(rig, "arm.L", (0.12, -1, 0.15))
    aim(rig, "hand.L", (0.1, -1, 0.2))
    aim(rig, "arm.R", (-0.12, -1, 0.1))
    aim(rig, "hand.R", (-0.1, -1, 0.15))
    aim(rig, "thigh.L", (0.05, -phase, -1))
    aim(rig, "thigh.R", (-0.05, phase, -1))
    aim(rig, "foot.L", (0.05, -phase - 0.2, -0.8))
    aim(rig, "foot.R", (-0.05, phase, -1))


def pose_dead(rig):
    for bone in ("arm.L", "arm.R", "thigh.L", "thigh.R"):
        d = (RND.uniform(-1, 1), RND.uniform(-1, 1), RND.uniform(-0.6, 0.6))
        aim(rig, bone, d)
        child = {"arm.L": "hand.L", "arm.R": "hand.R", "thigh.L": "foot.L", "thigh.R": "foot.R"}[bone]
        aim(rig, child, (d[0] + RND.uniform(-0.4, 0.4), d[1] + RND.uniform(-0.4, 0.4), d[2]))


# ------------------------------------------------------------------ specs
WEAPON = {  # (muzzle z at rest)
    "pistol": -0.1, "smg": -0.45, "shotgun": -0.8, "hmg": -1.2,
}


def weapon_parts(b, kind):
    dark, acc = "#6F737C", "#F9E16C"
    x = -0.36
    if kind == "pistol":
        b.box("hand.R", (x, 0, 0.18), (0.13, 0.17, 0.55), dark)
        b.box("hand.R", (x, -0.1, 0.0), (0.06, 0.05, 0.1), dark)
        b.box("hand.R", (x, 0.12, 0.36), (0.1, 0.14, 0.2), acc)
    elif kind == "smg":
        b.box("hand.R", (x, 0, 0.02), (0.17, 0.21, 0.95), dark)
        b.box("hand.R", (x, 0.19, 0.1), (0.1, 0.12, 0.4), acc)
        b.cyl("hand.R", (x, 0, -0.5), 0.06, 0.14, dark, rot=(math.pi / 2, 0, 0))
        b.box("hand.R", (x, -0.12, 0.0), (0.06, 0.05, 0.3), dark)
    elif kind == "shotgun":
        b.box("hand.R", (x, 0, -0.15), (0.14, 0.18, 1.3), dark)
        b.box("hand.R", (x, 0.02, -0.35), (0.2, 0.3, 0.4), acc)
        b.box("hand.R", (x, 0.04, 0.58), (0.16, 0.2, 0.32), acc)
    elif kind == "hmg":
        b.box("hand.R", (x, 0, -0.2), (0.27, 0.31, 1.4), dark)
        b.cyl("hand.R", (x, 0.27, 0.1), 0.26, 0.3, acc, rot=(0, math.pi / 2, 0))
        b.cyl("hand.R", (x, 0, -1.0), 0.09, 0.5, dark)
        b.box("hand.R", (x, -0.18, -0.1), (0.1, 0.06, 0.5), dark)


def make_player_spec(kind, acc):
    def fn(b):
        K["spec_player"](b)
        if acc:
            K["acc_" + acc](b)
        weapon_parts(b, kind)
    return fn


def player_marker(m, r, x, y, col, PS):
    """Make player characters readable at a glance: coloured outline hull, glowing floor ring, floating arrow."""
    # inverted-hull outline (players only), emissive in the player colour
    om = emissive("outline_" + col.strip("#"), col, 3.0)
    om.use_backface_culling = True
    if os.environ.get("NOHULL"):
        hull = None
    else:
        hull = m.copy()
    if hull is not None:
        hull.data = m.data.copy()
        scene.collection.objects.link(hull)
        hull.parent = r
        for mod in hull.modifiers:
            if mod.type == "ARMATURE":
                mod.object = r
        sol = hull.modifiers.new("hull", "SOLIDIFY")
        sol.thickness = 0.05
        sol.offset = 1
        sol.use_flip_normals = True
        sol.use_rim = False
        # solidify must run before the armature modifier
        while hull.modifiers.find("hull") > 0:
            bpy.context.view_layer.objects.active = hull
            with bpy.context.temp_override(object=hull, active_object=hull):
                bpy.ops.object.modifier_move_up(modifier="hull")
        hull.data.materials.clear()
        hull.data.materials.append(om)
        for pg in hull.data.polygons:
            pg.material_index = 0
        hull.hide_render = False
        hull.hide_viewport = False
        hull.visible_shadow = False
    # floor ring + soft disc
    ringm = emissive("ring_" + col.strip("#"), col, 4.5)
    discm = emissive("disc_" + col.strip("#"), col, 0.8)
    bpy.ops.mesh.primitive_torus_add(major_radius=1.05, minor_radius=0.07, major_segments=24, minor_segments=4, location=(x, y, 0.04))
    bpy.context.active_object.data.materials.append(ringm)
    bpy.context.active_object.visible_shadow = False
    bpy.ops.mesh.primitive_cylinder_add(radius=1.0, depth=0.02, vertices=24, location=(x, y, 0.025))
    bpy.context.active_object.data.materials.append(discm)
    bpy.context.active_object.visible_shadow = False
    # floating arrow above the head
    bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=0.26, radius2=0.0, depth=0.5, location=(x, y, 1.5 * PS + 0.95), rotation=(math.pi, 0, 0))
    bpy.context.active_object.data.materials.append(emissive("arrow_" + col.strip("#"), col, 6.0))
    bpy.context.active_object.visible_shadow = False
    bpy.ops.object.light_add(type="POINT", location=(x - 0.3, y - 0.6, 3.6))
    K_ = bpy.context.active_object
    K_.data.energy = 420
    K_.data.color = lin("#FFF4E2")
    K_.data.shadow_soft_size = 0.8
    K_.data.use_shadow = False
    bpy.ops.object.light_add(type="POINT", location=(x, y, 1.0))
    L = bpy.context.active_object
    L.data.energy = 60
    L.data.color = lin(col)
    L.data.shadow_soft_size = 1.2


# ------------------------------------------------------------------ scene
def clear_or_new():
    global scene
    if bpy.app.background:
        for o in list(bpy.data.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        scene = bpy.context.scene
        return None
    old = bpy.context.window.scene
    scene = bpy.data.scenes.new("wrh_valheim")
    bpy.context.window.scene = scene
    return old


def configure_render():
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            pass
    scene.render.resolution_x, scene.render.resolution_y = W, H
    try:
        scene.eevee.taa_render_samples = SAMPLES
        scene.eevee.use_gtao = True
    except Exception:
        pass
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = 0.0
    w = bpy.data.worlds.new("wrh_world")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*lin("#E8D9C2"), 1)
    bg.inputs["Strength"].default_value = 0.5
    scene.world = w


def ground_and_props(mats):
    fixed, tint = mats

    def ground(b):
        b.box("root", (0, 4, -0.1), (70, 50, 0.2), "#E4E6ED")
        for _ in range(70):
            c = RND.choice(["#D9D2C5", "#EDE6DA", "#CFC7BA", "#E0D9CC", "#D3CCC0", "#E9E3D8"])
            r = RND.uniform(0.8, 3.2)
            b.cyl("root", (RND.uniform(-14, 14), RND.uniform(-6, 14), 0.004 + RND.uniform(0, 0.02)), r, 0.01, c, rot=(0, 0, RND.random() * 3), r2=r * RND.uniform(0.7, 1.0))
        for i in range(-7, 8):
            b.box("root", (i * 2, 4, 0.03), (0.04, 36, 0.01), "#C6BEAF")
        for j in range(-3, 10):
            b.box("root", (0, j * 2, 0.03), (32, 0.04, 0.01), "#C6BEAF")
    static("ground", ground, mats=mats)

    def walls(b):
        for k in range(-7, 8):  # back wall
            h = RND.uniform(1.6, 2.6) if abs(k) != 3 else 0.7
            b.box("root", (k * 2.05, 15.2, h / 2), (2.0, 1.2, h), RND.choice(["#C9C1B3", "#BDB5A6", "#D2CABC"]), rot=(0, 0, RND.uniform(-0.04, 0.04)))
            if h > 1.0:
                b.box("root", (k * 2.05 + RND.uniform(-0.3, 0.3), 15.2, h + 0.2), (1.3, 1.0, 0.4), "#B5AD9E")
        for k in range(0, 9):  # left wall
            h = RND.uniform(1.4, 2.4)
            b.box("root", (-14.6, k * 2.05 - 2.5, h / 2), (1.2, 2.0, h), RND.choice(["#C9C1B3", "#BDB5A6", "#D2CABC"]))
        for _ in range(26):  # rubble
            b.sphere("root", (RND.uniform(-14, 14), RND.uniform(-5, 14), 0.12), RND.uniform(0.1, 0.3), (1, 1, 0.7), RND.choice(["#A9A194", "#B8B0A2", "#9A9286"]), seg=6, rings=4)
    static("walls", walls, mats=mats)

    def crates(b):
        spots = [(-9.5, 6.5), (10.0, 8.0), (-12.0, -1.0), (11.5, -1.5), (-6.0, 12.0)]
        for (x, y) in spots:
            b.box("root", (x, y, 0.5), (1.4, 1.4, 1.0), "#D8D2C6", rot=(0, 0, RND.uniform(-0.3, 0.3)))
            b.box("root", (x + 0.35, y + 0.15, 1.28), (0.9, 0.9, 0.6), "#CFC8BB", rot=(0, 0, RND.uniform(-0.6, 0.6)))
            for z in (0.15, 0.85):
                b.box("root", (x, y, z), (1.46, 1.46, 0.08), "#9A8F7C", rot=(0, 0, 0))
        for (x, y) in ((-4.5, 13.0), (5.5, 13.5)):
            b.cyl("root", (x, y, 1.5), 0.7, 3.0, "#EEF0F4")
            b.cyl("root", (x, y, 3.05), 0.82, 0.18, "#D6D8DE")
            b.cyl("root", (x, y, 0.1), 0.85, 0.2, "#D6D8DE")
    static("crates", crates, mats=mats)

    def barrels(b):
        for (x, y) in ((4.8, 3.6), (-6.4, 2.6), (1.6, 8.4), (-1.4, 5.4), (8.2, 6.2)):
            b.cyl("root", (x, y, 0.55), 0.46, 1.1, "#FFC93C")
            b.cyl("root", (x, y, 0.55), 0.49, 0.2, "#2B2D33")
            b.cyl("root", (x, y, 0.9), 0.49, 0.1, "#2B2D33")
            b.cyl("root", (x, y, 0.18), 0.49, 0.1, "#2B2D33")
            b.cyl("root", (x, y, 1.12), 0.4, 0.06, "#FF9A3C")
    static("barrels", barrels, mats=mats)


def blood_and_gibs(mats):
    def blood(b):
        cols = ["#B31927", "#9A1220", "#C42233", "#A61626"]
        for _ in range(34):
            x, y = RND.uniform(-11, 11), RND.uniform(-4, 11)
            r = RND.uniform(0.35, 1.3)
            b.sphere("root", (x, y, 0.01), r, (1, RND.uniform(0.6, 1.3), 0.02), RND.choice(cols), seg=9, rings=3)
            for _ in range(RND.randint(2, 5)):
                b.sphere("root", (x + RND.uniform(-1.4, 1.4), y + RND.uniform(-1.4, 1.4), 0.012), RND.uniform(0.05, 0.2), (1, 1, 0.1), RND.choice(cols), seg=6, rings=3)
        for _ in range(120):
            b.sphere("root", (RND.uniform(-12, 12), RND.uniform(-5, 12), 0.014), RND.uniform(0.03, 0.12), (1, 1, 0.12), RND.choice(cols), seg=6, rings=3)
        for _ in range(26):  # blood in the air
            b.sphere("root", (RND.uniform(-8, 9), RND.uniform(0, 9), RND.uniform(0.9, 3.0)), RND.uniform(0.06, 0.16), (1, 1, 1), RND.choice(cols), seg=6, rings=4)
        for _ in range(16):  # streaks
            x, y = RND.uniform(-8, 9), RND.uniform(-1, 9)
            b.box("root", (x, y, 0.014), (RND.uniform(0.08, 0.2), RND.uniform(1.0, 2.6), 0.015), RND.choice(cols), rot=(0, 0, RND.uniform(0, 3.1)))
    static("blood", blood, mats=mats)

    def gibs(b):
        heads = ["#E1FDD3", "#FFDABC", "#D3C4E1"]
        bodies = ["#C4E5B3", "#F9B37C", "#AD95C4"]
        for _ in range(26):
            b.sphere("root", (RND.uniform(-9, 10), RND.uniform(-1, 10), RND.uniform(0.15, 2.0)), RND.uniform(0.12, 0.3), (1, 1, 1), RND.choice(heads), seg=7, rings=4)
        for _ in range(34):
            b.box("root", (RND.uniform(-9, 10), RND.uniform(-1, 10), RND.uniform(0.1, 1.9)), (RND.uniform(0.15, 0.4), RND.uniform(0.15, 0.4), RND.uniform(0.15, 0.4)), RND.choice(bodies),
                  rot=(RND.random() * 3, RND.random() * 3, RND.random() * 3))
        for _ in range(16):  # limbs
            b.cyl("root", (RND.uniform(-8, 9), RND.uniform(-1, 9), RND.uniform(0.12, 0.5)), 0.1, RND.uniform(0.3, 0.6), RND.choice(bodies), rot=(RND.random() * 3, RND.random() * 3, RND.random() * 3))
    static("gibs", gibs, mats=mats)


def place_characters(mats):
    fixed, tint = mats
    out = {"muzzles": [], "enemies_y": []}
    # players
    PS = 1.5
    players = [
        (-4.8, -3.4, 168, "pistol", "#1FA2FF", "bandana"),
        (-1.6, -3.9, 175, "smg", "#FF4F9A", "headphones"),
        (1.9, -3.8, 160, "shotgun", "#FFD21F", "helmet"),
        (5.0, -3.3, 152, "hmg", "#9A63FF", "goggles"),
    ]
    for (x, y, rzd, kind, col, acc) in players:
        tm = make_materials(col)[1]
        base = base_char("player_" + kind, make_player_spec(kind, acc), PS, 1.5, HIGH, (fixed, tm))
        m, r = clone(base, (x, y, 0), math.radians(rzd))
        pose_shoot(r)
        pb = r.pose.bones["hand.R"]
        dist = (0.5 - WEAPON[kind]) * PS
        wm = r.matrix_world @ pb.matrix
        muzzle = wm @ Vector((0, dist, 0))
        direction = (wm.to_3x3() @ Vector((0, 1, 0))).normalized()
        out["muzzles"].append((muzzle, direction, kind))
        player_marker(m, r, x, y, col, PS)
    # enemy templates (low detail, rigged)
    grunt = base_char("grunt", K["spec_grunt"], 1.35, 1.5, LOW, mats)
    runner = base_char("runner", K["spec_runner"], 1.05, 1.55, LOW, mats)
    tank = base_char("tank", K["spec_tank"], 2.5, 1.45, LOW, mats)
    expl = base_char("exploder", K["spec_exploder"], 1.3, 1.7, LOW, mats)
    spit = base_char("spitter", K["spec_spitter"], 1.35, 1.5, LOW, mats)
    shield = base_char("shielder", K["spec_shielder"], 1.5, 1.5, LOW, mats)
    spawn = base_char("spawner", K["spec_spawner"], 1.5, 1.5, LOW, mats)
    boss = base_char("boss_dev_grunt", K["spec_dev_grunt"], 3.0, 1.7, HIGH, mats)

    def many(base, pts, posefn, scale=1.0, face=180):
        for (x, y) in pts:
            m, r = clone(base, (x, y, 0), math.radians(face + RND.uniform(-35, 35)), scale)
            posefn(r)

    gpts = [(RND.uniform(-9, 9), RND.uniform(3.5, 10.5)) for _ in range(15)]
    many(grunt, gpts, lambda r: pose_zombie(r, lean=RND.uniform(0.1, 0.3), phase=RND.uniform(-0.45, 0.45)))
    rpts = [(RND.uniform(-8, 8), RND.uniform(-0.5, 5.2)) for _ in range(13)]
    many(runner, rpts, lambda r: pose_run(r, phase=RND.choice((-1, 1)) * RND.uniform(0.7, 1.1), lean=RND.uniform(0.3, 0.5)), face=180)
    many(tank, [(-5.0, 9.0), (3.2, 10.6)], lambda r: pose_zombie(r, lean=0.12, phase=0.2))
    many(expl, [(6.5, 4.8), (-7.0, 5.0)], lambda r: pose_run(r, 0.8, 0.3))
    many(spit, [(-2.0, 8.0)], lambda r: pose_zombie(r, lean=0.0, phase=0.0))
    many(shield, [(0.6, 7.0)], lambda r: pose_zombie(r, lean=0.1, phase=0.2))
    many(spawn, [(9.0, 9.5)], lambda r: pose_zombie(r, lean=0.05, phase=0.1))
    m, r = clone(boss, (0.5, 12.2, 0), math.radians(180))
    pose_zombie(r, lean=0.1, phase=0.2)
    # corpses
    cps = [(-7.5, 1.5), (-2.8, 1.2), (1.2, 0.4), (4.4, 1.8), (7.4, 0.6), (-4.6, 6.2), (2.4, 5.8), (-0.3, 2.9), (8.0, 3.0)]
    for (x, y) in cps:
        base = RND.choice((grunt, runner))
        m, r = clone(base, (x, y, 0.42), RND.uniform(0, 6.28))
        r.rotation_euler = (RND.choice((1.5, 1.6, -1.5)), RND.uniform(-0.2, 0.2), RND.uniform(0, 6.28))
        pose_dead(r)
    out["boss_pos"] = (0.5, 12.2)
    return out


def vfx(out, mats):
    fixed, tint = mats
    flash_y = emissive("flash_y", "#FFE27A", 14)
    flash_w = emissive("flash_w", "#FFF6D8", 22)
    trace = emissive("trace", "#FFF0A8", 14)
    spark = emissive("spark", "#FFC266", 12)
    casing = fixed
    for (pos, d, kind) in out["muzzles"]:
        q = Vector((0, 0, 1)).rotation_difference(d)
        for (rad, dep, mat_, off) in ((0.2, 0.7, flash_y, 0.38), (0.11, 0.9, flash_w, 0.5)):
            bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=rad, radius2=0.0, depth=dep, location=pos + d * off)
            c = bpy.context.active_object
            c.rotation_mode = "QUATERNION"
            c.rotation_quaternion = q
            c.data.materials.append(mat_)
            for pgon in c.data.polygons:
                pgon.use_smooth = False
        # side flash star
        for k in range(3):
            bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=0.07, radius2=0.0, depth=0.45, location=pos + d * 0.1)
            c = bpy.context.active_object
            c.rotation_mode = "QUATERNION"
            side = Vector((RND.uniform(-1, 1), RND.uniform(-1, 1), RND.uniform(-0.2, 0.6)))
            c.rotation_quaternion = Vector((0, 0, 1)).rotation_difference((d + side * 0.8).normalized())
            c.data.materials.append(flash_y)
        # tracer
        bpy.ops.mesh.primitive_cube_add(size=1, location=pos + d * 5.0)
        t = bpy.context.active_object
        t.scale = (0.03, 0.03, RND.uniform(1.5, 3.2))
        t.rotation_mode = "QUATERNION"
        t.rotation_quaternion = q
        t.location = pos + d * RND.uniform(2.5, 7.5)
        t.data.materials.append(trace)
        # casings
        for _ in range(4):
            bpy.ops.mesh.primitive_cube_add(size=1, location=pos + Vector((RND.uniform(-0.9, 0.9), RND.uniform(-0.2, 0.8), RND.uniform(0.2, 1.1))))
            cs = bpy.context.active_object
            cs.scale = (0.05, 0.05, 0.1)
            cs.rotation_euler = (RND.random() * 3, RND.random() * 3, RND.random() * 3)
            cs.data.materials.append(emissive("casing", "#E8B84B", 1.2))
        # point light for the flash
        bpy.ops.object.light_add(type="POINT", location=pos + d * 0.6)
        L = bpy.context.active_object
        L.data.energy = 220
        L.data.color = lin("#FFC060")
        L.data.shadow_soft_size = 0.4
    # explosion (right side)
    ex = Vector((8.6, 6.4, 1.1))
    core = emissive("core", "#FFE08A", 20)
    shell = emissive("shell", "#FFA040", 9)
    outer = emissive("outer", "#FF7A2A", 5)
    for (r_, m_, sc) in ((1.9, outer, (1, 1, 0.9)), (1.4, shell, (1, 1, 0.95)), (0.8, core, (1, 1, 1))):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r_, location=ex + Vector((0, 0, 0.2 * r_)))
        o = bpy.context.active_object
        o.scale = sc
        o.rotation_euler = (RND.random(), RND.random(), RND.random())
        o.data.materials.append(m_)
        for pgon in o.data.polygons:
            pgon.use_smooth = False
    scorch = static("scorch", lambda b: (b.sphere("root", (ex.x, ex.y, 0.012), 3.0, (1, 1, 0.01), "#4A3F36", seg=10, rings=3), b.sphere("root", (ex.x, ex.y, 0.016), 1.9, (1, 1, 0.01), "#2E2620", seg=10, rings=3)), mats=mats)
    smoke_m = mats[0]
    for k in range(10):
        a = RND.random() * 6.28
        rr = RND.uniform(0.6, 1.8)
        pos = ex + Vector((math.cos(a) * rr * 0.8, math.sin(a) * rr * 0.8, RND.uniform(1.8, 4.6)))
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=RND.uniform(0.5, 1.1), location=pos)
        o = bpy.context.active_object
        o.data.materials.append(smoke_m)
        o.data.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
        col = o.data.color_attributes["Col"]
        shade = RND.uniform(0.07, 0.17)
        for i in range(len(col.data)):
            col.data[i].color = (shade, shade * 0.95, shade * 0.9, 1)
        for pgon in o.data.polygons:
            pgon.use_smooth = False
    for k in range(34):  # sparks and debris
        a = RND.random() * 6.28
        rr = RND.uniform(1.2, 4.2)
        pos = ex + Vector((math.cos(a) * rr, math.sin(a) * rr, RND.uniform(0.4, 3.0)))
        bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
        o = bpy.context.active_object
        o.scale = (RND.uniform(0.05, 0.12), RND.uniform(0.05, 0.12), RND.uniform(0.1, 0.35))
        o.rotation_euler = (RND.random() * 3, RND.random() * 3, RND.random() * 3)
        o.data.materials.append(spark)
    bpy.ops.mesh.primitive_torus_add(major_radius=3.4, minor_radius=0.08, major_segments=24, minor_segments=4, location=(ex.x, ex.y, 0.05))
    ring = bpy.context.active_object
    ring.data.materials.append(emissive("ring", "#FFE08A", 4))
    bpy.ops.object.light_add(type="POINT", location=ex + Vector((0, -0.6, 1.6)))
    L = bpy.context.active_object
    L.data.energy = 3800
    L.data.color = lin("#FF9A4C")
    L.data.shadow_soft_size = 1.4
    # boss telegraph ring (yellow, hazard colour)
    bx, by = out["boss_pos"]
    hz = emissive("hazard", "#FFD400", 2.2)
    bpy.ops.mesh.primitive_torus_add(major_radius=3.6, minor_radius=0.12, major_segments=24, minor_segments=4, location=(bx, by - 3.4, 0.05))
    bpy.context.active_object.data.materials.append(hz)
    bpy.ops.mesh.primitive_torus_add(major_radius=1.9, minor_radius=0.1, major_segments=20, minor_segments=4, location=(bx, by - 3.4, 0.05))
    bpy.context.active_object.data.materials.append(hz)
    # spit blob from the spitter
    spit_m = emissive("spit", "#8FF06A", 3.0)
    for (x, y, z, r_) in ((-1.6, 5.6, 1.4, 0.26), (-1.1, 4.4, 1.2, 0.2), (-0.7, 3.4, 0.9, 0.16)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r_, location=(x, y, z))
        bpy.context.active_object.data.materials.append(spit_m)


def lights_and_camera():
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 10))
    sun = bpy.context.active_object
    sun.data.energy = 3.6
    sun.data.angle = math.radians(3)
    sun.data.color = lin("#FFD7A0")
    sun.rotation_euler = tuple(math.radians(a) for a in (38, 0, 55))
    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 23
    cam.rotation_euler = (math.radians(62), 0, math.radians(30))
    cam.location = Vector((1.2, 4.0, 0.5)) + cam.rotation_euler.to_matrix() @ Vector((0, 0, 40))
    cam.data.clip_end = 200
    scene.camera = cam


# ------------------------------------------------------------------ post pass (numpy)
def post(path_in, path_out):
    import numpy as np
    im = bpy.data.images.load(path_in)
    im.colorspace_settings.name = "Non-Color"
    h, w = im.size[1], im.size[0]
    px = np.empty(h * w * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    a = px.reshape(h, w, 4)
    rgb = a[..., :3].copy()

    def blur(x, r, passes=3):
        for _ in range(passes):
            for ax in (0, 1):
                c = np.cumsum(np.pad(x, [(r + 1, r) if i == ax else (0, 0) for i in range(3)], mode="edge"), axis=ax)
                n = 2 * r + 1
                x = (np.take(c, np.arange(n, c.shape[ax]), axis=ax) - np.take(c, np.arange(0, c.shape[ax] - n), axis=ax)) / n
        return x

    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    bright = np.clip((lum - 0.78) / 0.22, 0, 1)[..., None] * rgb
    bloom = blur(bright, max(6, w // 160), 3) * 0.9 + blur(bright, max(18, w // 60), 2) * 0.7
    out = rgb + bloom
    yy, xx = np.mgrid[0:h, 0:w]
    # screen y=0 is the bottom row in Blender pixel order
    top = yy / (h - 1)
    haze = (np.clip((top - 0.45) / 0.55, 0, 1) ** 1.6)[..., None] * np.array([1.0, 0.9, 0.78], dtype=np.float32) * 0.2
    out = out * (1 - haze * 0.6) + haze * 0.8
    cx, cy = (xx - w / 2) / (w / 2), (yy - h / 2) / (h / 2)
    vig = 1 - 0.38 * np.clip(cx ** 2 * 0.7 + cy ** 2, 0, 1.4) ** 1.2
    out = out * vig[..., None]
    out = out * np.array([1.04, 1.0, 0.94], dtype=np.float32)  # warm grade
    lm = out @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    out = lm[..., None] + (out - lm[..., None]) * 1.08  # saturation
    out = np.clip((out - 0.5) * 1.05 + 0.5, 0, 1)
    rng = np.random.default_rng(3)
    out = np.clip(out + (rng.random((h, w, 1)).astype(np.float32) - 0.5) * 0.018, 0, 1)
    a[..., :3] = out
    res = bpy.data.images.new("wrh_post", w, h, alpha=True)
    res.colorspace_settings.name = "Non-Color"
    res.pixels.foreach_set(a.ravel())
    res.filepath_raw = path_out
    res.file_format = "PNG"
    res.save()
    bpy.data.images.remove(res)
    bpy.data.images.remove(im)


def main():
    old = clear_or_new()
    try:
        configure_render()
        mats = make_materials()
        ground_and_props(mats)
        blood_and_gibs(mats)
        out = place_characters(mats)
        vfx(out, mats)
        lights_and_camera()
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        raw = OUT if not POST else OUT.replace(".png", "_raw.png")
        scene.render.filepath = raw
        scene.render.image_settings.file_format = "PNG"
        bpy.ops.render.render(write_still=True, scene=scene.name)
        if POST:
            post(raw, OUT)
        return {"raw": os.path.getsize(raw), "out": os.path.getsize(OUT)}
    finally:
        if old is not None:
            bpy.context.window.scene = old
            for o in list(scene.objects):
                bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.scenes.remove(scene)


RESULT = main()
print(RESULT)
