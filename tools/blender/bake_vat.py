"""Bake vertex-animation textures (VAT) for the crowd enemies.

Run headless (needs the local, git-ignored Mixamo FBX files in ./mixamo):
  blender -b --factory-startup --python tools/blender/bake_vat.py
  ONLY=grunt,runner  to bake a subset

For every enemy type it builds the rigged low-poly mesh (make_chibi.py), retargets the clips it needs
(retarget_mixamo.py), samples the deformed vertices per frame and writes into packages/client/public/models/vat/:
  <type>.json     metadata: clips (start row, frames, rate, loop), counts, bounds
  <type>.geo.bin  welded geometry: positions f32 (bind pose), uv f32, colour f32 (rgb, linear), indices u16
  <type>.vat.bin  float16 RGBA texels, row = frame, column = welded vertex (xyz = three-space position, w = 1)
  paint.png       the shared painted-noise texture
Positions are written in three.js axes (x, z, -y) and in the model's own units (scale baked in).
"""
import bpy, os, sys, json, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/bake_vat.py")))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.environ.get("OUT_DIR") or os.path.join(REPO, "packages", "client", "public", "models", "vat")
ONLY = [x for x in os.environ.get("ONLY", "").split(",") if x] or None
SAMPLE_FPS, MIN_S, MAX_S = 12, 8, 40
SRC_FPS = 30

RT = os.path.join(HERE, "retarget_mixamo.py")
G = {"__name__": "rt", "__file__": RT, "NO_RUN": True}
exec(compile(open(RT, encoding="utf-8").read(), RT, "exec"), G)
K = G["K"]

