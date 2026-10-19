import data from '../data/balance.json';
import type { WeaponId } from './types';

export interface WeaponStats {
  damage: number;
  rate: number;
  pellets: number;
  ammo: number;
  spread: number;
  bulletSpeed: number;
  range: number;
  spinUp?: number;
  spinDown?: number;
}

export const BALANCE = data as unknown as {
  player: { hp: number; speed: number; iFrames: number; downedSeconds: number; crawlSpeed: number; reviveSeconds: number; reviveRange: number; radius: number };
  weapons: Record<WeaponId, WeaponStats>;
};
