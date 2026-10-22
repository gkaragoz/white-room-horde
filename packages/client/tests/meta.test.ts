import { CARD_IDS, ENEMY_TYPES, TRACK, WEAPON_IDS, levelFromXp, xpForLevel } from '@wrh/shared';
import { createGame, step } from '@wrh/sim';
import { beforeEach, describe, expect, it } from 'vitest';
import { CODEX_SIZES, RunCodex, codexAdd, codexCount, codexHas, codexMask, codexMerge, emptyCodex, sanitizeCodex } from '../src/codex';
import { META, accessoryLevel, colorLevel, joinMeta, levelOf, sanitizeChoices, startWeapons, unlocked, xpForRun } from '../src/meta';
import { ACCESSORIES, loadProfile, recordGame, saveProfile } from '../src/profile';

beforeEach(() => {
  localStorage.clear();
  META.enabled = false;
});

describe('the Codex', () => {
  it('counts, adds once and reads back', () => {
    const c = emptyCodex();
    expect(codexAdd(c, 'weapon', 3)).toBe(true);
    expect(codexAdd(c, 'weapon', 3)).toBe(false);
    expect(codexAdd(c, 'card', CARD_IDS.length - 1)).toBe(true);
    expect(codexHas(c, 'weapon', 3)).toBe(true);
    expect(codexHas(c, 'weapon', 4)).toBe(false);
    expect(codexCount(c, 'weapon')).toBe(1);
    expect(codexCount(c, 'card')).toBe(1);
    expect(codexMask(c, 'weapon')).toBe(1 << 3);
  });

  it('ignores an index outside its category', () => {
    const c = emptyCodex();
    expect(codexAdd(c, 'drone', CODEX_SIZES.drone)).toBe(false);
    expect(codexAdd(c, 'drone', -1)).toBe(false);
    expect(codexCount(c, 'drone')).toBe(0);
  });

  it('survives a round trip through JSON and repairs a damaged save', () => {
    const c = emptyCodex();
    codexAdd(c, 'enemy', ENEMY_TYPES.length - 1);
    codexAdd(c, 'card', 100);
    expect(sanitizeCodex(JSON.parse(JSON.stringify(c)))).toEqual(c);
    const bad = sanitizeCodex({ weapon: ['x', 1.5, -1], drone: 'no', card: [0xffffffff, 0, 0, 0, 0, 0xffffffff], nothing: [1] });
    expect(codexCount(bad, 'drone')).toBe(0);
    expect(bad.weapon[0]).toBe(0);
    expect(codexCount(bad, 'card')).toBeLessThanOrEqual(CODEX_SIZES.card);
    expect(sanitizeCodex(null)).toEqual(emptyCodex());
  });

  it('merges a run into the saved one and reports what was new', () => {
    const saved = emptyCodex();
    codexAdd(saved, 'weapon', 1);
    const run = emptyCodex();
    codexAdd(run, 'weapon', 1);
    codexAdd(run, 'weapon', 2);
    expect(codexMerge(saved, run)).toEqual([{ cat: 'weapon', index: 2 }]);
    expect(codexCount(saved, 'weapon')).toBe(2);
  });
});

describe('what a run meets', () => {
  it('records fresh weapons, fresh drones and offered cards of the local player only', () => {
    const rc = new RunCodex(emptyCodex());
    rc.onEvent({ type: 'weaponGet', slot: 0, weapon: 4, fresh: true }, 0);
    rc.onEvent({ type: 'weaponGet', slot: 0, weapon: 5, fresh: false }, 0);
    rc.onEvent({ type: 'weaponGet', slot: 1, weapon: 6, fresh: true }, 0);
    rc.onEvent({ type: 'droneUnlock', slot: 0, kind: 3, fresh: true }, 0);
    rc.onEvent({ type: 'cardOffer', slot: 0, cards: [1, 2, 3] }, 0);
    rc.onEvent({ type: 'cardOffer', slot: 1, cards: [9] }, 0);
    expect(rc.found.map((d) => `${d.cat}:${d.index}`)).toEqual(['weapon:4', 'drone:3', 'card:1', 'card:2', 'card:3']);
  });

  it('announces a discovery once', () => {
    const rc = new RunCodex(emptyCodex());
    expect(rc.onEvent({ type: 'weaponGet', slot: 0, weapon: 4, fresh: true }, 0)).toHaveLength(1);
    expect(rc.onEvent({ type: 'weaponGet', slot: 0, weapon: 4, fresh: true }, 0)).toHaveLength(0);
    const saved = emptyCodex();
    codexAdd(saved, 'weapon', 4);
    expect(new RunCodex(saved).onEvent({ type: 'weaponGet', slot: 0, weapon: 4, fresh: true }, 0)).toHaveLength(0);
  });

  it('scans the arena, the class and the enemies of a world', () => {
    const w = createGame({ seed: 5, map: 2, players: [{ slot: 0, weapon: 'pistol', cls: 3 }] });
    for (let t = 0; t < 400; t++) step(w, [undefined]);
    const rc = new RunCodex(emptyCodex());
    rc.scan(w, 0);
    expect(codexHas(rc.codex, 'arena', 2)).toBe(true);
    expect(codexHas(rc.codex, 'class', 3)).toBe(true);
    expect(codexCount(rc.codex, 'enemy')).toBeGreaterThan(0);
  });
});

