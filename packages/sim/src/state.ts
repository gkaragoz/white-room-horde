import { MAX_BULLETS, MAX_PLAYERS } from '@wrh/shared';
import { Rng } from './rng';

/** Events emitted by a step for the client (VFX, audio). They never feed back into the simulation. */
export type SimEvent =
  | { type: 'shot'; slot: number; weapon: number; x: number; y: number; angle: number }
  | { type: 'bulletGone'; x: number; y: number };

/** Struct-of-arrays world (docs/DESIGN.md section 15): fixed-size pools, ids are slot indices. */
export interface World {
  tick: number;
  rng: Rng;
  // players
  pActive: Uint8Array;
  pX: Float64Array;
  pY: Float64Array;
  pAngle: Float64Array;
  pHp: Float64Array;
  pCooldown: Float64Array;
  pWeapon: Int32Array;
  pAmmo: Int32Array;
  pMoving: Uint8Array;
  // bullets
  bActive: Uint8Array;
  bX: Float64Array;
  bY: Float64Array;
  bVx: Float64Array;
  bVy: Float64Array;
  bLife: Float64Array;
  bDamage: Float64Array;
  bOwner: Int32Array;
  events: SimEvent[];
}

export function createWorld(seed: number): World {
  return {
    tick: 0,
    rng: new Rng(seed),
    pActive: new Uint8Array(MAX_PLAYERS),
    pX: new Float64Array(MAX_PLAYERS),
    pY: new Float64Array(MAX_PLAYERS),
    pAngle: new Float64Array(MAX_PLAYERS),
    pHp: new Float64Array(MAX_PLAYERS),
    pCooldown: new Float64Array(MAX_PLAYERS),
    pWeapon: new Int32Array(MAX_PLAYERS),
    pAmmo: new Int32Array(MAX_PLAYERS),
    pMoving: new Uint8Array(MAX_PLAYERS),
    bActive: new Uint8Array(MAX_BULLETS),
    bX: new Float64Array(MAX_BULLETS),
    bY: new Float64Array(MAX_BULLETS),
    bVx: new Float64Array(MAX_BULLETS),
    bVy: new Float64Array(MAX_BULLETS),
    bLife: new Float64Array(MAX_BULLETS),
    bDamage: new Float64Array(MAX_BULLETS),
    bOwner: new Int32Array(MAX_BULLETS),
    events: [],
  };
}
