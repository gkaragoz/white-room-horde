import { MAX_BULLETS, MAX_ENEMIES, MAX_PLAYERS } from '@wrh/shared';
import { FlowField } from './flowfield';
import { Rng } from './rng';
import { SpatialHash } from './spatial';

/** Events emitted by a step for the client (VFX, audio). They never feed back into the simulation. */
export type SimEvent =
  | { type: 'shot'; slot: number; weapon: number; x: number; y: number; angle: number }
  | { type: 'bulletGone'; x: number; y: number }
  | { type: 'enemyHit'; id: number; etype: number; x: number; y: number }
  | { type: 'enemyDeath'; id: number; etype: number; x: number; y: number; dx: number; dy: number; power: number }
  | { type: 'playerHit'; slot: number; x: number; y: number; damage: number }
  | { type: 'explosion'; x: number; y: number; radius: number };

/** Struct-of-arrays world (docs/DESIGN.md section 15): fixed-size pools, ids are slot indices. */
export interface World {
  tick: number;
  rng: Rng;
  wave: number;
  waveTick: number;
  /** Multipliers for the current wave (count growth, enemy hp growth). Derived from `wave`, kept for speed. */
  countMul: number;
  hpMul: number;
  kills: number;
  enemyCount: number;
  // players
  pActive: Uint8Array;
  pX: Float64Array;
  pY: Float64Array;
  pAngle: Float64Array;
  pHp: Float64Array;
  pCooldown: Float64Array;
  pIFrames: Float64Array;
  pWeapon: Int32Array;
  pAmmo: Int32Array;
  pMoving: Uint8Array;
  // enemies
  eActive: Uint8Array;
  eType: Uint8Array;
  eState: Uint8Array;
  eStateTick: Int32Array;
  eX: Float64Array;
  eY: Float64Array;
  eAngle: Float64Array;
  eHp: Float64Array;
  eCooldown: Float64Array;
  // bullets
  bActive: Uint8Array;
  bX: Float64Array;
  bY: Float64Array;
  bVx: Float64Array;
  bVy: Float64Array;
  bLife: Float64Array;
  bDamage: Float64Array;
  bOwner: Int32Array;
  bPierce: Int8Array;
  /** Last four enemy slots a bullet hit (so a piercing bullet never hits one enemy twice). */
  bHit: Int32Array;
  events: SimEvent[];
  // derived data, rebuilt from the fields above (never hashed)
  field: FlowField;
  grid: SpatialHash;
}

export function createWorld(seed: number): World {
  return {
    tick: 0,
    rng: new Rng(seed),
    wave: 1,
    waveTick: 0,
    countMul: 1,
    hpMul: 1,
    kills: 0,
    enemyCount: 0,
    pActive: new Uint8Array(MAX_PLAYERS),
    pX: new Float64Array(MAX_PLAYERS),
    pY: new Float64Array(MAX_PLAYERS),
    pAngle: new Float64Array(MAX_PLAYERS),
    pHp: new Float64Array(MAX_PLAYERS),
    pCooldown: new Float64Array(MAX_PLAYERS),
    pIFrames: new Float64Array(MAX_PLAYERS),
    pWeapon: new Int32Array(MAX_PLAYERS),
    pAmmo: new Int32Array(MAX_PLAYERS),
    pMoving: new Uint8Array(MAX_PLAYERS),
    eActive: new Uint8Array(MAX_ENEMIES),
    eType: new Uint8Array(MAX_ENEMIES),
    eState: new Uint8Array(MAX_ENEMIES),
    eStateTick: new Int32Array(MAX_ENEMIES),
    eX: new Float64Array(MAX_ENEMIES),
    eY: new Float64Array(MAX_ENEMIES),
    eAngle: new Float64Array(MAX_ENEMIES),
    eHp: new Float64Array(MAX_ENEMIES),
    eCooldown: new Float64Array(MAX_ENEMIES),
    bActive: new Uint8Array(MAX_BULLETS),
    bX: new Float64Array(MAX_BULLETS),
    bY: new Float64Array(MAX_BULLETS),
    bVx: new Float64Array(MAX_BULLETS),
    bVy: new Float64Array(MAX_BULLETS),
    bLife: new Float64Array(MAX_BULLETS),
    bDamage: new Float64Array(MAX_BULLETS),
    bOwner: new Int32Array(MAX_BULLETS),
    bPierce: new Int8Array(MAX_BULLETS),
    bHit: new Int32Array(MAX_BULLETS * 4).fill(-1),
    events: [],
    field: new FlowField(),
    grid: new SpatialHash(),
  };
}
