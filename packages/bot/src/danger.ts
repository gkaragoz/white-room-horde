import { BALANCE, ENEMY_TYPES, TeleEffect } from '@wrh/shared';
import type { Telegraph, Threat } from './types';

/**
 * The threat model. Damage is counted in "pain": 1 pain = 10 hit points, so a grunt's blow (8 x 2 = 16 hp) is 1.6 pain. Everything
 * the movement planner weighs against each other (contact, ground attacks, fire, staying in range to shoot) is in this unit.
 */

const N = ENEMY_TYPES.length;
const idx = (name: string): number => ENEMY_TYPES.indexOf(name as (typeof ENEMY_TYPES)[number]);

export const T = {
  grunt: idx('grunt'),
  runner: idx('runner'),
  tank: idx('tank'),
  exploder: idx('exploder'),
  spitter: idx('spitter'),
  shielder: idx('shielder'),
  spawner: idx('spawner'),
  crawler: idx('crawler'),
  leaper: idx('leaper'),
  bloater: idx('bloater'),
  screamer: idx('screamer'),
  acider: idx('acider'),
  rammer: idx('rammer'),
  flamer: idx('flamer'),
  mortar: idx('mortar'),
  sledge: idx('sledge'),
  lamper: idx('lamper'),
  blinker: idx('blinker'),
  marksman: idx('marksman'),
  reviver: idx('reviver'),
  magnetar: idx('magnetar'),
  pouncer: idx('pouncer'),
  hurler: idx('hurler'),
  grabber: idx('grabber'),
  spiker: idx('spiker'),
  shocker: idx('shocker'),
  brood: idx('brood'),
  trapper: idx('trapper'),
  warcaller: idx('warcaller'),
  chopper: idx('chopper'),
  quaker: idx('quaker'),
} as const;

/** Elite modifier ids (the sim's ELITE table). */
export const ELITE_ID = { Giant: 1, Swift: 2, Splitter: 3, Volatile: 4, Regen: 5, Armored: 6, Berserk: 7, Vampiric: 8, Toxic: 9, Phantom: 10, Warded: 11 } as const;

/** Speed in units per second of every type before elite and floor effects. */
export const SPEED = new Float64Array(N);
/** Body radius. */
export const RADIUS = new Float64Array(N);
/** Base hit points. */
export const HP = new Float64Array(N);
/** Pain of one contact blow. */
export const BLOW = new Float64Array(N);
/** Pain per second while in contact. */
export const DPS = new Float64Array(N);
/** Extra distance (beyond the touching distance) an enemy of this type must be kept at: its area attacks reach that far. */
export const STAND_OFF = new Float64Array(N);
/** Types that do not close in to touch: they hold a distance and shoot, lob or telegraph. */
export const RANGED = new Uint8Array(N);
/** Distance a ranged type holds. */
export const HOLD = new Float64Array(N);
/** How worth it is to kill them first (1 = a grunt). */
export const PRIORITY = new Float64Array(N);

ENEMY_TYPES.forEach((id, i) => {
  const s = BALANCE.enemies[id];
  SPEED[i] = s.speed;
  RADIUS[i] = s.radius;
  HP[i] = s.hp;
  const dmg = (s.damage * BALANCE.enemyDamageMul) / 10;
  BLOW[i] = dmg;
  DPS[i] = s.interval > 0 ? dmg / Math.max(0.5, s.interval) : dmg;
  PRIORITY[i] = 1;
});

// Contact is not their danger; the attacks are. The numbers are in sim/balance.json `special`.
STAND_OFF[T.exploder] = BALANCE.enemies.exploder.blastRadius! * BALANCE.hitbox.enemyMul + 0.8;
STAND_OFF[T.bloater] = BALANCE.enemies.bloater.blastRadius! * BALANCE.hitbox.enemyMul + 0.4;
STAND_OFF[T.sledge] = 3.5;
STAND_OFF[T.lamper] = 5;
STAND_OFF[T.shocker] = 5.5;
STAND_OFF[T.quaker] = 6.5;
STAND_OFF[T.grabber] = 3.5;
STAND_OFF[T.flamer] = 5;
STAND_OFF[T.magnetar] = 9;
STAND_OFF[T.chopper] = 2.5;
STAND_OFF[T.tank] = 1;
STAND_OFF[T.rammer] = 2;
STAND_OFF[T.pouncer] = 1;
STAND_OFF[T.leaper] = 1.5;

