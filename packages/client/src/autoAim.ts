import { BALANCE, EnemyState, MAX_BARRELS, MAX_ENEMIES, WEAPON_IDS } from '@wrh/shared';
import type { World } from '@wrh/sim';

/** What the auto-aim is locked on: an enemy (kind 0) or an explosive barrel (kind 1). */
export interface AimTarget {
  kind: 0 | 1;
  id: number;
  x: number;
  y: number;
}

/** A new target has to be this much closer than the one we are on before we let go of it (no flicker between two equals). */
const STICKY = 0.8;
/** Targets farther than the weapon's range times this are ignored. */
const REACH = 1.25;

/**
 * The nearest enemy or barrel to the player, within reach of the weapon in the hands, or null (then the cursor aims).
 * Barrels inside their blast of the shooter are skipped: shooting one at your feet would hurt you.
 */
export function pickTarget(w: World, slot: number, prev: AimTarget | null): AimTarget | null {
  if (!w.pActive[slot]) return null;
  const px = w.pX[slot]!;
  const py = w.pY[slot]!;
  const range = BALANCE.weapons[WEAPON_IDS[w.pWeapon[slot]!]!]!.range * REACH;
  const limit = range * range;
  let best: AimTarget | null = null;
  let bestD = limit;
  let prevD = -1;
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!w.eActive[i] || w.eState[i] === EnemyState.Spawn) continue;
    const dx = w.eX[i]! - px;
    const dy = w.eY[i]! - py;
    const d = dx * dx + dy * dy;
    if (prev && prev.kind === 0 && prev.id === i) prevD = d;
    if (d < bestD) {
      bestD = d;
      best = { kind: 0, id: i, x: w.eX[i]!, y: w.eY[i]! };
    }
  }
  const safe = BALANCE.barrels.radius + 1.2;
  for (let b = 0; b < MAX_BARRELS; b++) {
    if (!w.brActive[b]) continue;
    const dx = w.brX[b]! - px;
    const dy = w.brY[b]! - py;
    const d = dx * dx + dy * dy;
    if (d < safe * safe) continue;
    if (prev && prev.kind === 1 && prev.id === b) prevD = d;
    if (d < bestD) {
      bestD = d;
      best = { kind: 1, id: b, x: w.brX[b]!, y: w.brY[b]! };
    }
  }
  // stay on the current target unless something else is clearly nearer
  if (prev && prevD >= 0 && prevD <= limit && best && (best.kind !== prev.kind || best.id !== prev.id) && bestD > prevD * STICKY * STICKY) {
    return prev.kind === 0 ? { kind: 0, id: prev.id, x: w.eX[prev.id]!, y: w.eY[prev.id]! } : { kind: 1, id: prev.id, x: w.brX[prev.id]!, y: w.brY[prev.id]! };
  }
  return best;
}

/** Angle from the player to a target (sim axes). */
export function angleTo(w: World, slot: number, t: AimTarget): number {
  return Math.atan2(t.y - w.pY[slot]!, t.x - w.pX[slot]!);
}
