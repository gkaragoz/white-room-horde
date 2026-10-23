import { ARENA_HALF_H, ARENA_HALF_W, BALANCE } from '@wrh/shared';
import { onDeck, type MapGeo } from './geometry';

/**
 * The room to run in. The arena is cut into 2 x 2 cells. Two distance fields are computed around the obstacles, both only near
 * the bot: how far the bot is from each cell and how far the nearest enemy is. With the two speeds that gives who arrives first;
 * the cells the bot reaches clearly first are its territory, and `territoryAt` is the share of territory around a point. A dead-end
 * lane, a corner or a spot the crowd is about to cut off has little territory around it, an open stretch behind the bot has a
 * lot, which is what a two second look ahead cannot see on its own. (Dial's bucket queue on integer lengths, 10 per cell, 14
 * on a diagonal: no heap, no allocation.)
 */

export const CELL = 2;
export const NX = (ARENA_HALF_W * 2) / CELL;
export const NY = (ARENA_HALF_H * 2) / CELL;
const N = NX * NY;
const WIN = 5; // window half size in cells (10 units)
const INF = 1 << 29;
/** How far the bot's field reaches (length units of 10 per cell: 170 = 17 cells = 34 units). */
const LIM_ME = 170;
const LIM_EN = 130;

const blockedCache = new Map<string, Uint8Array>();

/** Cells a character cannot stand in (an obstacle within its body plus a little), per map and layer. */
function blockedOf(g: MapGeo, mapIndex: number, layer: number): Uint8Array {
  const key = mapIndex * 4 + layer * 2 + (g.open ? 1 : 0);
  let b = blockedCache.get(String(key));
  if (b) return b;
  b = new Uint8Array(N);
  const m = BALANCE.player.radius + 0.35;
  for (let cy = 0; cy < NY; cy++) {
    for (let cx = 0; cx < NX; cx++) {
      const x = -ARENA_HALF_W + (cx + 0.5) * CELL;
      const y = -ARENA_HALF_H + (cy + 0.5) * CELL;
      let blocked = false;
      for (let i = 0, n = g.nSolid * 4; i < n; i += 4) {
        if (x > g.solid[i]! - m && x < g.solid[i + 2]! + m && y > g.solid[i + 1]! - m && y < g.solid[i + 3]! + m) {
          blocked = true;
          break;
        }
      }
      if (!blocked && layer === 1 && !onDeck(g, x, y)) blocked = true;
      if (blocked) b[cy * NX + cx] = 1;
    }
  }
  blockedCache.set(String(key), b);
  return b;
}

const myD = new Int32Array(N);
const enD = new Int32Array(N);
const sat = new Int32Array((NX + 1) * (NY + 1));
// bucket queue
const LIM_GOAL = 1500;
const MAXB = LIM_GOAL + 15;
const bucketHead = new Int32Array(MAXB);
const entNode = new Int32Array(N * 8 + 64);
const entNext = new Int32Array(N * 8 + 64);
let entN = 0;

const cellX = (x: number): number => {
  const c = Math.floor((x + ARENA_HALF_W) / CELL);
  return c < 0 ? 0 : c >= NX ? NX - 1 : c;
};
const cellY = (y: number): number => {
  const c = Math.floor((y + ARENA_HALF_H) / CELL);
  return c < 0 ? 0 : c >= NY ? NY - 1 : c;
};

const OFF = [1, -1, NX, -NX, NX + 1, -NX + 1, NX - 1, -NX - 1];
const DXs = [1, -1, 0, 0, 1, 1, -1, -1];
const DYs = [0, 0, 1, -1, 1, -1, 1, -1];
const COST = [10, 10, 10, 10, 14, 14, 14, 14];

function addEntry(d: number, node: number): void {
  entNode[entN] = node;
  entNext[entN] = bucketHead[d]!;
  bucketHead[d] = entN++;
}

