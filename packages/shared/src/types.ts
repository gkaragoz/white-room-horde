import { UNIVERSAL_CARDS } from './cards-universal';
import { CLASS_CARDS } from './cards-class';
/**
 * One player's input for one tick. Quantised so it is identical on every client and cheap to send
 * (docs/DESIGN.md section 8: ~6 bytes per player per tick).
 */
export interface PlayerInput {
  /** Move direction, -127..127 per axis (sim x right, sim y forward). */
  moveX: number;
  moveY: number;
  /** Aim angle, 0..65535 maps to 0..2*pi. */
  aim: number;
  /** Bit flags, see Buttons. */
  buttons: number;
  /** Distance to the cursor in quarter units (0 = not given: grenades fly their normal range). */
  aimDist?: number;
  /** Weapon choice: 0 = none, otherwise the index in WEAPON_IDS plus one (a click on the weapon list). */
  wsel?: number;
  /** Direction the grenade is thrown (same scale as `aim`); defaults to `aim`. Auto-aim moves `aim`, the cursor keeps `gAim`. */
  gAim?: number;
  /** Drone choice: 0 = no change, 1..7 = switch the active drone to that type (DRONE_TYPES index + 1). */
  dsel?: number;
}

export const Buttons = {
  Fire: 1 << 0,
  Grenade: 1 << 1,
  Revive: 1 << 2,
  Reload: 1 << 3,
  Dash: 1 << 4,
  Card1: 1 << 5,
  Card2: 1 << 6,
  Card3: 1 << 7,
  /** The class ability (see abilities.ts in the sim). */
  Special: 1 << 8,
  /**
   * Set by the relay (never by a player: it strips the bit from what clients send) on the input of a member who is connected but silent.
   * A member with no connection has no input at all. Either way the player is away: the simulation protects them for a while.
   */
  Away: 1 << 9,
} as const;

export const NO_INPUT: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };

export type WeaponId = 'pistol' | 'smg' | 'ar' | 'shotgun' | 'hmg' | 'minigun' | 'sniper' | 'revolver' | 'mp' | 'dbl' | 'dmr' | 'flamer' | 'gl' | 'sword' | 'hammer' | 'railgun' | 'crossbow' | 'plasma' | 'rocket' | 'nailgun' | 'autoshotgun' | 'akimbo' | 'frostgun' | 'sawlauncher' | 'arcthrower';
export const WEAPON_IDS: readonly WeaponId[] = ['pistol', 'smg', 'ar', 'shotgun', 'hmg', 'minigun', 'sniper', 'revolver', 'mp', 'dbl', 'dmr', 'flamer', 'gl', 'sword', 'hammer', 'railgun', 'crossbow', 'plasma', 'rocket', 'nailgun', 'autoshotgun', 'akimbo', 'frostgun', 'sawlauncher', 'arcthrower'];
/** Room in the per-player weapon tables (time spent with each weapon): more than there are weapons, so a few more can be added. */
export const WEAPON_SLOTS = 32;
/** Classes that fight with a blade or a hammer and use no guns (class id index). */
export const MELEE_CLASSES: readonly number[] = [7, 8];

/**
 * Fixed order of the weapons from the weakest to the strongest (sustained damage and area, see balance.json). The number
 * keys 1-9 pick the first nine of them, Q walks up the list; the order never changes, so a key always means the same gun.
 */
export const WEAPON_RANK: readonly WeaponId[] = ['pistol', 'mp', 'shotgun', 'akimbo', 'nailgun', 'revolver', 'crossbow', 'dbl', 'smg', 'arcthrower', 'autoshotgun', 'ar', 'plasma', 'frostgun', 'flamer', 'sniper', 'dmr', 'sawlauncher', 'hmg', 'gl', 'rocket', 'minigun', 'railgun', 'sword', 'hammer'];
/** WEAPON_RANK as indices into WEAPON_IDS. */
export const RANK_INDEX: readonly number[] = WEAPON_RANK.map((id) => WEAPON_IDS.indexOf(id));
/** Position of a weapon (index into WEAPON_IDS) in the ranking, 0 = weakest. */
export const RANK_OF: readonly number[] = WEAPON_IDS.map((id) => WEAPON_RANK.indexOf(id));

