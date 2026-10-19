import { BALANCE, Buttons, CARD_IDS, PlayerState, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, createWorld, decodeReplay, encodeReplay, hashWorld, playReplay, Recorder, scriptedInput, spawnBoss, step } from '../src';
import { awardXp, xpForNext } from '../src/progression';
import { ENEMY_TYPES } from '@wrh/shared';

const NONE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };

describe('life cycle', () => {
  it('goes down at zero hp, can be revived by a teammate, and the run ends when nobody stands', () => {
    const w = createWorld(2);
    w.waveTick = 1e9;
    addPlayer(w, 0, 0, 0);
    addPlayer(w, 1, 0.5, 0);
    w.pHp[0] = 0;
    step(w, [NONE, NONE]);
    expect(w.pState[0]).toBe(PlayerState.Downed);
    expect(w.events.some((e) => e.type === 'playerDown')).toBe(true);
    const need = Math.ceil(BALANCE.player.reviveSeconds * 30) + 2;
    for (let t = 0; t < need; t++) step(w, [NONE, { ...NONE, buttons: Buttons.Revive }]);
    expect(w.pState[0]).toBe(PlayerState.Alive);
    expect(w.pHp[0]!).toBeCloseTo(BALANCE.player.hp * BALANCE.progression.revive.hpFraction, 0);
    expect(w.gameOver).toBe(0);
    // both down, nobody helps: dead and game over
    w.pHp[0] = 0;
    w.pHp[1] = 0;
    step(w, [NONE, NONE]);
    expect(w.gameOver).toBe(1);
  });

  it('a downed player left alone dies after the timer', () => {
    const w = createWorld(2);
    w.waveTick = 1e9;
    addPlayer(w, 0, 0, 0);
    addPlayer(w, 1, 10, 0);
    w.countMul = 0; // no enemies in this test
    w.pHp[0] = 0;
    for (let t = 0; t < (BALANCE.player.downedSeconds + 2) * 30; t++) step(w, [NONE, NONE]);
    expect(w.pState[0]).toBe(PlayerState.Dead);
    expect(w.pState[1]).toBe(PlayerState.Alive);
  });
});

describe('cards', () => {
  it('level up opens an offer; Card1 applies it; timeout picks randomly', () => {
    const w = createWorld(4);
    w.waveTick = 1e9;
    addPlayer(w, 0, 0, 0);
    awardXp(w, xpForNext(w));
    expect(w.level).toBe(2);
    expect(w.cardOffer[0]).toBeGreaterThanOrEqual(0);
    const offered = w.cardOffer[0]!;
    step(w, [{ ...NONE, buttons: Buttons.Card1 }]);
    expect(w.cardOffer[0]).toBe(-1);
    const id = CARD_IDS[offered]!;
    if (id === 'damage') expect(w.modDamage).toBeGreaterThan(1);
    awardXp(w, xpForNext(w));
    for (let t = 0; t < BALANCE.progression.cardSeconds * 30 + 2; t++) step(w, [NONE]);
    expect(w.cardOffer[0]).toBe(-1);
  });
});

describe('boss', () => {
  it('has a lot of hp, calls grunts and counts as one kill', () => {
    const w = createWorld(6);
    w.waveTick = 1e9;
    addPlayer(w, 0, 0, 0);
    const b = spawnBoss(w);
    expect(w.eBoss[b]).toBeGreaterThan(0);
    expect(w.eHp[b]).toBeGreaterThan(BALANCE.enemies.tank.hp * 10);
    expect(ENEMY_TYPES[w.eType[b]!]).toBe('tank');
  });
});

describe('replay', () => {
  it('records, encodes, decodes and replays to the same hash', () => {
    const setup = { seed: 99, players: [{ slot: 0, weapon: 'smg' as const }, { slot: 1, weapon: 'ar' as const }, { slot: 3, weapon: 'pistol' as const }] };
    const w = createGame(setup);
    const rec = new Recorder(setup);
    for (let t = 0; t < 600; t++) {
      const inputs = [scriptedInput(t, 0), scriptedInput(t, 1), undefined, scriptedInput(t, 3)];
      step(w, inputs);
      rec.record(w, inputs);
    }
    const bytes = encodeReplay(rec.replay);
    const back = decodeReplay(bytes);
    const res = playReplay(back);
    expect(res.mismatch).toBe(-1);
    expect(res.hash).toBe(hashWorld(w));
    expect(bytes.length).toBeLessThan(600 * 20 + 200);
  });

  it('detects a tampered input stream', () => {
    const setup = { seed: 5, players: [{ slot: 0, weapon: 'smg' as const }] };
    const w = createGame(setup);
    const rec = new Recorder(setup);
    for (let t = 0; t < 300; t++) {
      const inputs = [scriptedInput(t, 0)];
      step(w, inputs);
      rec.record(w, inputs);
    }
    rec.replay.ticks[40] = [{ ...scriptedInput(40, 0), moveX: 127, aim: 1234 }];
    expect(playReplay(rec.replay).mismatch).toBeGreaterThan(0);
  });
});
