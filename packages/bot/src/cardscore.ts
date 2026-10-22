import { CARD_IDS, CLASS_CARDS, DRONE_TYPES, PlayerState, UNIVERSAL_CARDS, WEAPON_IDS, WEAPON_RANK, poolAt, type CardId } from '@wrh/shared';
import type { World } from '@wrh/sim';
import { BASE_OPS, applyOp, cloneSheet, readSheet, type Ops, type Sheet } from './strategy/sheet';
import { CLASS_PROFILES, type ClassProfile } from './strategy/profiles';
import { TUNE } from './strategy/tune';
import { NO_MODS, genericPower, isMeleeClass, isMeleeWeapon, ownedWeapons, rankOf, uptime, weaponStats } from './weapons';

/** The stat changes of every card by index (CARD_IDS), from the tables in shared and the base list in sheet.ts. */
export const CARD_OPS: readonly Ops[] = (() => {
  const table = new Map<string, Ops>();
  for (const c of [...UNIVERSAL_CARDS, ...CLASS_CARDS]) table.set(c.id, c.ops);
  for (const [id, ops] of Object.entries(BASE_OPS)) table.set(id, ops);
  return CARD_IDS.map((id) => table.get(id) ?? []);
})();

/** Where the run stands, as far as picking a card is concerned. */
export interface BuildContext {
  cls: number;
  profile: ClassProfile;
  wave: number;
  hpFrac: number;
  /** Other living squad members, and how hurt they are (sum of missing health fractions). */
  allies: number;
  alliesMissing: number;
  /** Weapon in the hands, as an index. */
  weapon: number;
  melee: boolean;
  /** Drones owned, and drones the room has open that the player does not own yet. */
  drones: number;
  spareDrones: number;
  /** Copies of each card the player holds (by card index). */
  held: ArrayLike<number>;
  /** Weapon index of the next gift weapon from the arsenal card (-1: none left). */
  gift: number;
}

const KPS = 1.4;

/** Build power in log units: how far ahead the character is in damage, toughness, mobility, ability and support. */
export function power(s: Sheet, bc: BuildContext): number {
  const pr = bc.profile;
  const wst = weaponStats(bc.weapon);
  const gun = !bc.melee;
  // damage: factors, crits, magazine uptime, rage (felt at about a third health missing)
  let off = Math.log(s.dmgA * s.dmgB) + Math.log(1 + s.crit) + Math.log(s.rateA * s.rateB) + Math.log(1 + 0.7 * 0.3 * s.rage);
  if (gun) {
    off += Math.log(uptime(wst, { ...NO_MODS, rate: s.rateA * s.rateB, reload: s.reload }));
    if (wst.blast === undefined) off += pr.pierce * Math.log(1 + wst.pierce + s.pierce) - pr.pierce * Math.log(1 + wst.pierce);
    else off += pr.blast * 2 * Math.log(s.blast);
  }
  off += pr.blast * Math.log(s.blast) + Math.log(1 + s.thorns / 500);
  // toughness: health, shield and what comes back during a fight, over armor
  const sustain = 8 * (s.regen + s.steal * KPS);
  const ehp = (s.maxHp + 1.5 * s.shield + sustain) / (s.armorA * s.armorB);
  const def = Math.log(ehp / 100);
  const mob = Math.log(s.speedA * s.speedB) - 0.3 * Math.log(s.dash);
  const a = pr.ability;
  const ab = a.cd * -Math.log(s.acd) + a.dur * Math.log(s.adur) + a.dmg * Math.log(s.admg) + a.rad * Math.log(s.arad) + a.extra * Math.log(1 + s.aextra / 6);
  // support: experience early in the run, loot, revive speed, grenades
  const future = Math.max(0, 14 - 0.35 * bc.wave);
  const team = Math.min(1 + bc.allies * 0.2, 2);
  const util = (TUNE.xp * future * 0.08 * (s.xp - 1)) / Math.max(0.05, pr.util) - 0.06 * Math.min(bc.allies, 3) * Math.log(s.revive) + 0.05 * Math.log(s.magnet) + 0.05 * team * Math.log(s.loot) + 0.03 * s.gren;
  // when the character is hurt, toughness counts for more
  const danger = bc.hpFrac < 0.45 ? 1.35 : bc.hpFrac < 0.7 ? 1.12 : 1;
  return TUNE.off * pr.off * off + TUNE.def * pr.def * danger * def + TUNE.mob * pr.mob * mob + TUNE.ab * pr.ab * ab + TUNE.util * pr.util * util;
}

