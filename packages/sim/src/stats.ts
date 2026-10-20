import { STAT, STATS } from '@wrh/shared';
import type { World } from './state';

/** Add to one of a player's statistics (nothing for "nobody", slot -1). */
export function addStat(w: World, s: number, id: number, v: number): void {
  if (s >= 0) w.pStat[s * STATS + id] = w.pStat[s * STATS + id]! + v;
}

/** Keep the largest value seen. */
export function maxStat(w: World, s: number, id: number, v: number): void {
  if (s >= 0 && v > w.pStat[s * STATS + id]!) w.pStat[s * STATS + id] = v;
}

/** Heal a player by `amount` (never above the maximum) and count what was really gained. */
export function heal(w: World, s: number, amount: number): void {
  const before = w.pHp[s]!;
  const hp = before + amount > w.pMaxHp[s]! ? w.pMaxHp[s]! : before + amount;
  if (hp > before) {
    w.pHp[s] = hp;
    w.pStat[s * STATS + STAT.Healed] = w.pStat[s * STATS + STAT.Healed]! + (hp - before);
  }
}
