import { ARENA_HALF_H, ARENA_HALF_W, BALANCE, MAX_BARRELS, MAX_ENEMIES, MAX_PLAYERS, PERK, PERKS, PlayerState, TICK_DT } from '@wrh/shared';
import { sqrt } from './detmath';
import { out, pushOut } from './obstacles';
import type { World } from './state';

/**
 * Classes, perks, elite enemies, wave modifiers, explosive barrels and the power-ups. Everything here is part of the
 * simulation (deterministic, in the snapshot and the hash). The functions that need the enemy system (blasts, damage)
 * go through `hooks`, which enemies.ts fills in, so this file does not depend on it.
 */
interface Hooks {
  blast(w: World, owner: number, x: number, y: number, radius: number, damage: number): void;
  damage(w: World, i: number, damage: number, dx: number, dy: number, owner: number): void;
  hurt(w: World, slot: number, damage: number, x: number, y: number): void;
}
export const hooks: Hooks = {
  blast() {
    /* set by enemies.ts */
  },
  damage() {
    /* set by enemies.ts */
  },
  hurt() {
    /* set by enemies.ts */
  },
};

export const perk = (w: World, s: number, k: number): number => w.pPerk[s * PERKS + k]!;
export const setPerk = (w: World, s: number, k: number, v: number): void => {
  w.pPerk[s * PERKS + k] = v;
};
export const addPerk = (w: World, s: number, k: number, v: number): void => {
  w.pPerk[s * PERKS + k] = w.pPerk[s * PERKS + k]! + v;
};

/** Clear a player's perks to their neutral values. */
export function resetPerks(w: World, s: number): void {
  w.pPerk.fill(0, s * PERKS, (s + 1) * PERKS);
  setPerk(w, s, PERK.ReviveRate, 1);
  setPerk(w, s, PERK.DashRate, 1);
  setPerk(w, s, PERK.Blast, 1);
  setPerk(w, s, PERK.HurtT, 99);
}

/** Give a player the stats and passives of a class (index into BALANCE.classes). */
export function applyClass(w: World, s: number, cls: number): void {
  const c = BALANCE.classes[cls] ?? BALANCE.classes[0]!;
  setPerk(w, s, PERK.Class, BALANCE.classes[cls] ? cls : 0);
  w.pMaxHp[s] = Math.max(30, w.pMaxHp[s]! + c.hp);
  w.pHp[s] = w.pMaxHp[s]!;
  w.pModSpeed[s] = w.pModSpeed[s]! * c.speed;
  w.pModDmg[s] = w.pModDmg[s]! * c.damage;
  w.pModRate[s] = w.pModRate[s]! * c.rate;
  w.pModArmor[s] = w.pModArmor[s]! * c.armor;
  w.pModPierce[s] = w.pModPierce[s]! + c.pierce;
  w.pLifesteal[s] = w.pLifesteal[s]! + c.lifesteal;
  w.pGren[s] = w.pGren[s]! + c.grenades;
  addPerk(w, s, PERK.Regen, c.regen);
  addPerk(w, s, PERK.Aura, c.aura);
  setPerk(w, s, PERK.Blast, c.blast);
  setPerk(w, s, PERK.ReviveRate, c.reviveRate);
  setPerk(w, s, PERK.DashRate, c.dashRate);
  setPerk(w, s, PERK.Rage, c.rage);
}

/** Damage multiplier of a shooter from power-ups and rage. */
export function damageMul(w: World, s: number): number {
  let m = 1;
  if (perk(w, s, PERK.Quad) > 0) m *= 2;
  const rage = perk(w, s, PERK.Rage);
  if (rage > 0 && w.pMaxHp[s]! > 0) m *= 1 + BALANCE.perks.rageMax * (1 - w.pHp[s]! / w.pMaxHp[s]!) * rage;
  return m;
}

/** Move speed multiplier from haste and adrenaline. */
export function speedMul(w: World, s: number): number {
  let m = 1;
  if (perk(w, s, PERK.Haste) > 0) m = 1.4;
  if (perk(w, s, PERK.Adren) > 0 && BALANCE.perks.adrenSpeed > m) m = BALANCE.perks.adrenSpeed;
  return m;
}

/** Damage after the barrier card's shield: the shield soaks first. Returns what is left for the hit points. */
export function absorb(w: World, s: number, damage: number): number {
  setPerk(w, s, PERK.HurtT, 0);
  setPerk(w, s, PERK.ShieldCd, BALANCE.perks.barrierCd);
  const shield = perk(w, s, PERK.Shield);
  if (shield <= 0) return damage;
  const take = Math.min(shield, damage);
  setPerk(w, s, PERK.Shield, shield - take);
  return damage - take;
}

