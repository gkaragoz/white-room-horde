import {
  ARENA_HALF_H,
  ARENA_HALF_W,
  BALANCE,
  Buttons,
  MAX_BULLETS,
  MAX_PLAYERS,
  PlayerState,
  TICK_DT,
  WEAPON_IDS,
  type PlayerInput,
  type WeaponId,
} from '@wrh/shared';
import { clamp, cos, sin, sqrt, TAU } from './detmath';
import { bulletVsEnemies, setWave, spawnBoss, spawnEnemy, updateEnemies, updateGrenades, updateProjectiles } from './enemies';
import { out, pushOut, segmentBlocked, useMap } from './obstacles';
import { Crc32 } from './hash';
import { updatePickups } from './pickups';
import { updateCards } from './progression';
import { equipWeapon } from './loadout';
import { createWorld, type World } from './state';

export { createWorld, setWave, spawnBoss, spawnEnemy };
export type { World };

/** Aim is a 16-bit angle (see PlayerInput); this is the factor to radians. */
const AIM_TO_RAD = TAU / 65536;

export interface GameSetup {
  seed: number;
  /** Players present at the start: slot and starting weapon. */
  players: { slot: number; weapon: WeaponId }[];
  /** Arena layout index (MAPS) and difficulty 0 easy / 1 normal / 2 hard. */
  map?: number;
  difficulty?: number;
}

export function addPlayer(w: World, slot: number, x: number, y: number, weapon: WeaponId = 'pistol'): void {
  w.pActive[slot] = 1;
  w.pX[slot] = x;
  w.pY[slot] = y;
  w.pAngle[slot] = 0;
  w.pHp[slot] = BALANCE.player.hp + w.modHp;
  w.pMaxHp[slot] = BALANCE.player.hp + w.modHp;
  w.pState[slot] = PlayerState.Alive;
  w.pTimer[slot] = 0;
  w.pRevive[slot] = 0;
  equipWeapon(w, slot, WEAPON_IDS.indexOf(weapon));
  w.pMoving[slot] = 0;
  w.pIFrames[slot] = 0;
  w.pGren[slot] = BALANCE.grenade.max;
  w.pGrenCharge[slot] = 0;
  w.pGrenCd[slot] = 0;
  w.pDash[slot] = 0;
  w.pDashCd[slot] = 0;
  w.pModDmg[slot] = 1;
  w.pModSpeed[slot] = 1;
  w.pModRate[slot] = 1;
  w.pModPierce[slot] = 0;
  w.pModArmor[slot] = 1;
  w.pLifesteal[slot] = 0;
}

/** Deterministic game start used by every client and by replays: players spread on a ring around the centre. */
export function createGame(setup: GameSetup): World {
  const w = createWorld(setup.seed, setup.map ?? 0, setup.difficulty ?? 1);
  const n = setup.players.length;
  for (let i = 0; i < n; i++) {
    const p = setup.players[i]!;
    const a = (i / (n > 0 ? n : 1)) * TAU;
    addPlayer(w, p.slot, n > 1 ? cos(a) * 2 : 0, n > 1 ? sin(a) * 2 : 0, p.weapon);
  }
  return w;
}

/** A player joining a running game (late join): appears at the centre of the arena. */
export function joinPlayer(w: World, slot: number, weapon: WeaponId): void {
  addPlayer(w, slot, 0, 0, weapon);
  w.pIFrames[slot] = BALANCE.progression.revive.iFrames;
}

function spawnBullet(w: World, owner: number, x: number, y: number, angle: number, speed: number, range: number, damage: number, pierce: number): void {
  for (let i = 0; i < MAX_BULLETS; i++) {
    if (w.bActive[i]) continue;
    w.bActive[i] = 1;
    w.bX[i] = x;
    w.bY[i] = y;
    w.bVx[i] = cos(angle) * speed;
    w.bVy[i] = sin(angle) * speed;
    w.bLife[i] = range / speed;
    w.bDamage[i] = damage;
    w.bOwner[i] = owner;
    w.bPierce[i] = pierce;
    w.bHit.fill(-1, i * 4, i * 4 + 4);
    return;
  }
}

