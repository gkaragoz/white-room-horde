import { ARENA_HALF_H, ARENA_HALF_W, BALANCE } from '@wrh/shared';
import { onDeck, type MapGeo } from './geometry';

/**
 * The room to run in. The arena is cut into 2 x 2 cells. Two distance fields are computed around the obstacles, both only near
 * the bot: how far the bot is from each cell and how far the nearest enemy is. With the two speeds that gives who arrives first;
 * the cells the bot reaches clearly first are its territory, and `territoryAt` is the share of territory around a point. A dead-end
 * lane, a corner or a spot the crowd is about to cut off has little territory around it, an open stretch behind the bot has a
 * lot, which is what a two second look ahead cannot see on its own. (Dial's bucket queue on integer lengths, 10 per cell, 14
 * on a diagonal: no heap, no allocation; the grid has a wall of blocked cells round it so that no step needs a bounds check.)
 *
 * Each bot owns a `NavState` (its fields stay valid for a few ticks); `useNav` selects the one the functions below work on.
 */

export const CELL = 2;
export const NX = (ARENA_HALF_W * 2) / CELL;
export const NY = (ARENA_HALF_H * 2) / CELL;
const SX = NX + 2;
const SY = NY + 2;
const N = SX * SY;
const WIN = 5; // window half size in cells (10 units)
const INF = 1 << 29;
/** How far the bot's field reaches (length units of 10 per cell: 150 = 15 cells = 30 units). */
const LIM_ME = 150;
const LIM_EN = 120;
const LIM_GOAL = 1500;

/** The fields of one bot. */
export class NavState {
  readonly myD = new Int32Array(N);
  readonly enD = new Int32Array(N);
  readonly goalD = new Int32Array(N);
  readonly sat = new Int32Array((NX + 1) * (NY + 1));
  ready = false;
  goalReady = false;
  satX0 = 0;
  satY0 = 0;
  satX1 = 0;
  satY1 = 0;
  /** What the territory fields were computed for, to know when they have gone stale. */
  stampTick = -1e9;
  stampX = 0;
  stampY = 0;
  stampKey = -1;
  goalCell = -1;
  goalTick = -1e9;
  goalKey = -1;
}

let cur = new NavState();

/** Make `s` the state the functions of this module work on. */
export function useNav(s: NavState): void {
  cur = s;
}

const blockedCache = new Map<number, Uint8Array>();

const cellX = (x: number): number => {
  const c = Math.floor((x + ARENA_HALF_W) / CELL);
  return c < 0 ? 0 : c >= NX ? NX - 1 : c;
};
const cellY = (y: number): number => {
  const c = Math.floor((y + ARENA_HALF_H) / CELL);
  return c < 0 ? 0 : c >= NY ? NY - 1 : c;
};
/** Index of a cell in the padded grid. */
const idOf = (cx: number, cy: number): number => (cy + 1) * SX + cx + 1;

const keyOf = (g: MapGeo, mapIndex: number, layer: number): number => mapIndex * 4 + layer * 2 + (g.open ? 1 : 0);

/** Cells a character cannot stand in (an obstacle within its body plus a little), per map and layer. The border of the padded grid is blocked. */
function blockedOf(g: MapGeo, mapIndex: number, layer: number): Uint8Array {
  const key = keyOf(g, mapIndex, layer);
  let b = blockedCache.get(key);
  if (b) return b;
  b = new Uint8Array(N);
  for (let i = 0; i < SX; i++) {
    b[i] = 1;
    b[(SY - 1) * SX + i] = 1;
  }
  for (let j = 0; j < SY; j++) {
    b[j * SX] = 1;
    b[j * SX + SX - 1] = 1;
  }
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
      if (blocked) b[idOf(cx, cy)] = 1;
    }
  }
  blockedCache.set(key, b);
  return b;
}

