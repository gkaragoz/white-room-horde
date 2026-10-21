import { ARENA_HALF_H, ARENA_HALF_W, BALANCE, Buttons, ENEMY_TYPES, EnemyState, FloorPhase, MAP_COUNT, MISC, TeleEffect, TeleShape, WEAPON_IDS, ZoneKind, MAX_ENEMIES, MAX_GRENADES, MAX_PLAYERS, MAX_SPIT, PERK, PERKS, PlayerState, STAT, TICK_DT, TICK_RATE, type PlayerInput } from '@wrh/shared';
import { addStat, heal, maxStat } from './stats';
import { atan2, clamp, cos, sin, sqrt } from './detmath';
import { awardXp } from './progression';
import { ELITE, abilityTaken, absorb, addPerk, barrelsBlast, placeBarrels, enemyDamageMul, enemyRadiusMul, droneCredit, enemySpeedMul, hooks, perk, rollElite, waveModOf } from './features';
import { dropLoot } from './pickups';
import { addTelegraph, addZone, aimAt, launchPlayer } from './hazards';
import { cellIndex } from './flowfield';
import { applyObstacles, currentMap, out, pushOut, segmentBlocked, useMap } from './obstacles';
import { deckWalkable, isLayered, nextLayer, rampAt, rampDir, MAPS } from '@wrh/shared';
import { SH_H, SH_W } from './spatial';
import type { World } from './state';
import { fxOf } from './mods';

const N_TYPES = ENEMY_TYPES.length;
/** Aim units (0..65535) to radians. */
const AIM_RAD = 6.283185307179586 / 65536;
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
const T_BROOD = ENEMY_TYPES.indexOf('brood');
const T_WARCALLER = ENEMY_TYPES.indexOf('warcaller');
const T_SHOCKER = ENEMY_TYPES.indexOf('shocker');
const T_CHOPPER = ENEMY_TYPES.indexOf('chopper');

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

const sources = new Int32Array(MAX_PLAYERS + 16);
const sources1 = new Int32Array(MAX_PLAYERS + 16);
/** Player credited with the damage being dealt right now (-1 for enemies, explosions of exploders). */
let killer = -1;

/** How far from a bullet's path the grid is searched for bodies (the largest boss radius is about 2.6 with the biggest elite size). */
const HIT_MARGIN = 3.2;

function rad(w: World, i: number): number {
  const r = RADIUS[w.eType[i]!]! * (w.eMod[i] ? enemyRadiusMul(w, i) : 1);
  return w.eBoss[i] ? r * BALANCE.progression.boss.radiusMul : r;
}

/** Past the first floors enemies hit harder (and are a little tougher) on top of the base growth, so a strong squad keeps being tested. */
function lateFloors(w: World): number {
  return w.wave > BALANCE.late.start ? (w.wave - BALANCE.late.start) * fxOf(w).lateMul : 0;
}

/** How many enemies the current wave brings in total (fixed when the wave starts). */
function waveTotal(w: World): number {
  const cfg = BALANCE.waves;
  let players = 0;
  for (let s = 0; s < MAX_PLAYERS; s++) if (w.pActive[s]) players++;
  const mod = waveModOf(w.wave);
  return Math.floor((cfg.baseCount + cfg.perPlayer * players) * w.countMul * cfg.waveSizeMul * fxOf(w).enemyCount * (mod === 1 ? 1.5 : 1));
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

/**
 * Whoever ends a tick on the deck layer where there is no deck (shoved or thrown over an edge, teleported) falls to the
 * ground at that spot. Called once a tick after everything has moved.
 */
export function settleLayers(w: World): void {
  const map = MAPS[w.map] ?? MAPS[0]!;
  if (!map.decks) return;
  for (let i = 0; i < MAX_ENEMIES; i++) if (w.eActive[i] && w.eLayer[i] === 1 && !deckWalkable(map, w.eX[i]!, w.eY[i]!)) w.eLayer[i] = 0;
  for (let s = 0; s < MAX_PLAYERS; s++) if (w.pActive[s] && w.pLayer[s] === 1 && !deckWalkable(map, w.pX[s]!, w.pY[s]!)) w.pLayer[s] = 0;
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
    const hp = HP[type]! * w.hpMul * (1 + lateFloors(w) * BALANCE.late.hpPerFloor) * fxOf(w).enemyHp * (1 + BALANCE.waves.playerHpGrowth * (players > 1 ? players - 1 : 0));
    w.eActive[i] = 1;
    w.eBoss[i] = 0;
    w.eMod[i] = 0;
    w.eFrost[i] = 0;
    w.eSlow[i] = 0;
    w.eSlowP[i] = 0;
    w.eShield[i] = 0;
    w.eVX[i] = 0;
    w.eVY[i] = 0;
    w.eLayer[i] = 0;
    w.eAct[i] = 0;
    w.eActT[i] = 0;
    w.eAir[i] = 0;
    w.eAux[i] = 0;
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
    if (w.eActive[i] && (w.eBoss[i] === 4 || w.eType[i] === T_SCREAMER || w.eType[i] === T_WARCALLER)) {
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


/** Distance covered by a body in the air (18 ticks, its speed falling by 6 % every tick), in units per unit of launch speed per second. */
const AIR_TICKS = 18;
const AIR_REACH = ((): number => {
  let f = 1;
  let sum = 0;
  for (let k = 0; k < AIR_TICKS; k++) {
    sum += f;
    f *= 0.94;
  }
  return sum * TICK_DT;
})();

/** Send an enemy flying to a spot: it lands there after the 18 ticks of the air (the client draws the arc). */
function leapTo(w: World, i: number, tx: number, ty: number): void {
  const dx = tx - w.eX[i]!;
  const dy = ty - w.eY[i]!;
  w.eVX[i] = dx / AIR_REACH;
  w.eVY[i] = dy / AIR_REACH;
  w.eAir[i] = AIR_TICKS;
}

/** The nearest ordinary small enemy within `radius` of a point that can be picked up and thrown (never a boss, nothing already airborne). */
function pickSmall(w: World, x: number, y: number, radius: number, not: number): number {
  let best = -1;
  let bd = radius * radius;
  for (let j = 0; j < MAX_ENEMIES; j++) {
    if (j === not || !w.eActive[j] || w.eBoss[j] || w.eAir[j]! > 0 || w.eFrost[j]! > 0 || w.eType[j]! >= FIRST_SPECIAL || RADIUS[w.eType[j]!]! > 0.8) continue;
    const dx = w.eX[j]! - x;
    const dy = w.eY[j]! - y;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = j;
    }
  }
  return best;
}

/** Throw an enemy at a spot on the ground: it flies, a marked circle shows where it lands, and whoever stands there is hit. */
function hurlAt(w: World, victim: number, tx: number, ty: number, radius: number, damage: number, victimHit: number): void {
  const dx = tx - w.eX[victim]!;
  const dy = ty - w.eY[victim]!;
  const prev = killer;
  killer = -1;
  const dead = damageEnemy(w, victim, w.eHp[victim]! * victimHit, dx * 0.01, dy * 0.01);
  killer = prev;
  if (dead) return;
  w.eAct[victim] = 0;
  w.eCooldown[victim] = INTERVAL[w.eType[victim]!]! * 0.5;
  leapTo(w, victim, tx, ty);
  addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, tx, ty, 0, radius, 0, AIR_TICKS * TICK_DT, damage);
}

// ---------------------------------------------------------------------------------------------------------------------
// The newer enemy types (index >= FIRST_SPECIAL) act in phases kept in eAct / eActT: 0 free, 1 winding up (stands still, the
// ground shows what is coming), 2 acting (a charge, a pull, a stream of fire), 3 recovering. eAux holds the length of the
// windup so the client can draw a charge bar. They return true while busy, so the ordinary chase does not run.
// ---------------------------------------------------------------------------------------------------------------------
const FIRST_SPECIAL = ENEMY_TYPES.indexOf('acider');
const FIRST_NEW = ENEMY_TYPES.indexOf('pouncer');
const SP = BALANCE.special;
let spMX = 0;
let spMY = 0;

const secs = (s: number): number => Math.max(1, Math.round(s * TICK_RATE));

function beginWindup(w: World, i: number, seconds: number): void {
  const t = secs(seconds);
  w.eAct[i] = 1;
  w.eActT[i] = t;
  w.eAux[i] = t;
  w.events.push({ type: 'windup', id: i, etype: w.eType[i]!, x: w.eX[i]!, y: w.eY[i]! });
}

function endAct(w: World, i: number, recover: number): void {
  w.eAct[i] = 3;
  w.eActT[i] = secs(recover);
}

/** Throw an enemy through the air (it takes the blow first; if it dies it just dies). */
function tossEnemy(w: World, j: number, vx: number, vy: number, damage: number): void {
  const prev = killer;
  killer = -1;
  const dead = damageEnemy(w, j, damage, vx * 0.02, vy * 0.02);
  killer = prev;
  if (dead) return;
  w.eVX[j] = vx;
  w.eVY[j] = vy;
  w.eAir[j] = 18;
}

/** Keeping a distance: returns true while it backs off (spMX/spMY set), false when the player is too far to bother. */
function keepAway(w: World, i: number, type: number, dist: number, keep: number, range: number, tx: number, ty: number): 'back' | 'hold' | 'chase' {
  w.eAngle[i] = atan2(ty, tx);
  if (dist < keep) {
    const sp = SPEED[type]! * TICK_DT;
    spMX = -tx * sp;
    spMY = -ty * sp;
    return 'back';
  }
  return dist <= range ? 'hold' : 'chase';
}


/** The windup of one of the ten newest enemies is over: do what it was winding up for. */
function finishNew(w: World, i: number, type: number, name: string, cfg: Record<string, number>, x: number, y: number, px: number, py: number, face: number): void {
  w.events.push({ type: 'enemyAct', id: i, etype: type, x, y });
  if (name === 'pouncer') {
    // it jumps at the spot it marked when it crouched, not at where the player has gone since
    leapTo(w, i, w.eVX[i]!, w.eVY[i]!);
    w.eAngle[i] = atan2(w.eVY[i]! - y, w.eVX[i]! - x);
  } else if (name === 'hurler') {
    const v = w.eVX[i]! | 0;
    if (v > 0 && w.eActive[v - 1] && w.eAir[v - 1]! <= 0 && !w.eBoss[v - 1]) hurlAt(w, v - 1, px, py, cfg.radius!, cfg.damage!, cfg.victimHit!);
    w.eVX[i] = 0;
  } else if (name === 'grabber') {
    const gx = x + cos(face) * 2.0;
    const gy = y + sin(face) * 2.0;
    const r2 = cfg.grabRadius! * cfg.grabRadius!;
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!w.pActive[s] || w.pState[s] !== PlayerState.Alive || w.pHp[s]! <= 0) continue;
      const dx = w.pX[s]! - gx;
      const dy = w.pY[s]! - gy;
      if (dx * dx + dy * dy > r2) continue;
      if (!hurtPlayer(w, s, cfg.damage!, w.pX[s]!, w.pY[s]!, i)) continue;
      // picked up and thrown across the room, in a direction that is not quite away
      const a = face + (w.rng.float() * 2 - 1) * 0.7;
      launchPlayer(w, s, cos(a) * cfg.throw!, sin(a) * cfg.throw!, cfg.stun!, 22);
    }
  } else if (name === 'warcaller') {
    for (let k = 0; k < cfg.count! && w.enemyCount < BALANCE.waves.cap; k++) {
      const a = (k / cfg.count!) * 6.283185307179586 + 0.4;
      const pick = w.rng.int(3);
      spawnEnemy(w, pick === 0 ? T_GRUNT : pick === 1 ? T_RUNNER : T_CRAWLER, clamp(x + cos(a) * 1.8, -ARENA_HALF_W + 1, ARENA_HALF_W - 1), clamp(y + sin(a) * 1.8, -ARENA_HALF_H + 1, ARENA_HALF_H - 1));
    }
  }
  endAct(w, i, cfg.recover ?? 0.6);
  if (name === 'pouncer') w.eAct[i] = 3;
}

