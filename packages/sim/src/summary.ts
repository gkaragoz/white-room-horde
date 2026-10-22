import {
  CLASS_IDS,
  Difficulty,
  MAX_PLAYERS,
  PERK,
  PERKS,
  STAT,
  STATS,
  WEAPON_IDS,
  WEAPON_SLOTS,
} from '@wrh/shared';
import { runScore } from './score';
import type { World } from './state';

/** Named numbers of a run, in the keys the achievement table (shared/achievements.ts) uses as `stat`. */
export type Totals = Record<string, number>;

/** What one character's run came to: the numbers and the special conditions the achievements are checked against. */
export interface RunSummary {
  totals: Totals;
  flags: Record<string, boolean>;
}

/** Sum up one character's run in `world` (the world is not changed). */
export function runSummary(world: World, slot: number): RunSummary {
  const st = (k: number): number => world.pStat[slot * STATS + k]!;
  const perk = (k: number): number => world.pPerk[slot * PERKS + k]!;
  const seconds = st(STAT.AliveTicks) / 30;
  const cardKinds = world.pCards.length / MAX_PLAYERS;
  let cards = 0;
  for (let i = 0; i < cardKinds; i++) cards += world.pCards[slot * cardKinds + i]!;
  const mods = world.mods;
  const totals: Totals = {
    kills: perk(PERK.Kills),
    runKills: perk(PERK.Kills),
    damage: perk(PERK.Damage),
    bosses: st(STAT.BossKills),
    floor: world.wave,
    maxHit: st(STAT.MaxHit),
    crits: st(STAT.Crits),
    shots: st(STAT.Shots),
    revives: st(STAT.Revives),
    distance: st(STAT.Distance),
    dashes: st(STAT.Dashes),
    abilities: st(STAT.Abilities),
    grenades: st(STAT.Grenades),
    barrels: st(STAT.Barrels),
    pickups: st(STAT.Pickups),
    healed: st(STAT.Healed),
    taken: st(STAT.DamageTaken),
    games: 1,
    seconds,
    level: world.pLevel[slot]!,
    cards,
    modsFloor5: world.wave >= 5 ? Difficulty.count(mods) : 0,
    score: runScore(world).final,
  };
  for (let i = 0; i < WEAPON_IDS.length; i++)
    totals[`wk:${WEAPON_IDS[i]}`] = world.pWpnKills[slot * WEAPON_SLOTS + i]!;
  const cls = perk(PERK.Class);
  for (let c = 0; c < CLASS_IDS.length; c++) totals[`floor:${c}`] = c === cls ? world.wave : 0;
  const pistolOnly = world.pOwned[slot] === 1 << WEAPON_IDS.indexOf('pistol');
  const flags: Record<string, boolean> = {
    untouchable: world.wave >= 5 && totals.taken! <= 50,
    quickDeath: seconds < 60,
    pistolOnly: pistolOnly && world.wave >= 10,
    fragileFloor8: Difficulty.has(mods, 'fragile') && world.wave >= 8,
    allMods: mods === Difficulty.ALL && world.wave >= 5,
    revive5: totals.revives! >= 5,
    barrels50: totals.barrels! >= 50,
    hourRun: seconds >= 3600,
    flawlessBosses: totals.bosses! >= 3 && st(STAT.Downs) === 0,
    cards100: cards >= 100,
  };
  return { totals, flags };
}
