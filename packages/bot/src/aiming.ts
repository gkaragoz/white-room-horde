import { BALANCE, WEAPON_IDS } from '@wrh/shared';
import { PRIORITY, T, bursts, radiusOf } from './danger';
import { geoOf, hit, intercept, pointSegDist, segmentCovered, type MapGeo } from './geometry';
import type { WeaponProfile } from './weapons';
import type { Ctx, Percept, Threat } from './types';

/** Target choice and lead for guns. Pure functions of the percept; the only memory is the id of the last target (hysteresis). */

/** A chosen shot. */
export interface Shot {
  /** The enemy aimed at (index into `p.enemies`), or -1. */
  index: number;
  /** Aim angle in radians, led and corrected for the muzzle. */
  angle: number;
  /** Distance to the aim point. */
  dist: number;
  /** Is it worth pulling the trigger (a clear line, in range)? */
  clear: boolean;
  /** The aim point is an explosive barrel with a crowd around it (then `index` is -1). */
  barrel: boolean;
}

export const shot: Shot = { index: -1, angle: 0, dist: 0, clear: false, barrel: false };

const MUZZLE_ITER = 2;

/** The muzzle position for an aim angle: forward along the aim and a little to the right. */
function muzzle(p: Percept, angle: number, out: { x: number; y: number }): void {
  const st = BALANCE.weapons[WEAPON_IDS[p.weapon]!]!;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  out.x = p.x + c * st.muzzleFwd + s * st.muzzleSide;
  out.y = p.y + s * st.muzzleFwd - c * st.muzzleSide;
}
const mz = { x: 0, y: 0 };

/**
 * The aim angle that sends a bullet from the muzzle through the enemy's predicted position. `lead` (0..1) scales how much of the
 * prediction is used (lower skill leads less).
 */
export function leadAngle(p: Percept, e: Threat, prof: WeaponProfile, lead: number): number {
  let ang = Math.atan2(e.y - p.y, e.x - p.x);
  const vx = e.vx * 30 * lead;
  const vy = e.vy * 30 * lead;
  let tx: number;
  let ty: number;
  for (let i = 0; i < MUZZLE_ITER; i++) {
    muzzle(p, ang, mz);
    if (prof.speed > 0 && (vx !== 0 || vy !== 0) && intercept(mz.x, mz.y, e.x, e.y, vx, vy, prof.speed)) {
      const t = Math.min(hit.t, 1.2);
      tx = e.x + vx * t;
      ty = e.y + vy * t;
    } else {
      tx = e.x;
      ty = e.y;
    }
    ang = Math.atan2(ty - mz.y, tx - mz.x);
  }
  return ang;
}

/** Number of enemies near the line from the shooter through (tx, ty), out to `reach`: what a piercing or spreading shot can take along. */
function lineDensity(p: Percept, tx: number, ty: number, reach: number, width: number, upto: number): number {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy) + 1e-6;
  const ex = p.x + (dx / d) * reach;
  const ey = p.y + (dy / d) * reach;
  let n = 0;
  const lim = Math.min(upto, p.enemies.length);
  for (let i = 0; i < lim; i++) {
    const e = p.enemies[i]!;
    if (e.d2 > reach * reach) break;
    if (pointSegDist(e.x, e.y, p.x, p.y, ex, ey) <= width + radiusOf(e)) n++;
  }
  return n;
}

const SCAN = 40;

/**
 * Choose what to shoot with a gun. Score = kill priority x urgency (the closer, the more urgent) x finishing bonus, with a
 * bonus for the enemies the bullets can take along (pierce, spread). Shielders are not worth bullets from the front.
 */
