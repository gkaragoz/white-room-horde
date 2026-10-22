import { SKILLS, Squad } from '@wrh/bot';
import { CLASS_IDS, MAX_PLAYERS, WEAPON_IDS, poolAt } from '@wrh/shared';
import { Recorder, createGame, decodeReplay, encodeReplay, hashWorld, step, verifyReplay } from '@wrh/sim';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_COMPANIONS, achievementClassMask, botClasses, companionLimit, companionsFromUrl, freeSlots, isSkill, loadCompanions, planCompanions, saveCompanions, scaledXp, xpFactor } from '../src/companions';
import { CLASS_GATE, META, unlocked, xpForRun } from '../src/meta';
import { BOT_SKILLS } from '@wrh/net';

beforeEach(() => localStorage.clear());

describe('experience with companions', () => {
  it('is divided by 1 + 0.25 per bot and rounded', () => {
    // team score 5000 is 500 XP on its own
    expect(xpForRun(5000, 60)).toBe(500);
    expect(xpForRun(5000, 60, 0)).toBe(500);
    expect(xpForRun(5000, 60, 1)).toBe(400);
    expect(xpForRun(5000, 60, 2)).toBe(333);
    expect(xpForRun(5000, 60, 3)).toBe(286);
    expect(xpForRun(5000, 60, 4)).toBe(250);
    expect(xpForRun(5000, 60, 7)).toBe(182);
    expect(xpForRun(12345, 90, 5)).toBe(Math.round(Math.round(1234.5) / 2.25));
  });

  it('keeps the short-run rule: nothing for a run under 15 seconds, bots or not', () => {
    expect(xpForRun(5000, 14.9, 3)).toBe(0);
    expect(xpForRun(5000, 15, 3)).toBe(286);
  });

  it('is the same arithmetic as the helpers the game over screen uses', () => {
    for (let n = 0; n <= 10; n++) {
      expect(scaledXp(500, n)).toBe(xpForRun(5000, 60, n));
      expect(xpFactor(n)).toBeCloseTo(1 / (1 + 0.25 * n), 12);
    }
    expect(xpFactor(-3)).toBe(1);
    expect(xpFactor(Number.NaN)).toBe(1);
  });
});

describe('how many companions', () => {
  it('up to seven in a solo game, and never more than the room has room for', () => {
    expect(companionLimit(1)).toBe(MAX_COMPANIONS);
    expect(companionLimit(4)).toBe(MAX_COMPANIONS);
    expect(companionLimit(5)).toBe(MAX_PLAYERS - 5);
    expect(companionLimit(MAX_PLAYERS)).toBe(0);
    expect(companionLimit(0)).toBe(MAX_COMPANIONS);
  });

  it('the choice survives a reload and a damaged save falls back to the defaults', () => {
    expect(loadCompanions()).toEqual({ count: 0, skill: 'expert' });
    saveCompanions({ count: 3, skill: 'superhuman' });
    expect(loadCompanions()).toEqual({ count: 3, skill: 'superhuman' });
    localStorage.setItem('wrh.companions', '{"count":99,"skill":"god"}');
    expect(loadCompanions()).toEqual({ count: MAX_COMPANIONS, skill: 'expert' });
    localStorage.setItem('wrh.companions', 'not json');
    expect(loadCompanions()).toEqual({ count: 0, skill: 'expert' });
  });

  it('?bots= and ?botskill= override the menu choice', () => {
    const base = { count: 2, skill: 'normal' as const };
    expect(companionsFromUrl('', base)).toEqual({ forced: false, choice: base });
    expect(companionsFromUrl('?bots=3', base)).toEqual({ forced: true, choice: { count: 3, skill: 'normal' } });
    expect(companionsFromUrl('?bots=3&botskill=superhuman', base).choice).toEqual({ count: 3, skill: 'superhuman' });
    expect(companionsFromUrl('?bots=99', base).choice.count).toBe(MAX_PLAYERS - 1);
    expect(companionsFromUrl('?bots=-4', base).choice.count).toBe(0);
    expect(companionsFromUrl('?bots=x&botskill=nope', base)).toEqual({ forced: false, choice: base });
  });

  it('knows the skills of the bot ladder (the relay lists the same four)', () => {
    expect([...SKILLS]).toEqual([...BOT_SKILLS]);
    expect(SKILLS.every(isSkill)).toBe(true);
    expect(isSkill('godlike')).toBe(false);
  });
});