for (const name of ['spitter', 'mortar', 'reviver', 'marksman', 'trapper', 'warcaller'] as const) RANGED[T[name]] = 1;
HOLD[T.spitter] = 6;
HOLD[T.mortar] = BALANCE.special.mortar!.keep!;
HOLD[T.reviver] = BALANCE.special.reviver!.keep!;
HOLD[T.marksman] = BALANCE.special.marksman!.keep!;
HOLD[T.trapper] = BALANCE.special.trapper!.keep!;
HOLD[T.warcaller] = BALANCE.special.warcaller!.keep!;
// a spawner stands off, harmless to touch
RANGED[T.spawner] = 0;
BLOW[T.spawner] = 0;
DPS[T.spawner] = 0;

// kill order: the ones that break a run come first
PRIORITY[T.exploder] = 5;
PRIORITY[T.bloater] = 1.6;
PRIORITY[T.spawner] = 3;
PRIORITY[T.reviver] = 2.5;
PRIORITY[T.warcaller] = 2.5;
PRIORITY[T.marksman] = 2.5;
PRIORITY[T.mortar] = 2.2;
PRIORITY[T.trapper] = 2.2;
PRIORITY[T.spitter] = 2;
PRIORITY[T.acider] = 1.6;
PRIORITY[T.flamer] = 1.8;
PRIORITY[T.magnetar] = 2;
PRIORITY[T.blinker] = 1.6;
PRIORITY[T.leaper] = 1.4;
PRIORITY[T.pouncer] = 1.6;
PRIORITY[T.runner] = 1.15;
PRIORITY[T.brood] = 1.3;
PRIORITY[T.hurler] = 1.6;
PRIORITY[T.spiker] = 1.5;
PRIORITY[T.shocker] = 1.5;
PRIORITY[T.chopper] = 1.4;
PRIORITY[T.shielder] = 0.7;
// the ones whose attacks hurt most when they land
PRIORITY[T.spiker] = 2.8;
PRIORITY[T.chopper] = 2.4;
PRIORITY[T.shocker] = 2.4;
PRIORITY[T.sledge] = 2;
PRIORITY[T.lamper] = 2;
PRIORITY[T.quaker] = 2.2;
PRIORITY[T.grabber] = 2.2;
PRIORITY[T.rammer] = 2;
PRIORITY[T.hurler] = 2.2;

/** What the late floors add to every blow (see sim `lateFloors`). */
export function lateScale(wave: number): number {
  return wave > BALANCE.late.start ? 1 + (wave - BALANCE.late.start) * BALANCE.late.damagePerFloor : 1;
}

/** Speed of an enemy in units per second, with its elite effects (floor effects such as a swift floor are read from the measured velocity). */
export function speedOf(e: Threat): number {
  let s = SPEED[e.type]!;
  if (e.elite === ELITE_ID.Swift) s *= BALANCE.elites.swiftSpeed;
  else if (e.elite === ELITE_ID.Giant) s *= BALANCE.elites.giantSpeed;
  else if (e.elite === ELITE_ID.Berserk) s *= 1.25;
  return s;
}

/** Body radius of an enemy with its elite and boss effects. */
export function radiusOf(e: Threat): number {
  let r = RADIUS[e.type]!;
  if (e.elite === ELITE_ID.Giant) r *= BALANCE.elites.giantRadius;
  if (e.boss) r *= BALANCE.progression.boss.radiusMul;
  return r;
}

/** Is this the kind of enemy that goes off when it dies or touches (so it must die at a distance)? */
export const bursts = (e: Threat): boolean => e.type === T.exploder || e.elite === ELITE_ID.Volatile;

/** Pain a ground attack deals to someone standing in it when it lands. */
export function telePain(t: Telegraph, maxHp: number, hp: number, wave: number): number {
  switch (t.effect) {
    case TeleEffect.Hurt:
      return (t.amt < 0 ? Math.min(0.95, -t.amt) * maxHp : t.amt * BALANCE.enemyDamageMul * lateScale(wave)) / 10;
    case TeleEffect.Half:
      return hp * 0.05 + 3;
    case TeleEffect.Kill:
      return hp / 10 + 20;
    case TeleEffect.Acid:
      return 0.5;
    case TeleEffect.None:
      // a warning of something that follows (a ram, a pull, a grab)
      return t.shape === 0 ? 2.5 : 4;
    default:
      return 0;
  }
}