TYPES = {
    "grunt": ("spec_grunt", 1.35, 1.5, ["z_walk", "z_attack_swipe", "z_hit", "z_death_back", "z_scream"]),
    "runner": ("spec_runner", 1.05, 1.55, ["z_run", "z_attack_swipe", "z_death_fwd", "z_scream"]),
    "tank": ("spec_tank", 2.5, 1.45, ["z_walk", "z_attack_overhead", "z_death_back", "z_scream"]),
    "exploder": ("spec_exploder", 1.3, 1.7, ["z_run", "z_scream", "z_death_fwd"]),
    "spitter": ("spec_spitter", 1.35, 1.5, ["z_walk_creep", "z_attack_swipe", "z_death_back", "z_scream"]),
    "shielder": ("spec_shielder", 1.5, 1.5, ["z_walk_creep", "z_punch", "z_death_back"]),
    "spawner": ("spec_spawner", 1.5, 1.5, ["z_walk_creep", "z_scream", "z_death_back"]),
}
TYPES["crawler"] = ("spec_crawler", 1.1, 1.5, ["z_crawl", "z_headbutt", "z_death_back", "z_scream"])
TYPES["leaper"] = ("spec_leaper", 1.35, 1.5, ["z_run", "z_kick", "z_death_fwd", "z_scream"])
TYPES["bloater"] = ("spec_bloater", 1.9, 1.5, ["z_walk_creep", "z_punch", "z_death_back", "z_scream"])
TYPES["screamer"] = ("spec_screamer", 1.3, 1.5, ["z_walk", "z_scream", "z_death_back"])
# the newer enemies: their own look, carried prop and the stock zombie clips (windups are shown with the scream pose)
TYPES["acider"] = ("spec_acider", 1.35, 1.5, ["z_walk_creep", "z_attack_swipe", "z_death_back", "z_scream"])
TYPES["rammer"] = ("spec_rammer", 1.9, 1.5, ["z_run", "z_headbutt", "z_death_fwd", "z_scream"])
TYPES["mortar"] = ("spec_mortar", 1.4, 1.5, ["z_walk_creep", "z_scream", "z_death_back"])
TYPES["sledge"] = ("spec_sledge", 2.2, 1.5, ["z_walk", "z_attack_overhead", "z_death_back", "z_scream"])
TYPES["lamper"] = ("spec_lamper", 1.6, 1.5, ["z_walk", "z_attack_overhead", "z_death_back", "z_scream"])
TYPES["reviver"] = ("spec_reviver", 1.5, 1.5, ["z_walk_creep", "z_scream", "z_death_back"])
TYPES["marksman"] = ("spec_marksman", 1.4, 1.5, ["z_walk_creep", "z_scream", "z_death_back"])
TYPES["blinker"] = ("spec_blinker", 1.15, 1.5, ["z_run", "z_kick", "z_death_fwd", "z_scream"])
TYPES["magnetar"] = ("spec_magnetar", 2.0, 1.5, ["z_walk", "z_punch", "z_death_back", "z_scream"])
TYPES["flamer"] = ("spec_flamer", 1.4, 1.5, ["z_walk", "z_scream", "z_death_back"])
# bosses: one look per boss wave (the client cycles through them)
BOSS = ["z_walk", "z_attack_overhead", "z_death_back", "z_scream"]
TYPES["boss_dev_grunt"] = ("spec_dev_grunt", 3.0, 1.7, BOSS)
TYPES["boss_kral_tank"] = ("spec_kral_tank", 4.0, 1.7, BOSS)
TYPES["boss_sayaci_ana"] = ("spec_sayaci_ana", 3.5, 1.7, BOSS)
TYPES["boss_suru_lideri"] = ("spec_suru_lideri", 2.5, 1.7, BOSS)
TYPES["boss_meteor_lord"] = ("spec_meteor_lord", 3.6, 1.7, BOSS)
TYPES["boss_purger"] = ("spec_purger", 3.4, 1.7, BOSS)
TYPES["pouncer"] = ("spec_pouncer", 1.3, 1.5, ["z_run", "z_kick", "z_death_fwd", "z_scream"])
TYPES["hurler"] = ("spec_hurler", 2.1, 1.5, ["z_walk", "z_attack_overhead", "z_death_back", "z_scream"])
TYPES["grabber"] = ("spec_grabber", 2.3, 1.5, ["z_walk", "z_punch", "z_death_back", "z_scream"])
TYPES["spiker"] = ("spec_spiker", 1.4, 1.5, ["z_walk_creep", "z_scream", "z_death_back"])
TYPES["shocker"] = ("spec_shocker", 1.4, 1.5, ["z_walk", "z_scream", "z_death_back"])
TYPES["brood"] = ("spec_brood", 1.8, 1.5, ["z_walk_creep", "z_scream", "z_death_back"])
TYPES["trapper"] = ("spec_trapper", 1.35, 1.5, ["z_walk", "z_scream", "z_death_back"])
TYPES["warcaller"] = ("spec_warcaller", 1.5, 1.5, ["z_walk", "z_scream", "z_death_back"])
TYPES["chopper"] = ("spec_chopper", 1.7, 1.5, ["z_walk", "z_attack_overhead", "z_death_back", "z_scream"])
TYPES["quaker"] = ("spec_quaker", 2.4, 1.5, ["z_walk", "z_attack_overhead", "z_death_back", "z_scream"])
TYPES["boss_iron_colossus"] = ("spec_iron_colossus", 4.2, 1.7, BOSS)
TYPES["boss_storm_caller"] = ("spec_storm_caller", 3.4, 1.7, BOSS)
TYPES["boss_plague_doctor"] = ("spec_plague_doctor", 3.2, 1.7, BOSS)
TYPES["boss_stalker"] = ("spec_stalker", 3.0, 1.7, BOSS)
TYPES["boss_warlord"] = ("spec_warlord", 3.8, 1.7, BOSS)
LOOPS = {"z_walk", "z_walk_creep", "z_run", "z_idle", "z_crawl"}

man = json.load(open(os.path.join(REPO, "tools", "mixamo", "manifest.json"), encoding="utf-8"))
CLIPS = {c["id"]: c for c in man["clips"]}
NAMES = {}
for c in man["clips"]:
    NAMES.setdefault(G["slug"](c["name"]), []).append(c["id"])


def weld(mesh):
    """Return (src_vertex[], uv[], color[], indices[]) with identical corners merged."""
    me = mesh.data
    me.calc_loop_triangles()
    nloops = len(me.loops)
    lv = np.empty(nloops, dtype=np.int64)
    me.loops.foreach_get("vertex_index", lv)
    uv = np.empty(nloops * 2, dtype=np.float64)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    col = np.empty(nloops * 4, dtype=np.float64)
    me.color_attributes["Col"].data.foreach_get("color", col)
    col = col.reshape(-1, 4)[:, :3]
    ntri = len(me.loop_triangles)
    tl = np.empty(ntri * 3, dtype=np.int64)
    me.loop_triangles.foreach_get("loops", tl)
    keys = np.concatenate([lv[tl, None].astype(np.float64), np.round(uv[tl], 4), np.round(col[tl], 3)], axis=1)
    uniq, first, inverse = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    inverse = inverse.reshape(-1)
    src = lv[tl][first]
    return src, uv[tl][first].astype(np.float32), col[tl][first].astype(np.float32), inverse.astype(np.uint16)


