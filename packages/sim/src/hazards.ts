import { BALANCE, MAX_PLAYERS, MAX_TELE, MAX_ZONES, PlayerState, TICK_DT, TICK_RATE, TeleEffect, TeleShape, ZoneKind } from '@wrh/shared';
import { atan2, cos, sin, sqrt } from './detmath';
import { absorb, stunImmune } from './features';
import { blastFrom, hurtPlayer } from './enemies';
import type { World } from './state';
import { fxOf } from './mods';

/** Slowing of a knocked-back player's push per tick. */
export const KNOCK_DECAY = 0.9;

/** Lay a lingering ground effect (acid, fire) down. Returns its slot, or -1 when the pool is full. */
export function addZone(w: World, x: number, y: number, radius: number, seconds: number, kind: number): number {
  for (let i = 0; i < MAX_ZONES; i++) {
    if (w.zActive[i]) continue;
    w.zActive[i] = 1;
    w.zKind[i] = kind;
    w.zX[i] = x;
    w.zY[i] = y;
    w.zR[i] = radius;
    w.zLeft[i] = Math.round(seconds * TICK_RATE);
    return i;
  }
  return -1;
}

/**
 * Start a telegraphed ground attack. Circle: `size` is the radius. Rect: it covers `length` either way along `angle` from
 * the centre and `size` either way across it. It lands after `delay` seconds on every living player that is inside and not
 * dashing (the dash's invulnerability dodges it); `amount` is the damage of Hurt, the radius of the Acid puddle it leaves.
 */
export function addTelegraph(w: World, shape: number, effect: number, x: number, y: number, angle: number, size: number, length: number, delay: number, amount: number): number {
  for (let i = 0; i < MAX_TELE; i++) {
    if (w.tActive[i]) continue;
    w.tActive[i] = 1;
    w.tShape[i] = shape;
    w.tEffect[i] = effect;
    w.tX[i] = x;
    w.tY[i] = y;
    w.tA[i] = angle;
    // the danger areas of the enemies are bigger than they used to be (the same arrays draw the warning)
    w.tW[i] = effect === TeleEffect.Hurt ? size * BALANCE.hitbox.enemyMul * fxOf(w).areaMul : size;
    w.tL[i] = length;
    w.tAmt[i] = amount;
    w.tLeft[i] = w.tTotal[i] = Math.max(1, Math.round(delay * TICK_RATE));
    w.tOwner[i] = -1;
    w.events.push({ type: 'telegraph', shape, x, y });
    return i;
  }
  return -1;
}

/** Throw a player: a push velocity (units per second), a stun (no steering or shooting) and a toss in the air for the show. */
export function launchPlayer(w: World, s: number, kx: number, ky: number, stunSeconds: number, airTicks = 14): void {
  if (stunImmune(w, s)) return; // a fortified heavy and a berserker in a rampage stand their ground
  w.pKnockX[s] = kx;
  w.pKnockY[s] = ky;
  const stun = Math.round(stunSeconds * TICK_RATE);
  if (stun > w.pStun[s]!) w.pStun[s] = stun;
  w.pAir[s] = airTicks;
  w.pDash[s] = 0;
  w.events.push({ type: 'launch', slot: s, x: w.pX[s]!, y: w.pY[s]! });
}

/** Damage over time (no invulnerability frames, no popups): what standing in acid or fire does. */
function burn(w: World, s: number, dps: number): void {
  if (w.pIFrames[s]! > 0) return;
  const dmg = absorb(w, s, dps * TICK_DT * BALANCE.enemyDamageMul * fxOf(w).enemyDamage * w.modArmor[s]! * w.pModArmor[s]!);
  const hp = w.pHp[s]! - dmg;
  w.pHp[s] = hp > 0 ? hp : 0;
  // one hurt flash a few times a second instead of one per tick
  if ((w.tick + s * 3) % 9 === 0) w.events.push({ type: 'playerHit', slot: s, x: w.pX[s]!, y: w.pY[s]!, damage: dps * 9 * TICK_DT });
}

function inside(w: World, t: number, px: number, py: number): boolean {
  const dx = px - w.tX[t]!;
  const dy = py - w.tY[t]!;
  if (w.tShape[t] === TeleShape.Circle) return dx * dx + dy * dy <= w.tW[t]! * w.tW[t]!;
  const c = cos(w.tA[t]!);
  const s = sin(w.tA[t]!);
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  return Math.abs(lx) <= w.tL[t]! && Math.abs(ly) <= w.tW[t]!;
}

