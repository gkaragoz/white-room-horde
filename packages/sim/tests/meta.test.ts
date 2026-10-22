import { CARD_CLASS, CARD_IDS, DRONE_TYPES, FloorPhase, MAX_LEVEL, MISC, PickupType, WEAPON_IDS, poolAt, pressureAt } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { createGame, decodeReplay, encodeReplay, fxOf, grantDrone, modFx, playReplay, quietWorld, step, type Replay } from '../src';
import { ELITE, rollElite } from '../src/features';
import { dropLoot, pickWeapon } from '../src/pickups';
import { awardXp } from '../src/progression';
import { spawnEnemy } from '../src';
import { updateDiscovery } from '../src/discovery';

const NONE = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };

describe('the room level in the world', () => {
  it('defaults to the full game', () => {
    expect(quietWorld().metLevel).toBe(MAX_LEVEL);
    expect(createGame({ seed: 1, players: [{ slot: 0, weapon: 'pistol' }] }).metLevel).toBe(MAX_LEVEL);
  });

  it('takes the level from the setup and keeps it in the hash and the snapshot', () => {
    const a = createGame({ seed: 1, level: 5, players: [{ slot: 0, weapon: 'pistol' }] });
    const b = createGame({ seed: 1, players: [{ slot: 0, weapon: 'pistol' }] });
    expect(a.metLevel).toBe(5);
    step(a, [NONE]);
    step(b, [NONE]);
    expect(a.metLevel).toBe(5);
  });
});

describe('weapon crates follow the pool', () => {
  it('drop only open guns at level 1, never a melee weapon', () => {
    const w = quietWorld({ level: 1 });
    const allowed = ['pistol', 'smg', 'ar', 'shotgun', 'revolver'].map((id) => WEAPON_IDS.indexOf(id as (typeof WEAPON_IDS)[number]));
    for (let i = 0; i < 200; i++) expect(allowed).toContain(pickWeapon(w));
  });

  it('widen with the level: mp from 2, railgun only from 88', () => {
    const seen = (level: number) => {
      const w = quietWorld({ level });
      const s = new Set<number>();
      for (let i = 0; i < 600; i++) s.add(pickWeapon(w));
      return s;
    };
    expect(seen(1).has(WEAPON_IDS.indexOf('mp'))).toBe(false);
    expect(seen(2).has(WEAPON_IDS.indexOf('mp'))).toBe(true);
    expect(seen(87).has(WEAPON_IDS.indexOf('railgun'))).toBe(false);
    expect(seen(100).has(WEAPON_IDS.indexOf('railgun'))).toBe(true);
  });
});

describe('drones follow the pool', () => {
  it('gives none before level 3, and then only the open ones', () => {
    const w1 = quietWorld({ level: 1 });
    expect(grantDrone(w1, 0, -1)).toBe(-1);
    expect(w1.pDrone[0]).toBe(0);
    const w3 = quietWorld({ level: 3 });
    for (let i = 0; i < 20; i++) {
      const w = quietWorld({ level: 3, seed: i + 1 });
      expect(grantDrone(w, 0, -1)).toBe(DRONE_TYPES.indexOf('gun'));
    }
    expect(w3.pDrone[0]).toBe(0);
  });

  it('turns a boss drone core into health while no drone is open', () => {
    const w = quietWorld({ level: 1 });
    w.rng = new (w.rng.constructor as new (s: number) => typeof w.rng)(3);
    for (let i = 0; i < 40; i++) dropLoot(w, 0, 0, true);
    let drones = 0;
    for (let i = 0; i < w.kActive.length; i++) if (w.kActive[i] && w.kType[i] === PickupType.Drone) drones++;
    expect(drones).toBe(0);
  });

  it('gives the floor-two gift a drone the player has not met', () => {
    const gun = DRONE_TYPES.indexOf('gun');
    for (let seed = 1; seed < 12; seed++) {
      const w = quietWorld({ level: 20, seed, players: [{ slot: 0, metDrones: 1 << gun }] });
      expect(grantDrone(w, 0, -1, true), `seed ${seed}`).not.toBe(gun);
    }
  });
});

describe('card offers follow the pool', () => {
  it('draw only open cards and always three different ones', () => {
    for (const level of [1, 3, 10, 100]) {
      const pool = poolAt(level);
      for (let seed = 1; seed <= 15; seed++) {
        const w = quietWorld({ level, seed });
        w.misc[MISC.Phase] = FloorPhase.Cleared;
        w.misc[MISC.PhaseEnd] = 1e9;
        awardXp(w, 0, 1000);
        const offer = [w.pOffer[0]!, w.pOffer[1]!, w.pOffer[2]!];
        expect(new Set(offer).size, `level ${level}`).toBe(3);
        for (const c of offer) {
          expect(pool.cards[c], `${CARD_IDS[c]} at ${level}`).toBe(true);
          expect(CARD_CLASS[CARD_IDS[c]!] & 1).toBe(1);
        }
      }
    }
  });
});

describe('elites follow the pool', () => {
  const roll = (level: number, seed: number) => {
    const w = quietWorld({ level, seed });
    w.wave = 60;
    const i = spawnEnemy(w, 0, 5, 5);
    w.eMod[i] = 0;
    for (let k = 0; k < 40 && w.eMod[i] === 0; k++) rollElite(w, i);
    return w.eMod[i]!;
  };

  it('are absent before the first one opens', () => {
    for (let seed = 1; seed <= 5; seed++) expect(roll(1, seed)).toBe(0);
    for (let seed = 1; seed <= 5; seed++) expect(roll(6, seed)).toBe(0);
  });

  it('are the open ones only', () => {
    for (let seed = 1; seed <= 8; seed++) expect(roll(7, seed)).toBe(ELITE.Giant);
  });
});

