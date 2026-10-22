import { MAPS } from './constants';
import { CLASS_CARDS } from './cards-class';
import { MODS } from './mods';
import { DRONE_TYPES, CLASS_IDS, CARD_IDS, PickupType, WEAPON_IDS, type CardId, type WeaponId } from './types';
import { MAX_LEVEL, TRACK, PRESSURE_PERMILLE, XP_FOR_LEVEL, type TrackItem } from './track';

export { MAX_LEVEL, TRACK, PRESSURE_PERMILLE, XP_FOR_LEVEL, XP_REFERENCE_RUN } from './track';
export type { TrackItem, TrackCategory } from './track';

/** The elites by their id in the simulation (`ELITE` in sim/features.ts); bit n of an elite mask is id n. */
export const ELITE_NAMES = ['', 'Giant', 'Swift', 'Splitter', 'Volatile', 'Regen', 'Armored', 'Berserk', 'Vampiric', 'Toxic', 'Phantom', 'Warded'] as const;

/** Weapons that are never locked: the starting pair, the three that drop from the first floor and the two class melee weapons. */
const CORE_WEAPONS: readonly WeaponId[] = ['pistol', 'smg', 'ar', 'shotgun', 'revolver', 'sword', 'hammer'];
/** The pickups that exist from the first minute; the power-ups and the drone come from the track. */
const CORE_PICKUPS: readonly number[] = [PickupType.Ammo, PickupType.Health, PickupType.Grenade, PickupType.Weapon];
const CORE_CARDS: readonly CardId[] = ['damage', 'rate', 'speed', 'hp', 'heal', 'ammo', 'magnet', 'sharp', 'sprint', 'bulk', 'regen', 'scavenger', 'adrenaline'];

/** The base and universal card packs, in the order the track opens them. */
const SHARED_PACKS: Readonly<Record<string, readonly CardId[]>> = {
  'B-R1': ['pierce', 'grenades', 'medic', 'luck', 'scholar', 'drone'],
  'U-C1': ['glasscannon', 'padding', 'lightfoot', 'snack', 'hoarder', 'quickstep', 'bookworm'],
  'B-R2': ['roll', 'quickhands', 'armor', 'tempo', 'marksman'],
  'U-C2': ['steadyhands', 'bruiser', 'patience', 'grit', 'scrappile', 'sprinter', 'itchytrigger'],
  'B-R3': ['ironskin', 'thorns', 'shock', 'frost', 'barrier', 'rage'],
  'U-C3': ['stout', 'luckypenny', 'helpinghand', 'shortfuse', 'peptalk', 'tinker'],
  'U-R1': ['overclock', 'heavyhitter', 'reinforced', 'lifeline', 'sharpeyes', 'windrunner', 'mender'],
  'B-E1': ['blast', 'crit', 'vampire'],
  'U-R2': ['magnetic', 'prospector', 'grenadepouch', 'forcefield', 'spikedarmor', 'quickstudy', 'fieldmedic'],
  'U-R3': ['dashmaster', 'demolition', 'riskreward', 'stalwart', 'armorpiercer', 'rapidreload'],
  'B-E2': ['volatile', 'secondwind', 'arsenal'],
  'U-E1': ['juggernaut', 'executioner', 'blitz', 'bloodthirst', 'fortress'],
  'U-E2': ['chainreaction', 'treasurehunter', 'sage', 'phantom', 'titan'],
};

/**
 * Every card pack by name: the Core pack, the 13 shared packs, and for each class a basic pack (its common cards) and an
 * advanced pack (rare and epic). A pack opens as a whole.
 */
export const CARD_PACKS: Readonly<Record<string, readonly CardId[]>> = (() => {
  const packs: Record<string, readonly CardId[]> = { core: CORE_CARDS, ...SHARED_PACKS };
  CLASS_IDS.forEach((cls, n) => {
    const own = CLASS_CARDS.filter((c) => c.cls === n);
    packs[`${cls}:basic`] = own.filter((c) => c.rarity === 0).map((c) => c.id);
    packs[`${cls}:adv`] = own.filter((c) => c.rarity > 0).map((c) => c.id);
  });
  return packs;
})();

/** Everything a room may use at a meta level. Masks are bit n = index n of the list named in each field. */
export interface Pool {
  readonly level: number;
  /** Bit n = `WEAPON_IDS[n]` may drop, be a starting weapon or be given by a card. */
  readonly weapons: number;
  /** Bit n = `DRONE_TYPES[n]` may be given. */
  readonly drones: number;
  /** Bit n = elite id n (`ELITE_NAMES`) may be rolled. */
  readonly elites: number;
  /** Bit n = `PickupType` n may drop. */
  readonly powerups: number;
  /** Bit n = `MAPS[n]` may be picked. */
  readonly arenas: number;
  /** Bit n = `CLASS_IDS[n]` may be played (the achievement classes are not here: the profile adds them). */
  readonly classes: number;
  /** Bit n = `MODS[n]` may be chosen. */
  readonly mods: number;
  /** `cards[n]` = `CARD_IDS[n]` may be offered. Class filtering still applies on top. */
  readonly cards: readonly boolean[];
}

