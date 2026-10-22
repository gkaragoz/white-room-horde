import { MAPS, rampAt, rampDir, type Ramp } from '@wrh/shared';
import type { World } from '@wrh/sim';

/** A point to walk to and the length of the whole way (to the point, over the ramp, on to the goal). */
export interface Leg {
  x: number;
  y: number;
  length: number;
}

const ends = (r: Ramp): { foot: { x: number; y: number }; top: { x: number; y: number }; len: number } => {
  const [dx, dy] = rampDir(r);
  const len = r.dir === 0 || r.dir === 2 ? r.w : r.h;
  return { foot: { x: r.x - (dx * len) / 2, y: r.y - (dy * len) / 2 }, top: { x: r.x + (dx * len) / 2, y: r.y + (dy * len) / 2 }, len };
};

/**
 * On a layered map, the next waypoint toward a goal on the other layer: the near end of the best ramp, or (already on a ramp) its far
 * end. Null when both stand on the same layer (go straight), or there is no ramp.
 */
export function legToLayer(w: World, x: number, y: number, layer: number, gx: number, gy: number, goalLayer: number): Leg | null {
  if (layer === goalLayer) return null;
  const map = MAPS[w.map] ?? MAPS[0]!;
  const ramps = map.ramps;
  if (!ramps || ramps.length === 0) return null;
  const onRamp = rampAt(map, x, y);
  let best: Leg | null = null;
  for (let i = 0; i < ramps.length; i++) {
    const r = ramps[i]!;
    const e = ends(r);
    // a ground walker enters at the foot and leaves at the top; a deck walker the other way round
    const [ux, uy] = rampDir(r);
    const sg = layer === 0 ? 1 : -1;
    // aim a little past the ends so the walker crosses them instead of stopping on the edge
    const near = layer === 0 ? { x: e.foot.x + ux * 1, y: e.foot.y + uy * 1 } : { x: e.top.x - ux * 1, y: e.top.y - uy * 1 };
    const far = { x: (layer === 0 ? e.top.x : e.foot.x) + ux * sg * 1.5, y: (layer === 0 ? e.top.y : e.foot.y) + uy * sg * 1.5 };
    if (onRamp >= 0 && onRamp !== i) continue;
    const toNear = Math.hypot(near.x - x, near.y - y);
    const length = (onRamp === i ? 0 : toNear) + e.len + Math.hypot(gx - far.x, gy - far.y);
    if (!best || length < best.length) best = onRamp === i ? { x: far.x, y: far.y, length } : { x: near.x, y: near.y, length };
  }
  return best;
}
