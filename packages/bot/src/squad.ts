import { CLASS_IDS, MAX_PLAYERS, type PlayerInput, type WeaponId } from '@wrh/shared';
import type { World } from '@wrh/sim';
import { Bot } from './bot';
import type { Skill } from './types';

/** First names for bots (a stable pool: the same slot always gets the same name for a seed). */
export const BOT_NAMES: readonly string[] = ['Ada', 'Bolt', 'Cinder', 'Dash', 'Echo', 'Flint', 'Gust', 'Halo', 'Ivy', 'Jinx', 'Koda', 'Lumen', 'Moxie', 'Nova', 'Orbit', 'Pixel'];

/** What a bot starts with. */
export interface BotLoadout {
  slot: number;
  name: string;
  cls: number;
  weapon: WeaponId;
}

/** The order in which bots take classes so a squad is balanced (a tank and a healer early, then damage, then the specialists). */
const CLASS_ORDER = ['heavy', 'medic', 'soldier', 'scout', 'ranger', 'demolisher', 'berserker', 'swordsman', 'hammerer'] as const;
const WEAPON_FOR: Record<string, WeaponId> = { heavy: 'smg', medic: 'smg', soldier: 'ar', scout: 'smg', ranger: 'ar', demolisher: 'shotgun', berserker: 'pistol', swordsman: 'pistol', hammerer: 'pistol' };

/**
 * The loadouts of `count` bots that fill the free slots, with classes from `allowed` (CLASS_IDS indices a player may use; default
 * all). Bots avoid the classes the humans in `taken` already play, while there are others to choose.
 */
export function botLoadouts(freeSlots: readonly number[], count: number, seed = 1, allowed: readonly number[] | null = null, taken: readonly number[] = []): BotLoadout[] {
  const order = CLASS_ORDER.map((c) => CLASS_IDS.indexOf(c)).filter((c) => !allowed || allowed.includes(c));
  const pool = order.length ? order : [0];
  const fresh = pool.filter((c) => !taken.includes(c));
  const ranked = [...fresh, ...pool.filter((c) => taken.includes(c))];
  const out: BotLoadout[] = [];
  for (let i = 0; i < Math.min(count, freeSlots.length, MAX_PLAYERS); i++) {
    const cls = ranked[i % ranked.length]!;
    out.push({ slot: freeSlots[i]!, name: BOT_NAMES[(i + seed) % BOT_NAMES.length]!, cls, weapon: WEAPON_FOR[CLASS_IDS[cls]!] ?? 'pistol' });
  }
  return out;
}

/** A group of bots, one per slot, driven together. */
export class Squad {
  private readonly bots = new Map<number, Bot>();

  constructor(slots: readonly number[], skill: Skill, seed = 1, humans: ReadonlySet<number> = new Set()) {
    for (const slot of slots) this.bots.set(slot, new Bot({ slot, skill, seed }, humans));
  }

  get slots(): number[] {
    return [...this.bots.keys()];
  }

  /** The inputs of every bot for this tick (slot -> input). Only bots whose slot is in the world and active play. */
  inputs(w: World): Map<number, PlayerInput> {
    const out = new Map<number, PlayerInput>();
    for (const [slot, bot] of this.bots) if (w.pActive[slot]) out.set(slot, bot.input(w));
    return out;
  }
}
