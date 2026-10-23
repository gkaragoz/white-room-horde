import { BALANCE, DRONE_TYPES, PERK, PERKS, PickupType, PlayerState } from '@wrh/shared';
import { classOf } from './perception';
import type { Percept, Pickup } from './types';
import { genericPower, isMeleeClass, isMeleeWeapon, ownedWeapons } from './weaponchoice';

/**
 * How much a pickup is worth to this bot, as the number of units it is willing to walk for it (a player moves about 12 units a
 * second, a pickup lies 22 seconds). 0 means leave it. The movement module can call `pickupWorth` for any pickup of the
 * percept, or `pickupScore` / `bestPickup` to get the net value (worth minus the walk) and the one to go for.
 */
export function pickupWorth(p: Percept, pk: Pickup): number {
  const w = p.world;
  const s = p.slot;
  const hurt = Math.max(0, 1 - p.hp / Math.max(1, p.maxHp));
  const enemies = p.enemies.length;
  switch (pk.type) {
    case PickupType.Health: {
      if (p.hp >= p.maxHp - 1) return 0;
      const gain = Math.min(BALANCE.pickups.healthAmount, p.maxHp - p.hp) / p.maxHp;
      let v = 6 + 90 * gain * (hurt > 0.5 ? 1.5 : 1);
      // a squad mate who is hurt worse and stands closer gets it instead
      for (const a of p.allies) {
        if (a.state !== PlayerState.Alive) continue;
        const ah = 1 - a.hp / Math.max(1, a.maxHp);
        if (ah > hurt + 0.25) {
          const da = (a.x - pk.x) ** 2 + (a.y - pk.y) ** 2;
          const dm = (p.x - pk.x) ** 2 + (p.y - pk.y) ** 2;
          if (da < dm) v *= 0.4;
        }
      }
      return v;
    }
    case PickupType.Grenade:
    case PickupType.Ammo: {
      if (p.grenades >= BALANCE.grenade.max) return 0;
      const blaster = classOf(w, s) === 4 ? 1.6 : 1;
      return (5 + 3 * (BALANCE.grenade.max - p.grenades)) * blaster;
    }
    case PickupType.Weapon: {
      if (isMeleeClass(classOf(w, s))) return 0;
      const idx = pk.data;
      if (idx < 0 || isMeleeWeapon(idx) || ((w.pOwned[s]! >> idx) & 1) === 1) return 0;
      let best = 1;
      for (const o of ownedWeapons(w, s)) best = Math.max(best, genericPower(o));
      const gain = Math.log(Math.max(1, genericPower(idx)) / best);
      return Math.min(32, 7 + 24 * Math.max(0, gain));
    }
    case PickupType.Shield: {
      const sh = w.pPerk[s * PERKS + PERK.Shield]!;
      if (sh >= 100) return 0;
      return 12 + 8 * hurt + (enemies > 3 ? 4 : 0);
    }
    case PickupType.Haste:
      return 9 + (enemies > 6 ? 5 : 0);
    case PickupType.Quad:
      return enemies > 3 ? 26 : 10;
    case PickupType.Nuke:
      return 10 + Math.min(30, enemies * 1.2) + (p.enemies.some((e) => e.boss) ? 6 : 0);
    case PickupType.Freeze:
      return 8 + Math.min(14, enemies * 0.6);
    case PickupType.Drone: {
      let owned = 0;
      for (let t = 0; t < DRONE_TYPES.length; t++) if (w.pDLv[s * DRONE_TYPES.length + t]! > 0) owned++;
      return owned >= DRONE_TYPES.length ? 12 : 42 - owned * 3;
    }
    default:
      return 4;
  }
}

/** Seconds a pickup stays (from the world). Infinity when unknown. */
function lifeLeft(p: Percept, pk: Pickup): number {
  const v = p.world.kLife[pk.id];
  return v === undefined || !p.world.kActive[pk.id] ? Infinity : v;
}

/** Worth minus the walk to it; negative or zero means not worth going. A pickup that will be gone before the bot arrives is worth nothing. */
export function pickupScore(p: Percept, pk: Pickup): number {
  const d = Math.hypot(pk.x - p.x, pk.y - p.y);
  const speed = BALANCE.player.speed;
  if (lifeLeft(p, pk) * speed < d - 1) return -d;
  return pickupWorth(p, pk) - d;
}

/** The pickup worth the most net of the walk, or null when none is worth it. */
export function bestPickup(p: Percept): { pickup: Pickup; score: number } | null {
  let best: { pickup: Pickup; score: number } | null = null;
  for (const pk of p.pickups) {
    const score = pickupScore(p, pk);
    if (score > 0 && (best === null || score > best.score)) best = { pickup: pk, score };
  }
  return best;
}
