import {
  CARD_CLASS,
  CARD_IDS,
  CARD_PACKS,
  CLASS_IDS,
  MAX_LEVEL,
  PRESSURE_PERMILLE,
  TRACK,
  XP_FOR_LEVEL,
  XP_REFERENCE_RUN,
  levelFromXp,
  poolAt,
  pressureAt,
  runXp,
  xpForLevel,
} from '@wrh/shared';
import { describe, expect, it } from 'vitest';

const gameplay = TRACK.filter((i) => i.cat !== 'cosmetic' && !i.bundled);
const countBits = (m: number) => m.toString(2).replace(/0/g, '').length;
const level = (l: number) => TRACK.filter((i) => i.level === l && i.cat !== 'cosmetic' && !i.bundled);

describe('the Discovery Track', () => {
  it('holds 132 rewards: 99 gameplay and 33 cosmetic', () => {
    expect(gameplay.length).toBe(99);
    expect(TRACK.filter((i) => i.cat === 'cosmetic').length).toBe(33);
  });

  it('puts at most three rewards on a level, all of them on a real level', () => {
    for (let l = 1; l <= MAX_LEVEL; l++) {
      const n = TRACK.filter((i) => i.level === l && !i.bundled).length;
      expect(n, `level ${l}`).toBeLessThanOrEqual(3);
    }
    for (const i of TRACK) expect(i.level).toBeGreaterThanOrEqual(1);
  });

  it('never leaves two levels in a row without a gameplay reward (the crown level aside)', () => {
    // level 100 is the crown alone, so the pair 99 and 100 is exempt
    for (let l = 2; l < MAX_LEVEL - 1; l++) {
      expect(level(l).length + level(l + 1).length, `levels ${l} and ${l + 1}`).toBeGreaterThan(0);
    }
  });

  it('names every reward something the game knows', () => {
    // poolAt throws on an unknown weapon, drone, arena, elite, class, mod or card pack
    expect(() => poolAt(MAX_LEVEL)).not.toThrow();
  });

  it('opens each kind of content exactly once', () => {
    const names = gameplay.filter((i) => i.cat !== 'pack').map((i) => `${i.cat}:${i.name}`);
    expect(new Set(names).size).toBe(names.length);
    const packs = TRACK.filter((i) => i.cat === 'pack').map((i) => i.name);
    expect(new Set(packs).size).toBe(packs.length);
  });
});

describe('poolAt', () => {
  it('only grows from one level to the next', () => {
    const grows = (a: number, b: number) => (a & b) === a;
    for (let l = 1; l < MAX_LEVEL; l++) {
      const a = poolAt(l);
      const b = poolAt(l + 1);
      for (const k of ['weapons', 'drones', 'elites', 'powerups', 'arenas', 'classes', 'mods'] as const) expect(grows(a[k], b[k]), `${k} at ${l}`).toBe(true);
      a.cards.forEach((on, n) => on && expect(b.cards[n], `card ${CARD_IDS[n]} at ${l}`).toBe(true));
    }
  });

  it('starts small and ends with everything', () => {
    const first = poolAt(1);
    expect(countBits(first.weapons)).toBe(7);
    expect(first.drones).toBe(0);
    expect(first.elites).toBe(0);
    expect(countBits(first.arenas)).toBe(1);
    expect(countBits(first.classes)).toBe(1);
    expect(first.mods).toBe(0);
    const last = poolAt(MAX_LEVEL);
    expect(countBits(last.weapons)).toBe(25);
    expect(countBits(last.drones)).toBe(7);
    expect(countBits(last.elites)).toBe(11);
    expect(countBits(last.mods)).toBe(20);
    expect(countBits(last.classes)).toBe(5);
    expect(last.cards.filter(Boolean).length).toBe(CARD_IDS.length);
  });

  it('clamps the level it is given', () => {
    expect(poolAt(0)).toBe(poolAt(1));
    expect(poolAt(500)).toBe(poolAt(MAX_LEVEL));
  });

  it('offers every class at least six cards from the first level on', () => {
    for (let l = 1; l <= MAX_LEVEL; l++) {
      const pool = poolAt(l);
      CLASS_IDS.forEach((_, c) => {
        const n = CARD_IDS.filter((id, k) => pool.cards[k] && (CARD_CLASS[id] & (1 << c)) !== 0).length;
        // the classes that are only reached by achievement get their own cards from the profile; the shared ones must suffice
        expect(n, `class ${CLASS_IDS[c]} at level ${l}`).toBeGreaterThanOrEqual(6);
      });
    }
  });

  it('gives a card pack only cards that exist, and no card twice across packs', () => {
    const seen = new Set<string>();
    for (const [name, cards] of Object.entries(CARD_PACKS)) {
      for (const id of cards) {
        expect(CARD_IDS.includes(id), `${name}: ${id}`).toBe(true);
        expect(seen.has(id), `${id} is in two packs`).toBe(false);
        seen.add(id);
      }
    }
    expect(seen.size).toBe(CARD_IDS.length);
  });
});

