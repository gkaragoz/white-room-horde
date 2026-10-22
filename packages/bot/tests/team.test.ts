import { FloorPhase, MISC, PlayerState } from '@wrh/shared';
import { addTelegraph, createGame, step, type World } from '@wrh/sim';
import { describe, expect, it } from 'vitest';
import { Squad } from '../src';
import { perceive } from '../src/perception';
import { planRevives } from '../src/revive';
import { squadOf } from '../src/roles';
import { makeRand, profileOf } from '../src/skill';
import { BIAS_MAX, decideTeam } from '../src/team';
import type { Ctx, Skill } from '../src/types';

const ctxOf = (skill: Skill = 'superhuman', seed = 1): Ctx => ({ skill: profileOf(skill), rand: makeRand(seed), mem: {} });
const quiet = (n: number, seed = 7): World => {
  const w = createGame({ seed, players: Array.from({ length: n }, (_, i) => ({ slot: i, weapon: 'smg', cls: i })) });
  w.eActive.fill(0);
  w.enemyCount = 0;
  w.misc[MISC.Phase] = FloorPhase.Fight;
  return w;
};
const place = (w: World, slot: number, x: number, y: number): void => {
  w.pX[slot] = x;
  w.pY[slot] = y;
};
const down = (w: World, slot: number, timeLeft = 20): void => {
  w.pState[slot] = PlayerState.Downed;
  w.pHp[slot] = 0;
  w.pTimer[slot] = timeLeft;
};
const decide = (w: World, slot: number, humans: ReadonlySet<number> = new Set(), ctx = ctxOf()) => decideTeam(perceive(w, slot, ctx.mem, humans), ctx);

describe('team: edge cases', () => {
  it('does nothing without allies', () => {
    const w = quiet(1);
    const d = decide(w, 0);
    expect(d.revive).toBe(false);
    expect(d.bias).toEqual({ x: 0, y: 0 });
  });

  it('ignores dead allies', () => {
    const w = quiet(3);
    w.pState[1] = PlayerState.Dead;
    w.pState[2] = PlayerState.Dead;
    const d = decide(w, 0);
    expect(d.revive).toBe(false);
    expect(Number.isFinite(d.bias.x + d.bias.y)).toBe(true);
  });

  it('does not crash or revive when this bot is itself downed', () => {
    const w = quiet(3);
    down(w, 0);
    const d = decide(w, 0);
    expect(d.revive).toBe(false);
    expect(Math.hypot(d.bias.x, d.bias.y)).toBeLessThanOrEqual(BIAS_MAX + 1e-9);
  });

  it('keeps the bias bounded and finite over a whole game of bots', () => {
    const w = createGame({ seed: 11, players: [0, 1, 2, 3].map((i) => ({ slot: i, weapon: 'smg' as const, cls: i })) });
    const squad = new Squad([0, 1, 2, 3], 'expert', 11);
    const ctxs = [0, 1, 2, 3].map((i) => ctxOf('expert', i + 1));
    let worst = 0;
    for (let t = 0; t < 30 * 90; t++) {
      for (let s = 0; s < 4; s++) {
        const d = decideTeam(perceive(w, s, ctxs[s]!.mem, new Set([0])), ctxs[s]!);
        const l = Math.hypot(d.bias.x, d.bias.y);
        expect(Number.isFinite(l)).toBe(true);
        worst = Math.max(worst, l);
      }
      const inputs = squad.inputs(w);
      step(w, [inputs.get(0), inputs.get(1), inputs.get(2), inputs.get(3)]);
    }
    expect(worst).toBeLessThanOrEqual(BIAS_MAX + 1e-9);
  }, 60_000);

  it('is the same for the same world, memory and seed', () => {
    const run = (): string => {
      const w = quiet(4);
      down(w, 2);
      place(w, 0, 10, 4);
      const ctx = ctxOf('normal', 5);
      return JSON.stringify([0, 1, 3].map((s) => decide(w, s, new Set(), ctx)));
    };
    expect(run()).toEqual(run());
  });
});

