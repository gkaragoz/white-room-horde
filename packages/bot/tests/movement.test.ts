import { PickupType, TeleEffect, TeleShape, type PlayerInput } from '@wrh/shared';
import { addTelegraph, createGame, spawnEnemy, step, type World } from '@wrh/sim';
import { describe, expect, it } from 'vitest';
import { decideMove } from '../src/movement';
import { perceive } from '../src/perception';
import { profileOf } from '../src/skill';
import type { Ctx, MoveDecision, Skill, TeamDecision } from '../src/types';

const GRUNT = 0;
const none: TeamDecision = { revive: false, bias: { x: 0, y: 0 } };

function game(map = 0, cls = 0): World {
  const w = createGame({ seed: 5, map, players: [{ slot: 0, weapon: 'smg', cls }] });
  // the first floor starts with the horde: leave it out, the tests place their own enemies
  w.misc[1] = 0;
  return w;
}

const ctxOf = (skill: Skill = 'superhuman'): Ctx => ({ skill: profileOf(skill), rand: () => 0.5, mem: {} });

function decide(w: World, ctx = ctxOf(), team = none): MoveDecision {
  return decideMove(perceive(w, 0, ctx.mem), ctx, team);
}

function put(w: World, x: number, y: number, hp = 0): void {
  w.pX[0] = x;
  w.pY[0] = y;
  if (hp > 0) w.pHp[0] = hp;
}

const enemy = (w: World, x: number, y: number): number => spawnEnemy(w, GRUNT, x, y, false);

describe('movement: running from a crowd', () => {
  it('turns away from a pack that closes in from one side', () => {
    const w = game();
    put(w, 0, 0);
    enemy(w, 3.6, 0);
    enemy(w, 4, 1.2);
    enemy(w, 4.4, -1.2);
    enemy(w, 3.8, 2.4);
    const m = decide(w);
    expect(m.x).toBeLessThan(-0.3);
  });

  it('does not run into a wall with the crowd behind it: it slides along or turns', () => {
    const w = game();
    // warehouse shelf at (30, 9), 18 x 2: its lower face is y = 8. Stand just below it, the crowd below us
    put(w, 30, 7.4);
    for (let i = 0; i < 5; i++) enemy(w, 26 + i * 2, 1);
    const ctx = ctxOf();
    let hits = 0;
    for (let t = 0; t < 60; t++) {
      const m = decide(w, ctx);
      const input: PlayerInput = { moveX: m.x * 127, moveY: m.y * 127, aim: 0, buttons: 0 };
      step(w, [input]);
      if (w.pHp[0]! < 100) hits++;
    }
    // the planner never stands pushing into the wall: after a second it has moved a good way
    expect(Math.hypot(w.pX[0]! - 30, w.pY[0]! - 7.4)).toBeGreaterThan(6);
    expect(hits).toBeLessThan(30);
  });

  it('stays put with nothing to do and nothing in sight', () => {
    const w = game();
    put(w, 0, 0);
    const m = decide(w);
    expect(Math.hypot(m.x, m.y)).toBe(0);
    expect(m.dash).toBe(false);
  });

  it('dashes out of a ring of enemies, but only when it dodges well', () => {
    const w = game();
    put(w, 0, 0);
    for (let i = 0; i < 10; i++) enemy(w, Math.cos((i / 10) * Math.PI * 2) * 1.5, Math.sin((i / 10) * Math.PI * 2) * 1.5);
    expect(decide(w, ctxOf('superhuman')).dash).toBe(true);
    expect(decide(w, ctxOf('easy')).dash).toBe(false);
  });
});

describe('movement: ground attacks', () => {
  it('leaves a circle that is about to land and takes no damage', () => {
    const w = game();
    put(w, 0, 0);
    addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, 0.5, 0, 0, 3, 0, 0.8, 30);
    const ctx = ctxOf();
    const hp = w.pHp[0]!;
    for (let t = 0; t < 40; t++) {
      const m = decide(w, ctx);
      step(w, [{ moveX: m.x * 127, moveY: m.y * 127, aim: 0, buttons: m.dash ? 0x40 : 0 }]);
    }
    expect(w.pHp[0]).toBe(hp);
  });

  it('leaves a beam by stepping to its side', () => {
    const w = game();
    put(w, 0, 0);
    // a long thin rectangle along x through the player
    addTelegraph(w, TeleShape.Rect, TeleEffect.Hurt, 0, 0, 0, 0.9, 12, 0.7, 30);
    const ctx = ctxOf();
    const hp = w.pHp[0]!;
    for (let t = 0; t < 40; t++) {
      const m = decide(w, ctx);
      step(w, [{ moveX: m.x * 127, moveY: m.y * 127, aim: 0, buttons: 0 }]);
    }
    expect(w.pHp[0]).toBe(hp);
  });
});

describe('movement: goals', () => {
  it('walks to a health pickup when hurt and nothing is around', () => {
    const w = game();
    put(w, 0, 0, 40);
    w.kActive[0] = 1;
    w.kType[0] = PickupType.Health;
    w.kX[0] = 12;
    w.kY[0] = 0;
    w.kLife[0] = 20;
    w.kLayer[0] = 0;
    const m = decide(w);
    expect(m.x).toBeGreaterThan(0.5);
  });

  it('is pulled by the team but not into the crowd', () => {
    const w = game();
    put(w, 0, 0);
    const team: TeamDecision = { revive: false, bias: { x: 1, y: 0 } };
    expect(decide(w, ctxOf(), team).x).toBeGreaterThan(0.5);
    for (let i = 0; i < 8; i++) enemy(w, 5 + (i % 3) * 0.7, (i - 4) * 0.8);
    expect(decide(w, ctxOf(), team).x).toBeLessThan(0.3);
  });
});

describe('movement: hunting', () => {
  it('walks toward the last enemies when none is in shooting range', () => {
    const w = game();
    put(w, -30, 0);
    enemy(w, 30, -10);
    const m = decide(w);
    expect(m.x).toBeGreaterThan(0.3);
  });

  it('is deterministic for the same world', () => {
    const a = game();
    const b = game();
    for (const w of [a, b]) {
      put(w, 3, 3);
      enemy(w, 8, 3);
      enemy(w, -4, 9);
    }
    expect(decide(a)).toEqual(decide(b));
  });
});

describe('movement: the decks', () => {
  it('walks down a ramp when it finds itself on a deck', () => {
    const w = game(6);
    put(w, 10, 17);
    w.pLayer[0] = 1;
    const ctx = ctxOf();
    let layer = 1;
    for (let t = 0; t < 600 && layer === 1; t++) {
      const m = decide(w, ctx);
      step(w, [{ moveX: m.x * 127, moveY: m.y * 127, aim: 0, buttons: 0 }]);
      layer = w.pLayer[0]!;
    }
    expect(layer).toBe(0);
  });

  it('keeps off the ramps on the ground', () => {
    const w = game(6);
    // the west ramp of the overpass: its foot is at x = -38.9; an enemy up on the deck pulls nobody up there
    put(w, -42, 17);
    enemy(w, -20, 17);
    const ctx = ctxOf();
    for (let t = 0; t < 150; t++) {
      const m = decide(w, ctx);
      step(w, [{ moveX: m.x * 127, moveY: m.y * 127, aim: 0, buttons: 0 }]);
      expect(w.pLayer[0]).toBe(0);
    }
  });
});

