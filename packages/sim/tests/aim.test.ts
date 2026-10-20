import { BALANCE, Buttons, ENEMY_TYPES, WEAPON_IDS, type PlayerInput, type WeaponId } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld, spawnEnemy, step, type World } from '../src';

const GUNS = WEAPON_IDS.filter((id) => !BALANCE.weapons[id].melee) as WeaponId[];
const TANK = ENEMY_TYPES.indexOf('tank');

const encode = (a: number): number => {
  const t = a / (Math.PI * 2);
  return Math.round((t - Math.floor(t)) * 65536) % 65536;
};

/** The angle that sends a bullet from the muzzle through (tx, ty): the way the client's auto aim works it out. */
function solve(w: World, weapon: WeaponId, tx: number, ty: number): number {
  const st = BALANCE.weapons[weapon];
  const px = w.pX[0]!;
  const py = w.pY[0]!;
  let a = Math.atan2(ty - py, tx - px);
  if (Math.hypot(tx - px, ty - py) <= st.muzzleFwd + 2.5) return a; // close: aim from the middle, the barrel's 0.29 offset is inside the target's radius
  for (let k = 0; k < 4; k++) {
    const mx = px + Math.cos(a) * st.muzzleFwd + Math.sin(a) * st.muzzleSide;
    const my = py + Math.sin(a) * st.muzzleFwd - Math.cos(a) * st.muzzleSide;
    a = Math.atan2(ty - my, tx - mx);
  }
  return a;
}

function arena(weapon: WeaponId, x = 0, y = 0): World {
  const w = createWorld(5);
  w.waveTick = 1e9;
  w.countMul = 0;
  addPlayer(w, 0, x, y, weapon);
  w.pHp[0] = w.pMaxHp[0] = 1e9;
  return w;
}

function fireAt(w: World, weapon: WeaponId, tx: number, ty: number, ticks = 45): number {
  const e = spawnEnemy(w, TANK, tx, ty, false);
  w.eCooldown[e] = 1e9;
  w.eFrost[e] = 1e6;
  w.eHp[e] = 1e6;
  const hp = w.eHp[e]!;
  const aim = encode(solve(w, weapon, tx, ty));
  for (let t = 0; t < ticks; t++) step(w, [{ moveX: 0, moveY: 0, aim, buttons: Buttons.Fire } as PlayerInput]);
  return hp - w.eHp[e]!;
}

describe('a shot aimed from the muzzle hits', () => {
  for (const id of GUNS) {
    for (const d of [3, 8, 15]) {
      const st = BALANCE.weapons[id];
      // a gun hits what is inside its reach, and what its spread does not scatter
      if (st.range < d + 1) continue;
      if (st.spread * d > 1.0) continue;
      it(`${id} at ${d} units`, () => {
        const w = arena(id, -10, -12);
        expect(fireAt(w, id, -10 + d, -12)).toBeGreaterThan(0);
      });
    }
  }

  it('a wall right in front of the barrel still stops the shot', () => {
    // map 0 has a shelf at x 21..39, y 8..10
    const w = arena('ar', 19, 9);
    expect(fireAt(w, 'ar', 45, 9)).toBe(0);
  });

  it('a wall beside the path does not: the same shot a little further along the shelf lands', () => {
    const w = arena('ar', 19, 12);
    expect(fireAt(w, 'ar', 45, 12)).toBeGreaterThan(0);
  });
});
