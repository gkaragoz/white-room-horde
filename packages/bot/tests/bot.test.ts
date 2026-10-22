import { CLASS_IDS, MAX_PLAYERS } from '@wrh/shared';
import { createGame, step } from '@wrh/sim';
import { describe, expect, it } from 'vitest';
import { Bot, SKILLS, Squad, botLoadouts, playGame } from '../src';

function inputsFor(seed: number, skill: 'easy' | 'superhuman', ticks: number) {
  const w = createGame({ seed, players: [{ slot: 0, weapon: 'pistol' }, { slot: 1, weapon: 'smg' }] });
  const squad = new Squad([0, 1], skill, seed);
  const log: string[] = [];
  for (let t = 0; t < ticks; t++) {
    const map = squad.inputs(w);
    const list = [map.get(0), map.get(1)];
    log.push(JSON.stringify(list));
    step(w, list);
  }
  return log;
}

describe('bot inputs', () => {
  it('are valid wire inputs on every tick, at every skill', () => {
    for (const skill of SKILLS) {
      const w = createGame({ seed: 3, players: [{ slot: 0, weapon: 'pistol' }] });
      const bot = new Bot({ slot: 0, skill, seed: 3 });
      for (let t = 0; t < 400; t++) {
        const i = bot.input(w);
        expect(Math.abs(i.moveX)).toBeLessThanOrEqual(127);
        expect(Math.abs(i.moveY)).toBeLessThanOrEqual(127);
        expect(i.aim).toBeGreaterThanOrEqual(0);
        expect(i.aim).toBeLessThan(65536);
        expect(i.buttons & ~0x1ff).toBe(0);
        step(w, [i]);
      }
    }
  });

  it('repeat exactly for the same seed and world', () => {
    expect(inputsFor(9, 'easy', 300)).toEqual(inputsFor(9, 'easy', 300));
    expect(inputsFor(9, 'superhuman', 300)).toEqual(inputsFor(9, 'superhuman', 300));
  });

  it('differ with the seed once aim error is in play', () => {
    expect(inputsFor(1, 'easy', 200)).not.toEqual(inputsFor(2, 'easy', 200));
  });
});

describe('bot loadouts', () => {
  it('fill the free slots with different classes and a name each', () => {
    const l = botLoadouts([2, 3, 4, 5, 6], 5, 1);
    expect(l.map((x) => x.slot)).toEqual([2, 3, 4, 5, 6]);
    expect(new Set(l.map((x) => x.cls)).size).toBe(5);
    expect(new Set(l.map((x) => x.name)).size).toBe(5);
  });

  it('respect the classes that are allowed and avoid what humans play', () => {
    const allowed = [CLASS_IDS.indexOf('soldier'), CLASS_IDS.indexOf('medic'), CLASS_IDS.indexOf('heavy')];
    const l = botLoadouts([1, 2], 2, 1, allowed, [CLASS_IDS.indexOf('heavy')]);
    expect(l.every((x) => allowed.includes(x.cls))).toBe(true);
    expect(l.some((x) => x.cls === CLASS_IDS.indexOf('heavy'))).toBe(false);
  });

  it('never exceed the free slots or the player limit', () => {
    expect(botLoadouts([1, 2], 9, 1)).toHaveLength(2);
    expect(botLoadouts(Array.from({ length: 30 }, (_, i) => i), 30, 1).length).toBeLessThanOrEqual(MAX_PLAYERS);
  });
});

describe('a game of bots', () => {
  it('runs to the end and reports a floor', () => {
    const r = playGame({ seed: 5, bots: 2, skill: 'normal', maxTicks: 30 * 90 });
    expect(r.floor).toBeGreaterThanOrEqual(1);
    expect(r.ticks).toBeGreaterThan(30);
  });
});
