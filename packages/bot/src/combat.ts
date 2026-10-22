import { BALANCE, PERK, PERKS, PlayerState } from '@wrh/shared';
import { PRIORITY, T, radiusOf } from './danger';
import { chooseShot } from './aiming';
import { engagement, type WeaponProfile } from './weapons';
import type { CombatDecision, Ctx, Percept } from './types';

/**
 * What to shoot, where to aim, when to reload, throw a grenade or use the class ability.
 *
 * Guns: `aiming.ts` picks the target (kill priority x urgency, pierce lines, blast clusters) and leads the shot. Blades and the
 * hammer face the busiest side. Grenades go to where the crowd will be when the fuse ends; each class ability has its own trigger
 * (see `useSpecial`). Everything is deterministic from the percept.
 */

const out: CombatDecision = { aim: 0, aimDist: 0, fire: false, reload: false, grenade: { throw: false, aim: 0 }, special: false };

const CLS = { soldier: 0, medic: 1, heavy: 2, scout: 3, demolisher: 4, ranger: 5, berserker: 6, swordsman: 7, hammerer: 8 } as const;
const G = BALANCE.grenade;
const GRENADE_LAG = G.flight + G.fuse;
const TWO_PI = Math.PI * 2;

/** The facing of a melee swing that catches the most enemies, weighted by how much each is worth. Sets `swing`. */
const swing = { angle: 0, count: 0, value: 0 };
const SWING_DIRS = 24;
function bestSwing(p: Percept, prof: WeaponProfile): void {
  const reach = prof.range + 0.2;
  const lim2 = (reach + 1.8) * (reach + 1.8);
  let nearN = 0;
  while (nearN < p.enemies.length && p.enemies[nearN]!.d2 <= lim2) nearN++;
  swing.count = 0;
  swing.value = 0;
  swing.angle = p.angle;
  if (nearN === 0) return;
  for (let k = 0; k < SWING_DIRS; k++) {
    const a = (k / SWING_DIRS) * TWO_PI;
    let value = 0;
    let count = 0;
    for (let i = 0; i < nearN; i++) {
      const e = p.enemies[i]!;
      if (e.layer !== p.layer) continue;
      const d = Math.sqrt(e.d2);
      const r = radiusOf(e);
      if (d > reach + r) continue;
      let da = Math.atan2(e.y - p.y, e.x - p.x) - a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const slack = d > 0.01 ? Math.atan2(r, d) : 3;
      if (Math.abs(da) > prof.arc / 2 + slack) continue;
      count++;
      value += PRIORITY[e.type]! * (e.boss ? 2 : 1) * (1 + 2 / (d + 1));
    }
    if (value > swing.value) {
      swing.value = value;
      swing.count = count;
      swing.angle = a;
    }
  }
}

/** Where a grenade should land: the point within throwing range that will have the most enemies near it when the fuse ends. */
const gren = { x: 0, y: 0, score: 0 };
const gpx = new Float64Array(48);
const gpy = new Float64Array(48);
const gwt = new Float64Array(48);
function bestGrenade(p: Percept): void {
  gren.score = 0;
  gren.x = p.x;
  gren.y = p.y;
  const lim = Math.min(48, p.enemies.length);
  const R = G.radius * 0.95;
  const maxD2 = (G.maxRange + R) * (G.maxRange + R);
  // predicted positions when it blows: they keep coming toward us, which pulls the whole crowd in
  const px = gpx;
  const py = gpy;
  const wgt = gwt;
  let n = 0;
  for (let i = 0; i < lim; i++) {
    const e = p.enemies[i]!;
    if (e.d2 > maxD2) break;
    if (e.layer !== p.layer) continue;
    px[n] = e.x + e.vx * 30 * GRENADE_LAG * 0.8;
    py[n] = e.y + e.vy * 30 * GRENADE_LAG * 0.8;
    wgt[n] = e.boss ? 6 : Math.min(2.5, 0.6 + (e.hp > 120 ? 0.9 : 0) + PRIORITY[e.type]! * 0.25);
    n++;
  }
  // try each enemy's predicted spot as a centre
  for (let c = 0; c < n; c++) {
    const dx = px[c]! - p.x;
    const dy = py[c]! - p.y;
    const d = Math.hypot(dx, dy);
    if (d < G.minRange || d > G.maxRange) continue;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const ddx = px[i]! - px[c]!;
      const ddy = py[i]! - py[c]!;
      const dd = ddx * ddx + ddy * ddy;
      if (dd <= R * R) s += wgt[i]! * (1 - 0.35 * Math.sqrt(dd) / R);
    }
    if (s > gren.score) {
      gren.score = s;
      gren.x = px[c]!;
      gren.y = py[c]!;
    }
  }
}

/** Number of enemies (and their summed worth) within a radius. */
function around(p: Percept, radius: number): number {
  let n = 0;
  const r2 = radius * radius;
  for (const e of p.enemies) {
    if (e.d2 > r2) break;
    if (e.layer === p.layer) n++;
  }
  return n;
}

function bossNear(p: Percept, radius: number): boolean {
  const r2 = radius * radius;
  for (const e of p.enemies) {
    if (e.d2 > r2) break;
    if (e.boss) return true;
  }
  return false;
}

