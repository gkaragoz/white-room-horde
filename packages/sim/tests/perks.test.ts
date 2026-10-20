import { BALANCE, Buttons, CLASS_IDS, ENEMY_TYPES, PERK, PERKS, PickupType, PlayerState, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, createWorld, hashWorld, restoreWorld, serializeWorld, spawnEnemy, step } from '../src';
import { ELITE, eliteChance, nuke, perk, placeBarrels, setPerk, waveModOf } from '../src/features';
import { spawnPickup } from '../src/pickups';

const NONE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };
const FIRE: PlayerInput = { ...NONE, buttons: Buttons.Fire };
const T = (n: string): number => ENEMY_TYPES.indexOf(n as (typeof ENEMY_TYPES)[number]);

function quiet(seed: number): ReturnType<typeof createWorld> {
  const w = createWorld(seed);
  w.waveTick = 1e9;
  w.countMul = 0;
  return w;
}

describe('classes', () => {
  it('every class changes the player the way its description says', () => {
    const base = quiet(1);
    addPlayer(base, 0, 0, 0, 'ar', 0);
    for (let c = 1; c < CLASS_IDS.length; c++) {
      const w = quiet(1);
      addPlayer(w, 0, 0, 0, 'ar', c);
      expect(perk(w, 0, PERK.Class)).toBe(c);
      const id = CLASS_IDS[c];
      if (id === 'heavy') {
        expect(w.pMaxHp[0]!).toBeGreaterThan(base.pMaxHp[0]! + 60);
        expect(w.pModSpeed[0]!).toBeLessThan(1);
        expect(w.pModArmor[0]!).toBeLessThan(1);
      } else if (id === 'scout') {
        expect(w.pModSpeed[0]!).toBeGreaterThan(1.2);
        expect(w.pMaxHp[0]!).toBeLessThan(base.pMaxHp[0]!);
        expect(perk(w, 0, PERK.DashRate)).toBeGreaterThan(1.3);
      } else if (id === 'medic') {
        expect(perk(w, 0, PERK.Aura)).toBeGreaterThan(0);
        expect(perk(w, 0, PERK.ReviveRate)).toBeGreaterThan(1.5);
      } else if (id === 'demolisher') {
        expect(w.pGren[0]!).toBe(base.pGren[0]! + 3);
        expect(perk(w, 0, PERK.Blast)).toBeGreaterThan(1.3);
      } else if (id === 'ranger') {
        expect(w.pModPierce[0]!).toBe(1);
        expect(w.pModDmg[0]!).toBeGreaterThan(1.1);
      } else if (id === 'berserker') {
        expect(w.pLifesteal[0]!).toBeGreaterThan(0);
        expect(perk(w, 0, PERK.Rage)).toBe(1);
      }
    }
  });

  it('a medic heals teammates standing near, and revives faster', () => {
    const w = quiet(2);
    addPlayer(w, 0, 0, 0, 'ar', CLASS_IDS.indexOf('medic'));
    addPlayer(w, 1, 2, 0, 'ar', 0);
    w.pHp[1] = 20;
    for (let i = 0; i < 60; i++) step(w, [NONE, NONE]);
    expect(w.pHp[1]!).toBeGreaterThan(24);
    const far = quiet(2);
    addPlayer(far, 0, 0, 0, 'ar', CLASS_IDS.indexOf('medic'));
    addPlayer(far, 1, 15, 0, 'ar', 0);
    far.pHp[1] = 20;
    for (let i = 0; i < 60; i++) step(far, [NONE, NONE]);
    expect(far.pHp[1]!).toBeLessThan(23); // only the slow out-of-combat regeneration
  });
});

