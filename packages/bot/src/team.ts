import { FloorPhase, PlayerState } from '@wrh/shared';
import { BIAS_MAX, clampVec, formationBias, teamMemory, trackHumans, type TeamMemory, type Vec } from './formation';
import { lootBias } from './loot';
import { planRevives, zoneOver, type DownedInfo, type RevivePlan } from './revive';
import { anchorOf, squadOf, type Member } from './roles';
import { legToLayer } from './route';
import type { Ctx, Percept, TeamDecision } from './types';

export { BIAS_MAX } from './formation';
export { pickupShare } from './loot';
export { planRevives, type DownedInfo, type RevivePlan } from './revive';
export { roleOfClass, type Role } from './roles';

/** The sim lets a helper revive from this close; the bot kneels a little inside it. */
const KNEEL = 1.35;

const none = (): TeamDecision => ({ revive: false, bias: { x: 0, y: 0 } });

/**
 * How a bot behaves as a teammate (a companion that plays with a human and with other bots). The decision is a pure function of
 * the world, the bot's slot and its own memory, and the squad-wide choices (who revives whom, who stands where) are computed from the
 * world alone, so every bot reaches the same plan without talking to the others:
 *
 *  - revive: one bot per downed friend, the quickest one that can stand the heat; the others cover; never into a coming ground
 *    attack (boss slams); a human who is already at the friend has it; not at all while the floor is cleared (the fallen get up on
 *    the next floor anyway);
 *  - positioning: a spot by class role around the human (or around the tank when only bots play), spread against area attacks,
 *    out of the human's line of fire, out of corners, regrouped between floors;
 *  - loot: pickups a human needs and is walking to are left alone;
 *  - skill: `judgement` loosens the leash and the risk judgement of revives, `dodge` the awareness of ground attacks and spreading.
 *
 * The bias is bounded by `BIAS_MAX` (about "walk there, but let danger win").
 */
export function decideTeam(p: Percept, ctx: Ctx): TeamDecision {
  if (p.allies.length === 0) return none();
  const mem = teamMemory(ctx);
  trackHumans(p, mem);
  const squad = squadOf(p);
  const me = squad.find((m) => m.slot === p.slot);
  if (!me) return none();
  if (p.phase === FloorPhase.Ascend) return none();

  // a downed bot crawls toward a friend who can pick it up (and away from the horde, as far as that goes)
  if (p.state !== PlayerState.Alive) return { revive: false, bias: crawlToward(p, squad) };

  let near = 0;
  for (const e of p.enemies) {
    if (e.d2 >= 100) break;
    near++;
  }

  const fight = p.phase === FloorPhase.Fight;
  if (fight) {
    const plan = planRevives(p.world, squad);
    if (plan.downed.length > 0) {
      const act = reviveAct(p, ctx, mem, me, plan);
      if (act) return act;
    }
  } else if (mem.naive.size > 0) mem.naive.clear();

  const anchor = anchorOf(me, squad);
  let bx = 0;
  let by = 0;
  if (anchor) {
    const a = anchor.slot >= 0 ? squad.find((m) => m.slot === anchor.slot) : undefined;
    const leg = a && a.layer !== p.layer && Math.hypot(a.x - p.x, a.y - p.y) > 5 ? legToLayer(p.world, p.x, p.y, p.layer, a.x, a.y, a.layer) : null;
    if (leg) {
      // the anchor is on another level: use the ramp rather than push against the edge
      const ld = Math.hypot(leg.x - p.x, leg.y - p.y) || 1;
      bx += ((leg.x - p.x) / ld) * 1.1;
      by += ((leg.y - p.y) / ld) * 1.1;
    } else {
      const f = formationBias(p, ctx, me, squad, anchor, mem, near);
      bx += f.x;
      by += f.y;
    }
  }
  const s = supportBias(p, me, squad);
  bx += s.x;
  by += s.y;
  const l = lootBias(p, squad, mem, near);
  bx += l.x;
  by += l.y;
  return { revive: false, bias: clampVec(bx, by, BIAS_MAX) };
}

function crawlToward(p: Percept, squad: readonly Member[]): Vec {
  let best: Member | null = null;
  let bd = Infinity;
  for (const m of squad) {
    if (m.slot === p.slot || !m.standing) continue;
    const d = (m.x - p.x) ** 2 + (m.y - p.y) ** 2 + (m.layer === p.layer ? 0 : 400);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  if (!best || bd < 4) return { x: 0, y: 0 };
  const d = Math.sqrt(bd);
  return { x: ((best.x - p.x) / d) * 1.0, y: ((best.y - p.y) / d) * 1.0 };
}

/** The medic goes to the weakest friend; a tank leans toward one that is in trouble. */
function supportBias(p: Percept, me: Member, squad: readonly Member[]): Vec {
  if (me.role !== 'medic' && me.role !== 'tank') return { x: 0, y: 0 };
  let weak: Member | null = null;
  for (const m of squad) {
    if (m.slot === me.slot || !m.standing || m.frac > 0.6) continue;
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d > 26) continue;
    if (!weak || m.frac < weak.frac - 1e-9 || (Math.abs(m.frac - weak.frac) <= 1e-9 && m.slot < weak.slot)) weak = m;
  }
  if (!weak) return { x: 0, y: 0 };
  const dx = weak.x - p.x;
  const dy = weak.y - p.y;
  const d = Math.hypot(dx, dy);
  const stay = me.role === 'medic' ? 3.2 : 4.5;
  if (d <= stay) return { x: 0, y: 0 };
  const gain = me.role === 'medic' ? 1 : 0.35;
  const k = Math.min(gain, (d - stay) * 0.1 + 0.2) / d;
  return { x: dx * k, y: dy * k };
}

