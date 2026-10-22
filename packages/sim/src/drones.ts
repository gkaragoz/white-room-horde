import { BALANCE, DRONE_MAX_LEVEL, DRONE_TIER_LEVELS, DRONE_TYPES, FloorPhase, MAX_ENEMIES, MAX_PICKUPS, MAX_PLAYERS, MISC, PERK, PlayerState, TICK_DT, type PlayerInput } from '@wrh/shared';
import { atan2, cos, sin, sqrt } from './detmath';
import { damageEnemyBy } from './enemies';
import { damageMul, droneCredit, hooks, perk, setPerk } from './features';
import { segmentBlocked } from './obstacles';
import { wantsPickup } from './pickups';
import { heal } from './stats';
import { poolOf } from './mods';
import type { World } from './state';

/**
 * Drone companions (docs/DRONES.md). A player carries one active drone and keeps the others in an inventory; the active
 * one hovers beside its owner, acts on its own (heal, slow, rocket, machine guns, lightning, loot) and earns experience
 * that levels it up. Every 5 levels it moves one power tier up: the per-tier numbers are arrays in balance.json.
 * Everything here is simulation state (snapshot and hash) and deterministic; the client only draws it.
 */
const TYPES = DRONE_TYPES.length;
export const HEALER = 0;
export const CRYO = 1;
export const ROCKET = 2;
export const GUN = 3;
export const TWIN = 4;
export const TESLA = 5;
export const COLLECTOR = 6;
const BEAMS = 4;

/** Power tier of a level: 0 for levels 1-4, 1 for 5-9, ... 6 for level 30. */
export function droneTier(level: number): number {
  const t = Math.floor(level / DRONE_TIER_LEVELS);
  return t > 6 ? 6 : t;
}

/** One number of a drone type at a level (arrays are read by tier). */
export function droneStat(type: number, key: string, level: number): number {
  const v = (BALANCE.drones[DRONE_TYPES[type]! as 'healer'] as Record<string, number | number[]>)[key];
  if (v === undefined) return 0;
  return Array.isArray(v) ? v[droneTier(level)]! : v;
}

/** Experience a drone needs for its next level. */
export function droneNeed(level: number): number {
  return BALANCE.drones.xpBase + BALANCE.drones.xpPerLevel * (level - 1);
}

export const droneLevelOf = (w: World, s: number, type: number): number => w.pDLv[s * TYPES + type]!;

/** Experience for the active drone of `slot`. */
export function awardDroneXp(w: World, slot: number, amount: number): void {
  const a = w.pDrone[slot]! - 1;
  if (a < 0 || amount <= 0) return;
  const k = slot * TYPES + a;
  if (w.pDLv[k]! >= DRONE_MAX_LEVEL) return;
  let xp = w.pDXp[k]! + amount;
  while (w.pDLv[k]! < DRONE_MAX_LEVEL) {
    const need = droneNeed(w.pDLv[k]!);
    if (xp < need) break;
    xp -= need;
    w.pDLv[k] = w.pDLv[k]! + 1;
    w.events.push({ type: 'droneLevel', slot, kind: a, level: w.pDLv[k]! });
  }
  w.pDXp[k] = w.pDLv[k]! >= DRONE_MAX_LEVEL ? 0 : xp;
}
hooks.droneXp = awardDroneXp;
hooks.floorCleared = (w, wave) => {
  // the end of the second floor: every player gets a drone core, so nobody goes without a drone for long
  if (wave !== 2) return;
  for (let s = 0; s < MAX_PLAYERS; s++) if (w.pActive[s]) grantDrone(w, s, -1, true);
};

