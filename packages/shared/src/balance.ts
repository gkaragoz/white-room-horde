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

export interface ProgressionConfig {
  xpBase: number;
  xpPerLevel: number;
  /** Kills with at least this much damage become physical ragdolls on the client. */
  ragdollPower: number;
  cardSeconds: number;
  xp: Record<EnemyType, number>;
  boss: { everyWaves: number; hpMul: number; damage: number; radiusMul: number; summonSeconds: number; summonCount: number; xp: number };
  revive: { hpFraction: number; iFrames: number };
  cards: { damage: number; rate: number; speed: number; hp: number; pierce: number };
}

export const BALANCE = data as unknown as {
  grenade: { max: number; rechargeSeconds: number; range: number; flight: number; fuse: number; radius: number; damage: number; cooldown: number };
  spit: { speed: number; life: number; radius: number };
  shielder: { frontDot: number; frontMul: number };
  progression: ProgressionConfig;
  enemies: Record<EnemyType, EnemyStats>;
  waves: WaveConfig;
  player: { hp: number; speed: number; iFrames: number; downedSeconds: number; crawlSpeed: number; reviveSeconds: number; reviveRange: number; radius: number };
  weapons: Record<WeaponId, WeaponStats>;
};
