import { BALANCE, MAX_ENEMIES, MAX_TELE, PERK, PERKS, PlayerState, TeleEffect } from '@wrh/shared';
import type { World } from '@wrh/sim';
import type { Member } from './roles';

/** Everything the squad knows about one downed friend. Computed from the world only, so every bot gets the same numbers. */
export interface DownedInfo {
  slot: number;
  x: number;
  y: number;
  /** Seconds until the friend bleeds out. */
  timeLeft: number;
  /** Revive progress 0..1 (someone is already at it, or a healer drone). */
  progress: number;
  /** How hostile the ground around the friend is (enemy count, elites and bosses weigh more). */
  pressure: number;
  /** Seconds a ground attack needs to land on the friend (Infinity when none threatens the spot). */
  zoneEta: number;
  /** Centre of the threatening ground attack (when zoneEta is finite). */
  zoneX: number;
  zoneY: number;
  zoneR: number;
  /** Where the nearby enemies are (centroid, weighted); the friend's own spot when there are none. */
  threatX: number;
  threatY: number;
  /** The bot that goes for the revive (-1: none). */
  assignee: number;
}

export interface RevivePlan {
  downed: DownedInfo[];
  /** Bot slot -> the downed friend it revives. */
  assigned: Map<number, DownedInfo>;
}

const FULL = 7;
const FADE = 11;
const MOVE_SPEED = 12;
/** The walking speed of a bot that is about to stand next to a friend (the revive itself halves it). */
const REVIVE_RANGE = BALANCE.player.reviveRange;

/** How many enemy "weights" stand around a point, and where their centre lies. Reads the world arrays so it does not depend on one bot's reaction delay. */
export function pressureAt(w: World, x: number, y: number): { pressure: number; cx: number; cy: number } {
  let pressure = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!w.eActive[i]) continue;
    const dx = w.eX[i]! - x;
    const dy = w.eY[i]! - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > FADE * FADE) continue;
    const d = Math.sqrt(d2);
    const fall = d < FULL ? 1 : (FADE - d) / (FADE - FULL);
    const weight = (w.eBoss[i]! > 0 ? 6 : 1 + (w.eMod[i]! > 0 ? 1 : 0)) * fall;
    pressure += weight;
    cx += w.eX[i]! * weight;
    cy += w.eY[i]! * weight;
  }
  if (pressure > 0) return { pressure, cx: cx / pressure, cy: cy / pressure };
  return { pressure: 0, cx: x, cy: y };
}

/** The first ground attack that will land on (or near) a point: its circle and the ticks left. Rectangles count as a circle that surrounds them. */
export function zoneOver(w: World, x: number, y: number, margin = 0.8): { eta: number; x: number; y: number; r: number } | null {
  let best: { eta: number; x: number; y: number; r: number } | null = null;
  for (let t = 0; t < MAX_TELE; t++) {
    if (!w.tActive[t]) continue;
    if (w.tEffect[t] === TeleEffect.None && w.tAmt[t]! === 0) continue;
    const circle = w.tShape[t] === 0;
    const r = (circle ? w.tW[t]! : Math.max(w.tW[t]!, w.tL[t]!)) + margin;
    const dx = x - w.tX[t]!;
    const dy = y - w.tY[t]!;
    if (dx * dx + dy * dy > r * r) continue;
    const eta = w.tLeft[t]!;
    if (!best || eta < best.eta) best = { eta, x: w.tX[t]!, y: w.tY[t]!, r };
  }
  return best;
}

/** How much trouble a reviver can stand at the friend's side while it kneels (it moves at half speed and cannot shoot). */
export function tolerance(m: Member, timeLeft: number, standingCount: number): number {
  let tol = 3 + 8 * m.frac * m.frac + (m.role === 'tank' ? 3 : 0);
  if (timeLeft < 8) tol += 4;
  if (standingCount <= 1) tol *= 0.7;
  return tol;
}

