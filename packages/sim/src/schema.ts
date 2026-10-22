import {
  CARD_IDS,
  DRONE_TYPES,
  MAX_BARRELS,
  MAX_BULLETS,
  MAX_ENEMIES,
  MAX_GRENADES,
  MAX_PICKUPS,
  MAX_PLAYERS,
  MAX_SPIT,
  MAX_TELE,
  MAX_ZONES,
  PERKS,
  STATS,
  WEAPON_IDS,
  WEAPON_SLOTS,
  BALANCE,
} from '@wrh/shared';

/**
 * The WorldSchema: the one declaration of every field a World carries between ticks (docs/DESIGN.md section 15).
 * `createWorld`, the snapshot and the world hash are all derived from it, so a field is added in exactly one place.
 * Every field is snapshotted. Every field is hashed unless it names a reason under `unhashed` (derived or cache data
 * that other fields already determine).
 */

export type TypedArray = Float64Array | Int32Array | Uint8Array | Int8Array;
type ArrayCtor =
  Float64ArrayConstructor | Int32ArrayConstructor | Uint8ArrayConstructor | Int8ArrayConstructor;

export interface ArrayField<C extends ArrayCtor = ArrayCtor> {
  readonly ctor: C;
  readonly length: number;
  readonly fill: number;
  /** Why this array is left out of the world hash (it is still snapshotted). */
  readonly unhashed?: string;
}

export interface ScalarField {
  readonly init: number | ((setup: { map: number; mods: number }) => number);
  readonly unhashed?: string;
}

const f64 = (length: number, fill = 0, unhashed?: string): ArrayField<Float64ArrayConstructor> => ({
  ctor: Float64Array,
  length,
  fill,
  unhashed,
});
const i32 = (length: number, fill = 0, unhashed?: string): ArrayField<Int32ArrayConstructor> => ({
  ctor: Int32Array,
  length,
  fill,
  unhashed,
});
const u8 = (length: number, fill = 0, unhashed?: string): ArrayField<Uint8ArrayConstructor> => ({
  ctor: Uint8Array,
  length,
  fill,
  unhashed,
});
const i8 = (length: number, fill = 0, unhashed?: string): ArrayField<Int8ArrayConstructor> => ({
  ctor: Int8Array,
  length,
  fill,
  unhashed,
});
const num = (init: ScalarField['init'], unhashed?: string): ScalarField => ({ init, unhashed });

/** Single numbers, in snapshot order. */
export const SCALARS = {
  tick: num(0),
  wave: num(1),
  waveTick: num(0),
  /** Multipliers for the current wave (count growth, enemy hp growth). Derived from `wave`, kept for speed. */
  countMul: num(1, 'derived from wave'),
  hpMul: num(1, 'derived from wave'),
  kills: num(0),
  enemyCount: num(0),
  gameOver: num(0),
  /** Bit mask of the difficulty multipliers (see shared/mods.ts). */
  mods: num((s) => s.mods),
  /** The arena layout index. */
  map: num((s) => s.map),
  /** Team modifier from a card that helps everybody: loot luck. All the other upgrades are per player (arrays below). */
  modLoot: num(1),
};

