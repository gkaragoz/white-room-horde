import { BALANCE, Buttons, ENEMY_TYPES, PlayerState, TICK_RATE, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, awayProtected, createWorld, hashWorld, restoreWorld, serializeWorld, spawnEnemy, step } from '../src';

const G = ENEMY_TYPES.indexOf('grunt');
const IDLE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };
const AWAY: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: Buttons.Away };
const LIMIT = BALANCE.player.awayProtectSeconds * TICK_RATE;

/** Two players, the second one in the middle of a crowd. */
function crowd(seed = 7) {
  const w = createWorld(seed);
  addPlayer(w, 0, -30, 0);
  addPlayer(w, 1, 0, 0);
  for (let i = 0; i < 40; i++) spawnEnemy(w, G, Math.cos(i) * 1.6, Math.sin(i) * 1.6, false);
  return w;
}

describe('away players', () => {
  it('a player with no input is untouchable for the protected minute, then the game is as hard as ever', () => {
    const w = crowd();
    const maxHp = w.pMaxHp[1]!;
    for (let t = 0; t < LIMIT; t++) step(w, [IDLE, undefined]);
    expect(w.pHp[1]).toBe(maxHp);
    expect(w.pAway[1]).toBe(LIMIT);
    expect(awayProtected(w, 1)).toBe(true);
    // the minute is over
    for (let t = 0; t < 30 * TICK_RATE; t++) step(w, [IDLE, undefined]);
    expect(awayProtected(w, 1)).toBe(false);
    expect(w.pHp[1]! < maxHp || w.pState[1] !== PlayerState.Alive).toBe(true);
  });

  it('the relay\'s Away flag on a connected but silent player counts the same as no input at all', () => {
    const a = crowd(11);
    const b = crowd(11);
    for (let t = 0; t < 600; t++) {
      step(a, [IDLE, undefined]);
      step(b, [IDLE, AWAY]);
    }
    expect(b.pAway[1]).toBe(600);
    expect(b.pHp[1]).toBe(b.pMaxHp[1]);
    expect(a.pHp[1]).toBe(a.pMaxHp[1]);
  });

  it('real input ends the protection at once and restarts the clock', () => {
    const w = crowd(5);
    for (let t = 0; t < 300; t++) step(w, [IDLE, undefined]);
    expect(w.pAway[1]).toBe(300);
    step(w, [IDLE, IDLE]);
    expect(w.pAway[1]).toBe(0);
    expect(awayProtected(w, 1)).toBe(false);
    for (let t = 0; t < 100; t++) step(w, [IDLE, undefined]);
    expect(w.pAway[1]).toBe(100);
  });

  it('a downed player does not bleed out while away, and does after the minute', () => {
    const w = createWorld(3); // player 0 is kept untouchable by hand: if nobody stands the game ends and nothing moves on any more
    addPlayer(w, 0, -30, 0);
    addPlayer(w, 1, 0, 0);
    w.pState[1] = PlayerState.Downed;
    w.pHp[1] = 0;
    w.pTimer[1] = BALANCE.player.downedSeconds;
    const hold = (n: number): void => {
      for (let t = 0; t < n; t++) {
        w.pIFrames[0] = 9;
        step(w, [IDLE, undefined]);
      }
    };
    hold(40 * TICK_RATE);
    expect(w.pState[1]).toBe(PlayerState.Downed);
    expect(w.pTimer[1]).toBe(BALANCE.player.downedSeconds);
    hold((BALANCE.player.awayProtectSeconds + BALANCE.player.downedSeconds + 2) * TICK_RATE);
    expect(w.pState[1]).toBe(PlayerState.Dead);
  });

  it('the counter is part of the snapshot and of the hash', () => {
    const w = crowd(9);
    for (let t = 0; t < 120; t++) step(w, [IDLE, undefined]);
    const h = hashWorld(w);
    const copy = crowd(9);
    restoreWorld(copy, serializeWorld(w));
    expect(copy.pAway[1]).toBe(120);
    expect(hashWorld(copy)).toBe(h);
    copy.pAway[1] = 121;
    expect(hashWorld(copy)).not.toBe(h);
  });
});
