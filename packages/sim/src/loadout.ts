import { BALANCE, RANK_INDEX, RANK_OF, WEAPON_IDS } from '@wrh/shared';
import type { World } from './state';

const NW = WEAPON_IDS.length;
const PISTOL = WEAPON_IDS.indexOf('pistol');
const stats = (weapon: number) => BALANCE.weapons[WEAPON_IDS[weapon]!]!;

const SWORD = WEAPON_IDS.indexOf('sword');
const HAMMER = WEAPON_IDS.indexOf('hammer');
const isGun = (weapon: number): boolean => !stats(weapon).melee;

/** A blade or hammer fighter: carries no guns, so crates of guns and ammo mean nothing to it. */
export function isMelee(w: World, slot: number): boolean {
  return owns(w, slot, SWORD) || owns(w, slot, HAMMER);
}

export function owns(w: World, slot: number, weapon: number): boolean {
  return ((w.pOwned[slot]! >> weapon) & 1) === 1;
}

/** Can this weapon be fired (or reloaded) right now? Infinite reserve, a round in the magazine or a reserve are enough. */
export function usable(w: World, slot: number, weapon: number): boolean {
  const st = stats(weapon);
  if (st.ammo < 0) return true;
  if (weapon === w.pWeapon[slot]) return w.pMag[slot]! > 0 || w.pAmmo[slot]! > 0;
  return w.pInvMag[slot * NW + weapon]! > 0 || w.pInvAmmo[slot * NW + weapon]! > 0;
}

/** Put a weapon in a player's hands: full magazine, full reserve (reserve is -1 for weapons with infinite ammo). */
export function equipWeapon(w: World, slot: number, weaponIndex: number): void {
  const st = stats(weaponIndex);
  w.pWeapon[slot] = weaponIndex;
  w.pMag[slot] = st.mag;
  w.pAmmo[slot] = st.ammo; // reserve outside the magazine
  w.pReload[slot] = 0;
  w.pCooldown[slot] = 0;
}

/** Write the live magazine and reserve of the weapon in the hands back to the inventory. */
function stash(w: World, slot: number): void {
  const cur = w.pWeapon[slot]!;
  w.pInvMag[slot * NW + cur] = w.pMag[slot]!;
  w.pInvAmmo[slot * NW + cur] = w.pAmmo[slot]!;
}

/** A fresh loadout: the chosen weapon in the hands, a pistol next to it; both are the player's for the rest of the run. */
export function equipLoadout(w: World, slot: number, weaponIndex: number, only = false): void {
  w.pOwned[slot] = only ? 1 << weaponIndex : (1 << weaponIndex) | (1 << PISTOL);
  for (let i = 0; i < NW; i++) {
    const st = stats(i);
    w.pInvMag[slot * NW + i] = st.mag;
    w.pInvAmmo[slot * NW + i] = st.ammo;
  }
  equipWeapon(w, slot, weaponIndex);
}

/** Take a weapon of the inventory into the hands (it has to be owned and usable). Returns true when something changed. */
export function selectWeapon(w: World, slot: number, weapon: number, auto = false): boolean {
  if (weapon === w.pWeapon[slot] || weapon < 0 || weapon >= NW || !owns(w, slot, weapon) || !usable(w, slot, weapon)) return false;
  stash(w, slot);
  w.pWeapon[slot] = weapon;
  w.pMag[slot] = w.pInvMag[slot * NW + weapon]!;
  w.pAmmo[slot] = w.pInvAmmo[slot * NW + weapon]!;
  w.pReload[slot] = 0;
  w.pCooldown[slot] = 0.25; // a short draw time so switching is not a free reload
  w.events.push({ type: 'weaponSwitch', slot, weapon, auto });
  return true;
}

/** The weapon at a rank (1 = weakest) as an index into WEAPON_IDS, or -1. */
export function weaponAtRank(rank: number): number {
  return RANK_INDEX[rank - 1] ?? -1;
}

/** The number key / rank selection: only an owned weapon that can still shoot. */
export function selectByRank(w: World, slot: number, rank: number): boolean {
  return selectWeapon(w, slot, weaponAtRank(rank));
}

