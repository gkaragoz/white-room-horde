import { ARENA_HALF_H, ARENA_HALF_W, BALANCE, Buttons, ENEMY_TYPES, EnemyState, FloorPhase, MAP_COUNT, MISC, WEAPON_IDS, MAX_ENEMIES, MAX_GRENADES, MAX_PLAYERS, MAX_SPIT, PERK, PERKS, PlayerState, TICK_DT, TICK_RATE, type PlayerInput } from '@wrh/shared';
import { atan2, clamp, cos, sin, sqrt } from './detmath';
import { awardXp } from './progression';
import { ELITE, absorb, addPerk, barrelsBlast, placeBarrels, enemyDamageMul, enemyRadiusMul, enemySpeedMul, hooks, perk, rollElite, waveModOf } from './features';
import { dropLoot } from './pickups';
import { cellIndex } from './flowfield';
import { applyObstacles, out, pushOut, segmentBlocked, useMap } from './obstacles';
import { SH_H, SH_W } from './spatial';
import type { World } from './state';

const N_TYPES = ENEMY_TYPES.length;
const T_EXPLODER = ENEMY_TYPES.indexOf('exploder');
const T_SPITTER = ENEMY_TYPES.indexOf('spitter');
const T_SPAWNER = ENEMY_TYPES.indexOf('spawner');
const T_GRUNT = ENEMY_TYPES.indexOf('grunt');
const T_TANK = ENEMY_TYPES.indexOf('tank');
const T_RUNNER = ENEMY_TYPES.indexOf('runner');
const T_SHIELDER = ENEMY_TYPES.indexOf('shielder');
const T_CRAWLER = ENEMY_TYPES.indexOf('crawler');
const T_LEAPER = ENEMY_TYPES.indexOf('leaper');
const T_BLOATER = ENEMY_TYPES.indexOf('bloater');
const T_SCREAMER = ENEMY_TYPES.indexOf('screamer');

// per-type stats flattened for the hot loops
const HP = new Float64Array(N_TYPES);
const SPEED = new Float64Array(N_TYPES);
const RADIUS = new Float64Array(N_TYPES);
const DAMAGE = new Float64Array(N_TYPES);
const INTERVAL = new Float64Array(N_TYPES);
const BLAST = new Float64Array(N_TYPES);
ENEMY_TYPES.forEach((id, i) => {
  const s = BALANCE.enemies[id];
  HP[i] = s.hp;
  SPEED[i] = s.speed;
  RADIUS[i] = s.radius;
  DAMAGE[i] = s.damage;
  INTERVAL[i] = s.interval;
  BLAST[i] = s.blastRadius ?? 0;
});

export const SPAWN_TICKS = 20; // scream on arrival
export const ATTACK_TICKS = 14; // stand still while the swing plays
const SPIT_RANGE = 7;
const SPIT_HOLD = 6;
const FIELD_PERIOD = 3;
const SEP_MAX = 0.12;
const SPAWN_MARGIN = 1.0;

const sources = new Int32Array(MAX_PLAYERS);
/** Player credited with the damage being dealt right now (-1 for enemies, explosions of exploders). */
let killer = -1;

function rad(w: World, i: number): number {
  const r = RADIUS[w.eType[i]!]! * (w.eMod[i] ? enemyRadiusMul(w, i) : 1);
  return w.eBoss[i] ? r * BALANCE.progression.boss.radiusMul : r;
}

/** Recompute the wave multipliers (repeated multiplication, no pow) and restart the wave clock. */
/** How many enemies the current wave brings in total (fixed when the wave starts). */
function waveTotal(w: World): number {
  const cfg = BALANCE.waves;
  let players = 0;
  for (let s = 0; s < MAX_PLAYERS; s++) if (w.pActive[s]) players++;
  const mod = waveModOf(w.wave);
  return Math.floor((cfg.baseCount + cfg.perPlayer * players) * w.countMul * cfg.waveSizeMul * BALANCE.difficulty.count[w.difficulty]! * (mod === 1 ? 1.5 : 1));
}

/** Start of a wave: its size is fixed now and the "cleared" marker is reset (misc[1] still to arrive, misc[2] cleared at tick, misc[3] total). */
function beginWave(w: World): void {
  const total = waveTotal(w);
  w.misc[1] = total;
  w.misc[2] = 0;
  w.misc[3] = total;
}

/** Recompute the wave multipliers (repeated multiplication, no pow) and restart the wave clock. */
export function setWave(w: World, wave: number): void {
  w.wave = wave;
  w.waveTick = w.tick;
  let c = 1;
  let h = 1;
  for (let i = 1; i < wave; i++) {
    c *= BALANCE.waves.countGrowth;
    h *= 1 + BALANCE.waves.hpGrowth;
  }
  w.countMul = c;
  w.hpMul = h;
  beginWave(w);
}

export function livingPlayers(w: World): number {
  let n = 0;
  for (let s = 0; s < MAX_PLAYERS; s++) if (w.pActive[s] && w.pHp[s]! > 0) n++;
  return n;
}