/** A drone joins the inventory: `kind` = type index, or -1 for a random one the player does not own. Returns the type given (-1: duplicate, turned into experience). */
export function grantDrone(w: World, s: number, kind = -1, preferUnmet = false): number {
  if (!w.pActive[s]) return -1;
  // no drone is open yet at this level: nothing to give (the draw is still made, to keep the stream)
  if (kind < 0 && poolOf(w).drones === 0) {
    w.rng.int(TYPES);
    return -1;
  }
  let type = kind;
  if (type < 0) {
    // only drones the room has open; the floor gift prefers one this player has never met (a discovery)
    const open = poolOf(w).drones;
    let free: number[] = [];
    for (let t = 0; t < TYPES; t++) if (w.pDLv[s * TYPES + t] === 0 && ((open >> t) & 1) !== 0) free.push(t);
    if (preferUnmet) {
      const fresh = free.filter((t) => ((w.pMetDrones[s]! >> t) & 1) === 0);
      if (fresh.length) free = fresh;
    }
    // always draw, so the stream does not depend on how many drones the player already has
    const pick = w.rng.int(TYPES);
    type = free.length ? free[pick % free.length]! : -1;
  }
  if (type < 0 || w.pDLv[s * TYPES + type]! > 0) {
    // nothing new to give: the active drone (or the first owned one) gets a lump of experience
    const a = w.pDrone[s]! - 1;
    if (a >= 0) awardDroneXp(w, s, BALANCE.drones.bonusXp);
    w.events.push({ type: 'droneUnlock', slot: s, kind: type < 0 ? Math.max(0, a) : type, fresh: false });
    return -1;
  }
  w.pDLv[s * TYPES + type] = 1;
  w.pDXp[s * TYPES + type] = 0;
  if (w.pDrone[s] === 0) {
    w.pDrone[s] = type + 1;
    w.pDWarm[s] = 1;
    w.dX[s] = w.pX[s]!;
    w.dY[s] = w.pY[s]!;
  }
  w.events.push({ type: 'droneUnlock', slot: s, kind: type, fresh: true });
  return type;
}

/** Forget a player's drones (a fresh character in the slot). */
export function resetDrones(w: World, s: number): void {
  w.pDrone[s] = 0;
  w.pDLv.fill(0, s * TYPES, (s + 1) * TYPES);
  w.pDXp.fill(0, s * TYPES, (s + 1) * TYPES);
  w.pDWarm[s] = 0;
  w.dX[s] = 0;
  w.dY[s] = 0;
  w.dAim[s] = 0;
  w.dCd[s * 2] = 0;
  w.dCd[s * 2 + 1] = 0;
  w.dN[s] = 0;
  w.dBeam.fill(-1, s * BEAMS, (s + 1) * BEAMS);
}

/** Damage multiplier a drone's hit takes from its owner's cards (damage and crit; not fire rate or piercing). */
function ownerMul(w: World, s: number, extraCrit: number): number {
  let m = w.modDamage[s]! * w.pModDmg[s]! * damageMul(w, s);
  const crit = w.modCrit[s]! + extraCrit;
  if (crit > 0 && w.rng.float() < crit) m *= 2;
  return m;
}

/** The enemy a drone should act on: the one closest to its owner inside `range` of the drone, elites and bosses first, with a clear line. */
function pickTarget(w: World, s: number, range: number, needLine: boolean): number {
  const layer = w.pLayer[s]!;
  const dx0 = w.dX[s]!;
  const dy0 = w.dY[s]!;
  const ox = w.pX[s]!;
  const oy = w.pY[s]!;
  const r2 = range * range;
  let best = -1;
  let bestScore = 1e18;
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!w.eActive[i] || w.eLayer[i]! > layer || w.eAir[i]! > 0) continue;
    const ex = w.eX[i]!;
    const ey = w.eY[i]!;
    const dx = ex - dx0;
    const dy = ey - dy0;
    if (dx * dx + dy * dy > r2) continue;
    const ax = ex - ox;
    const ay = ey - oy;
    let score = ax * ax + ay * ay;
    if (w.eBoss[i] || w.eMod[i]) score -= 36;
    if (score >= bestScore) continue;
    if (needLine && segmentBlocked(dx0, dy0, ex, ey, layer)) continue;
    best = i;
    bestScore = score;
  }
  return best;
}