describe('perks', () => {
  it('health regenerates out of combat only', () => {
    const w = quiet(3);
    addPlayer(w, 0, 0, 0);
    w.pHp[0] = 50;
    setPerk(w, 0, PERK.HurtT, 0);
    for (let i = 0; i < 90; i++) step(w, [NONE]);
    expect(w.pHp[0]).toBe(50); // 3 s after a hit: nothing yet
    for (let i = 0; i < 150; i++) step(w, [NONE]);
    expect(w.pHp[0]!).toBeGreaterThan(51);
  });

  it('the barrier shield soaks damage before the hit points do, and recharges after a pause', () => {
    const w = quiet(4);
    addPlayer(w, 0, 0, 0);
    setPerk(w, 0, PERK.ShieldMax, 45);
    setPerk(w, 0, PERK.Shield, 45);
    const e = spawnEnemy(w, T('grunt'), 0.9, 0, false);
    w.eCooldown[e] = 0;
    for (let i = 0; i < 20; i++) step(w, [NONE]);
    expect(w.pHp[0]).toBe(w.pMaxHp[0]); // the shield took the hit
    expect(perk(w, 0, PERK.Shield)).toBeLessThan(45);
    w.eActive[e] = 0;
    w.enemyCount = 0;
    const low = perk(w, 0, PERK.Shield);
    for (let i = 0; i < 30 * 12; i++) step(w, [NONE]);
    expect(perk(w, 0, PERK.Shield)).toBeGreaterThan(low);
  });

  it('thorns hurt whoever hits you', () => {
    const w = quiet(5);
    addPlayer(w, 0, 0, 0);
    setPerk(w, 0, PERK.Thorns, 16);
    const e = spawnEnemy(w, T('grunt'), 0.9, 0, false);
    w.eCooldown[e] = 0;
    const hp0 = w.eHp[e]!;
    for (let i = 0; i < 10; i++) step(w, [NONE]);
    expect(w.eHp[e]! < hp0 || !w.eActive[e]).toBe(true);
  });

  it('second wind gets you back up once at half health', () => {
    const w = quiet(6);
    addPlayer(w, 0, 0, 0);
    addPlayer(w, 1, 20, 0);
    setPerk(w, 0, PERK.Second, 1);
    w.pHp[0] = 0;
    step(w, [NONE, NONE]);
    expect(w.pState[0]).toBe(PlayerState.Alive);
    expect(w.pHp[0]!).toBeCloseTo(w.pMaxHp[0]! * BALANCE.perks.secondHp, 0);
    expect(w.events.some((e) => e.type === 'secondWind')).toBe(true);
    w.pHp[0] = 0;
    step(w, [NONE, NONE]);
    expect(w.pState[0]).toBe(PlayerState.Downed); // only once
  });

  it('frost slows enemies near you', () => {
    const run = (frost: number): number => {
      const w = quiet(7);
      addPlayer(w, 0, -15, 0);
      setPerk(w, 0, PERK.Frost, frost);
      const e = spawnEnemy(w, T('grunt'), -10, 0, false);
      const x0 = w.eX[e]!;
      for (let i = 0; i < 30; i++) step(w, [NONE]);
      return Math.abs(w.eX[e]! - x0);
    };
    expect(run(1)).toBeLessThan(run(0) * 0.85);
  });

  it('a shockwave dash damages and shoves what is around', () => {
    const w = quiet(8);
    addPlayer(w, 0, 0, 0);
    setPerk(w, 0, PERK.Shock, 1);
    const e = spawnEnemy(w, T('tank'), 2, 0, false);
    w.eCooldown[e] = 1e9;
    const hp0 = w.eHp[e]!;
    const x0 = w.eX[e]!;
    step(w, [{ ...NONE, moveX: -127, buttons: Buttons.Dash }]);
    expect(w.eHp[e]!).toBeLessThan(hp0);
    expect(w.eX[e]!).toBeGreaterThan(x0);
  });
});