function special(w: World, i: number, type: number, x: number, y: number, best: number, dist: number, tx: number, ty: number): boolean {
  spMX = 0;
  spMY = 0;
  const name = ENEMY_TYPES[type]!;
  const cfg = SP[name]!;
  const px = w.pX[best]!;
  const py = w.pY[best]!;
  const act = w.eAct[i]!;
  const face = atan2(ty, tx);
  const sp = SPEED[type]! * TICK_DT;
  if (act === 1) {
    w.eActT[i] = w.eActT[i]! - 1;
    if (name !== 'rammer' || w.eActT[i]! > 4) w.eAngle[i] = name === 'flamer' ? face : name === 'sledge' || name === 'marksman' ? w.eAngle[i]! : face;
    if (w.eActT[i]! > 0) return true;
    // the windup is over: do it
    w.eState[i] = EnemyState.Attack;
    w.eStateTick[i] = w.tick;
    if (type >= FIRST_NEW) {
      finishNew(w, i, type, name, cfg, x, y, px, py, face);
      return true;
    }
    if (name === 'rammer' || name === 'magnetar' || name === 'flamer') w.events.push({ type: 'enemyAct', id: i, etype: type, x, y });
    if (name === 'rammer') {
      w.eAngle[i] = face;
      w.eAct[i] = 2;
      w.eActT[i] = cfg.ticks!;
      w.eState[i] = EnemyState.Move;
    } else if (name === 'magnetar') {
      w.eAct[i] = 2;
      w.eActT[i] = cfg.ticks!;
    } else if (name === 'flamer') {
      w.eAngle[i] = face;
      w.eAct[i] = 2;
      w.eActT[i] = cfg.ticks!;
    } else {
      if (name === 'mortar') {
        for (let k = 0; k < cfg.shells!; k++) {
          const ox = clamp(px + (w.rng.float() * 2 - 1) * 2.2 * (k > 0 ? 1 : 0), -ARENA_HALF_W + 2, ARENA_HALF_W - 2);
          const oy = clamp(py + (w.rng.float() * 2 - 1) * 2.2 * (k > 0 ? 1 : 0), -ARENA_HALF_H + 2, ARENA_HALF_H - 2);
          addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, ox, oy, 0, cfg.radius!, 0, cfg.delay! + k * cfg.stagger!, cfg.damage!);
        }
      } else if (name === 'reviver') {
        for (let k = 0; k < cfg.count! && w.enemyCount < BALANCE.waves.cap; k++) {
          const a = (k / cfg.count!) * 6.283185307179586 + 0.5;
          spawnEnemy(w, T_CRAWLER, clamp(x + cos(a) * 1.6, -ARENA_HALF_W + 1, ARENA_HALF_W - 1), clamp(y + sin(a) * 1.6, -ARENA_HALF_H + 1, ARENA_HALF_H - 1));
        }
      } else if (name === 'blinker') {
        const a = w.pAngle[best]!;
        let bx = clamp(px - cos(a) * cfg.behind!, -ARENA_HALF_W + 1, ARENA_HALF_W - 1);
        let by = clamp(py - sin(a) * cfg.behind!, -ARENA_HALF_H + 1, ARENA_HALF_H - 1);
        if (pushOut(bx, by, 0.6, w.eLayer[i]!)) {
          bx = out.x;
          by = out.y;
        }
        w.events.push({ type: 'blink', id: i, x0: x, y0: y, x: bx, y: by });
        w.eX[i] = bx;
        w.eY[i] = by;
      }
      endAct(w, i, cfg.recover ?? 0.5);
    }
    return true;
  }
  if (act === 2) {
    w.eActT[i] = w.eActT[i]! - 1;
    if (name === 'rammer') {
      const a = w.eAngle[i]!;
      const dx = cos(a);
      const dy = sin(a);
      spMX = dx * cfg.speed! * TICK_DT;
      spMY = dy * cfg.speed! * TICK_DT;
      const hit2 = cfg.hit! * cfg.hit!;
      for (let s = 0; s < MAX_PLAYERS; s++) {
        if (!w.pActive[s] || w.pState[s] !== PlayerState.Alive || w.pHp[s]! <= 0) continue;
        const ex = w.pX[s]! - x;
        const ey = w.pY[s]! - y;
        if (ex * ex + ey * ey > hit2) continue;
        if (hurtPlayer(w, s, cfg.damage!, w.pX[s]!, w.pY[s]!, i)) {
          const side = ex * -dy + ey * dx >= 0 ? 1 : -1;
          launchPlayer(w, s, (dx - dy * 0.5 * side) * cfg.throw!, (dy + dx * 0.5 * side) * cfg.throw!, cfg.stun!, 16);
        }
      }
      for (let j = 0; j < MAX_ENEMIES; j++) {
        if (j === i || !w.eActive[j] || w.eType[j] === type || w.eAir[j]! > 0) continue;
        const ex = w.eX[j]! - x;
        const ey = w.eY[j]! - y;
        if (ex * ex + ey * ey > hit2) continue;
        const side = ex * -dy + ey * dx >= 0 ? 1 : -1;
        tossEnemy(w, j, (dx - dy * 0.6 * side) * cfg.enemyThrow!, (dy + dx * 0.6 * side) * cfg.enemyThrow!, cfg.enemyDamage! * w.hpMul);
      }
      if (w.eActT[i]! <= 0) endAct(w, i, cfg.recover!);
    } else if (name === 'magnetar') {
      const r2 = cfg.radius! * cfg.radius!;
      for (let s = 0; s < MAX_PLAYERS; s++) {
        if (!w.pActive[s] || w.pState[s] !== PlayerState.Alive || w.pHp[s]! <= 0) continue;
        const ex = x - w.pX[s]!;
        const ey = y - w.pY[s]!;
        const d2 = ex * ex + ey * ey;
        if (d2 > r2 || d2 < 2.5) continue;
        const d = sqrt(d2);
        w.pKnockX[s] = (ex / d) * cfg.pull!;
        w.pKnockY[s] = (ey / d) * cfg.pull!;
      }
      if (w.eActT[i]! <= 0) endAct(w, i, cfg.recover!);
    } else if (name === 'flamer') {
      const a = w.eAngle[i]!;
      if (w.eActT[i]! % cfg.every! === 0) {
        const p = 1 - w.eActT[i]! / cfg.ticks!;
        const d = cfg.near! + (cfg.far! - cfg.near!) * p;
        const wob = (w.rng.float() * 2 - 1) * 0.6;
        addZone(w, clamp(x + cos(a) * d - sin(a) * wob, -ARENA_HALF_W + 1, ARENA_HALF_W - 1), clamp(y + sin(a) * d + cos(a) * wob, -ARENA_HALF_H + 1, ARENA_HALF_H - 1), cfg.radius!, cfg.seconds!, ZoneKind.Fire);
      }
      if (w.eActT[i]! <= 0) endAct(w, i, cfg.recover!);
    } else {
      w.eAct[i] = 0;
    }
    return true;
  }
  if (act === 3) {
    w.eActT[i] = w.eActT[i]! - 1;
    if (w.eActT[i]! <= 0) w.eAct[i] = 0;
    return true;
  }
  // free
  const ready = w.eCooldown[i]! <= 0;
  switch (name) {
    case 'acider':
      if ((w.tick + i) % cfg.trailEvery! === 0) addZone(w, x, y, cfg.trailRadius!, cfg.trailSeconds!, ZoneKind.Acid);
      if (ready && dist <= cfg.range! && !segmentBlocked(x, y, px, py)) {
        addTelegraph(w, TeleShape.Circle, TeleEffect.Acid, px, py, 0, cfg.spitRadius!, 0, cfg.spitDelay!, cfg.spitRadius!);
        w.eCooldown[i] = INTERVAL[type]!;
        w.eState[i] = EnemyState.Attack;
        w.eStateTick[i] = w.tick;
      }
      return false;
    case 'rammer':
      if (ready && dist >= cfg.minRange! && dist <= cfg.maxRange! && !segmentBlocked(x, y, px, py)) {
        w.eAngle[i] = face;
        const len = dist + 4;
        addTelegraph(w, TeleShape.Rect, TeleEffect.None, x + tx * len, y + ty * len, face, cfg.hit!, len, cfg.windup!, 0);
        beginWindup(w, i, cfg.windup!);
        w.eCooldown[i] = INTERVAL[type]!;
        return true;
      }
      return false;
    case 'sledge':
      if (ready && dist <= cfg.reach!) {
        w.eAngle[i] = face;
        addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, x + tx * cfg.ahead!, y + ty * cfg.ahead!, 0, cfg.radius!, 0, cfg.windup!, cfg.damage!);
        beginWindup(w, i, cfg.windup!);
        w.eCooldown[i] = INTERVAL[type]!;
        return true;
      }
      return false;
    case 'lamper':
      if (ready && dist <= cfg.reach!) {
        addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, x, y, 0, cfg.radius!, 0, cfg.windup!, cfg.damage!);
        beginWindup(w, i, cfg.windup!);
        w.eCooldown[i] = INTERVAL[type]!;
        return true;
      }
      return false;
    case 'magnetar':
      if (ready && dist <= cfg.range!) {
        addTelegraph(w, TeleShape.Circle, TeleEffect.None, x, y, 0, cfg.radius!, 0, cfg.windup!, 0);
        beginWindup(w, i, cfg.windup!);
        w.eCooldown[i] = INTERVAL[type]!;
        return true;
      }
      return false;
    case 'flamer':
      if (ready && dist <= cfg.range! && !segmentBlocked(x, y, px, py)) {
        w.eAngle[i] = face;
        beginWindup(w, i, cfg.windup!);
        w.eCooldown[i] = INTERVAL[type]!;
        return true;
      }
      return false;
    case 'blinker':
      if (ready && dist >= cfg.minRange!) {
        beginWindup(w, i, cfg.windup!);
        w.eCooldown[i] = INTERVAL[type]!;
        return true;
      }
      return false;
    case 'pouncer':
      if (ready && dist >= cfg.minRange! && dist <= cfg.maxRange! && !segmentBlocked(x, y, px, py)) {
        w.eAngle[i] = face;
        w.eVX[i] = px;
        w.eVY[i] = py;
        addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, px, py, 0, cfg.radius!, 0, cfg.windup! + AIR_TICKS * TICK_DT, cfg.damage!);
        beginWindup(w, i, cfg.windup!);
        w.eCooldown[i] = INTERVAL[type]!;
        return true;
      }
      return false;
    case 'hurler': {
      if (ready && dist >= cfg.minRange! && dist <= cfg.range!) {
        const v = pickSmall(w, x, y, cfg.pickRadius!, i);
        if (v >= 0) {
          w.eVX[i] = v + 1;
          beginWindup(w, i, cfg.windup!);
          w.eCooldown[i] = INTERVAL[type]!;
          return true;
        }
      }
      return false;
    }
    case 'grabber':
      if (ready && dist <= cfg.reach!) {
        w.eAngle[i] = face;
        addTelegraph(w, TeleShape.Circle, TeleEffect.None, x + tx * 2.0, y + ty * 2.0, 0, cfg.grabRadius!, 0, cfg.windup!, 0);
        beginWindup(w, i, cfg.windup!);
        w.eCooldown[i] = INTERVAL[type]!;
        return true;
      }
      return false;
    case 'spiker':
      if (ready && dist <= cfg.range! && !segmentBlocked(x, y, px, py)) {
        w.eAngle[i] = face;
        const n = cfg.count!;
        for (let k = 0; k < n; k++) {
          const a = face + (k - (n - 1) / 2) * cfg.spread!;
          const half = cfg.length! / 2;
          addTelegraph(w, TeleShape.Rect, TeleEffect.Hurt, x + cos(a) * half, y + sin(a) * half, a, cfg.width!, half, cfg.windup!, cfg.damage!);
        }
        beginWindup(w, i, cfg.windup!);
        w.eCooldown[i] = INTERVAL[type]!;
        return true;
      }
      return false;
    case 'shocker':
      if (ready && dist <= cfg.range!) {
        addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, x, y, 0, cfg.radius!, 0, cfg.windup!, cfg.damage!);
        beginWindup(w, i, cfg.windup!);
        w.eCooldown[i] = INTERVAL[type]!;
        return true;
      }
      return false;
    case 'chopper':
      if (ready && dist <= cfg.range! && !segmentBlocked(x, y, px, py)) {
        w.eAngle[i] = face;
        const half = cfg.length! / 2;
        addTelegraph(w, TeleShape.Rect, TeleEffect.Hurt, x + tx * half, y + ty * half, face, cfg.width!, half, cfg.windup!, cfg.damage!);
        // the axe comes back the same way
        addTelegraph(w, TeleShape.Rect, TeleEffect.Hurt, x + tx * half, y + ty * half, face, cfg.width!, half, cfg.windup! + cfg.back!, cfg.damage! * 0.7);
        beginWindup(w, i, cfg.windup!);
        w.eCooldown[i] = INTERVAL[type]!;
        return true;
      }
      return false;
    case 'quaker':
      if (ready && dist <= cfg.range!) {
        addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, x, y, 0, cfg.radius!, 0, cfg.windup!, cfg.damage!);
        for (let k = 0; k < cfg.rocks!; k++) {
          const s = pickPlayer(w);
          if (s < 0) break;
          const ox = clamp(w.pX[s]! + (w.rng.float() * 2 - 1) * 3.5, -ARENA_HALF_W + 2, ARENA_HALF_W - 2);
          const oy = clamp(w.pY[s]! + (w.rng.float() * 2 - 1) * 3.5, -ARENA_HALF_H + 2, ARENA_HALF_H - 2);
          addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, ox, oy, 0, cfg.rockRadius!, 0, cfg.windup! + cfg.rockDelay! + k * 0.18, cfg.rockDamage!);
        }
        beginWindup(w, i, cfg.windup!);
        w.eCooldown[i] = INTERVAL[type]!;
        return true;
      }
      return false;
    case 'trapper':
    case 'warcaller': {
      const mode = keepAway(w, i, type, dist, cfg.keep!, cfg.range!, tx, ty);
      if (mode === 'chase') return false;
      if (mode === 'back') return true;
      if (ready) {
        if (name === 'trapper') {
          // mines in the ground round the player: they show up at once and go off after a moment
          for (let k = 0; k < cfg.count!; k++) {
            const a = w.rng.float() * 6.283185307179586;
            const d = 1 + w.rng.float() * cfg.scatter!;
            addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, clamp(px + cos(a) * d, -ARENA_HALF_W + 2, ARENA_HALF_W - 2), clamp(py + sin(a) * d, -ARENA_HALF_H + 2, ARENA_HALF_H - 2), 0, cfg.radius!, 0, cfg.delay!, cfg.damage!);
          }
        }
        beginWindup(w, i, cfg.windup!);
        w.eCooldown[i] = INTERVAL[type]!;
      }
      return true;
    }
    case 'brood':
      return false;
    case 'mortar':
    case 'reviver':
    case 'marksman': {
      const mode = keepAway(w, i, type, dist, cfg.keep!, cfg.range!, tx, ty);
      if (mode === 'chase') return false;
      if (mode === 'back') return true;
      if (ready && (name !== 'marksman' || !segmentBlocked(x, y, px, py))) {
        if (name === 'marksman') {
          const len = 26;
          addTelegraph(w, TeleShape.Rect, TeleEffect.Hurt, x + tx * len, y + ty * len, face, cfg.width!, len, cfg.windup!, cfg.damage!);
        }
        beginWindup(w, i, cfg.windup!);
        w.eCooldown[i] = INTERVAL[type]!;
      }
      return true;
    }
    default:
      void sp;
      return false;
  }
}

