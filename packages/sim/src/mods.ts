import { MAX_LEVEL, MODS, MOD_FX_DEFAULTS, poolAt, pressureAt, type ModFx, type Pool } from '@wrh/shared';
import type { World } from './state';

export type { ModFx };

const cache = new Map<number, ModFx>();

/**
 * The effects of a set of mods (bit n = MODS[n]) at a meta level; the same set and level always give the same object.
 * Below the top levels enemy pressure lowers enemy damage, health and numbers on top of the mods (integer table, no powers).
 */
export function modFx(mods: number, level = MAX_LEVEL): ModFx {
  const key = level * 0x1000000 + mods;
  let fx = cache.get(key);
  if (fx) return fx;
  const out: Record<keyof ModFx, number | boolean> = { ...MOD_FX_DEFAULTS };
  for (let i = 0; i < MODS.length; i++) {
    if (((mods >> i) & 1) === 0) continue;
    for (const [k, v] of Object.entries(MODS[i]!.fx) as [keyof ModFx, number][])
      out[k] = typeof out[k] === 'boolean' ? Number(v) !== 0 : (out[k] as number) * v;
  }
  const permille = pressureAt(level);
  if (permille < 1000) {
    const p = permille / 1000;
    (out.enemyDamage as number) *= p;
    (out.enemyHp as number) *= 0.6 + 0.4 * p;
    (out.enemyCount as number) *= 0.7 + 0.3 * p;
  }
  fx = out as ModFx;
  cache.set(key, fx);
  return fx;
}

export const fxOf = (w: World): ModFx => modFx(w.mods, w.metLevel);

/** What the room may use at its meta level: weapons, drones, cards, elites and power-ups. */
export const poolOf = (w: World): Pool => poolAt(w.metLevel);
