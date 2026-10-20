import { BALANCE, Buttons, CARD_IDS, ENEMY_TYPES, MAPS, MAX_ENEMIES, PickupType, WEAPON_IDS, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, createWorld, hashWorld, restoreWorld, serializeWorld, spawnBoss, spawnEnemy, step } from '../src';
import { cellIndex } from '../src/flowfield';
import { spawnPickup } from '../src/pickups';
import { awardXp, xpForNext } from '../src/progression';

const NONE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };
const T = (n: string): number => ENEMY_TYPES.indexOf(n as (typeof ENEMY_TYPES)[number]);

function quiet(seed: number, map = 0, difficulty = 1): ReturnType<typeof createWorld> {
  const w = createWorld(seed, map, difficulty);
  w.waveTick = 1e9;
  w.countMul = 0;
  return w;
}

describe('magazines and reloading', () => {
  it('a magazine empties, reloads on its own while firing, takes time and uses the reserve', () => {
    const w = quiet(1);
    addPlayer(w, 0, 0, 0, 'ar');
    const mag = BALANCE.weapons.ar.mag;
    expect(w.pMag[0]).toBe(mag);
    const reserve = w.pAmmo[0]!;
    let reloads = 0;
    let shots = 0;
    for (let t = 0; t < 400; t++) {
      step(w, [{ ...NONE, buttons: Buttons.Fire }]);
      for (const e of w.events) {
        if (e.type === 'reloadStart') reloads++;
        if (e.type === 'shot') shots++;
      }
    }
    expect(reloads).toBeGreaterThanOrEqual(1);
    expect(shots).toBeGreaterThan(mag);
    expect(w.pAmmo[0]!).toBeLessThan(reserve);
  });

  it('cannot fire during a reload; manual reload tops the magazine up from the reserve', () => {
    const w = quiet(2);
    addPlayer(w, 0, 0, 0, 'smg');
    for (let t = 0; t < 10; t++) step(w, [{ ...NONE, buttons: Buttons.Fire }]);
    const left = w.pMag[0]!;
    expect(left).toBeLessThan(BALANCE.weapons.smg.mag);
    step(w, [{ ...NONE, buttons: Buttons.Reload }]);
    expect(w.pReload[0]).toBeGreaterThan(0);
    let fired = false;
    for (let t = 0; t < Math.floor(BALANCE.weapons.smg.reload * 30) - 3; t++) {
      step(w, [{ ...NONE, buttons: Buttons.Fire }]);
      if (w.events.some((e) => e.type === 'shot')) fired = true;
    }
    expect(fired).toBe(false);
    for (let t = 0; t < 10; t++) step(w, [NONE]);
    expect(w.pMag[0]).toBe(BALANCE.weapons.smg.mag);
  });

  it('infinite pistol reloads forever; an empty reserve leaves the gun dry', () => {
    const w = quiet(3);
    addPlayer(w, 0, 0, 0, 'pistol');
    expect(w.pAmmo[0]).toBe(-1);
    for (let t = 0; t < 600; t++) step(w, [{ ...NONE, buttons: Buttons.Fire }]);
    expect(w.pAmmo[0]).toBe(-1);
    const w2 = quiet(4);
    addPlayer(w2, 0, 0, 0, 'shotgun');
    w2.pAmmo[0] = 0;
    w2.pMag[0] = 0;
    w2.pOwned[0] = 1 << WEAPON_IDS.indexOf('shotgun'); // nothing else to fall back to
    for (let t = 0; t < 120; t++) step(w2, [{ ...NONE, buttons: Buttons.Fire }]);
    expect(w2.pMag[0]).toBe(0);
    expect(w2.pReload[0]).toBe(0);
  });
});

