import { BALANCE, FloorPhase, MAX_PLAYERS, MISC, PickupType, PlayerState, TICK_RATE, WEAPON_IDS } from '@wrh/shared';
import { poolOf } from './mods';
import { spawnPickup } from './pickups';
import type { World } from './state';

/** The guaranteed discovery arrives by the end of the first floor, or after this many seconds if the floor takes longer. */
const CRATE_SECONDS = 60;

/** Guns the room has open that this player has never met, as WEAPON_IDS indices. */
function unmetGuns(w: World, s: number): number[] {
  const open = poolOf(w).weapons;
  const out: number[] = [];
  for (let i = 0; i < WEAPON_IDS.length; i++) {
    if (((open >> i) & 1) === 0 || ((w.pMetWeapons[s]! >> i) & 1) !== 0) continue;
    if (!BALANCE.weapons[WEAPON_IDS[i]!]!.melee) out.push(i);
  }
  return out;
}

/**
 * A run in which the pool holds a weapon its player has not met yet gets one crate of such a weapon: at the end of the first
 * floor, or after a minute, whichever is first. Decided once per run (a player who has met everything needs none).
 */
export function updateDiscovery(w: World): void {
  if (w.crateDone) return;
  const clearing = w.wave === 1 && w.misc[MISC.Phase] === FloorPhase.Cleared;
  if (!(clearing || w.wave > 1 || w.tick >= CRATE_SECONDS * TICK_RATE)) return;
  w.crateDone = 1;
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s] || w.pState[s] === PlayerState.Dead) continue;
    const fresh = unmetGuns(w, s);
    if (!fresh.length) continue;
    const gun = fresh[w.rng.int(fresh.length)]!;
    spawnPickup(w, PickupType.Weapon, w.pX[s]! + 1.2, w.pY[s]!, gun, w.pLayer[s]!);
    return;
  }
}