describe('team: revive plan', () => {
  it('gives every downed friend at most one reviver and every bot at most one friend', () => {
    const w = quiet(6);
    place(w, 0, 0, 0);
    place(w, 1, 6, 0);
    place(w, 2, -6, 0);
    place(w, 3, 3, 3);
    place(w, 4, 12, 3);
    place(w, 5, -12, -3);
    down(w, 4, 14);
    down(w, 5, 9);
    const plan = planRevives(w, squadOf(perceive(w, 0, {})));
    const friends = [...plan.assigned.values()].map((d) => d.slot);
    expect(new Set(friends).size).toBe(friends.length);
    expect(plan.downed.every((d) => d.assignee >= 0)).toBe(true);
    expect(plan.assigned.size).toBe(2);
    // the bot that is nearest to each friend goes
    expect(plan.downed.find((d) => d.slot === 4)!.assignee).not.toBe(plan.downed.find((d) => d.slot === 5)!.assignee);
  });

  it('is the same plan from every bot, so exactly the assigned bot kneels', () => {
    const w = quiet(5);
    place(w, 0, 0, 0);
    place(w, 1, 1, 0);
    place(w, 2, 20, 0);
    place(w, 3, 2, 1);
    place(w, 4, 1.0, 0);
    down(w, 4);
    const kneeling: number[] = [];
    for (let s = 0; s < 4; s++) if (decide(w, s).revive) kneeling.push(s);
    // somebody is within reach (the friend lies within a unit of slots 0, 1 and 3); only one holds the button
    expect(kneeling).toHaveLength(1);
  });

  it('sends the quickest bot, and not all of them, to a far friend', () => {
    const w = quiet(4);
    place(w, 0, -30, 0);
    place(w, 1, 10, 0);
    place(w, 2, 14, 2);
    place(w, 3, 20, 0);
    down(w, 3);
    const plan = planRevives(w, squadOf(perceive(w, 0, {})));
    expect(plan.assigned.size).toBe(1);
    expect(plan.downed[0]!.assignee).toBe(1);
  });

  it('leaves a friend a human is already kneeling beside', () => {
    const w = quiet(3);
    place(w, 0, 0, 0);
    place(w, 1, 10, 0);
    place(w, 2, 10.5, 0.5);
    down(w, 2);
    const plan = planRevives(w, squadOf(perceive(w, 0, {}, new Set([1]))));
    expect(plan.assigned.size).toBe(0);
  });

  it('covers instead of reviving when the ground around the friend is too hot', () => {
    const w = quiet(3);
    place(w, 0, 0, 0);
    place(w, 1, 5, 0);
    place(w, 2, 8, 0);
    down(w, 2);
    for (let i = 0; i < 40; i++) {
      w.eActive[i] = 1;
      w.eX[i] = 8 + (i % 7) * 0.5;
      w.eY[i] = ((i * 37) % 11) * 0.4 - 2;
      w.eHp[i] = w.eMaxHp[i] = 10;
    }
    const plan = planRevives(w, squadOf(perceive(w, 0, {})));
    expect(plan.assigned.size).toBe(0);
    expect(plan.downed[0]!.pressure).toBeGreaterThan(10);
  });

  it('never kneels into a ground attack that is about to land (a boss slam)', () => {
    const w = quiet(2);
    place(w, 0, 0.5, 0);
    place(w, 1, 0, 0);
    down(w, 1);
    expect(decide(w, 0).revive).toBe(true);
    addTelegraph(w, 0, 0, 0, 0, 0, 5, 0, 0.7, 30);
    const d = decide(w, 0);
    expect(d.revive).toBe(false);
    // and it steps out of the red area
    expect(Math.hypot(d.bias.x, d.bias.y)).toBeGreaterThan(0.5);
  });

  it('does not revive while the floor is cleared (everybody gets up on the next floor)', () => {
    const w = quiet(2);
    place(w, 0, 0.5, 0);
    place(w, 1, 0, 0);
    down(w, 1);
    w.misc[MISC.Phase] = FloorPhase.Cleared;
    expect(decide(w, 0).revive).toBe(false);
  });
});

describe('team: positioning', () => {
  it('pulls a far bot toward the human and leaves a bot at a good distance alone', () => {
    const w = quiet(2);
    place(w, 0, 0, 0);
    place(w, 1, 35, 0);
    const far = decide(w, 1, new Set([0]));
    expect(far.bias.x).toBeLessThan(-0.3);
    place(w, 1, 8, 0);
    const mid = decide(w, 1, new Set([0]));
    expect(Math.hypot(mid.bias.x, mid.bias.y)).toBeLessThan(far.bias.x * -1);
  });

  it('pushes a bot that stands on top of the human away', () => {
    const w = quiet(2);
    place(w, 0, 0, 0);
    place(w, 1, 1, 0);
    const d = decide(w, 1, new Set([0]));
    expect(d.bias.x).toBeGreaterThan(0.2);
  });

  it('leaves a health pickup to a hurt human who is closer', () => {
    const w = quiet(2);
    place(w, 0, 0, 0);
    place(w, 1, 12, 0);
    w.pHp[0] = 20;
    w.pHp[1] = 80;
    w.kActive[0] = 1;
    w.kType[0] = 1;
    w.kX[0] = 4;
    w.kY[0] = 0;
    w.kLife[0] = 10;
    const ctx = ctxOf();
    const withPickup = decideTeam(perceive(w, 1, ctx.mem, new Set([0])), ctx);
    w.kActive[0] = 0;
    const without = decideTeam(perceive(w, 1, ctxOf().mem, new Set([0])), ctxOf());
    // the pickup is 8 units away from the bot, toward the human: the bias pushes the bot away from it
    expect(withPickup.bias.x).toBeGreaterThan(without.bias.x);
  });
});
