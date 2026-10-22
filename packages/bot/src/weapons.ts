import { BALANCE, WEAPON_IDS, type WeaponId } from '@wrh/shared';
import type { Percept } from './types';

/** What the bot needs to know about a weapon, flattened once per weapon. */
export interface WeaponProfile {
  id: WeaponId;
  index: number;
  melee: boolean;
  /** Bullet range (guns) or swing radius (melee), in units. */
  range: number;
  /** Bullet speed in units per second (0 for melee). */
  speed: number;
  /** Swing arc in radians (melee). */
  arc: number;
  /** Seconds a hammer charges. */
  charge: number;
  pellets: number;
  spread: number;
  pierce: number;
  /** Blast radius of an explosive round (0 = none). */
  blast: number;
  /** Shots per second. */
  rate: number;
  /** Damage of one shot (all pellets) before cards. */
  burst: number;
  mag: number;
  reload: number;
  /** Rough damage per second before cards. */
  dps: number;
  /** The nearest enemy should stay within this distance so the shots reach. */
  band: number;
  /** ... and (for guns) not closer than this. */
  near: number;
  /** Does the shot burst where it lands (rocket, grenade launcher, plasma)? */
  explosive: boolean;
}

const profiles: WeaponProfile[] = [];

/** The profile of weapon `index` (WEAPON_IDS). */
export function profileOfWeapon(index: number): WeaponProfile {
  let p = profiles[index];
  if (p) return p;
  const id = WEAPON_IDS[index] ?? 'pistol';
  const s = BALANCE.weapons[id];
  const melee = !!s.melee;
  const range = melee ? s.melee!.radius : s.range;
  const burst = s.damage * s.pellets;
  p = {
    id,
    index,
    melee,
    range,
    speed: s.bulletSpeed,
    arc: s.melee?.arc ?? 0,
    charge: s.melee?.charge ?? 0,
    pellets: s.pellets,
    spread: s.spread,
    pierce: s.pierce,
    blast: s.blast ?? 0,
    rate: s.rate,
    burst,
    mag: s.mag,
    reload: s.reload,
    dps: burst * s.rate,
    band: melee ? range * 0.9 + 1 : Math.min(range * 0.75, 15),
    near: melee ? 0 : s.blast && s.blast > 2 ? Math.max(5, s.blast * 1.6) : 4,
    explosive: s.blast !== undefined,
  };
  profiles[index] = p;
  return p;
}

/** The profile of the weapon the bot holds. */
export const engagement = (p: Percept): WeaponProfile => profileOfWeapon(p.weapon);
