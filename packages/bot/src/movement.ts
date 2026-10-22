import { ARENA_HALF_H, ARENA_HALF_W } from '@wrh/shared';
import type { Ctx, MoveDecision, Percept, TeamDecision } from './types';

/**
 * Where to move and when to dash. OWNED BY THE MOVEMENT AND COMBAT WORK: this is the baseline (keep away from the crowd, off the
 * walls, out of red ground attacks, toward helpful pickups); replace it with real survival play (kiting loops, escape routes, deck
 * and ramp use on layered arenas, dodging by arrival time, using the team's bias) without changing the signature.
 */
export function decideMove(p: Percept, _ctx: Ctx, team: TeamDecision): MoveDecision {
  let fx = team.bias.x;
  let fy = team.bias.y;
  let crowd = 0;
  for (const e of p.enemies) {
    if (e.d2 >= 100) break;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.sqrt(e.d2) + 0.5;
    fx -= dx / (d * d);
    fy -= dy / (d * d);
    crowd++;
  }
  const wx = Math.abs(p.x) / ARENA_HALF_W;
  const wy = Math.abs(p.y) / ARENA_HALF_H;
  if (wx > 0.8) fx -= Math.sign(p.x) * (wx - 0.8) * 8;
  if (wy > 0.75) fy -= Math.sign(p.y) * (wy - 0.75) * 8;
  for (const t of p.telegraphs) {
    const dx = p.x - t.x;
    const dy = p.y - t.y;
    const r = t.shape === 0 ? t.w + 1.5 : Math.max(t.w, t.l) + 1;
    if (dx * dx + dy * dy < r * r) {
      const d = Math.sqrt(dx * dx + dy * dy) + 0.1;
      fx += (dx / d) * 6;
      fy += (dy / d) * 6;
    }
  }
  for (const k of p.pickups) {
    const dx = k.x - p.x;
    const dy = k.y - p.y;
    if (dx * dx + dy * dy < 90 && crowd < 6) {
      const d = Math.sqrt(dx * dx + dy * dy) + 0.1;
      fx += (dx / d) * 0.8;
      fy += (dy / d) * 0.8;
    }
  }
  const len = Math.hypot(fx, fy);
  return { x: len > 0.05 ? fx / Math.max(len, 1) : 0, y: len > 0.05 ? fy / Math.max(len, 1) : 0, dash: crowd > 8 && p.tick % 60 === p.slot * 7 };
}
