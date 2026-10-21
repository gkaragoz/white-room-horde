import { MODS } from '@wrh/shared';
import type { World } from './state';

/** What the chosen difficulty multipliers add up to: factors that are 1 (or 0 / false) when nothing is chosen. */
export interface ModFx {
  enemyHp: number;
  enemyDamage: number;
  enemyCount: number;
  playerSpeed: number;
  playerHp: number;
  xpNeed: number;
  loot: number;
  enemySpeed: number;
  eliteChance: number;
  noHealthDrops: boolean;
  noGrenades: boolean;
  playerRate: number;
  playerDamage: number;
  areaMul: number;
  bossHp: number;
  lateMul: number;
  cardSeconds: number;
  downedMul: number;
  enemyCooldown: number;
  playerReload: number;
}

const cache = new Map<number, ModFx>();

/** The effects of a set of mods (bit n = MODS[n]); the same set always gives the same object. */
export function modFx(mods: number): ModFx {
  let fx = cache.get(mods);
  if (fx) return fx;
  fx = { enemyHp: 1, enemyDamage: 1, enemyCount: 1, playerSpeed: 1, playerHp: 1, xpNeed: 1, loot: 1, enemySpeed: 1, eliteChance: 1, noHealthDrops: false, noGrenades: false, playerRate: 1, playerDamage: 1, areaMul: 1, bossHp: 1, lateMul: 1, cardSeconds: 1, downedMul: 1, enemyCooldown: 1, playerReload: 1 };
  const out = fx as unknown as Record<string, number | boolean>;
  for (let i = 0; i < MODS.length; i++) {
    if (((mods >> i) & 1) === 0) continue;
    for (const [k, v] of Object.entries(MODS[i]!.fx)) out[k] = typeof out[k] === 'boolean' ? Number(v) !== 0 : (out[k] as number) * v;
  }
  cache.set(mods, fx);
  return fx;
}

export const fxOf = (w: World): ModFx => modFx(w.mods);