/** Per-tick upkeep: regeneration, the medic's aura, shield recharge and power-up timers. */
export function updatePlayerPerks(w: World): void {
  const cfg = BALANCE.perks;
  const r2 = cfg.auraRadius * cfg.auraRadius;
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s] || w.pState[s] !== PlayerState.Alive) continue;
    const b = s * PERKS;
    const p = w.pPerk;
    p[b + PERK.HurtT] = p[b + PERK.HurtT]! + TICK_DT;
    for (const k of [PERK.Haste, PERK.Quad, PERK.Adren]) if (p[b + k]! > 0) p[b + k] = Math.max(0, p[b + k]! - TICK_DT);
    const shieldMax = p[b + PERK.ShieldMax]!;
    if (shieldMax > 0) {
      if (p[b + PERK.ShieldCd]! > 0) p[b + PERK.ShieldCd] = p[b + PERK.ShieldCd]! - TICK_DT;
      else if (p[b + PERK.Shield]! < shieldMax) p[b + PERK.Shield] = Math.min(shieldMax, p[b + PERK.Shield]! + 24 * TICK_DT);
    }
    let regen = p[b + PERK.Regen]!;
    if (p[b + PERK.HurtT]! >= cfg.outOfCombatSeconds) regen += cfg.baseRegen;
    if (regen > 0 && w.pHp[s]! > 0 && w.pHp[s]! < w.pMaxHp[s]!) w.pHp[s] = Math.min(w.pMaxHp[s]!, w.pHp[s]! + regen * TICK_DT);
    const aura = p[b + PERK.Aura]!;
    if (aura > 0) {
      for (let t = 0; t < MAX_PLAYERS; t++) {
        if (t === s || !w.pActive[t] || w.pState[t] !== PlayerState.Alive || w.pHp[t]! >= w.pMaxHp[t]!) continue;
        const dx = w.pX[t]! - w.pX[s]!;
        const dy = w.pY[t]! - w.pY[s]!;
        if (dx * dx + dy * dy <= r2) w.pHp[t] = Math.min(w.pMaxHp[t]!, w.pHp[t]! + aura * TICK_DT);
      }
    }
  }
}

// ---- elite enemies and wave modifiers ----

/** The modifier of a wave (0 none, 1 swarm, 2 armoured, 3 fast, 4 bounty, 5 elite storm): a fixed pattern after the first waves. */
export function waveModOf(wave: number): number {
  return wave < 3 ? 0 : (wave * 7 + (wave >> 2)) % 6;
}

export const ELITE = { Giant: 1, Swift: 2, Splitter: 3, Volatile: 4, Regen: 5, Armored: 6 } as const;

export function eliteChance(w: World): number {
  const c = BALANCE.elites;
  if (w.wave < c.start) return 0;
  let chance = Math.min(c.max, (w.wave - c.start + 1) * c.perWave);
  if (waveModOf(w.wave) === 5) chance = Math.min(0.8, chance * 3);
  return chance;
}

/** Maybe turn a freshly spawned enemy into an elite (draws from the world's random stream). */
export function rollElite(w: World, i: number): void {
  const chance = eliteChance(w);
  if (chance <= 0 || w.rng.float() >= chance) return;
  const mod = 1 + w.rng.int(6);
  w.eMod[i] = mod;
  if (mod === ELITE.Giant) w.eHp[i] = w.eHp[i]! * BALANCE.elites.giantHp;
  else if (mod === ELITE.Swift) w.eHp[i] = w.eHp[i]! * BALANCE.elites.swiftHp;
  else if (mod === ELITE.Armored) w.eHp[i] = w.eHp[i]! * 1.3;
}

export function enemySpeedMul(w: World, i: number): number {
  const c = BALANCE.elites;
  let m = 1;
  const mod = w.eMod[i]!;
  if (mod === ELITE.Swift) m = c.swiftSpeed;
  else if (mod === ELITE.Giant) m = c.giantSpeed;
  if (waveModOf(w.wave) === 3) m *= 1.25;
  return m;
}

export function enemyRadiusMul(w: World, i: number): number {
  return w.eMod[i] === ELITE.Giant ? BALANCE.elites.giantRadius : 1;
}

/** Damage an enemy actually takes after armour. */
export function enemyDamageMul(w: World, i: number): number {
  return w.eMod[i] === ELITE.Armored ? BALANCE.elites.armoredMul : 1;
}

// ---- explosive barrels ----

const BARREL_SPOTS: readonly (readonly [number, number])[] = [
  [-14, -9], [14, 9], [-14, 9], [14, -9], [0, -14], [0, 14], [-24, 0], [24, 0], [-7, 0], [7, 0], [-22, -14], [22, 14],
];

