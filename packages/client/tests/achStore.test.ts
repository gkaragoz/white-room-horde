import { ACHIEVEMENTS } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { applyRun, emptyStore, isGot, valueOf } from '../src/achStore';

const noFlags = Object.fromEntries(ACHIEVEMENTS.filter((a) => a.kind === 'flag').map((a) => [a.stat, false]));
const run = (totals: Record<string, number>, flags: Record<string, boolean> = {}) => ({
  totals,
  flags: { ...noFlags, ...flags },
});

describe('achievement store', () => {
  it('has the hundred achievements, ten of them hidden', () => {
    expect(ACHIEVEMENTS).toHaveLength(100);
    expect(ACHIEVEMENTS.filter((a) => a.hidden)).toHaveLength(10);
  });

  it('adds totals up, keeps the best run, and earns an achievement once', () => {
    const store = emptyStore();
    let earned = applyRun(store, run({ kills: 60, runKills: 60, floor: 3, games: 1 }), 1000).map((a) => a.id);
    expect(earned).toContain('games_1');
    expect(earned).not.toContain('kills_1');
    earned = applyRun(store, run({ kills: 60, runKills: 40, floor: 6, games: 1 }), 2000).map((a) => a.id);
    expect(store.life.kills).toBe(120);
    expect(store.best.runKills).toBe(60);
    expect(earned).toEqual(expect.arrayContaining(['kills_1', 'floor_1']));
    expect(store.got.floor_1).toBe(2000);
    expect(applyRun(store, run({ kills: 5, games: 1 }), 3000)).toHaveLength(0);
  });

  it('earns a special-condition achievement from its flag', () => {
    const store = emptyStore();
    const earned = applyRun(store, run({}, { quickDeath: true }), 4000).map((a) => a.id);
    expect(earned).toContain('speedrun_loss');
    const def = ACHIEVEMENTS.find((a) => a.id === 'speedrun_loss')!;
    expect(isGot(def, store)).toBe(true);
    expect(valueOf(def, store)).toBe(1);
  });

  it('folds a stat shared by several tiers in once per run', () => {
    const store = emptyStore();
    applyRun(store, run({ kills: 7 }));
    expect(store.life.kills).toBe(7);
  });
});