// the bucket queue (used within one call, so shared)
const MAXB = LIM_GOAL + 15;
const bucketHead = new Int32Array(MAXB);
const entNode = new Int32Array(N * 8 + 64);
const entNext = new Int32Array(N * 8 + 64);
let entN = 0;

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
      const nd = d + 10;
      const east = id + 1;
      const west = id - 1;
      const north = id + SX;
      const south = id - SX;
      const be = blocked[east]!;
      const bw = blocked[west]!;
      const bn = blocked[north]!;
      const bs = blocked[south]!;
      if (nd <= lim) {
        if (!be && nd < dist[east]!) {
          dist[east] = nd;
          addEntry(nd, east);
        }
        if (!bw && nd < dist[west]!) {
          dist[west] = nd;
          addEntry(nd, west);
        }
        if (!bn && nd < dist[north]!) {
          dist[north] = nd;
          addEntry(nd, north);
        }
        if (!bs && nd < dist[south]!) {
          dist[south] = nd;
          addEntry(nd, south);
        }
      }
      const dd = d + 14;
      if (dd <= lim) {
        // no cutting corners through a diagonal gap
        if (!be && !bn) {
          const t = north + 1;
          if (!blocked[t] && dd < dist[t]!) {
            dist[t] = dd;
            addEntry(dd, t);
          }
        }
        if (!bw && !bn) {
          const t = north - 1;
          if (!blocked[t] && dd < dist[t]!) {
            dist[t] = dd;
            addEntry(dd, t);
          }
        }
        if (!be && !bs) {
          const t = south + 1;
          if (!blocked[t] && dd < dist[t]!) {
            dist[t] = dd;
            addEntry(dd, t);
          }
        }
        if (!bw && !bs) {
          const t = south - 1;
          if (!blocked[t] && dd < dist[t]!) {
            dist[t] = dd;
            addEntry(dd, t);
          }
        }
      }
    }
  }
}

/**
 * Walking distances to a point over the whole arena (around the boxes): where to go to reach a far goal, such as the last enemies
 * of a floor. Afterwards `goalDist` answers for any point. The field is kept for a few ticks while the goal stays in its cell.
 */
export function goalField(g: MapGeo, mapIndex: number, layer: number, gx: number, gy: number, tick = 0): void {
  const c = idOf(cellX(gx), cellY(gy));
  const key = keyOf(g, mapIndex, layer);
  if (cur.goalReady && cur.goalCell === c && cur.goalKey === key && tick - cur.goalTick < 8) return;
  const blocked = blockedOf(g, mapIndex, layer);
  const goalD = cur.goalD;
  goalD.fill(INF);
  bucketHead.fill(-1);
  entN = 0;
  // the goal itself may sit in a blocked cell (an enemy hugging a wall): start from its cell regardless
  goalD[c] = 0;
  addEntry(0, c);
  spread(goalD, blocked, LIM_GOAL);
  cur.goalReady = true;
  cur.goalCell = c;
  cur.goalKey = key;
  cur.goalTick = tick;
}

/**
 * Walking distance in units from (x, y) to the goal of the last `goalField` (a large number when it cannot be reached). A bot that
 * hugs a wall stands in a cell the field keeps clear of walls, so the nearest cells around count as well.
 */
export function goalDist(x: number, y: number): number {
  if (!cur.goalReady) return 1e6;
  const goalD = cur.goalD;
  const id = idOf(cellX(x), cellY(y));
  let best = goalD[id]!;
  for (let k = 0; k < 8; k++) {
    const d = goalD[id + NEIGH[k]!]!;
    if (d < best) best = d;
  }
  return best >= INF ? 1e6 : (best / 10) * CELL;
}

const NEIGH = [1, -1, SX, -SX, SX + 1, SX - 1, -SX + 1, -SX - 1];

/** Result of `goalWaypoint`. */
export const waypoint = { x: 0, y: 0, ok: false };

/**
 * A point a few cells down the walking field toward the goal of the last `goalField`: where to head to get around whatever stands
 * between (the straight look-ahead of the planner cannot see around a corner). `ok` is false when no neighbour is nearer.
 */
export function goalWaypoint(x: number, y: number, cells = 3): void {
  waypoint.ok = false;
  if (!cur.goalReady) return;
  const goalD = cur.goalD;
  let id = idOf(cellX(x), cellY(y));
  let here = goalD[id]!;
  let moved = 0;
  for (let i = 0; i < cells; i++) {
    let best = here;
    let bid = id;
    for (const o of NEIGH) {
      const d = goalD[id + o]!;
      if (d < best) {
        best = d;
        bid = id + o;
      }
    }
    if (best >= here) break;
    here = best;
    id = bid;
    moved++;
  }
  if (moved === 0) return;
  waypoint.x = -ARENA_HALF_W + ((id % SX) - 1 + 0.5) * CELL;
  waypoint.y = -ARENA_HALF_H + (Math.floor(id / SX) - 1 + 0.5) * CELL;
  waypoint.ok = true;
}