describe('what the bots start with', () => {
  it('only classes the room level opens and only guns the pool has open', () => {
    const soldier = CLASS_IDS.indexOf('soldier');
    const plan = planCompanions({ count: 5, freeSlots: freeSlots([0]), seed: 1, roomLevel: 1 });
    expect(botClasses(1).includes(soldier)).toBe(true);
    for (const b of plan) {
      expect(botClasses(1)).toContain(b.cls);
      const open = b.weapon === 'pistol' || b.weapon === 'smg' || ((poolAt(1).weapons >> WEAPON_IDS.indexOf(b.weapon)) & 1) === 1;
      expect(open).toBe(true);
    }
  });

  it('the full game opens every track class; achievement classes come only through the host profile', () => {
    const gated = Object.keys(CLASS_GATE).map((c) => CLASS_IDS.indexOf(c as (typeof CLASS_IDS)[number]));
    const top = botClasses(100);
    for (const g of gated) expect(top.includes(g)).toBe(false);
    const withAch = botClasses(100, achievementClassMask(~0));
    for (const g of gated) expect(withAch.includes(g)).toBe(true);
    expect(achievementClassMask(0)).toBe(0);
  });

  it('take the free slots, differ in class and name, and avoid what the people play', () => {
    const humanCls = CLASS_IDS.indexOf('heavy');
    const plan = planCompanions({ count: 4, freeSlots: freeSlots([0, 1]), seed: 7, roomLevel: 100, taken: [humanCls] });
    expect(plan.map((b) => b.slot)).toEqual([2, 3, 4, 5]);
    expect(new Set(plan.map((b) => b.cls)).size).toBe(4);
    expect(new Set(plan.map((b) => b.name)).size).toBe(4);
    expect(plan.some((b) => b.cls === humanCls)).toBe(false);
    for (const b of plan) expect(WEAPON_IDS).toContain(b.weapon);
  });

  it('a profile at level 1 gets a soldier-only squad (what the room allows, as unlocked() says)', () => {
    META.enabled = true;
    try {
      const u = unlocked({ xp: 0, ach: { got: {}, life: {}, best: {}, seen: {} } as never });
      const plan = planCompanions({ count: 3, freeSlots: freeSlots([0]), seed: 2, roomLevel: u.level });
      for (const b of plan) expect((u.classes >> b.cls) & 1).toBe(1);
    } finally {
      META.enabled = false;
    }
  });
});

describe('a game with companions replays exactly', () => {
  function playWithBots(seed: number, ticks: number) {
    const setup = {
      seed,
      map: 0,
      mods: 0,
      players: [
        { slot: 0, weapon: 'pistol' as const, cls: 0 },
        { slot: 1, weapon: 'smg' as const, cls: 1 },
        { slot: 2, weapon: 'ar' as const, cls: 2 },
        { slot: 3, weapon: 'shotgun' as const, cls: 3 },
      ],
    };
    const w = createGame(setup);
    const rec = new Recorder(setup);
    const squad = new Squad([1, 2, 3], 'expert', seed, new Set([0]));
    for (let t = 0; t < ticks; t++) {
      const bots = squad.inputs(w);
      // the human is a fixed walker so the run is easy to reason about
      const inputs = [{ moveX: 60, moveY: 20, aim: (t * 40) & 0xffff, buttons: t % 7 === 0 ? 1 : 0 }, bots.get(1), bots.get(2), bots.get(3)];
      step(w, inputs);
      rec.record(w, inputs);
    }
    return { w, rec };
  }

  it('records bot inputs per slot, survives the file format and verifies to the same world', () => {
    const { w, rec } = playWithBots(77, 900);
    expect(rec.replay.ticks.every((t) => t[1] && t[2] && t[3])).toBe(true);
    const back = decodeReplay(encodeReplay(rec.replay));
    const v = verifyReplay(back);
    expect(v.ok).toBe(true);
    expect(v.hash >>> 0).toBe(hashWorld(w) >>> 0);
    expect(v.ticks).toBe(900);
  });

  it('is deterministic for the same seed: two runs record the same inputs and end in the same world', () => {
    const a = playWithBots(5, 600);
    const b = playWithBots(5, 600);
    expect(hashWorld(a.w) >>> 0).toBe(hashWorld(b.w) >>> 0);
    expect(JSON.stringify(a.rec.replay.ticks)).toBe(JSON.stringify(b.rec.replay.ticks));
  });
});

describe('cost of the bots per tick', () => {
  it('ten bots are cheap enough to share a frame with the game (measurement, printed)', () => {
    const slots = Array.from({ length: 10 }, (_, i) => i + 1);
    const w = createGame({ seed: 3, players: [{ slot: 0, weapon: 'pistol' }, ...slots.map((s) => ({ slot: s, weapon: 'smg' as const, cls: s % 5 }))] });
    const squad = new Squad(slots, 'superhuman', 3, new Set([0]));
    // warm up and let a few waves of enemies come
    for (let t = 0; t < 300; t++) {
      const m = squad.inputs(w);
      step(w, [undefined, ...slots.map((s) => m.get(s))]);
    }
    let botMs = 0;
    let simMs = 0;
    const N = 600;
    for (let t = 0; t < N; t++) {
      const b0 = performance.now();
      const m = squad.inputs(w);
      botMs += performance.now() - b0;
      const s0 = performance.now();
      step(w, [undefined, ...slots.map((s) => m.get(s))]);
      simMs += performance.now() - s0;
    }
    console.log(`10 bots (superhuman): ${(botMs / N).toFixed(3)} ms per tick for the brains, ${(simMs / N).toFixed(3)} ms per tick for the simulation, ${w.enemyCount} enemies`);
    // a 60 fps frame is 16.7 ms and holds about two ticks: the brains must stay a small part of it
    expect(botMs / N).toBeLessThan(15);
  });
});