export type EnemyType = 'grunt' | 'runner' | 'tank' | 'exploder' | 'spitter' | 'shielder' | 'spawner' | 'crawler' | 'leaper' | 'bloater' | 'screamer' | 'acider' | 'rammer' | 'flamer' | 'mortar' | 'sledge' | 'lamper' | 'blinker' | 'marksman' | 'reviver' | 'magnetar' | 'pouncer' | 'hurler' | 'grabber' | 'spiker' | 'shocker' | 'brood' | 'trapper' | 'warcaller' | 'chopper' | 'quaker';
/** Index in this array is the numeric type stored in the sim and used by the renderer. */
export const ENEMY_TYPES: readonly EnemyType[] = ['grunt', 'runner', 'tank', 'exploder', 'spitter', 'shielder', 'spawner', 'crawler', 'leaper', 'bloater', 'screamer', 'acider', 'rammer', 'flamer', 'mortar', 'sledge', 'lamper', 'blinker', 'marksman', 'reviver', 'magnetar', 'pouncer', 'hurler', 'grabber', 'spiker', 'shocker', 'brood', 'trapper', 'warcaller', 'chopper', 'quaker'];

/** Enemy animation state (eState). */
export const EnemyState = { Move: 0, Attack: 1, Spawn: 2 } as const;

/** Player life cycle (pState). */
export const PlayerState = { Alive: 0, Downed: 1, Dead: 2 } as const;

/**
 * The card pool (docs/DESIGN.md section 9). Index = card id in the sim and in the offer. TEAM_CARDS help everybody,
 * every other card only the character that picked it. Art for each card lives in packages/client/public/cards/<id>.png.
 */
const BASE_CARD_IDS = [
  // team
  'damage', 'rate', 'speed', 'hp', 'pierce', 'arsenal', 'heal', 'ammo', 'grenades', 'medic', 'magnet', 'luck', 'scholar', 'blast', 'quickhands', 'roll', 'armor', 'crit',
  // personal
  'sharp', 'sprint', 'bulk', 'vampire', 'tempo', 'marksman', 'ironskin',
  'regen', 'thorns', 'shock', 'volatile', 'frost', 'scavenger', 'adrenaline', 'barrier', 'secondwind', 'rage',
  // appended last so the ids of the older cards (and the offers they roll) do not move
  'drone',
] as const;
export type CardId = (typeof BASE_CARD_IDS)[number] | (typeof UNIVERSAL_CARDS)[number]['id'] | (typeof CLASS_CARDS)[number]['id'];
/** All cards: the first 36 never move (offers and saves use the index); the 50 universal cards follow. */
export const CARD_IDS: readonly CardId[] = [...BASE_CARD_IDS, ...UNIVERSAL_CARDS.map((c) => c.id), ...CLASS_CARDS.map((c) => c.id)];
/** The few cards that help the whole squad; they show up on the info bar with the name of whoever took them. */
export const TEAM_CARDS: readonly string[] = ['heal', 'grenades', 'luck'];
/** Cards that only help the character that picked them: all the others. */
export const PERSONAL_CARDS: readonly string[] = CARD_IDS.filter((id) => !TEAM_CARDS.includes(id));
/** 0 common, 1 rare, 2 epic: how often a card is offered and how its frame looks. */
const BASE_RARITY: Record<(typeof BASE_CARD_IDS)[number], 0 | 1 | 2> = {
  damage: 0, rate: 0, speed: 0, hp: 0, heal: 0, ammo: 0, magnet: 0, sharp: 0, sprint: 0, bulk: 0,
  pierce: 1, grenades: 1, medic: 1, luck: 1, scholar: 1, roll: 1, quickhands: 1, armor: 1, tempo: 1, marksman: 1, ironskin: 1,
  arsenal: 2, blast: 2, crit: 2, vampire: 2,
  regen: 0, scavenger: 0, adrenaline: 0, thorns: 1, shock: 1, frost: 1, barrier: 1, rage: 1, volatile: 2, secondwind: 2,
  drone: 1,
};
export const CARD_RARITY = { ...BASE_RARITY, ...Object.fromEntries(UNIVERSAL_CARDS.map((c) => [c.id, c.rarity])), ...Object.fromEntries(CLASS_CARDS.map((c) => [c.id, c.rarity])) } as Record<CardId, 0 | 1 | 2>;
/** Who may be offered a card: a mask over the class ids (bit n = class n may). */
export const ALL_CLASSES = 0x1ff;
/** The classes that shoot (bullets and magazines) and the two that only swing. */
export const RANGED_MASK = 0x7f;
export const MELEE_MASK = 0x180;
const MASK_OF = { 1: RANGED_MASK, 2: MELEE_MASK, 3: ALL_CLASSES } as const;
export const CARD_CLASS = {
  ...Object.fromEntries(BASE_CARD_IDS.map((id) => [id, ALL_CLASSES])),
  ...Object.fromEntries(['pierce', 'marksman', 'quickhands', 'grenades', 'arsenal', 'ammo', 'scavenger'].map((id) => [id, RANGED_MASK])),
  ...Object.fromEntries(UNIVERSAL_CARDS.map((c) => [c.id, MASK_OF[c.cls]])),
  ...Object.fromEntries(CLASS_CARDS.map((c) => [c.id, 1 << c.cls])),
} as Record<CardId, number>;
/** Offer weights per rarity. */
export const RARITY_WEIGHT: readonly number[] = [6, 3, 1];