/** Should the class ability go off now? */
function useSpecial(p: Percept, ctx: Ctx): boolean {
  const w = p.world;
  const s = p.slot;
  if (w.pSpecCd[s]! > 0 || w.pStun[s]! > 0) return false;
  const cls = w.pPerk[s * PERKS + PERK.Class]!;
  const near5 = around(p, 5);
  const near8 = around(p, 8);
  const near12 = around(p, 12);
  const hurt = p.hp / Math.max(1, p.maxHp);
  const j = ctx.skill.judgement;
  const eager = j < 0.5 ? 0 : 1;
  switch (cls) {
    case CLS.soldier:
      return near12 >= 6 || bossNear(p, 16);
    case CLS.medic: {
      if (hurt < 0.55 && near8 >= 1) return true;
      let hurtAllies = 0;
      for (const a of p.allies) {
        if (a.state !== PlayerState.Alive || a.hp >= a.maxHp * 0.6) continue;
        const dx = a.x - p.x;
        const dy = a.y - p.y;
        if (dx * dx + dy * dy < 64) hurtAllies++;
      }
      return hurtAllies >= 1 && (hurt < 0.85 || hurtAllies >= 2);
    }
    case CLS.heavy:
      return near5 >= 5 || (hurt < 0.5 && near8 >= 3);
    case CLS.scout:
      return (near5 >= 6 || (hurt < 0.5 && near5 >= 3)) && eager === 1;
    case CLS.demolisher:
      return gren.score >= 5 || bossNear(p, 16);
    case CLS.ranger:
      return near12 >= 4 || bossNear(p, 22);
    case CLS.berserker:
      return near8 >= 4 || bossNear(p, 10);
    case CLS.swordsman:
      return near5 >= 4 || (bossNear(p, 5) && near5 >= 1);
    case CLS.hammerer:
      return near5 >= 4 || (bossNear(p, 6) && near5 >= 1);
    default:
      return false;
  }
}

export function decideCombat(p: Percept, ctx: Ctx): CombatDecision {
  const prof = engagement(p);
  const w = p.world;
  out.fire = false;
  out.reload = false;
  out.special = false;
  out.grenade.throw = false;
  out.aimDist = 0;
  out.aim = p.angle;
  out.grenade.aim = p.angle;
  if (p.state !== PlayerState.Alive || p.enemies.length === 0) {
    // nothing to shoot: top the magazine up
    if (!prof.melee && p.state === PlayerState.Alive && p.mag < prof.mag * 0.7) out.reload = true;
    return out;
  }

  // grenade first: it also informs the demolisher's strike
  bestGrenade(p);
  const nearest = p.enemies[0]!;
  const nd = Math.sqrt(nearest.d2);

  if (prof.melee) {
    bestSwing(p, prof);
    out.aim = swing.count > 0 ? swing.angle : Math.atan2(nearest.y - p.y, nearest.x - p.x);
    if (prof.charge > 0) {
      // the hammer: hold to build up, let go on a full charge (or when swamped)
      const charge = w.pCharge[p.slot]!;
      const want = swing.count > 0 || nd < prof.range + 2.5;
      const near4 = around(p, 4.5);
      const full = charge >= prof.charge * 0.97 || (charge > 0.45 && near4 >= 6);
      out.fire = want && !full;
    } else {
      out.fire = swing.count > 0 || nd < prof.range + 0.6;
    }
  } else {
    const sh = chooseShot(p, ctx, prof);
    if (sh.index >= 0) {
      out.aim = sh.angle;
      out.aimDist = sh.dist;
      out.fire = true;
    } else {
      out.aim = Math.atan2(nearest.y - p.y, nearest.x - p.x);
    }
    // reload: never with a kill in sight, only when the magazine is thin and nothing is close
    if (p.mag < prof.mag * 0.25 && p.mag > 0 && nd > 9) out.reload = true;
    if (p.mag === 0) out.reload = false;
  }

  // grenade: throw when the blast catches a crowd
  if (p.grenades > 0 && w.pGrenCd[p.slot]! <= 0) {
    const full = p.grenades >= BALANCE.grenade.max;
    const need = full ? 3.2 : p.grenades === 1 ? 7 : 5;
    if (gren.score >= need || (bossNear(p, 14) && gren.score >= 1.5)) {
      out.grenade.throw = true;
      out.grenade.aim = Math.atan2(gren.y - p.y, gren.x - p.x);
      // the wire value is a distance in units/4 steps: the Bot multiplies by 4
      out.aimDist = Math.hypot(gren.x - p.x, gren.y - p.y);
    }
  }

  out.special = useSpecial(p, ctx);
  if (out.special && w.pPerk[p.slot * PERKS + PERK.Class]! === CLS.demolisher) {
    // the airstrike lands where the sim reads `reach = clamp(aimDist * 0.5)`: send half the distance so it lands on the crowd
    out.aim = Math.atan2(gren.y - p.y, gren.x - p.x);
    out.aimDist = Math.hypot(gren.x - p.x, gren.y - p.y) / 2;
  }
  return out;
}

void T;
