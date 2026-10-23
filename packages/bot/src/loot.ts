import { BALANCE, PickupType } from '@wrh/shared';
import type { Member } from './roles';
import type { TeamMemory, Vec } from './formation';
import type { Percept, Pickup } from './types';

/** Does this player gain anything from the pickup? (The sim hands a pickup to the nearest player who does.) */
function wants(p: Percept, m: Member, k: Pickup): boolean {
  switch (k.type) {
    case PickupType.Health:
      return m.frac < 0.999;
    case PickupType.Grenade:
    case PickupType.Ammo:
      return p.world.pGren[m.slot]! < BALANCE.grenade.max;
    default:
      return true;
  }
}

/**
 * Loot manners: how free this bot is to go for a pickup (1 = take it, 0 = leave it to a friend). A human who needs it and is
 * nearer, or is walking toward it, gets it; among bots the nearest who needs it gets it (the sim's own rule). The movement module
 * may consult this for its pickup attraction.
 */
export function pickupShare(p: Percept, squad: readonly Member[], mem: TeamMemory, k: Pickup): number {
  const me = squad.find((m) => m.slot === p.slot);
  if (!me || !wants(p, me, k)) return 0;
  const dMe = Math.hypot(k.x - p.x, k.y - p.y);
  for (const m of squad) {
    if (m.slot === p.slot || !m.standing || !wants(p, m, k)) continue;
    const d = Math.hypot(k.x - m.x, k.y - m.y);
    if (m.human) {
      const v = mem.humanVel.get(m.slot);
      const toward = v ? (v.x * (k.x - m.x) + v.y * (k.y - m.y)) / (Math.hypot(v.x, v.y) * d + 1e-6) : 0;
      const speed = v ? Math.hypot(v.x, v.y) : 0;
      const walking = speed > 0.12 && toward > 0.7 && d < 16;
      // the human is hurt more, or is clearly on the way
      const needier = k.type === PickupType.Health && m.frac + 0.05 < me.frac;
      if (walking || (d < dMe * 1.3 + 2 && (needier || k.type !== PickupType.Health))) return 0;
      continue;
    }
    if (d + 0.5 < dMe || (Math.abs(d - dMe) <= 0.5 && m.slot < p.slot)) return 0.2;
  }
  return 1;
}

/** A push away from pickups that a human should get (cancels the movement module's pull toward them). */
export function lootBias(p: Percept, squad: readonly Member[], mem: TeamMemory, crowd: number): Vec {
  let bx = 0;
  let by = 0;
  if (crowd >= 6) return { x: 0, y: 0 };
  const me = squad.find((m) => m.slot === p.slot);
  if (!me) return { x: 0, y: 0 };
  for (const k of p.pickups) {
    const dx = k.x - p.x;
    const dy = k.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 110) continue;
    const share = pickupShare(p, squad, mem, k);
    if (share > 0.1 || !wants(p, me, k)) continue;
    const d = Math.sqrt(d2) + 0.1;
    bx -= (dx / d) * 0.85;
    by -= (dy / d) * 0.85;
  }
  return { x: bx, y: by };
}
