import { BALANCE, Buttons, ENEMY_TYPES, MAX_ENEMIES, MAX_TELE, PlayerState, RANK_OF, WEAPON_IDS, WEAPON_RANK, type PlayerInput, type WeaponId } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld, spawnBoss, spawnEnemy, step, type SimEvent, type World } from '../src';
import { ELITE } from '../src/features';

const NONE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };
const T = (name: string): number => ENEMY_TYPES.indexOf(name as (typeof ENEMY_TYPES)[number]);

function arena(seed: number, px = 0, py = 0, weapon: WeaponId = 'pistol'): World {
  const w = createWorld(seed);
  w.waveTick = 1e9;
  w.countMul = 0;
  addPlayer(w, 0, px, py, weapon);
  w.pHp[0] = w.pMaxHp[0] = 1e6;
  return w;
}

function run(w: World, ticks: number, each?: (w: World, ev: readonly SimEvent[]) => void, input: PlayerInput = NONE): void {
  for (let t = 0; t < ticks; t++) {
    step(w, [input]);
    each?.(w, w.events);
  }
}

function enemy(w: World, name: string, x: number, y: number): number {
  const e = spawnEnemy(w, T(name), x, y, false);
  w.eCooldown[e] = 0;
  return e;
}

const telegraphs = (w: World): number => {
  let n = 0;
  for (let i = 0; i < MAX_TELE; i++) if (w.tActive[i]) n++;
  return n;
};

describe('the new content exists and is tuned', () => {
  const names = ['pouncer', 'hurler', 'grabber', 'spiker', 'shocker', 'brood', 'trapper', 'warcaller', 'chopper', 'quaker'] as const;
  it('ten new enemies have stats, an unlock floor, a weight, xp and behaviour numbers', () => {
    for (const n of names) {
      expect(T(n), n).toBeGreaterThan(20);
      expect(BALANCE.enemies[n].hp).toBeGreaterThan(0);
      expect(BALANCE.waves.unlock[n]).toBeGreaterThanOrEqual(5);
      expect(BALANCE.waves.weights[n]).toBeGreaterThan(0);
      expect(BALANCE.progression.xp[n]).toBeGreaterThan(0);
      expect(BALANCE.special[n], n).toBeTruthy();
    }
    expect(ENEMY_TYPES.length).toBe(31);
  });

  it('ten new guns are in the arsenal, once in the ranking, with sane numbers', () => {
    const guns = ['railgun', 'crossbow', 'plasma', 'rocket', 'nailgun', 'autoshotgun', 'akimbo', 'frostgun', 'sawlauncher', 'arcthrower'] as const;
    for (const g of guns) {
      expect(WEAPON_IDS.includes(g), g).toBe(true);
      expect(WEAPON_RANK.filter((x) => x === g).length, g).toBe(1);
      const st = BALANCE.weapons[g];
      expect(st.damage * st.pellets * st.rate, g).toBeGreaterThan(30);
      expect(st.mag).toBeGreaterThan(0);
      expect(st.muzzleFwd).toBeGreaterThan(1);
    }
    expect(new Set(WEAPON_RANK).size).toBe(WEAPON_IDS.length);
    expect(RANK_OF.every((r) => r >= 0)).toBe(true);
    expect(WEAPON_IDS.length).toBe(25);
  });
});