function nearestUnhit(w: World, x: number, y: number, range: number, layer: number, hit: number[]): number {
  let best = -1;
  let bd = range * range;
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!w.eActive[i] || w.eLayer[i]! > layer || hit.includes(i)) continue;
    const dx = w.eX[i]! - x;
    const dy = w.eY[i]! - y;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** Hand a round to the simulation (sim.ts registers the function: it owns the bullet pool). */
function shoot(w: World, s: number, kind: number, angle: number, speed: number, range: number, damage: number, pierce: number, side: number, blastR: number, blastD: number): void {
  const px = w.dX[s]!;
  const py = w.dY[s]!;
  const ox = px - sin(angle) * side;
  const oy = py + cos(angle) * side;
  hooks.bullet(w, s, ox, oy, ox + cos(angle) * 0.9, oy + sin(angle) * 0.9, ox + cos(angle) * 0.9, oy + sin(angle) * 0.9, angle, speed, range, damage, pierce, kind + 1, blastR, blastD);
  w.events.push({ type: 'droneShot', slot: s, kind, x: ox + cos(angle) * 0.9, y: oy + sin(angle) * 0.9, angle });
}

function actHealer(w: World, s: number, level: number): void {
  const range = droneStat(HEALER, 'range', level);
  const n = droneStat(HEALER, 'targets', level);
  const rate = droneStat(HEALER, 'rate', level);
  const overheal = droneStat(HEALER, 'overheal', level);
  const r2 = range * range;
  const base = s * BEAMS;
  w.dBeam.fill(-1, base, base + BEAMS);
  // the squad members that need it most first: lowest share of their health
  const picked: number[] = [];
  for (let k = 0; k < n; k++) {
    let best = -1;
    let bestFrac = 2;
    for (let t = 0; t < MAX_PLAYERS; t++) {
      if (!w.pActive[t] || w.pState[t] !== PlayerState.Alive || picked.includes(t)) continue;
      const dx = w.pX[t]! - w.dX[s]!;
      const dy = w.pY[t]! - w.dY[s]!;
      if (dx * dx + dy * dy > r2 || w.pLayer[t] !== w.pLayer[s]) continue;
      const frac = w.pHp[t]! / w.pMaxHp[t]!;
      if (frac >= 1 && !(overheal > 0 && perk(w, t, PERK.Shield) < overheal)) continue;
      if (frac < bestFrac) {
        bestFrac = frac;
        best = t;
      }
    }
    if (best < 0) break;
    picked.push(best);
    w.dBeam[base + k] = best;
    const before = w.pHp[best]!;
    heal(w, best, rate * TICK_DT);
    const gained = w.pHp[best]! - before;
    // health that would overflow turns into a thin shield on the higher tiers
    if (overheal > 0 && gained < rate * TICK_DT) setPerk(w, best, PERK.Shield, Math.min(overheal, perk(w, best, PERK.Shield) + (rate * TICK_DT - gained) * 0.5));
    if (gained > 0) awardDroneXp(w, s, gained * BALANCE.drones.healXp);
  }
}

/** The revive speed a healer drone adds for a downed player in its beam (0: none). The revive code in sim.ts asks. */
export function droneReviveHelp(w: World, d: number): { rate: number; helper: number } {
  let rate = 0;
  let helper = -1;
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s] || w.pDrone[s] !== HEALER + 1 || w.pState[s] !== PlayerState.Alive || w.pDWarm[s]! > 0) continue;
    const lv = w.pDLv[s * TYPES + HEALER]!;
    const r = droneStat(HEALER, 'revive', lv);
    if (r <= rate) continue;
    const dx = w.pX[d]! - w.dX[s]!;
    const dy = w.pY[d]! - w.dY[s]!;
    const range = droneStat(HEALER, 'range', lv);
    if (dx * dx + dy * dy <= range * range && w.pLayer[d] === w.pLayer[s]) {
      rate = r;
      helper = s;
    }
  }
  return { rate, helper };
}