/** Seconds the revive takes for this reviver. */
export function reviveSeconds(w: World, slot: number): number {
  const rate = w.pPerk[slot * PERKS + PERK.ReviveRate] || 1;
  return (BALANCE.player.reviveSeconds * (w.modRevive[slot] || 1)) / Math.max(0.1, rate);
}

/**
 * Who goes for which downed friend. A pure function of the world (positions, health, enemies, ground attacks, the human flags), so
 * every bot computes the same plan and no two bots run to the same friend. The most urgent friend (humans first, then the shortest
 * time left) picks first; the best reviver is the quickest to arrive among those who can stand the heat, and a friend whose
 * surroundings are too hot waits for cover fire instead. A friend a human is already kneeling beside is left alone.
 */
export function planRevives(w: World, squad: readonly Member[]): RevivePlan {
  const downed: DownedInfo[] = [];
  const standing = squad.filter((m) => m.standing);
  for (const m of squad) {
    if (m.state !== PlayerState.Downed) continue;
    const press = pressureAt(w, m.x, m.y);
    const zone = zoneOver(w, m.x, m.y);
    const need = reviveSeconds(w, m.slot);
    downed.push({
      slot: m.slot,
      x: m.x,
      y: m.y,
      timeLeft: w.pTimer[m.slot]!,
      progress: Math.min(1, w.pRevive[m.slot]! / Math.max(0.1, need)),
      pressure: press.pressure,
      zoneEta: zone ? zone.eta : Infinity,
      zoneX: zone ? zone.x : m.x,
      zoneY: zone ? zone.y : m.y,
      zoneR: zone ? zone.r : 0,
      threatX: press.cx,
      threatY: press.cy,
      assignee: -1,
    });
  }
  const assigned = new Map<number, DownedInfo>();
  if (downed.length === 0) return { downed, assigned };
  const humanOf = new Map<number, boolean>();
  for (const m of squad) humanOf.set(m.slot, m.human);
  const urgency = (d: DownedInfo): number => d.timeLeft * (humanOf.get(d.slot) ? 0.6 : 1);
  const order = [...downed].sort((a, b) => urgency(a) - urgency(b) || a.slot - b.slot);
  const bots = standing.filter((m) => !m.human);
  for (const d of order) {
    // a human already at the friend's side (or clearly nearer than any bot) has it
    let humanD = Infinity;
    for (const m of standing) if (m.human) humanD = Math.min(humanD, Math.hypot(m.x - d.x, m.y - d.y));
    let best: Member | null = null;
    let bestCost = Infinity;
    let nearest = Infinity;
    for (const m of bots) {
      if (assigned.has(m.slot)) continue;
      const dist = Math.hypot(m.x - d.x, m.y - d.y);
      nearest = Math.min(nearest, dist);
      const eta = Math.max(0, dist - REVIVE_RANGE * 0.8) / MOVE_SPEED;
      const need = reviveSeconds(w, m.slot) * (1 - d.progress);
      // the friend would be gone before the revive could finish
      if (eta + need > d.timeLeft + 0.3) continue;
      // someone already kneeling keeps at it through a little more trouble than a fresh arrival would accept
      const kneeling = dist < REVIVE_RANGE * 1.3 && d.progress > 0;
      if (d.pressure > tolerance(m, d.timeLeft, standing.length) * (kneeling ? 1.6 : 1)) continue;
      let cost = eta + need * 0.5;
      if (m.role === 'tank') cost -= 0.4;
      if (m.role === 'medic') cost -= 0.8;
      if (kneeling) cost -= 5;
      if (m.frac < 0.3) cost += 3;
      cost += d.pressure * 0.05;
      if (cost < bestCost - 1e-9 || (Math.abs(cost - bestCost) <= 1e-9 && best !== null && m.slot < best.slot)) {
        best = m;
        bestCost = cost;
      }
    }
    if (humanD < 2.6 || (humanD < 9 && humanD < nearest * 0.7)) continue;
    if (best) {
      d.assignee = best.slot;
      assigned.set(best.slot, d);
    }
  }
  return { downed, assigned };
}
