import { Difficulty, MODS, MOD_COUNT, MOD_FX_DEFAULTS } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { createWorld, modFx, runScore } from '../src';

describe('Difficulty', () => {
  it('builds, reads and counts a set by id', () => {
    const mask = Difficulty.bit('tough') | Difficulty.bit('fragile');
    expect(Difficulty.has(mask, 'tough')).toBe(true);
    expect(Difficulty.has(mask, 'brutal')).toBe(false);
    expect(Difficulty.count(mask)).toBe(2);
    expect(Difficulty.indices(mask).map((i) => MODS[i]!.id)).toEqual(['tough', 'fragile']);
    expect(Difficulty.count(0)).toBe(0);
    expect(Difficulty.count(Difficulty.ALL)).toBe(MOD_COUNT);
  });

  it('toggles one multiplier and back', () => {
    const on = Difficulty.toggle(0, 3);
    expect(Difficulty.indices(on)).toEqual([3]);
    expect(Difficulty.toggle(on, 3)).toBe(0);
  });

  it('fails loudly on an id the table does not know', () => {
    expect(() => Difficulty.bit('nope')).toThrow(/unknown difficulty multiplier/);
  });

  it('accepts exactly the masks made of known multipliers', () => {
    for (const ok of [0, 1, Difficulty.ALL]) expect(Difficulty.isValid(ok), String(ok)).toBe(true);
    for (const bad of [-1, 1.5, Difficulty.ALL + 1, 2 ** 32, NaN, Infinity, '3', null, undefined])
      expect(Difficulty.isValid(bad), String(bad)).toBe(false);
  });

  it('scores 1 for the normal game and rises with every multiplier', () => {
    expect(Difficulty.scoreMultiplier(0)).toBe(1);
    expect(Difficulty.scoreMultiplier(Difficulty.ALL)).toBeGreaterThan(3);
  });

  it('gives every multiplier effect a default of the same kind', () => {
    for (const m of MODS) {
      for (const [k, v] of Object.entries(m.fx)) {
        expect(k in MOD_FX_DEFAULTS, `${m.id}.${k}`).toBe(true);
        expect(typeof v).toBe('number');
      }
    }
    expect(modFx(0)).toEqual(MOD_FX_DEFAULTS);
    expect(modFx(Difficulty.bit('nohealing')).noHealthDrops).toBe(true);
  });

  it('multiplies the base score of a run by the Difficulty', () => {
    const w = createWorld(1, 0, Difficulty.bit('brutal'));
    const s = runScore(w);
    expect(s.mult).toBe(Difficulty.scoreMultiplier(w.mods));
    expect(s.final).toBe(Math.round(s.base * s.mult));
  });
});
