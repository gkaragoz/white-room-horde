import { ARENA_HALF_H, ARENA_HALF_W, FloorPhase } from '@wrh/shared';
import type { Member, Role } from './roles';
import type { Ctx, Percept } from './types';

/** A vector the team module hands the movement module (see TeamDecision.bias). */
export interface Vec {
  x: number;
  y: number;
}

/** Longest bias the team module ever returns: about "walk there, but let danger win". */
export const BIAS_MAX = 2;

/** Where each role likes to stand relative to the anchor: distance, bearing from the front (radians) and the fan across same-role friends. */
const SPOT: Readonly<Record<Role, { r: number; bearing: number; fan: number; dead: number }>> = {
  tank: { r: 5.5, bearing: 0, fan: 0.7, dead: 3.5 },
  ranged: { r: 9.5, bearing: Math.PI, fan: 1.0, dead: 4.5 },
  medic: { r: 6, bearing: Math.PI / 2, fan: 0.5, dead: 3.5 },
  demo: { r: 13, bearing: -Math.PI / 2, fan: 0.6, dead: 5 },
};

/** The per-bot memory of this module. */
export interface TeamMemory {
  /** Smoothed direction from the anchor to where the enemies are. */
  fx: number;
  fy: number;
  /** A fixed small offset so low judgement bots stand a little off the ideal spot. */
  jx: number;
  jy: number;
  humanPrev: Map<number, { x: number; y: number; tick: number }>;
  humanVel: Map<number, Vec>;
  /** Slots whose revive this bot decided to skip (low judgement), with the tick of the decision. */
  naive: Map<number, boolean>;
  /** When the telegraph awareness roll was last made, and its result. */
  awareTick: number;
  aware: boolean;
}

export function teamMemory(ctx: Ctx): TeamMemory {
  let m = ctx.mem.team as TeamMemory | undefined;
  if (!m) {
    const a = ctx.rand() * Math.PI * 2;
    const r = (1 - ctx.skill.judgement) * 3 * ctx.rand();
    m = { fx: 0, fy: 0, jx: Math.cos(a) * r, jy: Math.sin(a) * r, humanPrev: new Map(), humanVel: new Map(), naive: new Map(), awareTick: -1e9, aware: true };
    ctx.mem.team = m;
  }
  return m;
}

export const clampVec = (x: number, y: number, max: number): Vec => {
  const l = Math.hypot(x, y);
  return l > max ? { x: (x / l) * max, y: (y / l) * max } : { x, y };
};

/** Track how the humans move (a velocity per tick), for the loot manners. */
export function trackHumans(p: Percept, mem: TeamMemory): void {
  for (const a of p.allies) {
    if (!a.human) continue;
    const before = mem.humanPrev.get(a.slot);
    if (before && p.tick > before.tick) {
      const dt = p.tick - before.tick;
      const old = mem.humanVel.get(a.slot) ?? { x: 0, y: 0 };
      mem.humanVel.set(a.slot, { x: old.x * 0.6 + ((a.x - before.x) / dt) * 0.4, y: old.y * 0.6 + ((a.y - before.y) / dt) * 0.4 });
    }
    mem.humanPrev.set(a.slot, { x: a.x, y: a.y, tick: p.tick });
  }
}

/** Direction from the anchor toward where the enemies are (smoothed, unit length). With no enemies: toward the arena centre. */
function frontOf(p: Percept, anchor: Vec, mem: TeamMemory): Vec {
  let sx = 0;
  let sy = 0;
  for (const e of p.enemies) {
    const dx = e.x - anchor.x;
    const dy = e.y - anchor.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 900) continue;
    const wgt = (e.boss ? 5 : e.elite > 0 ? 1.5 : 1) / (4 + d2 * 0.05);
    sx += dx * wgt;
    sy += dy * wgt;
  }
  let l = Math.hypot(sx, sy);
  if (l < 1e-6) {
    sx = -anchor.x;
    sy = -anchor.y;
    l = Math.hypot(sx, sy);
    if (l < 4) {
      sx = 0;
      sy = 1;
      l = 1;
    }
  }
  sx /= l;
  sy /= l;
  const a = 0.25;
  mem.fx = mem.fx * (1 - a) + sx * a;
  mem.fy = mem.fy * (1 - a) + sy * a;
  const m = Math.hypot(mem.fx, mem.fy);
  if (m < 1e-6) {
    mem.fx = sx;
    mem.fy = sy;
    return { x: sx, y: sy };
  }
  return { x: mem.fx / m, y: mem.fy / m };
}