/** Add an enemy at a position (type index into ENEMY_TYPES). Returns the slot, or -1 if the pool is full. */
export function spawnEnemy(w: World, type: number, x: number, y: number, withScream = true): number {
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (w.eActive[i]) continue;
    let players = 0;
    for (let s = 0; s < MAX_PLAYERS; s++) if (w.pActive[s]) players++;
    const hp = HP[type]! * w.hpMul * BALANCE.difficulty.hp[w.difficulty]! * (1 + BALANCE.waves.playerHpGrowth * (players > 1 ? players - 1 : 0));
    w.eActive[i] = 1;
    w.eBoss[i] = 0;
    w.eMod[i] = 0;
    w.eType[i] = type;
    w.eState[i] = withScream ? EnemyState.Spawn : EnemyState.Move;
    w.eStateTick[i] = w.tick;
    w.eX[i] = x;
    w.eY[i] = y;
    w.eAngle[i] = 0;
    w.eHp[i] = hp;
    w.eCooldown[i] = INTERVAL[type]! * 0.5;
    w.enemyCount++;
    return i;
  }
  return -1;
}

const auraX = new Float64Array(24);
const auraY = new Float64Array(24);
let auraN = 0;

/** Swarm-leader bosses (variant 4) and screamers speed up every enemy standing near them. */
function collectAuras(w: World): void {
  auraN = 0;
  for (let i = 0; i < MAX_ENEMIES && auraN < 24; i++) {
    if (w.eActive[i] && (w.eBoss[i] === 4 || w.eType[i] === T_SCREAMER)) {
      auraX[auraN] = w.eX[i]!;
      auraY[auraN] = w.eY[i]!;
      auraN++;
    }
  }
}

function inAura(x: number, y: number): boolean {
  const r2 = BALANCE.progression.boss.auraRadius * BALANCE.progression.boss.auraRadius;
  for (let k = 0; k < auraN; k++) {
    const dx = x - auraX[k]!;
    const dy = y - auraY[k]!;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

/** Ring of summoned enemies around a boss. */
function summonRing(w: World, x: number, y: number, type: number, n: number): void {
  for (let k = 0; k < n && w.enemyCount < BALANCE.waves.cap; k++) {
    const a = (k / n) * 6.283185307179586;
    spawnEnemy(w, type, clamp(x + cos(a) * 2.5, -ARENA_HALF_W + 1, ARENA_HALF_W - 1), clamp(y + sin(a) * 2.5, -ARENA_HALF_H + 1, ARENA_HALF_H - 1));
  }
}

/**
 * The four bosses fight differently: the brute charges, the king summons grunts, the queen spits out spitters, the
 * swarm leader speeds up its horde (see collectAuras) and calls runners.
 */
function bossAbilities(w: World, i: number, x: number, y: number, dist: number): void {
  const cfg = BALANCE.progression.boss;
  const variant = w.eBoss[i]!;
  const t = w.tick - w.waveTick;
  if (t <= 0) return;
  const callState = (): void => {
    w.eState[i] = EnemyState.Attack;
    w.eStateTick[i] = w.tick;
  };
  if (variant === 1) {
    if (t % (cfg.chargeSeconds * TICK_RATE) === 0 && dist > 4 && w.eAux[i]! <= 0) {
      w.eAux[i] = cfg.chargeTicks;
      w.events.push({ type: 'bossAbility', kind: 'charge', x, y });
      callState();
    }
  } else if (variant === 2) {
    if (t % (cfg.summonSeconds * TICK_RATE) === 0) {
      summonRing(w, x, y, T_GRUNT, cfg.summonCount);
      w.events.push({ type: 'bossAbility', kind: 'summon', x, y });
      callState();
    }
  } else if (variant === 3) {
    if (t % (cfg.queenSummonSeconds * TICK_RATE) === 0) {
      summonRing(w, x, y, T_SPITTER, cfg.queenCount);
      w.events.push({ type: 'bossAbility', kind: 'summon', x, y });
      callState();
    }
  } else if (variant === 4) {
    if (t % (cfg.summonSeconds * TICK_RATE) === 0) {
      summonRing(w, x, y, T_RUNNER, cfg.summonCount);
      w.events.push({ type: 'bossAbility', kind: 'aura', x, y });
      callState();
    }
  }
}

export function spawnBoss(w: World): number {
  edgePoint(w);
  const i = spawnEnemy(w, T_TANK, spawnX, spawnY);
  if (i >= 0) {
    w.eBoss[i] = 1 + ((((w.wave / BALANCE.progression.boss.everyWaves) | 0) - 1 + 4) % 4);
    w.eHp[i] = w.eHp[i]! * BALANCE.progression.boss.hpMul;
  }
  return i;
}

function pickType(w: World): number {
  let total = 0;
  for (let t = 0; t < N_TYPES; t++) {
    const id = ENEMY_TYPES[t]!;
    if (BALANCE.waves.unlock[id] <= w.wave) total += BALANCE.waves.weights[id];
  }
  let r = w.rng.int(total);
  for (let t = 0; t < N_TYPES; t++) {
    const id = ENEMY_TYPES[t]!;
    if (BALANCE.waves.unlock[id] > w.wave) continue;
    r -= BALANCE.waves.weights[id];
    if (r < 0) return t;
  }
  return T_GRUNT;
}

function edgePoint(w: World): number {
  // returns packed index 0..3 side + position along it, written to the scratch pair below
  const side = w.rng.int(4);
  const f = w.rng.float();
  if (side === 0) {
    spawnX = -ARENA_HALF_W + SPAWN_MARGIN;
    spawnY = (f * 2 - 1) * (ARENA_HALF_H - SPAWN_MARGIN);
  } else if (side === 1) {
    spawnX = ARENA_HALF_W - SPAWN_MARGIN;
    spawnY = (f * 2 - 1) * (ARENA_HALF_H - SPAWN_MARGIN);
  } else if (side === 2) {
    spawnX = (f * 2 - 1) * (ARENA_HALF_W - SPAWN_MARGIN);
    spawnY = -ARENA_HALF_H + SPAWN_MARGIN;
  } else {
    spawnX = (f * 2 - 1) * (ARENA_HALF_W - SPAWN_MARGIN);
    spawnY = ARENA_HALF_H - SPAWN_MARGIN;
  }
  return side;
}
let spawnX = 0;
let spawnY = 0;

function farFromPlayers(w: World, x: number, y: number): boolean {
  const min2 = BALANCE.waves.spawnMinDistance * BALANCE.waves.spawnMinDistance;
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s] || w.pHp[s]! <= 0) continue;
    const dx = w.pX[s]! - x;
    const dy = w.pY[s]! - y;
    if (dx * dx + dy * dy < min2) return false;
  }
  return true;
}

