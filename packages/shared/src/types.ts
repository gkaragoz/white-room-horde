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

export type WeaponId = 'pistol' | 'smg' | 'ar' | 'shotgun' | 'hmg' | 'minigun' | 'sniper';
export const WEAPON_IDS: readonly WeaponId[] = ['pistol', 'smg', 'ar', 'shotgun', 'hmg', 'minigun', 'sniper'];

export type EnemyType = 'grunt' | 'runner' | 'tank' | 'exploder' | 'spitter' | 'shielder' | 'spawner';
/** Index in this array is the numeric type stored in the sim and used by the renderer. */
export const ENEMY_TYPES: readonly EnemyType[] = ['grunt', 'runner', 'tank', 'exploder', 'spitter', 'shielder', 'spawner'];

/** Enemy animation state (eState). */
export const EnemyState = { Move: 0, Attack: 1, Spawn: 2 } as const;

/** Player life cycle (pState). */
export const PlayerState = { Alive: 0, Downed: 1, Dead: 2 } as const;

/** Team upgrade cards offered on level up (index = card id). */
export const CARD_IDS = ['damage', 'rate', 'speed', 'hp', 'pierce', 'arsenal', 'heal'] as const;
export type CardId = (typeof CARD_IDS)[number];

/** Pickup kinds (kType). */
export const PickupType = { Ammo: 0, Health: 1, Grenade: 2 } as const;
