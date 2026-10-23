import { CLASS_IDS } from '@wrh/shared';

/** What an ability scales with (weights of the log of each class-ability stat): cooldown, duration, damage, radius, extra shots. */
export interface AbilityWeights {
  cd: number;
  dur: number;
  dmg: number;
  rad: number;
  extra: number;
}

/**
 * How a class values its stats: the share of damage, toughness, mobility, ability and support in "build power", plus how much
 * piercing and blast help its weapons. These are the class-specific priorities; the generic scorer does the rest.
 */
export interface ClassProfile {
  off: number;
  def: number;
  mob: number;
  ab: number;
  util: number;
  pierce: number;
  blast: number;
  /** The role in words (for tests and logs). */
  role: 'allround' | 'support' | 'tank' | 'skirmisher' | 'blaster' | 'sniper' | 'bruiser' | 'melee';
  ability: AbilityWeights;
}

const ab = (cd: number, dur: number, dmg: number, rad: number, extra: number): AbilityWeights => ({ cd, dur, dmg, rad, extra });

const BY_NAME: Record<(typeof CLASS_IDS)[number], ClassProfile> = {
  // rally cry: a rate and speed buff for the squad in a radius
  soldier: { off: 0.4, def: 0.3, mob: 0.08, ab: 0.12, util: 0.1, pierce: 0.1, blast: 0.08, role: 'allround', ability: ab(0.5, 0.5, 0, 0.3, 0) },
  // heal pulse: heals the squad around; wants to survive and to keep the squad alive
  medic: { off: 0.2, def: 0.3, mob: 0.06, ab: 0.22, util: 0.22, pierce: 0.08, blast: 0.06, role: 'support', ability: ab(0.7, 0, 0.5, 0.5, 0) },
  // damage cut for a few seconds: the tank
  heavy: { off: 0.28, def: 0.46, mob: 0.04, ab: 0.12, util: 0.1, pierce: 0.1, blast: 0.06, role: 'tank', ability: ab(0.5, 0.6, 0, 0, 0) },
  scout: { off: 0.38, def: 0.24, mob: 0.2, ab: 0.1, util: 0.08, pierce: 0.1, blast: 0.06, role: 'skirmisher', ability: ab(0.4, 0.3, 0, 0, 0) },
  // grenades and an air strike: blast, radius and count
  demolisher: { off: 0.3, def: 0.26, mob: 0.06, ab: 0.28, util: 0.1, pierce: 0.04, blast: 0.3, role: 'blaster', ability: ab(0.5, 0, 0.6, 0.5, 0.5) },
  ranger: { off: 0.46, def: 0.22, mob: 0.08, ab: 0.14, util: 0.08, pierce: 0.2, blast: 0.04, role: 'sniper', ability: ab(0.5, 0, 0.5, 0, 0.5) },
  berserker: { off: 0.34, def: 0.34, mob: 0.08, ab: 0.16, util: 0.08, pierce: 0.08, blast: 0.04, role: 'bruiser', ability: ab(0.5, 0.6, 0.5, 0, 0) },
  swordsman: { off: 0.34, def: 0.3, mob: 0.1, ab: 0.18, util: 0.08, pierce: 0, blast: 0, role: 'melee', ability: ab(0.5, 0.5, 0.4, 0.4, 0) },
  hammerer: { off: 0.3, def: 0.34, mob: 0.06, ab: 0.22, util: 0.08, pierce: 0, blast: 0, role: 'melee', ability: ab(0.6, 0, 0.6, 0.5, 0) },
};

/** Profiles by class index (CLASS_IDS). */
export const CLASS_PROFILES: readonly ClassProfile[] = CLASS_IDS.map((id) => BY_NAME[id]);