function land(w: World, t: number): void {
  const effect = w.tEffect[t]!;
  const radius = w.tShape[t] === TeleShape.Circle ? w.tW[t]! : Math.max(w.tW[t]!, w.tL[t]!);
  w.events.push({ type: 'teleHit', shape: w.tShape[t]!, effect, x: w.tX[t]!, y: w.tY[t]!, radius });
  if (effect === TeleEffect.None) return; // only shows where something is about to happen
  if (effect === TeleEffect.Strike) {
    // a friendly strike (the demolisher's airstrike): it hurts enemies in the circle, never the squad
    w.events.push({ type: 'explosion', x: w.tX[t]!, y: w.tY[t]!, radius: w.tW[t]! });
    blastFrom(w, w.tOwner[t]!, w.tX[t]!, w.tY[t]!, w.tW[t]!, w.tAmt[t]!);
    return;
  }
  if (effect === TeleEffect.Acid) {
    addZone(w, w.tX[t]!, w.tY[t]!, w.tAmt[t]! > 0 ? w.tAmt[t]! : BALANCE.hazards.acid.radius, BALANCE.hazards.acid.seconds, ZoneKind.Acid);
    return;
  }
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s] || w.pState[s] !== PlayerState.Alive || w.pHp[s]! <= 0) continue;
    if (!inside(w, t, w.pX[s]!, w.pY[s]!)) continue;
    if (w.pIFrames[s]! > 0) continue; // a dash through it dodges it
    if (effect === TeleEffect.Hurt) {
      if (!hurtPlayer(w, s, w.tAmt[t]!, w.pX[s]!, w.pY[s]!)) continue;
      // thrown away from the centre of the blow (along the shape's axis for a rectangle)
      let dx = w.pX[s]! - w.tX[t]!;
      let dy = w.pY[s]! - w.tY[t]!;
      if (w.tShape[t] === TeleShape.Rect) {
        const nx = -sin(w.tA[t]!);
        const ny = cos(w.tA[t]!);
        const side = dx * nx + dy * ny >= 0 ? 1 : -1;
        dx = nx * side;
        dy = ny * side;
      }
      const l = sqrt(dx * dx + dy * dy);
      const push = BALANCE.bossAttacks.slam.push;
      launchPlayer(w, s, l > 1e-6 ? (dx / l) * push : push, l > 1e-6 ? (dy / l) * push : 0, BALANCE.bossAttacks.slam.stun);
    } else {
      // half of what is left, or all of it: no armour, no shield
      const before = w.pHp[s]!;
      const next = effect === TeleEffect.Kill ? 0 : before * 0.5;
      w.pHp[s] = next;
      w.events.push({ type: 'playerHit', slot: s, x: w.pX[s]!, y: w.pY[s]!, damage: before - next });
    }
  }
}

/** One tick of the ground effects: puddles burn whoever stands in them, charging attacks count down and land. */
export function updateHazards(w: World): void {
  for (let z = 0; z < MAX_ZONES; z++) {
    if (!w.zActive[z]) continue;
    w.zLeft[z] = w.zLeft[z]! - 1;
    if (w.zLeft[z]! <= 0) {
      w.zActive[z] = 0;
      continue;
    }
    const dps = w.zKind[z] === ZoneKind.Fire ? BALANCE.hazards.fire.dps : BALANCE.hazards.acid.dps;
    const r2 = w.zR[z]! * w.zR[z]!;
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!w.pActive[s] || w.pState[s] !== PlayerState.Alive || w.pHp[s]! <= 0) continue;
      const dx = w.pX[s]! - w.zX[z]!;
      const dy = w.pY[s]! - w.zY[z]!;
      if (dx * dx + dy * dy <= r2) burn(w, s, dps);
    }
  }
  for (let t = 0; t < MAX_TELE; t++) {
    if (!w.tActive[t]) continue;
    w.tLeft[t] = w.tLeft[t]! - 1;
    if (w.tLeft[t]! > 0) continue;
    w.tActive[t] = 0;
    land(w, t);
  }
}

/** Angle from (x0, y0) to (x1, y1) (sim axes). */
export function aimAt(x0: number, y0: number, x1: number, y1: number): number {
  return atan2(y1 - y0, x1 - x0);
}
