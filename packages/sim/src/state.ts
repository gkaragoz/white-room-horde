import { BALANCE, CARD_IDS, MAX_BARRELS, MAX_BULLETS, MAX_ENEMIES, MAX_GRENADES, MAX_PICKUPS, MAX_PLAYERS, MAX_SPIT, MAX_TELE, MAX_ZONES, PERKS, WEAPON_IDS } from '@wrh/shared';
import { FlowField } from './flowfield';
import { applyObstacles } from './obstacles';
import { Rng } from './rng';
import { SpatialHash } from './spatial';

/** Events emitted by a step for the client (VFX, audio). They never feed back into the simulation. */
export type SimEvent =
  | { type: 'shot'; slot: number; weapon: number; x: number; y: number; angle: number }
  /** reason: 0 range ended, 1 hit cover, 2 hit an enemy */
  | { type: 'bulletGone'; x: number; y: number; angle: number; reason: number }
  | { type: 'enemyHit'; id: number; etype: number; x: number; y: number; damage: number; by: number }
  | { type: 'enemyDeath'; id: number; etype: number; x: number; y: number; dx: number; dy: number; power: number }
  | { type: 'playerHit'; slot: number; x: number; y: number; damage: number }
  | { type: 'weaponSwitch'; slot: number; weapon: number; auto: boolean }
  | { type: 'weaponGet'; slot: number; weapon: number; fresh: boolean }
  | { type: 'secondWind'; slot: number }
  | { type: 'barrelHit'; x: number; y: number }
  | { type: 'nuke'; x: number; y: number }
  | { type: 'freeze'; seconds: number }
  | { type: 'explosion'; x: number; y: number; radius: number }
  | { type: 'grenadeThrown'; owner: number; x: number; y: number }
  | { type: 'spit'; x: number; y: number; angle: number }
  | { type: 'pickupDrop'; kind: number; x: number; y: number }
  | { type: 'pickup'; kind: number; slot: number; x: number; y: number }
  | { type: 'reloadStart'; slot: number }
  | { type: 'reloadDone'; slot: number }
  | { type: 'dash'; slot: number; x: number; y: number }
  | { type: 'bossAbility'; kind: 'charge' | 'summon' | 'aura' | 'slam' | 'meteor' | 'acid' | 'sweep' | 'purge'; x: number; y: number }
  | { type: 'playerDown'; slot: number; x: number; y: number }
  | { type: 'playerDead'; slot: number }
  | { type: 'playerRevive'; slot: number }
  | { type: 'waveCleared'; wave: number }
  | { type: 'floorAscend'; from: number; to: number; map: number }
  | { type: 'floorEnter'; wave: number; map: number }
  | { type: 'floorArrive'; wave: number }
  | { type: 'waveStart'; wave: number; boss: boolean; mod: number }
  | { type: 'levelUp'; slot: number; level: number }
  | { type: 'cardOffer'; slot: number; cards: number[] }
  | { type: 'cardPicked'; card: number; by: number }
  | { type: 'thaw' }
  /** The last enemy of a floor fell: `by` is the character who landed the blow (-1 none). The floor-clear countdown starts after the finisher. */
  | { type: 'finalKill'; by: number; x: number; y: number }
  /** A telegraphed attack starts charging (shape and effect: see TeleShape, TeleEffect) / lands. */
  | { type: 'telegraph'; shape: number; x: number; y: number }
  | { type: 'teleHit'; shape: number; effect: number; x: number; y: number; radius: number }
  | { type: 'launch'; slot: number; x: number; y: number }
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
  /** 0 easy, 1 normal, 2 hard (scales enemy hp, count and damage) and the arena layout index. */
  difficulty: number;
  map: number;
  /** Team modifier from a card that helps everybody: loot luck. All the other upgrades are per player (arrays below). */
  modLoot: number;
  /** Per player: experience, level, levels waiting for a card offer, the open offer (3 card ids per slot, all -1 = none) and its ticks left. */
  pXp: Float64Array;
  pLevel: Int32Array;
  pPending: Int32Array;
  pOffer: Int32Array;
  pCardTimer: Int32Array;
  /** Ticks after a pick during which no further offer opens, and the card buttons held on the previous tick (a pick needs a fresh press). */
  pCardLock: Int32Array;
  pCardPrev: Int32Array;
  /** How many times each character took each card (card id index), for the relic bar. */
  pCards: Uint8Array;
  /** Per player upgrades from cards (multipliers start at 1, pierce and crit chance at 0). */
  modDamage: Float64Array;
  modRate: Float64Array;
  modSpeed: Float64Array;
  modPierce: Float64Array;
  modRevive: Float64Array;
  modMagnet: Float64Array;
  modXp: Float64Array;
  modBlast: Float64Array;
  modReload: Float64Array;
  modDash: Float64Array;
  modArmor: Float64Array;
  modCrit: Float64Array;
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
  /** Inventory: bitmask of the weapons (indices into WEAPON_IDS) a player owns for good, and the magazine / reserve of every weapon that is not in the hands (`pMag`/`pAmmo` hold the one that is). */
  pOwned: Int32Array;
  pInvMag: Int32Array;
  pInvAmmo: Int32Array;
  pMoving: Uint8Array;
  /** Rounds in the magazine, reload countdown (s), dash ticks left / cooldown (s) / direction, personal card multipliers. */
  pMag: Int32Array;
  pReload: Float64Array;
  pDash: Int32Array;
  pDashCd: Float64Array;
  pDashX: Float64Array;
  pDashY: Float64Array;
  pModDmg: Float64Array;
  pModSpeed: Float64Array;
  pModRate: Float64Array;
  pModPierce: Int32Array;
  pModArmor: Float64Array;
  pLifesteal: Float64Array;
  /** Class passives, card effects and timers per player (see PERK in shared/types). */
  pPerk: Float64Array;
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
  /** Per-enemy scratch: boss charge ticks left. */
  eAux: Float64Array;
  eCooldown: Float64Array;
  /** Elite modifier of an enemy (0 none; see ELITE in features.ts). */
  eMod: Uint8Array;
  /** Ticks an enemy stays frozen (stands still, no attacks). */
  eFrost: Int32Array;
  /** Per player: stun ticks (no steering, no shooting), the push velocity from a blow and ticks spent in the air (the toss). */
  pStun: Int32Array;
  pKnockX: Float64Array;
  pKnockY: Float64Array;
  pAir: Int32Array;
  /** Lingering ground effects (acid, fire): kind, centre, radius, ticks left. */
  zActive: Uint8Array;
  zKind: Uint8Array;
  zX: Float64Array;
  zY: Float64Array;
  zR: Float64Array;
  zLeft: Int32Array;
  /** Telegraphed ground attacks that are charging: shape, effect, geometry (centre, angle, half width / radius, length), amount, ticks left of ticks total. */
  tActive: Uint8Array;
  tShape: Uint8Array;
  tEffect: Uint8Array;
  tX: Float64Array;
  tY: Float64Array;
  tA: Float64Array;
  tW: Float64Array;
  tL: Float64Array;
  tAmt: Float64Array;
  tLeft: Int32Array;
  tTotal: Int32Array;
  // explosive barrels
  brActive: Uint8Array;
  brX: Float64Array;
  brY: Float64Array;
  brHp: Float64Array;
  brT: Float64Array;
  /** Misc world numbers: [0] seconds enemies stay frozen, [1] enemies of this wave still to arrive, [2] tick the wave was cleared (0 = not yet), [3] size of this wave. */
  misc: Float64Array;
  // grenades
  gActive: Uint8Array;
  gX: Float64Array;
  gY: Float64Array;
  gVx: Float64Array;
  gVy: Float64Array;
  gFuse: Float64Array;
  gOwner: Int32Array;
  // pickups
  kActive: Uint8Array;
  kType: Uint8Array;
  kX: Float64Array;
  kY: Float64Array;
  kLife: Float64Array;
  /** Weapon index for weapon pickups. */
  kData: Int32Array;
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