export function chooseShot(p: Percept, ctx: Ctx, prof: WeaponProfile): Shot {
  shot.index = -1;
  shot.clear = false;
  shot.barrel = false;
  shot.angle = p.angle;
  shot.dist = 0;
  const g = geoOf(p.world.map, p.layer);
  const j = ctx.skill.judgement;
  const maxR = prof.range * 0.94;
  const last = (ctx.mem.aim as { id: number } | undefined)?.id ?? -1;
  const lim = Math.min(SCAN, p.enemies.length);
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < lim; i++) {
    const e = p.enemies[i]!;
    const d = Math.sqrt(e.d2);
    if (d > maxR) break;
    if (e.layer > p.layer) continue;
    const r = radiusOf(e);
    if (segmentCovered(g, p.x, p.y, e.x, e.y)) continue;
    if (p.barrels.length > 0 && barrelOnLine(p, e.x, e.y)) continue;
    let pr = PRIORITY[e.type]!;
    if (e.boss) pr = 1.8;
    if (e.type === T.shielder && !prof.explosive && prof.pierce < 1) pr *= 0.45;
    if (bursts(e)) pr = Math.max(pr, 4);
    pr = 1 + (pr - 1) * j;
    // the closer, the more urgent
    let score = pr * (1 + 7 / (d + 1.5));
    // finishing off a wounded one counts more
    const frac = Math.min(1, e.hp / Math.max(1, e.maxHp));
    score *= 1.35 - 0.35 * frac;
    // an explosive that is already on us is not shot at point blank (it would burst anyway: shoot it if we cannot run)
    if (bursts(e) && d < 3.5) score *= 0.6;
    // bullets that pierce or fan out
    if (prof.pierce > 0 || prof.pellets > 1 || prof.blast > 0) {
      const w = prof.blast > 0 ? prof.blast * 0.8 : prof.pellets > 1 ? 1.2 + prof.spread * d * 0.6 : 0.7;
      const dens = prof.blast > 0 ? nearBlast(p, e, prof.blast) : lineDensity(p, e.x, e.y, Math.min(maxR, d + 6), w, 30);
      score *= 1 + 0.18 * Math.min(prof.blast > 0 ? 8 : prof.pierce + 3, dens) * j;
    }
    if (e.id === last) score *= 1.25;
    // do not waste time on the far end of the room when something is close
    score /= 1 + r * 0.05;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  // a barrel with a crowd around it is a bomb: set it off from a safe distance
  const bomb = bestBarrel(p, g, maxR);
  if (bomb >= 0 && bombScore > bestScore * 0.8) {
    const b = p.barrels[bomb]!;
    shot.angle = Math.atan2(b.y - p.y, b.x - p.x);
    shot.dist = Math.hypot(b.x - p.x, b.y - p.y);
    shot.clear = true;
    shot.barrel = true;
    return shot;
  }
  if (best < 0) return shot;
  const e = p.enemies[best]!;
  shot.index = best;
  shot.angle = leadAngle(p, e, prof, ctx.skill.judgement);
  shot.dist = Math.sqrt(e.d2);
  shot.clear = true;
  (ctx.mem.aim ??= { id: -1 } as never);
  (ctx.mem.aim as { id: number }).id = e.id;
  return shot;
}

/**
 * Would a bullet to (tx, ty) hit a barrel that stands close enough to the shooter or a friend to hurt them when it goes off? (A
 * barrel far from everybody on the line is a bomb in the way, not a danger.)
 */
function barrelOnLine(p: Percept, tx: number, ty: number): boolean {
  const safe = BALANCE.barrels.radius * 0.8 + 1.2;
  for (const b of p.barrels) {
    if (pointSegDist(b.x, b.y, p.x, p.y, tx, ty) > BALANCE.barrels.hitRadius + 0.2) continue;
    if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < safe * safe) return true;
    for (const a of p.allies) if ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 < safe * safe) return true;
  }
  return false;
}

let bombScore = 0;

/**
 * The barrel worth shooting: a crowd within its blast, the barrel in range and in the clear, and the shooter (and friends) far
 * enough from it not to take the blast. Returns its index in `p.barrels` or -1; its worth is left in `bombScore`.
 */
function bestBarrel(p: Percept, g: MapGeo, maxR: number): number {
  bombScore = 0;
  let pick = -1;
  const B = BALANCE.barrels;
  const safe2 = (B.radius * 0.8 + 1.8) * (B.radius * 0.8 + 1.8);
  const lim = Math.min(48, p.enemies.length);
  for (let i = 0; i < p.barrels.length; i++) {
    const b = p.barrels[i]!;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < safe2 || d2 > maxR * maxR) continue;
    let near = false;
    for (const a of p.allies) {
      const ax = a.x - b.x;
      const ay = a.y - b.y;
      if (ax * ax + ay * ay < safe2) near = true;
    }
    if (near || segmentCovered(g, p.x, p.y, b.x, b.y)) continue;
    let value = 0;
    for (let k = 0; k < lim; k++) {
      const e = p.enemies[k]!;
      const ex = e.x - b.x;
      const ey = e.y - b.y;
      if (ex * ex + ey * ey > B.radius * B.radius) continue;
      value += Math.min(1.2, B.damage / Math.max(1, e.hp)) * (0.6 + 0.4 * PRIORITY[e.type]!);
    }
    if (value > bombScore && value >= 3) {
      bombScore = value * 0.9;
      pick = i;
    }
  }
  return pick;
}

/** Enemies inside the blast radius around an enemy. */
function nearBlast(p: Percept, c: Threat, radius: number): number {
  let n = 0;
  const lim = Math.min(48, p.enemies.length);
  const r2 = radius * radius;
  for (let i = 0; i < lim; i++) {
    const e = p.enemies[i]!;
    const dx = e.x - c.x;
    const dy = e.y - c.y;
    if (dx * dx + dy * dy <= r2) n++;
  }
  return n;
}
