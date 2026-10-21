import { BALANCE, MODS, MOD_COUNT, TICK_RATE, scoreMultiplier, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, createWorld, spawnBoss, spawnEnemy, step, type World } from '../src';
import { modFx } from '../src/mods';
import { dropLoot } from '../src/pickups';
import { awardXp, xpForNext } from '../src/progression';
import { addTelegraph } from '../src/hazards';
import { FloorPhase, MISC, TeleEffect, TeleShape, ENEMY_TYPES, PickupType } from '@wrh/shared';

const NONE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };
const bit = (id: string): number => 1 << MODS.findIndex((m) => m.id === id);
const G = ENEMY_TYPES.indexOf('grunt');

function world(mods: number, seed = 5): World {
  const w = createWorld(seed, 0, mods);
  w.waveTick = 1e9;
  w.countMul = 0;
  addPlayer(w, 0, 0, 0, 'pistol');
  return w;
}

describe('difficulty multipliers', () => {
  it('there are twenty, every one makes the game harder, and the score multiplier grows with them', () => {
    expect(MOD_COUNT).toBe(20);
    expect(new Set(MODS.map((m) => m.id)).size).toBe(20);
    expect(scoreMultiplier(0)).toBe(1);
    let prev = 1;
    for (let i = 0; i < MOD_COUNT; i++) {
      const m = scoreMultiplier(1 << i);
      expect(m, MODS[i]!.id).toBeGreaterThan(1);
      prev = Math.max(prev, m);
    }
    expect(scoreMultiplier(2 ** MOD_COUNT - 1)).toBeGreaterThan(3);
    expect(modFx(0).enemyHp).toBe(1);
    expect(modFx(bit('tough')).enemyHp).toBe(1.5);
  });

  it('tough hides and titan bosses raise enemy and boss health', () => {
    const hp = (mods: number): number => {
      const w = world(mods);
      return w.eHp[spawnEnemy(w, G, 10, 0, false)]!;
    };
    expect(hp(bit('tough'))).toBeCloseTo(hp(0) * 1.5, 6);
    const boss = (mods: number): number => {
      const w = world(mods);
      return w.eHp[spawnBoss(w)]!;
    };
    expect(boss(bit('titanboss'))).toBeCloseTo(boss(0) * 1.5, 6);
  });

  it('brutal blows, wide danger and rushed attacks hurt more, wider and sooner', () => {
    const hit = (mods: number): number => {
      const w = world(mods);
      addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, 0, 0, 0, 3, 0, 0.1, 10);
      for (let t = 0; t < 6; t++) step(w, [NONE]);
      return BALANCE.player.hp - w.pHp[0]!;
    };
    expect(hit(bit('brutal'))).toBeCloseTo(hit(0) * 1.5, 5);
    const radius = (mods: number): number => {
      const w = world(mods);
      const t = addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, 0, 0, 0, 3, 0, 1, 10);
      return w.tW[t]!;
    };
    expect(radius(bit('wide'))).toBeCloseTo(radius(0) * 1.25, 6);
    const swings = (mods: number): number => {
      const w = world(mods);
      const k = spawnEnemy(w, G, 0.8, 0, false);
      w.eCooldown[k] = 0;
      let hits = 0;
      for (let t = 0; t < 600; t++) {
        w.pHp[0] = w.pMaxHp[0]!;
        step(w, [NONE]);
        hits += w.events.filter((e) => e.type === 'playerHit').length;
      }
      return hits;
    };
    expect(swings(bit('rushed'))).toBeGreaterThan(swings(0));
  });

  it('a bigger horde, swift enemies and more elites', () => {
    const count = (mods: number): number => {
      const g = createGame({ seed: 3, players: [{ slot: 0, weapon: 'pistol', cls: 0 }], mods });
      step(g, [NONE]); // the first floor sizes itself on the first tick
      return g.misc[MISC.Total]!;
    };
    expect(count(bit('horde'))).toBeGreaterThan(count(0));
    expect(modFx(bit('swift')).enemySpeed).toBe(1.2);
    expect(modFx(bit('elites')).eliteChance).toBe(2);
  });

  it('the player side: heavy boots, fragile, weak hits, slow trigger, long reload, slow learner', () => {
    const base = world(0);
    expect(world(bit('sluggish')).modSpeed[0]).toBeCloseTo(base.modSpeed[0]! * 0.85, 9);
    expect(world(bit('fragile')).pMaxHp[0]).toBe(Math.round(base.pMaxHp[0]! * 0.7));
    expect(world(bit('weak')).modDamage[0]).toBeCloseTo(base.modDamage[0]! * 0.85, 9);
    expect(world(bit('slowhands')).modRate[0]).toBeCloseTo(base.modRate[0]! * 0.85, 9);
    expect(world(bit('longreload')).modReload[0]).toBeCloseTo(base.modReload[0]! * 1.3, 9);
    const w = world(bit('slowlearner'));
    awardXp(w, 0, xpForNext(w, 0));
    expect(w.pLevel[0]).toBe(1); // 1.5x the experience is needed
    awardXp(w, 0, xpForNext(w, 0) * 0.6);
    expect(w.pLevel[0]).toBe(2);
  });

  it('scarce loot, no medkits and no grenades', () => {
    const drops = (mods: number, kind?: number): number => {
      const w = world(mods, 9);
      let n = 0;
      for (let i = 0; i < 3000; i++) {
        w.kActive.fill(0);
        dropLoot(w, 10, 10, false);
        for (let k = 0; k < w.kActive.length; k++) if (w.kActive[k] && (kind === undefined || w.kType[k] === kind)) n++;
      }
      return n;
    };
    expect(drops(bit('scarce'))).toBeLessThan(drops(0) * 0.75);
    expect(drops(bit('nohealing'), PickupType.Health)).toBe(0);
    expect(drops(0, PickupType.Health)).toBeGreaterThan(0);
    expect(drops(bit('nobombs'), PickupType.Grenade)).toBe(0);
    expect(world(bit('nobombs')).pGren[0]).toBe(0);
  });

  it('steep climb, hurry up and doomed', () => {
    const late = (mods: number): number => {
      const w = world(mods);
      w.wave = 30;
      addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, 0, 0, 0, 3, 0, 0.1, 10);
      for (let t = 0; t < 6; t++) step(w, [NONE]);
      return BALANCE.player.hp - w.pHp[0]!;
    };
    expect(late(bit('lategame'))).toBeGreaterThan(late(0) * 1.3);
    const w = world(bit('hurry'));
    w.pPending[0] = 1;
    w.misc[MISC.Phase] = FloorPhase.Cleared;
    w.misc[MISC.PhaseEnd] = 1e9;
    step(w, [NONE]);
    expect(w.pCardTimer[0]).toBeLessThanOrEqual(BALANCE.progression.cardSeconds * TICK_RATE * 0.5);
    expect(modFx(bit('doomed')).downedMul).toBe(0.5);
  });

  it('the same mods play out identically twice, and different mods play differently', () => {
    const run = (mods: number): number => {
      const g = createGame({ seed: 8, players: [{ slot: 0, weapon: 'pistol', cls: 0 }, { slot: 1, weapon: 'smg', cls: 2 }], mods });
      for (let t = 0; t < 400; t++) step(g, [NONE, NONE]);
      return g.enemyCount * 1000 + Math.round(g.pHp[0]!);
    };
    expect(run(0xfffff)).toBe(run(0xfffff));
    expect(run(0xfffff)).not.toBe(run(0));
  });
});
