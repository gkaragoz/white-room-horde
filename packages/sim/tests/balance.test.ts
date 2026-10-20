import { describe, expect, it } from 'vitest';
import { BALANCE } from '@wrh/shared';
import { playBots } from './bot';

describe('balance', () => {
  it('a squad of simple bots gets a good way up and then dies: the game neither ends at once nor lets a squad live for ever', () => {
    const floors = [1, 2, 3].map((seed) => playBots(seed).floor);
    for (const f of floors) {
      expect(f).toBeGreaterThanOrEqual(8);
      expect(f).toBeLessThanOrEqual(60);
    }
  }, 600000);

  it('past the early floors every floor hits harder than the last', () => {
    expect(BALANCE.late.damagePerFloor).toBeGreaterThan(0.03);
    expect(BALANCE.late.hpPerFloor).toBeGreaterThan(0.01);
  });
});
