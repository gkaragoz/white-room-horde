import { describe, expect, it } from 'vitest';
import { geoOf } from '../src/geometry';
import { computeField, territoryAt } from '../src/nav';

const ex = new Float64Array(64);
const ey = new Float64Array(64);

function field(x: number, y: number, enemies: [number, number][], map = 0): void {
  enemies.forEach(([a, b], i) => {
    ex[i] = a;
    ey[i] = b;
  });
  computeField(geoOf(map, 0), map, 0, x, y, 12, enemies.length, ex, ey, 0.3);
}

describe('nav: room to run', () => {
  it('is wide open in the middle of an empty arena and cramped in a corner', () => {
    field(0, 0, []);
    const middle = territoryAt(0, 0);
    field(-50, -33, []);
    const corner = territoryAt(-50, -33);
    expect(middle).toBeGreaterThan(0.8);
    expect(corner).toBeLessThan(middle * 0.6);
  });

  it('shrinks when a crowd stands between the bot and the open ground', () => {
    // the field map has few boxes: a bot on the left edge with a wall of enemies two cells from it
    field(-30, 0, []);
    const free = territoryAt(-26, 0);
    field(-30, 0, [[-26, -6], [-26, -3], [-26, 0], [-26, 3], [-26, 6]]);
    const blocked = territoryAt(-26, 0);
    expect(blocked).toBeLessThan(free);
  });

  it('counts a dead-end lane as little room', () => {
    // warehouse: the lane between the shelf at y = -29 and the south wall runs west to the arena edge
    field(-30, -32.5, []);
    const lane = territoryAt(-30, -32.5);
    field(0, 0, []);
    const open = territoryAt(0, 0);
    expect(lane).toBeLessThan(open * 0.6);
  });
});
