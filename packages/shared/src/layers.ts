/**
 * Two walkable levels in one arena: the ground (layer 0) and decks (layer 1: bridges, platforms, mezzanines) joined by ramps.
 * The simulation stays flat in x and y; what changes is which obstacles an entity collides with (its layer) and which
 * entities can hit which. Height is never stored: it is a function of position and layer (`heightAt`), so the renderer,
 * the prediction and the tests all read the same numbers.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Which layers it stops (bit 1: ground, bit 2: deck; default 1). A bridge pillar stops the ground (1), a deck rail stops
   * the deck (2), the wall beside a ramp stops both (3).
   */
  layers?: number;
  /** Does it stop bullets that fly on the layer it blocks (default true; a rail is low enough to shoot over). */
  cover?: boolean;
  /** How it is built by the renderer: a cover box (default), a solid mass under a deck, a pillar, a rail or the side wall of a ramp. */
  kind?: 'cover' | 'block' | 'pillar' | 'rail' | 'rampwall';
  /** Height of the drawn solid. */
  z?: number;
}

/** A walkable surface above the ground (axis aligned: centre, size and height of the top). */
export interface Deck {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

/**
 * A ramp: its footprint (centre, size), the direction it climbs (0 +x, 1 +y, 2 -x, 3 -y) and the height at its top end.
 * Walking along the climb direction raises `z` from 0 to `z` linearly: the grade is z / length.
 */
export interface Ramp {
  x: number;
  y: number;
  w: number;
  h: number;
  dir: 0 | 1 | 2 | 3;
  z: number;
}

export interface MapDef {
  id: string;
  boxes: readonly Box[];
  decks?: readonly Deck[];
  ramps?: readonly Ramp[];
}

export const TAN30 = 0.5773502691896257;
const DIRX = [1, 0, -1, 0];
const DIRY = [0, 1, 0, -1];

/** Is a layer-1 entity possible on this map at all? (maps without decks run exactly as before) */
export function isLayered(map: MapDef): boolean {
  return !!map.decks && map.decks.length > 0;
}

/** Index of the ramp whose footprint contains the point, or -1. */
export function rampAt(map: MapDef, x: number, y: number): number {
  const rs = map.ramps;
  if (!rs) return -1;
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i]!;
    if (x >= r.x - r.w / 2 && x <= r.x + r.w / 2 && y >= r.y - r.h / 2 && y <= r.y + r.h / 2) return i;
  }
  return -1;
}

