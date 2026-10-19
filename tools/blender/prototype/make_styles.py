import bpy, math, os, random
from mathutils import Vector

OUT = r"C:\blender_scenes\out"
STYLES = ["A_soft", "B_pbr", "C_cel"]
g = globals()
SEL = g.get("STYLE_LIST", STYLES)
SIZE = g.get("SIZE", (1280, 720))
SAMPLES = g.get("SAMPLES", 64)
os.makedirs(OUT, exist_ok=True)


def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


def mat(style, name, hexc, rough=0.5, metal=0.0, fabric=False, rim=0.0):
    col = lin(hexc)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    if style == "C_cel":
        diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
        diff.inputs["Color"].default_value = (*col, 1)
        s2r = nt.nodes.new("ShaderNodeShaderToRGB")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.interpolation = "CONSTANT"
        ramp.color_ramp.elements[0].position = 0.0
        ramp.color_ramp.elements[0].color = (0.55, 0.55, 0.62, 1)
        e = ramp.color_ramp.elements.new(0.32)
        e.color = (0.85, 0.85, 0.9, 1)
        e2 = ramp.color_ramp.elements.new(0.62)
        e2.color = (1, 1, 1, 1)
        bw = nt.nodes.new("ShaderNodeRGBToBW")
        mulc = nt.nodes.new("ShaderNodeMix")
        mulc.data_type = "RGBA"
        mulc.blend_type = "MULTIPLY"
        mulc.inputs[0].default_value = 1.0
        mulc.inputs[6].default_value = (*col, 1)
        emi = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(diff.outputs["BSDF"], s2r.inputs["Shader"])
        nt.links.new(s2r.outputs["Color"], bw.inputs["Color"])
        nt.links.new(bw.outputs["Val"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], mulc.inputs[7])
        nt.links.new(mulc.outputs[2], emi.inputs["Color"])
        nt.links.new(emi.outputs["Emission"], out.inputs["Surface"])
        return m
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*col, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    final = bsdf.outputs["BSDF"]
    if style == "B_pbr" and fabric:
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 90
        noise.inputs["Detail"].default_value = 8
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.35
        nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    if style == "A_soft" and rim > 0:
        lw = nt.nodes.new("ShaderNodeLayerWeight")
        lw.inputs["Blend"].default_value = 0.5
        emi = nt.nodes.new("ShaderNodeEmission")
        emi.inputs["Color"].default_value = (min(1, col[0] * 1.6 + 0.15), min(1, col[1] * 1.6 + 0.15), min(1, col[2] * 1.6 + 0.15), 1)
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = rim * 1.4
        add = nt.nodes.new("ShaderNodeAddShader")
        nt.links.new(lw.outputs["Fresnel"], mul.inputs[0])
        nt.links.new(mul.outputs[0], emi.inputs["Strength"])
        nt.links.new(bsdf.outputs["BSDF"], add.inputs[0])
        nt.links.new(emi.outputs["Emission"], add.inputs[1])
        final = add.outputs["Shader"]
    nt.links.new(final, out.inputs["Surface"])
    return m


def outline_mat(style):
    m = bpy.data.materials.new("outline")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emi = nt.nodes.new("ShaderNodeEmission")
    emi.inputs["Color"].default_value = (0.1, 0.11, 0.15, 1) if style == "C_cel" else (0.22, 0.24, 0.3, 1)
    nt.links.new(emi.outputs["Emission"], out.inputs["Surface"])
    m.use_backface_culling = True
    return m


def link(o, coll):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    coll.objects.link(o)


