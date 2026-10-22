import { PlayerState } from '@wrh/shared';
import type { Ctx, Percept, TeamDecision } from './types';

/**
 * How a bot behaves as a teammate. OWNED BY THE TEAM AND INTEGRATION WORK: this is the baseline (go to a downed friend when
 * nothing is close and revive); replace it with companion play (stay near the human without crowding, cover a downed friend,
 * share pickups the human wants, spread out against area attacks, role by class) without changing the signature.
 */
export function decideTeam(p: Percept, ctx: Ctx): TeamDecision {
  void ctx;
  let bx = 0;
  let by = 0;
  let revive = false;
  let near = 0;
  for (const e of p.enemies) {
    if (e.d2 >= 100) break;
    near++;
  }
  for (const a of p.allies) {
    if (a.state !== PlayerState.Downed) continue;
    const dx = a.x - p.x;
    const dy = a.y - p.y;
    if (near < 3) {
      bx += dx * 0.05;
      by += dy * 0.05;
    }
    if (dx * dx + dy * dy < 4) revive = true;
  }
  return { revive, bias: { x: bx, y: by } };
}