/** Are the territory fields of the current state still good for a bot at (x, y) at this tick? */
export function fieldFresh(g: MapGeo, mapIndex: number, layer: number, tick: number, x: number, y: number, maxAge: number): boolean {
  return cur.ready && cur.stampKey === keyOf(g, mapIndex, layer) && tick - cur.stampTick < maxAge && (x - cur.stampX) ** 2 + (y - cur.stampY) ** 2 < 6.25;
}

/**
 * Compute the fields for a bot at (px, py) with `speed`, against `n` enemies at (ex, ey) (all on the bot's layer), taking the
 * crowd to move at `crowdSpeed`. The bot needs to be `head` seconds ahead of the crowd to call a cell its own.
 */
export function computeField(g: MapGeo, mapIndex: number, layer: number, px: number, py: number, speed: number, n: number, ex: Float64Array, ey: Float64Array, head: number, tick = 0, crowdSpeed = 5.2): void {
  const blocked = blockedOf(g, mapIndex, layer);
  const myD = cur.myD;
  const enD = cur.enD;
  const sat = cur.sat;
  // only the stretch around the bot is touched
  const pcx = cellX(px);
  const pcy = cellY(py);
  const reach = Math.ceil(LIM_ME / 10) + WIN + 1;
  const satX0 = Math.max(0, pcx - reach);
  const satX1 = Math.min(NX, pcx + reach + 1);
  const satY0 = Math.max(0, pcy - reach);
  const satY1 = Math.min(NY, pcy + reach + 1);
  cur.satX0 = satX0;
  cur.satX1 = satX1;
  cur.satY0 = satY0;
  cur.satY1 = satY1;
  for (let cy = satY0; cy < satY1; cy++) {
    const o = idOf(0, cy);
    for (let cx = satX0; cx < satX1; cx++) {
      myD[o + cx] = INF;
      enD[o + cx] = INF;
    }
  }
  bucketHead.fill(-1, 0, LIM_ME + 15);
  entN = 0;
  const pc = idOf(pcx, pcy);
  myD[pc] = 0;
  addEntry(0, pc);
  spread(myD, blocked, LIM_ME);
  bucketHead.fill(-1, 0, LIM_EN + 15);
  entN = 0;
  for (let i = 0; i < n; i++) {
    const cx = cellX(ex[i]!);
    const cy = cellY(ey[i]!);
    if (cx < satX0 || cx >= satX1 || cy < satY0 || cy >= satY1) continue;
    const c = idOf(cx, cy);
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
    const o = idOf(0, cy);
    for (let cx = satX0; cx < satX1; cx++) {
      const m = myD[o + cx]!;
      const e = enD[o + cx]!;
      row += m < INF && (e >= INF || m * kMe + head < e * kEn) ? 1 : 0;
      sat[(cy + 1) * W + cx + 1] = sat[cy * W + cx + 1]! + row;
    }
  }
  cur.ready = true;
  cur.stampTick = tick;
  cur.stampX = px;
  cur.stampY = py;
  cur.stampKey = keyOf(g, mapIndex, layer);
}

/**
 * Share (0..1) of the window around (x, y) that is the bot's territory. Cells outside the arena, outside the area computed and
 * boxes count as not theirs.
 */
export function territoryAt(x: number, y: number): number {
  if (!cur.ready) return 0;
  const cx = cellX(x);
  const cy = cellY(y);
  const x0 = Math.max(cur.satX0, cx - WIN);
  const x1 = Math.min(cur.satX1, cx + WIN + 1);
  const y0 = Math.max(cur.satY0, cy - WIN);
  const y1 = Math.min(cur.satY1, cy + WIN + 1);
  if (x1 <= x0 || y1 <= y0) return 0;
  const W = NX + 1;
  const sat = cur.sat;
  const s = sat[y1 * W + x1]! - sat[y0 * W + x1]! - sat[y1 * W + x0]! + sat[y0 * W + x0]!;
  return s / ((2 * WIN + 1) * (2 * WIN + 1));
}