/** Where this bot would like to stand: its role's spot around the anchor, fanned across the bots of the same role by slot. */
export function spotFor(p: Percept, me: Member, squad: readonly Member[], anchor: Vec, mem: TeamMemory): Vec {
  const front = frontOf(p, anchor, mem);
  const base = SPOT[me.role];
  const same = squad.filter((m) => !m.human && m.role === me.role && m.state !== 2);
  const rank = same.findIndex((m) => m.slot === me.slot);
  const n = same.length;
  let bearing = base.bearing;
  if (n > 1) bearing += base.fan * ((rank / (n - 1) - 0.5) * 2);
  // the medic and the demolisher take opposite flanks (and by slot when there are several)
  if (me.role === 'medic' || me.role === 'demo') bearing *= rank % 2 === 0 ? 1 : -1;
  const c = Math.cos(bearing);
  const s = Math.sin(bearing);
  const dx = front.x * c - front.y * s;
  const dy = front.x * s + front.y * c;
  const x = anchor.x + dx * base.r + mem.jx;
  const y = anchor.y + dy * base.r + mem.jy;
  const mx = ARENA_HALF_W - 7;
  const my = ARENA_HALF_H - 6;
  return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
}

/** Pull toward the role spot, scaled up when the bot has drifted from the squad. */
export function formationBias(p: Percept, ctx: Ctx, me: Member, squad: readonly Member[], anchor: { x: number; y: number; slot: number; human: boolean }, mem: TeamMemory, near: number): Vec {
  const spot = spotFor(p, me, squad, anchor, mem);
  const dead = SPOT[me.role].dead;
  const tx = spot.x - p.x;
  const ty = spot.y - p.y;
  const d = Math.hypot(tx, ty);
  const toAnchor = Math.hypot(anchor.x - p.x, anchor.y - p.y);
  // lower judgement drifts further before it comes back
  const leash = 17 + 10 * (1 - ctx.skill.judgement);
  let mag = d > dead ? Math.min(1.1, (d - dead) * 0.12) : 0;
  // under pressure the movement module is busy staying alive; the squad only tugs gently
  if (near >= 4) mag *= 0.45;
  if (toAnchor > leash) mag = Math.max(mag, Math.min(BIAS_MAX, 1.2 + (toAnchor - leash) * 0.1));
  if (p.phase === FloorPhase.Cleared || p.phase === FloorPhase.Arrive) mag = Math.max(mag, d > dead ? Math.min(1.3, 0.3 + (d - dead) * 0.1) : 0);
  const bx = d > 1e-6 ? (tx / d) * mag : 0;
  const by = d > 1e-6 ? (ty / d) * mag : 0;
  return finish(p, ctx, me, squad, anchor, bx, by, near);
}

function finish(p: Percept, ctx: Ctx, me: Member, squad: readonly Member[], anchor: { x: number; y: number; slot: number; human: boolean }, bxIn: number, byIn: number, near: number): Vec {
  let bx = bxIn;
  let by = byIn;
  // do not stack on friends (and keep the demolisher clear of everyone: its area damage is not picky)
  const clear = me.role === 'demo' ? 7 : 3.5;
  const spread = 0.5 + 0.5 * ctx.skill.dodge;
  for (const m of squad) {
    if (m.slot === me.slot || !m.standing) continue;
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    const d = Math.hypot(dx, dy);
    const r = m.human ? clear + 0.8 : clear;
    if (d >= r) continue;
    const k = ((r - d) / r) * (m.human ? 1.3 : 1) * spread;
    if (d < 0.05) {
      bx += (me.slot % 2 ? 1 : -1) * k;
    } else {
      bx += (dx / d) * k;
      by += (dy / d) * k;
    }
  }
  // stay out of the human's lane: beside the line of fire, not on it (tanks may stand in front, they are meant to)
  if (anchor.human) {
    const hs = squad.find((m) => m.slot === anchor.slot);
    if (hs) {
      const ang = p.world.pAngle[hs.slot]!;
      const ax = Math.cos(ang);
      const ay = Math.sin(ang);
      const rx = p.x - hs.x;
      const ry = p.y - hs.y;
      const along = rx * ax + ry * ay;
      const side = rx * -ay + ry * ax;
      if (along > 1.5 && along < 24 && Math.abs(side) < 2.4) {
        const k = (1 - Math.abs(side) / 2.4) * (me.role === 'tank' ? 0.25 : 0.8);
        const sg = side === 0 ? (me.slot % 2 ? 1 : -1) : Math.sign(side);
        bx += -ay * sg * k;
        by += ax * sg * k;
      }
    }
  }
  // corner traps: a corner is a dead end, pull out of it toward the middle
  const cx = Math.abs(p.x) / ARENA_HALF_W;
  const cy = Math.abs(p.y) / ARENA_HALF_H;
  if (cx > 0.7 && cy > 0.68) {
    const k = Math.min(1, (cx - 0.7 + (cy - 0.68)) * 3) * (near > 0 ? 1 : 0.6);
    bx -= Math.sign(p.x) * k;
    by -= Math.sign(p.y) * k;
  }
  return clampVec(bx, by, BIAS_MAX);
}
