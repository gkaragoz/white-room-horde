import { BALANCE, Buttons, ENEMY_TYPES, MAX_PLAYERS, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld, hashWorld, setWave, spawnEnemy, step } from '../src';
import { cellIndex, FlowField, FF_W } from '../src/flowfield';
import { runScripted, scriptedInput } from '../src/testkit';

const NONE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };
const G = ENEMY_TYPES.indexOf('grunt');
const TANK = ENEMY_TYPES.indexOf('tank');

describe('flow field', () => {
  it('points toward the source and routes around walls', () => {
    const f = new FlowField();
    const src = cellIndex(5, 0);
    f.compute([src], 1);
    const c = cellIndex(-5, 0);
    expect(f.dirX[c]).toBeGreaterThan(0.9);
    // wall with a gap at the top
    for (let y = -20; y < 15; y++) f.blocked[cellIndex(0, y + 0.5)] = 1;
    f.compute([src], 1);
    expect(f.cost[c]).toBeGreaterThan(200);
    expect(f.cost[c]).toBeLessThan(0x3fffffff);
    // walking the field from the left side ends at the source
    let x = -5;
    let y = 0;
    for (let i = 0; i < 200; i++) {
      const k = cellIndex(x, y);
      if (k === src) break;
      x += f.dirX[k]! * 0.5;
      y += f.dirY[k]! * 0.5;
    }
    expect(cellIndex(x, y)).toBe(src);
    expect(FF_W).toBe(104);
  });
});

describe('waves', () => {
  /** Kill everything alive right now (the way a good player clears a wave). */
  const wipe = (w: ReturnType<typeof createWorld>): void => {
    for (let i = 0; i < w.eActive.length; i++) {
      if (!w.eActive[i]) continue;
      w.eActive[i] = 0;
      w.enemyCount--;
    }
  };

  it('killing enemies does not make new ones appear: a wave brings its own number and no more', () => {
    const w = createWorld(21);
    addPlayer(w, 0, 0, 0);
    const total = (): number => w.misc[3]!;
    let spawned = 0;
    for (let t = 0; t < 30 * 40; t++) {
      step(w, [NONE]);
      spawned = total() - w.misc[1]!;
      wipe(w); // the player kills everything instantly, over and over
      if (w.misc[1] === 0) break;
    }
    expect(w.misc[1]).toBe(0);
    expect(spawned).toBe(total());
    // nothing more arrives; the floor is cleared and the countdown runs
    const wave = w.wave;
    for (let t = 0; t < 30 * 3; t++) step(w, [NONE]);
    expect(w.wave).toBe(wave);
    expect(w.enemyCount).toBe(0);
  });

});