/** Expand the seeds already placed in `dist` and the buckets, out to length `lim`. */
function spread(dist: Int32Array, blocked: Uint8Array, lim: number): void {
  for (let d = 0; d <= lim; d++) {
    for (let e = bucketHead[d]!; e >= 0; e = entNext[e]!) {
      const id = entNode[e]!;
      if (dist[id]! !== d) continue;
      const cx = id % NX;
      const cy = (id / NX) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DXs[k]!;
        const ny = cy + DYs[k]!;
        if (nx < 0 || ny < 0 || nx >= NX || ny >= NY) continue;
        const nid = id + OFF[k]!;
        if (blocked[nid]) continue;
        if (k >= 4 && (blocked[cy * NX + nx] || blocked[ny * NX + cx])) continue;
        const nd = d + COST[k]!;
        if (nd < dist[nid]! && nd <= lim) {
          dist[nid] = nd;
          addEntry(nd, nid);
        }
      }
    }
  }
}

const goalD = new Int32Array(N);
let goalReady = false;

/**
 * Walking distances to a point over the whole arena (around the boxes): where to go to reach a far goal, such as the last enemies
 * of a floor. Afterwards `goalDist` answers for any point.
 */
export function goalField(g: MapGeo, mapIndex: number, layer: number, gx: number, gy: number): void {
  const blocked = blockedOf(g, mapIndex, layer);
  goalD.fill(INF);
  bucketHead.fill(-1);
  entN = 0;
  // the goal itself may sit in a blocked cell (an enemy hugging a wall): start from its cell regardless
  const c = cellY(gy) * NX + cellX(gx);
  goalD[c] = 0;
  addEntry(0, c);
  spread(goalD, blocked, LIM_GOAL);
  goalReady = true;
}

/**
 * Walking distance in units from (x, y) to the goal of the last `goalField` (a large number when it cannot be reached). A bot that
 * hugs a wall stands in a cell the field keeps clear of walls, so the nearest cells around count as well.
 */
export function goalDist(x: number, y: number): number {
  if (!goalReady) return 1e6;
  const cx = cellX(x);
  const cy = cellY(y);
  let best = INF;
  for (let dy = -1; dy <= 1; dy++) {
    const ny = cy + dy;
    if (ny < 0 || ny >= NY) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx;
      if (nx < 0 || nx >= NX) continue;
      const d = goalD[ny * NX + nx]!;
      if (d < best) best = d;
    }
  }
  return best >= INF ? 1e6 : (best / 10) * CELL;
}

/** Result of `goalWaypoint`. */
export const waypoint = { x: 0, y: 0, ok: false };

/**
 * A point a few cells down the walking field toward the goal of the last `goalField`: where to head to get around whatever stands
 * between (the straight look-ahead of the planner cannot see around a corner). `ok` is false when no neighbour is nearer.
 */
export function goalWaypoint(x: number, y: number, cells = 3): void {
  waypoint.ok = false;
  if (!goalReady) return;
  let cx = cellX(x);
  let cy = cellY(y);
  let cur = goalD[cy * NX + cx]!;
  let moved = 0;
  for (let i = 0; i < cells; i++) {
    let best = cur;
    let bx = cx;
    let by = cy;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DXs[k]!;
      const ny = cy + DYs[k]!;
      if (nx < 0 || ny < 0 || nx >= NX || ny >= NY) continue;
      const d = goalD[ny * NX + nx]!;
      if (d < best) {
        best = d;
        bx = nx;
        by = ny;
      }
    }
    if (best >= cur) break;
    cur = best;
    cx = bx;
    cy = by;
    moved++;
  }
  if (moved === 0) return;
  waypoint.x = -ARENA_HALF_W + (cx + 0.5) * CELL;
  waypoint.y = -ARENA_HALF_H + (cy + 0.5) * CELL;
  waypoint.ok = true;
}

let ready = false;
let satX0 = 0;
let satY0 = 0;
let satX1 = 0;
let satY1 = 0;

