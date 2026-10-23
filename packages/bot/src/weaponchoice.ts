import { BALANCE, MELEE_CLASSES, WEAPON_IDS, WEAPON_RANK, type WeaponStats } from '@wrh/shared';
import type { World } from '@wrh/sim';
import type { Percept } from './types';
import { buildMode } from './strategy/mode';
import type { Sheet } from './strategy/sheet';

/** The weapons by index, with their numbers. */
export const WEAPON_COUNT = WEAPON_IDS.length;
const STATS: readonly WeaponStats[] = WEAPON_IDS.map((id) => BALANCE.weapons[id]!);

export const weaponStats = (idx: number): WeaponStats => STATS[idx]!;
export const isMeleeWeapon = (idx: number): boolean => STATS[idx]!.melee !== undefined;

/** What the fight around the player looks like, as far as weapons care (read once per decision). */
export interface FightEnv {
  /** Distance to the nearest enemy (12 when none). */
  near: number;
  /** Enemies within 8 units. */
  crowd8: number;
  /** Is there a boss close enough to matter, and how much of its health is left (0..1). */
  boss: boolean;
  bossFrac: number;
  bossDist: number;
  /** Number of enemies within r of the nearest one, for r = 0..6 in steps of 1 (index = ceil(r)). */
  cluster: number[];
  /** Enemies roughly in front, in a narrow cone towards the nearest, within 4/8/14/24 units. */
  line: number[];
  /** Any enemies at all. */
  any: boolean;
}

export const LINE_RANGES = [4, 8, 14, 24] as const;