function movePlayer(w: World, s: number, inp: PlayerInput, speed: number, canDash: boolean): number {
  let mx = inp.moveX / 127;
  let my = inp.moveY / 127;
  const len = sqrt(mx * mx + my * my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  const angle = inp.aim * AIM_TO_RAD;
  const dc = BALANCE.dash;
  if (canDash) {
    if (w.pDashCd[s]! > 0) w.pDashCd[s] = w.pDashCd[s]! - TICK_DT;
    if ((inp.buttons & Buttons.Dash) !== 0 && w.pDashCd[s]! <= 0 && w.pDash[s]! === 0) {
      // dash along the move direction (or the aim when standing still)
      const l = len > 0.2 ? len : 1;
      w.pDashX[s] = len > 0.2 ? mx / l : cos(angle);
      w.pDashY[s] = len > 0.2 ? my / l : sin(angle);
      w.pDash[s] = Math.ceil(dc.seconds * 30);
      w.pDashCd[s] = dc.cooldown * w.modDash;
      if (w.pIFrames[s]! < dc.iFrames) w.pIFrames[s] = dc.iFrames;
      w.events.push({ type: 'dash', slot: s, x: w.pX[s]!, y: w.pY[s]! });
    }
  }
  if (w.pDash[s]! > 0) {
    // committed to the dash: move fast along its direction
    mx = w.pDashX[s]! * dc.speedMul;
    my = w.pDashY[s]! * dc.speedMul;
    w.pDash[s] = w.pDash[s]! - 1;
    w.pMoving[s] = 1;
  } else {
    w.pMoving[s] = len > 0.05 ? 1 : 0;
  }
  const r = BALANCE.player.radius;
  w.pX[s] = clamp(w.pX[s]! + mx * speed * TICK_DT, -ARENA_HALF_W + r, ARENA_HALF_W - r);
  w.pY[s] = clamp(w.pY[s]! + my * speed * TICK_DT, -ARENA_HALF_H + r, ARENA_HALF_H - r);
  if (pushOut(w.pX[s]!, w.pY[s]!, r)) {
    w.pX[s] = out.x;
    w.pY[s] = out.y;
  }
  w.pAngle[s] = angle;
  return angle;
}

function startReload(w: World, s: number, stats: { reload: number }): void {
  w.pReload[s] = stats.reload * w.modReload;
  w.events.push({ type: 'reloadStart', slot: s });
}

function fireWeapon(w: World, s: number, inp: PlayerInput, angle: number): void {
  const id = WEAPON_IDS[w.pWeapon[s]!]!;
  const stats = BALANCE.weapons[id];
  const infinite = stats.ammo < 0;
  w.pCooldown[s] = w.pCooldown[s]! - TICK_DT;
  // reloading: nothing fires until the timer runs out, then the magazine is refilled from the reserve
  if (w.pReload[s]! > 0) {
    w.pReload[s] = w.pReload[s]! - TICK_DT;
    if (w.pReload[s]! <= 0) {
      w.pReload[s] = 0;
      const need = stats.mag - w.pMag[s]!;
      const take = infinite ? need : need < w.pAmmo[s]! ? need : w.pAmmo[s]!;
      w.pMag[s] = w.pMag[s]! + take;
      if (!infinite) w.pAmmo[s] = w.pAmmo[s]! - take;
      w.events.push({ type: 'reloadDone', slot: s });
    }
    if (w.pCooldown[s]! < 0) w.pCooldown[s] = 0;
    return;
  }
  const canReload = w.pMag[s]! < stats.mag && (infinite || w.pAmmo[s]! > 0);
  if ((inp.buttons & Buttons.Reload) !== 0 && canReload) {
    startReload(w, s, stats);
    return;
  }
  let shots = 0;
  while ((inp.buttons & Buttons.Fire) !== 0 && w.pCooldown[s]! <= 0 && shots < 3 && w.pMag[s]! > 0) {
    for (let p = 0; p < stats.pellets; p++) {
      const a = angle + (w.rng.float() - 0.5) * 2 * stats.spread;
      // the shot leaves the muzzle: forward along the aim and a little to the right-hand side
      const ox = cos(angle) * stats.muzzleFwd + sin(angle) * stats.muzzleSide;
      const oy = sin(angle) * stats.muzzleFwd - cos(angle) * stats.muzzleSide;
      // a critical hit doubles the damage; the random draw only happens while somebody holds a crit card
      const crit = w.modCrit > 0 && w.rng.float() < w.modCrit ? 2 : 1;
      spawnBullet(w, s, w.pX[s]! + ox, w.pY[s]! + oy, a, stats.bulletSpeed, stats.range, stats.damage * w.modDamage * w.pModDmg[s]! * crit, stats.pierce + w.modPierce + w.pModPierce[s]!);
    }
    w.events.push({ type: 'shot', slot: s, weapon: w.pWeapon[s]!, x: w.pX[s]!, y: w.pY[s]!, angle });
    w.pMag[s] = w.pMag[s]! - 1;
    w.pCooldown[s] = w.pCooldown[s]! + 1 / (stats.rate * w.modRate * w.pModRate[s]!);
    shots++;
  }
  if (w.pCooldown[s]! < 0) w.pCooldown[s] = 0;
  // an empty magazine reloads by itself when the player keeps pulling the trigger
  if (w.pMag[s]! === 0 && canReloadNow(w, s, stats.ammo) && (inp.buttons & Buttons.Fire) !== 0) startReload(w, s, stats);
}

function canReloadNow(w: World, s: number, ammo: number): boolean {
  return ammo < 0 || w.pAmmo[s]! > 0;
}

/** Downed players crawl; a living teammate holding Revive nearby brings them back. */
function updateRevive(w: World, inputs: ReadonlyArray<PlayerInput | undefined>): void {
  const range2 = BALANCE.player.reviveRange * BALANCE.player.reviveRange;
  for (let d = 0; d < MAX_PLAYERS; d++) {
    if (!w.pActive[d] || w.pState[d] !== PlayerState.Downed) continue;
    let helped = false;
    for (let s = 0; s < MAX_PLAYERS && !helped; s++) {
      if (s === d || !w.pActive[s] || w.pState[s] !== PlayerState.Alive) continue;
      if (!((inputs[s]?.buttons ?? 0) & Buttons.Revive)) continue;
      const dx = w.pX[s]! - w.pX[d]!;
      const dy = w.pY[s]! - w.pY[d]!;
      if (dx * dx + dy * dy <= range2) helped = true;
    }
    if (helped) {
      w.pRevive[d] = w.pRevive[d]! + TICK_DT;
      if (w.pRevive[d]! >= BALANCE.player.reviveSeconds * w.modRevive) {
        w.pState[d] = PlayerState.Alive;
        w.pHp[d] = w.pMaxHp[d]! * BALANCE.progression.revive.hpFraction;
        w.pRevive[d] = 0;
        w.pTimer[d] = 0;
        w.pIFrames[d] = BALANCE.progression.revive.iFrames;
        w.events.push({ type: 'playerRevive', slot: d });
      }
    } else {
      w.pRevive[d] = 0;
      w.pTimer[d] = w.pTimer[d]! - TICK_DT;
      if (w.pTimer[d]! <= 0) {
        w.pState[d] = PlayerState.Dead;
        w.events.push({ type: 'playerDead', slot: d });
      }
    }
  }
}

/**
 * Advance the world by one tick. `inputs[slot]` is the confirmed input for that slot (undefined = no input).
 * The order of the systems is fixed (docs/DESIGN.md section 15): inputs, player movement, weapons, enemies, bullets.
 */
export function step(w: World, inputs: ReadonlyArray<PlayerInput | undefined>): void {
  w.events.length = 0;
  useMap(w.map);
  if (w.gameOver) {
    w.tick++;
    return;
  }
  for (let s = 0; s < MAX_PLAYERS; s++) if (w.pActive[s] && w.pIFrames[s]! > 0) w.pIFrames[s] = w.pIFrames[s]! - TICK_DT;
  updateCards(w, inputs);
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s] || w.pState[s] === PlayerState.Dead) continue;
    const inp = inputs[s];
    if (!inp) {
      w.pMoving[s] = 0;
      continue;
    }
    if (w.pState[s] === PlayerState.Downed) {
      movePlayer(w, s, inp, BALANCE.player.crawlSpeed, false);
      continue;
    }
    const angle = movePlayer(w, s, inp, BALANCE.player.speed * w.modSpeed * w.pModSpeed[s]!, true);
    fireWeapon(w, s, inp, angle);
  }
  updateRevive(w, inputs);
  updateGrenades(w, inputs);

  updateEnemies(w);
  updateProjectiles(w);
  updatePickups(w);

  // bullets
  for (let i = 0; i < MAX_BULLETS; i++) {
    if (!w.bActive[i]) continue;
    const x0 = w.bX[i]!;
    const y0 = w.bY[i]!;
    w.bX[i] = x0 + w.bVx[i]! * TICK_DT;
    w.bY[i] = y0 + w.bVy[i]! * TICK_DT;
    w.bLife[i] = w.bLife[i]! - TICK_DT;
    let spent = segmentBlocked(x0, y0, w.bX[i]!, w.bY[i]!);
    if (!spent && w.enemyCount > 0) spent = bulletVsEnemies(w, i, x0, y0, w.bX[i]!, w.bY[i]!);
    const x = w.bX[i]!;
    const y = w.bY[i]!;
    if (spent || w.bLife[i]! <= 0 || x < -ARENA_HALF_W || x > ARENA_HALF_W || y < -ARENA_HALF_H || y > ARENA_HALF_H) {
      w.bActive[i] = 0;
      w.events.push({ type: 'bulletGone', x, y });
    }
  }

  // life cycle: zero hp means downed; nobody left standing ends the run
  let standing = 0;
  let any = false;
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s]) continue;
    any = true;
    if (w.pState[s] === PlayerState.Alive) {
      if (w.pHp[s]! <= 0) {
        w.pState[s] = PlayerState.Downed;
        w.pTimer[s] = BALANCE.player.downedSeconds;
        w.pRevive[s] = 0;
        w.events.push({ type: 'playerDown', slot: s, x: w.pX[s]!, y: w.pY[s]! });
      } else standing++;
    }
  }
  if (any && standing === 0) {
    w.gameOver = 1;
    w.events.push({ type: 'gameOver', wave: w.wave, kills: w.kills });
  }
  w.tick++;
}

