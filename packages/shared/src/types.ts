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
} as const;

export const NO_INPUT: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };

export type WeaponId = 'pistol' | 'smg' | 'ar' | 'shotgun' | 'hmg' | 'minigun' | 'sniper';
export const WEAPON_IDS: readonly WeaponId[] = ['pistol', 'smg', 'ar', 'shotgun', 'hmg', 'minigun', 'sniper'];
