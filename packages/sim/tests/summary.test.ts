import { ACHIEVEMENTS, Difficulty, PERK, STAT, WEAPON_IDS, WEAPON_SLOTS } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { createGame, quietWorld, runSummary, scriptedInput, step, type World } from '../src';

const world = (mods = 0): World => quietWorld({ seed: 9, mods });

describe('runSummary and the achievement table', () => {
  it('produces every number and every condition the table asks for (a renamed id would fail here)', () => {
    const { totals, flags } = runSummary(world(), 0);
    for (const def of ACHIEVEMENTS) {
      if (def.kind === 'flag') expect(flags, def.id).toHaveProperty(def.stat);
      else if (!def.stat.startsWith('codex')) expect(totals, def.id).toHaveProperty(def.stat); // (the Codex counts come from the profile, added by the client)
    }
  });

  it('reads a played run', () => {
    const w = createGame({
      seed: 4,
      players: [
        { slot: 0, weapon: 'smg' },
        { slot: 1, weapon: 'ar' },
      ],
    });
    for (let t = 0; t < 900; t++) step(w, [scriptedInput(t, 0), scriptedInput(t, 1)]);
    const { totals, flags } = runSummary(w, 0);
    expect(totals.games).toBe(1);
    expect(totals.floor).toBe(w.wave);
    expect(totals.kills).toBe(w.pPerk[PERK.Kills]);
    expect(totals.shots).toBe(w.pStat[STAT.Shots]);
    expect(totals.seconds).toBeCloseTo(w.pStat[STAT.AliveTicks]! / 30, 9);
    expect(flags.quickDeath).toBe(totals.seconds! < 15);
    expect(flags.hourRun).toBe(false);
  });

  it('counts the cards held and the Difficulty chosen', () => {
    const w = world(Difficulty.bit('tough') | Difficulty.bit('brutal'));
    w.pCards[0] = 3;
    w.pCards[5] = 2;
    w.wave = 4;
    expect(runSummary(w, 0).totals.cards).toBe(5);
    expect(runSummary(w, 0).totals.modsFloor5).toBe(0);
    w.wave = 5;
    expect(runSummary(w, 0).totals.modsFloor5).toBe(2);
  });

  it('gives the floor to the class that was played only', () => {
    const w = world();
    w.wave = 12;
    w.pPerk[PERK.Class] = 3;
    const t = runSummary(w, 0).totals;
    expect(t['floor:3']).toBe(12);
    expect(t['floor:2']).toBe(0);
  });

  it('credits kills to the weapon in the hands', () => {
    const w = world();
    const i = WEAPON_IDS.indexOf('smg');
    w.pWpnKills[i] = 41;
    expect(runSummary(w, 0).totals['wk:smg']).toBe(41);
    expect(WEAPON_SLOTS).toBeGreaterThanOrEqual(WEAPON_IDS.length);
  });

  it('checks the special conditions', () => {
    const w = world(Difficulty.ALL);
    w.wave = 5;
    expect(runSummary(w, 0).flags.allMods).toBe(true);
    expect(runSummary(w, 0).flags.untouchable).toBe(true);
    w.pStat[STAT.DamageTaken] = 51;
    expect(runSummary(w, 0).flags.untouchable).toBe(false);
    w.wave = 4;
    expect(runSummary(w, 0).flags.allMods).toBe(false);
    const f = world(Difficulty.bit('fragile'));
    f.wave = 8;
    expect(runSummary(f, 0).flags.fragileFloor8).toBe(true);
    f.wave = 7;
    expect(runSummary(f, 0).flags.fragileFloor8).toBe(false);
    const p = world();
    p.wave = 10;
    expect(runSummary(p, 0).flags.pistolOnly).toBe(true);
    p.pOwned[0] = 0b11;
    expect(runSummary(p, 0).flags.pistolOnly).toBe(false);
  });
});