/** A random living player (-1 when nobody is up), for aimed boss attacks. */
function pickPlayer(w: World): number {
  let n = 0;
  for (let s = 0; s < MAX_PLAYERS; s++) if (w.pActive[s] && w.pHp[s]! > 0 && w.pState[s] === PlayerState.Alive) n++;
  if (n === 0) return -1;
  let k = w.rng.int(n);
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s] || w.pHp[s]! <= 0 || w.pState[s] !== PlayerState.Alive) continue;
    if (k-- === 0) return s;
  }
  return -1;
}

/** Meteors: circles that land on the players one after the other (each charges, then hits whoever still stands in it). */
function meteorRain(w: World, count: number): void {
  const m = BALANCE.bossAttacks.meteors;
  for (let k = 0; k < count; k++) {
    const s = pickPlayer(w);
    if (s < 0) return;
    const x = clamp(w.pX[s]! + (w.rng.float() * 2 - 1) * 3.5, -ARENA_HALF_W + 2, ARENA_HALF_W - 2);
    const y = clamp(w.pY[s]! + (w.rng.float() * 2 - 1) * 3.5, -ARENA_HALF_H + 2, ARENA_HALF_H - 2);
    addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, x, y, 0, m.radius, 0, m.delay + k * m.stagger, -m.damage);
  }
}

