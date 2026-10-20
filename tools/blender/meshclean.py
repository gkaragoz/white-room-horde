"""Mesh clean-up shared by the model scripts (exec'd, not imported): weld doubles, turn every closed part outwards, drop
faces nobody can see and separate the coplanar faces that would z-fight.

    clean_mesh(mesh_object, floor=False) -> dict of counts

`floor=True` also deletes the downward facing faces that lie on the ground plane: they are never seen from above and
they would fight with the arena floor.
"""
import bmesh
from mathutils import Vector


def _inside_tri(a, b, c, p, eps=1e-9):
    n = (b - a).cross(c - a)
    return all(((q2 - q1).cross(p - q1)).dot(n) > eps for q1, q2 in ((a, b), (b, c), (c, a)))


def _samples(a, b, c):
    m = (a + b + c) / 3.0
    return [m, a * 0.8 + m * 0.2, b * 0.8 + m * 0.2, c * 0.8 + m * 0.2]


def clean_mesh(mesh, floor=False):
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    stats = {}
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    stats["welded"] = before - len(bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.faces.ensure_lookup_table()

    if floor and bm.verts:
        zmin = min(v.co.z for v in bm.verts)
        low = [f for f in bm.faces if f.normal.z < -0.99 and all(v.co.z <= zmin + 0.004 for v in f.verts)]
        stats["floor"] = len(low)
        bmesh.ops.delete(bm, geom=low, context="FACES")
        bm.faces.ensure_lookup_table()

    # coplanar faces facing the same way: the covered one goes, a partly covered one is lifted off the surface
    faces = list(bm.faces)
    covered, lifted = set(), set()
    for i, a in enumerate(faces):
        if not a.is_valid:
            continue
        na = a.normal
        ca = a.calc_center_median()
        pa = [v.co.copy() for v in a.verts]
        for b in faces[i + 1:]:
            if b.index in covered or a.index in covered:
                continue
            if set(a.verts) & set(b.verts):
                continue
            if na.dot(b.normal) < 0.999 or abs((b.calc_center_median() - ca).dot(na)) > 2e-3:
                continue
            pb = [v.co.copy() for v in b.verts]
            a_in_b = [_inside_tri(*pb, p) for p in _samples(*pa)]
            b_in_a = [_inside_tri(*pa, p) for p in _samples(*pb)]
            if not any(a_in_b) and not any(b_in_a):
                continue
            small, big = (a, b) if a.calc_area() <= b.calc_area() else (b, a)
            if all(a_in_b if small is a else b_in_a):
                covered.add(small.index)
            else:
                lifted.add(small.index)
    for f in faces:
        if f.index in lifted and f.index not in covered:
            for v in f.verts:
                v.co += f.normal * 0.005
    stats["covered"] = len(covered)
    stats["lifted"] = len(lifted - covered)
    bmesh.ops.delete(bm, geom=[f for f in faces if f.index in covered], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(mesh.data)
    bm.free()
    mesh.data.update()
    return stats