function actCryo(w: World, s: number, level: number): void {
  const radius = droneStat(CRYO, 'radius', level);
  const slow = droneStat(CRYO, 'slow', level);
  const dps = droneStat(CRYO, 'dps', level);
  const every = droneStat(CRYO, 'freezeEvery', level);
  const ticks = BALANCE.drones.cryo.slowTicks as number;
  const r2 = radius * radius;
  const layer = w.pLayer[s]!;
  const x = w.dX[s]!;
  const y = w.dY[s]!;
  // a pulse every so often: the whole field flashes, once in a while it freezes what is in it for a moment
  w.dCd[s * 2] = w.dCd[s * 2]! - TICK_DT;
  let pulse = false;
  let freeze = false;
  if (w.dCd[s * 2]! <= 0) {
    w.dCd[s * 2] = 1.6;
    pulse = true;
  }
  if (every > 0) {
    w.dCd[s * 2 + 1] = w.dCd[s * 2 + 1]! - TICK_DT;
    if (w.dCd[s * 2 + 1]! <= 0) {
      w.dCd[s * 2 + 1] = every;
      freeze = true;
      pulse = true;
    }
  }
  const tick = w.tick % 6 === 0;
  let slowed = 0;
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!w.eActive[i] || w.eLayer[i]! > layer) continue;
    const dx = w.eX[i]! - x;
    const dy = w.eY[i]! - y;
    if (dx * dx + dy * dy > r2) continue;
    const p = w.eBoss[i] ? Math.round(slow / 2) : slow;
    if (w.eSlowP[i]! < p) w.eSlowP[i] = p;
    w.eSlow[i] = ticks;
    slowed++;
    if (freeze && !w.eBoss[i]) {
      const f = BALANCE.drones.cryo.freezeTicks as number;
      if (w.eFrost[i]! < f) w.eFrost[i] = f;
    }
    if (dps > 0 && tick) {
      droneCredit.slot = s;
      const dm = dps * 6 * TICK_DT * ownerMul(w, s, 0);
      damageEnemyBy(w, i, s, dm, 0, 0);
      droneCredit.slot = -1;
      awardDroneXp(w, s, dm * BALANCE.drones.damageXp);
    }
  }
  if (slowed > 0) awardDroneXp(w, s, slowed * BALANCE.drones.slowXp);
  if (pulse) w.events.push({ type: 'dronePulse', slot: s, x, y, radius, freeze });
}

function actRocket(w: World, s: number, level: number): void {
  w.dCd[s * 2] = w.dCd[s * 2]! - TICK_DT;
  if (w.dCd[s * 2]! > 0) return;
  const cfg = BALANCE.drones.rocket;
  const target = pickTarget(w, s, cfg.range as number, true);
  if (target < 0) {
    w.dCd[s * 2] = 0;
    return;
  }
  w.dCd[s * 2] = droneStat(ROCKET, 'cooldown', level);
  const salvo = droneStat(ROCKET, 'salvo', level);
  const radius = droneStat(ROCKET, 'radius', level);
  const dmg = droneStat(ROCKET, 'damage', level) * ownerMul(w, s, 0);
  const dx = w.eX[target]! - w.dX[s]!;
  const dy = w.eY[target]! - w.dY[s]!;
  const dist = sqrt(dx * dx + dy * dy);
  const base = atan2(dy, dx);
  for (let k = 0; k < salvo; k++) {
    // a fan of rockets: each one a little to the side of the last, all exploding about where the target stands
    const spread = (k - (salvo - 1) / 2) * 0.16;
    shoot(w, s, ROCKET, base + spread, cfg.speed as number, dist + 1.2 + k * 0.3, cfg.direct as number, 0, (k - (salvo - 1) / 2) * 0.35, radius, dmg);
  }
}