/** A line of damage from the boss through a player, all the way across the arena. */
function sweepAt(w: World, x: number, y: number): void {
  const sw = BALANCE.bossAttacks.sweep;
  const s = pickPlayer(w);
  if (s < 0) return;
  const a = aimAt(x, y, w.pX[s]!, w.pY[s]!);
  const half = 64;
  addTelegraph(w, TeleShape.Rect, TeleEffect.Hurt, x + cos(a) * half, y + sin(a) * half, a, sw.width, half, sw.delay, -sw.damage);
}

/** The purge: a big part of the arena slowly paints red, then everybody still in it loses half their health (all of it on later floors). */
function purge(w: World, x: number, y: number): void {
  const p = BALANCE.bossAttacks.purge;
  const effect = w.wave >= p.killFloor ? TeleEffect.Kill : TeleEffect.Half;
  const W = ARENA_HALF_W * 2;
  const H = ARENA_HALF_H * 2;
  const kind = w.rng.int(4);
  if (kind === 0) {
    // radial: a disc around the boss covering the same share of the floor
    const r = sqrt((p.areaFraction * W * H) / 3.141592653589793);
    addTelegraph(w, TeleShape.Circle, effect, x, y, 0, r, 0, p.delay, 0);
  } else if (kind === 1 || kind === 2) {
    // a vertical slab from the left or the right edge
    const half = (p.areaFraction * W) / 2;
    addTelegraph(w, TeleShape.Rect, effect, (kind === 1 ? -1 : 1) * (ARENA_HALF_W - half), 0, 0, ARENA_HALF_H, half, p.delay, 0);
  } else {
    // a horizontal slab from the top or the bottom edge
    const half = (p.areaFraction * H) / 2;
    addTelegraph(w, TeleShape.Rect, effect, 0, (w.rng.int(2) ? 1 : -1) * (ARENA_HALF_H - half), 0, half, ARENA_HALF_W, p.delay, 0);
  }
}