/** Q: the next stronger usable weapon, wrapping from the strongest to the weakest; empty ones are skipped. */
export function selectNext(w: World, slot: number): boolean {
  const here = RANK_OF[w.pWeapon[slot]!]!;
  for (let d = 1; d < NW; d++) {
    const idx = RANK_INDEX[(here + d) % NW]!;
    if (owns(w, slot, idx) && usable(w, slot, idx)) return selectWeapon(w, slot, idx);
  }
  return false;
}

/** An unusable weapon never stays in the hands: the nearest usable one by rank takes over (one rank lower first, then higher). */
export function ensureUsable(w: World, slot: number): void {
  const cur = w.pWeapon[slot]!;
  if (usable(w, slot, cur)) return;
  const here = RANK_OF[cur]!;
  for (let d = 1; d < NW; d++) {
    for (const r of [here - d, here + d]) {
      if (r < 0 || r >= NW) continue;
      const idx = RANK_INDEX[r]!;
      if (owns(w, slot, idx) && usable(w, slot, idx)) {
        selectWeapon(w, slot, idx, true);
        return;
      }
    }
  }
}

/** A crate or a card gives a weapon for good; getting one that is already owned refills it. It goes to the inventory, not into the hands. */
export function giveWeapon(w: World, slot: number, weapon: number): void {
  const fresh = !owns(w, slot, weapon);
  w.pOwned[slot] = w.pOwned[slot]! | (1 << weapon);
  const st = stats(weapon);
  if (weapon === w.pWeapon[slot]) {
    w.pMag[slot] = st.mag;
    w.pAmmo[slot] = st.ammo;
  } else {
    w.pInvMag[slot * NW + weapon] = st.mag;
    w.pInvAmmo[slot * NW + weapon] = st.ammo;
  }
  w.events.push({ type: 'weaponGet', slot, weapon, fresh });
}

/** Refill the magazine and reserve of every weapon the player owns (ammo crate, ammo card). */
export function refillAll(w: World, slot: number): void {
  for (let i = 0; i < NW; i++) {
    if (!owns(w, slot, i)) continue;
    const st = stats(i);
    if (i === w.pWeapon[slot]) {
      w.pMag[slot] = st.mag;
      w.pAmmo[slot] = st.ammo;
    } else {
      w.pInvMag[slot * NW + i] = st.mag;
      w.pInvAmmo[slot * NW + i] = st.ammo;
    }
  }
}

/** Would an ammo crate add anything: some owned weapon with a finite reserve is below its cap or magazine. */
export function ammoNeeded(w: World, slot: number): boolean {
  for (let i = 0; i < NW; i++) {
    if (!owns(w, slot, i)) continue;
    const st = stats(i);
    if (st.ammo < 0) continue;
    const live = i === w.pWeapon[slot];
    const mag = live ? w.pMag[slot]! : w.pInvMag[slot * NW + i]!;
    const ammo = live ? w.pAmmo[slot]! : w.pInvAmmo[slot * NW + i]!;
    if (ammo < st.ammo || mag < st.mag) return true;
  }
  return false;
}

/** True when the player carries a finite-ammo weapon that is running low (loot leans toward ammo then). */
export function ammoLow(w: World, slot: number): boolean {
  for (let i = 0; i < NW; i++) {
    if (!owns(w, slot, i)) continue;
    const st = stats(i);
    if (st.ammo < 0) continue;
    const ammo = i === w.pWeapon[slot] ? w.pAmmo[slot]! : w.pInvAmmo[slot * NW + i]!;
    if (ammo < st.ammo * 0.25) return true;
  }
  return false;
}

/** The next stronger weapon the player does not own yet (wraps to the weakest missing one), or -1 when they have them all. */
export function nextMissing(w: World, slot: number): number {
  if (isMelee(w, slot)) return -1;
  const top = Math.max(...RANK_INDEX.map((idx, r) => (owns(w, slot, idx) ? r : -1)));
  for (let d = 1; d <= NW; d++) {
    const idx = RANK_INDEX[(top + d) % NW]!;
    if (isGun(idx) && !owns(w, slot, idx)) return idx;
  }
  return -1;
}