/** Pools of typed arrays (struct of arrays: fixed-size pools, ids are slot indices), in snapshot order. */
export const ARRAYS = {
  /** Per player: experience, level, levels waiting for a card offer, the open offer (3 card ids per slot, all -1 = none) and its ticks left. */
  pXp: f64(MAX_PLAYERS),
  pLevel: i32(MAX_PLAYERS, 1),
  pPending: i32(MAX_PLAYERS),
  pOffer: i32(MAX_PLAYERS * 3, -1),
  pCardTimer: i32(MAX_PLAYERS),
  /** Ticks after a pick during which no further offer opens, and the card buttons held on the previous tick (a pick needs a fresh press). */
  pCardLock: i32(MAX_PLAYERS),
  pCardPrev: i32(MAX_PLAYERS),
  /** How many times each character took each card (card id index), for the relic bar. */
  pCards: u8(MAX_PLAYERS * CARD_IDS.length),
  /** Per player upgrades from cards (multipliers start at 1, pierce and crit chance at 0). */
  modDamage: f64(MAX_PLAYERS, 1),
  modRate: f64(MAX_PLAYERS, 1),
  modSpeed: f64(MAX_PLAYERS, 1),
  modPierce: f64(MAX_PLAYERS),
  modRevive: f64(MAX_PLAYERS, 1),
  modMagnet: f64(MAX_PLAYERS, 1),
  modXp: f64(MAX_PLAYERS, 1),
  modBlast: f64(MAX_PLAYERS, 1),
  modReload: f64(MAX_PLAYERS, 1),
  modDash: f64(MAX_PLAYERS, 1),
  modArmor: f64(MAX_PLAYERS, 1),
  modCrit: f64(MAX_PLAYERS),
  /** Class ability tuning from the class cards: cooldown, duration, damage and radius factors, extra shots / rockets. */
  modAbCd: f64(MAX_PLAYERS, 1),
  modAbDur: f64(MAX_PLAYERS, 1),
  modAbDmg: f64(MAX_PLAYERS, 1),
  modAbRad: f64(MAX_PLAYERS, 1),
  modAbExtra: f64(MAX_PLAYERS),
  // players
  pActive: u8(MAX_PLAYERS),
  pX: f64(MAX_PLAYERS),
  pY: f64(MAX_PLAYERS),
  pAngle: f64(MAX_PLAYERS),
  pHp: f64(MAX_PLAYERS),
  pMaxHp: f64(MAX_PLAYERS),
  pState: u8(MAX_PLAYERS),
  /** Downed countdown (seconds). */
  pTimer: f64(MAX_PLAYERS),
  /** Revive progress (seconds) while being revived. */
  pRevive: f64(MAX_PLAYERS),
  pCooldown: f64(MAX_PLAYERS),
  pIFrames: f64(MAX_PLAYERS),
  pWeapon: i32(MAX_PLAYERS),
  /** Inventory: bitmask of the weapons (indices into WEAPON_IDS) a player owns for good, and the magazine / reload progress of every weapon that is not in the hands (`pMag`/`pReload` hold the one that is). Ammo itself is unlimited. */
  pOwned: i32(MAX_PLAYERS),
  pInvMag: i32(MAX_PLAYERS * WEAPON_IDS.length),
  pInvReload: f64(MAX_PLAYERS * WEAPON_IDS.length),
  pMoving: u8(
    MAX_PLAYERS,
    0,
    'rewritten every tick before it is read; snapshotted only so a restored world animates at once',
  ),
  /** Rounds in the magazine, reload countdown (s), dash ticks left / cooldown (s) / direction, personal card multipliers. */
  pMag: i32(MAX_PLAYERS),
  pReload: f64(MAX_PLAYERS),
  pDash: i32(MAX_PLAYERS),
  pDashCd: f64(MAX_PLAYERS),
  pDashX: f64(MAX_PLAYERS),
  pDashY: f64(MAX_PLAYERS),
  pModDmg: f64(MAX_PLAYERS, 1),
  pModSpeed: f64(MAX_PLAYERS, 1),
  pModRate: f64(MAX_PLAYERS, 1),
  pModPierce: i32(MAX_PLAYERS),
  pModArmor: f64(MAX_PLAYERS, 1),
  pLifesteal: f64(MAX_PLAYERS),
  /** Class passives, card effects and timers per player (see PERK in shared/types). */
  pPerk: f64(MAX_PLAYERS * PERKS),
  pGren: i32(MAX_PLAYERS, BALANCE.grenade.max),
  pGrenCharge: f64(MAX_PLAYERS),
  pGrenCd: f64(MAX_PLAYERS),
  // enemies
  eActive: u8(MAX_ENEMIES),
  eType: u8(MAX_ENEMIES),
  eState: u8(MAX_ENEMIES),
  eStateTick: i32(MAX_ENEMIES),
  eX: f64(MAX_ENEMIES),
  eY: f64(MAX_ENEMIES),
  eAngle: f64(MAX_ENEMIES),
  eHp: f64(MAX_ENEMIES),
  eBoss: u8(MAX_ENEMIES),
  /** Per-enemy scratch: boss charge ticks left. */
  eAux: f64(MAX_ENEMIES),
  eCooldown: f64(MAX_ENEMIES),
  /** Elite modifier of an enemy (0 none; see ELITE in features.ts). */
  eMod: u8(MAX_ENEMIES),
  /** Hit points of the protective shield of a warded elite (taken off before the health). */
  eShield: f64(MAX_ENEMIES),
  /** Ticks an enemy stays frozen (stands still, no attacks). */
  eFrost: i32(MAX_ENEMIES),
  /** Ticks left of a slow and how much of the speed it takes (percent). */
  eSlow: i32(MAX_ENEMIES),
  eSlowP: i32(MAX_ENEMIES),
  eLayer: u8(MAX_ENEMIES),
  bLayer: u8(MAX_BULLETS),
  sLayer: u8(MAX_SPIT),
  /** The newer enemies act in phases: 0 free, 1 winding up, 2 acting, 3 recovering (eActT ticks left); a thrown enemy flies for eAir ticks at (eVX, eVY). */
  eAct: u8(MAX_ENEMIES),
  eActT: i32(MAX_ENEMIES),
  eAir: i32(MAX_ENEMIES),
  eVX: f64(MAX_ENEMIES),
  eVY: f64(MAX_ENEMIES),
  /** Per player: stun ticks (no steering, no shooting), the push velocity from a blow and ticks spent in the air (the toss). */
  pStun: i32(MAX_PLAYERS),
  pKnockX: f64(MAX_PLAYERS),
  pKnockY: f64(MAX_PLAYERS),
  pAir: i32(MAX_PLAYERS),
  /** The layer every entity stands on: 0 ground, 1 deck (see shared/layers.ts). Bullets and spit remember where they were fired. */
  pLayer: u8(MAX_PLAYERS),
  /** Class ability: seconds until it can be used again, seconds a timed one is still on, the rally buff received from a soldier (s), the hammer's charge (s), shots left of the ranger's overcharge. */
  pSpecCd: f64(MAX_PLAYERS),
  pSpecT: f64(MAX_PLAYERS),
  pRally: f64(MAX_PLAYERS),
  pCharge: f64(MAX_PLAYERS),
  /** Per-player statistics (see STAT) and the ticks spent with every weapon. */
  pStat: f64(MAX_PLAYERS * STATS),
  pWpnTime: f64(MAX_PLAYERS * WEAPON_SLOTS),
  /** Kills per weapon (the one in the hands when the enemy died), for the achievements. */
  pWpnKills: i32(MAX_PLAYERS * WEAPON_SLOTS),
  pOver: i32(MAX_PLAYERS),
  /** Drone companions. pDrone: active type + 1 per player (0 none); pDLv / pDXp: level (0 = not owned) and experience per player and type. */
  pDrone: u8(MAX_PLAYERS),
  pDLv: u8(MAX_PLAYERS * DRONE_TYPES.length),
  pDXp: f64(MAX_PLAYERS * DRONE_TYPES.length),
  /** Seconds before a just-switched drone acts, its position and facing, two timers (action, second effect) and the beam targets (healer, up to 4). */
  pDWarm: f64(MAX_PLAYERS),
  /** Ticks in a row the player has been away (no input, or the relay's Away flag); 0 while they play. */
  pAway: i32(MAX_PLAYERS),
  dX: f64(MAX_PLAYERS),
  dY: f64(MAX_PLAYERS),
  dAim: f64(MAX_PLAYERS),
  dCd: f64(MAX_PLAYERS * 2),
  dBeam: i8(MAX_PLAYERS * 4, -1),
  /** Salvo / barrel counter. */
  dN: i32(MAX_PLAYERS),
  /** Lingering ground effects (acid, fire): kind, centre, radius, ticks left. */
  zActive: u8(MAX_ZONES),
  zKind: u8(MAX_ZONES),
  zX: f64(MAX_ZONES),
  zY: f64(MAX_ZONES),
  zR: f64(MAX_ZONES),
  zLeft: i32(MAX_ZONES),
  /** Telegraphed ground attacks that are charging: shape, effect, geometry (centre, angle, half width / radius, length), amount, ticks left of ticks total. */
  tActive: u8(MAX_TELE),
  tShape: u8(MAX_TELE),
  tEffect: u8(MAX_TELE),
  tX: f64(MAX_TELE),
  tY: f64(MAX_TELE),
  tA: f64(MAX_TELE),
  tW: f64(MAX_TELE),
  tL: f64(MAX_TELE),
  tAmt: f64(MAX_TELE),
  tLeft: i32(MAX_TELE),
  tTotal: i32(MAX_TELE),
  /** Who fired a friendly telegraph (the demolisher's airstrike), -1 for the enemies' own. */
  tOwner: i32(MAX_TELE, -1),
  // explosive barrels
  brActive: u8(MAX_BARRELS),
  brX: f64(MAX_BARRELS),
  brY: f64(MAX_BARRELS),
  brHp: f64(MAX_BARRELS),
  brT: f64(MAX_BARRELS),
  /** Misc world numbers: [0] seconds enemies stay frozen, [1] enemies of this wave still to arrive, [2] tick the wave was cleared (0 = not yet), [3] size of this wave. */
  misc: f64(12),
  // grenades
  gActive: u8(MAX_GRENADES),
  gX: f64(MAX_GRENADES),
  gY: f64(MAX_GRENADES),
  gVx: f64(MAX_GRENADES),
  gVy: f64(MAX_GRENADES),
  gFuse: f64(MAX_GRENADES),
  gOwner: i32(MAX_GRENADES),
  // pickups
  kActive: u8(MAX_PICKUPS),
  kType: u8(MAX_PICKUPS),
  kX: f64(MAX_PICKUPS),
  kY: f64(MAX_PICKUPS),
  kLife: f64(MAX_PICKUPS),
  /** Weapon index for weapon pickups. */
  kData: i32(MAX_PICKUPS),
  /** The level a pickup lies on (a deck or the ground below it). */
  kLayer: u8(MAX_PICKUPS),
  // spitter projectiles
  sActive: u8(MAX_SPIT),
  sX: f64(MAX_SPIT),
  sY: f64(MAX_SPIT),
  sVx: f64(MAX_SPIT),
  sVy: f64(MAX_SPIT),
  sLife: f64(MAX_SPIT),
  // bullets
  bActive: u8(MAX_BULLETS),
  bX: f64(MAX_BULLETS),
  bY: f64(MAX_BULLETS),
  bVx: f64(MAX_BULLETS),
  bVy: f64(MAX_BULLETS),
  bLife: f64(MAX_BULLETS),
  bDamage: f64(MAX_BULLETS),
  bOwner: i32(MAX_BULLETS),
  bPierce: i8(MAX_BULLETS),
  /** Last four enemy slots a bullet hit (so a piercing bullet never hits one enemy twice). */
  bHit: i32(MAX_BULLETS * 4, -1),
  /** 0 = a player's round, otherwise drone type + 1; rockets carry their blast (radius and damage). */
  bSrc: u8(MAX_BULLETS),
  bBlastR: f64(MAX_BULLETS),
  bBlastD: f64(MAX_BULLETS),
};