/**
 * The eleven bosses fight differently (the first six below, then the iron colossus, the storm caller, the plague doctor, the stalker and the warlord): the brute charges and slams, the king summons grunts and calls meteors, the queen
 * spits out spitters and leaves acid, the swarm leader speeds up its horde and sweeps a line, the meteor lord rains
 * fire, the purger paints most of the arena red.
 */
function bossAbilities(w: World, i: number, x: number, y: number, dist: number): void {
  const cfg = BALANCE.progression.boss;
  const ba = BALANCE.bossAttacks;
  const variant = w.eBoss[i]!;
  const t = w.tick - w.waveTick;
  if (t <= 0) return;
  const every = (sec: number, offset = 0): boolean => (t + offset) % Math.round(sec * TICK_RATE) === 0;
  const callState = (): void => {
    w.eState[i] = EnemyState.Attack;
    w.eStateTick[i] = w.tick;
  };
  const slam = (): void => {
    addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, x, y, 0, ba.slam.radius, 0, ba.slam.delay, -ba.slam.damage);
    w.events.push({ type: 'bossAbility', kind: 'slam', x, y });
    callState();
  };
  const meteors = (n: number): void => {
    meteorRain(w, n);
    w.events.push({ type: 'bossAbility', kind: 'meteor', x, y });
    callState();
  };
  if (variant === 1) {
    if (every(cfg.chargeSeconds) && dist > 4 && w.eAux[i]! <= 0) {
      w.eAux[i] = cfg.chargeTicks;
      w.events.push({ type: 'bossAbility', kind: 'charge', x, y });
      callState();
    }
    if (every(ba.slam.every, 100) && dist < 11) slam();
  } else if (variant === 2) {
    if (every(cfg.summonSeconds)) {
      summonRing(w, x, y, T_GRUNT, cfg.summonCount);
      w.events.push({ type: 'bossAbility', kind: 'summon', x, y });
      callState();
    }
    if (every(ba.meteors.every + 2, 140)) meteors(ba.meteors.count - 1);
  } else if (variant === 3) {
    if (every(cfg.queenSummonSeconds)) {
      summonRing(w, x, y, T_SPITTER, cfg.queenCount);
      w.events.push({ type: 'bossAbility', kind: 'summon', x, y });
      callState();
    }
    if (every(ba.pools.every, 120)) {
      for (let k = 0; k < ba.pools.count; k++) {
        const s = pickPlayer(w);
        if (s < 0) break;
        const px = clamp(w.pX[s]! + (w.rng.float() * 2 - 1) * 2.5, -ARENA_HALF_W + 2, ARENA_HALF_W - 2);
        const py = clamp(w.pY[s]! + (w.rng.float() * 2 - 1) * 2.5, -ARENA_HALF_H + 2, ARENA_HALF_H - 2);
        addTelegraph(w, TeleShape.Circle, TeleEffect.Acid, px, py, 0, ba.pools.radius, 0, ba.pools.delay + k * 0.2, ba.pools.radius);
      }
      w.events.push({ type: 'bossAbility', kind: 'acid', x, y });
      callState();
    }
  } else if (variant === 4) {
    if (every(cfg.summonSeconds)) {
      summonRing(w, x, y, T_RUNNER, cfg.summonCount);
      w.events.push({ type: 'bossAbility', kind: 'aura', x, y });
      callState();
    }
    if (every(ba.sweep.every, 160)) {
      sweepAt(w, x, y);
      w.events.push({ type: 'bossAbility', kind: 'sweep', x, y });
      callState();
    }
  } else if (variant === 5) {
    if (every(ba.meteors.every - 2, 90)) meteors(ba.meteors.count + 3);
    if (every(ba.slam.every + 6, 200) && dist < 11) slam();
  } else if (variant === 7) {
    // iron colossus: shakes the floor, charges, slams
    if (every(ba.quake.every, 90) && dist < 14) {
      const q = ba.quake;
      addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, x, y, 0, q.radius, 0, q.delay, -q.damage);
      for (let k = 0; k < q.rocks; k++) {
        const s = pickPlayer(w);
        if (s < 0) break;
        const ox = clamp(w.pX[s]! + (w.rng.float() * 2 - 1) * 4, -ARENA_HALF_W + 2, ARENA_HALF_W - 2);
        const oy = clamp(w.pY[s]! + (w.rng.float() * 2 - 1) * 4, -ARENA_HALF_H + 2, ARENA_HALF_H - 2);
        addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, ox, oy, 0, q.rockRadius, 0, q.rockDelay + k * 0.18, -q.damage * 0.7);
      }
      w.events.push({ type: 'bossAbility', kind: 'quake', x, y });
      callState();
    }
    if (every(cfg.chargeSeconds + 2, 150) && dist > 5 && w.eAux[i]! <= 0) {
      w.eAux[i] = cfg.chargeTicks;
      w.events.push({ type: 'bossAbility', kind: 'charge', x, y });
      callState();
    }
    if (every(ba.slam.every + 3, 210) && dist < 11) slam();
  } else if (variant === 8) {
    // storm caller: lightning on the players, a ring of lightning round itself, shockers to keep the squad busy
    const st = ba.storm;
    if (every(st.every, 30)) {
      for (let k = 0; k < st.count; k++) {
        const s = pickPlayer(w);
        if (s < 0) break;
        const ox = clamp(w.pX[s]! + (w.rng.float() * 2 - 1) * 3, -ARENA_HALF_W + 2, ARENA_HALF_W - 2);
        const oy = clamp(w.pY[s]! + (w.rng.float() * 2 - 1) * 3, -ARENA_HALF_H + 2, ARENA_HALF_H - 2);
        addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, ox, oy, 0, st.radius, 0, st.delay + k * 0.15, -st.damage);
      }
      w.events.push({ type: 'bossAbility', kind: 'storm', x, y });
      callState();
    }
    if (every(st.ringEvery, 120)) {
      addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, x, y, 0, st.ringRadius, 0, 1.2, -st.ringDamage);
      w.events.push({ type: 'bossAbility', kind: 'storm', x, y });
      callState();
    }
    if (every(cfg.summonSeconds * 1.5, 70)) {
      summonRing(w, x, y, T_SHOCKER, 2);
      w.events.push({ type: 'bossAbility', kind: 'summon', x, y });
      callState();
    }
  } else if (variant === 9) {
    // plague doctor: poisoned ground all over, broods that burst into crawlers
    const pl = ba.plague;
    if (every(pl.every, 0)) {
      for (let k = 0; k < pl.zones; k++) {
        const s = pickPlayer(w);
        if (s < 0) break;
        const ox = clamp(w.pX[s]! + (w.rng.float() * 2 - 1) * 7, -ARENA_HALF_W + 3, ARENA_HALF_W - 3);
        const oy = clamp(w.pY[s]! + (w.rng.float() * 2 - 1) * 7, -ARENA_HALF_H + 3, ARENA_HALF_H - 3);
        addTelegraph(w, TeleShape.Circle, TeleEffect.Acid, ox, oy, 0, pl.radius, 0, 1.2, pl.radius);
      }
      w.events.push({ type: 'bossAbility', kind: 'plague', x, y });
      callState();
    }
    if (every(pl.summonEvery, 100)) {
      summonRing(w, x, y, T_BROOD, 2);
      summonRing(w, x, y, T_SPITTER, pl.summonCount);
      w.events.push({ type: 'bossAbility', kind: 'summon', x, y });
      callState();
    }
  } else if (variant === 10) {
    // stalker: leaps at one player after the other, cuts lines across the arena
    const po = ba.pounce;
    if (every(po.every, 60) && dist >= po.minRange && w.eAir[i]! <= 0) {
      const s = pickPlayer(w);
      if (s >= 0) {
        const px = w.pX[s]!;
        const py = w.pY[s]!;
        addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, px, py, 0, po.radius, 0, AIR_TICKS * TICK_DT, -po.damage);
        leapTo(w, i, px, py);
        w.events.push({ type: 'bossAbility', kind: 'pounce', x, y });
        callState();
      }
    }
    if (every(ba.sweep.every + 4, 170)) {
      sweepAt(w, x, y);
      w.events.push({ type: 'bossAbility', kind: 'sweep', x, y });
      callState();
    }
    if (every(cfg.summonSeconds * 2, 90)) summonRing(w, x, y, T_RUNNER, 4);
  } else if (variant === 11) {
    // warlord: throws its own soldiers at the players, calls war cries and charges
    const hu = ba.hurl;
    if (every(hu.every, 45)) {
      let thrown = 0;
      for (let k = 0; k < hu.count; k++) {
        const v = pickSmall(w, x, y, hu.pickRadius, i);
        const s = pickPlayer(w);
        if (v < 0 || s < 0) break;
        hurlAt(w, v, w.pX[s]! + (w.rng.float() * 2 - 1) * 1.5, w.pY[s]! + (w.rng.float() * 2 - 1) * 1.5, hu.radius, -hu.damage, 0.1);
        thrown++;
      }
      if (thrown > 0) {
        w.events.push({ type: 'bossAbility', kind: 'hurl', x, y });
        callState();
      }
    }
    if (every(hu.hornEvery, 100)) {
      summonRing(w, x, y, T_WARCALLER, 1);
      summonRing(w, x, y, T_CHOPPER, 2);
      summonRing(w, x, y, T_GRUNT, hu.hornCount);
      w.events.push({ type: 'bossAbility', kind: 'summon', x, y });
      callState();
    }
    if (every(cfg.chargeSeconds + 3, 200) && dist > 5 && w.eAux[i]! <= 0) {
      w.eAux[i] = cfg.chargeTicks;
      w.events.push({ type: 'bossAbility', kind: 'charge', x, y });
      callState();
    }
  } else if (variant === 6) {
    // the first purge ten seconds in, then on its own cycle
    const period = Math.round(ba.purge.every * TICK_RATE);
    if (t >= 300 && (t - 300) % period === 0) {
      purge(w, x, y);
      w.events.push({ type: 'bossAbility', kind: 'purge', x, y });
      callState();
    }
    if (every(ba.sweep.every + 2, 170)) {
      sweepAt(w, x, y);
      w.events.push({ type: 'bossAbility', kind: 'sweep', x, y });
      callState();
    }
    if (every(cfg.summonSeconds * 2, 60)) summonRing(w, x, y, T_RUNNER, 4);
  }
}