/** The new floor: the world is rebuilt around the players (happens once, in the middle of the lift). */
function enterFloor(w: World): void {
  setWave(w, w.wave + 1);
  w.map = (w.wave - 1) % MAP_COUNT;
  useMap(w.map);
  applyObstacles(w.field, w.map);
  w.bActive.fill(0);
  w.gActive.fill(0);
  w.sActive.fill(0);
  w.kActive.fill(0);
  placeBarrels(w);
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s]) continue;
    // everybody comes along: the fallen get up with part of their health
    if (w.pState[s] !== PlayerState.Alive || w.pHp[s]! <= 0) {
      w.pState[s] = PlayerState.Alive;
      w.pHp[s] = w.pMaxHp[s]! * BALANCE.floors.reviveHp;
      w.pTimer[s] = 0;
      w.pRevive[s] = 0;
    }
    const a = (s * 6.283185307179586) / MAX_PLAYERS;
    let x = cos(a) * 2;
    let y = sin(a) * 2;
    if (pushOut(x, y, 0.6)) {
      x = out.x;
      y = out.y;
    }
    w.pX[s] = x;
    w.pY[s] = y;
    w.pIFrames[s] = 1;
    w.pDash[s] = 0;
  }
  w.events.push({ type: 'floorEnter', wave: w.wave, map: w.map });
}

function runWaves(w: World, playerCount: number): void {
  const cfg = BALANCE.waves;
  const fl = BALANCE.floors;
  // the first floor sizes itself on the first tick, when everybody is in
  if (w.tick === 0 && w.misc[MISC.Total] === 0) beginWave(w);
  const phase = w.misc[MISC.Phase]!;
  if (phase === FloorPhase.Cleared) {
    // breather with a countdown; then the climb begins
    if (w.tick >= w.misc[MISC.PhaseEnd]!) {
      w.misc[MISC.Phase] = FloorPhase.Ascend;
      w.misc[MISC.PhaseEnd] = w.tick + Math.round(fl.ascendSeconds * TICK_RATE);
      w.misc[MISC.Entered] = 0;
      w.events.push({ type: 'floorAscend', from: w.wave, to: w.wave + 1, map: w.wave % MAP_COUNT });
    }
    return;
  }
  if (phase === FloorPhase.Ascend) {
    const end = w.misc[MISC.PhaseEnd]!;
    const lift = Math.round((fl.ascendSeconds - fl.chargeSeconds) * TICK_RATE);
    if (w.misc[MISC.Entered] === 0 && w.tick >= end - Math.round(lift / 2)) {
      w.misc[MISC.Entered] = 1;
      enterFloor(w);
    }
    if (w.tick >= end) {
      w.misc[MISC.Phase] = FloorPhase.Arrive;
      w.misc[MISC.PhaseEnd] = w.tick + Math.round(fl.arriveSeconds * TICK_RATE);
      w.events.push({ type: 'floorArrive', wave: w.wave });
    }
    return;
  }
  if (phase === FloorPhase.Arrive) {
    // a last countdown on the new floor, then its enemies come
    if (w.tick >= w.misc[MISC.PhaseEnd]!) {
      w.misc[MISC.Phase] = FloorPhase.Fight;
      w.waveTick = w.tick;
      const boss = w.wave % BALANCE.progression.boss.everyWaves === 0;
      w.events.push({ type: 'waveStart', wave: w.wave, boss, mod: waveModOf(w.wave) });
      if (boss) spawnBoss(w);
    }
    return;
  }
  if (playerCount === 0) return;
  const mod = waveModOf(w.wave);
  const total = w.misc[MISC.Total]!;
  let remaining = w.misc[MISC.Remaining]!;
  if (remaining > 0) {
    // the wave arrives in a rush and then as a stream, never more than the wave's own number
    const t = Math.min(1, (w.tick - w.waveTick) / (cfg.spawnSeconds * TICK_RATE));
    const due = Math.min(total, Math.ceil(total * (cfg.spawnBurst + (1 - cfg.spawnBurst) * t)));
    let spawned = total - remaining;
    for (let n = 0; n < cfg.spawnPerTick && spawned < due && w.enemyCount < cfg.cap; n++) {
      let ok = false;
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        edgePoint(w);
        ok = farFromPlayers(w, spawnX, spawnY);
      }
      const e = spawnEnemy(w, pickType(w), spawnX, spawnY);
      if (e >= 0) {
        if (mod === 1) w.eHp[e] = w.eHp[e]! * 0.7;
        else if (mod === 2) w.eHp[e] = w.eHp[e]! * 1.6;
        rollElite(w, e);
      }
      spawned++;
      remaining--;
    }
    w.misc[MISC.Remaining] = remaining;
  } else if (total > 0 && w.enemyCount === 0) {
    // everybody is dead: the floor is cleared
    w.misc[MISC.Phase] = FloorPhase.Cleared;
    w.misc[MISC.PhaseEnd] = w.tick + Math.round(fl.clearedSeconds * TICK_RATE);
    w.events.push({ type: 'waveCleared', wave: w.wave });
  }
}