def add(coll, style, mt, kind, loc, scale=(1, 1, 1), rot=(0, 0, 0), outline=None, size=1.0, **kw):
    if kind == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=size, location=loc, rotation=rot)
    elif kind == "box":
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    elif kind == "cyl":
        bpy.ops.mesh.primitive_cylinder_add(radius=size, depth=kw.get("depth", 1), vertices=24, location=loc, rotation=rot)
    elif kind == "torus":
        bpy.ops.mesh.primitive_torus_add(major_radius=size, minor_radius=kw.get("minor", 0.06), major_segments=40, minor_segments=14, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = scale
    for p in o.data.polygons:
        p.use_smooth = True
    o.data.materials.append(mt)
    if outline is not None and style != "B_pbr":
        o.data.materials.append(outline)
        md = o.modifiers.new("ol", "SOLIDIFY")
        md.thickness = 0.03 if style == "C_cel" else 0.014
        md.offset = 1
        md.use_flip_normals = True
        md.material_offset = 1
    link(o, coll)
    return o


def character(coll, style, loc, rz, vest_hex, head_hex, kind=None, tilt=0, sc=1.35, accessory=None, ol=None, slim=1.0, head_k=1.0, gunmats=None):
    x, y, z = loc
    vest = mat(style, "vest", vest_hex, 0.8, fabric=True, rim=0.5)
    head = mat(style, "head", head_hex, 0.35, rim=0.6)
    dark = mat(style, "dark", "#61656F", 0.7, fabric=True, rim=0.3)
    glove = mat(style, "glove", "#3F3F45", 0.6)
    parts = [
        add(coll, style, head, "sphere", (x, y, z + 1.05), (1, 1, 0.95), outline=ol, size=0.46 * head_k),
        add(coll, style, vest, "sphere", (x, y, z + 0.5), (slim, 0.85 * slim, 1.15), outline=ol, size=0.34),
        add(coll, style, dark, "sphere", (x, y, z + 0.62), (1.02 * slim, 0.9 * slim, 0.55), outline=ol, size=0.37),
    ]
    for s in (-1, 1):
        parts.append(add(coll, style, dark, "sphere", (x + s * 0.2, y, z + 0.14), (1, 1.3, 1), outline=ol, size=0.13))
        parts.append(add(coll, style, glove, "sphere", (x + s * 0.34, y - (0.5 if kind else 0.12), z + (0.62 if kind else 0.52)), outline=ol, size=0.1))
        if kind:
            parts.append(add(coll, style, vest, "sphere", (x + s * 0.3, y - 0.22, z + 0.58), (1, 2.2, 1), outline=ol, size=0.1))
    if accessory == "bandana":
        am = mat(style, "bandana", vest_hex, 0.7, fabric=True)
        parts.append(add(coll, style, am, "torus", (x, y, z + 1.19), (1, 1, 1), size=0.44, minor=0.055, outline=ol))
        parts.append(add(coll, style, am, "box", (x + 0.2, y + 0.38, z + 1.17), (0.16, 0.05, 0.22), (0.3, 0.2, 0.5), outline=ol))
    if accessory == "headphones":
        am = mat(style, "phones", "#2B2D33", 0.4, metal=0.2)
        for s in (-1, 1):
            parts.append(add(coll, style, am, "cyl", (x + s * 0.47, y, z + 1.05), rot=(0, math.pi / 2, 0), size=0.17, depth=0.12, outline=ol))
        parts.append(add(coll, style, am, "torus", (x, y, z + 1.05), (1, 0.4, 1), rot=(math.pi / 2, 0, 0), size=0.47, minor=0.03, outline=ol))
    if kind and gunmats:
        gd, ga = gunmats
        if kind == "pistol":
            parts += [add(coll, style, gd, "box", (x, y - 0.62, z + 0.66), (0.16, 0.5, 0.2), outline=ol), add(coll, style, ga, "box", (x, y - 0.5, z + 0.52), (0.14, 0.16, 0.3), outline=ol)]
        elif kind == "smg":
            parts += [add(coll, style, gd, "box", (x, y - 0.8, z + 0.66), (0.2, 0.95, 0.24), outline=ol), add(coll, style, ga, "box", (x, y - 0.65, z + 0.42), (0.12, 0.14, 0.4), outline=ol), add(coll, style, gd, "cyl", (x, y - 1.35, z + 0.68), rot=(math.pi / 2, 0, 0), size=0.06, depth=0.3, outline=ol)]
    e = bpy.data.objects.new("grp", None)
    coll.objects.link(e)
    e.location = (x, y, z)
    from mathutils import Matrix
    for p in parts:
        p.parent = e
        p.matrix_parent_inverse = Matrix.Translation(-Vector(e.location))
    e.rotation_euler = (tilt, 0, rz)
    e.scale = (sc, sc, sc)


def build(style):
    if bpy.context.window:
        scn = bpy.data.scenes.new("wrh_" + style)
        bpy.context.window.scene = scn
    else:
        scn = bpy.context.scene
        for o in list(bpy.data.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    coll = bpy.data.collections.new("wrh_" + style)
    scn.collection.children.link(coll)
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scn.render.engine = eng
            break
        except TypeError:
            pass
    scn.render.resolution_x, scn.render.resolution_y = SIZE
    try:
        scn.eevee.taa_render_samples = SAMPLES
    except Exception:
        pass
    scn.view_settings.view_transform = "Standard"
    scn.view_settings.exposure = -0.15
    w = bpy.data.worlds.new("w_" + style)
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*lin("#E1E3EA"), 1)
    bg.inputs["Strength"].default_value = 0.5 if style != "C_cel" else 0.3
    scn.world = w
    ol = outline_mat(style)

    floor = mat(style, "floor", "#E4E6ED", 0.9)
    add(coll, style, floor, "box", (0, 0, -0.05), (40, 40, 0.1))
    blood = mat(style, "blood", "#B31927", 0.25)
    random.seed(3)
    for _ in range(9):
        r = random.uniform(0.25, 0.8)
        add(coll, style, blood, "sphere", (random.uniform(-3.5, 3.5), random.uniform(-2.5, 3.5), 0.01), (1, random.uniform(0.6, 1.2), 0.012), size=r)
    for _ in range(14):
        add(coll, style, blood, "sphere", (random.uniform(-4, 4), random.uniform(-3, 4), 0.02), (1, 1, 0.1), size=random.uniform(0.04, 0.12))

    gd = mat(style, "gundark", "#6F737C", 0.4, metal=0.85 if style == "B_pbr" else 0.0)
    ga = mat(style, "gunacc", "#F9E16C", 0.35, rim=0.2)
    character(coll, style, (-1.6, -0.8, 0), math.radians(160), "#6CC4F9", "#FDFDFD", kind="pistol", accessory="bandana", ol=ol, gunmats=(gd, ga))
    character(coll, style, (0.9, -1.2, 0), math.radians(150), "#F995B3", "#FDFDFD", kind="smg", accessory="headphones", ol=ol, gunmats=(gd, ga))
    character(coll, style, (-0.3, 2.0, 0), math.radians(10), "#C4E5B3", "#E1FDD3", ol=ol)
    character(coll, style, (2.1, 1.5, 0), math.radians(-15), "#F9B37C", "#FFDABC", tilt=0.45, sc=1.1, head_k=1.15, slim=0.8, ol=ol)
    character(coll, style, (-2.4, 2.2, 0.4), math.radians(40), "#C4E5B3", "#E1FDD3", tilt=1.45, ol=ol)

    bpy.ops.object.light_add(type="SUN", location=(0, 0, 10))
    sun = bpy.context.active_object
    sun.data.energy = 2.4
    sun.data.angle = math.radians(6)
    sun.data.color = lin("#FFFCF6")
    sun.rotation_euler = tuple(math.radians(a) for a in (52, 0, 35))
    link(sun, coll)
    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 7.2
    cam.rotation_euler = (math.radians(62), 0, math.radians(30))
    cam.location = Vector((0.1, 0.5, 0.9)) + cam.rotation_euler.to_matrix() @ Vector((0, 0, 22))
    link(cam, coll)
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
    old = bpy.context.window.scene if bpy.context.window else None
    res = {}
    for st in SEL:
        scn, coll = build(st)
        try:
            path = os.path.join(OUT, "style_" + st + ".png")
            scn.render.filepath = path
            scn.render.image_settings.file_format = "PNG"
            bpy.ops.render.render(write_still=True, scene=scn.name)
            res[st] = os.path.getsize(path) if os.path.exists(path) else -1
        finally:
            if old:
                bpy.context.window.scene = old
            cleanup(scn, coll)
    return res


RESULT = run()
print(RESULT)
