import { ARENA_HALF_H, ARENA_HALF_W } from '@wrh/shared';

export const FF_W = ARENA_HALF_W * 2; // 1 x 1 cells over the arena
export const FF_H = ARENA_HALF_H * 2;
const CELLS = FF_W * FF_H;
/** A heap key packs the cost above the cell index: this many bits for the index (the costs stay far below what is left of 31 bits). */
const IDX_BITS = ((): number => {
  let b = 0;
  while (1 << b < CELLS) b++;
  return b;
})();
const IDX_MASK = (1 << IDX_BITS) - 1;
const INF = 0x3fffffff;
const ORTHO = 10;
const DIAG = 14;
// fixed neighbour order (determinism): E, W, N, S, NE, SE, NW, SW
const NX = [1, -1, 0, 0, 1, 1, -1, -1];
const NY = [0, 0, 1, -1, 1, -1, 1, -1];
const NC = [ORTHO, ORTHO, ORTHO, ORTHO, DIAG, DIAG, DIAG, DIAG];
const INV_SQRT2 = 0.7071067811865476;

export function cellIndex(x: number, y: number): number {
  let cx = Math.floor(x + ARENA_HALF_W);
  let cy = Math.floor(y + ARENA_HALF_H);
  if (cx < 0) cx = 0;
  else if (cx >= FF_W) cx = FF_W - 1;
  if (cy < 0) cy = 0;
  else if (cy >= FF_H) cy = FF_H - 1;
  return cy * FF_W + cx;
}

/**
 * Shared multi-source flow field (docs/DESIGN.md section 17): every living player is a source, so one Dijkstra pass
 * gives each cell the direction to the nearest player around walls. Integer costs and a fixed neighbour order keep it
 * bit-identical on every machine.
 */
export class FlowField {
  readonly blocked = new Uint8Array(CELLS);
  readonly cost = new Int32Array(CELLS);
  readonly dirX = new Float64Array(CELLS);
  readonly dirY = new Float64Array(CELLS);
  private readonly heap = new Int32Array(CELLS * 6);
  private size = 0;

  private push(key: number): void {
    const h = this.heap;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p]! <= key) break;
      h[i] = h[p]!;
      i = p;
    }
    h[i] = key;
  }

  private pop(): number {
    const h = this.heap;
    const top = h[0]!;
    const last = h[--this.size]!;
    let i = 0;
    for (;;) {
      let c = i * 2 + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && h[c + 1]! < h[c]!) c++;
      if (h[c]! >= last) break;
      h[i] = h[c]!;
      i = c;
    }
    h[i] = last;
    return top;
  }

  /** Recompute costs and directions from the given source cell indices. */
  compute(sources: ArrayLike<number>, count: number): void {
    this.cost.fill(INF);
    this.size = 0;
    for (let i = 0; i < count; i++) {
      const s = sources[i]!;
      if (this.cost[s]! !== 0) {
        this.cost[s] = 0;
        this.push(s);
      }
    }
    while (this.size > 0) {
      const key = this.pop();
      const idx = key & IDX_MASK;
      const c = key >> IDX_BITS;
      if (c !== this.cost[idx]!) continue;
      const cx = idx % FF_W;
      const cy = (idx / FF_W) | 0;
      for (let n = 0; n < 8; n++) {
        const x = cx + NX[n]!;
        const y = cy + NY[n]!;
        if (x < 0 || y < 0 || x >= FF_W || y >= FF_H) continue;
        const ni = y * FF_W + x;
        if (this.blocked[ni]!) continue;
        if (n >= 4 && (this.blocked[cy * FF_W + x]! || this.blocked[y * FF_W + cx]!)) continue; // no corner cutting
        const nc = c + NC[n]!;
        if (nc < this.cost[ni]!) {
          this.cost[ni] = nc;
          this.push((nc << IDX_BITS) | ni);
        }
      }
    }
    for (let idx = 0; idx < CELLS; idx++) {
      const cx = idx % FF_W;
      const cy = (idx / FF_W) | 0;
      let best = this.cost[idx]!;
      let bx = 0;
      let by = 0;
      for (let n = 0; n < 8; n++) {
        const x = cx + NX[n]!;
        const y = cy + NY[n]!;
        if (x < 0 || y < 0 || x >= FF_W || y >= FF_H) continue;
        const nc = this.cost[y * FF_W + x]!;
        if (nc < best) {
          best = nc;
          bx = NX[n]!;
          by = NY[n]!;
        }
      }
      const k = bx !== 0 && by !== 0 ? INV_SQRT2 : 1;
      this.dirX[idx] = bx * k;
      this.dirY[idx] = by * k;
    }
  }
}
