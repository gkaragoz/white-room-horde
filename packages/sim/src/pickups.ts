import { MAPS, deckWalkable, ARENA_HALF_H, ARENA_HALF_W, BALANCE, MAX_ENEMIES, MAX_PICKUPS, MAX_PLAYERS, PickupType, PlayerState, STAT, TICK_DT, TICK_RATE, WEAPON_IDS } from '@wrh/shared';
import { addStat, heal } from './stats';
import { clamp, cos, sin, sqrt } from './detmath';
import { PERK } from '@wrh/shared';
import { nuke, perk, setPerk, waveModOf } from './features';
import { ammoLow, ammoNeeded, giveWeapon, isMelee, owns, refillAll } from './loadout';
import type { World } from './state';

export function spawnPickup(w: World, kind: number, x: number, y: number, data = 0, layer = 0): void {
  for (let i = 0; i < MAX_PICKUPS; i++) {
    if (w.kActive[i]) continue;
    w.kActive[i] = 1;
    w.kType[i] = kind;
    w.kX[i] = clamp(x, -ARENA_HALF_W + 0.8, ARENA_HALF_W - 0.8);
    w.kY[i] = clamp(y, -ARENA_HALF_H + 0.8, ARENA_HALF_H - 0.8);
    w.kLife[i] = BALANCE.pickups.lifeSeconds;
    w.kData[i] = data;
    // loot of an enemy that died on a deck lies on the deck (or, thrown off its edge, on the ground)
    w.kLayer[i] = layer === 1 && deckWalkable(MAPS[w.map] ?? MAPS[0]!, w.kX[i]!, w.kY[i]!) ? 1 : 0;
    w.events.push({ type: 'pickupDrop', kind, x: w.kX[i]!, y: w.kY[i]! });
    return;
  }
}

/** True when somebody carries a finite-ammo weapon that is running low (drops lean toward ammo then). */
function ammoStarved(w: World): boolean {
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s] || w.pState[s] !== PlayerState.Alive) continue;
    if (ammoLow(w, s)) return true;
  }
  return false;
}

/** Does anybody alive in the squad carry guns? */
function gunsInSquad(w: World): boolean {
  for (let s = 0; s < MAX_PLAYERS; s++) if (w.pActive[s] && w.pState[s] !== PlayerState.Dead && !isMelee(w, s)) return true;
  return false;
}

/** The weapon of a crate: one somebody in the squad does not own yet, so drops widen the arsenal first. */
export function pickWeapon(w: World): number {
  const missing: number[] = [];
  const guns: number[] = [];
  for (let i = 0; i < WEAPON_IDS.length; i++) {
    if (BALANCE.weapons[WEAPON_IDS[i]!]!.melee) continue;
    guns.push(i);
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (w.pActive[s] && w.pState[s] !== PlayerState.Dead && !owns(w, s, i)) {
        missing.push(i);
        break;
      }
    }
  }
  return missing.length ? missing[w.rng.int(missing.length)]! : guns[w.rng.int(guns.length)]!;
}

/** Roll loot for a dead enemy at (x, y). Bosses always drop a handful around them. */
export function dropLoot(w: World, x: number, y: number, boss: boolean, layer = 0): void {
  const cfg = BALANCE.pickups;
  if (boss) {
    const kinds: number[] = [];
    for (let i = 0; i < cfg.bossDrops.ammo; i++) kinds.push(PickupType.Ammo);
    for (let i = 0; i < cfg.bossDrops.health; i++) kinds.push(PickupType.Health);
    for (let i = 0; i < cfg.bossDrops.grenade; i++) kinds.push(PickupType.Grenade);
    kinds.forEach((k, n) => {
      const a = (n / kinds.length) * 6.283185307179586;
      spawnPickup(w, k, x + cos(a) * 1.8, y + sin(a) * 1.8, 0, layer);
    });
    return;
  }
  // a squad of blades alone has no use for guns or bullets: those drops would only be wasted
  const guns = gunsInSquad(w);
  const r = w.rng.float();
  const luck = w.modLoot * (waveModOf(w.wave) === 4 ? 2 : 1);
  const ammoChance = guns ? (cfg.chance.ammo + (ammoStarved(w) ? cfg.lowAmmoBonus : 0)) * luck : 0;
  if (r < ammoChance) spawnPickup(w, PickupType.Ammo, x, y, 0, layer);
  else if (r < ammoChance + cfg.chance.health * luck) spawnPickup(w, PickupType.Health, x, y, 0, layer);
  else if (r < ammoChance + (cfg.chance.health + cfg.chance.grenade) * luck) spawnPickup(w, PickupType.Grenade, x, y, 0, layer);
  else if (guns && r < ammoChance + (cfg.chance.health + cfg.chance.grenade + cfg.chance.weapon) * luck) spawnPickup(w, PickupType.Weapon, x, y, pickWeapon(w), layer);
  else {
    // the rarer power-ups
    let edge = ammoChance + (cfg.chance.health + cfg.chance.grenade + cfg.chance.weapon) * luck;
    const table: [number, number][] = [
      [PickupType.Shield, cfg.chance.shield],
      [PickupType.Haste, cfg.chance.haste],
      [PickupType.Quad, cfg.chance.quad],
      [PickupType.Nuke, cfg.chance.nuke],
      [PickupType.Freeze, cfg.chance.freeze],
    ];
    for (const [kind, c] of table) {
      edge += c * luck;
      if (r < edge) {
        spawnPickup(w, kind, x, y, 0, layer);
        break;
      }
    }
  }
}