/** Pickup kinds (kType). */
export const PickupType = { Ammo: 0, Health: 1, Grenade: 2, Weapon: 3, Shield: 4, Haste: 5, Quad: 6, Nuke: 7, Freeze: 8, Drone: 9 } as const;

/** The drone companions (index = type id in the sim, +1 in pDrone and in PlayerInput.dsel). Models: public/models/drones/drone_<id>.glb. */
export const DRONE_TYPES = ['healer', 'cryo', 'rocket', 'gun', 'twin', 'tesla', 'collector'] as const;
export type DroneType = (typeof DRONE_TYPES)[number];
/** Levels a drone can reach, and how many levels make one power-up tier. */
export const DRONE_MAX_LEVEL = 30;
export const DRONE_TIER_LEVELS = 5;

/** Slots of the per-player perk array (pPerk[slot * PERKS + PERK.x]): class passives, card effects and timers. */
export const PERK = {
  Regen: 0, Aura: 1, Thorns: 2, Shock: 3, Volatile: 4, Frost: 5, Scav: 6, Rage: 7, Second: 8, ReviveRate: 9, DashRate: 10, Blast: 11,
  ShieldMax: 12, Shield: 13, ShieldCd: 14, HurtT: 15, Class: 16, Kills: 17, Haste: 18, Quad: 19, Adren: 20, Damage: 21, AdrenCard: 22,
} as const;
export const PERKS = 24;

/** Slots of the per-player statistics (pStat[slot * STATS + STAT.x]): what the game-over screen tells about a run. */
export const STAT = {
  DamageTaken: 0, Healed: 1, Crits: 2, MaxHit: 3, Shots: 4, Hits: 5, Swings: 6, Barrels: 7, Revives: 8, Pickups: 9,
  Dashes: 10, Abilities: 11, Grenades: 12, Distance: 13, AliveTicks: 14, BossKills: 15, Downs: 16, EliteKills: 17,
} as const;
export const STATS = 20;

/** Classes a player can pick in the lobby (index = class id in the sim and on the wire). */
export const CLASS_IDS = ['soldier', 'medic', 'heavy', 'scout', 'demolisher', 'ranger', 'berserker', 'swordsman', 'hammerer'] as const;
export type ClassId = (typeof CLASS_IDS)[number];
