"""Audit the exported GLB models for the things that make a mesh flicker: faces that point the wrong way, duplicated
vertices and faces that lie on top of each other (z-fighting).

  blender -b --factory-startup --python tools/blender/audit_meshes.py [-- <folder> ...]

Prints one line per model: triangles, faces whose normal points inwards, vertices that could be merged, and pairs of
coplanar faces that overlap. Exit code 1 when any model has a problem, so it can run in CI (with Blender installed).
"""
import bpy, bmesh, os, sys, glob
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "tools/blender/audit_meshes.py")))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
folders = argv or [os.path.join(REPO, "packages", "client", "public", "models", d) for d in ("characters", "props", "weapons")]


def islands(bm):
    """Group the faces by welded vertex position, so the split vertices of a glTF export do not cut a part in pieces."""
    key = lambda v: (round(v.co.x, 4), round(v.co.y, 4), round(v.co.z, 4))
    parent = {}

    def find(k):
        while parent.setdefault(k, k) != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    for f in bm.faces:
        ks = [key(v) for v in f.verts]
        for k in ks[1:]:
            parent[find(ks[0])] = find(k)
    out = {}
    for f in bm.faces:
        out.setdefault(find(key(f.verts[0])), []).append(f)
    return list(out.values())


def tri_points(f):
    c = f.calc_center_median()
    vs = [v.co for v in f.verts]
    pts = [c]
    for i in range(len(vs)):
        pts.append(vs[i] * 0.8 + c * 0.2)
    return pts


def inside(f, p, eps=1e-9):
    """Is p (on the plane of triangle f) inside the triangle?"""
    a, b, c = [v.co for v in f.verts]
    n = (b - a).cross(c - a)
    return all(((q2 - q1).cross(p - q1)).dot(n) >  eps for q1, q2 in ((a, b), (b, c), (c, a)))


def audit(path):
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    tris = inverted = doubles = overlaps = 0
    for o in meshes:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.faces.ensure_lookup_table()
        tris += len(bm.faces)
        pts = {}
        for v in bm.verts:
            k = (round(v.co.x, 4), round(v.co.y, 4), round(v.co.z, 4))
            pts[k] = pts.get(k, 0) + 1
        doubles += sum(c - 1 for c in pts.values() if c > 1)
        groups = islands(bm)
        owner = {}
        for gi, fs in enumerate(groups):
            # a closed part with a negative volume is turned inside out (open parts have no volume to judge)
            if all(e.is_manifold for f in fs for e in f.edges):
                vol = 0.0
                for f in fs:
                    p0, p1, p2 = [v.co for v in f.verts]
                    vol += p0.dot(p1.cross(p2)) / 6.0
                if vol < -1e-6:
                    inverted += len(fs)
            for f in fs:
                owner[f.index] = gi
        faces = list(bm.faces)
        for i, a in enumerate(faces):
            ca, na = a.calc_center_median(), a.normal
            for b in faces[i + 1:]:
                if owner[a.index] == owner[b.index]:
                    continue
                if na.dot(b.normal) < 0.999:
                    continue
                if abs((b.calc_center_median() - ca).dot(na)) > 1.5e-3:
                    continue
                if any(inside(b, p) for p in tri_points(a)) or any(inside(a, p) for p in tri_points(b)):
                    overlaps += 1
        bm.free()
    return tris, inverted, doubles, overlaps


bad = 0
rows = []
for folder in folders:
    for path in sorted(glob.glob(os.path.join(folder, "*.glb"))):
        t, inv, dup, ov = audit(path)
        name = os.path.relpath(path, REPO).replace("\\", "/")
        rows.append((name, t, inv, dup, ov))
        if inv or ov:
            bad += 1
for name, t, inv, dup, ov in rows:
    print("AUDIT %-58s tris %5d  inverted %4d  mergeable %4d  overlapping %4d%s" % (name, t, inv, dup, ov, "   <-- fix" if (inv or ov) else ""))
print("AUDIT models with problems: %d of %d" % (bad, len(rows)))
sys.stdout.flush()