describe('dash', () => {
  it('moves quickly along the input, grants i-frames and has a cooldown', () => {
    const w = quiet(5);
    addPlayer(w, 0, -10, 0);
    const x0 = w.pX[0]!;
    step(w, [{ moveX: 127, moveY: 0, aim: 0, buttons: Buttons.Dash }]);
    expect(w.events.some((e) => e.type === 'dash')).toBe(true);
    expect(w.pIFrames[0]).toBeGreaterThan(0);
    for (let t = 0; t < 7; t++) step(w, [NONE]);
    const dashed = w.pX[0]! - x0;
    expect(dashed).toBeGreaterThan(BALANCE.player.speed * BALANCE.dash.seconds * 2);
    // another press straight away does nothing (cooldown)
    step(w, [{ moveX: 127, moveY: 0, aim: 0, buttons: Buttons.Dash }]);
    expect(w.events.some((e) => e.type === 'dash')).toBe(false);
    for (let t = 0; t < BALANCE.dash.cooldown * 30 + 2; t++) step(w, [NONE]);
    step(w, [{ moveX: 127, moveY: 0, aim: 0, buttons: Buttons.Dash }]);
    expect(w.events.some((e) => e.type === 'dash')).toBe(true);
  });
});

describe('personal cards, weapon drops and difficulty', () => {
  it('personal cards only change the player who picked them', () => {
    const w = quiet(6);
    addPlayer(w, 0, 0, 0);
    addPlayer(w, 1, 3, 0);
    awardXp(w, xpForNext(w));
    // force an offer made of the three personal cards
    const ids = ['sharp', 'sprint', 'bulk'].map((c) => CARD_IDS.indexOf(c as (typeof CARD_IDS)[number]));
    ids.forEach((c, i) => (w.cardOffer[i] = c));
    step(w, [NONE, { ...NONE, buttons: Buttons.Card1 }]);
    expect(w.pModDmg[1]).toBeCloseTo(1 + BALANCE.progression.cards.sharp);
    expect(w.pModDmg[0]).toBe(1);
    w.cardOffer.fill(-1);
    w.pendingLevels = 1;
    awardXp(w, 0);
    ids.forEach((c, i) => (w.cardOffer[i] = c));
    step(w, [{ ...NONE, buttons: Buttons.Card3 }, NONE]);
    expect(w.pMaxHp[0]).toBe(BALANCE.player.hp + BALANCE.progression.cards.bulk);
    expect(w.pMaxHp[1]).toBe(BALANCE.player.hp);
  });

  it('a weapon crate adds the weapon to the inventory with a full magazine', () => {
    const w = quiet(7);
    addPlayer(w, 0, 0, 0, 'pistol');
    spawnPickup(w, PickupType.Weapon, 0.3, 0, WEAPON_IDS.indexOf('sniper'));
    step(w, [NONE]);
    expect(w.pWeapon[0]).toBe(WEAPON_IDS.indexOf('pistol'));
    expect((w.pOwned[0]! >> WEAPON_IDS.indexOf('sniper')) & 1).toBe(1);
    expect(w.pInvMag[WEAPON_IDS.indexOf('sniper')]).toBe(BALANCE.weapons.sniper.mag);
  });

  it('hard mode has tougher enemies and fewer-hit players than easy mode', () => {
    const hp = (d: number): number => {
      const w = quiet(8, 0, d);
      addPlayer(w, 0, 0, 0);
      const k = spawnEnemy(w, T('grunt'), 10, 0, false);
      return w.eHp[k]!;
    };
    expect(hp(2)).toBeGreaterThan(hp(1));
    expect(hp(1)).toBeGreaterThan(hp(0));
    const hits = (d: number): number => {
      const w = quiet(9, 0, d);
      addPlayer(w, 0, 0, 0);
      const k = spawnEnemy(w, T('grunt'), 0.8, 0, false);
      w.eCooldown[k] = 0;
      for (let t = 0; t < 120 && w.pHp[0]! > 0; t++) step(w, [NONE]);
      return BALANCE.player.hp - w.pHp[0]!;
    };
    expect(hits(2)).toBeGreaterThan(hits(0));
  });
});

