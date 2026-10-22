import { MODS, MOD_COUNT } from './mods';

/**
 * Difficulty: the set of multipliers a game is played with, kept as a bit mask (bit n is MODS[n]; 0 is the normal game).
 * This is the one place that knows how the mask is built, counted, checked and scored. The mask stays a plain number
 * everywhere it travels (the room protocol, the replay, the world), so none of those formats depend on this module.
 */
const IDS = MODS.map((m) => m.id as string);

export const Difficulty = {
  /** Every multiplier at once. */
  ALL: 2 ** MOD_COUNT - 1,

  /** The mask with only the multiplier `id` set. An unknown id throws, so a renamed multiplier fails at once instead of silently never matching. */
  bit(id: string): number {
    const i = IDS.indexOf(id);
    if (i < 0) throw new Error(`unknown difficulty multiplier "${id}"`);
    return 1 << i;
  },

  /** Is the multiplier `id` in the set? */
  has(mask: number, id: string): boolean {
    return (mask & Difficulty.bit(id)) !== 0;
  },

  /** The indices into MODS of the multipliers in the set, ascending. */
  indices(mask: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < MOD_COUNT; i++) if ((mask >> i) & 1) out.push(i);
    return out;
  },

  count(mask: number): number {
    return Difficulty.indices(mask).length;
  },

  /** The set with MODS[index] switched on or off. */
  toggle(mask: number, index: number): number {
    return mask ^ (1 << index);
  },

  /** Is `v` a mask this build understands (a whole number using only known multipliers)? */
  isValid(v: unknown): v is number {
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= Difficulty.ALL;
  },

  /** The score multiplier of the set: 1 with none, about 3.6 with all of them. */
  scoreMultiplier(mask: number): number {
    let sum = 0;
    for (const i of Difficulty.indices(mask)) sum += MODS[i]!.weight;
    return 1 + sum / 20;
  },
};
