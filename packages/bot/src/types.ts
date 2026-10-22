import type { PlayerInput } from '@wrh/shared';
import type { World } from '@wrh/sim';

/** How well a bot plays. Easy to Superhuman differ in reaction time, aim error and how often they decide (see skill.ts). */
export type Skill = 'easy' | 'normal' | 'expert' | 'superhuman';
export const SKILLS: readonly Skill[] = ['easy', 'normal', 'expert', 'superhuman'];

/** What one bot is told when it is made. */
export interface BotConfig {
  slot: number;
  skill: Skill;
  /** Seeds the bot's own random stream (never the world's): the same seed and world give the same inputs. */
  seed: number;
}

/** Numbers that make a bot weaker or stronger. Only skill.ts decides them. */
export interface SkillProfile {
  /** Ticks (30 per second) between the world and what the bot reacts to. */
  reactionTicks: number;
  /** Standard deviation of the aim error in radians. */
  aimError: number;
  /** The bot decides again every this many ticks and repeats its last decision in between (1 = every tick). */
  decisionEvery: number;
  /** 0..1: how well it leaves ground attacks and keeps away from danger. */
  dodge: number;
  /** 0..1: how well it picks targets, cards and weapons. */
  judgement: number;
}

/** A threat on the field, as the bot sees it. */
export interface Threat {
  id: number;
  x: number;
  y: number;
  /** Squared distance to the bot. */
  d2: number;
  type: number;
  boss: boolean;
  elite: number;
  hp: number;
  maxHp: number;
  /** Velocity estimate per tick from the previous perception (0 when unknown). */
  vx: number;
  vy: number;
  /** 0 ground, 1 deck (see layers). */
  layer: number;
}

/** A ground attack that is charging (a red area). */
export interface Telegraph {
  x: number;
  y: number;
  /** 0 circle, otherwise a rectangle (see the sim). */
  shape: number;
  w: number;
  l: number;
  /** Ticks left until it lands, when known (-1 otherwise). */
  eta: number;
  /** TeleEffect: what it does when it lands (Hurt, Half, Kill, Acid, None = only a warning, Strike = our own airstrike). */
  effect: number;
  /** Rotation of a rectangle (radians). */
  angle: number;
  /** Damage it carries: positive flat, negative a share of the victim's max health (boss attacks). */
  amt: number;
}

/** Lingering ground damage (acid, fire). */
export interface Zone {
  x: number;
  y: number;
  r: number;
  /** Ticks until it fades. */
  left: number;
  /** ZoneKind. */
  kind: number;
}

/** A spitter's glob in the air. */
export interface Spit {
  x: number;
  y: number;
  /** Units per second. */
  vx: number;
  vy: number;
  /** Seconds of flight left. */
  life: number;
  layer: number;
}

export interface Ally {
  slot: number;
  x: number;
  y: number;
  state: number;
  hp: number;
  maxHp: number;
  human: boolean;
}

export interface Pickup {
  layer?: number;
  id: number;
  x: number;
  y: number;
  type: number;
  data: number;
}

/** Everything a bot knows at one tick: a snapshot of the parts of the world it cares about, in plain numbers. */
export interface Percept {
  tick: number;
  wave: number;
  slot: number;
  x: number;
  y: number;
  /** Aim angle in radians the character faces now. */
  angle: number;
  hp: number;
  maxHp: number;
  /** State of this player (PlayerState). */
  state: number;
  layer: number;
  mag: number;
  weapon: number;
  /** Active enemies, nearest first (at most 96). */
  enemies: Threat[];
  telegraphs: Telegraph[];
  /** Acid and fire on the ground. */
  zones: Zone[];
  /** Spitter globs in flight. */
  spits: Spit[];
  pickups: Pickup[];
  allies: Ally[];
  /** A card offer waits for this player (card indices), or an empty list. */
  offer: number[];
  /** The floor phase (FloorPhase): fighting, cleared, ... */
  phase: number;
  /** Grenades left. */
  grenades: number;
  /** The world this was read from (for modules that need a field the snapshot does not carry). Read only. */
  world: World;
}

/** Per bot memory that survives from tick to tick (each module keeps what it needs under its own key). */
export interface Memory {
  [module: string]: unknown;
}

/** What every module gets besides the percept. */
export interface Ctx {
  skill: SkillProfile;
  /** The bot's own deterministic random numbers in [0, 1). */
  rand: () => number;
  /** Persistent memory (see `Memory`). */
  mem: Memory;
}

export interface MoveDecision {
  /** Unit-length or shorter direction in sim axes (x right, y forward). */
  x: number;
  y: number;
  dash: boolean;
}

export interface CombatDecision {
  /** Radians. */
  aim: number;
  /** Distance to aim at (sim units), for lobbed shots and grenades; 0 = not given. */
  aimDist: number;
  fire: boolean;
  reload: boolean;
  grenade: { throw: boolean; aim: number };
  /** Use the class ability. */
  special: boolean;
}

export interface BuildDecision {
  /** 0 = nothing, 1..3 = take that card of the offer. */
  card: 0 | 1 | 2 | 3;
  /** 0 = keep, otherwise WEAPON_IDS index + 1. */
  wsel: number;
  /** 0 = keep, otherwise DRONE_TYPES index + 1. */
  dsel: number;
}

export interface TeamDecision {
  /** Hold the revive button (standing at a downed friend). */
  revive: boolean;
  /** A pull toward (or away from) where the squad wants this bot to be, added to the movement as a steering force. */
  bias: { x: number; y: number };
}

export type InputOf = PlayerInput;