describe('levels and what they open', () => {
  it('derives the level from the XP', () => {
    expect(levelOf({ xp: 0 })).toBe(1);
    expect(levelOf({ xp: xpForLevel(10) })).toBe(10);
    expect(levelOf({ xp: xpForLevel(10) - 1 })).toBe(9);
    expect(levelOf({ xp: 1e9 })).toBe(100);
  });

  it('opens the starting set at level 1 and everything at 100', () => {
    const p = loadProfile();
    const first = unlocked(p);
    expect(first.classes).toBe(1);
    expect(first.accessories.filter(Boolean).length).toBe(3);
    expect(first.colors.filter(Boolean).length).toBe(2);
    p.xp = xpForLevel(100);
    const last = unlocked(p);
    expect(last.accessories.every(Boolean)).toBe(true);
    expect(last.colors.every(Boolean)).toBe(true);
  });

  it('knows a level for every accessory and colour the track names', () => {
    for (const i of TRACK.filter((t) => t.cat === 'cosmetic' && t.name.startsWith('renk '))) expect(colorLevel(Number(i.name.slice(5)) - 1), i.name).toBe(i.level);
    for (const i of TRACK.filter((t) => t.cat === 'cosmetic' && !t.name.startsWith('renk '))) {
      const idx = ACCESSORIES.indexOf(`acc_${i.name}` as (typeof ACCESSORIES)[number]);
      expect(idx, i.name).toBeGreaterThanOrEqual(0);
      expect(accessoryLevel(idx)).toBe(i.level);
    }
  });

  it('starts runs with the pistol and the SMG, then the guns met in the Codex', () => {
    const p = loadProfile();
    expect(startWeapons(p)).toEqual(['pistol', 'smg']);
    p.xp = xpForLevel(100);
    codexAdd(p.codex, 'weapon', WEAPON_IDS.indexOf('railgun'));
    codexAdd(p.codex, 'weapon', WEAPON_IDS.indexOf('sword'));
    expect(startWeapons(p)).toEqual(['pistol', 'smg', 'railgun']);
    p.xp = 0;
    expect(startWeapons(p)).toEqual(['pistol', 'smg']);
  });

  it('puts locked choices back to the defaults', () => {
    const p = loadProfile();
    Object.assign(p, { cls: 3, acc: 10, color: 7, map: 5, mods: 0b1111 });
    sanitizeChoices(p);
    expect(p).toMatchObject({ cls: 0, acc: 0, color: -1, map: -1, mods: 0 });
    p.xp = xpForLevel(100);
    Object.assign(p, { cls: 3, acc: 10, color: 7, map: 5, mods: 0b1111 });
    sanitizeChoices(p);
    expect(p).toMatchObject({ cls: 3, acc: 10, color: 7, map: 5, mods: 0b1111 });
  });

  it('opens a signature class by its achievement', () => {
    const p = loadProfile();
    const demolisher = 4;
    expect((unlocked(p).classes >> demolisher) & 1).toBe(0);
    p.ach.got['sig_demolisher'] = 1;
    expect((unlocked(p).classes >> demolisher) & 1).toBe(1);
  });
});