describe('enemies and waves', () => {
  it('hits shove enemies back and blasts fling the survivors', () => {
    const w = quiet(9);
    addPlayer(w, 0, -10, 0, 'revolver');
    const e = spawnEnemy(w, T('tank'), -6, 0, false);
    w.eCooldown[e] = 1e9;
    const x0 = w.eX[e]!;
    let peak = x0;
    for (let i = 0; i < 12; i++) {
      step(w, [i === 0 ? FIRE : NONE]);
      peak = Math.max(peak, w.eX[e]!);
    }
    expect(peak).toBeGreaterThan(x0 + 0.1); // thrown back by the hit before it walks on
  });

  it('elites appear from wave 3 and each kind has its effect', () => {
    const w = quiet(10);
    w.wave = 1;
    expect(eliteChance(w)).toBe(0);
    w.wave = 12;
    expect(eliteChance(w)).toBeGreaterThan(0.2);
    let kinds = 0;
    const seen = new Set<number>();
    const g = createGame({ seed: 5, players: [{ slot: 0, weapon: 'ar' }] });
    g.wave = 14;
    g.waveTick = g.tick;
    for (let t = 0; t < 400 && kinds < 6; t++) {
      step(g, [NONE]);
      for (let i = 0; i < g.eActive.length; i++) if (g.eActive[i] && g.eMod[i]) seen.add(g.eMod[i]!);
      kinds = seen.size;
    }
    expect(kinds).toBeGreaterThanOrEqual(4);
    expect(waveModOf(1)).toBe(0);
    expect(new Set(Array.from({ length: 30 }, (_, i) => waveModOf(i + 3))).size).toBeGreaterThanOrEqual(5);
    expect(ELITE.Giant).toBe(1);
  });

  it('a splitter splits and a volatile elite blows up when it dies', () => {
    const w = quiet(11);
    addPlayer(w, 0, -15, 0, 'ar');
    const s = spawnEnemy(w, T('grunt'), -5, 0, false);
    w.eMod[s] = ELITE.Splitter;
    w.eHp[s] = 1;
    for (let i = 0; i < 20 && w.kills === 0; i++) step(w, [FIRE]);
    expect(w.kills).toBe(1);
    expect(w.enemyCount).toBe(2); // two small ones took its place
    const v = quiet(12);
    addPlayer(v, 0, -15, 0, 'ar');
    const e = spawnEnemy(v, T('grunt'), -5, 0, false);
    v.eMod[e] = ELITE.Volatile;
    v.eHp[e] = 1;
    let boom = false;
    for (let i = 0; i < 20 && !boom; i++) {
      step(v, [FIRE]);
      boom = v.events.some((x) => x.type === 'explosion');
    }
    expect(boom).toBe(true);
  });
});

describe('barrels', () => {
  it('shooting a barrel blows it and its neighbours up, throwing enemies around', () => {
    const w = createGame({ seed: 3, players: [{ slot: 0, weapon: 'ar' }] });
    w.waveTick = 1e9;
    w.countMul = 0;
    expect(w.brActive.reduce((a, b) => a + b, 0)).toBeGreaterThan(6);
    // put two barrels side by side and an enemy near them
    w.brX[0] = -8;
    w.brY[0] = 0;
    w.brX[1] = -6.5;
    w.brY[1] = 0;
    w.pX[0] = -14;
    w.pY[0] = 0;
    const e = spawnEnemy(w, T('tank'), -7, 1.5, false);
    w.eCooldown[e] = 1e9;
    const hp0 = w.eHp[e]!;
    let blasts = 0;
    for (let i = 0; i < 40; i++) {
      step(w, [{ ...NONE, buttons: Buttons.Fire }]);
      blasts += w.events.filter((x) => x.type === 'explosion').length;
    }
    expect(blasts).toBeGreaterThanOrEqual(2);
    expect(w.brActive[0]).toBe(0);
    expect(w.brActive[1]).toBe(0);
    expect(w.eHp[e]!).toBeLessThan(hp0);
  });

  it('barrels come back after a while', () => {
    const w = quiet(4);
    placeBarrels(w);
    w.brActive[0] = 0;
    w.brT[0] = BALANCE.barrels.respawn;
    for (let i = 0; i < 30 * (BALANCE.barrels.respawn + 2); i++) step(w, []);
    expect(w.brActive[0]).toBe(1);
  });
});

