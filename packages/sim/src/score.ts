import { Difficulty, MAX_PLAYERS, STAT, STATS } from '@wrh/shared';
import type { World } from './state';

/** The score of a run: floors, kills, bosses and the time alive, times the score multiplier of the chosen Difficulty. */
export function runScore(world: World): { base: number; mult: number; final: number } {
  let bosses = 0;
  for (let s = 0; s < MAX_PLAYERS; s++)
    if (world.pActive[s]) bosses += world.pStat[s * STATS + STAT.BossKills]!;
  const base = Math.round(world.wave * 500 + world.kills * 10 + bosses * 1000 + world.tick / 30);
  const mult = Difficulty.scoreMultiplier(world.mods);
  return { base, mult, final: Math.round(base * mult) };
}
