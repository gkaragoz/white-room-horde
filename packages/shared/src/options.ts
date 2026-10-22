import { MAP_COUNT } from './constants';
import { Difficulty } from './difficulty';

/** What a game is set up with besides who plays: the arena and the Difficulty. The one description used by the room, the menu and a solo start. */
export interface GameOptions {
  /** Arena layout index, or -1 for a random one when the game starts. */
  map: number;
  /** The chosen Difficulty: a bit mask over the multipliers (0 = the normal game). */
  mods: number;
}

export const DEFAULT_GAME_OPTIONS: Readonly<GameOptions> = { map: 0, mods: 0 };

/** An arena index this build has, or -1 (random). */
export function isValidMap(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= -1 && v < MAP_COUNT;
}

/** `base` with every valid field of `patch` applied; anything missing or not understood leaves the old value (so untrusted input is safe to pass). */
export function withOptions(
  base: Readonly<GameOptions>,
  patch: Partial<Record<keyof GameOptions, unknown>>,
): GameOptions {
  return {
    map: isValidMap(patch.map) ? patch.map : base.map,
    mods: Difficulty.isValid(patch.mods) ? patch.mods : base.mods,
  };
}

/** The arena a game really starts on: the chosen one, or a random one for -1. */
export function resolveMap(map: number, random: () => number = Math.random): number {
  return map >= 0 ? map : Math.floor(random() * MAP_COUNT);
}
