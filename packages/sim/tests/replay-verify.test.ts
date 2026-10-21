import { describe, expect, it } from 'vitest';
import { createGame, decodeReplay, encodeReplay, Recorder, scriptedInput, step, verifyReplay } from '../src';

function record(seed: number, ticks: number, map: number, mods: number): Recorder {
  const setup = { seed, map, mods, players: [{ slot: 0, weapon: 'smg' as const, cls: 3 }, { slot: 1, weapon: 'dbl' as const, cls: 1 }] };
  const w = createGame(setup);
  const rec = new Recorder(setup);
  for (let t = 0; t < ticks; t++) {
    const inputs = [scriptedInput(w.tick, 0), scriptedInput(w.tick, 1)];
    step(w, inputs);
    rec.record(w, inputs);
  }
  return rec;
}

describe('replay verification', () => {
  it('a recorded game on another map, mods and with classes survives the file format and verifies', () => {
    const rec = record(11, 600, 4, 2);
    const back = decodeReplay(encodeReplay(rec.replay));
    expect(back.setup.map).toBe(4);
    expect(back.setup.mods).toBe(2);
    expect(back.setup.players[0]!.cls).toBe(3);
    expect(back.setup.players[1]!.weapon).toBe('dbl');
    const v = verifyReplay(back);
    expect(v.ok).toBe(true);
    expect(v.ticks).toBe(600);
  });

  it('a tampered replay is rejected: a changed input stream breaks the checkpoint hashes', () => {
    const rec = record(12, 600, 0, 1);
    const back = decodeReplay(encodeReplay(rec.replay));
    const t = back.ticks[200]!;
    t[0] = { ...t[0]!, buttons: t[0]!.buttons ^ 1, moveX: -t[0]!.moveX };
    for (let i = 201; i < 260; i++) back.ticks[i]![0] = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };
    const v = verifyReplay(back);
    expect(v.ok).toBe(false);
    expect(v.mismatch).toBeGreaterThan(0);
  });

  it('a claimed final hash must match, and a replay without checkpoints is not accepted', () => {
    const rec = record(13, 300, 0, 1);
    const good = verifyReplay(rec.replay);
    expect(verifyReplay(rec.replay, good.hash).ok).toBe(true);
    expect(verifyReplay(rec.replay, good.hash ^ 1).ok).toBe(false);
    expect(verifyReplay({ ...rec.replay, hashes: [] }).ok).toBe(false);
  });
});
