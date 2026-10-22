import { BALANCE, RANK_INDEX, WEAPON_IDS } from '@wrh/shared';
import type { World } from './state';
import { poolOf } from './mods';

const NW = WEAPON_IDS.length;
const PISTOL = WEAPON_IDS.indexOf('pistol');
const stats = (weapon: number) => BALANCE.weapons[WEAPON_IDS[weapon]!]!;

const SWORD = WEAPON_IDS.indexOf('sword');
const HAMMER = WEAPON_IDS.indexOf('hammer');
const isGun = (weapon: number): boolean => !stats(weapon).melee;

/** A blade or hammer fighter: carries no guns, so crates of guns mean nothing to it. */
export function isMelee(w: World, slot: number): boolean {
  return owns(w, slot, SWORD) || owns(w, slot, HAMMER);
}

export function owns(w: World, slot: number, weapon: number): boolean {
  return ((w.pOwned[slot]! >> weapon) & 1) === 1;
}

/** Put a weapon in a player's hands: full magazine, no reload running. Ammo is unlimited: only the magazine and the reload count. */
export function equipWeapon(w: World, slot: number, weaponIndex: number): void {
  const st = stats(weaponIndex);
  w.pWeapon[slot] = weaponIndex;
  w.pMag[slot] = st.mag;
  w.pReload[slot] = 0;
  w.pCooldown[slot] = 0;
}

/** Write the live magazine and reload progress of the weapon in the hands back to the inventory. */
function stash(w: World, slot: number): void {
  const cur = w.pWeapon[slot]!;
  w.pInvMag[slot * NW + cur] = w.pMag[slot]!;
  w.pInvReload[slot * NW + cur] = w.pReload[slot]!;
}

/** A fresh loadout: the chosen weapon in the hands, a pistol next to it; both are the player's for the rest of the run. */
export function equipLoadout(w: World, slot: number, weaponIndex: number, only = false): void {
  w.pOwned[slot] = only ? 1 << weaponIndex : (1 << weaponIndex) | (1 << PISTOL);
  for (let i = 0; i < NW; i++) {
    w.pInvMag[slot * NW + i] = stats(i).mag;
    w.pInvReload[slot * NW + i] = 0;
  }
  equipWeapon(w, slot, weaponIndex);
}

/**
 * Take a weapon of the inventory into the hands (it has to be owned). Every weapon keeps its own magazine and its own reload
 * progress: switching neither refills a magazine nor skips a reload that is running (the clock only runs for the weapon in the hands).
 * Returns true when something changed.
 */
export function selectWeapon(w: World, slot: number, weapon: number): boolean {
  if (weapon === w.pWeapon[slot] || weapon < 0 || weapon >= NW || !owns(w, slot, weapon)) return false;
  stash(w, slot);
  w.pWeapon[slot] = weapon;
  w.pMag[slot] = w.pInvMag[slot * NW + weapon]!;
  w.pReload[slot] = w.pInvReload[slot * NW + weapon]!;
  w.pCooldown[slot] = 0.25; // a short draw time
  w.events.push({ type: 'weaponSwitch', slot, weapon });
  return true;
}

/** A crate or a card gives a weapon for good; it goes to the inventory, not into the hands, with a full magazine. */
export function giveWeapon(w: World, slot: number, weapon: number): void {
  const fresh = !owns(w, slot, weapon);
  if (fresh) {
    w.pOwned[slot] = w.pOwned[slot]! | (1 << weapon);
    w.pInvMag[slot * NW + weapon] = stats(weapon).mag;
    w.pInvReload[slot * NW + weapon] = 0;
  }
  w.events.push({ type: 'weaponGet', slot, weapon, fresh });
}

/** The next stronger weapon the player does not own yet (wraps to the weakest missing one), or -1 when they have them all. */
export function nextMissing(w: World, slot: number): number {
  if (isMelee(w, slot)) return -1;
  const top = Math.max(...RANK_INDEX.map((idx, r) => (owns(w, slot, idx) ? r : -1)));
  for (let d = 1; d <= NW; d++) {
    const idx = RANK_INDEX[(top + d) % NW]!;
    if (isGun(idx) && ((poolOf(w).weapons >> idx) & 1) !== 0 && !owns(w, slot, idx)) return idx;
  }
  return -1;
}
