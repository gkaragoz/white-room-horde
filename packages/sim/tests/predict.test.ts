import { Buttons, CLASS_IDS, PERK, PERKS, WEAPON_IDS, type PlayerInput, type WeaponId } from '@wrh/shared';
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


/** Fire held for stretches (a hammer charges and is let go), the ability now and then, revive now and then, plus steering and dashes. */
function fightInputs(n: number, seed: number): PlayerInput[] {
  let r = seed >>> 0;
  const next = (): number => {
    r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
    return r / 0x100000000;
  };
  const list: PlayerInput[] = [];
  let mx = 0;
  let my = 0;
  let fire = 0;
  for (let i = 0; i < n; i++) {
    if (i % 7 === 0) {
      mx = Math.round((next() * 2 - 1) * 127);
      my = Math.round((next() * 2 - 1) * 127);
    }
    if (fire <= 0) fire = next() < 0.5 ? 0 : 1 + Math.floor(next() * 70);
    else fire--;
    const buttons = (fire > 0 ? Buttons.Fire : 0) | (next() < 0.05 ? Buttons.Dash : 0) | (next() < 0.02 ? Buttons.Special : 0) | (next() < 0.03 ? Buttons.Revive : 0);
    list.push({ moveX: mx, moveY: my, aim: Math.round(next() * 255), buttons });
  }
  return list;
}

describe('client prediction with weapons, charges and buffs', () => {
  const setup = (cls: number, weapon: WeaponId, map: number) => {
    const w = createWorld(21 + cls, map, 1);
    w.waveTick = 1e9;
    w.countMul = 0;
    addPlayer(w, 0, 0, 0, weapon, cls);
    w.pHp[0] = w.pMaxHp[0] = 1e6;
    return w;
  };

  for (const cls of CLASS_IDS.keys()) {
    for (const map of [0, 6]) {
      it(`class ${CLASS_IDS[cls]} fights, charges and uses its ability: the prediction equals the simulation every tick (map ${map})`, () => {
        const weapon: WeaponId = cls === 7 ? 'sword' : cls === 8 ? 'hammer' : 'pistol';
        const real = setup(cls, weapon, map);
        const ghost = setup(cls, weapon, map);
        // a buff that runs out inside the replay window
        for (const w of [real, ghost]) w.pPerk[PERK.Haste] = 0.4;
        void PERKS;
        const list = fightInputs(420, 5 + cls);
        let charged = 0;
        for (let t = 0; t < list.length; t++) {
          step(real, [list[t]!]);
          if (real.pCharge[0]! > 0) charged++;
          if (t >= 6) step(ghost, [list[t - 6]!]);
          if (t < 6) continue;
          const p = predictPlayer(ghost, 0, list.slice(t - 5, t + 1));
          expect(p.x, `tick ${t}`).toBe(real.pX[0]);
          expect(p.y, `tick ${t}`).toBe(real.pY[0]);
        }
        if (cls === 8) expect(charged).toBeGreaterThan(30); // the hammer really was charging (and slowed) for a good part of the run
      });
    }
  }

  it('the hammer keeps its slow pace while the charge is held, in the prediction as in the simulation', () => {
    const w = setup(8, 'hammer', 0);
    const hold: PlayerInput[] = Array.from({ length: 12 }, () => ({ moveX: 127, moveY: 0, aim: 0, buttons: Buttons.Fire }));
    const p = predictPlayer(w, 0, hold);
    for (const i of hold) step(w, [i]);
    expect(p.x).toBe(w.pX[0]);
    // 0.45 of the free pace after the first tick
    expect(p.x).toBeLessThan(11 * 0.55 * 12 * (1 / 30) * 1.2);
    expect(WEAPON_IDS.includes('hammer')).toBe(true);
  });
});
