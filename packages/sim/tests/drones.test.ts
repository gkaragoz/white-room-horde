import { BALANCE, CARD_IDS, FloorPhase, MISC, DRONE_MAX_LEVEL, DRONE_TYPES, MAX_ENEMIES, PickupType, PlayerState, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, createWorld, hashWorld, serializeWorld, restoreWorld, spawnBoss, spawnEnemy, step, type World } from '../src';
import { awardDroneXp, droneNeed, droneStat, droneTier, grantDrone } from '../src/drones';
import { hooks } from '../src/features';
import { spawnPickup } from '../src/pickups';
import { awardXp } from '../src/progression';
import { botInput } from './bot';

const NONE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };
const [HEALER, CRYO, ROCKET, GUN, TWIN, TESLA, COLLECTOR] = [0, 1, 2, 3, 4, 5, 6];
const T = DRONE_TYPES.length;
const G = 0; // ENEMY_TYPES[0] = grunt

function quiet(players = 1, seed = 31): World {
  const w = createWorld(seed, 0, 1);
  w.waveTick = 1e9;
  w.countMul = 0;
  for (let s = 0; s < players; s++) {
    addPlayer(w, s, s * 3, 0);
    w.pHp[s] = w.pMaxHp[s] = 400;
  }
  return w;
}

/** Give a player a drone of a type and level, active and already awake. */
function equip(w: World, s: number, type: number, level = 1): void {
  w.pDLv[s * T + type] = level;
  w.pDrone[s] = type + 1;
  w.pDWarm[s] = 0;
  w.dX[s] = w.pX[s]! - BALANCE.drones.follow.side;
  w.dY[s] = w.pY[s]! + BALANCE.drones.follow.back;
}

const run = (w: World, ticks: number, inputs: (PlayerInput | undefined)[] = [NONE, NONE, NONE]): void => {
  for (let i = 0; i < ticks; i++) step(w, inputs);
};

describe('drone inventory', () => {
  it('seven grants give seven different drones, then a lump of experience', () => {
    const w = quiet();
    const seen = new Set<number>();
    for (let i = 0; i < T; i++) seen.add(grantDrone(w, 0));
    expect(seen.size).toBe(T);
    for (let t = 0; t < T; t++) expect(w.pDLv[t]).toBe(1);
    expect(w.pDrone[0]).toBeGreaterThan(0); // the first one is out
    const xpBefore = w.pDXp[(w.pDrone[0]! - 1)]! + droneNeed(1) * 0;
    expect(grantDrone(w, 0)).toBe(-1);
    expect(w.pDLv[w.pDrone[0]! - 1]! > 1 || w.pDXp[w.pDrone[0]! - 1]! > xpBefore).toBe(true);
    expect(w.events.some((e) => e.type === 'droneUnlock' && !e.fresh)).toBe(true);
  });

  it('the drone card and the drone core both hand one out', () => {
    const w = quiet();
    expect(CARD_IDS).toContain('drone');
    spawnPickup(w, PickupType.Drone, w.pX[0]!, w.pY[0]!);
    run(w, 3);
    expect(w.pDLv.slice(0, T).some((v) => v > 0)).toBe(true);
    expect(w.pDrone[0]).toBeGreaterThan(0);
  });

  it('clearing the second floor gives every player a drone, other floors do not', () => {
    const w = quiet(2);
    hooks.floorCleared(w, 1);
    hooks.floorCleared(w, 3);
    expect(w.pDrone[0]).toBe(0);
    hooks.floorCleared(w, 2);
    expect(w.pDrone[0]).toBeGreaterThan(0);
    expect(w.pDrone[1]).toBeGreaterThan(0);
  });

  it('players start without drones and a fresh slot forgets them', () => {
    const w = quiet();
    expect(w.pDrone[0]).toBe(0);
    grantDrone(w, 0);
    addPlayer(w, 0, 0, 0);
    expect(w.pDrone[0]).toBe(0);
    expect(w.pDLv.slice(0, T).every((v) => v === 0)).toBe(true);
  });
});

