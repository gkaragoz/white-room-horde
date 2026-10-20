import { ARENA_HALF_H, ARENA_HALF_W, MAPS, deckWalkable, type Box, type MapDef } from '@wrh/shared';
import { FF_H, FF_W, type FlowField } from './flowfield';
import { sqrt } from './detmath';

let MAP: MapDef = MAPS[0]!;
let OBSTACLES: readonly Box[] = MAP.boxes;
let activeMap = 0;

/** Select the arena layout used by the collision helpers (called at the start of every step; cheap). */
export function useMap(map: number): void {
  if (map !== activeMap) {
    activeMap = map;
    MAP = MAPS[map] ?? MAPS[0]!;
    OBSTACLES = MAP.boxes;
  }
}

/** The layout in use (ramps and decks live in it). */
export function currentMap(): MapDef {
  return MAP;
}

/** Which obstacles stop an entity of this layer: bit 1 for the ground, bit 2 for a deck. */
const maskOf = (layer: number): number => (layer === 1 ? 2 : 1);

/**
 * Mark the flow field cells an entity of `layer` cannot enter (with a small margin so paths keep clear of corners). On the
 * deck layer everything that is not deck or ramp is closed as well.
 */
export function applyObstacles(field: FlowField, map = 0, layer = 0): void {
  useMap(map);
  field.blocked.fill(0);
  const mask = maskOf(layer);
  for (const o of OBSTACLES) {
    if (((o.layers ?? 1) & mask) === 0) continue;
    const x0 = o.x - o.w / 2 - 0.3;
    const x1 = o.x + o.w / 2 + 0.3;
    const y0 = o.y - o.h / 2 - 0.3;
    const y1 = o.y + o.h / 2 + 0.3;
    for (let cy = 0; cy < FF_H; cy++) {
      for (let cx = 0; cx < FF_W; cx++) {
        const wx = cx - ARENA_HALF_W;
        const wy = cy - ARENA_HALF_H;
        if (wx + 1 > x0 && wx < x1 && wy + 1 > y0 && wy < y1) field.blocked[cy * FF_W + cx] = 1;
      }
    }
  }
  if (layer === 1) {
    for (let cy = 0; cy < FF_H; cy++) {
      for (let cx = 0; cx < FF_W; cx++) {
        if (!deckWalkable(MAP, cx - ARENA_HALF_W + 0.5, cy - ARENA_HALF_H + 0.5)) field.blocked[cy * FF_W + cx] = 1;
      }
    }
  }
}

export const out = { x: 0, y: 0 };

/** Push a circle out of every obstacle of its layer; result in `out`. Returns true if it moved. */
export function pushOut(x: number, y: number, r: number, layer = 0): boolean {
  let moved = false;
  const mask = maskOf(layer);
  for (const o of OBSTACLES) {
    if (((o.layers ?? 1) & mask) === 0) continue;
    const hx = o.w / 2;
    const hy = o.h / 2;
    const dx = x - o.x;
    const dy = y - o.y;
    const cx = dx < -hx ? -hx : dx > hx ? hx : dx;
    const cy = dy < -hy ? -hy : dy > hy ? hy : dy;
    const ex = dx - cx;
    const ey = dy - cy;
    const d2 = ex * ex + ey * ey;
    if (d2 >= r * r) continue;
    moved = true;
    if (d2 > 1e-9) {
      const d = sqrt(d2);
      x += (ex / d) * (r - d);
      y += (ey / d) * (r - d);
    } else {
      // centre inside the box: leave through the nearest face
      const px = hx - (dx < 0 ? -dx : dx);
      const py = hy - (dy < 0 ? -dy : dy);
      if (px < py) x += (dx < 0 ? -1 : 1) * (px + r);
      else y += (dy < 0 ? -1 : 1) * (py + r);
    }
  }
  out.x = x;
  out.y = y;
  return moved;
}

/**
 * Does the segment (x0,y0)-(x1,y1) cross cover on this layer? Slab test per box. Only what stops bullets counts (a rail is
 * low and can be shot over), and a shot fired from a deck is stopped only by what stands on the deck.
 */
export function segmentBlocked(x0: number, y0: number, x1: number, y1: number, layer = 0): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const mask = maskOf(layer);
  for (const o of OBSTACLES) {
    if (((o.layers ?? 1) & mask) === 0 || o.cover === false) continue;
    let tmin = 0;
    let tmax = 1;
    const minX = o.x - o.w / 2;
    const maxX = o.x + o.w / 2;
    const minY = o.y - o.h / 2;
    const maxY = o.y + o.h / 2;
    if (dx > -1e-12 && dx < 1e-12) {
      if (x0 < minX || x0 > maxX) continue;
    } else {
      let t1 = (minX - x0) / dx;
      let t2 = (maxX - x0) / dx;
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
      if (y0 < minY || y0 > maxY) continue;
    } else {
      let t1 = (minY - y0) / dy;
      let t2 = (maxY - y0) / dy;
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