/** The boss variants in the order the boss floors bring them: the older and the newer mixed, so a long run meets both early. */
const BOSS_ORDER: readonly number[] = [1, 2, 7, 3, 8, 4, 9, 5, 10, 6, 11];

export function spawnBoss(w: World): number {
  edgePoint(w);
  const i = spawnEnemy(w, T_TANK, spawnX, spawnY);
  if (i >= 0) {
    w.eBoss[i] = BOSS_ORDER[((((w.wave / BALANCE.progression.boss.everyWaves) | 0) - 1) % BOSS_ORDER.length + BOSS_ORDER.length) % BOSS_ORDER.length]!;
    w.eHp[i] = w.eHp[i]! * BALANCE.progression.boss.hpMul * fxOf(w).bossHp;
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
  applyObstacles(w.field, w.map, 0);
  applyObstacles(w.field1, w.map, 1);
  w.pLayer.fill(0);
  w.eLayer.fill(0);
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
    // the last blow gets its finisher (everybody frozen in place, the camera zooms in on it) before the countdown starts
    const cine = Math.round(fl.finisherSeconds * TICK_RATE);
    w.misc[MISC.Phase] = FloorPhase.Cleared;
    w.misc[MISC.Cine] = w.tick + cine;
    w.misc[MISC.PhaseEnd] = w.tick + cine + Math.round(fl.clearedSeconds * TICK_RATE);
    w.events.push({ type: 'finalKill', by: w.misc[MISC.Killer]!, x: w.misc[MISC.KillX]!, y: w.misc[MISC.KillY]! });
    w.events.push({ type: 'waveCleared', wave: w.wave });
    hooks.floorCleared(w, w.wave);
  }
}

export function hurtPlayer(w: World, slot: number, rawDamage: number, x: number, y: number, attacker = -1): boolean {
  if (w.pIFrames[slot]! > 0 || w.pHp[slot]! <= 0) return false;
  // a negative amount is a share of the victim's max health (boss attacks: they scale with the player, not with the floor);
  // everything else is flat damage that is doubled and grows on late floors
  const base = rawDamage < 0 ? Math.min(0.95, -rawDamage * fxOf(w).enemyDamage) * w.pMaxHp[slot]! : rawDamage * BALANCE.enemyDamageMul * fxOf(w).enemyDamage * (1 + lateFloors(w) * BALANCE.late.damagePerFloor);
  const damage = absorb(w, slot, base * abilityTaken(w, slot) * w.modArmor[slot]! * w.pModArmor[slot]!);
  const thorns = perk(w, slot, PERK.Thorns);
  if (thorns > 0 && attacker >= 0 && w.eActive[attacker]) {
    const prev = killer;
    killer = slot;
    damageEnemy(w, attacker, thorns, 0, 0);
    killer = prev;
  }
  addStat(w, slot, STAT.DamageTaken, damage < w.pHp[slot]! ? damage : w.pHp[slot]!);
  const hp = w.pHp[slot]! - damage;
  w.pHp[slot] = hp > 0 ? hp : 0;
  w.pIFrames[slot] = BALANCE.player.iFrames;
  if (attacker >= 0 && w.eActive[attacker] && w.eMod[attacker] === ELITE.Vampiric) w.eHp[attacker] = w.eHp[attacker]! + BALANCE.elites.vampHeal * w.hpMul;
  w.events.push({ type: 'playerHit', slot, x, y, damage });
  return true;
}

