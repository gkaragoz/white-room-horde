import { ARENA_HALF_H, ARENA_HALF_W, MAPS, deckWalkable, type MapDef } from '@wrh/shared';

/**
 * Plain geometry for the bot: the arena's boxes as flat arrays per map and layer, circle-in-box pushing (the same rule the sim
 * uses for players), bullet-line tests against cover, the intercept point for a lead shot, and a few shape tests. Everything
 * here is pure and allocation free in the hot paths (results go to the shared scratch objects).
 */

/** The boxes of one map that matter on one layer, flattened: minX, minY, maxX, maxY per box. */
export interface MapGeo {
  map: MapDef;
  /** Boxes that stop walking on this layer. */
  nSolid: number;
  solid: Float64Array;
  /** Boxes that stop bullets flying on this layer. */
  nCover: number;
  cover: Float64Array;
}

const cache = new Map<number, [MapGeo, MapGeo]>();

/** The geometry of a map as seen from a layer (0 ground, 1 deck). Cached: call it freely. */
export function geoOf(mapIndex: number, layer: number): MapGeo {
  let pair = cache.get(mapIndex);
  if (!pair) {
    const map = MAPS[mapIndex] ?? MAPS[0]!;
    pair = [build(map, 0), build(map, 1)];
    cache.set(mapIndex, pair);
  }
  return pair[layer === 1 ? 1 : 0];
}

function build(map: MapDef, layer: number): MapGeo {
  const mask = layer === 1 ? 2 : 1;
  const solid: number[] = [];
  const cover: number[] = [];
  for (const o of map.boxes) {
    if (((o.layers ?? 1) & mask) === 0) continue;
    const b = [o.x - o.w / 2, o.y - o.h / 2, o.x + o.w / 2, o.y + o.h / 2];
    solid.push(...b);
    if (o.cover !== false) cover.push(...b);
  }
  return { map, nSolid: solid.length / 4, solid: Float64Array.from(solid), nCover: cover.length / 4, cover: Float64Array.from(cover) };
}

const local = new Float64Array(4 * 96);
let localN = 0;

/** Keep only the solid boxes within `radius` of (x, y) for `pushOutLocal` (the bot looks at a few seconds of running, not the whole arena). */
export function focusBoxes(g: MapGeo, x: number, y: number, radius: number): void {
  localN = 0;
  const s = g.solid;
  for (let i = 0, n = g.nSolid * 4; i < n && localN < 96; i += 4) {
    if (s[i + 2]! < x - radius || s[i]! > x + radius || s[i + 3]! < y - radius || s[i + 1]! > y + radius) continue;
    local[localN * 4] = s[i]!;
    local[localN * 4 + 1] = s[i + 1]!;
    local[localN * 4 + 2] = s[i + 2]!;
    local[localN * 4 + 3] = s[i + 3]!;
    localN++;
  }
}

/** Result of `pushOut`. */
export const pushed = { x: 0, y: 0 };

/** Push a circle out of every solid box (the sim's rule); the result is in `pushed`. Returns true when it moved. */
export function pushOut(g: MapGeo, x: number, y: number, r: number): boolean {
  let moved = false;
  const s = g.solid;
  for (let i = 0, n = g.nSolid * 4; i < n; i += 4) {
    const cx = x < s[i]! ? s[i]! : x > s[i + 2]! ? s[i + 2]! : x;
    const cy = y < s[i + 1]! ? s[i + 1]! : y > s[i + 3]! ? s[i + 3]! : y;
    const ex = x - cx;
    const ey = y - cy;
    const d2 = ex * ex + ey * ey;
    if (d2 >= r * r) continue;
    moved = true;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      x += (ex / d) * (r - d);
      y += (ey / d) * (r - d);
    } else {
      const mx = (s[i]! + s[i + 2]!) / 2;
      const my = (s[i + 1]! + s[i + 3]!) / 2;
      const px = (s[i + 2]! - s[i]!) / 2 - Math.abs(x - mx);
      const py = (s[i + 3]! - s[i + 1]!) / 2 - Math.abs(y - my);
      if (px < py) x += (x < mx ? -1 : 1) * (px + r);
      else y += (y < my ? -1 : 1) * (py + r);
    }
  }
  pushed.x = x;
  pushed.y = y;
  return moved;
}

/** `pushOut` against the boxes chosen by `focusBoxes`. */
export function pushOutLocal(x: number, y: number, r: number): boolean {
  let moved = false;
  const s = local;
  for (let i = 0, n = localN * 4; i < n; i += 4) {
    const cx = x < s[i]! ? s[i]! : x > s[i + 2]! ? s[i + 2]! : x;
    const cy = y < s[i + 1]! ? s[i + 1]! : y > s[i + 3]! ? s[i + 3]! : y;
    const ex = x - cx;
    const ey = y - cy;
    const d2 = ex * ex + ey * ey;
    if (d2 >= r * r) continue;
    moved = true;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      x += (ex / d) * (r - d);
      y += (ey / d) * (r - d);
    } else {
      const mx = (s[i]! + s[i + 2]!) / 2;
      const my = (s[i + 1]! + s[i + 3]!) / 2;
      const px = (s[i + 2]! - s[i]!) / 2 - Math.abs(x - mx);
      const py = (s[i + 3]! - s[i + 1]!) / 2 - Math.abs(y - my);
      if (px < py) x += (x < mx ? -1 : 1) * (px + r);
      else y += (y < my ? -1 : 1) * (py + r);
    }
  }
  pushed.x = x;
  pushed.y = y;
  return moved;
}