/** Values of the cards that have their own rules (not just stat changes), in the same log units. */
function special(id: string, bc: BuildContext, count: number): number {
  const pr = bc.profile;
  switch (id) {
    case 'shock':
      return count > 0 ? 0 : 0.07 + 0.03 * pr.def;
    case 'frost':
      return count > 0 ? 0 : 0.05 + 0.05 * pr.def;
    case 'adrenaline':
      return count > 0 ? 0 : 0.05 + 0.05 * pr.mob;
    case 'volatile':
      return 0.07 / (1 + count * 0.8);
    case 'scavenger':
      return 0.02 / (1 + count);
    case 'secondwind':
      return 0.14 / (1 + count);
    case 'drone': {
      const v = [0.22, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03][Math.min(6, bc.drones)] ?? 0.02;
      return bc.spareDrones <= 0 ? 0.01 : v;
    }
    case 'arsenal': {
      if (bc.melee) return 0.02;
      if (bc.gift < 0) return 0.03;
      const now = genericPower(bc.weapon);
      const gain = genericPower(bc.gift) / Math.max(1, now);
      return Math.max(0.02, 0.5 * Math.log(gain));
    }
    case 'heal': {
      // a squad heal: what it restores for the others
      return 0.5 * bc.alliesMissing * (0.4 + pr.util * 2);
    }
    case 'grenades':
      return 0.02 * (1 + bc.allies * 0.5) + (pr.blast > 0.2 ? 0.05 : 0);
    default:
      return 0;
  }
}

/** The weapon index the arsenal card would hand out (the next stronger one not owned), or -1. */
function nextGift(w: World, slot: number): number {
  const owned = ownedWeapons(w, slot);
  const open = poolAt(w.metLevel).weapons;
  let top = -1;
  for (const i of owned) top = Math.max(top, rankOf(i));
  for (let d = 1; d <= WEAPON_RANK.length; d++) {
    const idx = WEAPON_IDS.indexOf(WEAPON_RANK[(top + d) % WEAPON_RANK.length]!);
    if (!isMeleeWeapon(idx) && ((open >> idx) & 1) !== 0 && !owned.includes(idx)) return idx;
  }
  return -1;
}

/** Read the situation of one player from the world. */
export function readContext(w: World, slot: number, cls: number): BuildContext {
  let allies = 0;
  let missing = 0;
  for (let o = 0; o < w.pActive.length; o++) {
    if (o === slot || !w.pActive[o] || w.pState[o] !== PlayerState.Alive) continue;
    allies++;
    missing += Math.max(0, 1 - w.pHp[o]! / Math.max(1, w.pMaxHp[o]!));
  }
  let drones = 0;
  let spare = 0;
  const openDrones = poolAt(w.metLevel).drones;
  for (let t = 0; t < DRONE_TYPES.length; t++) {
    if (w.pDLv[slot * DRONE_TYPES.length + t]! > 0) drones++;
    else if (((openDrones >> t) & 1) !== 0) spare++;
  }
  const melee = isMeleeClass(cls);
  return {
    cls,
    profile: CLASS_PROFILES[cls] ?? CLASS_PROFILES[0]!,
    wave: w.wave,
    hpFrac: w.pHp[slot]! / Math.max(1, w.pMaxHp[slot]!),
    allies,
    alliesMissing: missing,
    weapon: w.pWeapon[slot]!,
    melee,
    drones,
    spareDrones: spare,
    held: w.pCards.subarray(slot * CARD_IDS.length, (slot + 1) * CARD_IDS.length),
    gift: melee ? -1 : nextGift(w, slot),
  };
}

/** The value of taking one card, in log-power units (more is better). `card` is an index into CARD_IDS. */
export function scoreCard(sheet: Sheet, bc: BuildContext, card: number): number {
  const id = CARD_IDS[card];
  if (id === undefined) return -1e9;
  const ops = CARD_OPS[card]!;
  const base = power(sheet, bc);
  const next = cloneSheet(sheet);
  const arsenalFallback = id === 'arsenal' && (bc.melee || bc.gift < 0);
  for (const op of arsenalFallback ? ([['reload', 0.8]] as Ops) : id === 'arsenal' ? [] : ops) applyOp(next, op[0], op[1], op[2]);
  let v = power(next, bc) - base;
  // a heal lifts health right now, which the log power does not see
  const dHp = (next.hp - sheet.hp - (next.maxHp - sheet.maxHp)) / Math.max(1, sheet.maxHp);
  if (dHp > 0) v += TUNE.heal * 0.8 * dHp * (bc.hpFrac < 0.4 ? 1.6 : 1) * (bc.profile.def + 0.4);
  const count = bc.held[card] ?? 0;
  v += TUNE.special * special(id as CardId, bc, count);
  // luck helps the whole squad
  if (id === 'luck') v += 0.02 * bc.allies;
  return v;
}

/** The score of every card of an offer for a player (parallel to `offer`). */
export function scoreOffer(w: World, slot: number, cls: number, offer: readonly number[]): number[] {
  const sheet = readSheet(w, slot);
  const bc = readContext(w, slot, cls);
  return offer.map((c) => scoreCard(sheet, bc, c));
}

/**
 * Pick one card of an offer: the best score plus noise that shrinks with judgement (easy picks nearly at random, superhuman
 * always the best). Returns the position in the offer, or -1 when nothing in the offer can be picked.
 */
export function pickCard(scores: readonly number[], judgement: number, rand: () => number): number {
  let best = -1;
  let bestV = -Infinity;
  const spread = 0.12 * Math.pow(Math.max(0, 1 - judgement), 1.2) * 4;
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i]!;
    if (!(s > -1e8)) continue;
    const v = s + (spread > 0 ? (rand() - 0.5) * 2 * spread : 0);
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  return best;
}