describe('levels', () => {
  it('experience raises the level and every fifth level is a new tier', () => {
    const w = quiet();
    equip(w, 0, GUN, 1);
    expect(droneTier(4)).toBe(0);
    expect(droneTier(5)).toBe(1);
    expect(droneTier(30)).toBe(6);
    awardDroneXp(w, 0, droneNeed(1));
    expect(w.pDLv[GUN]).toBe(2);
    awardDroneXp(w, 0, 1e9);
    expect(w.pDLv[GUN]).toBe(DRONE_MAX_LEVEL);
    expect(w.events.filter((e) => e.type === 'droneLevel').length).toBeGreaterThan(20);
  });

  it('the tier tables are complete and grow', () => {
    for (const type of DRONE_TYPES) {
      const cfg = BALANCE.drones[type as 'healer'] as Record<string, number | number[]>;
      for (const [k, v] of Object.entries(cfg)) if (Array.isArray(v)) expect(v.length, `${type}.${k}`).toBe(7);
    }
    expect(droneStat(HEALER, 'targets', 1)).toBe(1);
    expect(droneStat(HEALER, 'targets', 5)).toBe(2);
    expect(droneStat(HEALER, 'targets', 30)).toBe(4);
    expect(droneStat(HEALER, 'rate', 10)).toBeGreaterThan(droneStat(HEALER, 'rate', 5));
  });
});

describe('switching', () => {
  it('a choice swaps the drone, warms it up, and refuses a type that is not owned', () => {
    const w = quiet();
    grantDrone(w, 0, GUN);
    grantDrone(w, 0, TESLA);
    equip(w, 0, GUN, 1);
    w.pDLv[TESLA] = 3;
    step(w, [{ ...NONE, dsel: COLLECTOR + 1 }]);
    expect(w.pDrone[0]).toBe(GUN + 1); // not owned: nothing happens
    step(w, [{ ...NONE, dsel: TESLA + 1 }]);
    expect(w.pDrone[0]).toBe(TESLA + 1);
    expect(w.pDWarm[0]).toBeGreaterThan(BALANCE.drones.warmup - 0.1);
    expect(w.events.some((e) => e.type === 'droneSwap')).toBe(true);
    // a warming drone does nothing
    const g = spawnEnemy(w, G, 5, 0, false);
    run(w, 60);
    expect(w.eHp[g]).toBe(w.eHp[g]); // (no zap events while warming up)
    expect(w.events.filter((e) => e.type === 'droneZap').length).toBe(0);
  });
});

describe('healer', () => {
  it('beams the squad member with the lowest share of health, more of them on higher tiers', () => {
    const w = quiet(4);
    equip(w, 0, HEALER, 1);
    for (let s = 0; s < 4; s++) w.pX[s] = s * 1.5;
    w.pHp[1] = 100;
    w.pHp[2] = 300;
    w.pHp[3] = 350;
    run(w, 3, [NONE, NONE, NONE, NONE]);
    expect(w.dBeam[0]).toBe(1);
    expect(w.dBeam[1]).toBe(-1);
    expect(w.pHp[1]!).toBeGreaterThan(100);
    expect(w.pHp[3]! - 350).toBeLessThan(1); // one beam at this level: the healthiest is left alone (bar its own regeneration)
    w.pDLv[HEALER] = 10;
    run(w, 3, [NONE, NONE, NONE, NONE]);
    expect(w.dBeam[0]).toBe(1);
    expect(w.dBeam[1]).toBe(2);
    w.pDLv[HEALER] = 30;
    run(w, 3, [NONE, NONE, NONE, NONE]);
    expect([...w.dBeam.slice(0, 4)].filter((v) => v >= 0).length).toBeGreaterThanOrEqual(3);
  });

  it('earns experience from the health it gives and heals nobody who is full', () => {
    const w = quiet(2);
    equip(w, 0, HEALER, 1);
    w.pHp[0] = 100;
    run(w, 60, [NONE, NONE]);
    expect(w.pHp[0]!).toBeGreaterThan(100);
    expect(w.pDXp[HEALER]!).toBeGreaterThan(0);
    w.pHp[0] = w.pMaxHp[0]!;
    w.pHp[1] = w.pMaxHp[1]!;
    run(w, 3, [NONE, NONE]);
    expect(w.dBeam[0]).toBe(-1);
  });

  it('on high tiers its beam brings a downed player back without anyone holding the key', () => {
    const w = quiet(2);
    equip(w, 0, HEALER, 20);
    w.pX[1] = 2;
    w.pState[1] = PlayerState.Downed;
    w.pTimer[1] = BALANCE.player.downedSeconds;
    run(w, Math.ceil((BALANCE.player.reviveSeconds / 0.8) * 30) + 20, [NONE, NONE]);
    expect(w.pState[1]).toBe(PlayerState.Alive);
  });
});