export function createWorld(seed: number, map = 0, difficulty = 1): World {
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
    difficulty,
    map,
    modLoot: 1,
    pXp: new Float64Array(MAX_PLAYERS),
    pLevel: new Int32Array(MAX_PLAYERS).fill(1),
    pPending: new Int32Array(MAX_PLAYERS),
    pOffer: new Int32Array(MAX_PLAYERS * 3).fill(-1),
    pCardTimer: new Int32Array(MAX_PLAYERS),
    pCardLock: new Int32Array(MAX_PLAYERS),
    pCardPrev: new Int32Array(MAX_PLAYERS),
    pCards: new Uint8Array(MAX_PLAYERS * CARD_IDS.length),
    modDamage: new Float64Array(MAX_PLAYERS).fill(1),
    modRate: new Float64Array(MAX_PLAYERS).fill(1),
    modSpeed: new Float64Array(MAX_PLAYERS).fill(1),
    modPierce: new Float64Array(MAX_PLAYERS),
    modRevive: new Float64Array(MAX_PLAYERS).fill(1),
    modMagnet: new Float64Array(MAX_PLAYERS).fill(1),
    modXp: new Float64Array(MAX_PLAYERS).fill(1),
    modBlast: new Float64Array(MAX_PLAYERS).fill(1),
    modReload: new Float64Array(MAX_PLAYERS).fill(1),
    modDash: new Float64Array(MAX_PLAYERS).fill(1),
    modArmor: new Float64Array(MAX_PLAYERS).fill(1),
    modCrit: new Float64Array(MAX_PLAYERS),
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
    pOwned: new Int32Array(MAX_PLAYERS),
    pInvMag: new Int32Array(MAX_PLAYERS * WEAPON_IDS.length),
    pInvAmmo: new Int32Array(MAX_PLAYERS * WEAPON_IDS.length),
    pMoving: new Uint8Array(MAX_PLAYERS),
    pMag: new Int32Array(MAX_PLAYERS),
    pReload: new Float64Array(MAX_PLAYERS),
    pDash: new Int32Array(MAX_PLAYERS),
    pDashCd: new Float64Array(MAX_PLAYERS),
    pDashX: new Float64Array(MAX_PLAYERS),
    pDashY: new Float64Array(MAX_PLAYERS),
    pModDmg: new Float64Array(MAX_PLAYERS).fill(1),
    pModSpeed: new Float64Array(MAX_PLAYERS).fill(1),
    pModRate: new Float64Array(MAX_PLAYERS).fill(1),
    pModPierce: new Int32Array(MAX_PLAYERS),
    pModArmor: new Float64Array(MAX_PLAYERS).fill(1),
    pLifesteal: new Float64Array(MAX_PLAYERS),
    pPerk: new Float64Array(MAX_PLAYERS * PERKS),
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
    eAux: new Float64Array(MAX_ENEMIES),
    eCooldown: new Float64Array(MAX_ENEMIES),
    eMod: new Uint8Array(MAX_ENEMIES),
    eFrost: new Int32Array(MAX_ENEMIES),
    pStun: new Int32Array(MAX_PLAYERS),
    pKnockX: new Float64Array(MAX_PLAYERS),
    pKnockY: new Float64Array(MAX_PLAYERS),
    pAir: new Int32Array(MAX_PLAYERS),
    zActive: new Uint8Array(MAX_ZONES),
    zKind: new Uint8Array(MAX_ZONES),
    zX: new Float64Array(MAX_ZONES),
    zY: new Float64Array(MAX_ZONES),
    zR: new Float64Array(MAX_ZONES),
    zLeft: new Int32Array(MAX_ZONES),
    tActive: new Uint8Array(MAX_TELE),
    tShape: new Uint8Array(MAX_TELE),
    tEffect: new Uint8Array(MAX_TELE),
    tX: new Float64Array(MAX_TELE),
    tY: new Float64Array(MAX_TELE),
    tA: new Float64Array(MAX_TELE),
    tW: new Float64Array(MAX_TELE),
    tL: new Float64Array(MAX_TELE),
    tAmt: new Float64Array(MAX_TELE),
    tLeft: new Int32Array(MAX_TELE),
    tTotal: new Int32Array(MAX_TELE),
    brActive: new Uint8Array(MAX_BARRELS),
    brX: new Float64Array(MAX_BARRELS),
    brY: new Float64Array(MAX_BARRELS),
    brHp: new Float64Array(MAX_BARRELS),
    brT: new Float64Array(MAX_BARRELS),
    misc: new Float64Array(12),
    gActive: new Uint8Array(MAX_GRENADES),
    gX: new Float64Array(MAX_GRENADES),
    gY: new Float64Array(MAX_GRENADES),
    gVx: new Float64Array(MAX_GRENADES),
    gVy: new Float64Array(MAX_GRENADES),
    gFuse: new Float64Array(MAX_GRENADES),
    gOwner: new Int32Array(MAX_GRENADES),
    kActive: new Uint8Array(MAX_PICKUPS),
    kType: new Uint8Array(MAX_PICKUPS),
    kX: new Float64Array(MAX_PICKUPS),
    kY: new Float64Array(MAX_PICKUPS),
    kLife: new Float64Array(MAX_PICKUPS),
    kData: new Int32Array(MAX_PICKUPS),
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
  applyObstacles(w.field, map);
  return w;
}
