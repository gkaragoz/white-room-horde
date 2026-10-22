import { CARD_STATS, CLASS_CARDS, UNIVERSAL_CARDS } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { CARD_PHRASES, universalCardTexts } from '../src/cardText';

const LANGS = ['en', 'tr', 'de', 'es', 'fr', 'ru'] as const;
const ALL = [...UNIVERSAL_CARDS, ...CLASS_CARDS];

describe('card texts', () => {
  it('has the phrases every stat needs in every language', () => {
    const missing: string[] = [];
    for (const lang of LANGS) {
      for (const c of ALL) {
        for (const [stat, v] of c.ops) {
          const phrase = CARD_PHRASES[lang][CARD_STATS[stat]!.phrase];
          const down = CARD_STATS[stat]!.format === 'factor' ? v < 1 : v < 0;
          if (!phrase?.up) missing.push(`${lang}/${stat}/up`);
          else if (down && !phrase.down) missing.push(`${lang}/${stat}/down (${c.id})`);
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('words every card, with its numbers filled in', () => {
    for (const lang of LANGS) {
      const texts = universalCardTexts(lang);
      for (const c of ALL) {
        const [title, text] = texts[c.id]!;
        expect(title, `${lang}/${c.id} title`).not.toBe('');
        expect(text, `${lang}/${c.id} text`).not.toBe('');
        expect(text, `${lang}/${c.id}`).not.toContain('{n}');
      }
    }
  });

  it('writes a factor as a percentage and a fraction as a percentage', () => {
    const dmg = UNIVERSAL_CARDS.find((c) => c.ops.some(([s]) => s === 'dmg'))!;
    const v = dmg.ops.find(([s]) => s === 'dmg')![1];
    expect(universalCardTexts('en')[dmg.id]![1]).toContain(`${Math.round(Math.abs(v) * 100)}%`);
  });
});