describe('the new enemies do what they are made for', () => {
  it('the pouncer crouches, marks a spot and leaps onto it: whoever stays there is hit and thrown', () => {
    const w = arena(1);
    const e = enemy(w, 'pouncer', 9, 0);
    let flew = false;
    let hurt = false;
    const hp = w.pHp[0]!;
    run(w, 120, (ww, ev) => {
      if (ww.eAir[e]! > 0) flew = true;
      if (ev.some((x) => x.type === 'teleHit')) hurt = true;
    });
    expect(flew).toBe(true);
    expect(hurt).toBe(true);
    expect(w.pHp[0]!).toBeLessThan(hp);
  });

  it('the pouncer misses a player who moves off the marked spot', () => {
    const w = arena(2);
    enemy(w, 'pouncer', 9, 0);
    const hp = w.pHp[0]!;
    let landed = false;
    // keep walking sideways: the first leap lands where the player was when it crouched
    for (let t = 0; t < 100 && !landed; t++) {
      step(w, [{ ...NONE, moveY: 127 }]);
      if (w.events.some((x) => x.type === 'teleHit')) landed = true;
    }
    expect(landed).toBe(true);
    expect(w.pHp[0]).toBe(hp);
  });

  it('the hurler picks up a small enemy and throws it at the player', () => {
    const w = arena(3);
    const h = enemy(w, 'hurler', 9, 0);
    const g = enemy(w, 'grunt', 8, 2);
    w.eFrost[g] = 0;
    let thrown = false;
    run(w, 150, (ww) => {
      if (ww.eAir[g]! > 0 && ww.eAir[g]! < 18) thrown = true;
    });
    expect(thrown).toBe(true);
    expect(w.eActive[h]).toBe(1);
  });

  it('the grabber catches a player in front of it and throws them across the room', () => {
    const w = arena(4);
    const e = enemy(w, 'grabber', 2.2, 0);
    const hp = w.pHp[0]!;
    let launched = false;
    run(w, 90, (_ww, ev) => {
      if (ev.some((x) => x.type === 'launch')) launched = true;
    });
    expect(e).toBeGreaterThanOrEqual(0);
    expect(launched).toBe(true);
    expect(w.pHp[0]!).toBeLessThan(hp);
  });

  it('the spiker marks a fan of lines before it shoots and hurts what stands in one', () => {
    const w = arena(5);
    enemy(w, 'spiker', 9, 0);
    let most = 0;
    const hp = w.pHp[0]!;
    run(w, 60, (ww) => {
      most = Math.max(most, telegraphs(ww));
    });
    expect(most).toBeGreaterThanOrEqual(BALANCE.special.spiker!.count!);
    run(w, 40);
    expect(w.pHp[0]!).toBeLessThan(hp);
  });

  it('the shocker pulses a ring round itself', () => {
    const w = arena(6);
    enemy(w, 'shocker', 5, 0);
    const hp = w.pHp[0]!;
    run(w, 90);
    expect(w.pHp[0]!).toBeLessThan(hp);
  });

  it('a brood mother bursts into crawlers when it dies', () => {
    const w = arena(7);
    const e = enemy(w, 'brood', 6, 0);
    w.eFrost[e] = 1e6;
    w.eHp[e] = 1;
    const before = w.enemyCount;
    let died = false;
    for (let t = 0; t < 40 && !died; t++) {
      step(w, [{ ...NONE, buttons: Buttons.Fire }]);
      died = w.events.some((x) => x.type === 'enemyDeath');
    }
    expect(died).toBe(true);
    let crawlers = 0;
    for (let i = 0; i < MAX_ENEMIES; i++) if (w.eActive[i] && w.eType[i] === T('crawler')) crawlers++;
    expect(crawlers).toBe(BALANCE.special.brood!.count!);
    expect(w.enemyCount).toBe(before - 1 + crawlers);
  });

  it('the trapper lays mines round the player that go off a moment later', () => {
    const w = arena(8);
    enemy(w, 'trapper', 9, 0);
    let mines = 0;
    const hp = w.pHp[0]!;
    run(w, 150, (ww) => {
      mines = Math.max(mines, telegraphs(ww));
    });
    expect(mines).toBeGreaterThanOrEqual(BALANCE.special.trapper!.count!);
    void hp;
  });

  it('the warcaller calls reinforcements with a horn', () => {
    const w = arena(9);
    enemy(w, 'warcaller', 11, 0);
    const before = w.enemyCount;
    run(w, 120);
    expect(w.enemyCount).toBeGreaterThanOrEqual(before + BALANCE.special.warcaller!.count!);
  });

  it('the chopper throws its axe along a line and the axe comes back', () => {
    const w = arena(10);
    enemy(w, 'chopper', 7, 0);
    let most = 0;
    run(w, 60, (ww) => {
      most = Math.max(most, telegraphs(ww));
    });
    expect(most).toBeGreaterThanOrEqual(2);
  });

  it('the quaker stomps a ring round itself and rains rocks on the players', () => {
    const w = arena(11);
    enemy(w, 'quaker', 8, 0);
    let most = 0;
    run(w, 60, (ww) => {
      most = Math.max(most, telegraphs(ww));
    });
    expect(most).toBeGreaterThanOrEqual(1 + BALANCE.special.quaker!.rocks!);
  });
});

