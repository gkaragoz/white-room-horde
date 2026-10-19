"""Retarget Mixamo FBX animations onto the 12-bone chibi rig and export animation-library GLBs.

Run headless:
  blender -b --factory-startup --python tools/blender/retarget_mixamo.py
  SELFTEST=1 blender -b --factory-startup --python tools/blender/retarget_mixamo.py   (no FBX needed)

Inputs : FBX files in ./mixamo/ and ./assets-src/mixamo/ named either <id>.fbx or the original Mixamo name (e.g. "Shoot Rifle.fbx"),
         plus every sub-folder of those (the extracted Rifle 8-Way pack). Names shared by two manifest clips must be renamed to <id>.fbx.
Outputs: packages/client/public/models/anims/{player,enemy}_anims.glb and anims.meta.json

Method (works for any proportions and for T-pose -> chibi rest-pose differences):
  - limbs (arm, hand, thigh, foot): *direction* retarget, each target bone's Y axis is aimed along the source bone's
    head->tail direction in world space.
  - hips, spine, head: world-space rotation delta relative to each rig's own rest pose (both are upright).
  - hips translation: vertical bob only, scaled by hips-height ratio (in place). Authored at rig scale 1.0, the client
    multiplies translation tracks by the character scale.
"""
import bpy, os, sys, re, json, math
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/retarget_mixamo.py")))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC_DIRS = [os.environ["MIXAMO_DIR"]] if os.environ.get("MIXAMO_DIR") else [os.path.join(REPO, "mixamo"), os.path.join(REPO, "assets-src", "mixamo")]
OUT_DIR = os.environ.get("OUT_DIR") or os.path.join(REPO, "packages", "client", "public", "models", "anims")
MANIFEST = os.path.join(REPO, "tools", "mixamo", "manifest.json")
SELFTEST = os.environ.get("SELFTEST") == "1"
FPS = 30

kit_path = os.path.join(HERE, "make_chibi.py")
K = {"__name__": "kit", "__file__": kit_path, "NO_RUN": True}
exec(compile(open(kit_path, encoding="utf-8").read(), kit_path, "exec"), K)
build_armature = K["build_armature"]

LIMBS = {  # target bone -> (source head bone, source tail bone)
    "arm.L": ("LeftArm", "LeftForeArm"), "hand.L": ("LeftForeArm", "LeftHand"),
    "arm.R": ("RightArm", "RightForeArm"), "hand.R": ("RightForeArm", "RightHand"),
    "thigh.L": ("LeftUpLeg", "LeftLeg"), "foot.L": ("LeftLeg", "LeftFoot"),
    "thigh.R": ("RightUpLeg", "RightLeg"), "foot.R": ("RightLeg", "RightFoot"),
}
ROTS = {"hips": "Hips", "spine": "Spine1", "head": "Head"}
ORDER = ["hips", "spine", "head", "arm.L", "hand.L", "arm.R", "hand.R", "thigh.L", "foot.L", "thigh.R", "foot.R"]

# Rifle 8-Way pack clips keep their own slugified file names (idle, idle_aiming, walk_forward_left, run_backward, sprint_left, jump_loop, death_from_front, ...)


def short(n):
    return n.split(":")[-1]


def slug(n):
    return re.sub(r"[^a-z0-9]+", "_", n.lower()).strip("_")


