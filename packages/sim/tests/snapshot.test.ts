import { describe, expect, it } from 'vitest';
import { createGame, createWorld, hashWorld, restoreWorld, scriptedInput, serializeWorld, step } from '../src';

describe('snapshot', () => {
  it('restores into a fresh world and keeps simulating identically', () => {
    const setup = { seed: 21, players: [{ slot: 0, weapon: 'smg' as const }, { slot: 1, weapon: 'ar' as const }] };
    const a = createGame(setup);
    for (let t = 0; t < 500; t++) step(a, [scriptedInput(t, 0), scriptedInput(t, 1)]);
    const snap = serializeWorld(a);
    const b = createWorld(1);
    restoreWorld(b, snap);
    expect(hashWorld(b)).toBe(hashWorld(a));
    for (let t = 500; t < 800; t++) {
      step(a, [scriptedInput(t, 0), scriptedInput(t, 1)]);
      step(b, [scriptedInput(t, 0), scriptedInput(t, 1)]);
    }
    expect(hashWorld(b)).toBe(hashWorld(a));
    expect(snap.length).toBeLessThan(700_000);
  });
});
