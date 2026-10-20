import { BALANCE, Buttons, CLASS_IDS, ENEMY_TYPES, PERK, PERKS, PickupType, STAT, STATS, WEAPON_IDS, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld, restoreWorld, serializeWorld, hashWorld, spawnEnemy, step, type World } from '../src';
import { spawnPickup } from '../src/pickups';

const NONE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };
const FIRE: PlayerInput = { ...NONE, buttons: Buttons.Fire };
const stat = (w: World, s: number, id: number): number => w.pStat[s * STATS + id]!;
const cls = (n: string): number => CLASS_IDS.indexOf(n as (typeof CLASS_IDS)[number]);

function arena(c: number, seed = 1): World {
  const w = createWorld(seed);
  w.waveTick = 1e9;
  w.countMul = 0;
  addPlayer(w, 0, 0, 0, 'pistol', c);
  w.pHp[0] = w.pMaxHp[0] = 100;
  return w;
}

describe('the numbers of a run', () => {
  it('shots, hits, the biggest hit, kills and the time alive are counted', () => {
    const w = arena(cls('soldier'));
    const e = spawnEnemy(w, ENEMY_TYPES.indexOf('tank'), 6, 0, false);
    w.eCooldown[e] = 1e9;
    w.eFrost[e] = 1e6;
    for (let t = 0; t < 60; t++) step(w, [FIRE]);
    expect(stat(w, 0, STAT.Shots)).toBeGreaterThan(3);
    expect(stat(w, 0, STAT.Hits)).toBeGreaterThan(0);
    expect(stat(w, 0, STAT.MaxHit)).toBeGreaterThan(5);
    expect(stat(w, 0, STAT.AliveTicks)).toBe(60);
    expect(w.pWpnTime[0 * 16 + w.pWeapon[0]!]).toBe(60);
    expect(stat(w, 0, STAT.Distance)).toBe(0);
  });

  it('swings, barrels, healing and pickups are counted', () => {
    const w = arena(cls('swordsman'), 2);
    w.brActive[0] = 1;
    w.brHp[0] = BALANCE.barrels.hp;
    w.brX[0] = 1.4;
    w.brY[0] = 0;
    for (let t = 0; t < 12; t++) step(w, [FIRE]);
    expect(stat(w, 0, STAT.Swings)).toBeGreaterThan(0);
    expect(stat(w, 0, STAT.Barrels)).toBe(1);
    w.pHp[0] = 40;
    spawnPickup(w, PickupType.Health, w.pX[0]!, w.pY[0]!);
    step(w, [NONE]);
    expect(stat(w, 0, STAT.Pickups)).toBe(1);
    expect(stat(w, 0, STAT.Healed)).toBeGreaterThan(BALANCE.pickups.healthAmount * 0.9);
    // the blade player regenerates fast and every point of it is counted too
    const before = stat(w, 0, STAT.Healed);
    w.pHp[0] = 20;
    for (let t = 0; t < 30; t++) step(w, [NONE]);
    expect(stat(w, 0, STAT.Healed)).toBeGreaterThan(before + 2);
  });

  it('distance, dashes and abilities add up, and the numbers survive a snapshot', () => {
    const w = arena(cls('scout'), 3);
    for (let t = 0; t < 30; t++) step(w, [{ ...NONE, moveX: 127, buttons: t === 5 ? Buttons.Dash : 0 }]);
    for (let t = 0; t < 4; t++) step(w, [{ ...NONE, buttons: Buttons.Special }]);
    expect(stat(w, 0, STAT.Distance)).toBeGreaterThan(8);
    expect(stat(w, 0, STAT.Dashes)).toBe(1);
    expect(stat(w, 0, STAT.Abilities)).toBe(1);
    const copy = createWorld(3);
    restoreWorld(copy, serializeWorld(w));
    expect(hashWorld(copy)).toBe(hashWorld(w));
    expect(stat(copy, 0, STAT.Distance)).toBe(stat(w, 0, STAT.Distance));
    void PERK;
    void PERKS;
    void WEAPON_IDS;
  });

  it('a character that joins a used slot starts from zero', () => {
    const w = arena(cls('soldier'), 4);
    for (let t = 0; t < 20; t++) step(w, [FIRE]);
    expect(stat(w, 0, STAT.Shots)).toBeGreaterThan(0);
    addPlayer(w, 0, 0, 0, 'pistol', 1);
    expect(stat(w, 0, STAT.Shots)).toBe(0);
    expect(stat(w, 0, STAT.AliveTicks)).toBe(0);
  });
});
