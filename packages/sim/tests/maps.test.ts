import { ARENA_HALF_H, ARENA_HALF_W, MAPS, deckAt, rampAt, type Box, type MapDef } from '@wrh/shared';
import { describe, expect, it } from 'vitest';

const W = ARENA_HALF_W * 2;
const H = ARENA_HALF_H * 2;

const inBox = (b: Box, x: number, y: number): boolean => Math.abs(x - b.x) <= b.w / 2 && Math.abs(y - b.y) <= b.h / 2;
const idx = (cx: number, cy: number): number => cy * W + cx;
const cx2x = (cx: number): number => cx + 0.5 - ARENA_HALF_W;
const cy2y = (cy: number): number => cy + 0.5 - ARENA_HALF_H;

/** Cells of one layer that cannot be entered (boxes that stop that layer; on the deck layer, also everything that is not a deck or a ramp). */
function blocked(map: MapDef, layer: 0 | 1): Uint8Array {
  const out = new Uint8Array(W * H);
  const bit = layer === 0 ? 1 : 2;
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const x = cx2x(cx);
      const y = cy2y(cy);
      let b = false;
      for (const box of map.boxes) if (((box.layers ?? 1) & bit) !== 0 && inBox(box, x, y)) b = true;
      if (layer === 1 && deckAt(map, x, y) < 0 && rampAt(map, x, y) < 0) b = true;
      out[idx(cx, cy)] = b ? 1 : 0;
    }
  }
  return out;
}

function flood(block: Uint8Array, start: number): Uint8Array {
  const seen = new Uint8Array(W * H);
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const cx = i % W;
    const cy = (i - cx) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = idx(nx, ny);
      if (block[j] || seen[j]) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

describe('every arena is well designed', () => {
  for (const map of MAPS) {
    it(`${map.id}: nothing sticks out of the arena, the open ground is one connected space and the edges are open to the crowd`, () => {
      for (const b of map.boxes) {
        expect(Math.abs(b.x) + b.w / 2, `${map.id} box at ${b.x},${b.y}`).toBeLessThanOrEqual(ARENA_HALF_W);
        expect(Math.abs(b.y) + b.h / 2, `${map.id} box at ${b.x},${b.y}`).toBeLessThanOrEqual(ARENA_HALF_H);
      }
      const ground = blocked(map, 0);
      let free = 0;
      let start = -1;
      for (let i = 0; i < ground.length; i++) {
        if (ground[i]) continue;
        free++;
        const cx = i % W;
        const cy = (i - cx) / W;
        if (start < 0 || Math.hypot(cx2x(cx), cy2y(cy)) < Math.hypot(cx2x(start % W), cy2y((start - (start % W)) / W))) start = i;
      }
      const seen = flood(ground, start);
      let reached = 0;
      for (let i = 0; i < ground.length; i++) if (!ground[i] && seen[i]) reached++;
      // no sealed pockets: the whole open ground can be reached from the middle
      expect(reached / free, `${map.id}: ${free - reached} open cells are cut off`).toBeGreaterThan(0.995);
      // the crowd arrives from the edges: most of the rim must be open and connected
      let rim = 0;
      let rimReached = 0;
      for (let cx = 0; cx < W; cx++) for (const cy of [0, H - 1]) if (!ground[idx(cx, cy)]) { rim++; if (seen[idx(cx, cy)]) rimReached++; }
      for (let cy = 0; cy < H; cy++) for (const cx of [0, W - 1]) if (!ground[idx(cx, cy)]) { rim++; if (seen[idx(cx, cy)]) rimReached++; }
      expect(rim / (2 * (W + H))).toBeGreaterThan(0.85);
      expect(rimReached).toBe(rim);
      // a good arena is mostly open: room to run and to gather a crowd
      expect(free / (W * H), `${map.id} is too crowded`).toBeGreaterThan(0.72);
    });
    if (map.decks) {
      it(`${map.id}: every deck can be reached by a ramp from the ground and walked over`, () => {
        const ground = blocked(map, 0);
        const deckLayer = blocked(map, 1);
        for (const r of map.ramps ?? []) {
          // the foot of every ramp stands on open ground
          const fx = r.dir === 0 ? r.x - r.w / 2 - 0.6 : r.dir === 2 ? r.x + r.w / 2 + 0.6 : r.x;
          const fy = r.dir === 1 ? r.y - r.h / 2 - 0.6 : r.dir === 3 ? r.y + r.h / 2 + 0.6 : r.y;
          const cx = Math.floor(fx + ARENA_HALF_W);
          const cy = Math.floor(fy + ARENA_HALF_H);
          expect(ground[idx(cx, cy)], `${map.id}: the foot of the ramp at ${r.x},${r.y} is blocked`).toBe(0);
        }
        // start on the deck at the top of each ramp and make sure the deck cells are all connected
        for (const d of map.decks!) {
          let deckCells = 0;
          let first = -1;
          for (let cy = 0; cy < H; cy++)
            for (let cx = 0; cx < W; cx++) {
              const x = cx2x(cx);
              const y = cy2y(cy);
              if (deckAt(map, x, y) !== map.decks!.indexOf(d) || deckLayer[idx(cx, cy)]) continue;
              deckCells++;
              if (first < 0) first = idx(cx, cy);
            }
          expect(deckCells).toBeGreaterThan(0);
          const seen = flood(deckLayer, first);
          let got = 0;
          for (let cy = 0; cy < H; cy++)
            for (let cx = 0; cx < W; cx++) if (deckAt(map, cx2x(cx), cy2y(cy)) === map.decks!.indexOf(d) && !deckLayer[idx(cx, cy)] && seen[idx(cx, cy)]) got++;
          expect(got / deckCells, `${map.id}: part of a deck is cut off`).toBeGreaterThan(0.99);
          // and at least one ramp comes up onto it
          const hasRamp = (map.ramps ?? []).some((r) => {
            const tx = r.dir === 0 ? r.x + r.w / 2 + 0.3 : r.dir === 2 ? r.x - r.w / 2 - 0.3 : r.x;
            const ty = r.dir === 1 ? r.y + r.h / 2 + 0.3 : r.dir === 3 ? r.y - r.h / 2 - 0.3 : r.y;
            return deckAt(map, tx, ty) === map.decks!.indexOf(d);
          });
          expect(hasRamp, `${map.id}: no ramp reaches the deck`).toBe(true);
        }
      });
    }
  }
});