/** How far along the climb the point is on ramp `r`: 0 at the foot, 1 at the top. */
export function rampT(r: Ramp, x: number, y: number): number {
  let t: number;
  if (r.dir === 0) t = (x - (r.x - r.w / 2)) / r.w;
  else if (r.dir === 2) t = (r.x + r.w / 2 - x) / r.w;
  else if (r.dir === 1) t = (y - (r.y - r.h / 2)) / r.h;
  else t = (r.y + r.h / 2 - y) / r.h;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Steepness of a ramp (rise over run). */
export function rampGrade(r: Ramp): number {
  return r.z / (r.dir === 0 || r.dir === 2 ? r.w : r.h);
}

/** Unit vector (x, y) of the climb direction. */
export function rampDir(r: Ramp): readonly [number, number] {
  return [DIRX[r.dir]!, DIRY[r.dir]!];
}

/** Is the point on a deck (its top surface), with `margin` kept clear of the edge? Returns the deck index or -1. */
export function deckAt(map: MapDef, x: number, y: number, margin = 0): number {
  const ds = map.decks;
  if (!ds) return -1;
  for (let i = 0; i < ds.length; i++) {
    const d = ds[i]!;
    if (x >= d.x - d.w / 2 + margin && x <= d.x + d.w / 2 - margin && y >= d.y - d.h / 2 + margin && y <= d.y + d.h / 2 - margin) return i;
  }
  return -1;
}

/** Height of the floor under an entity of this layer at this point. */
export function heightAt(map: MapDef, x: number, y: number, layer: number): number {
  if (!map.decks) return 0;
  const ri = rampAt(map, x, y);
  if (ri >= 0) {
    const r = map.ramps![ri]!;
    return r.z * rampT(r, x, y);
  }
  if (layer === 1) {
    const di = deckAt(map, x, y);
    return di >= 0 ? map.decks[di]!.z : 0;
  }
  return 0;
}

/** Can a layer-1 entity stand here (on a deck or on a ramp)? */
export function deckWalkable(map: MapDef, x: number, y: number): boolean {
  return deckAt(map, x, y) >= 0 || rampAt(map, x, y) >= 0;
}

/** The layer an entity ends up on after moving: the top of a ramp is the deck, the foot of it is the ground. */
export function nextLayer(map: MapDef, x: number, y: number, layer: number): number {
  if (!map.ramps) return layer;
  const ri = rampAt(map, x, y);
  if (ri < 0) return layer;
  const t = rampT(map.ramps[ri]!, x, y);
  if (layer === 0 && t >= 0.88) return 1;
  if (layer === 1 && t <= 0.12) return 0;
  return layer;
}

// ----------------------------------------------------------------------------------------------------------------------------
// builders for the map data below

const WALL = 0.5;

/** A ramp whose top edge is centred on (topX, topY): the footprint reaches back from there, `angle` is 30 or 45 degrees. */
function ramp(topX: number, topY: number, dir: 0 | 1 | 2 | 3, z: number, angle: 30 | 45, width: number): { ramp: Ramp; walls: Box[] } {
  const len = angle === 45 ? z : z / TAN30;
  const cx = topX - (DIRX[dir]! * len) / 2;
  const cy = topY - (DIRY[dir]! * len) / 2;
  const alongX = dir === 0 || dir === 2;
  const r: Ramp = { x: cx, y: cy, w: alongX ? len : width, h: alongX ? width : len, dir, z };
  const off = width / 2 + WALL / 2;
  const walls: Box[] = alongX
    ? [-1, 1].map((s) => ({ x: cx, y: cy + s * off, w: len, h: WALL, layers: 3, kind: 'rampwall' as const, z: Math.min(1, z * 0.5) }))
    : [-1, 1].map((s) => ({ x: cx + s * off, y: cy, w: WALL, h: len, layers: 3, kind: 'rampwall' as const, z: Math.min(1, z * 0.5) }));
  return { ramp: r, walls };
}

type Gap = { side: 'n' | 's' | 'e' | 'w'; from: number; to: number };

/** Thin rails round a deck (layer 1 cannot walk through, bullets fly over), with gaps where the ramps arrive. */
function rails(d: Deck, gaps: Gap[]): Box[] {
  const out: Box[] = [];
  const T = 0.3;
  const sides: { side: Gap['side']; lo: number; hi: number }[] = [
    { side: 'n', lo: d.x - d.w / 2, hi: d.x + d.w / 2 },
    { side: 's', lo: d.x - d.w / 2, hi: d.x + d.w / 2 },
    { side: 'e', lo: d.y - d.h / 2, hi: d.y + d.h / 2 },
    { side: 'w', lo: d.y - d.h / 2, hi: d.y + d.h / 2 },
  ];
  for (const s of sides) {
    let spans: [number, number][] = [[s.lo, s.hi]];
    for (const g of gaps) {
      if (g.side !== s.side) continue;
      const next: [number, number][] = [];
      for (const [a, b] of spans) {
        if (g.to <= a || g.from >= b) next.push([a, b]);
        else {
          if (g.from > a) next.push([a, g.from]);
          if (g.to < b) next.push([g.to, b]);
        }
      }
      spans = next;
    }
    for (const [a, b] of spans) {
      if (b - a < 0.1) continue;
      const len = b - a;
      const mid = (a + b) / 2;
      if (s.side === 'n') out.push({ x: mid, y: d.y + d.h / 2, w: len, h: T, layers: 2, cover: false, kind: 'rail', z: 0.9 });
      else if (s.side === 's') out.push({ x: mid, y: d.y - d.h / 2, w: len, h: T, layers: 2, cover: false, kind: 'rail', z: 0.9 });
      else if (s.side === 'e') out.push({ x: d.x + d.w / 2, y: mid, w: T, h: len, layers: 2, cover: false, kind: 'rail', z: 0.9 });
      else out.push({ x: d.x - d.w / 2, y: mid, w: T, h: len, layers: 2, cover: false, kind: 'rail', z: 0.9 });
    }
  }
  return out;
}

const block = (x: number, y: number, w: number, h: number, z: number): Box => ({ x, y, w, h, layers: 1, kind: 'block', z });
const pillar = (x: number, y: number, z: number): Box => ({ x, y, w: 1.1, h: 1.1, layers: 1, kind: 'pillar', z });
const cover = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

/** The vertical arenas. */
function build(): MapDef[] {
  const maps: MapDef[] = [];

  // OVERPASS: a long bridge across the north strip, 30 degree ramps at both ends, the ground runs under it between the pillars.
  {
    const deck: Deck = { x: 0, y: 11, w: 30, h: 6, z: 4 };
    const w = ramp(-15, 11, 0, 4, 30, 6);
    const e = ramp(15, 11, 2, 4, 30, 6);
    maps.push({
      id: 'overpass',
      decks: [deck],
      ramps: [w.ramp, e.ramp],
      boxes: [
        ...w.walls,
        ...e.walls,
        ...rails(deck, [{ side: 'w', from: 8, to: 14 }, { side: 'e', from: 8, to: 14 }]),
        pillar(-9, 8.4, 3.2),
        pillar(-9, 13.6, 3.2),
        pillar(9, 8.4, 3.2),
        pillar(9, 13.6, 3.2),
        block(-14.8, 11, 0.4, 6, 0.6),
        block(14.8, 11, 0.4, 6, 0.6),
        cover(-10, -8, 4, 1.5),
        cover(10, -9, 4, 1.5),
        cover(0, -14, 6, 1.5),
        cover(-21, -2, 1.5, 6),
        cover(21, -2, 1.5, 6),
        cover(-6, 3.5, 2, 2),
        cover(6, 3.5, 2, 2),
      ],
    });
  }

  // DEPOT: a raised platform with a tunnel through it, a long ramp on one side and a steep one on the other.
  {
    const deck: Deck = { x: 15, y: -10, w: 16, h: 12, z: 4 };
    const w = ramp(7, -8, 0, 4, 30, 5);
    const n = ramp(20.5, -4, 3, 4, 45, 4);
    maps.push({
      id: 'depot',
      decks: [deck],
      ramps: [w.ramp, n.ramp],
      boxes: [
        ...w.walls,
        ...n.walls,
        ...rails(deck, [{ side: 'w', from: -10.5, to: -5.5 }, { side: 'n', from: 18.5, to: 22.5 }]),
        block(9.75, -10, 5.5, 12, 4),
        block(20.25, -10, 5.5, 12, 4),
        cover(-12, 8, 5, 2),
        cover(-20, -6, 2, 6),
        cover(0, 14, 6, 1.5),
        cover(-6, -12, 4, 1.5),
        cover(8, 8, 2, 2),
        cover(22, 10, 5, 1.5),
      ],
    });
  }

  // RAMP YARD: two plateaus reached by 30 and 45 degree ramps, open ground between them.
  {
    const a: Deck = { x: -15, y: 8, w: 12, h: 8, z: 3 };
    const b: Deck = { x: 15, y: -8, w: 12, h: 8, z: 3 };
    const ae = ramp(-9, 8, 2, 3, 30, 4);
    const as = ramp(-12, 4, 1, 3, 45, 4);
    const bw = ramp(9, -8, 0, 3, 30, 4);
    const bn = ramp(12, -4, 3, 3, 45, 4);
    maps.push({
      id: 'rampyard',
      decks: [a, b],
      ramps: [ae.ramp, as.ramp, bw.ramp, bn.ramp],
      boxes: [
        ...ae.walls,
        ...as.walls,
        ...bw.walls,
        ...bn.walls,
        ...rails(a, [{ side: 'e', from: 6, to: 10 }, { side: 's', from: -14, to: -10 }]),
        ...rails(b, [{ side: 'w', from: -10, to: -6 }, { side: 'n', from: 10, to: 14 }]),
        block(-15, 8, 12, 8, 3),
        block(15, -8, 12, 8, 3),
        cover(0, 12, 4, 1.5),
        cover(0, -12, 4, 1.5),
        cover(-24, -6, 2, 5),
        cover(24, 6, 2, 5),
        cover(-6, -10, 2, 2),
        cover(6, 10, 2, 2),
      ],
    });
  }

  // TUNNEL HUB: a long bank across the north with three tunnels through it and ramps at both ends.
  {
    const deck: Deck = { x: 0, y: 14, w: 36, h: 8, z: 4 };
    const w = ramp(-18, 14, 0, 4, 30, 4);
    const e = ramp(18, 14, 2, 4, 45, 4);
    maps.push({
      id: 'tunnelhub',
      decks: [deck],
      ramps: [w.ramp, e.ramp],
      boxes: [
        ...w.walls,
        ...e.walls,
        ...rails(deck, [{ side: 'w', from: 12, to: 16 }, { side: 'e', from: 12, to: 16 }]),
        block(-14.5, 14, 7, 8, 4),
        block(-4.5, 14, 5, 8, 4),
        block(4.5, 14, 5, 8, 4),
        block(14.5, 14, 7, 8, 4),
        cover(-12, -4, 3, 3),
        cover(12, -5, 3, 3),
        cover(0, -10, 6, 1.5),
        cover(-22, -10, 2, 5),
        cover(22, -10, 2, 5),
      ],
    });
  }

  // MEZZANINE: a long gallery along the south wall on pillars: fight on it or run under it.
  {
    const deck: Deck = { x: 0, y: -13, w: 30, h: 7, z: 3.4 };
    const e = ramp(15, -13, 2, 3.4, 30, 4.5);
    const w = ramp(-15, -13, 0, 3.4, 45, 4);
    maps.push({
      id: 'mezzanine',
      decks: [deck],
      ramps: [e.ramp, w.ramp],
      boxes: [
        ...e.walls,
        ...w.walls,
        ...rails(deck, [{ side: 'e', from: -15.25, to: -10.75 }, { side: 'w', from: -15, to: -11 }]),
        pillar(-12, -11, 2.8),
        pillar(-12, -15, 2.8),
        pillar(0, -11, 2.8),
        pillar(0, -15, 2.8),
        pillar(12, -11, 2.8),
        pillar(12, -15, 2.8),
        block(-14.8, -13, 0.4, 7, 0.6),
        block(14.8, -13, 0.4, 7, 0.6),
        cover(-12, 4, 3, 3),
        cover(12, 6, 3, 3),
        cover(0, 12, 5, 1.5),
        cover(-22, 8, 2, 6),
        cover(22, 0, 2, 6),
      ],
    });
  }
  return maps;
}

export const LAYERED_MAPS: readonly MapDef[] = build();