function actGuns(w: World, s: number, level: number, twin: boolean): void {
  const type = twin ? TWIN : GUN;
  const cfg = twin ? BALANCE.drones.twin : BALANCE.drones.gun;
  const range = cfg.range as number;
  const barrels = twin ? droneStat(TWIN, 'barrels', level) : 1;
  const rate = droneStat(type, 'rate', level);
  const interval = barrels / rate;
  w.dCd[s * 2] = w.dCd[s * 2]! - TICK_DT;
  if (w.dCd[s * 2]! > 0) return;
  const target = pickTarget(w, s, range, true);
  if (target < 0) {
    w.dCd[s * 2] = 0;
    return;
  }
  const dx = w.eX[target]! - w.dX[s]!;
  const dy = w.eY[target]! - w.dY[s]!;
  const aim = atan2(dy, dx);
  w.dAim[s] = aim;
  const dmg = droneStat(type, 'damage', level);
  const pierce = droneStat(type, 'pierce', level);
  const crit = droneStat(type, 'crit', level);
  const knock = twin ? droneStat(TWIN, 'knock', level) : 0;
  const spread = cfg.spread as number;
  let shots = 0;
  while (w.dCd[s * 2]! <= 0 && shots < 2) {
    for (let b = 0; b < barrels; b++) {
      const a = aim + (w.rng.float() - 0.5) * 2 * spread + (barrels > 2 ? (b - (barrels - 1) / 2) * 0.07 : 0);
      const side = barrels > 1 ? (b - (barrels - 1) / 2) * 0.42 : 0;
      shoot(w, s, type, a, cfg.speed as number, range, dmg * ownerMul(w, s, crit), pierce, side, 0, knock);
    }
    w.dCd[s * 2] = w.dCd[s * 2]! + interval;
    shots++;
  }
  if (w.dCd[s * 2]! < 0) w.dCd[s * 2] = 0;
}

function actTesla(w: World, s: number, level: number): void {
  w.dCd[s * 2] = w.dCd[s * 2]! - TICK_DT;
  if (w.dCd[s * 2]! > 0) return;
  const cfg = BALANCE.drones.tesla;
  const first = pickTarget(w, s, cfg.range as number, true);
  if (first < 0) {
    w.dCd[s * 2] = 0;
    return;
  }
  w.dCd[s * 2] = droneStat(TESLA, 'cooldown', level);
  const jumps = droneStat(TESLA, 'jumps', level);
  const dmg = droneStat(TESLA, 'damage', level);
  const stun = droneStat(TESLA, 'stun', level);
  const layer = w.pLayer[s]!;
  const pts: number[] = [w.dX[s]!, w.dY[s]!];
  const hit: number[] = [];
  let cur = first;
  for (let j = 0; j <= jumps && cur >= 0; j++) {
    const ex = w.eX[cur]!;
    const ey = w.eY[cur]!;
    pts.push(ex, ey);
    hit.push(cur);
    const dm = dmg * ownerMul(w, s, 0);
    // one draw per hit whatever the tier, so the random stream stays in step
    const stunned = w.rng.float() < 0.3;
    droneCredit.slot = s;
    damageEnemyBy(w, cur, s, dm, ex - pts[pts.length - 4]!, ey - pts[pts.length - 3]!);
    droneCredit.slot = -1;
    awardDroneXp(w, s, dm * BALANCE.drones.damageXp);
    if (stun > 0 && stunned && w.eActive[cur] && !w.eBoss[cur] && w.eFrost[cur]! < stun) w.eFrost[cur] = stun;
    cur = nearestUnhit(w, ex, ey, cfg.chain as number, layer, hit);
  }
  w.events.push({ type: 'droneZap', slot: s, pts });
}

function actCollector(w: World, s: number, level: number): void {
  const radius = droneStat(COLLECTOR, 'radius', level);
  const speed = droneStat(COLLECTOR, 'speed', level);
  const r2 = radius * radius;
  const px = w.pX[s]!;
  const py = w.pY[s]!;
  for (let i = 0; i < MAX_PICKUPS; i++) {
    if (!w.kActive[i] || w.kLayer[i] !== w.pLayer[s]) continue;
    const dx = px - w.kX[i]!;
    const dy = py - w.kY[i]!;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2 || d2 < 0.01 || !wantsPickup(w, s, w.kType[i]!, i)) continue;
    const d = sqrt(d2);
    const step = speed * TICK_DT;
    w.kX[i] = w.kX[i]! + (dx / d) * (step < d ? step : d);
    w.kY[i] = w.kY[i]! + (dy / d) * (step < d ? step : d);
  }
}

