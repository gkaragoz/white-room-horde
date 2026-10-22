/**
 * The stat changes a card can make (the `ops` of cards-universal.ts and cards-class.ts name them by id), defined once:
 * how the simulation applies each one and how the client words it. Adding a stat is one entry here plus its phrases in
 * packages/client/src/cardText.ts; a test fails when the two sides disagree.
 */

/** How the value of a stat is shown: a factor (1.3 is +30%), an added fraction (0.25 is +25%) or a plain count. */
export type StatFormat = 'factor' | 'fraction' | 'count';

/** One number per player (`field` is the name of a World array), changed by adding or multiplying, then kept between `min` and `max`. */
export interface PlainStat {
  kind: 'add' | 'mul';
  field: string;
  min?: number;
  max?: number;
}

/** A stat with its own rule in the simulation (health, shield and the like), or that is not per player. */
export interface SpecialStat {
  kind: 'special';
}

export interface CardStatDef {
  /** The key of the phrases that word this stat (a personal and a team stat can share one). */
  phrase: string;
  format: StatFormat;
  apply: PlainStat | SpecialStat;
}

const add = (field: string, min?: number, max?: number): PlainStat => ({ kind: 'add', field, min, max });
const mul = (field: string, min?: number, max?: number): PlainStat => ({ kind: 'mul', field, min, max });
const special: SpecialStat = { kind: 'special' };

export const CARD_STATS: Readonly<Record<string, CardStatDef>> = {
  dmg: { phrase: 'dmg', format: 'fraction', apply: add('modDamage') },
  pdmg: { phrase: 'dmg', format: 'fraction', apply: add('pModDmg') },
  rate: { phrase: 'rate', format: 'fraction', apply: add('modRate', 0.3) },
  prate: { phrase: 'rate', format: 'fraction', apply: add('pModRate', 0.4) },
  pspeed: { phrase: 'speed', format: 'fraction', apply: add('pModSpeed', 0.5) },
  pierce: { phrase: 'pierce', format: 'count', apply: add('modPierce') },
  armor: { phrase: 'armor', format: 'factor', apply: mul('modArmor', 0.4, 1.6) },
  parmor: { phrase: 'armor', format: 'factor', apply: mul('pModArmor', 0.35, 1.6) },
  crit: { phrase: 'crit', format: 'fraction', apply: add('modCrit', undefined, 0.75) },
  reload: { phrase: 'reload', format: 'factor', apply: mul('modReload', 0.3, 2.5) },
  dash: { phrase: 'dash', format: 'factor', apply: mul('modDash', 0.25, 2) },
  magnet: { phrase: 'magnet', format: 'factor', apply: mul('modMagnet', undefined, 5) },
  xp: { phrase: 'xp', format: 'factor', apply: mul('modXp') },
  blast: { phrase: 'blast', format: 'factor', apply: mul('modBlast', undefined, 3.2) },
  revive: { phrase: 'revive', format: 'factor', apply: mul('modRevive', 0.2) },
  steal: { phrase: 'steal', format: 'count', apply: add('pLifesteal') },
  gren: { phrase: 'gren', format: 'count', apply: add('pGren') },
  acd: { phrase: 'acd', format: 'factor', apply: mul('modAbCd', 0.3, 1) },
  adur: { phrase: 'adur', format: 'factor', apply: mul('modAbDur', undefined, 3) },
  admg: { phrase: 'admg', format: 'factor', apply: mul('modAbDmg', undefined, 4) },
  arad: { phrase: 'arad', format: 'factor', apply: mul('modAbRad', undefined, 2.5) },
  aextra: { phrase: 'aextra', format: 'count', apply: add('modAbExtra', undefined, 12) },
  hp: { phrase: 'hp', format: 'count', apply: special },
  heal: { phrase: 'heal', format: 'fraction', apply: special },
  loot: { phrase: 'loot', format: 'factor', apply: special },
  regen: { phrase: 'regen', format: 'count', apply: special },
  thorns: { phrase: 'thorns', format: 'count', apply: special },
  shield: { phrase: 'shield', format: 'count', apply: special },
};
