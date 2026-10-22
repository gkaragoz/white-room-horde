import { TRACK, xpForLevel } from '@wrh/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { codexAdd, CODEX_CATEGORIES } from '../src/codex';
import { codexPageHtml, codexSub, levelPathHtml, runRewardHtml, trackView } from '../src/metaUi';
import { fill, metaWords } from '../src/metaStrings';
import { rewardsBetween } from '../src/meta';
import { loadProfile } from '../src/profile';
import { LANGS, UI_STRINGS } from '../src/uiStrings';

beforeEach(() => localStorage.clear());
const count = (html: string, cls: string) => (html.match(new RegExp(`class="wrh-tile ${cls}`, 'g')) ?? []).length;

describe('the level path', () => {
  it('shows the level, the XP to the next one and what the next levels open', () => {
    const p = loadProfile();
    const html = levelPathHtml(p, UI_STRINGS.en, 'en');
    expect(html).toContain('Level 1');
    expect(html).toContain(`${xpForLevel(2)} XP to level 2`);
    expect(html).toContain('wrh-node now');
    expect(html).toMatch(/class="rw"/);
  });

  it('says MAX at the top and keeps counting XP', () => {
    const p = loadProfile();
    p.xp = xpForLevel(100) + 5000;
    const html = levelPathHtml(p, UI_STRINGS.en, 'en');
    expect(html).toContain('MAX');
    expect(html).toContain('XP keeps counting');
  });
});

describe('the Codex page', () => {
  it('draws met, opened and locked tiles and counts them in the tabs', () => {
    const p = loadProfile();
    p.xp = xpForLevel(20);
    codexAdd(p.codex, 'weapon', 8);
    const html = codexPageHtml(p, 'weapon', UI_STRINGS.en, 'en');
    expect(count(html, 'met')).toBe(1);
    expect(count(html, 'open')).toBeGreaterThan(1);
    expect(count(html, 'locked')).toBeGreaterThan(1);
    expect(html).toContain('???');
    expect(html).toContain('Level ');
    expect(html).toContain('1/23');
    expect(codexSub(p, 'en')).toMatch(/^1 \/ \d+ discovered$/);
  });

  it('has a tab for every category and a tile for every entry of the chosen one', () => {
    const p = loadProfile();
    for (const cat of CODEX_CATEGORIES) {
      const html = codexPageHtml(p, cat, UI_STRINGS.en, 'en');
      expect(html).toContain(`data-ctab="${cat}"`);
      expect(html).toContain('wrh-tile');
    }
  });

  it('marks what a level-up opened as new', () => {
    const p = loadProfile();
    p.xp = xpForLevel(2);
    p.seenNew = ['weapon:mp'];
    expect(codexPageHtml(p, 'weapon', UI_STRINGS.en, 'en')).toContain('New!');
  });
});

describe('the game over rewards', () => {
  const rewards = rewardsBetween(1, 3);
  it('shows one pack per reward, face down until opened', () => {
    const html = runRewardHtml({ xp: 1000, levelBefore: 1, levelAfter: 3, rewards, discoveries: [] }, { opened: new Set([0]) }, UI_STRINGS.en, 'en', 90);
    expect((html.match(/data-pack=/g) ?? []).length).toBe(rewards.length);
    expect((html.match(/wrh-pack open/g) ?? []).length).toBe(1);
    expect(html).toContain('+1000 XP');
    expect(html).toContain('Level 1 to 3');
    expect(html).toContain('wrh-openall');
  });

  it('explains a run that was too short, and a level without news', () => {
    const none = runRewardHtml({ xp: 0, levelBefore: 1, levelAfter: 1, rewards: [], discoveries: [] }, { opened: new Set() }, UI_STRINGS.en, 'en', 5);
    expect(none).toContain('shorter than 15 seconds');
    const same = runRewardHtml({ xp: 40, levelBefore: 4, levelAfter: 4, rewards: [], discoveries: [] }, { opened: new Set() }, UI_STRINGS.en, 'en', 60);
    expect(same).toContain('No new level this run');
    expect(same).not.toContain('data-pack');
  });
});

describe('names and words', () => {
  it('names everything the track opens in every language', () => {
    for (const { id } of LANGS) for (const item of TRACK) expect(trackView(item, UI_STRINGS[id], id).name, `${id} ${item.cat}:${item.name}`).not.toBe('');
  });

  it('has the same keys in every language (English fills the gaps) and all nine tabs', () => {
    const en = Object.keys(metaWords('en')).sort();
    for (const { id } of LANGS) {
      expect(Object.keys(metaWords(id)).sort()).toEqual(en);
      expect(Object.keys(metaWords(id).tabs).sort()).toEqual([...CODEX_CATEGORIES].sort());
    }
  });

  it('fills the places of a string', () => {
    expect(fill('{n} XP to level {l}', { n: 5, l: 3 })).toBe('5 XP to level 3');
  });
});
