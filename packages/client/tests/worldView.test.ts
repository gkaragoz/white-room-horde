import { Difficulty, MISC, PlayerState, BALANCE } from '@wrh/shared';
import { addPlayer, createWorld, quietWorld, spawnBoss, spawnEnemy, type World } from '@wrh/sim';
import { describe, expect, it } from 'vitest';
import { LOW_HP, WorldView, viewOf } from '../src/view/worldView';

const world = (): World =>
  quietWorld({
    seed: 3,
    players: [
      { slot: 0, weapon: 'smg' },
      { slot: 1, x: 2 },
      { slot: 2, x: 4 },
    ],
  });

describe('WorldView: who is playing', () => {
  it('tells alive, downed and dead apart and lists the slots of each', () => {
    const w = world();
    w.pState[1] = PlayerState.Downed;
    w.pState[2] = PlayerState.Dead;
    const v = new WorldView(w);
    expect(v.alive(0)).toBe(true);
    expect(v.downed(1)).toBe(true);
    expect(v.alive(1)).toBe(false);
    expect(v.inGame(1)).toBe(true);
    expect(v.inGame(2)).toBe(false);
    expect(v.inGame(5)).toBe(false); // never joined
    expect([...v.aliveSlots]).toEqual([0]);
    expect([...v.downedSlots]).toEqual([1]);
    expect([...v.inGameSlots]).toEqual([0, 1]);
  });

  it('scans once per tick and again after the world has stepped on', () => {
    const w = world();
    const v = new WorldView(w);
    expect([...v.aliveSlots]).toEqual([0, 1, 2]);
    w.pState[2] = PlayerState.Dead;
    expect([...v.aliveSlots]).toEqual([0, 1, 2]); // same tick: not read again
    w.tick++;
    expect([...v.aliveSlots]).toEqual([0, 1]);
  });

  it('gives one view per world', () => {
    const w = world();
    expect(viewOf(w)).toBe(viewOf(w));
    expect(viewOf(world())).not.toBe(viewOf(w));
  });
});

describe('WorldView: health', () => {
  it('reads 1 unless alive, and flags low health below the threshold', () => {
    const w = world();
    const v = new WorldView(w);
    w.pHp[0] = w.pMaxHp[0]! * 0.5;
    expect(v.aliveHp(0)).toBeCloseTo(0.5, 9);
    expect(v.lowHealth(0)).toBe(false);
    w.pHp[0] = w.pMaxHp[0]! * (LOW_HP - 0.01);
    expect(v.lowHealth(0)).toBe(true);
    w.pState[0] = PlayerState.Downed;
    expect(v.aliveHp(0)).toBe(1);
    expect(v.lowHealth(0)).toBe(false);
  });

  it('shows the squad bar as health, bleed-out time left, or nothing', () => {
    const w = world();
    const v = new WorldView(w);
    w.pHp[0] = w.pMaxHp[0]! / 4;
    expect(v.healthFraction(0)).toBeCloseTo(0.25, 9);
    w.pState[1] = PlayerState.Downed;
    w.pTimer[1] = BALANCE.player.downedSeconds / 2;
    expect(v.healthFraction(1)).toBeCloseTo(0.5, 9);
    w.pState[2] = PlayerState.Dead;
    expect(v.healthFraction(2)).toBe(0);
  });
});

describe('WorldView: weapon and ammo', () => {
  it('finishes a reload sooner with a reload card, so the bar and the ring agree', () => {
    const w = world();
    const v = new WorldView(w);
    const reload = v.weaponStats(0).reload;
    w.pReload[0] = reload / 2;
    expect(v.reloading(0)).toBe(true);
    expect(v.reloadFraction(0)).toBeCloseTo(0.5, 9);
    w.modReload[0] = 0.5; // a card that halves the reload time
    w.pReload[0] = reload * 0.25; // a quarter of the old time = half of the new one
    expect(v.reloadFraction(0)).toBeCloseTo(0.5, 9);
    expect(v.ammoFraction(0)).toBeCloseTo(0.5, 9);
  });

  it('shows the magazine when not reloading', () => {
    const w = world();
    const v = new WorldView(w);
    w.pReload[0] = 0;
    w.pMag[0] = Math.floor(v.weaponStats(0).mag / 2);
    expect(v.reloadFraction(0)).toBe(0);
    expect(v.ammoFraction(0)).toBeCloseTo(w.pMag[0]! / v.weaponStats(0).mag, 9);
  });

  it('knows which weapons are owned', () => {
    const w = world();
    const v = new WorldView(w);
    w.pOwned[0] = 0b101;
    expect([v.owns(0, 0), v.owns(0, 1), v.owns(0, 2)]).toEqual([true, false, true]);
  });
});

describe('WorldView: the enemy side', () => {
  it('starts the boss bar full when titan bosses, a large squad and late floors make the boss tougher', () => {
    const w = createWorld(3, 0, Difficulty.bit('titanboss') | Difficulty.bit('tough'));
    w.waveTick = 1e9;
    w.countMul = 0;
    for (let s = 0; s < 4; s++) addPlayer(w, s, s * 2, 0, 'pistol');
    w.wave = 15;
    const b = spawnBoss(w);
    const plain = createWorld(3);
    addPlayer(plain, 0, 0, 0, 'pistol');
    plain.wave = 15;
    expect(w.eMaxHp[b]).toBeGreaterThan(plain.eMaxHp[spawnBoss(plain)]! * 2);
    expect(new WorldView(w).bossHealthFraction).toBe(1);
    w.eHp[b] = w.eHp[b]! * 0.9;
    expect(new WorldView(w).bossHealthFraction).toBeCloseTo(0.9, 9);
  });

  it('finds the boss, its health share and which enemies are heavy', () => {
    const w = world();
    let v = new WorldView(w);
    expect(v.bossUp).toBe(false);
    expect(v.bossIndex).toBe(-1);
    expect(v.bossHealthFraction).toBe(0);
    const b = spawnBoss(w);
    v = new WorldView(w);
    expect(v.bossIndex).toBe(b);
    expect(v.bossUp).toBe(true);
    expect(v.isHeavy(b)).toBe(true);
    // full is what this boss spawned with, whatever the floor, the squad size or the chosen Difficulty made of it
    expect(v.bossHealthFraction).toBe(1);
    w.eHp[b] = w.eMaxHp[b]! / 4;
    expect(v.bossHealthFraction).toBeCloseTo(0.25, 9);
    w.eHp[b] = w.eMaxHp[b]! * 10;
    expect(v.bossHealthFraction).toBe(1);
    w.eHp[b] = -5;
    expect(v.bossHealthFraction).toBe(0);
  });

  it('counts the enemies on the floor and those still to arrive', () => {
    const w = world();
    spawnEnemy(w, 0, 10, 0, false);
    w.misc[MISC.Remaining] = 7;
    const v = new WorldView(w);
    expect(v.enemyCount).toBe(1);
    expect(v.enemiesLeft).toBe(8);
    expect(v.isHeavy(0)).toBe(false);
  });
});
