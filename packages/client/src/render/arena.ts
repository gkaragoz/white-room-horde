import * as THREE from 'three';
import { MAPS, type Box, type Deck, type MapDef, type Ramp } from '@wrh/shared';

/** Cover colours per layout so the arenas read differently at a glance. */
export const THEMES: { side: string; top: string; rim: string }[] = [
  { side: '#7f93ad', top: '#b4c3d6', rim: '#4d5d73' }, // warehouse: blue steel containers
  { side: '#a4a9b2', top: '#d3d7de', rim: '#656b76' }, // courtyard: stone
  { side: '#b27c76', top: '#d9aaa3', rim: '#7a4944' }, // corridors: brick
  { side: '#7ea06a', top: '#aecb97', rim: '#506b40' }, // field: hedge green
  { side: '#9a8f86', top: '#c9bfb5', rim: '#6a5f56' }, // ruins: crumbled plaster
  { side: '#c98a2e', top: '#e8b25a', rim: '#8a5a14' }, // factory: safety orange machinery
  { side: '#9aa4b2', top: '#d4dae3', rim: '#566174' }, // overpass: concrete and steel
  { side: '#b39a7a', top: '#e3d3b0', rim: '#6f5c40' }, // depot: sandstone
  { side: '#8fae8a', top: '#c3dcb8', rim: '#52714d' }, // ramp yard: moss
  { side: '#a9917f', top: '#dccab5', rim: '#6b5645' }, // tunnel hub: brick and plaster
  { side: '#8aa5b8', top: '#c8dbe8', rim: '#4a6479' }, // mezzanine: pale blue gallery
];

const RAMP = '#f2c879';

/** The cover boxes, decks, ramps and rails of the current arena layout. Rebuilt when the layout changes. */
export class ArenaView {
  readonly group = new THREE.Group();
  private current = -1;
  /** What hides a character walking underneath (decks, the solid masses and pillars): faded out when that happens. */
  private readonly roof: THREE.Material[] = [];
  private fade = 1;
  private def: MapDef = MAPS[0]!;

  /** The layout shown right now (-1 before the first). */
  get map(): number {
    return this.current;
  }
  private readonly disposables: THREE.Material[] = [];

  setMap(index: number): void {
    if (index === this.current) return;
    this.current = index;
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    for (const m of this.disposables) m.dispose();
    this.disposables.length = 0;
    this.roof.length = 0;
    this.fade = 1;
    this.def = MAPS[index] ?? MAPS[0]!;
    const t = THEMES[index] ?? THEMES[0]!;
    const mat = (color: string, roughness = 0.9): THREE.MeshStandardMaterial => {
      const m = new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
      this.disposables.push(m);
      return m;
    };
    const side = mat(t.side);
    const top = mat(t.top);
    const rimMat = mat(t.rim, 1);
    const roofSide = mat(t.side);
    const roofTop = mat(t.top);
    const roofUnder = mat(t.rim, 1);
    const metal = mat('#6c7a89', 0.5);
    const rampMat = mat(RAMP);
    this.roof.push(roofSide, roofTop, roofUnder);
    for (const o of this.def.boxes) this.addBox(o, { side, top, rimMat, roofSide, roofTop, metal });
    for (const d of this.def.decks ?? []) this.addDeck(d, roofSide, roofTop, roofUnder, rimMat);
    for (const r of this.def.ramps ?? []) this.addRamp(r, rampMat, rimMat);
  }

