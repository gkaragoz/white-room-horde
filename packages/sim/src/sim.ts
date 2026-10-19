import {
  ARENA_HALF_H,
  ARENA_HALF_W,
  BALANCE,
  Buttons,
  MAX_BULLETS,
  MAX_PLAYERS,
  TICK_DT,
  WEAPON_IDS,
  type PlayerInput,
} from '@wrh/shared';
import { clamp, cos, sin, sqrt, TAU } from './detmath';
import { Crc32 } from './hash';
import { createWorld, type World } from './state';

export { createWorld };
export type { World };

/** Aim is a 16-bit angle (see PlayerInput); this is the factor to radians. */
const AIM_TO_RAD = TAU / 65536;

export function addPlayer(w: World, slot: number, x: number, y: number): void {
  w.pActive[slot] = 1;
  w.pX[slot] = x;
  w.pY[slot] = y;
  w.pAngle[slot] = 0;
  w.pHp[slot] = BALANCE.player.hp;
  w.pCooldown[slot] = 0;
  w.pWeapon[slot] = 0; // pistol
  w.pAmmo[slot] = BALANCE.weapons.pistol.ammo;
  w.pMoving[slot] = 0;
}

function spawnBullet(w: World, owner: number, x: number, y: number, angle: number, speed: number, range: number, damage: number): void {
  for (let i = 0; i < MAX_BULLETS; i++) {
    if (w.bActive[i]) continue;
    w.bActive[i] = 1;
    w.bX[i] = x;
    w.bY[i] = y;
    w.bVx[i] = cos(angle) * speed;
    w.bVy[i] = sin(angle) * speed;
    w.bLife[i] = range / speed;
    w.bDamage[i] = damage;
    w.bOwner[i] = owner;
    return;
  }
}

/**
 * Advance the world by one tick. `inputs[slot]` is the confirmed input for that slot (undefined = no input).
 * The order of the systems is fixed (docs/DESIGN.md section 15): inputs, player movement, weapons, bullets.
 */
export function step(w: World, inputs: ReadonlyArray<PlayerInput | undefined>): void {
  w.events.length = 0;
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s]) continue;
    const inp = inputs[s];
    if (!inp) {
      w.pMoving[s] = 0;
      continue;
    }
    // movement
    let mx = inp.moveX / 127;
    let my = inp.moveY / 127;
    const len = sqrt(mx * mx + my * my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const speed = BALANCE.player.speed;
    w.pMoving[s] = len > 0.05 ? 1 : 0;
    const r = BALANCE.player.radius;
    w.pX[s] = clamp(w.pX[s]! + mx * speed * TICK_DT, -ARENA_HALF_W + r, ARENA_HALF_W - r);
    w.pY[s] = clamp(w.pY[s]! + my * speed * TICK_DT, -ARENA_HALF_H + r, ARENA_HALF_H - r);
    const angle = inp.aim * AIM_TO_RAD;
    w.pAngle[s] = angle;

    // weapon
    const id = WEAPON_IDS[w.pWeapon[s]!]!;
    const stats = BALANCE.weapons[id];
    w.pCooldown[s] = w.pCooldown[s]! - TICK_DT;
    let shots = 0;
    while ((inp.buttons & Buttons.Fire) !== 0 && w.pCooldown[s]! <= 0 && shots < 3 && (stats.ammo < 0 || w.pAmmo[s]! > 0)) {
      for (let p = 0; p < stats.pellets; p++) {
        const a = angle + (w.rng.float() - 0.5) * 2 * stats.spread;
        spawnBullet(w, s, w.pX[s]! + cos(a) * 0.7, w.pY[s]! + sin(a) * 0.7, a, stats.bulletSpeed, stats.range, stats.damage);
      }
      w.events.push({ type: 'shot', slot: s, weapon: w.pWeapon[s]!, x: w.pX[s]!, y: w.pY[s]!, angle });
      if (stats.ammo >= 0) w.pAmmo[s] = w.pAmmo[s]! - 1;
      w.pCooldown[s] = w.pCooldown[s]! + 1 / stats.rate;
      shots++;
    }
    if (w.pCooldown[s]! < 0) w.pCooldown[s] = 0;
  }

  // bullets
  for (let i = 0; i < MAX_BULLETS; i++) {
    if (!w.bActive[i]) continue;
    w.bX[i] = w.bX[i]! + w.bVx[i]! * TICK_DT;
    w.bY[i] = w.bY[i]! + w.bVy[i]! * TICK_DT;
    w.bLife[i] = w.bLife[i]! - TICK_DT;
    const x = w.bX[i]!;
    const y = w.bY[i]!;
    if (w.bLife[i]! <= 0 || x < -ARENA_HALF_W || x > ARENA_HALF_W || y < -ARENA_HALF_H || y > ARENA_HALF_H) {
      w.bActive[i] = 0;
      w.events.push({ type: 'bulletGone', x, y });
    }
  }
  w.tick++;
}

/** CRC32 of every simulated field in a fixed order (used for desync detection, section 8). */
export function hashWorld(w: World): number {
  const c = new Crc32();
  c.u32(w.tick);
  for (const v of w.rng.getState()) c.u32(v);
  c.typed(w.pActive).typed(w.pX).typed(w.pY).typed(w.pAngle).typed(w.pHp).typed(w.pCooldown).typed(w.pWeapon).typed(w.pAmmo);
  c.typed(w.bActive).typed(w.bX).typed(w.bY).typed(w.bVx).typed(w.bVy).typed(w.bLife).typed(w.bDamage).typed(w.bOwner);
  return c.digest();
}
