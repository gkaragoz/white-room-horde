import { describe, expect, it } from 'vitest';
import { geoOf } from '../src/geometry';
import { computeField, goalDist, goalField, territoryAt } from '../src/nav';

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

describe('nav: walking distances', () => {
  it('go around boxes and count the cells next to a wall for a bot that hugs it', () => {
    const g = geoOf(0, 0);
    // the shelf at (30, 9): its lower face is y = 8. The goal is straight behind it
    goalField(g, 0, 0, 30, 14);
    const around = goalDist(30, 5);
    expect(around).toBeGreaterThan(12);
    expect(around).toBeLessThan(40);
    // standing against the shelf (y = 7.55: the cell the field keeps clear of the box) still gives a number
    expect(goalDist(30, 7.55)).toBeLessThan(1e5);
  });

  it('say so when the goal cannot be reached', () => {
    // the deck of the overpass seen from the ground: a goal in the middle of the solid mass is out of reach
    const g = geoOf(6, 1);
    goalField(g, 6, 1, 0, -20);
    expect(goalDist(0, 17)).toBeGreaterThanOrEqual(1e5);
  });
});

