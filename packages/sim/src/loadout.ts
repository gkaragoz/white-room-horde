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

const PISTOL = WEAPON_IDS.indexOf('pistol');

/** A fresh loadout: the chosen weapon in the hands and, unless that is the pistol itself, a pistol as the sidearm. */
export function equipLoadout(w: World, slot: number, weaponIndex: number): void {
  equipWeapon(w, slot, weaponIndex);
  w.pSel[slot] = 0;
  if (weaponIndex === PISTOL) {
    w.pStashW[slot] = -1;
  } else {
    const p = BALANCE.weapons.pistol;
    w.pStashW[slot] = PISTOL;
    w.pStashMag[slot] = p.mag;
    w.pStashAmmo[slot] = p.ammo;
  }
}

/** Take the main weapon (slot 0) or the sidearm (slot 1) into the hands. Returns true when something changed. */
export function selectSlot(w: World, slot: number, target: number, auto = false): boolean {
  if (w.pSel[slot] === target || w.pStashW[slot]! < 0) return false;
  const weapon = w.pWeapon[slot]!;
  const mag = w.pMag[slot]!;
  const ammo = w.pAmmo[slot]!;
  w.pWeapon[slot] = w.pStashW[slot]!;
  w.pMag[slot] = w.pStashMag[slot]!;
  w.pAmmo[slot] = w.pStashAmmo[slot]!;
  w.pStashW[slot] = weapon;
  w.pStashMag[slot] = mag;
  w.pStashAmmo[slot] = ammo;
  w.pSel[slot] = target;
  w.pReload[slot] = 0;
  w.pCooldown[slot] = 0.25; // a short draw time so switching is not a free reload
  w.events.push({ type: 'weaponSwitch', slot, weapon: w.pWeapon[slot]!, auto });
  return true;
}

/** A new main weapon (crate, arsenal card): it replaces the main slot, whichever one is in the hands. */
export function giveMainWeapon(w: World, slot: number, weaponIndex: number): void {
  if (w.pSel[slot] === 1) selectSlot(w, slot, 0);
  const hadSidearm = w.pStashW[slot]! >= 0;
  equipWeapon(w, slot, weaponIndex);
  if (weaponIndex === PISTOL) {
    if (hadSidearm) w.pStashW[slot] = -1;
  } else if (!hadSidearm) {
    const p = BALANCE.weapons.pistol;
    w.pStashW[slot] = PISTOL;
    w.pStashMag[slot] = p.mag;
    w.pStashAmmo[slot] = p.ammo;
  }
}

/** Refill the magazine and reserve of both weapons (ammo card). */
export function refillAll(w: World, slot: number): void {
  equipWeapon(w, slot, w.pWeapon[slot]!);
  if (w.pStashW[slot]! >= 0) {
    const st = BALANCE.weapons[WEAPON_IDS[w.pStashW[slot]!]!]!;
    w.pStashMag[slot] = st.mag;
    w.pStashAmmo[slot] = st.ammo;
  }
}

/** The main weapon (slot 0), whether it is in the hands or in the stash. */
export function mainWeapon(w: World, slot: number): number {
  return w.pSel[slot] === 0 ? w.pWeapon[slot]! : w.pStashW[slot]!;
}

/** Reserve ammo of the main weapon and its cap (-1 = infinite). Ammo crates fill the main weapon even while the sidearm is out. */
export function mainReserve(w: World, slot: number): number {
  return w.pSel[slot] === 0 ? w.pAmmo[slot]! : w.pStashAmmo[slot]!;
}

export function reserveMax(w: World, slot: number): number {
  return BALANCE.weapons[WEAPON_IDS[mainWeapon(w, slot)]!]!.ammo;
}

export function setMainReserve(w: World, slot: number, value: number): void {
  if (w.pSel[slot] === 0) w.pAmmo[slot] = value;
  else w.pStashAmmo[slot] = value;
}