/**
 * Compute the fields for a bot at (px, py) with `speed`, against `n` enemies at (ex, ey) (all on the bot's layer), taking the
 * crowd to move at `crowdSpeed`. The bot needs to be `head` seconds ahead of the crowd to call a cell its own.
 */
export function computeField(g: MapGeo, mapIndex: number, layer: number, px: number, py: number, speed: number, n: number, ex: Float64Array, ey: Float64Array, head: number, crowdSpeed = 5.2): void {
  const blocked = blockedOf(g, mapIndex, layer);
  // only the stretch around the bot is touched
  const pcx = cellX(px);
  const pcy = cellY(py);
  const reach = Math.ceil(LIM_ME / 10) + WIN + 1;
  satX0 = Math.max(0, pcx - reach);
  satX1 = Math.min(NX, pcx + reach + 1);
  satY0 = Math.max(0, pcy - reach);
  satY1 = Math.min(NY, pcy + reach + 1);
  for (let cy = satY0; cy < satY1; cy++) {
    const o = cy * NX;
    for (let cx = satX0; cx < satX1; cx++) {
      myD[o + cx] = INF;
      enD[o + cx] = INF;
    }
  }
  bucketHead.fill(-1);
  entN = 0;
  const pc = pcy * NX + pcx;
  myD[pc] = 0;
  addEntry(0, pc);
  spread(myD, blocked, LIM_ME);
  bucketHead.fill(-1);
  entN = 0;
  for (let i = 0; i < n; i++) {
    const cx = cellX(ex[i]!);
    const cy = cellY(ey[i]!);
    if (cx < satX0 - 14 || cx >= satX1 + 14 || cy < satY0 - 14 || cy >= satY1 + 14) continue;
    const c = cy * NX + cx;
    if (cx < satX0 || cx >= satX1 || cy < satY0 || cy >= satY1) continue;
    if (enD[c]! > 0) {
      enD[c] = 0;
      addEntry(0, c);
    }
  }
  spread(enD, blocked, LIM_EN);
  // territory mask into a summed-area table over the touched stretch. The bot is ahead when
  // myD / speed + head < enD / crowdSpeed (lengths are 10 per cell, a cell is CELL units).
  const kMe = CELL / 10 / speed;
  const kEn = CELL / 10 / crowdSpeed;
  const W = NX + 1;
  // the first row and column of the touched stretch read as zero
  for (let cx = satX0; cx <= satX1; cx++) sat[satY0 * W + cx] = 0;
  for (let cy = satY0; cy <= satY1; cy++) sat[cy * W + satX0] = 0;
  for (let cy = satY0; cy < satY1; cy++) {
    let row = 0;
    for (let cx = satX0; cx < satX1; cx++) {
      const id = cy * NX + cx;
      const m = myD[id]!;
      const e = enD[id]!;
      row += m < INF && (e >= INF || m * kMe + head < e * kEn) ? 1 : 0;
      sat[(cy + 1) * W + cx + 1] = sat[cy * W + cx + 1]! + row;
    }
  }
  ready = true;
}

/**
 * Share (0..1) of the window around (x, y) that is the bot's territory. Cells outside the arena, outside the area computed and
 * boxes count as not theirs.
 */
export function territoryAt(x: number, y: number): number {
  if (!ready) return 0;
  const cx = cellX(x);
  const cy = cellY(y);
  const x0 = Math.max(satX0, cx - WIN);
  const x1 = Math.min(satX1, cx + WIN + 1);
  const y0 = Math.max(satY0, cy - WIN);
  const y1 = Math.min(satY1, cy + WIN + 1);
  if (x1 <= x0 || y1 <= y0) return 0;
  const W = NX + 1;
  const s = sat[y1 * W + x1]! - sat[y0 * W + x1]! - sat[y1 * W + x0]! + sat[y0 * W + x0]!;
  return s / ((2 * WIN + 1) * (2 * WIN + 1));
}