describe('cryo', () => {
  it('slows what stands in its field, bosses by half, and lets go when they leave', () => {
    const w = quiet();
    equip(w, 0, CRYO, 1);
    const near = spawnEnemy(w, G, w.dX[0]! + 3, w.dY[0]!, false);
    const far = spawnEnemy(w, G, 40, 40, false);
    run(w, 2);
    expect(w.eSlowP[near]).toBe(35);
    expect(w.eSlowP[far]).toBe(0);
    const boss = spawnBoss(w);
    w.eX[boss] = w.dX[0]! + 2;
    w.eY[boss] = w.dY[0]!;
    run(w, 2);
    expect(w.eSlowP[boss]).toBe(Math.round(35 / 2));
    // the slow really lowers the speed: a grunt walking at the player covers less ground
    const a = quiet();
    const b = quiet();
    equip(b, 0, CRYO, 1);
    const ea = spawnEnemy(a, G, 8, 0, false);
    const eb = spawnEnemy(b, G, 8, 0, false);
    run(a, 20);
    run(b, 20);
    expect(8 - b.eX[eb]!).toBeLessThan(8 - a.eX[ea]! + 1e-9);
    expect(8 - b.eX[eb]!).toBeGreaterThanOrEqual(0);
    // out of the field the slow wears off
    b.eX[eb] = 300;
    run(b, 20);
    expect(b.eSlow[eb]).toBe(0);
    expect(b.eSlowP[eb]).toBe(0);
  });

  it('freezes the field now and then from level 20', () => {
    const w = quiet();
    equip(w, 0, CRYO, 20);
    const e = spawnEnemy(w, G, w.dX[0]! + 2, w.dY[0]!, false);
    let frozen = false;
    for (let i = 0; i < 8 * 30 + 40; i++) {
      step(w, [NONE]);
      if (w.eFrost[e]! > 0) frozen = true;
    }
    expect(frozen).toBe(true);
  });
});

describe('rocket', () => {
  it('fires a rocket that bursts and hurts what is around the target, with credit for the owner', () => {
    const w = quiet();
    equip(w, 0, ROCKET, 1);
    const hp = BALANCE.enemies.grunt.hp;
    const a = spawnEnemy(w, G, 12, 0, false);
    const b = spawnEnemy(w, G, 12.8, 0.6, false);
    for (let i = 0; i < 90; i++) {
      w.eCooldown[a] = 99;
      w.eCooldown[b] = 99;
      step(w, [NONE]);
    }
    expect(w.eHp[a]! < hp || !w.eActive[a]).toBe(true);
    expect(w.eHp[b]! < hp || !w.eActive[b]).toBe(true);
    expect(w.pDXp[ROCKET]! > 0 || w.pDLv[ROCKET]! > 1).toBe(true);
  });

  it('a higher tier fires more rockets at once', () => {
    const count = (level: number): number => {
      const w = quiet();
      equip(w, 0, ROCKET, level);
      spawnEnemy(w, G, 12, 0, false);
      let n = 0;
      for (let i = 0; i < 5; i++) {
        step(w, [NONE]);
        n += w.events.filter((e) => e.type === 'droneShot').length;
      }
      return n;
    };
    expect(count(1)).toBe(1);
    expect(count(5)).toBe(2);
    expect(count(30)).toBe(4);
  });
});

describe('machine guns', () => {
  it('the single gun shoots the target and levels from kills; the twin fires a volley of barrels', () => {
    const w = quiet();
    equip(w, 0, GUN, 1);
    const e = spawnEnemy(w, G, 10, 0, false);
    w.eHp[e] = 30;
    w.eCooldown[e] = 9999;
    run(w, 90);
    expect(w.eActive[e]).toBe(0);
    expect(w.pDXp[GUN]! > 0 || w.pDLv[GUN]! > 1).toBe(true);
    const v = quiet();
    equip(v, 0, TWIN, 1);
    spawnEnemy(v, G, 8, 0, false);
    step(v, [NONE]);
    expect(v.events.filter((e) => e.type === 'droneShot').length).toBe(2);
    const v3 = quiet();
    equip(v3, 0, TWIN, 10);
    spawnEnemy(v3, G, 8, 0, false);
    step(v3, [NONE]);
    expect(v3.events.filter((e) => e.type === 'droneShot').length).toBe(3);
  });

  it('shoots nothing it cannot see: a wall in between stops the fire', () => {
    const w = createWorld(5, 0, 1);
    w.waveTick = 1e9;
    w.countMul = 0;
    addPlayer(w, 0, 0, 0);
    equip(w, 0, GUN, 1);
    // find a target behind cover on the real map: put an enemy where the segment is blocked
    let found = false;
    for (let x = 3; x < 20 && !found; x += 0.5) {
      for (let y = -12; y < 12 && !found; y += 0.5) {
        const e = spawnEnemy(w, G, x, y, false);
        w.eCooldown[e] = 9999;
        step(w, [NONE]);
        const shot = w.events.some((ev) => ev.type === 'droneShot');
        w.eActive[e] = 0;
        w.enemyCount--;
        if (!shot) found = true;
      }
    }
    expect(found).toBe(true);
  });
});