export function hurtPlayer(w: World, slot: number, rawDamage: number, x: number, y: number, attacker = -1): boolean {
  if (w.pIFrames[slot]! > 0 || w.pHp[slot]! <= 0) return false;
  const damage = absorb(w, slot, rawDamage * BALANCE.difficulty.damage[w.difficulty]! * w.modArmor * w.pModArmor[slot]!);
  const thorns = perk(w, slot, PERK.Thorns);
  if (thorns > 0 && attacker >= 0 && w.eActive[attacker]) {
    const prev = killer;
    killer = slot;
    damageEnemy(w, attacker, thorns, 0, 0);
    killer = prev;
  }
  const hp = w.pHp[slot]! - damage;
  w.pHp[slot] = hp > 0 ? hp : 0;
  w.pIFrames[slot] = BALANCE.player.iFrames;
  w.events.push({ type: 'playerHit', slot, x, y, damage });
  return true;
}

function explode(w: World, i: number): void {
  const x = w.eX[i]!;
  const y = w.eY[i]!;
  const radius = BLAST[T_EXPLODER]!;
  w.events.push({ type: 'explosion', x, y, radius });
  blastEnemies(w, x, y, radius, DAMAGE[T_EXPLODER]! * 1.5);
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s] || w.pHp[s]! <= 0) continue;
    const dx = w.pX[s]! - x;
    const dy = w.pY[s]! - y;
    if (dx * dx + dy * dy <= radius * radius) hurtPlayer(w, s, DAMAGE[T_EXPLODER]!, w.pX[s]!, w.pY[s]!);
  }
}

/** Remove an enemy because its hp ran out; (dx, dy) is the push direction for the client ragdoll. */
export function killEnemy(w: World, i: number, dx: number, dy: number, power: number): void {
  const type = w.eType[i]!;
  // vampire card: the player whose shot (or grenade) made the kill heals
  if (killer >= 0 && w.pLifesteal[killer]! > 0 && w.pState[killer] === PlayerState.Alive) {
    const hp = w.pHp[killer]! + w.pLifesteal[killer]!;
    w.pHp[killer] = hp > w.pMaxHp[killer]! ? w.pMaxHp[killer]! : hp;
  }
  w.eActive[i] = 0;
  w.enemyCount--;
  w.kills++;
  w.events.push({ type: 'enemyDeath', id: i, etype: type, x: w.eX[i]!, y: w.eY[i]!, dx, dy, power });
  dropLoot(w, w.eX[i]!, w.eY[i]!, w.eBoss[i]! !== 0);
  awardXp(w, w.eBoss[i] ? BALANCE.progression.boss.xp : BALANCE.progression.xp[ENEMY_TYPES[type]!]);
  if (type === T_EXPLODER) explode(w, i);
  if (type === T_BLOATER) {
    // the belly bursts: acid burns whoever is close and a litter of crawlers crawls out
    const bx = w.eX[i]!;
    const by = w.eY[i]!;
    const r = BLAST[T_BLOATER]!;
    w.events.push({ type: 'explosion', x: bx, y: by, radius: r * 0.8 });
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!w.pActive[s] || w.pHp[s]! <= 0) continue;
      const dx = w.pX[s]! - bx;
      const dy = w.pY[s]! - by;
      if (dx * dx + dy * dy <= r * r) hurtPlayer(w, s, DAMAGE[T_BLOATER]!, w.pX[s]!, w.pY[s]!);
    }
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * 6.283185307179586 + 0.4;
      spawnEnemy(w, T_CRAWLER, clamp(bx + cos(a) * 1.0, -ARENA_HALF_W + 1, ARENA_HALF_W - 1), clamp(by + sin(a) * 1.0, -ARENA_HALF_H + 1, ARENA_HALF_H - 1), false);
    }
  }
  const mod = w.eMod[i]!;
  const ex = w.eX[i]!;
  const ey = w.eY[i]!;
  if (killer >= 0) {
    const p = killer;
    addPerk(w, p, PERK.Kills, 1);
    if (perk(w, p, PERK.AdrenCard) > 0) w.pPerk[p * PERKS + PERK.Adren] = BALANCE.perks.adrenSeconds;
    const scav = perk(w, p, PERK.Scav);
    if (scav > 0 && w.rng.float() < scav && w.pMag[p]! < BALANCE.weapons[WEAPON_IDS[w.pWeapon[p]!]!].mag) w.pMag[p] = w.pMag[p]! + 2;
    const vol = perk(w, p, PERK.Volatile);
    if (vol > 0 && w.rng.float() < vol) {
      w.events.push({ type: 'explosion', x: ex, y: ey, radius: BALANCE.perks.volatileRadius });
      blastFrom(w, p, ex, ey, BALANCE.perks.volatileRadius, BALANCE.perks.volatileDamage);
    }
  }
  if (mod === ELITE.Splitter) {
    for (let k = 0; k < BALANCE.elites.splitCount; k++) {
      const a = (k / BALANCE.elites.splitCount) * 6.283185307179586 + 0.6;
      const s = spawnEnemy(w, T_GRUNT, clamp(ex + cos(a) * 0.8, -ARENA_HALF_W + 1, ARENA_HALF_W - 1), clamp(ey + sin(a) * 0.8, -ARENA_HALF_H + 1, ARENA_HALF_H - 1), false);
      if (s >= 0) w.eHp[s] = w.eHp[s]! * 0.45;
    }
  } else if (mod === ELITE.Volatile) {
    const r = BALANCE.elites.volatileRadius;
    w.events.push({ type: 'explosion', x: ex, y: ey, radius: r });
    blastFrom(w, killer, ex, ey, r, BALANCE.elites.volatileDamage);
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!w.pActive[s] || w.pHp[s]! <= 0) continue;
      const dx = w.pX[s]! - ex;
      const dy = w.pY[s]! - ey;
      if (dx * dx + dy * dy <= r * r) hurtPlayer(w, s, 18, w.pX[s]!, w.pY[s]!);
    }
  }
}