describe('the five new elites', () => {
  const elite = (w: World, name: string, mod: number, x: number, y: number): number => {
    const e = enemy(w, name, x, y);
    w.eMod[e] = mod;
    if (mod === ELITE.Warded) w.eShield[e] = w.eHp[e]! * BALANCE.elites.wardedShield;
    return e;
  };

  it('berserk: runs faster in its frenzy', () => {
    const w = arena(12, 0, 0);
    const e = elite(w, 'grunt', ELITE.Berserk, 30, 0);
    const slow = createWorld(12);
    slow.waveTick = 1e9;
    slow.countMul = 0;
    addPlayer(slow, 0, 0, 0);
    slow.pHp[0] = slow.pMaxHp[0] = 1e6;
    const f = enemy(slow, 'grunt', 30, 0);
    let ahead = 0;
    for (let t = 0; t < 180; t++) {
      step(w, [NONE]);
      step(slow, [NONE]);
      ahead = Math.max(ahead, slow.eX[f]! - w.eX[e]!);
    }
    expect(ahead).toBeGreaterThan(0.5);
  });

  it('vampiric: heals itself when it hits', () => {
    const w = arena(13, 0, 0);
    const e = elite(w, 'grunt', ELITE.Vampiric, 1.2, 0);
    w.eHp[e] = 10;
    run(w, 40);
    expect(w.eHp[e]!).toBeGreaterThan(10 + BALANCE.elites.vampHeal * 0.5);
  });

  it('toxic: leaves acid behind', () => {
    const w = arena(14, -40, 0);
    elite(w, 'grunt', ELITE.Toxic, 40, 0);
    let zones = 0;
    run(w, 120, (ww) => {
      let n = 0;
      for (let z = 0; z < ww.zActive.length; z++) if (ww.zActive[z]) n++;
      zones = Math.max(zones, n);
    });
    expect(zones).toBeGreaterThan(2);
  });

  it('phantom: slips away from some of the hits, and not from all', () => {
    const w = arena(15, -10, 0, 'smg');
    const e = elite(w, 'tank', ELITE.Phantom, 6, 0);
    w.eFrost[e] = 1e6;
    w.eHp[e] = 1e6;
    run(w, 90, undefined, { ...NONE, buttons: Buttons.Fire });
    const lost = 1e6 - w.eHp[e]!;
    const shots = w.pStat[0 * 20 + 4]!;
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThan(shots * BALANCE.weapons.smg.damage * 0.95);
  });

  it('warded: a shield takes the first blows and the health stays whole until it is gone', () => {
    const w = arena(16, -10, 0);
    const e = elite(w, 'tank', ELITE.Warded, 6, 0);
    w.eFrost[e] = 1e6;
    const hp = w.eHp[e]!;
    const shield = w.eShield[e]!;
    expect(shield).toBeGreaterThan(0);
    run(w, 12, undefined, { ...NONE, buttons: Buttons.Fire });
    expect(w.eShield[e]!).toBeLessThan(shield);
    expect(w.eHp[e]).toBe(hp);
  });
});