const index = (list: readonly string[], name: string, what: string): number => {
  const n = list.indexOf(name);
  if (n < 0) throw new Error(`track: unknown ${what} "${name}"`);
  return n;
};
const ARENA_IDS = MAPS.map((m) => m.id);
const MOD_IDS = MODS.map((m) => m.id as string);
const ELITES = ELITE_NAMES as readonly string[];
const WEAPONS = WEAPON_IDS as readonly string[];
const DRONES = DRONE_TYPES as readonly string[];
const CLASSES = CLASS_IDS as readonly string[];
const CARD_INDEX = new Map<string, number>(CARD_IDS.map((id, n) => [id, n]));

/** The bit a track item sets in its category's mask, or -1 for a category with no mask (cosmetics, card packs). */
function bitOf(item: TrackItem): number {
  switch (item.cat) {
    case 'weapon': return index(WEAPONS, item.name, 'weapon');
    case 'drone': return index(DRONES, item.name, 'drone');
    case 'elite': return index(ELITES, item.name, 'elite');
    case 'powerup': return PickupType[({ shield: 'Shield', haste: 'Haste', quad: 'Quad', freeze: 'Freeze', nuke: 'Nuke' } as const)[item.name as 'shield']];
    case 'arena': return index(ARENA_IDS, item.name, 'arena');
    case 'class': return index(CLASSES, item.name, 'class');
    case 'mod': return index(MOD_IDS, item.name, 'mod');
    default: return -1;
  }
}

/** The classes that open by achievement, not by level: their basic cards come with the class, so they are never locked here. */
const ACHIEVEMENT_CLASSES = CLASS_IDS.filter((c) => c !== 'soldier' && !TRACK.some((i) => i.cat === 'class' && i.name === c));

const pools: Pool[] = [];
function build(level: number): Pool {
  let weapons = 0;
  let drones = 0;
  let elites = 0;
  let powerups = 0;
  let arenas = 1 << index(ARENA_IDS, 'warehouse', 'arena');
  let classes = 1 << index(CLASSES, 'soldier', 'class');
  let mods = 0;
  const cards = new Array<boolean>(CARD_IDS.length).fill(false);
  for (const id of CORE_WEAPONS) weapons |= 1 << index(WEAPONS, id, 'weapon');
  for (const p of CORE_PICKUPS) powerups |= 1 << p;
  const open = (ids: readonly CardId[]) => ids.forEach((id) => (cards[CARD_INDEX.get(id)!] = true));
  open(CORE_CARDS);
  for (const c of ACHIEVEMENT_CLASSES) open(CARD_PACKS[`${c}:basic`]!);
  for (const item of TRACK) {
    if (item.level > level) continue;
    if (item.cat === 'pack') {
      const pack = CARD_PACKS[item.name];
      if (!pack) throw new Error(`track: unknown card pack "${item.name}"`);
      open(pack);
      continue;
    }
    const bit = bitOf(item);
    if (bit < 0) continue;
    const m = 1 << bit;
    if (item.cat === 'weapon') weapons |= m;
    else if (item.cat === 'drone') drones |= m;
    else if (item.cat === 'elite') elites |= m;
    else if (item.cat === 'powerup') powerups |= m;
    else if (item.cat === 'arena') arenas |= m;
    else if (item.cat === 'class') classes |= m;
    else if (item.cat === 'mod') mods |= m;
  }
  return { level, weapons, drones, elites, powerups, arenas, classes, mods, cards };
}

/** The pool of a meta level, clamped to 1..MAX_LEVEL. Built once per level. */
export function poolAt(level: number): Pool {
  const l = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level) || 1));
  return (pools[l] ??= build(l));
}

/** Enemy pressure of a meta level in thousandths (450 at level 1, 1000 from level 60). */
export function pressureAt(level: number): number {
  return PRESSURE_PERMILLE[Math.min(MAX_LEVEL, Math.max(1, Math.floor(level) || 1))]!;
}

/** The level a total XP reaches: 1..MAX_LEVEL (XP beyond the last threshold keeps counting but the level stays). */
export function levelFromXp(xp: number): number {
  let lo = 1;
  let hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (XP_FOR_LEVEL[mid]! <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Total XP needed to reach a level (0 for level 1). */
export function xpForLevel(level: number): number {
  return XP_FOR_LEVEL[Math.min(MAX_LEVEL, Math.max(1, Math.floor(level) || 1))]!;
}

/** A run shorter than this gives no XP. */
export const MIN_XP_RUN_SECONDS = 15;

/** XP a run is worth: a tenth of the team score. */
export function runXp(teamScore: number): number {
  return Math.max(0, Math.round(teamScore / 10));
}