/** Read the fight from the percept (nearest first, so only the first few dozen enemies matter). */
export function readFight(p: Percept): FightEnv {
  const es = p.enemies;
  const env: FightEnv = { near: 12, crowd8: 0, boss: false, bossFrac: 1, bossDist: 99, cluster: [1, 1, 1, 1, 1, 1, 1], line: [0, 0, 0, 0], any: es.length > 0 };
  if (es.length === 0) return env;
  const n0 = es[0]!;
  env.near = Math.sqrt(n0.d2);
  const bearing = Math.atan2(n0.y - p.y, n0.x - p.x);
  const lim = Math.min(es.length, 40);
  for (let i = 0; i < lim; i++) {
    const e = es[i]!;
    const d = Math.sqrt(e.d2);
    if (d < 8) env.crowd8++;
    if (e.boss && d < env.bossDist) {
      env.boss = true;
      env.bossDist = d;
      env.bossFrac = e.maxHp > 0 ? e.hp / e.maxHp : 1;
    }
    if (i > 0) {
      const dx = e.x - n0.x;
      const dy = e.y - n0.y;
      const c2 = dx * dx + dy * dy;
      for (let r = 1; r <= 6; r++) if (c2 <= r * r) env.cluster[r]!++;
    }
    let da = Math.atan2(e.y - p.y, e.x - p.x) - bearing;
    da = Math.abs(((da + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const width = Math.min(0.5, 0.7 / Math.max(2, d));
    if (da < width + 0.12) for (let k = 0; k < 4; k++) if (d <= LINE_RANGES[k]!) env.line[k]!++;
  }
  env.cluster[0] = 1;
  return env;
}

const clusterAt = (env: FightEnv, r: number): number => env.cluster[Math.max(0, Math.min(6, Math.ceil(r)))]!;
const lineWithin = (env: FightEnv, range: number): number => {
  for (let k = 0; k < 4; k++) if (range <= LINE_RANGES[k]!) return Math.max(1, env.line[k]!);
  return Math.max(1, env.line[3]!);
};

/** Mods that change what a weapon does (from the sheet). */
export interface WeaponMods {
  dmg: number;
  rate: number;
  crit: number;
  pierce: number;
  reload: number;
  blast: number;
}

export const modsOf = (s: Sheet): WeaponMods => ({ dmg: s.dmgA * s.dmgB, rate: s.rateA * s.rateB, crit: s.crit, pierce: s.pierce, reload: s.reload, blast: s.blast });
export const NO_MODS: WeaponMods = { dmg: 1, rate: 1, crit: 0, pierce: 0, reload: 1, blast: 1 };

/** Share of a magazine cycle spent shooting. */
export function uptime(st: WeaponStats, m: WeaponMods): number {
  if (st.melee) return 1;
  const fire = st.mag / (st.rate * m.rate);
  return fire / (fire + st.reload * m.reload);
}

/** Share of the pellets that hit a target at distance d (spread widens with distance; a target is about 1.2 wide). */
function hitFrac(st: WeaponStats, d: number, crowd = 1): number {
  if (st.spread <= 0) return 1;
  const f = Math.min(1, 1.2 / (2 * st.spread * Math.max(d, 1.5)));
  // pellets that miss the nearest enemy often find another one behind it
  return st.pellets > 1 ? Math.min(1, f * crowd) : f;
}

/** How well a weapon reaches a target at distance d. */
function reach(st: WeaponStats, d: number): number {
  if (st.melee) return d <= st.melee.radius + 0.5 ? 1 : Math.max(0.05, 1 - (d - st.melee.radius) / 6);
  const r = st.range;
  if (d <= r * 0.95) return 1;
  return Math.max(0.1, 1 - (d - r * 0.95) / r);
}

/**
 * Damage per second of a gun in this fight: against the crowd as it stands (pierce along the line, blasts on the cluster) and,
 * separately, against one big target (boss). Crowd value is capped so one huge swarm does not make everything look the same.
 */
export function weaponDps(idx: number, m: WeaponMods, env: FightEnv, readyFrac = 1): { crowd: number; single: number } {
  const st = STATS[idx]!;
  const rate = st.rate * m.rate;
  const per = st.damage * m.dmg * (1 + m.crit);
  if (st.melee) {
    const swings = rate * (st.melee.charge > 0 ? 0.8 : 1);
    const targets = Math.min(8, clusterAt(env, st.melee.radius * 0.8));
    const sd = swings * per;
    return { crowd: sd * targets * reach(st, env.near), single: sd };
  }
  const up = uptime(st, m) * readyFrac;
  const spinning = st.spinUp ? 0.9 : 1;
  const d = Math.max(1.5, env.near);
  const shotDps = rate * up * spinning;
  const rangeK = reach(st, d);
  const bossRangeK = reach(st, Math.max(1.5, env.bossDist));
  const crowdK = 1 + 0.6 * Math.min(1, env.crowd8 / 6);
  const hit = hitFrac(st, d, crowdK);
  const bossHit = hitFrac(st, Math.max(1.5, env.bossDist));
  let crowdPer: number;
  let singlePer: number;
  if (st.blast !== undefined && st.blastDamage !== undefined) {
    const r = st.blast * m.blast;
    const direct = per * st.pellets * hit;
    crowdPer = direct + st.blastDamage * m.dmg * (1 + m.crit) * Math.min(8, clusterAt(env, r)) * 0.85;
    singlePer = per * st.pellets * bossHit + st.blastDamage * m.dmg * (1 + m.crit);
  } else {
    const pierce = st.pierce + m.pierce;
    const reachN = Math.min(1 + pierce, lineWithin(env, st.range));
    crowdPer = per * st.pellets * hit * (1 + (reachN - 1) * 0.85);
    singlePer = per * st.pellets * bossHit;
  }
  if (st.freeze) crowdPer *= 1.12;
  return { crowd: shotDps * crowdPer * rangeK, single: shotDps * singlePer * bossRangeK };
}

/** How much a weapon is worth now: blends crowd and boss damage, and rewards range a little (a long gun keeps the bot out of trouble). */
export function weaponValue(idx: number, m: WeaponMods, env: FightEnv, readyFrac = 1): number {
  const st = STATS[idx]!;
  const dps = weaponDps(idx, m, env, readyFrac);
  const wBoss = env.boss && env.bossDist < 40 ? 0.35 + 0.4 * env.bossFrac : 0;
  const v = dps.crowd * (1 - wBoss) + dps.single * wBoss;
  const range = st.melee ? 3 : st.range;
  const prior = 0.8 + 0.4 * (rankOf(idx) / 24);
  return v * (0.82 + 0.18 * Math.min(1, range / 30)) * prior;
}

/** A neutral fight for comparing weapons without a situation (a few enemies in a bunch at middle distance). */
export const NEUTRAL_FIGHT: FightEnv = { near: 7, crowd8: 4, boss: false, bossFrac: 1, bossDist: 99, cluster: [1, 2, 3, 4, 4, 5, 5], line: [1, 2, 3, 3], any: true };

/** Generic strength of a weapon (no situation): used to judge a weapon crate or a gift. */
export function genericPower(idx: number, m: WeaponMods = NO_MODS): number {
  return weaponValue(idx, m, NEUTRAL_FIGHT);
}

/** Position of a weapon in the fixed ranking, 0 = weakest. */
export const rankOf = (idx: number): number => WEAPON_RANK.indexOf(WEAPON_IDS[idx]!);

/** Weapons the player owns (indices). */
export function ownedWeapons(w: World, slot: number): number[] {
  const out: number[] = [];
  const mask = w.pOwned[slot]!;
  for (let i = 0; i < WEAPON_COUNT; i++) if ((mask >> i) & 1) out.push(i);
  return out;
}

/** Does this class fight with blade or hammer? (Their loadout never has a gun.) */
export const isMeleeClass = (cls: number): boolean => MELEE_CLASSES.includes(cls);

interface WeaponMem {
  since: number;
  held: number;
}

/**
 * Which weapon to hold: the best of the owned guns for the fight at hand, with a short commitment so the bot does not flicker
 * between two guns (switching takes a quarter second). Returns 0 to keep the weapon, otherwise WEAPON_IDS index + 1.
 */
export function chooseWeapon(p: Percept, mem: Record<string, unknown>, sheet: Sheet, judgement: number, rand: () => number, cls: number): number {
  if (isMeleeClass(cls)) return 0;
  const owned = ownedWeapons(p.world, p.slot).filter((i) => !isMeleeWeapon(i));
  if (owned.length <= 1) return 0;
  const wm = (mem.weapon ?? { since: -1e9, held: -1 }) as WeaponMem;
  mem.weapon = wm;
  if (wm.held !== p.weapon) {
    wm.held = p.weapon;
    wm.since = p.tick;
  }
  const env = readFight(p);
  const m = modsOf(sheet);
  const noise = (1 - judgement) * 0.9;
  const w = p.world;
  let best = -1;
  let bestV = -1;
  let curV = 0;
  for (const idx of owned) {
    const st = STATS[idx]!;
    let ready = 1;
    if (idx !== p.weapon) {
      const inv = w.pInvMag[p.slot * WEAPON_COUNT + idx]!;
      if (inv <= 0) ready = st.reload / (st.reload + 3) < 0.5 ? 0.6 : 0.4;
      else if (inv < st.mag * 0.3) ready = 0.8;
    }
    let v = buildMode.weaponRank ? rankOf(idx) + 1 : weaponValue(idx, m, env, ready);
    if (noise > 0) v *= Math.exp((rand() - 0.5) * 2 * noise);
    if (idx === p.weapon) curV = v;
    if (v > bestV) {
      bestV = v;
      best = idx;
    }
  }
  if (best < 0 || best === p.weapon) return 0;
  // a swap costs a quarter second of drawing and the guns reload only in the hands, so only a clear gain is worth it
  if (p.tick - wm.since < 75 || bestV < curV * (buildMode.weaponRank ? 1.01 : 1.3)) return 0;
  return best + 1;
}