/** The bot's part in the squad's revive plan (null: nothing to do about the downed, play the normal formation). */
function reviveAct(p: Percept, ctx: Ctx, mem: TeamMemory, me: Member, plan: RevivePlan): TeamDecision | null {
  for (const key of [...mem.naive.keys()]) if (!plan.downed.some((d) => d.slot === key)) mem.naive.delete(key);
  let target: DownedInfo | undefined = plan.assigned.get(me.slot);
  if (!target) {
    // a bot with weaker judgement sometimes rushes the nearest friend regardless of the plan or the heat
    let nearest: DownedInfo | null = null;
    let nd = Infinity;
    for (const d of plan.downed) {
      const dist = Math.hypot(d.x - p.x, d.y - p.y);
      if (dist < nd) {
        nd = dist;
        nearest = d;
      }
    }
    if (nearest && nd < 22 && nearest.assignee < 0) {
      let rush = mem.naive.get(nearest.slot);
      if (rush === undefined) {
        rush = ctx.rand() > ctx.skill.judgement && ctx.rand() < 0.6;
        mem.naive.set(nearest.slot, rush);
      }
      if (rush && nearest.timeLeft > 2) target = nearest;
    }
  }
  if (target) return goRevive(p, ctx, mem, target);
  return cover(p, me, plan);
}

/** Walk to the friend and kneel, unless a ground attack is about to land there. */
function goRevive(p: Percept, ctx: Ctx, mem: TeamMemory, t: DownedInfo): TeamDecision {
  // how well the bot notices the red areas (re-rolled a few times a second)
  if (p.tick - mem.awareTick >= 8) {
    mem.awareTick = p.tick;
    mem.aware = ctx.rand() < 0.3 + 0.7 * ctx.skill.dodge;
  }
  let dx = t.x - p.x;
  let dy = t.y - p.y;
  const dist = Math.hypot(dx, dy);
  if (mem.aware) {
    const here = zoneOver(p.world, p.x, p.y, 0.4);
    const there = t.zoneEta < Infinity ? { x: t.zoneX, y: t.zoneY, r: t.zoneR, eta: t.zoneEta } : null;
    const zone = here ?? there;
    if (zone) {
      // wait outside the red area until it has landed; step out if inside
      const zx = p.x - zone.x;
      const zy = p.y - zone.y;
      const zd = Math.hypot(zx, zy) || 1;
      const edge = zone.r + 1.2;
      if (zd < edge) return { revive: false, bias: clampVec((zx / zd) * (1.2 + (edge - zd) * 0.3), (zy / zd) * (1.2 + (edge - zd) * 0.3), BIAS_MAX) };
      return none();
    }
  }
  if (dist > KNEEL * 1.5 && p.layer !== t.layer) {
    // the friend lies on another level: take the ramp first
    const leg = legToLayer(p.world, p.x, p.y, p.layer, t.x, t.y, t.layer);
    if (leg) {
      dx = leg.x - p.x;
      dy = leg.y - p.y;
      const ld = Math.hypot(dx, dy) || 1;
      const lk = Math.min(BIAS_MAX, 1.4) / ld;
      return { revive: false, bias: { x: dx * lk, y: dy * lk } };
    }
  }
  if (dist <= KNEEL) return { revive: true, bias: dist > 0.7 ? clampVec((dx / dist) * 0.4, (dy / dist) * 0.4, 0.4) : { x: 0, y: 0 } };
  const k = Math.min(BIAS_MAX, 0.8 + dist * 0.15) / dist;
  return { revive: false, bias: { x: dx * k, y: dy * k } };
}

/** Friends who are not going to revive stand between the downed friend and the horde (tanks close, the rest further back). */
function cover(p: Percept, me: Member, plan: RevivePlan): TeamDecision | null {
  if (me.frac < 0.35) return null;
  let target: DownedInfo | null = null;
  let td = Infinity;
  for (const d of plan.downed) {
    if (d.pressure < 1.5 || d.timeLeft < 2) continue;
    const dist = Math.hypot(d.x - p.x, d.y - p.y);
    if (dist < td && dist < 30) {
      td = dist;
      target = d;
    }
  }
  if (!target) return null;
  const tx = target.threatX - target.x;
  const ty = target.threatY - target.y;
  const tl = Math.hypot(tx, ty);
  const ux = tl > 0.5 ? tx / tl : 0;
  const uy = tl > 0.5 ? ty / tl : 0;
  const r = me.role === 'tank' ? 4.5 : me.role === 'medic' ? 5.5 : 8;
  const sx = target.x + ux * r;
  const sy = target.y + uy * r;
  const dx = sx - p.x;
  const dy = sy - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 2.5) return { revive: false, bias: { x: 0, y: 0 } };
  const k = Math.min(1.1, 0.3 + d * 0.08) / d;
  return { revive: false, bias: { x: dx * k, y: dy * k } };
}