/** Typed arrays that live inside other World members (the flow fields): derived caches, snapshotted but never hashed. */
export const NESTED_ARRAYS: readonly { path: string; unhashed: string }[] = ['field', 'field1'].flatMap((f) =>
  ['cost', 'dirX', 'dirY'].map((a) => ({
    path: `${f}.${a}`,
    unhashed: 'cached flow field, rebuilt from the map and the players',
  })),
);

export type SchemaArrays = { -readonly [K in keyof typeof ARRAYS]: InstanceType<(typeof ARRAYS)[K]['ctor']> };
export type SchemaScalars = { -readonly [K in keyof typeof SCALARS]: number };

export const ARRAY_NAMES = Object.keys(ARRAYS) as (keyof SchemaArrays)[];
export const SCALAR_NAMES = Object.keys(SCALARS) as (keyof SchemaScalars)[];

/** Allocate every schema field at its initial value. */
export function createFields(setup: { map: number; mods: number }): SchemaArrays & SchemaScalars {
  const out: Record<string, number | TypedArray> = {};
  for (const name of SCALAR_NAMES) {
    const init = SCALARS[name].init;
    out[name] = typeof init === 'number' ? init : init(setup);
  }
  for (const name of ARRAY_NAMES) {
    const f: ArrayField = ARRAYS[name];
    const a = new (f.ctor as new (length: number) => TypedArray)(f.length);
    if (f.fill !== 0) a.fill(f.fill);
    out[name] = a;
  }
  return out as unknown as SchemaArrays & SchemaScalars;
}

/** The nested array at `path` ('field.cost'). */
export function nestedArray(w: object, path: string): TypedArray {
  const [head, tail] = path.split('.') as [string, string];
  return (w as Record<string, Record<string, TypedArray>>)[head]![tail]!;
}

/** Every typed array of a World, schema pools first and then the nested ones, in the fixed snapshot order. */
export function snapshotArrays(w: SchemaArrays): TypedArray[] {
  const pools = w as unknown as Record<string, TypedArray>;
  return [...ARRAY_NAMES.map((name) => pools[name]!), ...NESTED_ARRAYS.map((n) => nestedArray(w, n.path))];
}

/** The scalars the world hash covers. */
export const HASHED_SCALARS = SCALAR_NAMES.filter((name) => !SCALARS[name].unhashed);

/** The typed arrays the world hash covers, in schema order. */
export function hashedArrays(w: SchemaArrays): TypedArray[] {
  const pools = w as unknown as Record<string, TypedArray>;
  return [
    ...ARRAY_NAMES.filter((name) => !ARRAYS[name].unhashed).map((name) => pools[name]!),
    ...NESTED_ARRAYS.filter((n) => !n.unhashed).map((n) => nestedArray(w, n.path)),
  ];
}