describe('bosses fight differently', () => {
  const boss = (variant: number): { w: ReturnType<typeof createWorld>; id: number } => {
    const w = quiet(10 + variant);
    addPlayer(w, 0, -15, 0);
    const id = spawnBoss(w);
    w.eBoss[id] = variant;
    w.eX[id] = 5;
    w.eY[id] = 0;
    w.eState[id] = 0;
    w.waveTick = w.tick - 1;
    return { w, id };
  };
  const run = (w: ReturnType<typeof createWorld>, seconds: number): { kinds: string[]; types: Set<number> } => {
    const kinds: string[] = [];
    const types = new Set<number>();
    for (let t = 0; t < seconds * 30; t++) {
      step(w, [NONE]);
      for (const e of w.events) if (e.type === 'bossAbility') kinds.push(e.kind);
      for (let i = 0; i < MAX_ENEMIES; i++) if (w.eActive[i] && !w.eBoss[i]) types.add(w.eType[i]!);
    }
    return { kinds, types };
  };

  it('variant 1 charges at the player', () => {
    const { w, id } = boss(1);
    const gap0 = Math.abs(w.eX[id]! - w.pX[0]!);
    const r = run(w, 7);
    expect(r.kinds).toContain('charge');
    expect(Math.abs(w.eX[id]! - w.pX[0]!)).toBeLessThan(gap0 - 6);
  });

  it('variant 2 summons grunts, 3 summons spitters, 4 summons runners and speeds up its horde', () => {
    expect(run(boss(2).w, 9).types.has(T('grunt'))).toBe(true);
    expect(run(boss(3).w, 10).types.has(T('spitter'))).toBe(true);
    const { w } = boss(4);
    const r = run(w, 9);
    expect(r.types.has(T('runner'))).toBe(true);
    expect(r.kinds).toContain('aura');
  });

  it('the aura makes grunts near a swarm leader faster', () => {
    const dist = (withBoss: boolean): number => {
      const w = quiet(30);
      addPlayer(w, 0, -15, 0);
      if (withBoss) {
        const b = spawnBoss(w);
        w.eBoss[b] = 4;
        w.eX[b] = 12;
        w.eY[b] = 12;
        w.eHp[b] = 1e9;
        w.eCooldown[b] = 1e9;
      }
      const k = spawnEnemy(w, T('grunt'), 10, 10, false);
      const x0 = w.eX[k]!;
      const y0 = w.eY[k]!;
      for (let t = 0; t < 30; t++) step(w, [NONE]);
      return Math.hypot(w.eX[k]! - x0, w.eY[k]! - y0);
    };
    expect(dist(true)).toBeGreaterThan(dist(false) * 1.2);
  });
});

describe('maps', () => {
  it('every layout leaves the start ring and the arena edges free and keeps the centre reachable from every edge', () => {
    for (let m = 0; m < MAPS.length; m++) {
      const w = createWorld(1, m);
      addPlayer(w, 0, 0, 0);
      // centre area is open
      for (const [x, y] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]] as const) expect(w.field.blocked[cellIndex(x, y)], `map ${m} blocked at ${x},${y}`).toBe(0);
      w.field.compute([cellIndex(0, 0)], 1);
      for (let x = -29; x <= 29; x += 4) {
        for (const y of [-19, 19]) expect(w.field.cost[cellIndex(x, y)], `map ${m} edge ${x},${y} unreachable`).toBeLessThan(0x3fffffff);
      }
      for (let y = -19; y <= 19; y += 4) {
        for (const x of [-29, 29]) expect(w.field.cost[cellIndex(x, y)], `map ${m} edge ${x},${y} unreachable`).toBeLessThan(0x3fffffff);
      }
    }
  });

  it('games on different maps differ, are deterministic, and snapshots keep the layout', () => {
    const base = { seed: 4, players: [{ slot: 0, weapon: 'ar' as const }] };
    const run = (map: number): number => {
      const w = createGame({ ...base, map });
      for (let t = 0; t < 300; t++) step(w, [{ ...NONE, moveX: 80, moveY: 40, aim: t * 97, buttons: Buttons.Fire }]);
      return hashWorld(w);
    };
    expect(run(1)).toBe(run(1));
    expect(run(0)).not.toBe(run(2));
    const a = createGame({ ...base, map: 2, difficulty: 2 });
    for (let t = 0; t < 200; t++) step(a, [NONE]);
    const b = createWorld(9);
    restoreWorld(b, serializeWorld(a));
    expect(b.map).toBe(2);
    expect(b.difficulty).toBe(2);
    expect(hashWorld(b)).toBe(hashWorld(a));
    for (let t = 0; t < 200; t++) {
      step(a, [NONE]);
      step(b, [NONE]);
    }
    expect(hashWorld(b)).toBe(hashWorld(a));
  });
});
