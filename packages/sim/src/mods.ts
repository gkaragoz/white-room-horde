import { MODS, MOD_FX_DEFAULTS, type ModFx } from '@wrh/shared';
import type { World } from './state';

export type { ModFx };

const cache = new Map<number, ModFx>();

/** The effects of a set of mods (bit n = MODS[n]); the same set always gives the same object. */
export function modFx(mods: number): ModFx {
  let fx = cache.get(mods);
  if (fx) return fx;
  const out: Record<keyof ModFx, number | boolean> = { ...MOD_FX_DEFAULTS };
  for (let i = 0; i < MODS.length; i++) {
    if (((mods >> i) & 1) === 0) continue;
    for (const [k, v] of Object.entries(MODS[i]!.fx) as [keyof ModFx, number][])
      out[k] = typeof out[k] === 'boolean' ? Number(v) !== 0 : (out[k] as number) * v;
  }
  fx = out as ModFx;
  cache.set(mods, fx);
  return fx;
}

export const fxOf = (w: World): ModFx => modFx(w.mods);
