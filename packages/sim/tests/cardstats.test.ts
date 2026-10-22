import { CARD_STATS, CLASS_CARDS, UNIVERSAL_CARDS } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld } from '../src';
import { applyUniversal } from '../src/cardtable';
import { ARRAYS } from '../src/schema';

const ALL = [...UNIVERSAL_CARDS, ...CLASS_CARDS];

describe('card stat registry', () => {
  it('knows every stat the card tables use', () => {
    const unknown = new Set<string>();
    for (const c of ALL)
      for (const [stat] of c.ops) if (!(stat in CARD_STATS)) unknown.add(`${c.id}:${stat}`);
    expect([...unknown]).toEqual([]);
  });

  it('has no stat that no card uses', () => {
    const used = new Set<string>(ALL.flatMap((c) => c.ops.map(([s]) => s)));
    expect(Object.keys(CARD_STATS).filter((s) => !used.has(s))).toEqual([]);
  });

  it('points every plain stat at a per-player array of the world', () => {
    for (const [stat, def] of Object.entries(CARD_STATS)) {
      if (def.apply.kind === 'special') continue;
      expect(def.apply.field in ARRAYS, `${stat} -> ${def.apply.field}`).toBe(true);
    }
  });

  it('applies every card, and a plain stat respects its bounds', () => {
    const w = createWorld(1);
    addPlayer(w, 0, 0, 0, 'pistol');
    for (const c of ALL) expect(applyUniversal(w, c.id, 0), c.id).toBe(true);
    expect(applyUniversal(w, 'not-a-card', 0)).toBe(false);
    for (let i = 0; i < 200; i++) for (const c of ALL) applyUniversal(w, c.id, 0);
    const pools = w as unknown as Record<string, ArrayLike<number>>;
    for (const [stat, def] of Object.entries(CARD_STATS)) {
      if (def.apply.kind === 'special') continue;
      const v = pools[def.apply.field]![0]!;
      if (def.apply.min !== undefined) expect(v, `${stat} floor`).toBeGreaterThanOrEqual(def.apply.min);
      if (def.apply.max !== undefined) expect(v, `${stat} ceiling`).toBeLessThanOrEqual(def.apply.max);
    }
  });
});