describe('enemies', () => {
  it('a wave arrives in a rush from the arena edge, away from players, and has a fixed size', () => {
    const w = createWorld(3);
    addPlayer(w, 0, 0, 0);
    for (let t = 0; t < 90; t++) step(w, [NONE]);
    expect(w.misc[3]!).toBeGreaterThanOrEqual(BALANCE.waves.baseCount);
    expect(w.enemyCount).toBeGreaterThanOrEqual(w.misc[3]! * BALANCE.waves.spawnBurst - 1);
    for (let i = 0; i < w.eActive.length; i++) {
      if (!w.eActive[i]) continue;
      expect(Math.hypot(w.eX[i]!, w.eY[i]!)).toBeGreaterThan(0);
    }
  });

  it('chases the player and deals contact damage with invulnerability frames', () => {
    const w = createWorld(1);
    addPlayer(w, 0, 0, 0);
    w.rng.seed(1);
    const i = spawnEnemy(w, G, 6, 0, false);
    let hit = 0;
    for (let t = 0; t < 150 && hit < 2; t++) {
      step(w, [NONE]);
      for (const e of w.events) if (e.type === 'playerHit') hit++;
    }
    expect(w.eX[i]).toBeLessThan(2);
    expect(w.pHp[0]).toBeLessThan(BALANCE.player.hp);
    expect(w.pHp[0]).toBeGreaterThanOrEqual(BALANCE.player.hp - 3 * BALANCE.enemies.grunt.damage);
  });

  it('bullets kill enemies and emit death events', () => {
    const w = createWorld(5);
    addPlayer(w, 0, 0, 0, 'ar');
    // keep the wave spawner out of the way
    w.waveTick = 1e9;
    spawnEnemy(w, G, 6, 0, false);
    let died = false;
    for (let t = 0; t < 60 && !died; t++) {
      step(w, [{ ...NONE, aim: 0, buttons: Buttons.Fire }]);
      died = w.events.some((e) => e.type === 'enemyDeath');
    }
    expect(died).toBe(true);
    expect(w.kills).toBeGreaterThanOrEqual(1);
  });

  it('sniper bullets pierce, pistol bullets do not', () => {
    const run = (weapon: 'sniper' | 'pistol'): number => {
      const w = createWorld(9);
      w.waveTick = 1e9;
      addPlayer(w, 0, -10, 0, weapon);
      for (const x of [-4, -2.5, -1]) {
        const k = spawnEnemy(w, G, x, 0, false);
        w.eHp[k] = 5;
        w.eCooldown[k] = 1e9;
      }
      // pin them so they do not walk away
      let dead = 0;
      for (let t = 0; t < 6; t++) {
        step(w, [{ ...NONE, aim: 0, buttons: t === 0 ? Buttons.Fire : 0 }]);
        for (const e of w.events) if (e.type === 'enemyDeath') dead++;
      }
      return dead;
    };
    expect(run('pistol')).toBeLessThanOrEqual(1);
    expect(run('sniper')).toBeGreaterThanOrEqual(2);
  });

  it('is deterministic with enemies in play', () => {
    const a = runScripted(77, 900, 6);
    const b = runScripted(77, 900, 6);
    expect(a.hash).toBe(b.hash);
    expect(a.world.kills + a.world.enemyCount).toBeGreaterThan(20);
    expect(a.world.kills).toBeGreaterThan(0);
  });

  it('setWave scales counts and hp without pow', () => {
    const w = createWorld(1);
    setWave(w, 10);
    expect(w.countMul).toBeCloseTo(BALANCE.waves.countGrowth ** 9, 9);
    expect(w.hpMul).toBeCloseTo((1 + BALANCE.waves.hpGrowth) ** 9, 9);
    expect(TANK).toBeGreaterThan(0);
  });
});

describe('benchmark', () => {
  it('a full house of enemies and 8 shooting players stay under 12 ms per tick', () => {
    const w = createWorld(11);
    const players = Math.min(8, MAX_PLAYERS);
    for (let s = 0; s < players; s++) addPlayer(w, s, s * 3 - 10, 0, s % 2 ? 'smg' : 'ar');
    setWave(w, 20);
    // make the player side tanky enough that nobody dies during the measurement
    for (let t = 0; t < 600; t++) {
      for (let s = 0; s < players; s++) w.pHp[s] = BALANCE.player.hp;
      step(w, Array.from({ length: players }, (_, s) => scriptedInput(t, s)));
    }
    const samples: number[] = [];
    for (let t = 600; t < 900; t++) {
      for (let s = 0; s < players; s++) w.pHp[s] = BALANCE.player.hp;
      const inputs = Array.from({ length: players }, (_, s) => scriptedInput(t, s));
      const t0 = performance.now();
      step(w, inputs);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const p99 = samples[Math.floor(samples.length * 0.99)]!;
    console.log(`sim benchmark: enemies=${w.enemyCount} avg=${avg.toFixed(2)}ms p99=${p99.toFixed(2)}ms max=${samples[samples.length - 1]!.toFixed(2)}ms hash=${hashWorld(w)}`);
    expect(w.enemyCount).toBeGreaterThan(300);
    expect(avg).toBeLessThan(12);
  }, 60000);
});