/** Stand the barrels of this arena up (positions are nudged out of the cover). */
export function placeBarrels(w: World): void {
  for (let b = 0; b < MAX_BARRELS; b++) {
    const spot = BARREL_SPOTS[b];
    if (!spot) {
      w.brActive[b] = 0;
      continue;
    }
    let x = spot[0];
    let y = spot[1];
    if (pushOut(x, y, 1.2)) {
      x = out.x;
      y = out.y;
    }
    w.brX[b] = Math.max(-ARENA_HALF_W + 1.5, Math.min(ARENA_HALF_W - 1.5, x));
    w.brY[b] = Math.max(-ARENA_HALF_H + 1.5, Math.min(ARENA_HALF_H - 1.5, y));
    w.brHp[b] = BALANCE.barrels.hp;
    w.brT[b] = 0;
    w.brActive[b] = 1;
  }
}

let barrelDepth = 0;

function explodeBarrel(w: World, b: number, owner: number): void {
  if (barrelDepth > 6) return;
  barrelDepth++;
  const c = BALANCE.barrels;
  const x = w.brX[b]!;
  const y = w.brY[b]!;
  w.brActive[b] = 0;
  w.brT[b] = c.respawn;
  w.events.push({ type: 'explosion', x, y, radius: c.radius });
  hooks.blast(w, owner, x, y, c.radius, c.damage);
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s] || w.pHp[s]! <= 0) continue;
    const dx = w.pX[s]! - x;
    const dy = w.pY[s]! - y;
    if (dx * dx + dy * dy <= c.radius * c.radius * 0.64) hooks.hurt(w, s, c.playerDamage, w.pX[s]!, w.pY[s]!);
  }
  barrelsBlast(w, x, y, c.radius, c.damage, owner);
  barrelDepth--;
}

/** Explosions set neighbouring barrels off (chain reactions). */
export function barrelsBlast(w: World, x: number, y: number, radius: number, damage: number, owner: number): void {
  for (let b = 0; b < MAX_BARRELS; b++) {
    if (!w.brActive[b]) continue;
    const dx = w.brX[b]! - x;
    const dy = w.brY[b]! - y;
    if (dx * dx + dy * dy > radius * radius) continue;
    w.brHp[b] = w.brHp[b]! - damage;
    if (w.brHp[b]! <= 0) explodeBarrel(w, b, owner);
  }
}

/** A bullet's step against the barrels; returns true when the bullet hit one (and is spent). */
export function bulletVsBarrels(w: World, bullet: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const r = BALANCE.barrels.hitRadius;
  const sx = x1 - x0;
  const sy = y1 - y0;
  const len2 = sx * sx + sy * sy;
  for (let b = 0; b < MAX_BARRELS; b++) {
    if (!w.brActive[b]) continue;
    const ex = w.brX[b]! - x0;
    const ey = w.brY[b]! - y0;
    let t = len2 > 1e-12 ? (ex * sx + ey * sy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ex - sx * t;
    const py = ey - sy * t;
    if (px * px + py * py > r * r) continue;
    w.brHp[b] = w.brHp[b]! - w.bDamage[bullet]!;
    w.bX[bullet] = x0 + sx * t;
    w.bY[bullet] = y0 + sy * t;
    if (w.brHp[b]! <= 0) explodeBarrel(w, b, w.bOwner[bullet]!);
    else w.events.push({ type: 'barrelHit', x: w.brX[b]!, y: w.brY[b]! });
    return true;
  }
  return false;
}

export function updateBarrels(w: World): void {
  for (let b = 0; b < MAX_BARRELS; b++) {
    if (w.brActive[b] || w.brT[b]! <= 0) continue;
    w.brT[b] = w.brT[b]! - TICK_DT;
    if (w.brT[b]! <= 0) {
      w.brActive[b] = 1;
      w.brHp[b] = BALANCE.barrels.hp;
    }
  }
}

// ---- power-ups ----

/** Wipe the screen: every enemy takes a huge hit (bosses only a slice of it). */
export function nuke(w: World, s: number): void {
  const c = BALANCE.pickups;
  w.events.push({ type: 'nuke', x: w.pX[s]!, y: w.pY[s]! });
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!w.eActive[i]) continue;
    const dx = w.eX[i]! - w.pX[s]!;
    const dy = w.eY[i]! - w.pY[s]!;
    const d = sqrt(dx * dx + dy * dy);
    hooks.damage(w, i, w.eBoss[i] ? c.nukeDamage * 0.2 : c.nukeDamage * 10, d > 1e-6 ? dx / d : 0, d > 1e-6 ? dy / d : 0, s);
  }
}