/** Apply bullet damage; returns true when the enemy died. */
export function damageEnemy(w: World, i: number, rawDamage: number, dx: number, dy: number): boolean {
  const damage = w.eMod[i] ? rawDamage * enemyDamageMul(w, i) : rawDamage;
  w.eHp[i] = w.eHp[i]! - damage;
  if (w.eHp[i]! <= 0) {
    killEnemy(w, i, dx, dy, damage);
    return true;
  }
  w.events.push({ type: 'enemyHit', id: i, etype: w.eType[i]!, x: w.eX[i]!, y: w.eY[i]!, damage });
  // a hit shoves the enemy along the shot (bosses barely move)
  const kb = Math.min(BALANCE.knock.max, damage * BALANCE.knock.perDamage) * (w.eBoss[i] ? 0.15 : 1);
  if (kb > 0.01) shove(w, i, dx * kb, dy * kb);
  return false;
}

/** Push an enemy by (dx, dy), staying inside the arena and out of cover. */
export function shove(w: World, i: number, dx: number, dy: number): void {
  const r = rad(w, i);
  let x = clamp(w.eX[i]! + dx, -ARENA_HALF_W + r, ARENA_HALF_W - r);
  let y = clamp(w.eY[i]! + dy, -ARENA_HALF_H + r, ARENA_HALF_H - r);
  if (pushOut(x, y, r * 0.8)) {
    x = out.x;
    y = out.y;
  }
  w.eX[i] = x;
  w.eY[i] = y;
}

/** Rebuild the enemy grid from the current positions (also used before a shot, when the tick's grid is not built yet). */
export function rebuildGrid(w: World): void {
  const g = w.grid;
  g.clear();
  for (let i = 0; i < MAX_ENEMIES; i++) if (w.eActive[i]) g.insert(i, w.eX[i]!, w.eY[i]!);
}

function refreshField(w: World): void {
  if (w.tick % FIELD_PERIOD !== 0) return;
  let n = 0;
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (w.pActive[s] && w.pHp[s]! > 0) sources[n++] = cellIndex(w.pX[s]!, w.pY[s]!);
  }
  w.field.compute(sources, n);
}