/** What a collector drone adds when its owner picks something up (called by pickups.ts). */
export function dronePickup(w: World, s: number): void {
  if (w.pDrone[s] !== COLLECTOR + 1) return;
  const lv = w.pDLv[s * TYPES + COLLECTOR]!;
  awardDroneXp(w, s, BALANCE.drones.pickupXp);
  const chance = droneStat(COLLECTOR, 'ammoChance', lv);
  // always draw while a collector is out: the stream must not depend on the tier
  const r = w.rng.float();
  if (chance > 0 && r < chance && w.pGren[s]! < BALANCE.grenade.max) w.pGren[s] = w.pGren[s]! + 1;
}

/** Follow the owner, switch on request, and let the active drone act (docs/DRONES.md). Runs once a tick after the enemies moved. */
export function updateDrones(w: World, inputs: ReadonlyArray<PlayerInput | undefined>): void {
  const f = BALANCE.drones.follow;
  const lifted = w.misc[MISC.Phase] === FloorPhase.Ascend || w.tick < w.misc[MISC.Cine]!;
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s]) continue;
    const alive = w.pState[s] === PlayerState.Alive;
    const inp = inputs[s];
    if (alive && inp && inp.dsel) {
      const want = inp.dsel - 1;
      if (want >= 0 && want < TYPES && want !== w.pDrone[s]! - 1 && w.pDLv[s * TYPES + want]! > 0) {
        w.pDrone[s] = want + 1;
        w.pDWarm[s] = BALANCE.drones.warmup;
        w.dCd[s * 2] = 0;
        w.dCd[s * 2 + 1] = 0;
        w.dN[s] = 0;
        w.dBeam.fill(-1, s * BEAMS, (s + 1) * BEAMS);
        w.events.push({ type: 'droneSwap', slot: s, kind: want });
      }
    }
    const kind = w.pDrone[s]! - 1;
    if (kind < 0) continue;
    // follow the owner: a spring towards a spot beside and a little ahead of the character
    const tx = w.pX[s]! - f.side;
    const ty = w.pY[s]! + f.back;
    if (!alive) {
      w.dX[s] = w.pX[s]!;
      w.dY[s] = w.pY[s]!;
    } else {
      const k = (f.rate * TICK_DT) / (1 + f.rate * TICK_DT);
      w.dX[s] = w.dX[s]! + (tx - w.dX[s]!) * k;
      w.dY[s] = w.dY[s]! + (ty - w.dY[s]!) * k;
    }
    // down, dead or being lifted to the next floor: the drone is off, and wakes up a moment after
    if (!alive || lifted) {
      w.pDWarm[s] = w.pDWarm[s]! > 1 ? w.pDWarm[s]! : 1;
      w.dBeam.fill(-1, s * BEAMS, (s + 1) * BEAMS);
      continue;
    }
    if (w.pDWarm[s]! > 0) {
      w.pDWarm[s] = w.pDWarm[s]! - TICK_DT;
      w.dBeam.fill(-1, s * BEAMS, (s + 1) * BEAMS);
      continue;
    }
    const level = w.pDLv[s * TYPES + kind]!;
    switch (kind) {
      case HEALER:
        actHealer(w, s, level);
        break;
      case CRYO:
        actCryo(w, s, level);
        break;
      case ROCKET:
        actRocket(w, s, level);
        break;
      case GUN:
        actGuns(w, s, level, false);
        break;
      case TWIN:
        actGuns(w, s, level, true);
        break;
      case TESLA:
        actTesla(w, s, level);
        break;
      case COLLECTOR:
        actCollector(w, s, level);
        break;
    }
  }
}
