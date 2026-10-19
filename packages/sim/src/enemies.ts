import { ARENA_HALF_H, ARENA_HALF_W, BALANCE, ENEMY_TYPES, EnemyState, MAX_ENEMIES, MAX_PLAYERS, TICK_DT, TICK_RATE } from '@wrh/shared';
import { atan2, clamp, cos, sin, sqrt } from './detmath';
import { awardXp } from './progression';
import { cellIndex } from './flowfield';
import { SH_H, SH_W } from './spatial';
import type { World } from './state';

const N_TYPES = ENEMY_TYPES.length;
const T_EXPLODER = ENEMY_TYPES.indexOf('exploder');
const T_SPITTER = ENEMY_TYPES.indexOf('spitter');
const T_SPAWNER = ENEMY_TYPES.indexOf('spawner');
const T_GRUNT = ENEMY_TYPES.indexOf('grunt');
const T_TANK = ENEMY_TYPES.indexOf('tank');

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

function rad(w: World, i: number): number {
  const r = RADIUS[w.eType[i]!]!;
  return w.eBoss[i] ? r * BALANCE.progression.boss.radiusMul : r;
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
    const hp = HP[type]! * w.hpMul * (1 + BALANCE.waves.playerHpGrowth * (players > 1 ? players - 1 : 0));
    w.eActive[i] = 1;
    w.eBoss[i] = 0;
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

export function spawnBoss(w: World): number {
  edgePoint(w);
  const i = spawnEnemy(w, T_TANK, spawnX, spawnY);
  if (i >= 0) {
    w.eBoss[i] = 1;
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

function runWaves(w: World, playerCount: number): void {
  const cfg = BALANCE.waves;
  if (w.tick - w.waveTick >= cfg.periodSeconds * TICK_RATE) {
    setWave(w, w.wave + 1);
    const boss = w.wave % BALANCE.progression.boss.everyWaves === 0;
    w.events.push({ type: 'waveStart', wave: w.wave, boss });
    if (boss) spawnBoss(w);
  }
  if (playerCount === 0) return;
  let target = Math.floor((cfg.baseCount + cfg.perPlayer * playerCount) * w.countMul);
  if (target > cfg.cap) target = cfg.cap;
  for (let n = 0; n < cfg.spawnPerTick && w.enemyCount < target; n++) {
    let ok = false;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      edgePoint(w);
      ok = farFromPlayers(w, spawnX, spawnY);
    }
    spawnEnemy(w, pickType(w), spawnX, spawnY);
  }
}

export function hurtPlayer(w: World, slot: number, damage: number, x: number, y: number): boolean {
  if (w.pIFrames[slot]! > 0 || w.pHp[slot]! <= 0) return false;
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
  w.eActive[i] = 0;
  w.enemyCount--;
  w.kills++;
  w.events.push({ type: 'enemyDeath', id: i, etype: type, x: w.eX[i]!, y: w.eY[i]!, dx, dy, power });
  awardXp(w, w.eBoss[i] ? BALANCE.progression.boss.xp : BALANCE.progression.xp[ENEMY_TYPES[type]!]);
  if (type === T_EXPLODER) explode(w, i);
}

/** Apply bullet damage; returns true when the enemy died. */
export function damageEnemy(w: World, i: number, damage: number, dx: number, dy: number): boolean {
  w.eHp[i] = w.eHp[i]! - damage;
  if (w.eHp[i]! <= 0) {
    killEnemy(w, i, dx, dy, damage);
    return true;
  }
  w.events.push({ type: 'enemyHit', id: i, etype: w.eType[i]!, x: w.eX[i]!, y: w.eY[i]! });
  return false;
}

function rebuildGrid(w: World): void {
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
  rebuildGrid(w);
  refreshField(w);
  if (playerCount === 0) return;
  const g = w.grid;
  const field = w.field;
  const pr = BALANCE.player.radius;

  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!w.eActive[i]) continue;
    const type = w.eType[i]!;
    let x = w.eX[i]!;
    let y = w.eY[i]!;
    w.eCooldown[i] = w.eCooldown[i]! - TICK_DT;
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
    const boss = w.eBoss[i] === 1;

    let mx = 0;
    let my = 0;
    if (state === EnemyState.Move) {
      let wantMove = true;
      if (boss && (w.tick - w.waveTick) % (BALANCE.progression.boss.summonSeconds * TICK_RATE) === 0 && w.tick > w.waveTick && w.enemyCount < BALANCE.waves.cap) {
        // the boss calls a ring of grunts then keeps coming
        const n = BALANCE.progression.boss.summonCount;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * 6.283185307179586;
          spawnEnemy(w, T_GRUNT, clamp(x + cos(a) * 2.5, -ARENA_HALF_W + 1, ARENA_HALF_W - 1), clamp(y + sin(a) * 2.5, -ARENA_HALF_H + 1, ARENA_HALF_H - 1));
        }
        w.eState[i] = EnemyState.Attack;
        w.eStateTick[i] = w.tick;
      }
      if (type === T_SPITTER) {
        if (dist < SPIT_HOLD) wantMove = false;
        if (dist <= SPIT_RANGE && w.eCooldown[i]! <= 0) {
          if (hurtPlayer(w, best, DAMAGE[type]!, w.pX[best]!, w.pY[best]!)) {
            w.eCooldown[i] = INTERVAL[type]!;
            w.eState[i] = EnemyState.Attack;
            w.eStateTick[i] = w.tick;
          }
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
        if (w.eCooldown[i]! <= 0 && hurtPlayer(w, best, boss ? BALANCE.progression.boss.damage : DAMAGE[type]!, w.pX[best]!, w.pY[best]!)) {
          w.eCooldown[i] = INTERVAL[type]!;
          w.eState[i] = EnemyState.Attack;
          w.eStateTick[i] = w.tick;
        }
      }
      if (wantMove && w.eState[i] === EnemyState.Move) {
        let dx = tx;
        let dy = ty;
        if (dist > 3) {
          const c = cellIndex(x, y);
          if (field.dirX[c]! !== 0 || field.dirY[c]! !== 0) {
            dx = field.dirX[c]!;
            dy = field.dirY[c]!;
          }
        }
        const sp = SPEED[type]! * (0.9 + ((i * 37) % 16) * 0.0125);
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
    damageEnemy(w, bestSlot, w.bDamage[b]!, sp > 0 ? w.bVx[b]! / sp : 0, sp > 0 ? w.bVy[b]! / sp : 0);
    if (w.bPierce[b]! <= 0) {
      w.bX[b] = x0 + sx * bestT;
      w.bY[b] = y0 + sy * bestT;
      return true;
    }
    w.bPierce[b] = w.bPierce[b]! - 1;
  }
}

