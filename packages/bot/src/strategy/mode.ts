/** Switches for comparing strategies (tests and eval-build set them; the game never does). */
export const buildMode = {
  /** The naive first version of the whole module. */
  baseline: false,
  /** Ablations: leave a part to the naive logic. */
  noCards: false,
  noWeapons: false,
  noDrones: false,
  /** Weapons: always hold the highest ranked gun instead of judging the fight. */
  weaponRank: false,
};