/** Waves, flow field, spatial hash, enemy movement/separation and attacks. Called once per tick before bullets. */
export function updateEnemies(w: World): void {
  const playerCount = livingPlayers(w);
  runWaves(w, playerCount);
  collectAuras(w);
  rebuildGrid(w);
  refreshField(w);
  if (playerCount === 0) return;
  if (w.misc[0]! > 0) {
    w.misc[0] = w.misc[0]! - TICK_DT; // frozen: everybody stands still
    return;
  }
  const g = w.grid;
  const field = w.field;
  const pr = BALANCE.player.radius;

  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!w.eActive[i]) continue;
    const type = w.eType[i]!;
    let x = w.eX[i]!;
    let y = w.eY[i]!;
    w.eCooldown[i] = w.eCooldown[i]! - TICK_DT;
    if (w.eMod[i] === ELITE.Regen) w.eHp[i] = w.eHp[i]! + BALANCE.elites.regenPerSec * w.hpMul * TICK_DT;
    const age = w.tick - w.eStateTick[i]!;
    let state = w.eState[i]!;
    if (state === EnemyState.Spawn && age >= SPAWN_TICKS) state = EnemyState.Move;
    else if (state === EnemyState.Attack && age >= ATTACK_TICKS) state = EnemyState.Move;
    if (state !== w.eState[i]!) {
      w.eState[i] = state;
      w.eStateTick[i] = w.tick;
    }

    // nearest living player
    let best = -1;
    let bd2 = 1e18;
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!w.pActive[s] || w.pHp[s]! <= 0) continue;
      const dx = w.pX[s]! - x;
      const dy = w.pY[s]! - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd2) {
        bd2 = d2;
        best = s;
      }
    }
    if (best < 0) continue;
    const dist = sqrt(bd2);
    const tx = (w.pX[best]! - x) / (dist > 1e-6 ? dist : 1);
    const ty = (w.pY[best]! - y) / (dist > 1e-6 ? dist : 1);
    const reach = rad(w, i) + pr;
    const boss = w.eBoss[i]! !== 0;

    let mx = 0;
    let my = 0;
    if (state === EnemyState.Move) {
      let wantMove = true;
      if (boss) bossAbilities(w, i, x, y, dist);
      if (type === T_SPITTER) {
        if (dist < SPIT_HOLD) wantMove = false;
        if (dist <= SPIT_RANGE && w.eCooldown[i]! <= 0 && !segmentBlocked(x, y, w.pX[best]!, w.pY[best]!)) {
          spawnSpit(w, x, y, tx, ty);
          w.eCooldown[i] = INTERVAL[type]!;
          w.eState[i] = EnemyState.Attack;
          w.eStateTick[i] = w.tick;
        }
      } else if (type === T_SPAWNER) {
        if (w.eCooldown[i]! <= 0) {
          w.eCooldown[i] = INTERVAL[type]!;
          w.eState[i] = EnemyState.Attack;
          w.eStateTick[i] = w.tick;
          if (w.enemyCount < BALANCE.waves.cap) spawnEnemy(w, T_GRUNT, x + (tx > 0 ? -1 : 1), y + (ty > 0 ? -1 : 1));
        }
      } else if (type === T_EXPLODER) {
        if (dist <= reach + 0.3) {
          killEnemy(w, i, tx, ty, 0);
          continue;
        }
      } else if (dist <= reach + 0.15) {
        wantMove = false;
        if (w.eCooldown[i]! <= 0 && hurtPlayer(w, best, boss ? BALANCE.progression.boss.damage : DAMAGE[type]!, w.pX[best]!, w.pY[best]!, i)) {
          w.eCooldown[i] = INTERVAL[type]!;
          w.eState[i] = EnemyState.Attack;
          w.eStateTick[i] = w.tick;
        }
      }
      if (wantMove && w.eState[i] === EnemyState.Move) {
        let dx = tx;
        let dy = ty;
        if (dist > 3 || segmentBlocked(x, y, w.pX[best]!, w.pY[best]!)) {
          const c = cellIndex(x, y);
          if (field.dirX[c]! !== 0 || field.dirY[c]! !== 0) {
            dx = field.dirX[c]!;
            dy = field.dirY[c]!;
          }
        }
        // a leaper crouches and then jumps at its target every three seconds or so
        if (type === T_LEAPER && w.eAux[i]! <= 0 && dist > 4 && dist < 11 && (w.tick + i * 7) % 90 === 0) w.eAux[i] = 9;
        let sp = SPEED[type]! * (0.9 + ((i * 37) % 16) * 0.0125);
        if (w.eAux[i]! > 0) {
          sp *= BALANCE.progression.boss.chargeSpeedMul; // the brute is charging
          w.eAux[i] = w.eAux[i]! - 1;
        }
        if (auraN > 0 && !boss && inAura(x, y)) sp *= BALANCE.progression.boss.auraSpeedMul;
        if (w.eMod[i] || w.wave >= 3) sp *= enemySpeedMul(w, i);
        if (perk(w, best, PERK.Frost) > 0 && dist < BALANCE.perks.frostRadius) sp *= BALANCE.perks.frostSlow;
        mx = dx * sp * TICK_DT;
        my = dy * sp * TICK_DT;
        w.eAngle[i] = atan2(dy, dx);
      }
    } else {
      w.eAngle[i] = atan2(ty, tx);
    }

    // separation from neighbours
    let sx = 0;
    let sy = 0;
    const cx = g.cellX(x);
    const cy = g.cellY(y);
    const r0 = rad(w, i);
    for (let gy = cy > 0 ? cy - 1 : 0; gy <= (cy < SH_H - 1 ? cy + 1 : SH_H - 1); gy++) {
      for (let gx = cx > 0 ? cx - 1 : 0; gx <= (cx < SH_W - 1 ? cx + 1 : SH_W - 1); gx++) {
        for (let j = g.head[gy * SH_W + gx]!; j >= 0; j = g.next[j]!) {
          if (j === i || !w.eActive[j]) continue;
          const dx = x - w.eX[j]!;
          const dy = y - w.eY[j]!;
          const rr = (r0 + rad(w, j)) * 0.85;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          if (d2 < 1e-9) {
            sx += (i & 1 ? 1 : -1) * 0.02;
            continue;
          }
          const d = sqrt(d2);
          const push = ((rr - d) * 0.25) / d;
          sx += dx * push;
          sy += dy * push;
        }
      }
    }
    const sl = sqrt(sx * sx + sy * sy);
    if (sl > SEP_MAX) {
      sx = (sx / sl) * SEP_MAX;
      sy = (sy / sl) * SEP_MAX;
    }
    x = clamp(x + mx + sx, -ARENA_HALF_W + r0, ARENA_HALF_W - r0);
    y = clamp(y + my + sy, -ARENA_HALF_H + r0, ARENA_HALF_H - r0);
    if (pushOut(x, y, r0 * 0.8)) {
      x = out.x;
      y = out.y;
    }
    w.eX[i] = x;
    w.eY[i] = y;
  }
}