function explode(w: World, i: number): void {
  const x = w.eX[i]!;
  const y = w.eY[i]!;
  const radius = BLAST[T_EXPLODER]! * BALANCE.hitbox.enemyMul;
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
    heal(w, killer, w.pLifesteal[killer]!);
  }
  w.eActive[i] = 0;
  w.enemyCount--;
  w.kills++;
  const eliteKill = w.eMod[i] !== 0;
  if (w.eBoss[i]) addStat(w, killer, STAT.BossKills, 1);
  w.events.push({ type: 'enemyDeath', id: i, etype: type, x: w.eX[i]!, y: w.eY[i]!, dx, dy, power });
  dropLoot(w, w.eX[i]!, w.eY[i]!, w.eBoss[i]! !== 0, w.eLayer[i]!, eliteKill);
  // experience belongs to the character that made the kill; a kill nobody owns is shared by the living
  const xp = w.eBoss[i] ? BALANCE.progression.boss.xp : BALANCE.progression.xp[ENEMY_TYPES[type]!]!;
  if (droneCredit.slot >= 0) hooks.droneXp(w, droneCredit.slot, xp * BALANCE.drones.killShare);
  if (killer >= 0 && w.pActive[killer]) awardXp(w, killer, xp);
  else {
    let alive = 0;
    for (let s = 0; s < MAX_PLAYERS; s++) if (w.pActive[s] && w.pState[s] === PlayerState.Alive) alive++;
    for (let s = 0; s < MAX_PLAYERS && alive > 0; s++) if (w.pActive[s] && w.pState[s] === PlayerState.Alive) awardXp(w, s, xp / alive);
  }
  if (type === T_EXPLODER) explode(w, i);
  if (type === T_BLOATER) {
    // the belly bursts: acid burns whoever is close and a litter of crawlers crawls out
    const bx = w.eX[i]!;
    const by = w.eY[i]!;
    const r = BLAST[T_BLOATER]! * BALANCE.hitbox.enemyMul;
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
  if (type === T_BROOD) {
    const bx = w.eX[i]!;
    const by = w.eY[i]!;
    for (let k = 0; k < SP.brood!.count!; k++) {
      const a = (k / SP.brood!.count!) * 6.283185307179586 + 0.9;
      spawnEnemy(w, T_CRAWLER, clamp(bx + cos(a) * 1.1, -ARENA_HALF_W + 1, ARENA_HALF_W - 1), clamp(by + sin(a) * 1.1, -ARENA_HALF_H + 1, ARENA_HALF_H - 1), false);
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
  // the blow that empties the floor is remembered for the finisher
  if (w.enemyCount === 0 && w.misc[MISC.Remaining] === 0 && w.misc[MISC.Total]! > 0) {
    w.misc[MISC.Killer] = killer;
    w.misc[MISC.KillX] = ex;
    w.misc[MISC.KillY] = ey;
  }
}

/** Damage dealt by a player's own blow (melee swings): the damage is credited to them. Returns true when the enemy died. */
export function damageEnemyBy(w: World, i: number, owner: number, damage: number, dx: number, dy: number): boolean {
  const prev = killer;
  killer = owner;
  const dead = damageEnemy(w, i, damage, dx, dy);
  killer = prev;
  return dead;
}

/** Apply bullet damage; returns true when the enemy died. */
export function damageEnemy(w: World, i: number, rawDamage: number, dx: number, dy: number): boolean {
  let damage = w.eMod[i] ? rawDamage * enemyDamageMul(w, i) : rawDamage;
  if (w.eMod[i] === ELITE.Phantom && (Math.imul(w.tick + i * 977, 2654435761) >>> 0) % 100 < BALANCE.elites.phantomDodge * 100) {
    // a phantom slips out of the way of some of what hits it: a short sidestep and the damage is gone
    const sx = -dy;
    const sy = dx;
    const l = sqrt(sx * sx + sy * sy);
    const x0 = w.eX[i]!;
    const y0 = w.eY[i]!;
    if (l > 1e-6) shove(w, i, (sx / l) * 1.4, (sy / l) * 1.4);
    w.events.push({ type: 'blink', id: i, x0, y0, x: w.eX[i]!, y: w.eY[i]! });
    return false;
  }
  if (w.eShield[i]! > 0) {
    // a warded enemy loses its shield first
    const take = damage < w.eShield[i]! ? damage : w.eShield[i]!;
    w.eShield[i] = w.eShield[i]! - take;
    damage -= take;
    if (killer >= 0) addStat(w, killer, STAT.Hits, 1);
    if (damage <= 0) {
      w.events.push({ type: 'enemyHit', id: i, etype: w.eType[i]!, x: w.eX[i]!, y: w.eY[i]!, damage: take, by: killer });
      return false;
    }
  }
  // the damage meter counts what was really taken off (no credit for overkill)
  if (killer >= 0) {
    addPerk(w, killer, PERK.Damage, Math.min(damage, Math.max(0, w.eHp[i]!)));
    addStat(w, killer, STAT.Hits, 1);
    maxStat(w, killer, STAT.MaxHit, damage);
  }
  w.eHp[i] = w.eHp[i]! - damage;
  if (w.eHp[i]! <= 0) {
    killEnemy(w, i, dx, dy, damage);
    return true;
  }
  w.events.push({ type: 'enemyHit', id: i, etype: w.eType[i]!, x: w.eX[i]!, y: w.eY[i]!, damage, by: killer });
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
  if (pushOut(x, y, r * 0.8, w.eLayer[i]!)) {
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
  const map = MAPS[w.map] ?? MAPS[0]!;
  if (!isLayered(map)) {
    let n = 0;
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (w.pActive[s] && w.pHp[s]! > 0) sources[n++] = cellIndex(w.pX[s]!, w.pY[s]!);
    }
    w.field.compute(sources, n);
    return;
  }
  // two levels: each level heads for the players on it, and for the way to the other level when somebody is there
  let n0 = 0;
  let n1 = 0;
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s] || w.pHp[s]! <= 0) continue;
    if (w.pLayer[s] === 1) sources1[n1++] = cellIndex(w.pX[s]!, w.pY[s]!);
    else sources[n0++] = cellIndex(w.pX[s]!, w.pY[s]!);
  }
  const upstairs = n1 > 0;
  const downstairs = n0 > 0;
  for (const r of map.ramps ?? []) {
    const d = rampDir(r);
    const half = (r.dir === 0 || r.dir === 2 ? r.w : r.h) / 2 - 0.45;
    if (upstairs) sources[n0++] = cellIndex(r.x - d[0] * half, r.y - d[1] * half); // the foot, for those who have to go up
    if (downstairs) sources1[n1++] = cellIndex(r.x + d[0] * half, r.y + d[1] * half); // the top, for those who have to come down
  }
  w.field.compute(sources, n0);
  w.field1.compute(sources1, n1);
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
    // the freeze pickup's timer (the frozen enemies carry their own ticks in eFrost)
    w.misc[0] = w.misc[0]! - TICK_DT;
    if (w.misc[0]! <= 0) {
      w.misc[0] = 0;
      w.events.push({ type: 'thaw' });
    }
  }
  const g = w.grid;
  const pr = BALANCE.player.radius;
  const map = currentMap();
  const layered = isLayered(map);

  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!w.eActive[i]) continue;
    if (w.eSlow[i]! > 0 && --w.eSlow[i]! === 0) w.eSlowP[i] = 0;
    if (w.eFrost[i]! > 0) {
      w.eFrost[i] = w.eFrost[i]! - 1; // frozen solid: no step, no attack, no clock
      w.eStateTick[i] = w.eStateTick[i]! + 1;
      continue;
    }
    if (w.eAir[i]! > 0) {
      // thrown through the air: carried along, nothing else
      w.eAir[i] = w.eAir[i]! - 1;
      shove(w, i, w.eVX[i]! * TICK_DT, w.eVY[i]! * TICK_DT);
      w.eVX[i] = w.eVX[i]! * 0.94;
      w.eVY[i] = w.eVY[i]! * 0.94;
      continue;
    }
    const type = w.eType[i]!;
    let x = w.eX[i]!;
    let y = w.eY[i]!;
    w.eCooldown[i] = w.eCooldown[i]! - TICK_DT / fxOf(w).enemyCooldown;
    if (w.eMod[i] === ELITE.Regen) w.eHp[i] = w.eHp[i]! + BALANCE.elites.regenPerSec * w.hpMul * TICK_DT;
    else if (w.eMod[i] === ELITE.Toxic && (w.tick + i) % BALANCE.elites.toxicEvery === 0) addZone(w, w.eX[i]!, w.eY[i]!, 1.0, 3, ZoneKind.Acid);
    const age = w.tick - w.eStateTick[i]!;
    let state = w.eState[i]!;
    if (state === EnemyState.Spawn && age >= SPAWN_TICKS) state = EnemyState.Move;
    else if (state === EnemyState.Attack && age >= ATTACK_TICKS) state = EnemyState.Move;
    if (state !== w.eState[i]!) {
      w.eState[i] = state;
      w.eStateTick[i] = w.tick;
    }

    // nearest living player on the same level (or, with nobody there, the nearest on the other one: it is walked to by the ramps)
    const L = w.eLayer[i]!;
    let best = -1;
    let bd2 = 1e18;
    let any = -1;
    let anyD2 = 1e18;
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!w.pActive[s] || w.pHp[s]! <= 0) continue;
      const dx = w.pX[s]! - x;
      const dy = w.pY[s]! - y;
      const d2 = dx * dx + dy * dy;
      if (w.pLayer[s] === L && d2 < bd2) {
        bd2 = d2;
        best = s;
      }
      if (d2 < anyD2) {
        anyD2 = d2;
        any = s;
      }
    }
    if (best < 0) {
      best = any;
      bd2 = anyD2;
    }
    if (best < 0) continue;
    const cross = w.pLayer[best] !== L;
    const field = L === 1 ? w.field1 : w.field;
    const oldX = x;
    const oldY = y;
    const dist = sqrt(bd2);
    const tx = (w.pX[best]! - x) / (dist > 1e-6 ? dist : 1);
    const ty = (w.pY[best]! - y) / (dist > 1e-6 ? dist : 1);
    const reach = rad(w, i) + pr;
    const boss = w.eBoss[i]! !== 0;

    let mx = 0;
    let my = 0;
    if (boss && state !== EnemyState.Spawn) bossAbilities(w, i, x, y, dist);
    state = w.eState[i]!;
    let busy = false;
    if (type >= FIRST_SPECIAL && state !== EnemyState.Spawn) {
      busy = special(w, i, type, x, y, best, dist, tx, ty);
      mx = spMX;
      my = spMY;
    }
    if (busy) {
      // winding up, charging, backing off: handled above
    } else if (state === EnemyState.Move) {
      let wantMove = true;
      if (type === T_SPITTER) {
        if (dist < SPIT_HOLD) wantMove = false;
        if (dist <= SPIT_RANGE && w.eCooldown[i]! <= 0 && !segmentBlocked(x, y, w.pX[best]!, w.pY[best]!, L)) {
          spawnSpit(w, x, y, tx, ty, L);
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
        if (!cross && dist <= reach + 0.3) {
          killEnemy(w, i, tx, ty, 0);
          continue;
        }
      } else if (!cross && dist <= reach + 0.15 + BALANCE.hitbox.melee) {
        wantMove = false;
        if (w.eCooldown[i]! <= 0 && hurtPlayer(w, best, boss ? -BALANCE.progression.boss.damage : DAMAGE[type]!, w.pX[best]!, w.pY[best]!, i)) {
          w.eCooldown[i] = INTERVAL[type]!;
          w.eState[i] = EnemyState.Attack;
          w.eStateTick[i] = w.tick;
        }
      }
      if (wantMove && w.eState[i] === EnemyState.Move) {
        let dx = tx;
        let dy = ty;
        if (cross || dist > 3 || segmentBlocked(x, y, w.pX[best]!, w.pY[best]!, L)) {
          const c = cellIndex(x, y);
          if (field.dirX[c]! !== 0 || field.dirY[c]! !== 0) {
            dx = field.dirX[c]!;
            dy = field.dirY[c]!;
          }
        }
        // once on a ramp it keeps going toward the other level when that is where its target is: up from the ground, down from a deck
        if (layered && cross) {
          const ri = rampAt(map, x, y);
          if (ri >= 0) {
            const rd = rampDir(map.ramps![ri]!);
            dx = rd[0] * (L === 0 ? 1 : -1);
            dy = rd[1] * (L === 0 ? 1 : -1);
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
        if (w.eMod[i] === ELITE.Berserk && (w.tick + i * 13) % 180 < 60) sp *= BALANCE.elites.berserkSpeed; // a few seconds of frenzy every six
        if (w.eMod[i] || w.wave >= 3) sp *= enemySpeedMul(w, i);
        if (perk(w, best, PERK.Frost) > 0 && dist < BALANCE.perks.frostRadius) sp *= BALANCE.perks.frostSlow;
        if (w.eSlowP[i]! > 0) sp *= 1 - w.eSlowP[i]! / 100; // a cryo drone's field
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
    if (pushOut(x, y, r0 * 0.8, L)) {
      x = out.x;
      y = out.y;
    }
    if (layered) {
      if (L === 1 && !deckWalkable(map, x, y)) {
        x = oldX;
        y = oldY;
      }
      w.eLayer[i] = nextLayer(map, x, y, L);
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
  // the biggest body (a boss) plus the bullet's own reach must fit inside the cells that are looked at
  const minX = (x0 < x1 ? x0 : x1) - HIT_MARGIN;
  const maxX = (x0 < x1 ? x1 : x0) + HIT_MARGIN;
  const minY = (y0 < y1 ? y0 : y1) - HIT_MARGIN;
  const maxY = (y0 < y1 ? y1 : y0) + HIT_MARGIN;
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
          if (!w.eActive[j] || w.eLayer[j]! > w.bLayer[b]!) continue;
          if (hits[b * 4]! === j || hits[b * 4 + 1]! === j || hits[b * 4 + 2]! === j || hits[b * 4 + 3]! === j) continue;
          const ex = w.eX[j]! - x0;
          const ey = w.eY[j]! - y0;
          let t = len2 > 1e-12 ? (ex * sx + ey * sy) / len2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = ex - sx * t;
          const py = ey - sy * t;
          const R = rad(w, j) + BALANCE.hitbox.bulletR;
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
    const src = w.bSrc[b]!;
    if (src > 0) droneCredit.slot = killer;
    damageEnemy(w, bestSlot, dmg, bdx, bdy);
    if (src > 0) {
      droneCredit.slot = -1;
      hooks.droneXp(w, killer, dmg * BALANCE.drones.damageXp);
      // the twin's heavier tiers push what they hit back a little
      if (src === 5 && w.bBlastD[b]! > 0 && w.eActive[bestSlot]) shove(w, bestSlot, bdx * w.bBlastD[b]!, bdy * w.bBlastD[b]!);
    }
    killer = -1;
    // a frost round leaves the enemy frozen for a moment (bosses shrug it off)
    const owner = w.bOwner[b]!;
    const freeze = owner >= 0 && src === 0 ? BALANCE.weapons[WEAPON_IDS[w.pWeapon[owner]!]!]!.freeze : undefined;
    if (freeze && w.eActive[bestSlot] && !w.eBoss[bestSlot] && w.eFrost[bestSlot]! < freeze) w.eFrost[bestSlot] = freeze;
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

function spawnSpit(w: World, x: number, y: number, dx: number, dy: number, layer = 0): void {
  for (let i = 0; i < MAX_SPIT; i++) {
    if (w.sActive[i]) continue;
    w.sActive[i] = 1;
    w.sLayer[i] = layer;
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
    addStat(w, slot, STAT.Grenades, 1);
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
    if (inp && (inp.buttons & Buttons.Grenade) !== 0 && w.pGren[s]! > 0 && w.pGrenCd[s]! <= 0) throwGrenade(w, s, inp.gAim !== undefined ? inp.gAim * AIM_RAD : w.pAngle[s]!, inp.aimDist ?? 0);
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
      const bm = w.modBlast[w.gOwner[i]!]! * perk(w, w.gOwner[i]!, PERK.Blast);
      w.events.push({ type: 'explosion', x: w.gX[i]!, y: w.gY[i]!, radius: cfg.radius * bm });
      killer = w.gOwner[i]!;
      blastEnemies(w, w.gX[i]!, w.gY[i]!, cfg.radius * bm, cfg.damage * bm);
      killer = -1;
    }
  }
  const spitR = BALANCE.spit.radius * BALANCE.hitbox.enemyMul + BALANCE.player.radius;
  const r2 = spitR * spitR;
  for (let i = 0; i < MAX_SPIT; i++) {
    if (!w.sActive[i]) continue;
    const x0 = w.sX[i]!;
    const y0 = w.sY[i]!;
    const x1 = x0 + w.sVx[i]! * TICK_DT;
    const y1 = y0 + w.sVy[i]! * TICK_DT;
    w.sX[i] = x1;
    w.sY[i] = y1;
    w.sLife[i] = w.sLife[i]! - TICK_DT;
    let dead = w.sLife[i]! <= 0 || segmentBlocked(x0, y0, x1, y1, w.sLayer[i]!);
    for (let s = 0; s < MAX_PLAYERS && !dead; s++) {
      if (!w.pActive[s] || w.pHp[s]! <= 0 || w.pLayer[s]! > w.sLayer[i]!) continue;
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
