import {
  DEFAULT_GAME_OPTIONS,
  Difficulty,
  MAP_COUNT,
  isValidMap,
  resolveMap,
  withOptions,
} from '@wrh/shared';
import { describe, expect, it } from 'vitest';

describe('GameOptions', () => {
  it('accepts an arena this build has, or -1 for random', () => {
    for (const ok of [-1, 0, MAP_COUNT - 1]) expect(isValidMap(ok), String(ok)).toBe(true);
    for (const bad of [-2, MAP_COUNT, 1.5, NaN, '1', null, undefined])
      expect(isValidMap(bad), String(bad)).toBe(false);
  });

  it('applies the valid fields of a patch and keeps the old value of the rest', () => {
    const base = { map: 1, mods: 3 };
    expect(withOptions(base, { map: 2 })).toEqual({ map: 2, mods: 3 });
    expect(withOptions(base, { mods: Difficulty.ALL })).toEqual({ map: 1, mods: Difficulty.ALL });
    expect(withOptions(base, { map: 99, mods: -4 })).toEqual(base);
    expect(withOptions(base, { map: 'x', mods: Difficulty.ALL + 1 })).toEqual(base);
    expect(withOptions(base, {})).toEqual(base);
  });

  it('does not change the object it was given', () => {
    const base = { ...DEFAULT_GAME_OPTIONS };
    withOptions(base, { map: 2, mods: 5 });
    expect(base).toEqual(DEFAULT_GAME_OPTIONS);
  });

  it('turns -1 into an arena and leaves a chosen one alone', () => {
    expect(resolveMap(2, () => 0.99)).toBe(2);
    expect(resolveMap(-1, () => 0)).toBe(0);
    expect(resolveMap(-1, () => 0.9999)).toBe(MAP_COUNT - 1);
  });
});
