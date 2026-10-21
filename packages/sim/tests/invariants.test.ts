import { ARENA_HALF_H, ARENA_HALF_W, BALANCE, Buttons, MAX_ENEMIES, MAX_PLAYERS, type PlayerInput, type WeaponId, WEAPON_IDS } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { createGame, setWave, step, type World } from '../src';
import { Rng } from '../src/rng';

function check(w: World, label: string): string | null {
  const bad = (name: string, v: number): string | null => (Number.isFinite(v) ? null : `${label}: ${name} is ${v}`);
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s]) continue;
    const e = bad('pX', w.pX[s]!) ?? bad('pY', w.pY[s]!) ?? bad('pHp', w.pHp[s]!);
    if (e) return e;
    if (Math.abs(w.pX[s]!) > ARENA_HALF_W + 0.01 || Math.abs(w.pY[s]!) > ARENA_HALF_H + 0.01) return `${label}: player ${s} left the arena`;
    if (w.pHp[s]! > w.pMaxHp[s]! + 1e-9) return `${label}: player ${s} hp ${w.pHp[s]} above max ${w.pMaxHp[s]}`;
    if (w.pHp[s]! < 0) return `${label}: negative hp`;
    if (w.pMag[s]! < 0) return `${label}: magazine ${w.pMag[s]}`;
    if (w.pGren[s]! < 0 || w.pGren[s]! > BALANCE.grenade.max + 3) return `${label}: grenades ${w.pGren[s]}`;
  }
  let live = 0;
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!w.eActive[i]) continue;
    live++;
    const e = bad('eX', w.eX[i]!) ?? bad('eY', w.eY[i]!) ?? bad('eHp', w.eHp[i]!);
    if (e) return e;
    if (Math.abs(w.eX[i]!) > ARENA_HALF_W + 0.01 || Math.abs(w.eY[i]!) > ARENA_HALF_H + 0.01) return `${label}: enemy ${i} left the arena`;
    if (w.eHp[i]! <= 0) return `${label}: living enemy ${i} with hp ${w.eHp[i]}`;
  }
  if (live !== w.enemyCount) return `${label}: enemyCount ${w.enemyCount} but ${live} are alive`;
  if (live > BALANCE.waves.cap + 16) return `${label}: ${live} enemies above the cap`;
  return null;
}

describe('simulation invariants under random play', () => {
  it('stays finite, inside the arena, consistent and bounded over many random games', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const rng = new Rng(seed * 7919);
      const n = 1 + (seed % 5) * 2;
      const w = createGame({ seed, players: Array.from({ length: n }, (_, s) => ({ slot: s, weapon: WEAPON_IDS[rng.int(WEAPON_IDS.length)] as WeaponId })) });
      if (seed % 2 === 0) setWave(w, 8 + seed);
      let held: PlayerInput[] = [];
      for (let t = 0; t < 2400; t++) {
        // change each player's behaviour every ~half second
        if (t % 15 === 0) {
          held = Array.from({ length: n }, () => ({
            moveX: rng.int(255) - 127,
            moveY: rng.int(255) - 127,
            aim: rng.int(65536),
            buttons: (rng.int(4) ? Buttons.Fire : 0) | (rng.int(10) === 0 ? Buttons.Grenade : 0) | (rng.int(3) === 0 ? Buttons.Revive : 0) | (rng.int(40) === 0 ? Buttons.Card1 << rng.int(3) : 0),
          }));
        }
        step(w, held);
        if (t % 30 === 0) {
          const err = check(w, `seed ${seed} tick ${t}`);
          expect(err).toBeNull();
        }
        if (w.gameOver) break;
      }
    }
  }, 60_000);
});
