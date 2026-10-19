import { BALANCE, MAX_BULLETS, MAX_ENEMIES, MAX_GRENADES, MAX_PLAYERS, MAX_SPIT } from '@wrh/shared';
import { FlowField } from './flowfield';
import { applyObstacles } from './obstacles';
import { Rng } from './rng';
import { SpatialHash } from './spatial';

/** Events emitted by a step for the client (VFX, audio). They never feed back into the simulation. */
export type SimEvent =
  | { type: 'shot'; slot: number; weapon: number; x: number; y: number; angle: number }
  | { type: 'bulletGone'; x: number; y: number }
  | { type: 'enemyHit'; id: number; etype: number; x: number; y: number }
  | { type: 'enemyDeath'; id: number; etype: number; x: number; y: number; dx: number; dy: number; power: number }
  | { type: 'playerHit'; slot: number; x: number; y: number; damage: number }
  | { type: 'explosion'; x: number; y: number; radius: number }
  | { type: 'grenadeThrown'; owner: number; x: number; y: number }
  | { type: 'spit'; x: number; y: number; angle: number }
  | { type: 'playerDown'; slot: number; x: number; y: number }
  | { type: 'playerDead'; slot: number }
  | { type: 'playerRevive'; slot: number }
  | { type: 'waveStart'; wave: number; boss: boolean }
  | { type: 'levelUp'; level: number }
  | { type: 'cardOffer'; cards: number[] }
  | { type: 'cardPicked'; card: number; by: number }
  | { type: 'gameOver'; wave: number; kills: number };

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
  gameOver: number;
  xp: number;
  level: number;
  pendingLevels: number;
  /** Open card offer (card ids) or all -1; cardTimer counts ticks left to choose. */
  cardOffer: Int32Array;
  cardTimer: number;
  /** Team modifiers from cards. */
  modDamage: number;
  modRate: number;
  modSpeed: number;
  modPierce: number;
  modHp: number;
  // players
  pActive: Uint8Array;
  pX: Float64Array;
  pY: Float64Array;
  pAngle: Float64Array;
  pHp: Float64Array;
  pMaxHp: Float64Array;
  pState: Uint8Array;
  /** Downed countdown (seconds). */
  pTimer: Float64Array;
  /** Revive progress (seconds) while being revived. */
  pRevive: Float64Array;
  pCooldown: Float64Array;
  pIFrames: Float64Array;
  pWeapon: Int32Array;
  pAmmo: Int32Array;
  pMoving: Uint8Array;
  pGren: Int32Array;
  pGrenCharge: Float64Array;
  pGrenCd: Float64Array;
  // enemies
  eActive: Uint8Array;
  eType: Uint8Array;
  eState: Uint8Array;
  eStateTick: Int32Array;
  eX: Float64Array;
  eY: Float64Array;
  eAngle: Float64Array;
  eHp: Float64Array;
  eBoss: Uint8Array;
  eCooldown: Float64Array;
  // grenades
  gActive: Uint8Array;
  gX: Float64Array;
  gY: Float64Array;
  gVx: Float64Array;
  gVy: Float64Array;
  gFuse: Float64Array;
  gOwner: Int32Array;
  // spitter projectiles
  sActive: Uint8Array;
  sX: Float64Array;
  sY: Float64Array;
  sVx: Float64Array;
  sVy: Float64Array;
  sLife: Float64Array;
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
  const w: World = {
    tick: 0,
    rng: new Rng(seed),
    wave: 1,
    waveTick: 0,
    countMul: 1,
    hpMul: 1,
    kills: 0,
    enemyCount: 0,
    gameOver: 0,
    xp: 0,
    level: 1,
    pendingLevels: 0,
    cardOffer: new Int32Array(3).fill(-1),
    cardTimer: 0,
    modDamage: 1,
    modRate: 1,
    modSpeed: 1,
    modPierce: 0,
    modHp: 0,
    pActive: new Uint8Array(MAX_PLAYERS),
    pX: new Float64Array(MAX_PLAYERS),
    pY: new Float64Array(MAX_PLAYERS),
    pAngle: new Float64Array(MAX_PLAYERS),
    pHp: new Float64Array(MAX_PLAYERS),
    pMaxHp: new Float64Array(MAX_PLAYERS),
    pState: new Uint8Array(MAX_PLAYERS),
    pTimer: new Float64Array(MAX_PLAYERS),
    pRevive: new Float64Array(MAX_PLAYERS),
    pCooldown: new Float64Array(MAX_PLAYERS),
    pIFrames: new Float64Array(MAX_PLAYERS),
    pWeapon: new Int32Array(MAX_PLAYERS),
    pAmmo: new Int32Array(MAX_PLAYERS),
    pMoving: new Uint8Array(MAX_PLAYERS),
    pGren: new Int32Array(MAX_PLAYERS).fill(BALANCE.grenade.max),
    pGrenCharge: new Float64Array(MAX_PLAYERS),
    pGrenCd: new Float64Array(MAX_PLAYERS),
    eActive: new Uint8Array(MAX_ENEMIES),
    eType: new Uint8Array(MAX_ENEMIES),
    eState: new Uint8Array(MAX_ENEMIES),
    eStateTick: new Int32Array(MAX_ENEMIES),
    eX: new Float64Array(MAX_ENEMIES),
    eY: new Float64Array(MAX_ENEMIES),
    eAngle: new Float64Array(MAX_ENEMIES),
    eHp: new Float64Array(MAX_ENEMIES),
    eBoss: new Uint8Array(MAX_ENEMIES),
    eCooldown: new Float64Array(MAX_ENEMIES),
    gActive: new Uint8Array(MAX_GRENADES),
    gX: new Float64Array(MAX_GRENADES),
    gY: new Float64Array(MAX_GRENADES),
    gVx: new Float64Array(MAX_GRENADES),
    gVy: new Float64Array(MAX_GRENADES),
    gFuse: new Float64Array(MAX_GRENADES),
    gOwner: new Int32Array(MAX_GRENADES),
    sActive: new Uint8Array(MAX_SPIT),
    sX: new Float64Array(MAX_SPIT),
    sY: new Float64Array(MAX_SPIT),
    sVx: new Float64Array(MAX_SPIT),
    sVy: new Float64Array(MAX_SPIT),
    sLife: new Float64Array(MAX_SPIT),
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
  applyObstacles(w.field);
  return w;
}
