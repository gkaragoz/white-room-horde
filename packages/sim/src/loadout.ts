import { BALANCE, WEAPON_IDS } from '@wrh/shared';
import type { World } from './state';

/** Put a weapon in a player's hands: full magazine, full reserve (reserve is -1 for weapons with infinite ammo). */
export function equipWeapon(w: World, slot: number, weaponIndex: number): void {
  const stats = BALANCE.weapons[WEAPON_IDS[weaponIndex]!]!;
  w.pWeapon[slot] = weaponIndex;
  w.pMag[slot] = stats.mag;
  w.pAmmo[slot] = stats.ammo; // reserve outside the magazine
  w.pReload[slot] = 0;
  w.pCooldown[slot] = 0;
}

/** Reserve ammo cap of the weapon a player holds (-1 = infinite). */
export function reserveMax(w: World, slot: number): number {
  return BALANCE.weapons[WEAPON_IDS[w.pWeapon[slot]!]!]!.ammo;
}