/** Magnet drift toward the nearest living player, then pickup on contact; expire after their lifetime. */
export function updatePickups(w: World): void {
  const cfg = BALANCE.pickups;
  const r2 = cfg.radius * cfg.radius;
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
      if (!w.pActive[s] || w.pState[s] !== PlayerState.Alive || w.pLayer[s] !== w.kLayer[i]) continue;
      const dx = w.pX[s]! - w.kX[i]!;
      const dy = w.pY[s]! - w.kY[i]!;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd2 && wants(w, s, w.kType[i]!, i)) {
        bd2 = d2;
        best = s;
      }
    }
    if (best < 0) continue;
    // the pull radius is the collector's own (magnet card)
    const magnet = cfg.magnetRadius * w.modMagnet[best]!;
    const m2 = magnet * magnet;
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
  // blades and hammers have no use for guns or bullets: that loot stays for the others
  if (isMelee(w, s) && (kind === PickupType.Weapon || kind === PickupType.Ammo)) return false;
  if (kind === PickupType.Weapon) return !owns(w, s, w.kData[i]!) || ammoNeeded(w, s);
  if (kind === PickupType.Shield) return perk(w, s, PERK.Shield) < 100;
  if (kind >= PickupType.Haste) return true;
  // with every weapon full an ammo crate turns into a grenade
  return ammoNeeded(w, s) || w.pGren[s]! < BALANCE.grenade.max;
}

function collect(w: World, s: number, i: number): void {
  const kind = w.kType[i]!;
  if (kind === PickupType.Health) {
    heal(w, s, BALANCE.pickups.healthAmount);
  } else if (kind === PickupType.Grenade) {
    w.pGren[s] = w.pGren[s]! + 1;
  } else if (kind === PickupType.Shield) {
    setPerk(w, s, PERK.Shield, Math.min(100, perk(w, s, PERK.Shield) + BALANCE.pickups.shieldAmount));
  } else if (kind === PickupType.Haste) {
    setPerk(w, s, PERK.Haste, BALANCE.pickups.hasteSeconds);
  } else if (kind === PickupType.Quad) {
    setPerk(w, s, PERK.Quad, BALANCE.pickups.quadSeconds);
  } else if (kind === PickupType.Nuke) {
    nuke(w, s);
  } else if (kind === PickupType.Freeze) {
    w.misc[0] = BALANCE.pickups.freezeSeconds;
    for (let e = 0; e < MAX_ENEMIES; e++) if (w.eActive[e]) w.eFrost[e] = Math.round(BALANCE.pickups.freezeSeconds * TICK_RATE);
    w.events.push({ type: 'freeze', seconds: BALANCE.pickups.freezeSeconds });
  } else if (kind === PickupType.Weapon) {
    giveWeapon(w, s, w.kData[i]!);
  } else {
    // an ammo crate fills every weapon of the inventory; with everything full it is a grenade instead
    if (ammoNeeded(w, s)) refillAll(w, s);
    else w.pGren[s] = w.pGren[s]! + 1;
  }
  w.kActive[i] = 0;
  addStat(w, s, STAT.Pickups, 1);
  w.events.push({ type: 'pickup', kind, slot: s, x: w.kX[i]!, y: w.kY[i]! });
}
