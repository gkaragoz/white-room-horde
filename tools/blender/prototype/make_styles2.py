import bpy, math, os, random
from mathutils import Vector

OUT = r"C:\blender_scenes\out"
STYLES = os.environ.get("STYLES", "D_clay,E_paper,G_vinyl,H_ink,I_plush,J_valheim,K_badnorth").split(",")
g = globals()
SEL = g.get("STYLE_LIST", STYLES)
SIZE = g.get("SIZE", (1280, 720))
SAMPLES = g.get("SAMPLES", 64)
os.makedirs(OUT, exist_ok=True)


def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


def setin(node, name, val):
    try:
        node.inputs[name].default_value = val
    except Exception:
        pass


def noise_bump(nt, bsdf, scale, detail, strength, distortion=0.0):
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    try:
        n.inputs["Distortion"].default_value = distortion
    except Exception:
        pass
    bp = nt.nodes.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = strength
    nt.links.new(n.outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], bsdf.inputs["Normal"])
    return n


def mat(style, name, hexc, rough=0.5, metal=0.0, fabric=False, rim=0.0):
    col = lin(hexc)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    if style == "L_hifirush":
        c2 = [min(1.0, max(0.0, 0.5 + (x - 0.5) * 1.0)) for x in col]
        diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
        diff.inputs["Color"].default_value = (1, 1, 1, 1)
        s2r = nt.nodes.new("ShaderNodeShaderToRGB")
        bw = nt.nodes.new("ShaderNodeRGBToBW")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.interpolation = "CONSTANT"
        ramp.color_ramp.elements[0].position = 0.0
        ramp.color_ramp.elements[0].color = (0.58, 0.5, 0.85, 1)
        ea = ramp.color_ramp.elements.new(0.34)
        ea.color = (0.88, 0.88, 1.0, 1)
        eb = ramp.color_ramp.elements.new(0.7)
        eb.color = (1.02, 1.0, 0.95, 1)
        hs = nt.nodes.new("ShaderNodeHueSaturation")
        hs.inputs["Saturation"].default_value = 1.0 if name in ("floor",) else 1.3
        hs.inputs["Color"].default_value = (*col, 1)
        mulc = nt.nodes.new("ShaderNodeMix")
        mulc.data_type = "RGBA"
        mulc.blend_type = "MULTIPLY"
        mulc.inputs[0].default_value = 1.0
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (55, 55, 55)
        mp.inputs["Rotation"].default_value = (0, 0, math.radians(45))
        vo = nt.nodes.new("ShaderNodeTexVoronoi")
        vo.feature = "F1"
        dots = nt.nodes.new("ShaderNodeMath")
        dots.operation = "LESS_THAN"
        dots.inputs[1].default_value = 0.33
        shadowm = nt.nodes.new("ShaderNodeMath")
        shadowm.operation = "LESS_THAN"
        shadowm.inputs[1].default_value = 0.22
        both = nt.nodes.new("ShaderNodeMath")
        both.operation = "MULTIPLY"
        dmix = nt.nodes.new("ShaderNodeMix")
        dmix.data_type = "RGBA"
        dmix.inputs[7].default_value = (0.3, 0.2, 0.6, 1)
        emi = nt.nodes.new("ShaderNodeEmission")
        lw = nt.nodes.new("ShaderNodeLayerWeight")
        lw.inputs["Blend"].default_value = 0.45
        remi = nt.nodes.new("ShaderNodeEmission")
        remi.inputs["Color"].default_value = (0.1, 0.95, 1.0, 1)
        rmul = nt.nodes.new("ShaderNodeMath")
        rmul.operation = "MULTIPLY"
        rmul.inputs[1].default_value = 0.0 if name in ("floor", "blood") else 1.2
        addn = nt.nodes.new("ShaderNodeAddShader")
        nt.links.new(diff.outputs["BSDF"], s2r.inputs["Shader"])
        nt.links.new(s2r.outputs["Color"], bw.inputs["Color"])
        nt.links.new(bw.outputs["Val"], ramp.inputs["Fac"])
        nt.links.new(hs.outputs["Color"], mulc.inputs[6])
        nt.links.new(ramp.outputs["Color"], mulc.inputs[7])
        nt.links.new(tc.outputs["Window"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], vo.inputs["Vector"])
        nt.links.new(vo.outputs["Distance"], dots.inputs[0])
        nt.links.new(bw.outputs["Val"], shadowm.inputs[0])
        nt.links.new(dots.outputs[0], both.inputs[0])
        nt.links.new(shadowm.outputs[0], both.inputs[1])
        nt.links.new(both.outputs[0], dmix.inputs[0])
        nt.links.new(mulc.outputs[2], dmix.inputs[6])
        nt.links.new(dmix.outputs[2], emi.inputs["Color"])
        nt.links.new(lw.outputs["Fresnel"], rmul.inputs[0])
        nt.links.new(rmul.outputs[0], remi.inputs["Strength"])
        nt.links.new(emi.outputs["Emission"], addn.inputs[0])
        nt.links.new(remi.outputs["Emission"], addn.inputs[1])
        nt.links.new(addn.outputs["Shader"], out.inputs["Surface"])
        return m
    if style == "H_ink":
        diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
        diff.inputs["Color"].default_value = (*col, 1)
        s2r = nt.nodes.new("ShaderNodeShaderToRGB")
        bw = nt.nodes.new("ShaderNodeRGBToBW")
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (70, 70, 70)
        mp.inputs["Rotation"].default_value = (0, 0, math.radians(30))
        vo = nt.nodes.new("ShaderNodeTexVoronoi")
        vo.feature = "F1"
        sub = nt.nodes.new("ShaderNodeMath")
        sub.operation = "SUBTRACT"
        sub.inputs[0].default_value = 1.0
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = 0.62
        lt = nt.nodes.new("ShaderNodeMath")
        lt.operation = "LESS_THAN"
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.inputs[6].default_value = (*col, 1)
        mix.inputs[7].default_value = (col[0] * 0.38, col[1] * 0.38, col[2] * 0.42, 1)
        emi = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(diff.outputs["BSDF"], s2r.inputs["Shader"])
        nt.links.new(s2r.outputs["Color"], bw.inputs["Color"])
        nt.links.new(bw.outputs["Val"], sub.inputs[1])
        nt.links.new(sub.outputs[0], mul.inputs[0])
        nt.links.new(tc.outputs["Window"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], vo.inputs["Vector"])
        nt.links.new(vo.outputs["Distance"], lt.inputs[0])
        nt.links.new(mul.outputs[0], lt.inputs[1])
        nt.links.new(lt.outputs[0], mix.inputs[0])
        nt.links.new(mix.outputs[2], emi.inputs["Color"])
        nt.links.new(emi.outputs["Emission"], out.inputs["Surface"])
        return m
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*col, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    final = bsdf.outputs["BSDF"]
    if style == "D_clay":
        bsdf.inputs["Roughness"].default_value = 0.88
        setin(bsdf, "Subsurface Weight", 0.25)
        setin(bsdf, "Subsurface Radius", (0.3, 0.12, 0.08))
        setin(bsdf, "Specular IOR Level", 0.2)
        noise_bump(nt, bsdf, 9, 5, 1.6, 1.2)
        nv = nt.nodes.new("ShaderNodeTexNoise")
        nv.inputs["Scale"].default_value = 6
        nv.inputs["Detail"].default_value = 3
        mx = nt.nodes.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        mx.blend_type = "MULTIPLY"
        mx.inputs[0].default_value = 0.35
        mx.inputs[7].default_value = (0.82, 0.8, 0.78, 1)
        nt.links.new(nv.outputs["Fac"], mx.inputs[0])
        mx.inputs[6].default_value = (*col, 1)
        nt.links.remove(bsdf.inputs["Base Color"].links[0]) if bsdf.inputs["Base Color"].links else None
        nt.links.new(mx.outputs[2], bsdf.inputs["Base Color"])
    elif style == "E_paper":
        bsdf.inputs["Roughness"].default_value = 1.0
        setin(bsdf, "Specular IOR Level", 0.0)
        noise_bump(nt, bsdf, 260, 14, 0.25)
    elif style == "G_vinyl":
        bsdf.inputs["Roughness"].default_value = 0.2
        setin(bsdf, "Coat Weight", 1.0)
        setin(bsdf, "Coat Roughness", 0.04)
        setin(bsdf, "Subsurface Weight", 0.12)
        setin(bsdf, "Specular IOR Level", 0.7)
    elif style == "I_plush":
        bsdf.inputs["Roughness"].default_value = 1.0
        setin(bsdf, "Specular IOR Level", 0.0)
        setin(bsdf, "Sheen Weight", 1.0)
        setin(bsdf, "Sheen Roughness", 0.35)
        setin(bsdf, "Sheen Tint", (min(1, col[0] * 1.5 + 0.2), min(1, col[1] * 1.5 + 0.2), min(1, col[2] * 1.5 + 0.2), 1))
        noise_bump(nt, bsdf, 140, 4, 3.0)
        lw = nt.nodes.new("ShaderNodeLayerWeight")
        lw.inputs["Blend"].default_value = 0.45
        emi = nt.nodes.new("ShaderNodeEmission")
        emi.inputs["Color"].default_value = (min(1, col[0] * 1.4 + 0.2), min(1, col[1] * 1.4 + 0.2), min(1, col[2] * 1.4 + 0.2), 1)
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = 1.1
        add = nt.nodes.new("ShaderNodeAddShader")
        nt.links.new(lw.outputs["Fresnel"], mul.inputs[0])
        nt.links.new(mul.outputs[0], emi.inputs["Strength"])
        nt.links.new(bsdf.outputs["BSDF"], add.inputs[0])
        nt.links.new(emi.outputs["Emission"], add.inputs[1])
        final = add.outputs["Shader"]
    elif style == "J_valheim":
        bsdf.inputs["Roughness"].default_value = 0.95
        setin(bsdf, "Specular IOR Level", 0.05)
        n = nt.nodes.new("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = 7
        n.inputs["Detail"].default_value = 2
        rp = nt.nodes.new("ShaderNodeValToRGB")
        rp.color_ramp.interpolation = "CONSTANT"
        rp.color_ramp.elements[0].position = 0.0
        rp.color_ramp.elements[0].color = (0.72, 0.7, 0.68, 1)
        e1 = rp.color_ramp.elements.new(0.4)
        e1.color = (0.9, 0.88, 0.86, 1)
        e2 = rp.color_ramp.elements.new(0.65)
        e2.color = (1.08, 1.05, 1.0, 1)
        mx = nt.nodes.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        mx.blend_type = "MULTIPLY"
        mx.inputs[0].default_value = 1.0
        mx.inputs[6].default_value = (*col, 1)
        nt.links.new(n.outputs["Fac"], rp.inputs["Fac"])
        nt.links.new(rp.outputs["Color"], mx.inputs[7])
        nt.links.remove(bsdf.inputs["Base Color"].links[0]) if bsdf.inputs["Base Color"].links else None
        nt.links.new(mx.outputs[2], bsdf.inputs["Base Color"])
    elif style == "K_badnorth":
        bsdf.inputs["Roughness"].default_value = 1.0
        setin(bsdf, "Specular IOR Level", 0.0)
    nt.links.new(final, out.inputs["Surface"])
    return m


OUTLINE = {"L_hifirush": ((0.02, 0.02, 0.08, 1), 0.045), "E_paper": ((0.98, 0.98, 0.99, 1), 0.022), "H_ink": ((0.07, 0.07, 0.1, 1), 0.04)}


def outline_mat(style):
    if style not in OUTLINE:
        return None
    m = bpy.data.materials.new("outline")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emi = nt.nodes.new("ShaderNodeEmission")
    emi.inputs["Color"].default_value = OUTLINE[style][0]
    nt.links.new(emi.outputs["Emission"], out.inputs["Surface"])
    m.use_backface_culling = True
    return m


def link(o, coll):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    coll.objects.link(o)


LOWPOLY = {"J_valheim": (10, 6, 10, 12, 6), "K_badnorth": (7, 4, 6, 8, 4)}


def add(coll, style, mt, kind, loc, scale=(1, 1, 1), rot=(0, 0, 0), outline=None, size=1.0, **kw):
    seg, ring, cyl_v, tor_a, tor_b = LOWPOLY.get(style, (32, 16, 24, 40, 14))
    if kind == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, radius=size, location=loc, rotation=rot)
    elif kind == "box":
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    elif kind == "cyl":
        bpy.ops.mesh.primitive_cylinder_add(radius=size, depth=kw.get("depth", 1), vertices=cyl_v, location=loc, rotation=rot)
    elif kind == "torus":
        bpy.ops.mesh.primitive_torus_add(major_radius=size, minor_radius=kw.get("minor", 0.06), major_segments=tor_a, minor_segments=tor_b, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = scale
    for p in o.data.polygons:
        p.use_smooth = style not in LOWPOLY
    o.data.materials.append(mt)
    if outline is not None and style in OUTLINE:
        o.data.materials.append(outline)
        md = o.modifiers.new("ol", "SOLIDIFY")
        md.thickness = OUTLINE[style][1]
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
    if style == "J_valheim":
        scn.view_settings.view_transform = "AgX"
        scn.view_settings.exposure = 0.1
    w = bpy.data.worlds.new("w_" + style)
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*lin("#E1E3EA"), 1)
    bg.inputs["Strength"].default_value = {"H_ink": 0.9, "E_paper": 0.7, "G_vinyl": 0.35, "J_valheim": 0.55, "K_badnorth": 0.38, "L_hifirush": 0.5}.get(style, 0.5)
    if style == "L_hifirush":
        bg.inputs["Color"].default_value = (*lin("#E6EAF5"), 1)
    if style == "J_valheim":
        bg.inputs["Color"].default_value = (*lin("#E8D9C2"), 1)
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

    gd = mat(style, "gundark", "#6F737C", 0.4, metal=0.0)
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
    if style == "J_valheim":
        sun.data.color = lin("#FFD7A0")
        sun.data.energy = 3.6
        sun.data.angle = math.radians(3)
        sun.rotation_euler = tuple(math.radians(a) for a in (38, 0, 55))
    if style == "L_hifirush":
        sun.data.color = lin("#FFF0B8")
        sun.data.energy = 3.4
        sun.rotation_euler = tuple(math.radians(a) for a in (50, 0, 40))
    if style == "K_badnorth":
        sun.data.energy = 3.2
        sun.data.angle = math.radians(0.5)
        sun.rotation_euler = tuple(math.radians(a) for a in (46, 0, 50))
    link(sun, coll)
    if style == "G_vinyl":
        for loc, rot in (((-6, -4, 6), (0.9, 0, -0.5)), ((7, 2, 5), (1.0, 0, 1.9))):
            bpy.ops.object.light_add(type="AREA", location=loc)
            al = bpy.context.active_object
            al.data.shape = "RECTANGLE"
            al.data.size = 5
            al.data.size_y = 3
            al.data.energy = 900
            al.rotation_euler = rot
            link(al, coll)
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
            path = os.path.join(OUT, "style2_" + st + ".png")
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
