import { BALANCE, ENEMY_TYPES, PickupType, WEAPON_IDS, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld, spawnEnemy, step } from '../src';
import { dropLoot, spawnPickup } from '../src/pickups';

const NONE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };

function quiet(seed: number): ReturnType<typeof createWorld> {
  const w = createWorld(seed);
  w.waveTick = 1e9;
  w.countMul = 0;
  return w;
}

describe('pickups', () => {
  it('ammo crate refills a finite weapon on contact', () => {
    const w = quiet(1);
    addPlayer(w, 0, 0, 0, 'ar');
    w.pAmmo[0] = 3;
    spawnPickup(w, PickupType.Ammo, 0.5, 0);
    step(w, [NONE]);
    expect(w.pAmmo[0]).toBe(BALANCE.weapons.ar.ammo);
    expect(w.events.some((e) => e.type === 'pickup')).toBe(true);
    expect(w.kActive.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('health restores up to the maximum; a healthy player leaves it for a teammate', () => {
    const w = quiet(2);
    addPlayer(w, 0, 0, 0);
    addPlayer(w, 1, 6, 0);
    w.pHp[1] = 40;
    spawnPickup(w, PickupType.Health, 0.4, 0);
    for (let t = 0; t < 3; t++) step(w, [NONE, NONE]);
    expect(w.kActive[0]).toBe(1); // slot 0 is at full health, so it is not taken
    spawnPickup(w, PickupType.Health, 6.4, 0);
    for (let t = 0; t < 3; t++) step(w, [NONE, NONE]);
    expect(w.pHp[1]!).toBeCloseTo(40 + BALANCE.pickups.healthAmount, 0); // out-of-combat regeneration adds a little
  });

  it('drifts toward a player who needs it and expires after its lifetime', () => {
    const w = quiet(3);
    addPlayer(w, 0, 0, 0, 'ar');
    w.pAmmo[0] = 1;
    spawnPickup(w, PickupType.Ammo, 2.2, 0);
    const x0 = w.kX[0]!;
    step(w, [NONE]);
    expect(w.kX[0]).toBeLessThan(x0);
    const w2 = quiet(4);
    addPlayer(w2, 0, 0, 0, 'pistol');
    spawnPickup(w2, PickupType.Health, 20, 10); // far away, full health: nobody wants it
    for (let t = 0; t < (BALANCE.pickups.lifeSeconds + 1) * 30; t++) step(w2, [NONE]);
    expect(w2.kActive[0]).toBe(0);
  });

  it('kills drop loot over time and bosses always drop a set', () => {
    const w = quiet(5);
    addPlayer(w, 0, -20, 0, 'ar');
    let drops = 0;
    for (let i = 0; i < 400; i++) {
      w.kActive.fill(0);
      dropLoot(w, 10, 10, false);
      if (w.kActive.some((a) => a === 1)) drops++;
    }
    expect(drops).toBeGreaterThan(15);
    expect(drops).toBeLessThan(120);
    w.kActive.fill(0);
    dropLoot(w, 0, 0, true);
    const n = BALANCE.pickups.bossDrops.ammo + BALANCE.pickups.bossDrops.health + BALANCE.pickups.bossDrops.grenade;
    expect(w.kActive.reduce((a, b) => a + b, 0)).toBe(n);
  });

  it('a killed enemy can leave a drop that the shooter then collects (end to end)', () => {
    let collected = 0;
    for (let seed = 1; seed <= 60 && !collected; seed++) {
      const w = quiet(seed);
      addPlayer(w, 0, 0, 0, 'ar');
      w.pAmmo[0] = 5;
      for (let k = 0; k < 6; k++) {
        const i = spawnEnemy(w, ENEMY_TYPES.indexOf('grunt'), 1.2 + k * 0.3, 0, false);
        w.eHp[i] = 1;
        w.eCooldown[i] = 1e9;
      }
      for (let t = 0; t < 40; t++) {
        step(w, [{ ...NONE, buttons: t < 20 ? 1 : 0 }]);
        for (const e of w.events) if (e.type === 'pickup') collected++;
      }
    }
    expect(collected).toBeGreaterThan(0);
    expect(WEAPON_IDS.length).toBeGreaterThan(0);
  });
});
