import { ARENA_HALF_H, ARENA_HALF_W, MAPS } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { focusBoxes, focusRay, geoOf, hit, intercept, movingDist2, nearRamp, pointSegDist, pushOut, pushOutLocal, pushed, rampEnd, rampPoint, rayFree, segmentCovered, teleDist, wrapAngle } from '../src/geometry';

const WAREHOUSE = 0;

describe('geometry: boxes', () => {
  it('builds the solid boxes of a layer', () => {
    const g = geoOf(WAREHOUSE, 0);
    expect(g.nSolid).toBe(MAPS[WAREHOUSE]!.boxes.length);
    expect(g.solid.length).toBe(g.nSolid * 4);
  });

  it('pushes a circle out of a box along the shortest way', () => {
    const g = geoOf(WAREHOUSE, 0);
    // the shelf at (30, 9), 18 x 2: its top face is y = 10
    expect(pushOut(g, 30, 10.2, 0.45)).toBe(true);
    expect(pushed.x).toBeCloseTo(30, 6);
    expect(pushed.y).toBeCloseTo(10.45, 6);
    expect(pushOut(g, 30, 14, 0.45)).toBe(false);
  });

  it('pushes a centre that is inside a box out through the nearest face', () => {
    const g = geoOf(WAREHOUSE, 0);
    expect(pushOut(g, 30, 9.3, 0.45)).toBe(true);
    expect(pushed.y).toBeGreaterThan(10);
  });

  it('stops bullets at cover and lets them fly over a gap', () => {
    const g = geoOf(WAREHOUSE, 0);
    expect(segmentCovered(g, 30, 5, 30, 14)).toBe(true);
    expect(segmentCovered(g, 0, 20, 5, 20)).toBe(false);
  });

  it('measures the free run to a wall and to the arena edge', () => {
    const g = geoOf(WAREHOUSE, 0);
    expect(rayFree(g, 30, 5, 0, 1, 50)).toBeCloseTo(3, 6);
    expect(rayFree(g, 0, 20, 1, 0, 200)).toBeGreaterThan(5);
    expect(rayFree(g, ARENA_HALF_W - 3, 0, 1, 0, 50)).toBeCloseTo(3, 6);
    expect(rayFree(g, 0, -ARENA_HALF_H + 2, 0, -1, 50)).toBeCloseTo(2, 6);
  });
});

describe('geometry: lead', () => {
  it('aims straight at a standing target', () => {
    expect(intercept(0, 0, 10, 0, 0, 0, 50)).toBe(true);
    expect(hit.x).toBeCloseTo(10, 6);
    expect(hit.t).toBeCloseTo(0.2, 6);
  });

  it('leads a crossing target so the bullet and the target arrive together', () => {
    expect(intercept(0, 0, 20, 0, 0, 8, 60)).toBe(true);
    const flight = Math.hypot(hit.x, hit.y) / 60;
    expect(flight).toBeCloseTo(hit.t, 6);
    expect(hit.y).toBeCloseTo(8 * hit.t, 6);
  });

  it('gives up on a target that runs away faster than the bullet', () => {
    expect(intercept(0, 0, 10, 0, 80, 0, 60)).toBe(false);
    expect(hit.x).toBe(10);
  });
});

describe('geometry: shapes', () => {
  it('computes distance to a segment and between moving points', () => {
    expect(pointSegDist(0, 1, -5, 0, 5, 0)).toBeCloseTo(1, 9);
    expect(pointSegDist(8, 0, -5, 0, 5, 0)).toBeCloseTo(3, 9);
    // two points passing each other at 1 unit
    expect(Math.sqrt(movingDist2(-5, 0, 5, 0, 5, 1, -5, 1))).toBeCloseTo(1, 9);
  });

  it('tells inside from outside for circles and rotated rectangles', () => {
    expect(teleDist(0, 0, 0, 3, 0, 0, 1, 1)).toBeLessThan(0);
    expect(teleDist(0, 0, 0, 3, 0, 0, 5, 0)).toBeCloseTo(2, 9);
    // a rectangle 10 long (either way) and 1 wide, turned a quarter
    expect(teleDist(1, 0, 0, 1, 10, Math.PI / 2, 0.5, 8)).toBeLessThan(0);
    expect(teleDist(1, 0, 0, 1, 10, Math.PI / 2, 4, 0)).toBeGreaterThan(0);
  });

  it('wraps angles', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(wrapAngle(-3 * Math.PI / 2)).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe('geometry: the local list and the ramps', () => {
  it('keeps for a run only the boxes it can meet', () => {
    const g = geoOf(WAREHOUSE, 0);
    focusBoxes(g, 0, 0, 60);
    // straight up from the middle: nothing in the way for ten units
    focusRay(0, 0, 0, 1, 10, 3);
    expect(pushOutLocal(0, 0.1, 0.45)).toBe(false);
    // a run toward the shelf at (30, 9) (its lower face is y = 8) does meet it
    focusRay(30, 0, 0, 1, 10, 3);
    expect(pushOutLocal(30, 7.8, 0.45)).toBe(true);
    expect(pushed.y).toBeLessThan(7.6);
    // and a run in the middle of the arena, far from every box, keeps none
    focusRay(0, 20, 1, 0, 3, 1);
    expect(pushOutLocal(1, 20, 0.45)).toBe(false);
  });

  it('walls the ramps off on the ground unless asked, and never lets the ground run up the top of one', () => {
    const OVERPASS = 6;
    const closed = geoOf(OVERPASS, 0);
    const open = geoOf(OVERPASS, 0, true);
    // the foot of the west ramp (x -38.9 .. -32, y 14 .. 20)
    expect(pushOut(closed, -36, 17, 0.45)).toBe(true);
    expect(pushOut(open, -36, 17, 0.45)).toBe(false);
    // the top quarter of an open ramp is closed to the ground (stepping there lifts a character onto the deck)
    expect(pushOut(open, -33.2, 17, 0.45)).toBe(true);
  });

  it('knows where the ramps are and where their ends lie', () => {
    const map = geoOf(6, 0).map;
    expect(nearRamp(map, -36, 17, 0)).toBe(true);
    expect(nearRamp(map, 0, -20, 2)).toBe(false);
    rampPoint(map.ramps![0]!, true);
    const top = { x: rampEnd.x, y: rampEnd.y };
    rampPoint(map.ramps![0]!, false);
    expect(top.x).toBeGreaterThan(rampEnd.x);
    expect(Math.abs(top.y - rampEnd.y)).toBeLessThan(1e-9);
  });
});

