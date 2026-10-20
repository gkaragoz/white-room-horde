import { Buttons, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld, predictPlayer, step } from '../src';

function quiet(seed: number, map = 0) {
  const w = createWorld(seed, map, 1);
  w.waveTick = 1e9;
  w.countMul = 0;
  addPlayer(w, 0, 0, 0);
  return w;
}

/** A deterministic wiggle: steering in all directions, dashes now and then. */
function inputsFor(n: number, seed: number): PlayerInput[] {
  let r = seed >>> 0;
  const next = (): number => {
    r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
    return r / 0x100000000;
  };
  const list: PlayerInput[] = [];
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    if (i % 9 === 0) {
      mx = Math.round((next() * 2 - 1) * 127);
      my = Math.round((next() * 2 - 1) * 127);
    }
    list.push({ moveX: mx, moveY: my, aim: Math.round(next() * 255), buttons: next() < 0.07 ? Buttons.Dash : 0 });
  }
  return list;
}

describe('client prediction of the local character', () => {
  for (const map of [0, 1, 2, 3]) {
    it(`replays steering and dashes exactly like the simulation (map ${map})`, () => {
      const real = quiet(11, map);
      const ghost = quiet(11, map);
      const list = inputsFor(240, 7 + map);
      // the ghost is the "confirmed" world 6 ticks behind; the prediction brings it to where the real world is
      for (let t = 0; t < list.length; t++) {
        step(real, [list[t]!]);
        if (t >= 6) step(ghost, [list[t - 6]!]);
        if (t < 6) continue;
        const p = predictPlayer(ghost, 0, list.slice(t - 5, t + 1));
        expect(p.x).toBe(real.pX[0]);
        expect(p.y).toBe(real.pY[0]);
        expect(p.angle).toBe(real.pAngle[0]);
      }
    });
  }

  it('does not touch the world it predicts from', () => {
    const w = quiet(3);
    const before = [w.pX[0], w.pY[0], w.pDash[0], w.pDashCd[0]];
    predictPlayer(w, 0, inputsFor(10, 1));
    expect([w.pX[0], w.pY[0], w.pDash[0], w.pDashCd[0]]).toEqual(before);
  });
});