def bake(tid, spec_name, S, head_top, clip_ids, fixed, tint):
    b = K["Builder"](tid, S, fixed, tint, K["LOW"])
    K[spec_name](b)
    rig = K["build_armature"](tid, S, head_top)
    mesh = K["finalize"](tid, S, b.objs, rig)
    names_missing = []
    for cid in clip_ids:
        path = G["find_clip"](CLIPS[cid], NAMES)
        if path is None:
            names_missing.append(cid)
            continue
        G["clip_from_fbx"](path, rig, cid, True)
    if names_missing:
        raise ValueError("%s: missing FBX for %s" % (tid, names_missing))
    src, uv, col, idx = weld(mesh)
    nverts = len(src)
    if nverts > 4096:
        raise ValueError("%s: %d welded vertices exceed the texture width" % (tid, nverts))
    scene = bpy.context.scene
    tracks = rig.animation_data.nla_tracks

    def positions():
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        eo = mesh.evaluated_get(dg)
        me = eo.to_mesh()
        co = np.empty(len(me.vertices) * 3, dtype=np.float32)
        me.vertices.foreach_get("co", co)
        eo.to_mesh_clear()
        co = co.reshape(-1, 3)[src]
        return np.stack([co[:, 0], co[:, 2], -co[:, 1]], axis=1)  # blender -> three axes

    for t in tracks:
        t.mute = True
    rig.animation_data.action = None
    scene.frame_set(1)
    bind = positions()
    rows, clips = [], []
    for cid in clip_ids:
        # evaluate the retargeted action directly (muted NLA tracks stay out of the way)
        st = tracks[cid].strips[0]
        rig.animation_data.action = st.action
        f0, f1 = int(st.frame_start), int(st.frame_end)
        dur = f1 - f0 + 1
        loop = cid in LOOPS
        n = int(min(MAX_S, max(MIN_S, round(dur / SRC_FPS * SAMPLE_FPS))))
        frames = [f0 + (i / n) * dur for i in range(n)] if loop else [f0 + (i / (n - 1)) * (dur - 1) for i in range(n)]
        start = len(rows)
        for f in frames:
            scene.frame_set(int(math.floor(f)), subframe=f - math.floor(f))
            rows.append(positions())
        dev = float(np.abs(np.stack(rows[start:]) - rows[start]).max())
        print("  clip %s frames=%d motion=%.3f" % (cid, n, dev))
        if dev < 0.02:
            raise ValueError("%s/%s: baked frames do not move (animation not evaluated)" % (tid, cid))
        clips.append({"id": cid, "start": start, "frames": n, "loop": loop, "duration": round(dur / SRC_FPS, 4)})
    data = np.zeros((len(rows), nverts, 4), dtype=np.float16)
    data[..., :3] = np.stack(rows).astype(np.float16)
    data[..., 3] = 1
    ext = np.abs(np.stack(rows)).reshape(-1, 3).max(axis=0)
    os.makedirs(OUT_DIR, exist_ok=True)
    geo = b"".join([bind.astype(np.float32).tobytes(), uv.tobytes(), col.tobytes(), idx.tobytes()])
    open(os.path.join(OUT_DIR, tid + ".geo.bin"), "wb").write(geo)
    open(os.path.join(OUT_DIR, tid + ".vat.bin"), "wb").write(data.tobytes())
    meta = {"type": tid, "scale": S, "vertexCount": nverts, "indexCount": int(len(idx)), "frames": len(rows), "clips": clips,
            "extent": [round(float(v), 3) for v in ext], "layout": "geo.bin = positions f32[3n], uv f32[2n], color f32[3n], indices u16[indexCount]"}
    json.dump(meta, open(os.path.join(OUT_DIR, tid + ".json"), "w"), indent=1)
    return {"verts": nverts, "tris": int(len(idx) // 3), "frames": len(rows), "kb": round((len(geo) + data.nbytes) / 1024)}


def run():
    if bpy.app.background:
        for o in list(bpy.data.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    fixed, tint = K["make_materials"]()
    res = {}
    for tid, (spec, S, head, clips) in TYPES.items():
        if ONLY and tid not in ONLY:
            continue
        res[tid] = bake(tid, spec, S, head, clips, fixed, tint)
    img = bpy.data.images.get("wrh_paint")
    if img:
        img.filepath_raw = os.path.join(OUT_DIR, "paint.png")
        img.file_format = "PNG"
        img.save()
    return res


RESULT = run()
print(RESULT)
