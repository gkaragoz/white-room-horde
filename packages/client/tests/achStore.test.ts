import { ACHIEVEMENTS, SIGNATURE_ACHIEVEMENTS } from '@wrh/shared';
import { CODEX_CATEGORIES, codexAdd, emptyCodex } from '../src/codex';
import { catalog, codexTotals } from '../src/meta';
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
    expect(earned).toEqual(['games_1']);
    const need = (id: string): number => ACHIEVEMENTS.find((a) => a.id === id)!.target;
    earned = applyRun(store, run({ kills: need('kills_1'), runKills: 40, floor: need('floor_1'), games: 1 }), 2000).map((a) => a.id);
    expect(store.life.kills).toBe(60 + need('kills_1'));
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

  it('keeps the hidden special-condition achievements for the tenth run on, except a very short loss', () => {
    const store = emptyStore();
    expect(applyRun(store, run({ games: 1 }, { barrels50: true }), 1).map((a) => a.id)).not.toContain('firebug');
    for (let i = 0; i < 8; i++) applyRun(store, run({ games: 1 }), 2 + i);
    expect(applyRun(store, run({ games: 1 }, { barrels50: true }), 20).map((a) => a.id)).toContain('firebug');
  });
});

describe('the achievement table', () => {
  it('has 100 achievements, 10 hidden, one free and no XP', () => {
    expect(ACHIEVEMENTS).toHaveLength(100);
    expect(ACHIEVEMENTS.filter((a) => a.hidden)).toHaveLength(10);
    const first = ACHIEVEMENTS.filter((a) => a.kind === 'life' && a.stat === 'games').map((a) => a.target);
    expect(first[0]).toBe(1);
    expect(first.slice(1).every((n) => n > 1)).toBe(true);
  });

  it('rises with the tier inside each group', () => {
    const groups = new Map<string, { tier: number; target: number }[]>();
    for (const a of ACHIEVEMENTS) if (!a.hidden) groups.set(a.group, [...(groups.get(a.group) ?? []), a]);
    for (const [g, list] of groups) {
      for (let i = 1; i < list.length; i++) {
        expect(list[i]!.target, g).toBeGreaterThan(list[i - 1]!.target);
        expect(list[i]!.tier, g).toBeGreaterThanOrEqual(list[i - 1]!.tier);
      }
    }
  });

  it('opens each class that is not on the track with a silver achievement', () => {
    expect(Object.keys(SIGNATURE_ACHIEVEMENTS).sort()).toEqual(['berserker', 'demolisher', 'hammerer', 'ranger']);
    for (const id of Object.values(SIGNATURE_ACHIEVEMENTS)) {
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      expect(a, id).toBeDefined();
      expect(a!.tier).toBe(1);
    }
  });

  it('counts the Codex entries it can reach', () => {
    const totals = codexTotals(emptyCodex());
    const max: Record<string, number> = {};
    for (const cat of CODEX_CATEGORIES) max[cat] = catalog(cat).length;
    const limit: Record<string, number> = { codexWeapons: max.weapon!, codexDrones: max.drone!, codexEnemies: max.enemy!, codexBosses: max.boss!, codexElites: max.elite!, codexArenas: max.arena! };
    const codexAch = ACHIEVEMENTS.filter((a) => a.stat.startsWith('codex'));
    expect(codexAch).toHaveLength(12);
    for (const a of codexAch) {
      expect(totals[a.stat], a.stat).toBe(0);
      expect(a.target, a.id).toBeLessThanOrEqual(limit[a.stat]!);
    }
  });

  it('gives a Codex achievement once enough has been met', () => {
    const codex = emptyCodex();
    for (let i = 0; i < 3; i++) codexAdd(codex, 'drone', i);
    const store = emptyStore();
    const summary = run({ games: 1 });
    Object.assign(summary.totals, codexTotals(codex));
    expect(applyRun(store, summary, 1).map((a) => a.id)).toContain('codex_drones_1');
  });
});
