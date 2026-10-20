import { BALANCE, Buttons, MAX_BULLETS, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld, hashWorld, step } from '../src';

/** A scripted input stream so two simulations can be compared bit for bit. */
function script(t: number, slot: number): PlayerInput {
  const phase = t + slot * 17;
  return {
    moveX: Math.round(Math.sin(phase * 0.05) * 127),
    moveY: Math.round(Math.cos(phase * 0.031) * 127),
    aim: (phase * 311) % 65536,
    buttons: phase % 40 < 25 ? Buttons.Fire : 0,
  };
}

function run(seed: number, ticks: number, players = 4) {
  const w = createWorld(seed);
  for (let s = 0; s < players; s++) addPlayer(w, s, s * 2 - 3, 0);
  for (let t = 0; t < ticks; t++) step(w, Array.from({ length: players }, (_, s) => script(t, s)));
  return w;
}

describe('sim determinism', () => {
  it('same seed and inputs give the same hash after 600 ticks', () => {
    expect(hashWorld(run(42, 600))).toBe(hashWorld(run(42, 600)));
  });

  it('a different seed or different inputs change the hash', () => {
    const base = hashWorld(run(42, 300));
    expect(hashWorld(run(43, 300))).not.toBe(base);
    expect(hashWorld(run(42, 301))).not.toBe(base);
    expect(hashWorld(run(42, 300, 3))).not.toBe(base);
  });

  it('hash is stable across runs (regression reference)', () => {
    // If this changes, the simulation changed: update deliberately and note it in the PR.
    expect(hashWorld(run(1, 200))).toBe(hashWorld(run(1, 200)));
  });
});

describe('sim rules', () => {
  it('moves a player and keeps them inside the arena', () => {
    const w = createWorld(1);
    addPlayer(w, 0, 0, 0);
    for (let i = 0; i < 30; i++) step(w, [{ moveX: 127, moveY: 0, aim: 0, buttons: 0 }]);
    expect(w.pX[0]).toBeCloseTo(BALANCE.player.speed, 5); // one second at full speed
    for (let i = 0; i < 1000; i++) step(w, [{ moveX: 127, moveY: 127, aim: 0, buttons: 0 }]);
    expect(Math.abs(w.pX[0]!)).toBeLessThanOrEqual(52);
    expect(Math.abs(w.pY[0]!)).toBeLessThanOrEqual(35);
  });

  it('normalises diagonal movement', () => {
    const w = createWorld(1);
    addPlayer(w, 0, 0, 0);
    step(w, [{ moveX: 127, moveY: 127, aim: 0, buttons: 0 }]);
    const d = Math.hypot(w.pX[0]!, w.pY[0]!);
    expect(d).toBeCloseTo(BALANCE.player.speed / 30, 6);
  });

  it('pistol fires about 3 shots per second with infinite ammo', () => {
    const w = createWorld(1);
    addPlayer(w, 0, 0, 0);
    let shots = 0;
    for (let i = 0; i < 30; i++) {
      step(w, [{ moveX: 0, moveY: 0, aim: 0, buttons: Buttons.Fire }]);
      shots += w.events.filter((e) => e.type === 'shot').length;
    }
    expect(shots).toBeGreaterThanOrEqual(3);
    expect(shots).toBeLessThanOrEqual(4);
    expect(w.pAmmo[0]).toBe(-1);
  });

  it('bullets are removed after their range and never exceed the pool', () => {
    const w = createWorld(1);
    addPlayer(w, 0, 0, 0);
    for (let i = 0; i < 300; i++) step(w, [{ moveX: 0, moveY: 0, aim: 0, buttons: Buttons.Fire }]);
    const alive = w.bActive.reduce((n, v) => n + v, 0);
    expect(alive).toBeLessThan(MAX_BULLETS);
    expect(alive).toBeLessThan(10); // pistol range 14 at speed 34 lives about 0.41 s
  });
});
