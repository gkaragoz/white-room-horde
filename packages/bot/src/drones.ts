import { DRONE_MAX_LEVEL, DRONE_TYPES, FloorPhase, PlayerState } from '@wrh/shared';
import { COLLECTOR, CRYO, GUN, HEALER, ROCKET, TESLA, TWIN, droneStat } from '@wrh/sim';
import type { Sheet } from './strategy/sheet';
import type { Percept } from './types';
import { NEUTRAL_FIGHT, readFight, type FightEnv } from './weaponchoice';

const TYPES = DRONE_TYPES.length;

/** Drones the player owns: the level of each type (0 = not owned). */
export function droneLevels(p: Percept): number[] {
  const out: number[] = [];
  for (let t = 0; t < TYPES; t++) out.push(p.world.pDLv[p.slot * TYPES + t]!);
  return out;
}

/** The squad's state as a healer drone sees it. */
function squadNeed(p: Percept): { hurt: number; count: number; downed: number } {
  let hurt = Math.max(0, 1 - p.hp / Math.max(1, p.maxHp));
  let count = hurt > 0.05 ? 1 : 0;
  let downed = 0;
  for (const a of p.allies) {
    if (a.state === PlayerState.Downed) downed++;
    if (a.state !== PlayerState.Alive) continue;
    const h = Math.max(0, 1 - a.hp / Math.max(1, a.maxHp));
    hurt += h;
    if (h > 0.05) count++;
  }
  return { hurt, count, downed };
}

/** Does a squad mate already run this drone type? */
function allyRuns(p: Percept, type: number): number {
  let n = 0;
  for (const a of p.allies) if (p.world.pDrone[a.slot] === type + 1 && a.state === PlayerState.Alive) n++;
  return n;
}

/**
 * The worth of a drone type at a level in this fight, in damage-per-second equivalents (a heal is worth more than its numbers when somebody
 * is hurt). Damage drones use the owner's damage factors.
 */
export function droneValue(type: number, level: number, p: Percept, env: FightEnv, sheet: Sheet): number {
  const dmg = sheet.dmgA * sheet.dmgB * (1 + sheet.crit);
  const crowd = Math.min(8, env.crowd8 + 1);
  const st = (k: string): number => droneStat(type, k, level);
  switch (type) {
    case HEALER: {
      const need = squadNeed(p);
      const heals = st('rate') * Math.min(st('targets'), Math.max(1, need.count));
      const urgency = need.hurt > 0.6 ? 2.6 : need.hurt > 0.25 ? 1.8 : need.hurt > 0.05 ? 0.9 : 0.12;
      let v = heals * urgency;
      if (need.downed > 0) v += st('revive') * 40;
      const shared = allyRuns(p, HEALER);
      return v * (shared > 0 ? 0.55 : 1);
    }
    case CRYO: {
      const slow = st('slow') / 100;
      const near = Math.min(10, env.crowd8);
      let v = slow * near * 9 + st('dps') * Math.min(near, 8) * dmg + (st('freezeEvery') > 0 ? near * 2 : 0);
      if (env.boss) v += 6;
      const shared = allyRuns(p, CRYO);
      return v * (shared > 0 ? 0.7 : 1);
    }
    case ROCKET: {
      const targets = Math.min(6, Math.max(1, env.cluster[Math.min(6, Math.ceil(st('radius')))]!));
      const per = (st('salvo') * (st('damage') * targets + st('direct'))) / st('cooldown');
      return per * dmg * 0.8;
    }
    case GUN: {
      const per = st('rate') * st('damage') * (1 + 0.25 * st('pierce')) * (1 + st('crit'));
      return per * dmg;
    }
    case TWIN: {
      const per = st('rate') * st('damage') * st('barrels') * (env.near > 14 ? 0.45 : 1);
      return per * dmg;
    }
    case TESLA: {
      const hits = Math.min(st('jumps'), crowd);
      return ((st('damage') * hits) / st('cooldown')) * dmg * (1 + (st('stun') > 0 ? 0.2 : 0));
    }
    case COLLECTOR: {
      let nearby = 0;
      for (const pk of p.pickups) if (Math.hypot(pk.x - p.x, pk.y - p.y) < st('radius') * 1.4) nearby++;
      return 4 + nearby * 7;
    }
    default:
      return 0;
  }
}

interface DroneMem {
  since: number;
  active: number;
  evalAt: number;
}

/**
 * Which drone to keep active. A swap costs several seconds of warm-up and restarts the cooldowns, and a drone only levels up while it
 * is active, so the choice is made in the lulls between fights (judged on a typical fight, with the squad's real state) and a
 * drone is dropped in the middle of a fight only to bring a healer when a squad mate is down. Returns 0 to keep it, otherwise
 * DRONE_TYPES index + 1.
 */
export function chooseDrone(p: Percept, mem: Record<string, unknown>, sheet: Sheet, judgement: number, rand: () => number): number {
  const lv = droneLevels(p);
  let owned = 0;
  for (const l of lv) if (l > 0) owned++;
  const active = p.world.pDrone[p.slot]! - 1;
  if (owned === 0) return 0;
  const dm = (mem.drone ?? { since: -1e9, active: -2, evalAt: -1e9 }) as DroneMem;
  mem.drone = dm;
  if (dm.active !== active) {
    dm.active = active;
    dm.since = p.tick;
  }
  if (p.tick - dm.evalAt < 20) return 0;
  dm.evalAt = p.tick;
  if (p.state !== PlayerState.Alive) return 0;
  const fighting = p.phase === FloorPhase.Fight && p.enemies.length > 0 && p.enemies[0]!.d2 < 30 * 30;
  const need = squadNeed(p);
  const dwell = p.tick - dm.since;
  if (active < 0) return bestOwned(p, lv, NEUTRAL_FIGHT, sheet, 1, rand) + 1;
  if (fighting) {
    // the only reason to swap in a fight: somebody is down and a healer can lift them
    if (need.downed > 0 && lv[HEALER]! > 0 && active !== HEALER && dwell >= 90 && lv[HEALER]! >= 5) return HEALER + 1;
    return 0;
  }
  if (dwell < 300) return 0;
  const noise = (1 - judgement) * 0.8;
  const env = readFight(p).any ? readFight(p) : NEUTRAL_FIGHT;
  let best = -1;
  let bestV = -1;
  let curV = 0;
  for (let t = 0; t < TYPES; t++) {
    if (lv[t]! <= 0) continue;
    let v = droneValue(t, lv[t]!, p, env.any && env.crowd8 >= 3 ? env : NEUTRAL_FIGHT, sheet) * (1 + (0.6 * lv[t]!) / DRONE_MAX_LEVEL);
    if (noise > 0) v *= Math.exp((rand() - 0.5) * 2 * noise);
    if (t === active) curV = v;
    if (v > bestV) {
      bestV = v;
      best = t;
    }
  }
  if (best < 0 || best === active || bestV < curV * 1.25) return 0;
  return best + 1;
}

function bestOwned(p: Percept, lv: number[], env: FightEnv, sheet: Sheet, judgement: number, rand: () => number): number {
  let best = 0;
  let bestV = -1;
  for (let t = 0; t < TYPES; t++) {
    if (lv[t]! <= 0) continue;
    let v = droneValue(t, lv[t]!, p, env, sheet);
    if (judgement < 1) v *= Math.exp((rand() - 0.5) * (1 - judgement));
    if (v > bestV) {
      bestV = v;
      best = t;
    }
  }
  return best;
}
