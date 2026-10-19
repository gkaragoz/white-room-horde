import { ARENA_HALF_H, ARENA_HALF_W, BALANCE, MAX_PICKUPS, MAX_PLAYERS, PickupType, PlayerState, TICK_DT, WEAPON_IDS } from '@wrh/shared';
import { clamp, cos, sin, sqrt } from './detmath';
import { equipWeapon, reserveMax } from './loadout';
import type { World } from './state';

export function spawnPickup(w: World, kind: number, x: number, y: number, data = 0): void {
  for (let i = 0; i < MAX_PICKUPS; i++) {
    if (w.kActive[i]) continue;
    w.kActive[i] = 1;
    w.kType[i] = kind;
    w.kX[i] = clamp(x, -ARENA_HALF_W + 0.8, ARENA_HALF_W - 0.8);
    w.kY[i] = clamp(y, -ARENA_HALF_H + 0.8, ARENA_HALF_H - 0.8);
    w.kLife[i] = BALANCE.pickups.lifeSeconds;
    w.kData[i] = data;
    w.events.push({ type: 'pickupDrop', kind, x: w.kX[i]!, y: w.kY[i]! });
    return;
  }
}

/** True when somebody carries a finite-ammo weapon that is running low (drops lean toward ammo then). */
function ammoStarved(w: World): boolean {
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s] || w.pState[s] !== PlayerState.Alive) continue;
    const max = reserveMax(w, s);
    if (max > 0 && w.pAmmo[s]! < max * 0.25) return true;
  }
  return false;
}

/** Roll loot for a dead enemy at (x, y). Bosses always drop a handful around them. */
export function dropLoot(w: World, x: number, y: number, boss: boolean): void {
  const cfg = BALANCE.pickups;
  if (boss) {
    const kinds: number[] = [];
    for (let i = 0; i < cfg.bossDrops.ammo; i++) kinds.push(PickupType.Ammo);
    for (let i = 0; i < cfg.bossDrops.health; i++) kinds.push(PickupType.Health);
    for (let i = 0; i < cfg.bossDrops.grenade; i++) kinds.push(PickupType.Grenade);
    kinds.forEach((k, n) => {
      const a = (n / kinds.length) * 6.283185307179586;
      spawnPickup(w, k, x + cos(a) * 1.8, y + sin(a) * 1.8);
    });
    return;
  }
  const r = w.rng.float();
  const ammoChance = cfg.chance.ammo + (ammoStarved(w) ? cfg.lowAmmoBonus : 0);
  if (r < ammoChance) spawnPickup(w, PickupType.Ammo, x, y);
  else if (r < ammoChance + cfg.chance.health) spawnPickup(w, PickupType.Health, x, y);
  else if (r < ammoChance + cfg.chance.health + cfg.chance.grenade) spawnPickup(w, PickupType.Grenade, x, y);
  else if (r < ammoChance + cfg.chance.health + cfg.chance.grenade + cfg.chance.weapon) spawnPickup(w, PickupType.Weapon, x, y, w.rng.int(WEAPON_IDS.length));
}

/** Magnet drift toward the nearest living player, then pickup on contact; expire after their lifetime. */
export function updatePickups(w: World): void {
  const cfg = BALANCE.pickups;
  const r2 = cfg.radius * cfg.radius;
  const m2 = cfg.magnetRadius * cfg.magnetRadius;
  for (let i = 0; i < MAX_PICKUPS; i++) {
    if (!w.kActive[i]) continue;
    w.kLife[i] = w.kLife[i]! - TICK_DT;
    if (w.kLife[i]! <= 0) {
      w.kActive[i] = 0;
      continue;
    }
    let best = -1;
    let bd2 = 1e18;
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!w.pActive[s] || w.pState[s] !== PlayerState.Alive) continue;
      const dx = w.pX[s]! - w.kX[i]!;
      const dy = w.pY[s]! - w.kY[i]!;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd2 && wants(w, s, w.kType[i]!, i)) {
        bd2 = d2;
        best = s;
      }
    }
    if (best < 0) continue;
    if (bd2 <= r2) {
      collect(w, best, i);
      continue;
    }
    if (bd2 <= m2) {
      const d = sqrt(bd2);
      const step = cfg.magnetSpeed * TICK_DT;
      w.kX[i] = w.kX[i]! + ((w.pX[best]! - w.kX[i]!) / d) * step;
      w.kY[i] = w.kY[i]! + ((w.pY[best]! - w.kY[i]!) / d) * step;
    }
  }
}

/** Would this player gain anything from the pickup? (A full player leaves it for a teammate.) */
function wants(w: World, s: number, kind: number, i: number): boolean {
  if (kind === PickupType.Health) return w.pHp[s]! < w.pMaxHp[s]!;
  if (kind === PickupType.Grenade) return w.pGren[s]! < BALANCE.grenade.max;
  if (kind === PickupType.Weapon) return w.pWeapon[s]! !== w.kData[i]!;
  const max = reserveMax(w, s);
  // infinite weapons turn an ammo crate into a grenade
  return max > 0 ? w.pAmmo[s]! < max : w.pGren[s]! < BALANCE.grenade.max;
}

function collect(w: World, s: number, i: number): void {
  const kind = w.kType[i]!;
  if (kind === PickupType.Health) {
    const hp = w.pHp[s]! + BALANCE.pickups.healthAmount;
    w.pHp[s] = hp > w.pMaxHp[s]! ? w.pMaxHp[s]! : hp;
  } else if (kind === PickupType.Grenade) {
    w.pGren[s] = w.pGren[s]! + 1;
  } else if (kind === PickupType.Weapon) {
    equipWeapon(w, s, w.kData[i]!);
  } else {
    const max = reserveMax(w, s);
    if (max > 0) w.pAmmo[s] = max;
    else w.pGren[s] = w.pGren[s]! + 1;
  }
  w.kActive[i] = 0;
  w.events.push({ type: 'pickup', kind, slot: s, x: w.kX[i]!, y: w.kY[i]! });
}
