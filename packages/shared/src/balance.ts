import data from '../data/balance.json';
import type { EnemyType, WeaponId } from './types';

export interface WeaponStats {
  damage: number;
  rate: number;
  pellets: number;
  ammo: number;
  spread: number;
  bulletSpeed: number;
  range: number;
  /** Muzzle geometry relative to the player: forward distance, right-hand offset, height (measured by the QA tool). */
  muzzleFwd: number;
  muzzleSide: number;
  muzzleH: number;
  /** Extra enemies a bullet passes through. */
  pierce: number;
  /** Rounds per magazine and seconds to reload. */
  mag: number;
  reload: number;
  /** Explosive rounds: radius and damage of the blast where the round ends. */
  blast?: number;
  blastDamage?: number;
  spinUp?: number;
  spinDown?: number;
}

export interface EnemyStats {
  hp: number;
  speed: number;
  radius: number;
  damage: number;
  interval: number;
  blastRadius?: number;
}

export interface WaveConfig {
  periodSeconds: number;
  baseCount: number;
  perPlayer: number;
  countGrowth: number;
  hpGrowth: number;
  playerHpGrowth: number;
  cap: number;
  spawnPerTick: number;
  spawnMinDistance: number;
  unlock: Record<EnemyType, number>;
  weights: Record<EnemyType, number>;
}

/** Strength of every card (see docs/DESIGN.md section 9); multiplier cards have a floor/ceiling so they cannot run away. */
export interface CardTuning {
  damage: number; rate: number; speed: number; hp: number; pierce: number;
  grenades: number; medic: number; medicMin: number; magnet: number; magnetMax: number; luck: number; luckMax: number;
  scholar: number; blast: number; blastMax: number; quickhands: number; quickMin: number; roll: number; rollMin: number;
  armor: number; armorMin: number; crit: number; critMax: number;
  sharp: number; sprint: number; bulk: number; vampire: number; tempo: number; marksman: number; ironskin: number; ironMin: number;
}

export interface ProgressionConfig {
  xpBase: number;
  xpPerLevel: number;
  /** Kills with at least this much damage become physical ragdolls on the client. */
  ragdollPower: number;
  cardSeconds: number;
  xp: Record<EnemyType, number>;
  boss: { everyWaves: number; hpMul: number; damage: number; radiusMul: number; summonSeconds: number; summonCount: number; xp: number; chargeSeconds: number; chargeSpeedMul: number; chargeTicks: number; queenSummonSeconds: number; queenCount: number; auraRadius: number; auraSpeedMul: number };
  revive: { hpFraction: number; iFrames: number };
  cards: CardTuning;
}

export const BALANCE = data as unknown as {
  dash: { seconds: number; speedMul: number; cooldown: number; iFrames: number };
  difficulty: { hp: number[]; count: number[]; damage: number[] };
  pickups: { lifeSeconds: number; radius: number; magnetRadius: number; magnetSpeed: number; chance: { ammo: number; health: number; grenade: number; weapon: number }; lowAmmoBonus: number; healthAmount: number; bossDrops: { ammo: number; health: number; grenade: number } };
  grenade: { max: number; rechargeSeconds: number; range: number; flight: number; fuse: number; radius: number; damage: number; cooldown: number };
  spit: { speed: number; life: number; radius: number };
  shielder: { frontDot: number; frontMul: number };
  progression: ProgressionConfig;
  enemies: Record<EnemyType, EnemyStats>;
  waves: WaveConfig;
  player: { reviveMoveMul: number; reviveDrain: number; hp: number; speed: number; iFrames: number; downedSeconds: number; crawlSpeed: number; reviveSeconds: number; reviveRange: number; radius: number };
  weapons: Record<WeaponId, WeaponStats>;
};