describe('power-ups follow the pool', () => {
  it('drop only the open ones', () => {
    const w = quietWorld({ level: 1 });
    for (let i = 0; i < 3000; i++) dropLoot(w, 3, 3, false);
    for (let i = 0; i < w.kActive.length; i++) {
      if (!w.kActive[i]) continue;
      expect([PickupType.Ammo, PickupType.Health, PickupType.Grenade, PickupType.Weapon]).toContain(w.kType[i]);
    }
  });
});

describe('enemy pressure', () => {
  it('scales damage, health and numbers by the level and leaves the full game alone', () => {
    const full = modFx(0);
    expect(modFx(0, MAX_LEVEL)).toBe(full);
    expect(full.enemyDamage).toBe(1);
    expect(full.enemyHp).toBe(1);
    expect(full.enemyCount).toBe(1);
    const p = pressureAt(1) / 1000;
    const first = modFx(0, 1);
    expect(first.enemyDamage).toBeCloseTo(p, 10);
    expect(first.enemyHp).toBeCloseTo(0.6 + 0.4 * p, 10);
    expect(first.enemyCount).toBeCloseTo(0.7 + 0.3 * p, 10);
    expect(fxOf(quietWorld({ level: 1 })).enemyDamage).toBeCloseTo(p, 10);
  });

  it('stacks with the difficulty multipliers', () => {
    const brutal = 1 << 1; // MODS[1] = brutal (enemy damage x1.5)
    expect(modFx(brutal, 1).enemyDamage).toBeCloseTo(1.5 * 0.45, 10);
  });
});

describe('the guaranteed discovery crate', () => {
  const weaponCrates = (w: ReturnType<typeof quietWorld>) => {
    const out: number[] = [];
    for (let i = 0; i < w.kActive.length; i++) if (w.kActive[i] && w.kType[i] === PickupType.Weapon) out.push(w.kData[i]!);
    return out;
  };
  const met = (...ids: string[]) => ids.reduce((m, id) => m | (1 << WEAPON_IDS.indexOf(id as (typeof WEAPON_IDS)[number])), 0);

  it('drops an unmet open weapon after a minute', () => {
    const w = quietWorld({ level: 10, players: [{ slot: 0, metWeapons: met('pistol', 'smg') }] });
    w.tick = 60 * 30 - 1;
    updateDiscovery(w);
    expect(weaponCrates(w)).toEqual([]);
    w.tick = 60 * 30;
    updateDiscovery(w);
    const [gun] = weaponCrates(w);
    expect(gun).toBeDefined();
    expect(poolAt(10).weapons & (1 << gun!)).not.toBe(0);
    expect(met('pistol', 'smg') & (1 << gun!)).toBe(0);
  });

  it('drops at the end of the first floor, once', () => {
    const w = quietWorld({ level: 10, players: [{ slot: 0, metWeapons: met('pistol', 'smg') }] });
    w.misc[MISC.Phase] = FloorPhase.Cleared;
    updateDiscovery(w);
    expect(weaponCrates(w).length).toBe(1);
    w.tick = 100000;
    updateDiscovery(w);
    expect(weaponCrates(w).length).toBe(1);
  });

  it('needs no crate when everything open has been met', () => {
    const w = quietWorld({ level: 10, players: [{ slot: 0 }] });
    w.tick = 100000;
    updateDiscovery(w);
    expect(weaponCrates(w)).toEqual([]);
  });

  it('ignores weapons the level has not opened', () => {
    const w = quietWorld({ level: 1, players: [{ slot: 0, metWeapons: met('pistol', 'smg', 'ar', 'shotgun', 'revolver', 'sword', 'hammer') }] });
    w.tick = 100000;
    updateDiscovery(w);
    expect(weaponCrates(w)).toEqual([]);
  });
});

describe('replay format v4', () => {
  const setup = { seed: 9, map: 1, mods: 5, level: 12, players: [{ slot: 0, weapon: 'smg' as const, cls: 2, metWeapons: 0b1011, metDrones: 0b101 }, { slot: 2, weapon: 'pistol' as const, cls: 0 }] };

  it('keeps the level and what each player had met', () => {
    const rec: Replay = { setup, ticks: [[NONE, undefined, NONE]], hashes: [1] };
    const back = decodeReplay(encodeReplay(rec)).setup;
    expect(back.level).toBe(12);
    expect(back.players[0]).toMatchObject({ slot: 0, weapon: 'smg', cls: 2, metWeapons: 0b1011, metDrones: 0b101 });
    expect(back.players[1]).toMatchObject({ slot: 2, metWeapons: -1, metDrones: -1 });
  });

  it('plays back to the same hashes at a low level', () => {
    const w = createGame({ seed: 3, level: 4, players: [{ slot: 0, weapon: 'pistol' }] });
    const ticks: Replay['ticks'] = [];
    for (let t = 0; t < 300; t++) {
      ticks.push([NONE]);
      step(w, [NONE]);
    }
    const replay: Replay = { setup: { seed: 3, level: 4, players: [{ slot: 0, weapon: 'pistol' }] }, ticks, hashes: [] };
    const again = playReplay(decodeReplay(encodeReplay(replay)));
    expect(again.hash).toBe(playReplay(replay).hash);
    expect(again.world.metLevel).toBe(4);
  });

  it('rejects a replay of an older format', () => {
    const old = encodeReplay({ setup, ticks: [], hashes: [] });
    old[1] = 0x55;
    expect(() => decodeReplay(old)).toThrow(/older version/);
  });
});

