import { ARENA_HALF_H, ARENA_HALF_W, MAX_ENEMIES } from '@wrh/shared';

export const SH_CELL = 1.5;
export const SH_W = Math.ceil((ARENA_HALF_W * 2) / SH_CELL) + 1;
export const SH_H = Math.ceil((ARENA_HALF_H * 2) / SH_CELL) + 1;

/** Uniform grid over the enemies (linked lists in typed arrays). Rebuilt every tick in slot order. */
export class SpatialHash {
  readonly head = new Int32Array(SH_W * SH_H);
  readonly next = new Int32Array(MAX_ENEMIES);

  clear(): void {
    this.head.fill(-1);
  }

  cellOf(x: number, y: number): number {
    let cx = Math.floor((x + ARENA_HALF_W) / SH_CELL);
    let cy = Math.floor((y + ARENA_HALF_H) / SH_CELL);
    if (cx < 0) cx = 0;
    else if (cx >= SH_W) cx = SH_W - 1;
    if (cy < 0) cy = 0;
    else if (cy >= SH_H) cy = SH_H - 1;
    return cy * SH_W + cx;
  }

  insert(slot: number, x: number, y: number): void {
    const c = this.cellOf(x, y);
    this.next[slot] = this.head[c]!;
    this.head[c] = slot;
  }

  /** Cell coordinates (clamped) for a world position. */
  cellX(x: number): number {
    const c = Math.floor((x + ARENA_HALF_W) / SH_CELL);
    return c < 0 ? 0 : c >= SH_W ? SH_W - 1 : c;
  }

  cellY(y: number): number {
    const c = Math.floor((y + ARENA_HALF_H) / SH_CELL);
    return c < 0 ? 0 : c >= SH_H ? SH_H - 1 : c;
  }
}
