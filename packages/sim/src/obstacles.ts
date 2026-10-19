import { ARENA_HALF_H, ARENA_HALF_W, OBSTACLES } from '@wrh/shared';
import { FF_H, FF_W, type FlowField } from './flowfield';
import { sqrt } from './detmath';

/** Mark the flow field cells covered by obstacles (with a small margin so paths keep clear of corners). */
export function applyObstacles(field: FlowField): void {
  for (const o of OBSTACLES) {
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
}

export const out = { x: 0, y: 0 };

/** Push a circle out of every obstacle; result in `out`. Returns true if it moved. */
export function pushOut(x: number, y: number, r: number): boolean {
  let moved = false;
  for (const o of OBSTACLES) {
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

/** Does the segment (x0,y0)-(x1,y1) cross an obstacle? Slab test per box. */
export function segmentBlocked(x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (const o of OBSTACLES) {
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
