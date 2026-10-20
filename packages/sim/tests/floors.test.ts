import { BALANCE, FloorPhase, MAP_COUNT, MISC, PlayerState, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld, hashWorld, restoreWorld, serializeWorld, spawnEnemy, step } from '../src';
import type { World } from '../src/state';

const NONE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };
const RIGHT: PlayerInput = { moveX: 127, moveY: 0, aim: 0, buttons: 1 };
const phase = (w: World): number => w.misc[MISC.Phase]!;
const secs = (s: number): number => Math.round(s * 30);

/** Run until the whole first batch has arrived, then kill everything the way a good player would. */
function clearFloor(w: World, inputs: PlayerInput[] = [NONE]): void {
  for (let t = 0; t < 30 * 60 && phase(w) === FloorPhase.Fight; t++) {
    step(w, inputs);
    // the player kills everything the moment it appears
    for (let i = 0; i < w.eActive.length; i++) {
      if (!w.eActive[i]) continue;
      w.eActive[i] = 0;
      w.enemyCount--;
    }
  }
}

function until(w: World, what: (w: World) => boolean, max = 30 * 60, inputs: PlayerInput[] = [NONE]): number {
  let n = 0;
  while (!what(w) && n < max) {
    step(w, inputs);
    n++;
  }
  return n;
}

describe('floors', () => {
  it('the next floor never starts while an enemy is alive', () => {
    const w = createWorld(31);
    addPlayer(w, 0, 0, 0);
    w.pHp[0] = 1e9;
    w.pMaxHp[0] = 1e9;
    for (let t = 0; t < 30 * 120; t++) step(w, [NONE]);
    expect(w.wave).toBe(1);
    expect(phase(w)).toBe(FloorPhase.Fight);
    expect(w.enemyCount).toBeGreaterThan(0);
  });

  it('a clear gives a 5 second countdown, then a locked flight, then a second countdown, then the next floor', () => {
    const w = createWorld(32);
    addPlayer(w, 0, 0, 0);
    clearFloor(w);
    expect(phase(w)).toBe(FloorPhase.Cleared);
    const clearedAt = w.tick;
    // the countdown is free: the player can still move
    const x0 = w.pX[0]!;
    for (let t = 0; t < 10; t++) step(w, [RIGHT]);
    expect(w.pX[0]).toBeGreaterThan(x0);
    const n = until(w, (x) => phase(x) === FloorPhase.Ascend);
    expect(w.tick - clearedAt).toBe(secs(BALANCE.floors.clearedSeconds));
    expect(n).toBeGreaterThan(0);
    // during the flight nobody moves or shoots
    const ascendAt = w.tick;
    const xs = w.pX[0]!;
    const mag = w.pMag[0]!;
    until(w, (x) => phase(x) === FloorPhase.Arrive, 30 * 10, [RIGHT]);
    expect(w.tick - ascendAt).toBe(secs(BALANCE.floors.ascendSeconds));
    expect(w.pMag[0]).toBe(mag);
    expect(Math.abs(w.pX[0]! - xs)).toBeLessThan(5); // moved only by the placement on the new floor
    // the new floor: next map, next wave, nobody there yet
    expect(w.wave).toBe(2);
    expect(w.map).toBe(1 % MAP_COUNT);
    expect(w.enemyCount).toBe(0);
    const arrivedAt = w.tick;
    until(w, (x) => phase(x) === FloorPhase.Fight);
    expect(w.tick - arrivedAt).toBe(secs(BALANCE.floors.arriveSeconds));
    for (let t = 0; t < 60; t++) step(w, [NONE]);
    expect(w.enemyCount).toBeGreaterThan(0);
  });

  it('fires the floor events in order and the party is brought back at half health', () => {
    const w = createWorld(33);
    addPlayer(w, 0, 0, 0);
    addPlayer(w, 1, 3, 0);
    clearFloor(w);
    w.pState[1] = PlayerState.Downed;
    w.pHp[1] = 0;
    w.pHp[0] = 10;
    const seen: string[] = [];
    for (let t = 0; t < 30 * 20; t++) {
      step(w, [NONE, NONE]);
      for (const e of w.events) if (['waveCleared', 'floorAscend', 'floorEnter', 'floorArrive', 'waveStart'].includes(e.type)) seen.push(e.type);
      if (seen.includes('waveStart')) break;
    }
    expect(seen).toEqual(['floorAscend', 'floorEnter', 'floorArrive', 'waveStart']);
    expect(w.pState[1]).toBe(PlayerState.Alive);
    // brought back at half health (a little regeneration may already have ticked in)
    expect(w.pHp[1]).toBeGreaterThanOrEqual(w.pMaxHp[1]! * BALANCE.floors.reviveHp - 1e-6);
    expect(w.pHp[1]).toBeLessThan(w.pMaxHp[1]! * 0.7);
    // the two players stand on the new floor, a couple of units from the middle
    for (const s of [0, 1]) expect(Math.hypot(w.pX[s]!, w.pY[s]!)).toBeLessThan(3);
    expect(w.bActive.some((v) => v === 1)).toBe(false);
  });

  it('keeps climbing: floor after floor, through every map', () => {
    const w = createWorld(34);
    addPlayer(w, 0, 0, 0);
    w.pHp[0] = 1e9;
    w.pMaxHp[0] = 1e9;
    const maps: number[] = [w.map];
    for (let floor = 0; floor < MAP_COUNT + 1; floor++) {
      clearFloor(w);
      until(w, (x) => phase(x) === FloorPhase.Fight, 30 * 30);
      maps.push(w.map);
    }
    expect(w.wave).toBe(MAP_COUNT + 2);
    expect(new Set(maps).size).toBe(MAP_COUNT);
    expect(maps[maps.length - 1]).toBe(maps[1]);
  });

  it('is deterministic and survives a snapshot taken in the middle of the flight', () => {
    const run = (): World => {
      const w = createWorld(35);
      addPlayer(w, 0, 0, 0);
      clearFloor(w);
      return w;
    };
    const a = run();
    const b = run();
    expect(hashWorld(a)).toBe(hashWorld(b));
    until(a, (x) => phase(x) === FloorPhase.Ascend);
    for (let t = 0; t < 40; t++) step(a, [NONE]);
    const copy = createWorld(1);
    restoreWorld(copy, serializeWorld(a));
    expect(hashWorld(copy)).toBe(hashWorld(a));
    for (let t = 0; t < 30 * 12; t++) {
      step(a, [NONE]);
      step(copy, [NONE]);
    }
    expect(hashWorld(copy)).toBe(hashWorld(a));
    expect(phase(a)).toBe(FloorPhase.Fight);
    expect(a.wave).toBe(2);
  });

  it('a spawner enemy added late still keeps the floor open', () => {
    const w = createWorld(36);
    addPlayer(w, 0, 0, 0);
    clearFloor(w);
    expect(phase(w)).toBe(FloorPhase.Cleared);
    // the countdown is under way and nothing can reopen it by itself
    spawnEnemy(w, 0, 10, 10);
    for (let t = 0; t < 30; t++) step(w, [NONE]);
    expect(phase(w)).toBe(FloorPhase.Cleared);
  });
});