  private addBox(o: Box, m: { side: THREE.Material; top: THREE.Material; rimMat: THREE.Material; roofSide: THREE.Material; roofTop: THREE.Material; metal: THREE.Material }): void {
    const kind = o.kind ?? 'cover';
    if (kind === 'rail') {
      // a thin bar at hand height on posts: you can shoot over it, you cannot walk through it
      const long = o.w >= o.h;
      const len = long ? o.w : o.h;
      const base = this.deckHeightAt(o.x, o.y);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(long ? len : 0.1, 0.1, long ? 0.1 : len), m.metal);
      bar.position.set(o.x, base + 0.85, -o.y);
      bar.castShadow = true;
      this.group.add(bar);
      const posts = Math.max(2, Math.round(len / 1.6) + 1);
      for (let i = 0; i < posts; i++) {
        const f = posts === 1 ? 0.5 : i / (posts - 1);
        const px = long ? o.x - len / 2 + f * len : o.x;
        const py = long ? o.y : o.y - len / 2 + f * len;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), m.metal);
        post.position.set(px, base + 0.45, -py);
        post.castShadow = true;
        this.group.add(post);
      }
      return;
    }
    if (kind === 'block' || kind === 'pillar') {
      const h = o.z ?? 3;
      const box = new THREE.Mesh(new THREE.BoxGeometry(o.w, h, o.h), [m.roofSide, m.roofSide, m.roofTop, m.roofSide, m.roofSide, m.roofSide]);
      box.position.set(o.x, h / 2, -o.y);
      box.castShadow = true;
      box.receiveShadow = true;
      this.group.add(box);
      return;
    }
    if (kind === 'rampwall') {
      const h = o.z ?? 0.6;
      const box = new THREE.Mesh(new THREE.BoxGeometry(o.w, h, o.h), m.metal);
      box.position.set(o.x, h / 2, -o.y);
      box.castShadow = true;
      this.group.add(box);
      return;
    }
    const h = 1.1;
    const box = new THREE.Mesh(new THREE.BoxGeometry(o.w, h, o.h), [m.side, m.side, m.top, m.side, m.side, m.side]);
    box.position.set(o.x, h / 2, -o.y);
    box.castShadow = true;
    box.receiveShadow = true;
    this.group.add(box);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.1, 0.12, o.h + 0.1), m.rimMat);
    rim.position.set(o.x, 0.06, -o.y);
    this.group.add(rim);
  }

  private deckHeightAt(x: number, y: number): number {
    for (const d of this.def.decks ?? []) if (Math.abs(x - d.x) <= d.w / 2 + 0.3 && Math.abs(y - d.y) <= d.h / 2 + 0.3) return d.z;
    return 0;
  }

  private addDeck(d: Deck, side: THREE.Material, top: THREE.Material, under: THREE.Material, rim: THREE.Material): void {
    const thick = 0.7;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(d.w, thick, d.h), [side, side, top, under, side, side]);
    slab.position.set(d.x, d.z - thick / 2, -d.y);
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.group.add(slab);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(d.w + 0.14, 0.1, d.h + 0.14), rim);
    trim.position.set(d.x, d.z - thick + 0.05, -d.y);
    this.group.add(trim);
  }

  /** A solid wedge: its footprint, rising along the climb direction from the ground to `z` at the top end. */
  private addRamp(r: Ramp, material: THREE.Material, rim: THREE.Material): void {
    const hw = r.w / 2;
    const hh = r.h / 2;
    // corners of the footprint (x, z in three axes) and which of them are at the top
    const c: [number, number][] = [
      [r.x - hw, -(r.y - hh)],
      [r.x + hw, -(r.y - hh)],
      [r.x + hw, -(r.y + hh)],
      [r.x - hw, -(r.y + hh)],
    ];
    const high = (x: number, zz: number): boolean => {
      const sy = -zz;
      return r.dir === 0 ? x > r.x : r.dir === 2 ? x < r.x : r.dir === 1 ? sy > r.y : sy < r.y;
    };
    const verts: number[] = [];
    for (const [x, zz] of c) verts.push(x, high(x, zz) ? r.z : 0, zz);
    // a slightly raised copy for the walking surface so the wedge reads as one piece; the underside is dropped
    const idx = [0, 2, 1, 0, 3, 2];
    const g = new THREE.BufferGeometry();
    // top surface
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const surface = new THREE.Mesh(g, material);
    surface.castShadow = true;
    surface.receiveShadow = true;
    this.group.add(surface);
    // the two sides and the back of the wedge (solid, so it does not look hollow from the side)
    const wall = new THREE.MeshStandardMaterial({ color: '#c9a35c', roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
    this.disposables.push(wall);
    const lowHigh = c.map(([x, zz]) => ({ x, zz, h: high(x, zz) }));
    const addQuad = (a: number, b: number): void => {
      const A = lowHigh[a]!;
      const B = lowHigh[b]!;
      const q = [A.x, 0, A.zz, B.x, 0, B.zz, B.x, B.h ? r.z : 0, B.zz, A.x, A.h ? r.z : 0, A.zz];
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(q, 3));
      gg.setIndex([0, 1, 2, 0, 2, 3]);
      gg.computeVertexNormals();
      const m = new THREE.Mesh(gg, wall);
      m.castShadow = true;
      this.group.add(m);
    };
    for (let i = 0; i < 4; i++) addQuad(i, (i + 1) % 4);
    // a stripe of marks across the slope so a ramp reads as a ramp (and shows which way it climbs)
    const len = r.dir === 0 || r.dir === 2 ? r.w : r.h;
    const across = r.dir === 0 || r.dir === 2 ? r.h : r.w;
    const marks = Math.max(2, Math.round(len / 1.3));
    for (let i = 1; i < marks; i++) {
      const f = i / marks;
      const along = f * len;
      const zAt = r.z * f;
      const px = r.dir === 0 ? r.x - hw + along : r.dir === 2 ? r.x + hw - along : r.x;
      const py = r.dir === 1 ? r.y - hh + along : r.dir === 3 ? r.y + hh - along : r.y;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(r.dir === 0 || r.dir === 2 ? 0.14 : across * 0.9, 0.04, r.dir === 0 || r.dir === 2 ? across * 0.9 : 0.14), rim);
      stripe.position.set(px, zAt + 0.03, -py);
      // follow the slope
      const slope = Math.atan2(r.z, len);
      if (r.dir === 0) stripe.rotation.z = slope;
      else if (r.dir === 2) stripe.rotation.z = -slope;
      else if (r.dir === 1) stripe.rotation.x = slope;
      else stripe.rotation.x = -slope;
      this.group.add(stripe);
    }
  }

  /**
   * Is a character standing at (x, y) on the ground hidden behind a deck or what holds it up, as seen from `camera`?
   * Then the roof is shown thin so the character stays visible.
   */
  hidesGround(camera: THREE.Camera, x: number, y: number): boolean {
    if (!this.def.decks?.length) return false;
    const p = new THREE.Vector3(x, 1.0, -y).project(camera);
    const q = new THREE.Vector3();
    for (const d of this.def.decks) {
      const poly: [number, number][] = [];
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        q.set(d.x + (cx * d.w) / 2, d.z, -(d.y + (cy * d.h) / 2)).project(camera);
        poly.push([q.x, q.y]);
      }
      // the deck's top face together with the solid below it: the polygon from its top corners down to the ground
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        q.set(d.x + (cx * d.w) / 2, 0, -(d.y + (cy * d.h) / 2)).project(camera);
        poly.push([q.x, q.y]);
      }
      if (hullContains(poly, p.x, p.y)) return true;
    }
    return false;
  }

  /** Fade the roof toward `target` (0.25 = see through, 1 = solid); call every frame with the frame time. */
  fadeRoof(target: number, dt: number): void {
    const k = this.fade + (target - this.fade) * Math.min(1, dt * 8);
    if (Math.abs(k - this.fade) < 0.002) return;
    this.fade = k;
    for (const m of this.roof) {
      m.transparent = k < 0.999;
      m.opacity = k;
      m.depthWrite = k > 0.9;
      m.needsUpdate = true;
    }
  }

  get roofOpacity(): number {
    return this.fade;
  }

  get boxCount(): number {
    return this.def.boxes.length;
  }
}

/** Point in the convex hull of the given points (gift wrapping not needed: a few corners, so test against every edge of the hull). */
function hullContains(pts: [number, number][], x: number, y: number): boolean {
  const hull = convexHull(pts);
  let sign = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function convexHull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
