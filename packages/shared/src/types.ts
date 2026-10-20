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
} as const;

export const NO_INPUT: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };

export type WeaponId = 'pistol' | 'smg' | 'ar' | 'shotgun' | 'hmg' | 'minigun' | 'sniper' | 'revolver' | 'mp' | 'dbl' | 'dmr' | 'flamer' | 'gl';
export const WEAPON_IDS: readonly WeaponId[] = ['pistol', 'smg', 'ar', 'shotgun', 'hmg', 'minigun', 'sniper', 'revolver', 'mp', 'dbl', 'dmr', 'flamer', 'gl'];

export type EnemyType = 'grunt' | 'runner' | 'tank' | 'exploder' | 'spitter' | 'shielder' | 'spawner' | 'crawler' | 'leaper' | 'bloater' | 'screamer';
/** Index in this array is the numeric type stored in the sim and used by the renderer. */
export const ENEMY_TYPES: readonly EnemyType[] = ['grunt', 'runner', 'tank', 'exploder', 'spitter', 'shielder', 'spawner', 'crawler', 'leaper', 'bloater', 'screamer'];

/** Enemy animation state (eState). */
export const EnemyState = { Move: 0, Attack: 1, Spawn: 2 } as const;

/** Player life cycle (pState). */
export const PlayerState = { Alive: 0, Downed: 1, Dead: 2 } as const;

/**
 * The card pool (docs/DESIGN.md section 9). Index = card id in the sim and in the offer. Team cards help everybody,
 * personal cards only the player who picked them. Art for each card lives in packages/client/public/cards/<id>.png.
 */
export const CARD_IDS = [
  // team
  'damage', 'rate', 'speed', 'hp', 'pierce', 'arsenal', 'heal', 'ammo', 'grenades', 'medic', 'magnet', 'luck', 'scholar', 'blast', 'quickhands', 'roll', 'armor', 'crit',
  // personal
  'sharp', 'sprint', 'bulk', 'vampire', 'tempo', 'marksman', 'ironskin',
  'regen', 'thorns', 'shock', 'volatile', 'frost', 'scavenger', 'adrenaline', 'barrier', 'secondwind', 'rage',
] as const;
export type CardId = (typeof CARD_IDS)[number];
/** Cards that only help the player who picked them. */
export const PERSONAL_CARDS: readonly string[] = ['sharp', 'sprint', 'bulk', 'vampire', 'tempo', 'marksman', 'ironskin', 'regen', 'thorns', 'shock', 'volatile', 'frost', 'scavenger', 'adrenaline', 'barrier', 'secondwind', 'rage'];
/** 0 common, 1 rare, 2 epic: how often a card is offered and how its frame looks. */
export const CARD_RARITY: Record<CardId, 0 | 1 | 2> = {
  damage: 0, rate: 0, speed: 0, hp: 0, heal: 0, ammo: 0, magnet: 0, sharp: 0, sprint: 0, bulk: 0,
  pierce: 1, grenades: 1, medic: 1, luck: 1, scholar: 1, roll: 1, quickhands: 1, armor: 1, tempo: 1, marksman: 1, ironskin: 1,
  arsenal: 2, blast: 2, crit: 2, vampire: 2,
  regen: 0, scavenger: 0, adrenaline: 0, thorns: 1, shock: 1, frost: 1, barrier: 1, rage: 1, volatile: 2, secondwind: 2,
};
/** Offer weights per rarity. */
export const RARITY_WEIGHT: readonly number[] = [6, 3, 1];

/** Pickup kinds (kType). */
export const PickupType = { Ammo: 0, Health: 1, Grenade: 2, Weapon: 3, Shield: 4, Haste: 5, Quad: 6, Nuke: 7, Freeze: 8 } as const;

/** Slots of the per-player perk array (pPerk[slot * PERKS + PERK.x]): class passives, card effects and timers. */
export const PERK = {
  Regen: 0, Aura: 1, Thorns: 2, Shock: 3, Volatile: 4, Frost: 5, Scav: 6, Rage: 7, Second: 8, ReviveRate: 9, DashRate: 10, Blast: 11,
  ShieldMax: 12, Shield: 13, ShieldCd: 14, HurtT: 15, Class: 16, Kills: 17, Haste: 18, Quad: 19, Adren: 20, Damage: 21, AdrenCard: 22,
} as const;
export const PERKS = 24;

/** Classes a player can pick in the lobby (index = class id in the sim and on the wire). */
export const CLASS_IDS = ['soldier', 'medic', 'heavy', 'scout', 'demolisher', 'ranger', 'berserker'] as const;
export type ClassId = (typeof CLASS_IDS)[number];