class Src:
    """Wraps an imported Mixamo armature."""

    def __init__(self, rig):
        self.rig = rig
        self.pb = {short(p.name): p for p in rig.pose.bones}
        self.rest = {short(b.name): b for b in rig.data.bones}
        M = rig.matrix_world
        self.flip = Matrix.Identity(3)
        f = self._forward()
        if f.y > 0:  # character faces +Y, we need -Y
            self.flip = Matrix.Rotation(math.pi, 3, "Z")
        h0 = self.rest["Hips"]
        self.hips_rest = self.flip @ (M @ h0.head_local)
        self.k = None

    def _forward(self):
        M = self.rig.matrix_world
        a = M @ self.rest["LeftFoot"].head_local
        t = self.rest.get("LeftToeBase")
        b = (M @ t.head_local) if t else (M @ self.rest["LeftFoot"].tail_local)
        d = b - a
        d.z = 0
        return d.normalized() if d.length > 1e-6 else Vector((0, -1, 0))

    def pos(self, name):
        return self.flip @ (self.rig.matrix_world @ self.pb[name].head)

    def rot(self, name):
        M3 = self.rig.matrix_world.to_3x3()
        R = M3 @ self.pb[name].matrix.to_3x3()
        return self.flip @ R @ self.flip.inverted()

    def rest_rot(self, name):
        M3 = self.rig.matrix_world.to_3x3()
        R = M3 @ self.rest[name].matrix_local.to_3x3()
        return self.flip @ R @ self.flip.inverted()


def aim(rig, bone, direction):
    pb = rig.pose.bones[bone]
    cur = pb.matrix.copy()
    d = Vector(direction).normalized()
    ya = (cur.to_3x3() @ Vector((0, 1, 0))).normalized()
    q = ya.rotation_difference(d)
    m3 = q.to_matrix() @ cur.to_3x3()
    pb.matrix = Matrix.Translation(cur.translation) @ m3.to_4x4()
    bpy.context.view_layer.update()


def set_rot(rig, bone, R3, loc=None):
    pb = rig.pose.bones[bone]
    t = loc if loc is not None else pb.matrix.translation
    pb.matrix = Matrix.Translation(t) @ R3.to_4x4()
    bpy.context.view_layer.update()


def retarget_action(src, tgt, name, f0, f1, in_place=True):
    scene = bpy.context.scene
    tgt.animation_data_create()
    act = bpy.data.actions.new(name)
    tgt.animation_data.action = act
    for pb in tgt.pose.bones:
        pb.rotation_mode = "QUATERNION"
    rest_t = {b.name: b.matrix_local.to_3x3() for b in tgt.data.bones}
    hips_rest_t = tgt.data.bones["hips"].head_local.copy()
    k = hips_rest_t.z / max(1e-6, src.hips_rest.z)
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        bpy.context.view_layer.update()
        d_hips = (src.pos("Hips") - src.hips_rest) * k
        for bone in ORDER:
            if bone in ROTS:
                sn = ROTS[bone]
                delta = src.rot(sn) @ src.rest_rot(sn).inverted()
                R = delta @ rest_t[bone]
                if bone == "hips":
                    loc = hips_rest_t + Vector((0 if in_place else d_hips.x, 0 if in_place else d_hips.y, d_hips.z))
                    set_rot(tgt, bone, R, loc)
                else:
                    set_rot(tgt, bone, R)
            else:
                a, b = LIMBS[bone]
                aim(tgt, bone, src.pos(b) - src.pos(a))
        for bone in ORDER:
            pb = tgt.pose.bones[bone]
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if bone == "hips":
                pb.keyframe_insert("location", frame=f)
    tr = tgt.animation_data.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, f0, act)
    tgt.animation_data.action = None
    return f1 - f0 + 1


def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    rig = next((o for o in new if o.type == "ARMATURE"), None)
    return rig, new


def remove_objs(objs):
    for o in objs:
        if o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)
    for a in [a for a in bpy.data.actions if a.users == 0 and not a.name.startswith("wrh_")]:
        bpy.data.actions.remove(a)


def new_target(cid, S=1.0):
    rig = build_armature(cid, S, 1.5)
    rig.rotation_mode = "XYZ"
    bpy.context.view_layer.objects.active = rig
    return rig


def clip_from_fbx(path, tgt, clip_id, in_place):
    rig, objs = import_fbx(path)
    if rig is None or rig.animation_data is None or rig.animation_data.action is None:
        remove_objs(objs)
        raise ValueError("%s: no animation" % path)
    act = rig.animation_data.action
    f0, f1 = int(round(act.frame_range[0])), int(round(act.frame_range[1]))
    src = Src(rig)
    n = retarget_action(src, tgt, clip_id, f0, f1, in_place)
    remove_objs(objs)
    return n


