import { CARD_STATS, PERK, PERKS } from '@wrh/shared';
import type { World } from '@wrh/sim';

/**
 * The numbers of a character that cards change, read from the world (what the sim keeps in modDamage, pModDmg, pMaxHp and so on)
 * and nothing else. A card is scored by applying its stat changes to a copy of the sheet and comparing the build power before
 * and after, so diminishing returns, caps and floors come out of the game's own rules (see CARD_STATS).
 */
export interface Sheet {
  /** Damage factors (modDamage, pModDmg), both start at 1. */
  dmgA: number;
  dmgB: number;
  rateA: number;
  rateB: number;
  /** Chance of a double hit. */
  crit: number;
  /** Extra enemies a bullet passes through. */
  pierce: number;
  /** Reload time factor (lower is faster). */
  reload: number;
  armorA: number;
  armorB: number;
  maxHp: number;
  hp: number;
  regen: number;
  /** Health per kill. */
  steal: number;
  speedA: number;
  speedB: number;
  /** Dash cooldown factor (lower is better). */
  dash: number;
  blast: number;
  magnet: number;
  xp: number;
  revive: number;
  gren: number;
  loot: number;
  acd: number;
  adur: number;
  admg: number;
  arad: number;
  aextra: number;
  thorns: number;
  shield: number;
  rage: number;
}

export const SHEET_KEYS = ['dmgA', 'dmgB', 'rateA', 'rateB', 'crit', 'pierce', 'reload', 'armorA', 'armorB', 'maxHp', 'hp', 'regen', 'steal', 'speedA', 'speedB', 'dash', 'blast', 'magnet', 'xp', 'revive', 'gren', 'loot', 'acd', 'adur', 'admg', 'arad', 'aextra', 'thorns', 'shield', 'rage'] as const;

/** The sheet of a player as the world has it now. */
export function readSheet(w: World, s: number): Sheet {
  const perk = (k: number): number => w.pPerk[s * PERKS + k]!;
  return {
    dmgA: w.modDamage[s]!,
    dmgB: w.pModDmg[s]!,
    rateA: w.modRate[s]!,
    rateB: w.pModRate[s]!,
    crit: w.modCrit[s]!,
    pierce: w.modPierce[s]! + w.pModPierce[s]!,
    reload: w.modReload[s]!,
    armorA: w.modArmor[s]!,
    armorB: w.pModArmor[s]!,
    maxHp: w.pMaxHp[s]!,
    hp: w.pHp[s]!,
    regen: perk(PERK.Regen),
    steal: w.pLifesteal[s]!,
    speedA: w.modSpeed[s]!,
    speedB: w.pModSpeed[s]!,
    dash: w.modDash[s]!,
    blast: w.modBlast[s]!,
    magnet: w.modMagnet[s]!,
    xp: w.modXp[s]!,
    revive: w.modRevive[s]!,
    gren: w.pGren[s]!,
    loot: w.modLoot,
    acd: w.modAbCd[s]!,
    adur: w.modAbDur[s]!,
    admg: w.modAbDmg[s]!,
    arad: w.modAbRad[s]!,
    aextra: w.modAbExtra[s]!,
    thorns: perk(PERK.Thorns),
    shield: perk(PERK.ShieldMax),
    rage: perk(PERK.Rage),
  };
}

export const cloneSheet = (a: Sheet): Sheet => ({ ...a });

/** The card stat names the table uses that point at the sheet's fields (the plain stats of CARD_STATS). */
const FIELD: Readonly<Record<string, keyof Sheet>> = {
  dmg: 'dmgA',
  pdmg: 'dmgB',
  rate: 'rateA',
  prate: 'rateB',
  pspeed: 'speedB',
  mspeed: 'speedA',
  pierce: 'pierce',
  armor: 'armorA',
  parmor: 'armorB',
  crit: 'crit',
  reload: 'reload',
  dash: 'dash',
  magnet: 'magnet',
  xp: 'xp',
  blast: 'blast',
  revive: 'revive',
  steal: 'steal',
  gren: 'gren',
  acd: 'acd',
  adur: 'adur',
  admg: 'admg',
  arad: 'arad',
  aextra: 'aextra',
  regen: 'regen',
  thorns: 'thorns',
  shield: 'shield',
  loot: 'loot',
  hp: 'maxHp',
  rage: 'rage',
};

/** Apply one stat change of a card to a sheet, with the same limits the sim uses (CARD_STATS), `cap` overriding the upper limit. */
export function applyOp(s: Sheet, stat: string, v: number, cap?: number): void {
  if (stat === 'heal') {
    s.hp = Math.min(s.maxHp, s.hp + s.maxHp * v);
    return;
  }
  const key = FIELD[stat];
  if (!key) return;
  const def = CARD_STATS[stat === 'mspeed' ? 'pspeed' : stat];
  if (stat === 'hp') {
    const next = Math.max(30, s.maxHp + v);
    s.hp = Math.min(next, Math.max(1, s.hp + (next - s.maxHp)));
    s.maxHp = next;
    return;
  }
  if (stat === 'shield' || stat === 'regen' || stat === 'thorns') {
    s[key] += v;
    return;
  }
  if (stat === 'loot') {
    s.loot = Math.min(3, s.loot * v);
    return;
  }
  const ap = def?.apply;
  let next = ap && ap.kind === 'mul' ? s[key] * v : s[key] + v;
  if (ap && ap.kind !== 'special') {
    if (ap.min !== undefined && next < ap.min) next = ap.min;
    if (ap.max !== undefined && next > ap.max) next = ap.max;
  }
  if (cap !== undefined && next > cap) next = cap;
  s[key] = next;
}

/** A card's stat changes: [stat, value, optional cap]. */
export type Ops = readonly (readonly [string, number] | readonly [string, number, number])[];

/** The older cards (the first 36 ids) are coded in the sim, not in the tables; this is what they do (BALANCE.progression.cards). */
export const BASE_OPS: Readonly<Record<string, Ops>> = {
  damage: [['dmg', 0.15]],
  rate: [['rate', 0.12]],
  speed: [['mspeed', 0.08]],
  hp: [['hp', 20]],
  pierce: [['pierce', 1]],
  heal: [['heal', 1]],
  ammo: [['reload', 0.8]],
  grenades: [['gren', 2]],
  medic: [['revive', 0.7]],
  magnet: [['magnet', 1.6, 4]],
  luck: [['loot', 1.5]],
  scholar: [['xp', 1.25]],
  blast: [['blast', 1.25, 2.5]],
  quickhands: [['reload', 0.75]],
  roll: [['dash', 0.7]],
  armor: [['armor', 0.88]],
  crit: [['crit', 0.1, 0.5]],
  sharp: [['pdmg', 0.3]],
  sprint: [['pspeed', 0.2]],
  bulk: [['hp', 40]],
  vampire: [['steal', 3]],
  tempo: [['prate', 0.25]],
  marksman: [['pierce', 2]],
  ironskin: [['parmor', 0.8]],
  regen: [['regen', 1.6]],
  thorns: [['thorns', 16]],
  barrier: [['shield', 45]],
  rage: [['rage', 1]],
};