/** Sweep a bullet's step against the enemies (nearest first, honouring pierce). Returns true if the bullet is spent. */
export function bulletVsEnemies(w: World, b: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const g = w.grid;
  const sx = x1 - x0;
  const sy = y1 - y0;
  const len2 = sx * sx + sy * sy;
  const minX = (x0 < x1 ? x0 : x1) - 1.4;
  const maxX = (x0 < x1 ? x1 : x0) + 1.4;
  const minY = (y0 < y1 ? y0 : y1) - 1.4;
  const maxY = (y0 < y1 ? y1 : y0) + 1.4;
  const cx0 = g.cellX(minX);
  const cx1 = g.cellX(maxX);
  const cy0 = g.cellY(minY);
  const cy1 = g.cellY(maxY);
  const hits = w.bHit;
  for (;;) {
    let bestSlot = -1;
    let bestT = 2;
    for (let gy = cy0; gy <= cy1; gy++) {
      for (let gx = cx0; gx <= cx1; gx++) {
        for (let j = g.head[gy * SH_W + gx]!; j >= 0; j = g.next[j]!) {
          if (!w.eActive[j]) continue;
          if (hits[b * 4]! === j || hits[b * 4 + 1]! === j || hits[b * 4 + 2]! === j || hits[b * 4 + 3]! === j) continue;
          const ex = w.eX[j]! - x0;
          const ey = w.eY[j]! - y0;
          let t = len2 > 1e-12 ? (ex * sx + ey * sy) / len2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = ex - sx * t;
          const py = ey - sy * t;
          const R = rad(w, j) + 0.1;
          if (px * px + py * py <= R * R && t < bestT) {
            bestT = t;
            bestSlot = j;
          }
        }
      }
    }
    if (bestSlot < 0) return false;
    // remember the hit (ring of four)
    hits[b * 4] = hits[b * 4 + 1]!;
    hits[b * 4 + 1] = hits[b * 4 + 2]!;
    hits[b * 4 + 2] = hits[b * 4 + 3]!;
    hits[b * 4 + 3] = bestSlot;
    const sp = sqrt(w.bVx[b]! * w.bVx[b]! + w.bVy[b]! * w.bVy[b]!);
    const bdx = sp > 0 ? w.bVx[b]! / sp : 0;
    const bdy = sp > 0 ? w.bVy[b]! / sp : 0;
    let dmg = w.bDamage[b]!;
    if (w.eType[bestSlot] === T_SHIELDER) {
      // the riot shield soaks bullets that arrive from the front
      const facing = bdx * cos(w.eAngle[bestSlot]!) + bdy * sin(w.eAngle[bestSlot]!);
      if (facing < BALANCE.shielder.frontDot) dmg *= BALANCE.shielder.frontMul;
    }
    killer = w.bOwner[b]!;
    damageEnemy(w, bestSlot, dmg, bdx, bdy);
    killer = -1;
    if (w.bPierce[b]! <= 0) {
      w.bX[b] = x0 + sx * bestT;
      w.bY[b] = y0 + sy * bestT;
      return true;
    }
    w.bPierce[b] = w.bPierce[b]! - 1;
  }
}


/** An explosion caused by a player's round: kills are credited to that player. */
export function blastFrom(w: World, owner: number, x: number, y: number, radius: number, damage: number): void {
  const prev = killer;
  killer = owner;
  blastEnemies(w, x, y, radius, damage);
  killer = prev;
}

/** Damage every enemy inside a circle (explosions). Dies and chains through killEnemy. */
export function blastEnemies(w: World, x: number, y: number, radius: number, damage: number): void {
  barrelsBlast(w, x, y, radius, damage, killer);
  if (!w.grid.built) rebuildGrid(w);
  const g = w.grid;
  const cx0 = g.cellX(x - radius);
  const cx1 = g.cellX(x + radius);
  const cy0 = g.cellY(y - radius);
  const cy1 = g.cellY(y + radius);
  for (let gy = cy0; gy <= cy1; gy++) {
    for (let gx = cx0; gx <= cx1; gx++) {
      for (let j = g.head[gy * SH_W + gx]!; j >= 0; j = g.next[j]!) {
        if (!w.eActive[j]) continue;
        const dx = w.eX[j]! - x;
        const dy = w.eY[j]! - y;
        const R = radius + rad(w, j);
        const d2 = dx * dx + dy * dy;
        if (d2 > R * R) continue;
        const d = sqrt(d2);
        // closer to the centre hurts more
        const k = 1 - (d / R) * 0.5;
        const ux = d > 1e-6 ? dx / d : 0;
        const uy = d > 1e-6 ? dy / d : 0;
        if (!damageEnemy(w, j, damage * k, ux, uy)) {
          // survivors are flung away from the blast
          const push = BALANCE.barrels.push * (1 - (d / R) * 0.7) * (w.eBoss[j] ? 0.2 : 1);
          shove(w, j, ux * push, uy * push);
        }
      }
    }
  }
}

function spawnSpit(w: World, x: number, y: number, dx: number, dy: number): void {
  for (let i = 0; i < MAX_SPIT; i++) {
    if (w.sActive[i]) continue;
    w.sActive[i] = 1;
    w.sX[i] = x;
    w.sY[i] = y;
    w.sVx[i] = dx * BALANCE.spit.speed;
    w.sVy[i] = dy * BALANCE.spit.speed;
    w.sLife[i] = BALANCE.spit.life;
    w.events.push({ type: 'spit', x, y, angle: atan2(dy, dx) });
    return;
  }
}