def export_lib(tgt, path):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    tgt.select_set(True)
    bpy.context.view_layer.objects.active = tgt
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_skins=False)
    try:
        bpy.ops.export_scene.gltf(**kw, export_animations=True, export_animation_mode="NLA_TRACKS")
    except TypeError:
        bpy.ops.export_scene.gltf(**kw, export_animations=True, export_nla_strips=True)


def find_clip(c, names):
    """Resolve a manifest clip to a file: <id>.fbx first, else the original Mixamo name when it is unique in the manifest."""
    for d in SRC_DIRS:
        p = os.path.join(d, c["id"] + ".fbx")
        if os.path.exists(p):
            return p
    if len(names[slug(c["name"])]) == 1:
        for d in SRC_DIRS:
            if not os.path.isdir(d):
                continue
            for fn in os.listdir(d):
                if fn.lower().endswith(".fbx") and slug(os.path.splitext(fn)[0]) == slug(c["name"]):
                    return os.path.join(d, fn)
    return None


def run():
    os.makedirs(OUT_DIR, exist_ok=True)
    if bpy.app.background:
        for o in list(bpy.data.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.scene.render.fps = FPS
    man = json.load(open(MANIFEST, encoding="utf-8"))
    libs = {"player": new_target("player_rig"), "enemy": new_target("enemy_rig")}
    meta = {"fps": FPS, "authoredScale": 1.0, "note": "hips translation tracks are for scale 1.0; multiply by the character scale", "clips": {"player": [], "enemy": []}}
    missing = []
    names = {}
    for c in man["clips"]:
        names.setdefault(slug(c["name"]), []).append(c["id"])
    used = set()
    for c in man["clips"]:
        p = find_clip(c, names)
        if p is None:
            missing.append(c["id"])
            continue
        used.add(p)
        in_place = True  # horizontal root motion is always removed (the game moves the character); vertical bob/fall is kept
        n = clip_from_fbx(p, libs[c["rig"]], c["id"], in_place=in_place)
        meta["clips"][c["rig"]].append({"id": c["id"], "frames": n, "loop": c["loop"], "file": os.path.basename(p)})
    unmapped = []
    for d in SRC_DIRS:
        if not os.path.isdir(d):
            continue
        for sub in sorted(os.listdir(d)):
            pack_dir = os.path.join(d, sub)
            if not os.path.isdir(pack_dir):
                continue
            for fn in sorted(os.listdir(pack_dir)):
                if not fn.lower().endswith(".fbx"):
                    continue
                cid = slug(os.path.splitext(fn)[0])  # e.g. run_forward_left, walk_crouching_right, death_from_front
                try:
                    n = clip_from_fbx(os.path.join(pack_dir, fn), libs["player"], cid, in_place=True)
                except ValueError:
                    unmapped.append(fn + " (no animation, skipped)")
                    continue
                meta["clips"]["player"].append({"id": cid, "frames": n, "loop": not cid.startswith(("death", "jump", "turn", "crouching_turn")), "file": fn})
    for kind, tgt in libs.items():
        if meta["clips"][kind]:
            export_lib(tgt, os.path.join(OUT_DIR, kind + "_anims.glb"))
    with open(os.path.join(OUT_DIR, "anims.meta.json"), "w") as f:
        json.dump(meta, f, indent=1)
    return {"exported": {k: len(v) for k, v in meta["clips"].items()}, "missing": missing, "unmappedPack": unmapped}


# ---------------------------------------------------------------- self test (no FBX)
def make_fake_mixamo():
    arm = bpy.data.armatures.new("mx")
    ob = bpy.data.objects.new("mx_rig", arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    E = arm.edit_bones

    def bone(n, h, t, parent=None):
        b = E.new("mixamorig:" + n)
        b.head, b.tail = Vector(h), Vector(t)
        if parent:
            b.parent = E["mixamorig:" + parent]
        return b

    bone("Hips", (0, 0, 1.0), (0, 0, 1.1))
    bone("Spine", (0, 0, 1.1), (0, 0, 1.2), "Hips")
    bone("Spine1", (0, 0, 1.2), (0, 0, 1.3), "Spine")
    bone("Spine2", (0, 0, 1.3), (0, 0, 1.45), "Spine1")
    bone("Neck", (0, 0, 1.45), (0, 0, 1.55), "Spine2")
    bone("Head", (0, 0, 1.55), (0, 0, 1.75), "Neck")
    for side, sx in (("Left", 1), ("Right", -1)):
        bone(side + "Arm", (sx * 0.2, 0, 1.45), (sx * 0.5, 0, 1.45), "Spine2")
        bone(side + "ForeArm", (sx * 0.5, 0, 1.45), (sx * 0.78, 0, 1.45), side + "Arm")
        bone(side + "Hand", (sx * 0.78, 0, 1.45), (sx * 0.9, 0, 1.45), side + "ForeArm")
        bone(side + "UpLeg", (sx * 0.1, 0, 1.0), (sx * 0.1, 0, 0.55), "Hips")
        bone(side + "Leg", (sx * 0.1, 0, 0.55), (sx * 0.1, 0, 0.1), side + "UpLeg")
        bone(side + "Foot", (sx * 0.1, 0, 0.1), (sx * 0.1, -0.15, 0.02), side + "Leg")
        bone(side + "ToeBase", (sx * 0.1, -0.15, 0.02), (sx * 0.1, -0.25, 0.02), side + "Foot")
    bpy.ops.object.mode_set(mode="OBJECT")
    act = bpy.data.actions.new("fake")
    ob.animation_data_create()
    ob.animation_data.action = act
    pbn = ob.pose.bones
    for p in pbn:
        p.rotation_mode = "XYZ"
    # frame 1 rest, frame 20: left arm swings forward (-Y), hips drops 10 cm
    for f, ang, dz in ((1, 0.0, 0.0), (20, -math.pi / 2, -0.1)):
        pbn["mixamorig:LeftArm"].rotation_euler = (0, 0, ang)
        pbn["mixamorig:LeftArm"].keyframe_insert("rotation_euler", frame=f)
        pbn["mixamorig:Hips"].location = (0, dz, 0)  # bone Y points up in this fake rig
        pbn["mixamorig:Hips"].keyframe_insert("location", frame=f)
    return ob


def selftest():
    if bpy.app.background:
        for o in list(bpy.data.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    src_rig = make_fake_mixamo()
    tgt = new_target("player_rig")
    src = Src(src_rig)
    n = retarget_action(src, tgt, "selftest", 1, 20)
    bpy.context.scene.frame_set(20)
    bpy.context.view_layer.update()
    hd = tgt.pose.bones["arm.L"]
    d = (hd.matrix.to_3x3() @ Vector((0, 1, 0))).normalized()
    hips_z = tgt.pose.bones["hips"].head.z
    ok_dir = d.dot(Vector((0, -1, 0))) > 0.95
    base_z = tgt.data.bones["hips"].head_local.z
    ok_hips = hips_z < base_z - 0.02
    res = {"frames": n, "arm_dir": [round(c, 3) for c in d], "arm_forward": ok_dir, "hips_dropped": ok_hips}
    if not (ok_dir and ok_hips):
        raise AssertionError("selftest failed: %s" % res)
    import tempfile, struct
    tmp = os.path.join(tempfile.gettempdir(), "wrh_selftest_anims.glb")
    export_lib(tgt, tmp)
    b = open(tmp, "rb").read()
    j = json.loads(b[20:20 + struct.unpack("<I", b[12:16])[0]])
    anims = j.get("animations", [])
    res["glb_animations"] = [a_["name"] for a_ in anims]
    res["glb_channels"] = len(anims[0]["channels"]) if anims else 0
    if not anims or res["glb_channels"] < 12:
        raise AssertionError("export failed: %s" % res)
    return res


RESULT = selftest() if SELFTEST else run()
print(RESULT)