/** CRC32 of every simulated field in a fixed order (used for desync detection, section 8). */
export function hashWorld(w: World): number {
  const c = new Crc32();
  c.u32(w.tick);
  for (const v of w.rng.getState()) c.u32(v);
  c.u32(w.difficulty).u32(w.map).u32(w.wave).u32(w.waveTick).u32(w.kills).u32(w.enemyCount).u32(w.gameOver).u32(w.xp).u32(w.level).u32(w.pendingLevels).u32(w.cardTimer);
  c.typed(w.cardOffer);
  c.typed(new Float64Array([w.modDamage, w.modRate, w.modSpeed, w.modPierce, w.modHp, w.modRevive, w.modMagnet, w.modLoot, w.modXp, w.modBlast, w.modReload, w.modDash, w.modArmor, w.modCrit]));
  c.typed(w.pModRate).typed(w.pModPierce).typed(w.pModArmor).typed(w.pLifesteal);
  c.typed(w.pActive).typed(w.pX).typed(w.pY).typed(w.pAngle).typed(w.pHp).typed(w.pMaxHp).typed(w.pState).typed(w.pTimer).typed(w.pRevive);
  c.typed(w.pGren).typed(w.pGrenCharge).typed(w.pGrenCd);
  c.typed(w.pMag).typed(w.pReload).typed(w.pDash).typed(w.pDashCd).typed(w.pDashX).typed(w.pDashY).typed(w.pModDmg).typed(w.pModSpeed);
  c.typed(w.gActive).typed(w.gX).typed(w.gY).typed(w.gVx).typed(w.gVy).typed(w.gFuse).typed(w.gOwner);
  c.typed(w.kActive).typed(w.kData).typed(w.kType).typed(w.kX).typed(w.kY).typed(w.kLife);
  c.typed(w.sActive).typed(w.sX).typed(w.sY).typed(w.sVx).typed(w.sVy).typed(w.sLife);
  c.typed(w.pCooldown).typed(w.pIFrames).typed(w.pWeapon).typed(w.pAmmo);
  c.typed(w.eActive).typed(w.eType).typed(w.eBoss).typed(w.eAux).typed(w.eState).typed(w.eStateTick).typed(w.eX).typed(w.eY).typed(w.eAngle).typed(w.eHp).typed(w.eCooldown);
  c.typed(w.bActive).typed(w.bX).typed(w.bY).typed(w.bVx).typed(w.bVy).typed(w.bLife).typed(w.bDamage).typed(w.bOwner).typed(w.bPierce).typed(w.bHit);
  return c.digest();
}