describe('tesla', () => {
  it('chains from the first enemy to the next ones within reach, one more hit than it has jumps', () => {
    const w = quiet();
    equip(w, 0, TESLA, 1);
    for (let k = 0; k < 6; k++) {
      const e = spawnEnemy(w, G, 6 + k * 2, 0, false);
      w.eCooldown[e] = 9999;
    }
    let zap: number[] | null = null;
    for (let i = 0; i < 5 && !zap; i++) {
      step(w, [NONE]);
      const z = w.events.find((e) => e.type === 'droneZap');
      if (z && z.type === 'droneZap') zap = z.pts;
    }
    expect(zap).not.toBeNull();
    expect((zap!.length - 2) / 2).toBe(droneStat(TESLA, 'jumps', 1) + 1);
  });
});

describe('collector', () => {
  it('pulls loot the owner wants toward the owner', () => {
    const w = quiet();
    equip(w, 0, COLLECTOR, 1);
    w.pHp[0] = 100;
    spawnPickup(w, PickupType.Health, 10, 0);
    const k = w.kActive.findIndex((v) => v === 1);
    const d0 = Math.abs(w.kX[k]! - w.pX[0]!);
    run(w, 10);
    expect(Math.abs(w.kX[k]! - w.pX[0]!)).toBeLessThan(d0);
    run(w, 200);
    expect(w.pHp[0]!).toBeGreaterThan(100); // it arrived and was picked up
    expect(w.pDXp[COLLECTOR]! > 0 || w.pDLv[COLLECTOR]! > 1).toBe(true);
  });
});

describe('life cycle', () => {
  it('a downed owner switches the drone off, and it wakes a moment after the revive', () => {
    const w = quiet();
    equip(w, 0, GUN, 1);
    spawnEnemy(w, G, 8, 0, false);
    w.pState[0] = PlayerState.Downed;
    w.pTimer[0] = 30;
    run(w, 20);
    expect(w.events.some((e) => e.type === 'droneShot')).toBe(false);
    w.pState[0] = PlayerState.Alive;
    step(w, [NONE]);
    expect(w.pDWarm[0]).toBeGreaterThan(0.5);
  });
});

describe('determinism', () => {
  const scenario = (seed: number): World => {
    const w = createGame({ seed, players: [{ slot: 0, weapon: 'smg', cls: 0 }, { slot: 1, weapon: 'ar', cls: 1 }], map: 0, mods: 1 });
    for (let s = 0; s < 2; s++) {
      w.pHp[s] = w.pMaxHp[s] = 1e6;
      for (let t = 0; t < T; t++) grantDrone(w, s, (t + s * 3) % T);
    }
    return w;
  };
  const play = (w: World, ticks: number, swap = true): void => {
    for (let i = 0; i < ticks; i++) {
      const inputs = [0, 1].map((s) => {
        const b = botInput(w, s);
        return swap && i % 150 === 40 ? { ...b, dsel: ((i / 150 + s) % T) + 1 } : b;
      });
      step(w, inputs);
    }
  };

  it('two worlds with drones, swaps and fighting stay identical, and a snapshot restores exactly', () => {
    const a = scenario(9);
    const b = scenario(9);
    play(a, 900);
    play(b, 900);
    expect(hashWorld(a)).toBe(hashWorld(b));
    const copy = createWorld(1, 0, 1);
    restoreWorld(copy, serializeWorld(a));
    expect(hashWorld(copy)).toBe(hashWorld(a));
    play(a, 120, false);
    play(copy, 120, false);
    expect(hashWorld(copy)).toBe(hashWorld(a));
    // the drones really did work: some experience was earned somewhere
    const earned = [...a.pDXp].some((v) => v > 0) || [...a.pDLv].some((v) => v > 1);
    expect(earned).toBe(true);
    expect(a.eSlow.length).toBe(MAX_ENEMIES);
  });
});

describe('player experience still works with the drone card in the pool', () => {
  it('awardXp opens offers that may contain the drone card', () => {
    const w = quiet();
    w.misc[MISC.Phase] = FloorPhase.Cleared;
    w.misc[MISC.PhaseEnd] = 1e9;
    let seen = false;
    for (let n = 0; n < 3000 && !seen; n++) {
      for (let i = 0; i < 3; i++) w.pOffer[i] = -1;
      w.pPending[0] = 0;
      w.pLevel[0] = 1;
      w.pXp[0] = 0;
      awardXp(w, 0, 1e6);
      if ([0, 1, 2].some((i) => w.pOffer[i] === CARD_IDS.indexOf('drone'))) seen = true;
    }
    expect(seen).toBe(true);
  });
});