describe('what a room is told', () => {
  it('is the full game while the meta progression is off', () => {
    const p = loadProfile();
    expect(joinMeta(p)).toEqual({ lvl: 100, metW: -1, metD: -1 });
  });

  it('is the level and the met weapons and drones once it is on', () => {
    META.enabled = true;
    const p = loadProfile();
    p.xp = xpForLevel(12);
    codexAdd(p.codex, 'weapon', 2);
    codexAdd(p.codex, 'drone', 1);
    expect(joinMeta(p)).toEqual({ lvl: 12, metW: 1 << 2, metD: 1 << 1 });
  });
});

describe('XP of a run', () => {
  it('is a tenth of the team score, and nothing under 15 seconds', () => {
    expect(xpForRun(5000, 60)).toBe(500);
    expect(xpForRun(5000, 14.9)).toBe(0);
    expect(xpForRun(5000, 15)).toBe(500);
  });

  it('is added to the saved profile with the Codex, and a level-up lists its rewards', () => {
    const run = emptyCodex();
    codexAdd(run, 'weapon', 3);
    const r = recordGame(4, 100, 10000, { teamScore: 10000, seconds: 120, codex: run });
    expect(r.meta.xp).toBe(1000);
    expect(r.meta.levelBefore).toBe(1);
    expect(r.meta.levelAfter).toBe(levelFromXp(1000));
    expect(r.meta.levelAfter).toBeGreaterThan(1);
    expect(r.meta.rewards.length).toBeGreaterThan(0);
    expect(r.meta.discoveries).toEqual([{ cat: 'weapon', index: 3 }]);
    const saved = loadProfile();
    expect(saved.xp).toBe(1000);
    expect(codexHas(saved.codex, 'weapon', 3)).toBe(true);
    expect(saved.seenNew.length).toBeGreaterThan(0);
  });

  it('adds to what another tab saved in the meantime', () => {
    const first = loadProfile();
    recordGame(2, 10, 500, { teamScore: 500, seconds: 30 });
    first.xp = 0; // a stale copy in memory
    recordGame(2, 10, 500, { teamScore: 500, seconds: 30 });
    expect(loadProfile().xp).toBe(100);
  });

  it('gives a replay or a short run nothing', () => {
    recordGame(1, 0, 400, { teamScore: 400, seconds: 5 });
    expect(loadProfile().xp).toBe(0);
  });
});

describe('moving an old profile to the new system', () => {
  const OLD = { bestWave: 12, bestKills: 900, games: 40, totalKills: 7000, bestScore: 33000, acc: 5, cls: 2, color: 3, map: 4, mods: 5, ach: { life: { kills: 5000 }, best: {}, got: { games_1: 111 }, seen: {} } };

  it('does nothing while the meta progression is off', () => {
    localStorage.setItem('wrh.profile', JSON.stringify(OLD));
    const p = loadProfile();
    expect(p.ach.got['games_1']).toBe(111);
    expect(p.cls).toBe(2);
    expect(p.v).toBeUndefined();
    expect(localStorage.getItem('wrh.profile.v1')).toBeNull();
  });

  it('backs the old save up, resets progress, keeps records and tells the player once', () => {
    META.enabled = true;
    localStorage.setItem('wrh.profile', JSON.stringify(OLD));
    const p = loadProfile();
    expect(JSON.parse(localStorage.getItem('wrh.profile.v1')!)).toEqual(OLD);
    expect(p).toMatchObject({ v: 2, xp: 0, bestWave: 12, bestKills: 900, games: 40, totalKills: 7000, bestScore: 33000, introSeen: false });
    expect(p.ach.got).toEqual({});
    // the choices named things that are locked now
    expect(p).toMatchObject({ cls: 0, acc: 0, color: -1, map: -1, mods: 0 });
    saveProfile({ ...p, introSeen: true });
    expect(loadProfile().introSeen).toBe(true);
    expect(loadProfile().v).toBe(2);
  });

  it('does not overwrite an earlier backup, and a new player has nothing to be told', () => {
    META.enabled = true;
    localStorage.setItem('wrh.profile.v1', 'earlier');
    localStorage.setItem('wrh.profile', JSON.stringify(OLD));
    loadProfile();
    expect(localStorage.getItem('wrh.profile.v1')).toBe('earlier');
    localStorage.clear();
    expect(loadProfile().introSeen).toBe(true);
    expect(localStorage.getItem('wrh.profile.v1')).toBeNull();
  });
});