describe('enemy pressure', () => {
  it('runs from 450 up to 1000 and never falls', () => {
    expect(PRESSURE_PERMILLE.length).toBe(MAX_LEVEL + 1);
    expect(PRESSURE_PERMILLE[1]).toBe(450);
    for (let l = 2; l <= MAX_LEVEL; l++) expect(PRESSURE_PERMILLE[l]!, `level ${l}`).toBeGreaterThanOrEqual(PRESSURE_PERMILLE[l - 1]!);
    expect(PRESSURE_PERMILLE[60]).toBe(1000);
    expect(PRESSURE_PERMILLE[MAX_LEVEL]).toBe(1000);
    expect(pressureAt(1)).toBe(450);
    expect(pressureAt(1000)).toBe(1000);
  });

  it('is made of integers', () => {
    for (const p of PRESSURE_PERMILLE.slice(1)) expect(Number.isInteger(p)).toBe(true);
  });
});

describe('XP and levels', () => {
  it('needs more XP for every level, from nothing at level 1', () => {
    expect(xpForLevel(1)).toBe(0);
    for (let l = 2; l <= MAX_LEVEL; l++) expect(XP_FOR_LEVEL[l]!).toBeGreaterThan(XP_FOR_LEVEL[l - 1]!);
  });

  it('keeps the climb near 117 reference runs', () => {
    expect(XP_FOR_LEVEL[MAX_LEVEL]! / XP_REFERENCE_RUN).toBeGreaterThan(110);
    expect(XP_FOR_LEVEL[MAX_LEVEL]! / XP_REFERENCE_RUN).toBeLessThan(125);
  });

  it('turns XP into a level and back', () => {
    for (let l = 1; l <= MAX_LEVEL; l++) {
      expect(levelFromXp(xpForLevel(l))).toBe(l);
      if (l > 1) expect(levelFromXp(xpForLevel(l) - 1)).toBe(l - 1);
    }
    expect(levelFromXp(-5)).toBe(1);
    expect(levelFromXp(0)).toBe(1);
  });

  it('stops at the top level while XP keeps counting', () => {
    expect(levelFromXp(xpForLevel(MAX_LEVEL))).toBe(MAX_LEVEL);
    expect(levelFromXp(xpForLevel(MAX_LEVEL) * 10)).toBe(MAX_LEVEL);
  });

  it('makes the first climbs quick: a reference run is worth more than a level on the first ten', () => {
    expect(levelFromXp(XP_REFERENCE_RUN)).toBeGreaterThanOrEqual(2);
    expect(levelFromXp(runXp(5000))).toBeGreaterThanOrEqual(2);
  });

  it('values a run at a tenth of the team score', () => {
    expect(runXp(0)).toBe(0);
    expect(runXp(4999)).toBe(500);
    expect(runXp(-10)).toBe(0);
  });
});