describe('power-ups', () => {
  it('shield, haste, quad damage, nuke and freeze each do their thing', () => {
    const w = quiet(13);
    addPlayer(w, 0, 0, 0, 'ar');
    const grab = (kind: number): void => {
      spawnPickup(w, kind, w.pX[0]!, w.pY[0]!);
      for (let i = 0; i < 6; i++) step(w, [NONE]);
    };
    grab(PickupType.Shield);
    expect(perk(w, 0, PERK.Shield)).toBeGreaterThan(40);
    grab(PickupType.Haste);
    expect(perk(w, 0, PERK.Haste)).toBeGreaterThan(5);
    grab(PickupType.Quad);
    expect(perk(w, 0, PERK.Quad)).toBeGreaterThan(5);
    const e = spawnEnemy(w, T('grunt'), 8, 0, false);
    const boss = spawnEnemy(w, T('tank'), 9, 3, false);
    w.eBoss[boss] = 1;
    const bossHp = w.eHp[boss]!;
    grab(PickupType.Nuke);
    expect(w.eActive[e]).toBe(0);
    expect(w.eHp[boss]!).toBeLessThan(bossHp);
    grab(PickupType.Freeze);
    expect(w.misc[0]!).toBeGreaterThan(2);
    const f = spawnEnemy(w, T('runner'), 12, 0, false);
    const x0 = w.eX[f]!;
    for (let i = 0; i < 20; i++) step(w, [NONE]);
    expect(w.eX[f]).toBe(x0); // frozen
    nuke(w, 0);
  });

  it('quad damage doubles the damage of a shot', () => {
    const dmg = (quad: number): number => {
      const w = quiet(14);
      addPlayer(w, 0, 0, 0, 'revolver');
      setPerk(w, 0, PERK.Quad, quad);
      step(w, [FIRE]);
      return w.bDamage[w.bActive.indexOf(1)]!;
    };
    expect(dmg(5)).toBeCloseTo(dmg(0) * 2, 5);
  });

  it('the new state survives a snapshot and is part of the hash', () => {
    const w = createGame({ seed: 8, players: [{ slot: 0, weapon: 'ar', cls: 2 }] });
    setPerk(w, 0, PERK.Thorns, 5);
    w.misc[0] = 3;
    w.eMod[0] = 2;
    const copy = createWorld(8);
    restoreWorld(copy, serializeWorld(w));
    expect(hashWorld(copy)).toBe(hashWorld(w));
    expect(copy.pPerk[PERK.Thorns]).toBe(5);
    expect(copy.pPerk.length).toBe(11 * PERKS);
    const h = hashWorld(w);
    setPerk(w, 0, PERK.Thorns, 6);
    expect(hashWorld(w)).not.toBe(h);
  });
});

describe('new enemy types', () => {
  it('a bloater bursts into crawlers and hurts whoever is close', () => {
    const w = quiet(20);
    addPlayer(w, 0, 0, 0, 'ar');
    const b = spawnEnemy(w, T('bloater'), 2, 0, false);
    w.eCooldown[b] = 1e9;
    w.eHp[b] = 1;
    const hp0 = w.pHp[0]!;
    for (let i = 0; i < 20 && w.kills === 0; i++) step(w, [FIRE]);
    expect(w.kills).toBe(1);
    let crawlers = 0;
    for (let i = 0; i < w.eActive.length; i++) if (w.eActive[i] && w.eType[i] === T('crawler')) crawlers++;
    expect(crawlers).toBe(3);
    expect(w.pHp[0]!).toBeLessThan(hp0);
  });

  it('a screamer makes the enemies around it faster', () => {
    const dist = (screamer: boolean): number => {
      const w = quiet(21);
      addPlayer(w, 0, -15, 0);
      const g = spawnEnemy(w, T('grunt'), 5, 0, false);
      if (screamer) {
        const s = spawnEnemy(w, T('screamer'), 6, 1, false);
        w.eCooldown[s] = 1e9;
      }
      const x0 = w.eX[g]!;
      for (let i = 0; i < 30; i++) step(w, [NONE]);
      return Math.abs(w.eX[g]! - x0);
    };
    expect(dist(true)).toBeGreaterThan(dist(false) * 1.2);
  });

  it('a leaper jumps: it covers the same ground much faster than a runner would', () => {
    const w = quiet(22);
    addPlayer(w, 0, -10, 0);
    const l = spawnEnemy(w, T('leaper'), 0, 0, false);
    let fastest = 0;
    let px = w.eX[l]!;
    for (let i = 0; i < 100; i++) {
      step(w, [NONE]);
      fastest = Math.max(fastest, Math.abs(w.eX[l]! - px));
      px = w.eX[l]!;
    }
    expect(fastest).toBeGreaterThan((BALANCE.enemies.leaper.speed / 30) * 2);
  });

  it('the new types are unlocked later in the game', () => {
    expect(BALANCE.waves.unlock.crawler).toBeGreaterThanOrEqual(4);
    expect(BALANCE.waves.unlock.screamer).toBeGreaterThan(BALANCE.waves.unlock.leaper);
    for (const id of ['crawler', 'leaper', 'bloater', 'screamer'] as const) {
      expect(BALANCE.enemies[id].hp).toBeGreaterThan(0);
      expect(BALANCE.progression.xp[id]).toBeGreaterThan(0);
    }
  });
});