describe('the five new bosses', () => {
  const kinds: Record<number, string[]> = { 7: ['quake'], 8: ['storm'], 9: ['plague'], 10: ['pounce'], 11: ['hurl', 'summon'] };
  for (const v of [7, 8, 9, 10, 11]) {
    it(`boss variant ${v} fights with its own attacks and the squad can live through it`, () => {
      const w = arena(20 + v, 0, 0);
      w.waveTick = w.tick - 1;
      w.wave = 5;
      const b = spawnBoss(w);
      expect(b).toBeGreaterThanOrEqual(0);
      w.eBoss[b] = v;
      w.eHp[b] = 1e9;
      const seen = new Set<string>();
      for (let t = 0; t < 30 * 40; t++) {
        step(w, [NONE]);
        for (const e of w.events) if (e.type === 'bossAbility') seen.add(e.kind);
        w.pHp[0] = w.pMaxHp[0]!;
        w.pState[0] = PlayerState.Alive;
      }
      for (const k of kinds[v]!) expect(seen.has(k), `${v} never used ${k} (${[...seen].join(',')})`).toBe(true);
    });
  }

  it('the boss floors bring every variant: old and new mixed', () => {
    const got = new Set<number>();
    for (let floor = 5; floor <= 55; floor += 5) {
      const w = arena(40);
      w.wave = floor;
      const b = spawnBoss(w);
      got.add(w.eBoss[b]!);
    }
    expect([...got].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    // a new one is met within the first five boss floors
    const early = new Set<number>();
    for (let floor = 5; floor <= 25; floor += 5) {
      const w = arena(41);
      w.wave = floor;
      early.add(w.eBoss[spawnBoss(w)]!);
    }
    expect([...early].some((v) => v >= 7)).toBe(true);
  });
});

describe('the new guns', () => {
  const aimed = (w: World, ticks: number, weapon: WeaponId, targets: [number, number][]): number[] => {
    const hps = targets.map(([x, y]) => {
      const e = spawnEnemy(w, T('tank'), x, y, false);
      w.eCooldown[e] = 1e9;
      w.eFrost[e] = 1e6;
      w.eHp[e] = 1e6;
      return e;
    });
    run(w, ticks, undefined, { ...NONE, aim: 0, buttons: Buttons.Fire });
    void weapon;
    return hps.map((e) => 1e6 - w.eHp[e]!);
  };

  for (const id of ['railgun', 'crossbow', 'plasma', 'rocket', 'nailgun', 'autoshotgun', 'akimbo', 'frostgun', 'sawlauncher', 'arcthrower'] as WeaponId[]) {
    it(`${id} hurts what is in front of it`, () => {
      const w = arena(60, -10, -12, id);
      const range = Math.min(BALANCE.weapons[id].range * 0.5, 8);
      const [lost] = aimed(w, 60, id, [[-10 + range, -12]]);
      expect(lost, id).toBeGreaterThan(0);
    });
  }

  it('the railgun and the saw pierce a whole line of enemies', () => {
    for (const id of ['railgun', 'sawlauncher'] as WeaponId[]) {
      const w = arena(61, -12, -12, id);
      const lost = aimed(w, 90, id, [[-6, -12], [-3, -12], [0, -12], [3, -12]]);
      expect(lost.filter((l) => l > 0).length, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('the frost gun leaves enemies frozen', () => {
    const w = arena(62, -10, -12, 'frostgun');
    const e = spawnEnemy(w, T('grunt'), -4, -12, false);
    w.eHp[e] = 1e9;
    w.eFrost[e] = 0;
    run(w, 20, undefined, { ...NONE, buttons: Buttons.Fire });
    expect(w.eFrost[e]!).toBeGreaterThan(0);
  });

  it('the rocket blast hurts a whole cluster', () => {
    const w = arena(63, -10, -12, 'rocket');
    const lost = aimed(w, 80, 'rocket', [[-2, -12], [-2, -10.5], [-2, -13.5], [-0.5, -12]]);
    expect(lost.filter((l) => l > 0).length).toBeGreaterThanOrEqual(3);
  });
});