/** Does the segment cross cover that stops bullets? (Slab test per box.) */
export function segmentCovered(g: MapGeo, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const c = g.cover;
  for (let i = 0, n = g.nCover * 4; i < n; i += 4) {
    let tmin = 0;
    let tmax = 1;
    if (dx > -1e-12 && dx < 1e-12) {
      if (x0 < c[i]! || x0 > c[i + 2]!) continue;
    } else {
      let t1 = (c[i]! - x0) / dx;
      let t2 = (c[i + 2]! - x0) / dx;
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    if (dy > -1e-12 && dy < 1e-12) {
      if (y0 < c[i + 1]! || y0 > c[i + 3]!) continue;
    } else {
      let t1 = (c[i + 1]! - y0) / dy;
      let t2 = (c[i + 3]! - y0) / dy;
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    return true;
  }
  return false;
}

/** How far a ray from (x, y) along the unit vector (dx, dy) runs before it meets a solid box or the arena edge (capped at `max`). */
export function rayFree(g: MapGeo, x: number, y: number, dx: number, dy: number, max: number): number {
  let t = max;
  if (dx > 1e-9) t = Math.min(t, (ARENA_HALF_W - x) / dx);
  else if (dx < -1e-9) t = Math.min(t, (-ARENA_HALF_W - x) / dx);
  if (dy > 1e-9) t = Math.min(t, (ARENA_HALF_H - y) / dy);
  else if (dy < -1e-9) t = Math.min(t, (-ARENA_HALF_H - y) / dy);
  const s = g.solid;
  for (let i = 0, n = g.nSolid * 4; i < n; i += 4) {
    let tmin = 0;
    let tmax = t;
    if (dx > -1e-12 && dx < 1e-12) {
      if (x < s[i]! || x > s[i + 2]!) continue;
    } else {
      let t1 = (s[i]! - x) / dx;
      let t2 = (s[i + 2]! - x) / dx;
      if (t1 > t2) {
        const q = t1;
        t1 = t2;
        t2 = q;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    if (dy > -1e-12 && dy < 1e-12) {
      if (y < s[i + 1]! || y > s[i + 3]!) continue;
    } else {
      let t1 = (s[i + 1]! - y) / dy;
      let t2 = (s[i + 3]! - y) / dy;
      if (t1 > t2) {
        const q = t1;
        t1 = t2;
        t2 = q;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    if (tmin < t) t = tmin;
  }
  return t < 0 ? 0 : t;
}

/** Result of `intercept`. */
export const hit = { t: 0, x: 0, y: 0 };

/**
 * Where to aim to hit a target that moves with constant velocity (vx, vy per second) with a bullet of the given speed fired from
 * (sx, sy): the smallest positive time t with |target + v t - shooter| = speed t. Result in `hit` (the point and the time);
 * returns false when the target outruns the bullet, in which case `hit` is the target's current position.
 */
export function intercept(sx: number, sy: number, tx: number, ty: number, vx: number, vy: number, speed: number): boolean {
  const rx = tx - sx;
  const ry = ty - sy;
  const a = vx * vx + vy * vy - speed * speed;
  const b = 2 * (rx * vx + ry * vy);
  const c = rx * rx + ry * ry;
  let t = -1;
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) > 1e-9) t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / (2 * a);
      const t2 = (-b + sq) / (2 * a);
      t = t1 > 0 && t2 > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
    }
  }
  if (t > 0 && Number.isFinite(t)) {
    hit.t = t;
    hit.x = tx + vx * t;
    hit.y = ty + vy * t;
    return true;
  }
  hit.t = 0;
  hit.x = tx;
  hit.y = ty;
  return false;
}

/** Distance from the point (px, py) to the segment (ax, ay)-(bx, by). */
export function pointSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 1e-12 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px;
  const qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}

/** Smallest squared distance between two points that move linearly over one step: a from a0 to a1 and b from b0 to b1. */
export function movingDist2(a0x: number, a0y: number, a1x: number, a1y: number, b0x: number, b0y: number, b1x: number, b1y: number): number {
  const r0x = a0x - b0x;
  const r0y = a0y - b0y;
  const dx = a1x - b1x - r0x;
  const dy = a1y - b1y - r0y;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 1e-12 ? -(r0x * dx + r0y * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = r0x + dx * t;
  const qy = r0y + dy * t;
  return qx * qx + qy * qy;
}

/**
 * Signed distance from a point to a ground attack: negative inside. A circle is (cx, cy, radius); a rectangle reaches `l` either
 * way along `angle` from the centre and `w` either way across it. The distance of a rectangle is the larger of the two axis gaps
 * (not the exact euclidean value, which is not needed to rank escape routes).
 */
export function teleDist(shape: number, cx: number, cy: number, w: number, l: number, angle: number, px: number, py: number): number {
  const dx = px - cx;
  const dy = py - cy;
  if (shape === 0) return Math.sqrt(dx * dx + dy * dy) - w;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const lx = Math.abs(dx * c + dy * s) - l;
  const ly = Math.abs(-dx * s + dy * c) - w;
  return lx > ly ? lx : ly;
}

/** Normalise an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  const t = Math.PI * 2;
  a = a % t;
  if (a > Math.PI) a -= t;
  else if (a <= -Math.PI) a += t;
  return a;
}

/** Is a layer-1 character able to stand here? (Deck or ramp.) */
export const onDeck = (g: MapGeo, x: number, y: number): boolean => deckWalkable(g.map, x, y);