/** Throw a grenade along the aim direction (called from the player step). */
export function throwGrenade(w: World, slot: number, angle: number, aimDist = 0): void {
  const cfg = BALANCE.grenade;
  const range = aimDist > 0 ? clamp(aimDist / 4, cfg.minRange, cfg.maxRange) : cfg.range;
  for (let i = 0; i < MAX_GRENADES; i++) {
    if (w.gActive[i]) continue;
    // the grenade flies for as many ticks as the fuse countdown below lets it move, and lands exactly on the target
    let countdown = cfg.flight + cfg.fuse;
    let flightTicks = 0;
    for (;;) {
      countdown -= TICK_DT;
      if (countdown > cfg.fuse) flightTicks++;
      else break;
    }
    const speed = range / (flightTicks * TICK_DT);
    w.gActive[i] = 1;
    w.gX[i] = w.pX[slot]!;
    w.gY[i] = w.pY[slot]!;
    w.gVx[i] = cos(angle) * speed;
    w.gVy[i] = sin(angle) * speed;
    w.gFuse[i] = cfg.flight + cfg.fuse;
    w.gOwner[i] = slot;
    w.pGren[slot] = w.pGren[slot]! - 1;
    w.pGrenCd[slot] = cfg.cooldown;
    w.events.push({ type: 'grenadeThrown', owner: slot, x: w.pX[slot]!, y: w.pY[slot]! });
    return;
  }
}

/** Grenade recharge and throwing from the confirmed inputs. */
export function updateGrenades(w: World, inputs: ReadonlyArray<PlayerInput | undefined>): void {
  const cfg = BALANCE.grenade;
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s] || w.pState[s] !== PlayerState.Alive) continue;
    if (w.pGrenCd[s]! > 0) w.pGrenCd[s] = w.pGrenCd[s]! - TICK_DT;
    if (w.pGren[s]! < cfg.max) {
      w.pGrenCharge[s] = w.pGrenCharge[s]! + TICK_DT;
      if (w.pGrenCharge[s]! >= cfg.rechargeSeconds) {
        w.pGrenCharge[s] = 0;
        w.pGren[s] = w.pGren[s]! + 1;
      }
    }
    const inp = inputs[s];
    if (inp && (inp.buttons & Buttons.Grenade) !== 0 && w.pGren[s]! > 0 && w.pGrenCd[s]! <= 0) throwGrenade(w, s, w.pAngle[s]!, inp.aimDist ?? 0);
  }
}

/** Flying grenades and spitter projectiles. Runs after the spatial hash is rebuilt. */
export function updateProjectiles(w: World): void {
  const cfg = BALANCE.grenade;
  for (let i = 0; i < MAX_GRENADES; i++) {
    if (!w.gActive[i]) continue;
    w.gFuse[i] = w.gFuse[i]! - TICK_DT;
    if (w.gFuse[i]! > cfg.fuse) {
      w.gX[i] = clamp(w.gX[i]! + w.gVx[i]! * TICK_DT, -ARENA_HALF_W + 0.3, ARENA_HALF_W - 0.3);
      w.gY[i] = clamp(w.gY[i]! + w.gVy[i]! * TICK_DT, -ARENA_HALF_H + 0.3, ARENA_HALF_H - 0.3);
    }
    if (w.gFuse[i]! <= 0) {
      w.gActive[i] = 0;
      const bm = w.modBlast * perk(w, w.gOwner[i]!, PERK.Blast);
      w.events.push({ type: 'explosion', x: w.gX[i]!, y: w.gY[i]!, radius: cfg.radius * bm });
      killer = w.gOwner[i]!;
      blastEnemies(w, w.gX[i]!, w.gY[i]!, cfg.radius * bm, cfg.damage * bm);
      killer = -1;
    }
  }
  const r2 = (BALANCE.spit.radius + BALANCE.player.radius) * (BALANCE.spit.radius + BALANCE.player.radius);
  for (let i = 0; i < MAX_SPIT; i++) {
    if (!w.sActive[i]) continue;
    const x0 = w.sX[i]!;
    const y0 = w.sY[i]!;
    const x1 = x0 + w.sVx[i]! * TICK_DT;
    const y1 = y0 + w.sVy[i]! * TICK_DT;
    w.sX[i] = x1;
    w.sY[i] = y1;
    w.sLife[i] = w.sLife[i]! - TICK_DT;
    let dead = w.sLife[i]! <= 0 || segmentBlocked(x0, y0, x1, y1);
    for (let s = 0; s < MAX_PLAYERS && !dead; s++) {
      if (!w.pActive[s] || w.pHp[s]! <= 0) continue;
      const dx = w.pX[s]! - x1;
      const dy = w.pY[s]! - y1;
      if (dx * dx + dy * dy <= r2) {
        hurtPlayer(w, s, DAMAGE[T_SPITTER]!, w.pX[s]!, w.pY[s]!);
        dead = true;
      }
    }
    if (dead) w.sActive[i] = 0;
  }
}

// the features module reaches the enemy system through these
hooks.blast = blastFrom;
hooks.damage = (w, i, damage, dx, dy, owner) => {
  const prev = killer;
  killer = owner;
  if (w.eActive[i]) damageEnemy(w, i, damage, dx, dy);
  killer = prev;
};
hooks.hurt = (w, s, damage, x, y) => {
  hurtPlayer(w, s, damage, x, y);
};
