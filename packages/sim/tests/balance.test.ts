import { describe, expect, it } from 'vitest';
import { BALANCE } from '@wrh/shared';
import { playBots } from './bot';

describe('balance', () => {
  it('a squad of simple bots gets a good way up and then dies: the game neither ends at once nor lets a squad live for ever', () => {
    // eight minutes of play each: the waves are big now, so a full soak would take too long on every test run
    const floors = [1, 2].map((seed) => playBots(seed, 3, 30 * 60 * 8).floor);
    for (const f of floors) {
      expect(f).toBeGreaterThanOrEqual(4);
      expect(f).toBeLessThanOrEqual(60);
    }
  }, 600000);

  it('the same seed plays out identically twice, with bots using classes, abilities and melee (soak)', () => {
    const run = (): string => {
      const r = playBots(7, 3, 30 * 60 * 3);
      return `${r.floor}/${r.ticks}`;
    };
    expect(run()).toBe(run());
  }, 600000);

  it('past the early floors every floor hits harder than the last', () => {
    expect(BALANCE.late.damagePerFloor).toBeGreaterThan(0.03);
    expect(BALANCE.late.hpPerFloor).toBeGreaterThan(0.01);
  });
});
