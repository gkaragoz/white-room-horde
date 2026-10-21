import {
  PERK,
  CARD_IDS,
  FloorPhase,
  MISC,
  ARENA_HALF_H,
  ARENA_HALF_W,
  BALANCE,
  Buttons,
  MAX_BULLETS,
  MAX_PLAYERS,
  PlayerState,
  STAT,
  STATS,
  WEAPON_SLOTS,
  TICK_DT,
  TICK_RATE,
  WEAPON_IDS,
  type PlayerInput,
  type WeaponId,
} from '@wrh/shared';
import { atan2, clamp, cos, sin, sqrt, TAU } from './detmath';
import { blastFrom, bulletVsEnemies, rebuildGrid, setWave, settleLayers, spawnBoss, spawnEnemy, updateEnemies, updateGrenades, updateProjectiles } from './enemies';
import { currentMap, out, pushOut, segmentBlocked, useMap } from './obstacles';
import { deckWalkable, nextLayer, rampAt, rampDir, rampGrade } from '@wrh/shared';
import { Crc32 } from './hash';
import { addStat } from './stats';
import { updatePickups } from './pickups';
import { KNOCK_DECAY, updateHazards } from './hazards';
import { chargeStep, charging, meleeAttack, updateAbilities } from './abilities';
import { updateCards } from './progression';
import { droneReviveHelp, resetDrones, updateDrones } from './drones';
import { equipLoadout, selectWeapon } from './loadout';
import { abilityRate, abilityRateFrom, applyClass, bulletVsBarrels, damageMul, droneCredit, hooks, perk, placeBarrels, resetPerks, setPerk, speedMul, speedMulFrom, updateBarrels, updatePlayerPerks } from './features';
import { createWorld, type World } from './state';
import { fxOf } from './mods';

export { createWorld, setWave, spawnBoss, spawnEnemy };

/** Is the straight line between two points free of cover on the world's map? (The client's auto-aim uses it.) */
export function lineClear(w: World, x0: number, y0: number, x1: number, y1: number, layer = 0): boolean {
  useMap(w.map);
  return !segmentBlocked(x0, y0, x1, y1, layer);
}
export type { World };

/** Aim is a 16-bit angle (see PlayerInput); this is the factor to radians. */
const AIM_TO_RAD = TAU / 65536;

export interface GameSetup {
  seed: number;
  /** Players present at the start: slot and starting weapon. */
  players: { slot: number; weapon: WeaponId; cls?: number }[];
  /** Arena layout index (MAPS) and the chosen difficulty multipliers (a bit mask over MODS, 0 = none). */
  map?: number;
  mods?: number;
}

export function addPlayer(w: World, slot: number, x: number, y: number, weapon: WeaponId = 'pistol', cls = 0): void {
  w.pActive[slot] = 1;
  w.pX[slot] = x;
  w.pY[slot] = y;
  w.pAngle[slot] = 0;
  w.pHp[slot] = BALANCE.player.hp;
  w.pMaxHp[slot] = BALANCE.player.hp;
  w.pState[slot] = PlayerState.Alive;
  w.pTimer[slot] = 0;
  w.pRevive[slot] = 0;
  // the blade and the hammer classes fight with their own weapon and use no guns
  const meleeWeapon = cls === 7 ? 'sword' : cls === 8 ? 'hammer' : null;
  equipLoadout(w, slot, WEAPON_IDS.indexOf(meleeWeapon ?? weapon), meleeWeapon !== null);
  w.pMoving[slot] = 0;
  w.pIFrames[slot] = 0;
  w.pAway[slot] = 0;
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
  // a fresh character: level 1, no xp, nothing on offer, no card upgrades
  w.pXp[slot] = 0;
  w.pLevel[slot] = 1;
  w.pPending[slot] = 0;
  w.pCardTimer[slot] = 0;
  w.pCardLock[slot] = 0;
  w.pCardPrev[slot] = 0;
  w.pStun[slot] = 0;
  w.pKnockX[slot] = 0;
  w.pKnockY[slot] = 0;
  w.pAir[slot] = 0;
  w.pLayer[slot] = 0;
  w.pSpecCd[slot] = 0;
  w.pSpecT[slot] = 0;
  w.pRally[slot] = 0;
  w.pCharge[slot] = 0;
  for (let k = 0; k < STATS; k++) w.pStat[slot * STATS + k] = 0;
  for (let k = 0; k < WEAPON_SLOTS; k++) {
    w.pWpnTime[slot * WEAPON_SLOTS + k] = 0;
    w.pWpnKills[slot * WEAPON_SLOTS + k] = 0;
  }
  w.pOver[slot] = 0;
  for (let i = 0; i < 3; i++) w.pOffer[slot * 3 + i] = -1;
  w.pCards.fill(0, slot * CARD_IDS.length, (slot + 1) * CARD_IDS.length);
  w.modDamage[slot] = w.modRate[slot] = w.modSpeed[slot] = w.modRevive[slot] = w.modMagnet[slot] = w.modXp[slot] = 1;
  w.modBlast[slot] = w.modReload[slot] = w.modDash[slot] = w.modArmor[slot] = 1;
  w.modPierce[slot] = w.modCrit[slot] = 0;
  w.modAbCd[slot] = w.modAbDur[slot] = w.modAbDmg[slot] = w.modAbRad[slot] = 1;
  w.modAbExtra[slot] = 0;
  resetPerks(w, slot);
  resetDrones(w, slot);
  applyClass(w, slot, cls);
}

/** Deterministic game start used by every client and by replays: players spread on a ring around the centre. */
export function createGame(setup: GameSetup): World {
  const w = createWorld(setup.seed, setup.map ?? 0, setup.mods ?? 0);
  const n = setup.players.length;
  for (let i = 0; i < n; i++) {
    const p = setup.players[i]!;
    const a = (i / (n > 0 ? n : 1)) * TAU;
    addPlayer(w, p.slot, n > 1 ? cos(a) * 2 : 0, n > 1 ? sin(a) * 2 : 0, p.weapon, p.cls ?? 0);
  }
  useMap(w.map);
  placeBarrels(w);
  return w;
}

/** A player joining a running game (late join): appears at the centre of the arena. */
export function joinPlayer(w: World, slot: number, weapon: WeaponId, cls = 0): void {
  addPlayer(w, slot, 0, 0, weapon, cls);
  w.pIFrames[slot] = BALANCE.progression.revive.iFrames;
}

/** A round ends: it disappears, and an explosive one bursts where it stopped. */
function endBullet(w: World, i: number, x: number, y: number, reason: number): void {
  w.bActive[i] = 0;
  const owner = w.bOwner[i]!;
  const out = x < -ARENA_HALF_W || x > ARENA_HALF_W || y < -ARENA_HALF_H || y > ARENA_HALF_H;
  if (w.bSrc[i]! > 0) {
    // a drone's round: only the rocket (type 3) bursts, with the radius and damage it carries
    if (w.bSrc[i] === 3 && !out) {
      w.events.push({ type: 'explosion', x, y, radius: w.bBlastR[i]! });
      droneCredit.slot = owner;
      blastFrom(w, owner, x, y, w.bBlastR[i]!, w.bBlastD[i]!);
      droneCredit.slot = -1;
    } else {
      w.events.push({ type: 'bulletGone', x, y, angle: atan2(w.bVy[i]!, w.bVx[i]!), reason });
    }
    return;
  }
  const st = BALANCE.weapons[WEAPON_IDS[w.pWeapon[owner]!]!];
  if (st.blast !== undefined && !out) {
    // explosive round: bursts where it ends (wall, enemy or end of its range)
    w.events.push({ type: 'explosion', x, y, radius: st.blast * w.modBlast[owner]! });
    blastFrom(w, owner, x, y, st.blast * w.modBlast[owner]!, (st.blastDamage ?? 0) * w.modBlast[owner]! * w.modDamage[owner]! * w.pModDmg[owner]!);
  } else {
    w.events.push({ type: 'bulletGone', x, y, angle: atan2(w.bVy[i]!, w.bVx[i]!), reason });
  }
}

/**
 * Launch a round from the muzzle. The stretch from the shooter to the muzzle's distance ahead (along the aim) is swept first,
 * so a wall right in front of the player stops the shot and enemies standing closer than the muzzle can still be hit.
 */
function spawnBullet(w: World, owner: number, ox: number, oy: number, sx: number, sy: number, x: number, y: number, angle: number, speed: number, range: number, damage: number, pierce: number, src = 0, blastR = 0, blastD = 0): void {
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
    w.bSrc[i] = src;
    w.bBlastR[i] = blastR;
    w.bBlastD[i] = blastD;
    w.bHit.fill(-1, i * 4, i * 4 + 4);
    w.bLayer[i] = owner >= 0 ? w.pLayer[owner]! : 0;
    // the stretch swept first runs along the aim from the shooter to the muzzle's distance ahead (not to the muzzle itself, which
    // sits to the side): a wall in front stops the shot, a wall beside the barrel does not eat it
    if (segmentBlocked(ox, oy, sx, sy, w.bLayer[i]!)) {
      endBullet(w, i, ox, oy, 1);
    } else if (bulletVsBarrels(w, i, ox, oy, sx, sy)) {
      endBullet(w, i, w.bX[i]!, w.bY[i]!, 2);
    } else if (w.enemyCount > 0 && bulletVsEnemies(w, i, ox, oy, sx, sy)) {
      endBullet(w, i, w.bX[i]!, w.bY[i]!, 2);
    }
    return;
  }
}

hooks.bullet = spawnBullet;

/** Speed factor on a ramp: 1 elsewhere; climbing slows by the grade (30 degrees about 16%, 45 degrees 28%), going down speeds up a little. */
function slopeFactor(map: ReturnType<typeof currentMap>, x: number, y: number, mx: number, my: number): number {
  const ri = rampAt(map, x, y);
  if (ri < 0) return 1;
  const r = map.ramps![ri]!;
  const d = rampDir(r);
  const f = 1 - 0.28 * rampGrade(r) * (mx * d[0] + my * d[1]);
  return f < 0.55 ? 0.55 : f > 1.25 ? 1.25 : f;
}

function movePlayer(w: World, s: number, inp: PlayerInput, speed: number, canDashIn: boolean): number {
  let canDash = canDashIn;
  let mx = inp.moveX / 127;
  let my = inp.moveY / 127;
  const len = sqrt(mx * mx + my * my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  const angle = inp.aim * AIM_TO_RAD;
  const dc = BALANCE.dash;
  // stunned (thrown, slammed): no steering, no dash, no shooting until it wears off
  const stunned = w.pStun[s]! > 0;
  if (stunned) {
    w.pStun[s] = w.pStun[s]! - 1;
    mx = 0;
    my = 0;
    canDash = false;
  }
  if (w.pAir[s]! > 0) w.pAir[s] = w.pAir[s]! - 1;
  if (canDash) {
    if (w.pDashCd[s]! > 0) w.pDashCd[s] = w.pDashCd[s]! - TICK_DT;
    if ((inp.buttons & Buttons.Dash) !== 0 && w.pDashCd[s]! <= 0 && w.pDash[s]! === 0) {
      // dash along the move direction (or the aim when standing still)
      const l = len > 0.2 ? len : 1;
      w.pDashX[s] = len > 0.2 ? mx / l : cos(angle);
      w.pDashY[s] = len > 0.2 ? my / l : sin(angle);
      w.pDash[s] = Math.ceil(dc.seconds * 30);
      w.pDashCd[s] = (dc.cooldown * w.modDash[s]!) / perk(w, s, PERK.DashRate);
      addStat(w, s, STAT.Dashes, 1);
      if (perk(w, s, PERK.Shock) > 0) {
        // shock card: the dash sends out a shockwave that hurts and shoves what is around
        w.events.push({ type: 'explosion', x: w.pX[s]!, y: w.pY[s]!, radius: BALANCE.perks.shockRadius * 0.6 });
        blastFrom(w, s, w.pX[s]!, w.pY[s]!, BALANCE.perks.shockRadius, BALANCE.perks.shockDamage);
      }
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
    w.pMoving[s] = !stunned && len > 0.05 ? 1 : 0;
  }
  const r = BALANCE.player.radius;
  const layer = w.pLayer[s]!;
  const map = currentMap();
  const oldX = w.pX[s]!;
  const oldY = w.pY[s]!;
  // ramps: uphill is slower (the steeper the slower), downhill a little faster
  if (map.ramps) speed *= slopeFactor(map, oldX, oldY, mx, my);
  w.pX[s] = clamp(w.pX[s]! + (mx * speed + w.pKnockX[s]!) * TICK_DT, -ARENA_HALF_W + r, ARENA_HALF_W - r);
  w.pY[s] = clamp(w.pY[s]! + (my * speed + w.pKnockY[s]!) * TICK_DT, -ARENA_HALF_H + r, ARENA_HALF_H - r);
  w.pKnockX[s] = Math.abs(w.pKnockX[s]!) < 0.05 ? 0 : w.pKnockX[s]! * KNOCK_DECAY;
  w.pKnockY[s] = Math.abs(w.pKnockY[s]!) < 0.05 ? 0 : w.pKnockY[s]! * KNOCK_DECAY;
  if (pushOut(w.pX[s]!, w.pY[s]!, r, layer)) {
    w.pX[s] = out.x;
    w.pY[s] = out.y;
  }
  if (map.decks) {
    // a deck has no edge to fall off: where there is no deck or ramp the character stays where it was
    if (layer === 1 && !deckWalkable(map, w.pX[s]!, w.pY[s]!)) {
      w.pX[s] = oldX;
      w.pY[s] = oldY;
    }
    w.pLayer[s] = nextLayer(map, w.pX[s]!, w.pY[s]!, layer);
  }
  addStat(w, s, STAT.Distance, sqrt((w.pX[s]! - oldX) * (w.pX[s]! - oldX) + (w.pY[s]! - oldY) * (w.pY[s]! - oldY)));
  w.pAngle[s] = angle;
  return angle;
}

/** Where a player will be after the given (not yet simulated) inputs: the client's prediction of its own character. */
export interface Predicted {
  x: number;
  y: number;
  /** The position one input earlier, for drawing between two predicted ticks. */
  prevX: number;
  prevY: number;
  angle: number;
  moving: boolean;
}

const predicted: Predicted = { x: 0, y: 0, prevX: 0, prevY: 0, angle: 0, moving: false };

/**
 * Replays `inputs` (one per upcoming tick) for the local character on top of the confirmed state, with exactly the movement
 * rules of `movePlayer` (steering, dash, arena edge, cover) but without touching the world. Enemies and other players do
 * not push a player around, so for a character that is up and not being shoved this equals what the simulation will do.
 * The returned object is reused between calls.
 */
export function predictPlayer(w: World, s: number, inputs: ReadonlyArray<PlayerInput>): Predicted {
  useMap(w.map);
  let x = w.pX[s]!;
  let y = w.pY[s]!;
  let dash = w.pDash[s]!;
  let dashCd = w.pDashCd[s]!;
  let dashX = w.pDashX[s]!;
  let dashY = w.pDashY[s]!;
  let angle = w.pAngle[s]!;
  let moving = w.pMoving[s]! === 1;
  let stun = w.pStun[s]!;
  let kx = w.pKnockX[s]!;
  let ky = w.pKnockY[s]!;
  let layer = w.pLayer[s]!;
  const map = currentMap();
  const alive = w.pState[s] === PlayerState.Alive;
  const downed = w.pState[s] === PlayerState.Downed;
  const dc = BALANCE.dash;
  const r = BALANCE.player.radius;
  const speedBase = BALANCE.player.speed * w.modSpeed[s]! * w.pModSpeed[s]!;
  // what runs down while the inputs are replayed: the buffs that change the speed, and the hammer's charge
  let rally = w.pRally[s]!;
  let specT = w.pSpecT[s]!;
  let specCd = w.pSpecCd[s]!;
  const cls = perk(w, s, PERK.Class);
  const AB = BALANCE.abilities;
  let haste = perk(w, s, PERK.Haste);
  let adren = perk(w, s, PERK.Adren);
  const wst = BALANCE.weapons[WEAPON_IDS[w.pWeapon[s]!]!]!;
  const chargeMax = wst.melee ? wst.melee.charge : 0;
  let charge = w.pCharge[s]!;
  let cooldown = w.pCooldown[s]!;
  const rateBase = wst.rate * w.modRate[s]! * w.pModRate[s]!;
  const dashFull = (dc.cooldown * w.modDash[s]!) / perk(w, s, PERK.DashRate);
  const busyNear = alive && downedNear(w, s);
  let prevX = x;
  let prevY = y;
  // while the squad is lifted to the next floor the simulation ignores steering and buttons
  const phase = w.misc[MISC.Phase]!;
  const phaseEnd = w.misc[MISC.PhaseEnd]!;
  const ascendTicks = Math.round(BALANCE.floors.ascendSeconds * TICK_RATE);
  const cineEnd = w.misc[MISC.Cine]!;
  let t = w.tick;
  for (const inpIn of inputs) {
    const locked = (phase === FloorPhase.Ascend && t <= phaseEnd) || (phase === FloorPhase.Cleared && t > phaseEnd && t <= phaseEnd + ascendTicks) || t < cineEnd;
    t++;
    const inp = locked ? { moveX: 0, moveY: 0, aim: inpIn.aim, buttons: 0 } : inpIn;
    prevX = x;
    prevY = y;
    let mx = inp.moveX / 127;
    let my = inp.moveY / 127;
    const len = sqrt(mx * mx + my * my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    angle = inp.aim * AIM_TO_RAD;
    const busy = busyNear && (inp.buttons & Buttons.Revive) !== 0;
    const stunned = stun > 0;
    if (stunned) {
      stun--;
      mx = 0;
      my = 0;
    }
    const canDash = alive && !busy && !stunned;
    if (canDash) {
      if (dashCd > 0) dashCd -= TICK_DT;
      if ((inp.buttons & Buttons.Dash) !== 0 && dashCd <= 0 && dash === 0) {
        const l = len > 0.2 ? len : 1;
        dashX = len > 0.2 ? mx / l : cos(angle);
        dashY = len > 0.2 ? my / l : sin(angle);
        dash = Math.ceil(dc.seconds * 30);
        dashCd = dashFull;
      }
    }
    if (dash > 0) {
      mx = dashX * dc.speedMul;
      my = dashY * dc.speedMul;
      dash--;
      moving = true;
    } else {
      moving = !stunned && len > 0.05;
    }
    const speed = downed || !alive ? BALANCE.player.crawlSpeed : speedBase * speedMulFrom(w, s, rally, specT, haste, adren) * (busy ? BALANCE.player.reviveMoveMul : 1) * (charge > 0 ? 0.45 : 1);
    const oldX = x;
    const oldY = y;
    const sp2 = map.ramps ? speed * slopeFactor(map, x, y, mx, my) : speed;
    x = clamp(x + (mx * sp2 + kx) * TICK_DT, -ARENA_HALF_W + r, ARENA_HALF_W - r);
    y = clamp(y + (my * sp2 + ky) * TICK_DT, -ARENA_HALF_H + r, ARENA_HALF_H - r);
    kx = Math.abs(kx) < 0.05 ? 0 : kx * KNOCK_DECAY;
    ky = Math.abs(ky) < 0.05 ? 0 : ky * KNOCK_DECAY;
    if (pushOut(x, y, r, layer)) {
      x = out.x;
      y = out.y;
    }
    if (map.decks) {
      if (layer === 1 && !deckWalkable(map, x, y)) {
        x = oldX;
        y = oldY;
      }
      layer = nextLayer(map, x, y, layer);
    }
    // after the move, as in step: a charged swing builds up or is released, then the buffs run down a tick
    if (alive && !busy && stun === 0 && chargeMax > 0) {
      charging.charge = charge;
      charging.cooldown = cooldown;
      chargeStep((inp.buttons & Buttons.Fire) !== 0, chargeMax, 1 / (rateBase * abilityRateFrom(rally)));
      charge = charging.charge;
      cooldown = charging.cooldown;
    }
    if (specCd > 0) specCd = specCd - TICK_DT > 0 ? specCd - TICK_DT : 0;
    if (rally > 0) rally = rally - TICK_DT > 0 ? rally - TICK_DT : 0;
    if (alive) {
      if (specT > 0) specT = specT - TICK_DT > 0 ? specT - TICK_DT : 0;
      // the ability button: the ones that change the pace (the rest do not matter for where the character stands)
      if ((inp.buttons & Buttons.Special) !== 0 && specCd <= 0 && stun === 0) {
        if (cls === 0) rally = AB.soldier!.seconds!;
        else if (cls === 2) specT = AB.heavy!.seconds!;
        else if (cls === 3) {
          specT = AB.scout!.seconds!;
          dashCd = 0;
        } else if (cls === 6) specT = AB.berserker!.seconds!;
        else if (cls === 7) specT = AB.swordsman!.seconds!;
        if (cls <= 8) specCd = AB[['soldier', 'medic', 'heavy', 'scout', 'demolisher', 'ranger', 'berserker', 'swordsman', 'hammerer'][cls]!]!.cd! * w.modAbCd[s]!;
      }
      if (haste > 0) haste = haste - TICK_DT > 0 ? haste - TICK_DT : 0;
      if (adren > 0) adren = adren - TICK_DT > 0 ? adren - TICK_DT : 0;
    }
  }
  predicted.x = x;
  predicted.y = y;
  predicted.prevX = prevX;
  predicted.prevY = prevY;
  predicted.angle = angle;
  predicted.moving = moving;
  return predicted;
}

function startReload(w: World, s: number, stats: { reload: number }): void {
  w.pReload[s] = stats.reload * w.modReload[s]!;
  w.events.push({ type: 'reloadStart', slot: s });
}

function fireWeapon(w: World, s: number, inp: PlayerInput, angle: number): void {
  const id = WEAPON_IDS[w.pWeapon[s]!]!;
  const stats = BALANCE.weapons[id];
  if (stats.melee) {
    meleeAttack(w, s, inp, angle, stats);
    return;
  }
  w.pCooldown[s] = w.pCooldown[s]! - TICK_DT;
  // reloading: nothing fires until the timer runs out, then the magazine is full again (ammo is unlimited)
  if (w.pReload[s]! > 0) {
    w.pReload[s] = w.pReload[s]! - TICK_DT;
    if (w.pReload[s]! <= 0) {
      w.pReload[s] = 0;
      w.pMag[s] = stats.mag;
      w.events.push({ type: 'reloadDone', slot: s });
    }
    if (w.pCooldown[s]! < 0) w.pCooldown[s] = 0;
    return;
  }
  const canReload = w.pMag[s]! < stats.mag;
  if ((inp.buttons & Buttons.Reload) !== 0 && canReload) {
    startReload(w, s, stats);
    return;
  }
  let shots = 0;
  while ((inp.buttons & Buttons.Fire) !== 0 && w.pCooldown[s]! <= 0 && shots < 3 && w.pMag[s]! > 0) {
    if (w.enemyCount > 0) rebuildGrid(w);
    for (let p = 0; p < stats.pellets; p++) {
      const a = angle + (w.rng.float() - 0.5) * 2 * stats.spread;
      // the shot leaves the muzzle: forward along the aim and a little to the right-hand side
      const ox = cos(angle) * stats.muzzleFwd + sin(angle) * stats.muzzleSide;
      const oy = sin(angle) * stats.muzzleFwd - cos(angle) * stats.muzzleSide;
      // a critical hit doubles the damage; the random draw only happens while somebody holds a crit card
      const crit = w.modCrit[s]! > 0 && w.rng.float() < w.modCrit[s]! ? 2 : 1;
      if (crit === 2) addStat(w, s, STAT.Crits, 1);
      spawnBullet(w, s, w.pX[s]!, w.pY[s]!, w.pX[s]! + cos(angle) * stats.muzzleFwd, w.pY[s]! + sin(angle) * stats.muzzleFwd, w.pX[s]! + ox, w.pY[s]! + oy, a, stats.bulletSpeed, stats.range, stats.damage * w.modDamage[s]! * w.pModDmg[s]! * damageMul(w, s) * crit, stats.blast !== undefined ? 0 : stats.pierce + w.modPierce[s]! + w.pModPierce[s]! + (w.pOver[s]! > 0 ? BALANCE.abilities.ranger!.pierce! : 0));
    }
    addStat(w, s, STAT.Shots, 1);
    w.events.push({ type: 'shot', slot: s, weapon: w.pWeapon[s]!, x: w.pX[s]!, y: w.pY[s]!, angle });
    w.pMag[s] = w.pMag[s]! - 1;
    w.pCooldown[s] = w.pCooldown[s]! + 1 / (stats.rate * w.modRate[s]! * w.pModRate[s]! * abilityRate(w, s));
    if (w.pOver[s]! > 0) w.pOver[s] = w.pOver[s]! - 1;
    shots++;
  }
  if (w.pCooldown[s]! < 0) w.pCooldown[s] = 0;
  // an empty magazine reloads by itself when the player keeps pulling the trigger
  if (w.pMag[s]! === 0 && (inp.buttons & Buttons.Fire) !== 0) startReload(w, s, stats);
}

/** Is a downed teammate within reviving range of player `s`? */
function downedNear(w: World, s: number): boolean {
  const range2 = BALANCE.player.reviveRange * BALANCE.player.reviveRange;
  for (let d = 0; d < MAX_PLAYERS; d++) {
    if (d === s || !w.pActive[d] || w.pState[d] !== PlayerState.Downed) continue;
    const dx = w.pX[s]! - w.pX[d]!;
    const dy = w.pY[s]! - w.pY[d]!;
    if (dx * dx + dy * dy <= range2) return true;
  }
  return false;
}

/** Is this player away and still inside the protected minute (untouchable, no bleeding out)? */
export function awayProtected(w: World, s: number): boolean {
  return w.pAway[s]! > 0 && w.pAway[s]! <= BALANCE.player.awayProtectSeconds * TICK_RATE;
}

/**
 * A player whose page is gone (no input in the bundle) or silent (the relay's Away flag) is protected for `awayProtectSeconds`: a lost
 * connection or a dead tab is not a death sentence. Real input resets the clock; after the minute the game is as hard as ever.
 * Counted on the inputs as they came (the lift between floors blanks the buttons, and the flag with them).
 */
function updateAway(w: World, inputs: ReadonlyArray<PlayerInput | undefined>): void {
  const limit = BALANCE.player.awayProtectSeconds * TICK_RATE;
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s]) continue;
    const inp = inputs[s];
    const away = !inp || (inp.buttons & Buttons.Away) !== 0;
    if (!away) {
      w.pAway[s] = 0;
      continue;
    }
    if (w.pAway[s]! <= limit) w.pAway[s] = w.pAway[s]! + 1;
    if (w.pAway[s]! <= limit && w.pState[s] === PlayerState.Alive && w.pIFrames[s]! < 0.2) w.pIFrames[s] = 0.2;
  }
}

/** Downed players crawl; a living teammate holding Revive nearby brings them back. */
function updateRevive(w: World, inputs: ReadonlyArray<PlayerInput | undefined>): void {
  const range2 = BALANCE.player.reviveRange * BALANCE.player.reviveRange;
  for (let d = 0; d < MAX_PLAYERS; d++) {
    if (!w.pActive[d] || w.pState[d] !== PlayerState.Downed) continue;
    let helped = false;
    let helper = -1;
    let reviveMul = 1;
    let rate = 1;
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (s === d || !w.pActive[s] || w.pState[s] !== PlayerState.Alive) continue;
      if (!((inputs[s]?.buttons ?? 0) & Buttons.Revive)) continue;
      const dx = w.pX[s]! - w.pX[d]!;
      const dy = w.pY[s]! - w.pY[d]!;
      if (dx * dx + dy * dy <= range2) {
        if (!helped || perk(w, s, PERK.ReviveRate) > rate) rate = perk(w, s, PERK.ReviveRate);
        if (!helped || w.modRevive[s]! < reviveMul) reviveMul = w.modRevive[s]!;
        if (helper < 0) helper = s;
        helped = true;
      }
    }
    // a healer drone's beam brings a downed player back without a hand on the key
    if (!helped) {
      const dh = droneReviveHelp(w, d);
      if (dh.rate > 0) {
        helped = true;
        helper = dh.helper;
        rate = dh.rate;
      }
    }
    if (helped) {
      w.pRevive[d] = w.pRevive[d]! + TICK_DT * rate;
      if (w.pRevive[d]! >= BALANCE.player.reviveSeconds * reviveMul) {
        w.pState[d] = PlayerState.Alive;
        w.pHp[d] = w.pMaxHp[d]! * BALANCE.progression.revive.hpFraction;
        w.pRevive[d] = 0;
        w.pTimer[d] = 0;
        w.pIFrames[d] = BALANCE.progression.revive.iFrames;
        addStat(w, helper, STAT.Revives, 1);
        w.events.push({ type: 'playerRevive', slot: d });
      }
    } else {
      // interrupted (let go of the key or moved away): the progress drains, so a short slip does not cost everything
      w.pRevive[d] = Math.max(0, w.pRevive[d]! - TICK_DT * BALANCE.player.reviveDrain);
      if (!awayProtected(w, d)) w.pTimer[d] = w.pTimer[d]! - TICK_DT; // an away player does not bleed out inside the protected minute
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
export function step(w: World, inputsIn: ReadonlyArray<PlayerInput | undefined>): void {
  let inputs = inputsIn;
  w.events.length = 0;
  useMap(w.map);
  if (w.gameOver) {
    w.tick++;
    return;
  }
  for (let s = 0; s < MAX_PLAYERS; s++) if (w.pActive[s] && w.pIFrames[s]! > 0) w.pIFrames[s] = w.pIFrames[s]! - TICK_DT;
  updateAway(w, inputsIn);
  // while the party is lifted to the next floor nobody can move, shoot or throw: only the aim is kept
  if (w.misc[MISC.Phase] === FloorPhase.Ascend || w.tick < w.misc[MISC.Cine]!) inputs = inputs.map((i) => (i ? { moveX: 0, moveY: 0, aim: i.aim, buttons: i.buttons & (Buttons.Card1 | Buttons.Card2 | Buttons.Card3), ...(i.aimDist !== undefined ? { aimDist: i.aimDist } : {}), ...(i.gAim !== undefined ? { gAim: i.gAim } : {}) } : i));
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
    // a click on the weapon list picks a weapon (index + 1) while no card offer is open; nothing ever switches by itself
    if (w.pOffer[s * 3]! < 0 && inp.wsel) selectWeapon(w, s, inp.wsel - 1);
    // a helper holding Revive next to a downed teammate is busy: slower, no shooting (moving off interrupts the revive)
    const busy = (inp.buttons & Buttons.Revive) !== 0 && downedNear(w, s);
    const angle = movePlayer(w, s, inp, BALANCE.player.speed * w.modSpeed[s]! * w.pModSpeed[s]! * speedMul(w, s) * (busy ? BALANCE.player.reviveMoveMul : 1) * (w.pCharge[s]! > 0 ? 0.45 : 1), !busy);
    if (!busy && w.pStun[s] === 0) fireWeapon(w, s, inp, angle);
  }
  updateAbilities(w, inputs);
  updatePlayerPerks(w);
  updateBarrels(w);
  updateRevive(w, inputs);
  updateGrenades(w, inputs);

  updateEnemies(w);
  settleLayers(w);
  updateDrones(w, inputs);
  updateHazards(w);
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
    const wall = segmentBlocked(x0, y0, w.bX[i]!, w.bY[i]!, w.bLayer[i]!);
    let spent = wall;
    if (!spent) spent = bulletVsBarrels(w, i, x0, y0, w.bX[i]!, w.bY[i]!);
    if (!spent && w.enemyCount > 0) spent = bulletVsEnemies(w, i, x0, y0, w.bX[i]!, w.bY[i]!);
    const x = w.bX[i]!;
    const y = w.bY[i]!;
    if (spent || w.bLife[i]! <= 0 || x < -ARENA_HALF_W || x > ARENA_HALF_W || y < -ARENA_HALF_H || y > ARENA_HALF_H) endBullet(w, i, x, y, wall ? 1 : spent ? 2 : 0);
  }

  // life cycle: zero hp means downed; nobody left standing ends the run
  let standing = 0;
  let any = false;
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s]) continue;
    any = true;
    if (w.pState[s] === PlayerState.Alive) {
      if (w.pHp[s]! <= 0 && perk(w, s, PERK.Second) > 0) {
        setPerk(w, s, PERK.Second, perk(w, s, PERK.Second) - 1);
        w.pHp[s] = w.pMaxHp[s]! * BALANCE.perks.secondHp;
        w.pIFrames[s] = 2;
        w.events.push({ type: 'secondWind', slot: s });
        standing++;
      } else if (w.pHp[s]! <= 0) {
        w.pState[s] = PlayerState.Downed;
        w.pTimer[s] = BALANCE.player.downedSeconds * fxOf(w).downedMul;
        w.pRevive[s] = 0;
        addStat(w, s, STAT.Downs, 1);
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
  c.u32(w.mods).u32(w.map).u32(w.wave).u32(w.waveTick).u32(w.kills).u32(w.enemyCount).u32(w.gameOver);
  c.typed(new Float64Array([w.modLoot]));
  c.typed(w.pXp).typed(w.pLevel).typed(w.pPending).typed(w.pOffer).typed(w.pCardTimer).typed(w.pCardLock).typed(w.pCardPrev).typed(w.pCards);
  c.typed(w.modDamage).typed(w.modRate).typed(w.modSpeed).typed(w.modPierce).typed(w.modRevive).typed(w.modMagnet).typed(w.modXp).typed(w.modBlast).typed(w.modReload).typed(w.modDash).typed(w.modArmor).typed(w.modCrit);
  c.typed(w.pModRate).typed(w.pModPierce).typed(w.pModArmor).typed(w.pLifesteal);
  c.typed(w.modAbCd).typed(w.modAbDur).typed(w.modAbDmg).typed(w.modAbRad).typed(w.modAbExtra);
  c.typed(w.pActive).typed(w.pX).typed(w.pY).typed(w.pAngle).typed(w.pHp).typed(w.pMaxHp).typed(w.pState).typed(w.pTimer).typed(w.pRevive);
  c.typed(w.pGren).typed(w.pGrenCharge).typed(w.pGrenCd);
  c.typed(w.pMag).typed(w.pReload).typed(w.pDash).typed(w.pDashCd).typed(w.pDashX).typed(w.pDashY).typed(w.pModDmg).typed(w.pModSpeed);
  c.typed(w.gActive).typed(w.gX).typed(w.gY).typed(w.gVx).typed(w.gVy).typed(w.gFuse).typed(w.gOwner);
  c.typed(w.kActive).typed(w.kData).typed(w.kLayer).typed(w.kType).typed(w.kX).typed(w.kY).typed(w.kLife);
  c.typed(w.sActive).typed(w.sX).typed(w.sY).typed(w.sVx).typed(w.sVy).typed(w.sLife);
  c.typed(w.pPerk).typed(w.pStat).typed(w.pWpnTime).typed(w.pWpnKills).typed(w.eMod).typed(w.eShield).typed(w.eFrost).typed(w.eAct).typed(w.eActT).typed(w.eAir).typed(w.eVX).typed(w.eVY).typed(w.pStun).typed(w.pKnockX).typed(w.pKnockY).typed(w.pAir).typed(w.pLayer).typed(w.eLayer).typed(w.bLayer).typed(w.sLayer).typed(w.pSpecCd).typed(w.pSpecT).typed(w.pRally).typed(w.pCharge).typed(w.pOver).typed(w.zActive).typed(w.zKind).typed(w.zX).typed(w.zY).typed(w.zR).typed(w.zLeft).typed(w.tActive).typed(w.tShape).typed(w.tEffect).typed(w.tX).typed(w.tY).typed(w.tA).typed(w.tW).typed(w.tL).typed(w.tAmt).typed(w.tLeft).typed(w.tTotal).typed(w.tOwner).typed(w.brActive).typed(w.brX).typed(w.brY).typed(w.brHp).typed(w.brT).typed(w.misc);
  c.typed(w.pCooldown).typed(w.pIFrames).typed(w.pWeapon).typed(w.pOwned).typed(w.pInvMag).typed(w.pInvReload);
  c.typed(w.eActive).typed(w.eType).typed(w.eBoss).typed(w.eAux).typed(w.eState).typed(w.eStateTick).typed(w.eX).typed(w.eY).typed(w.eAngle).typed(w.eHp).typed(w.eCooldown);
  c.typed(w.bActive).typed(w.bX).typed(w.bY).typed(w.bVx).typed(w.bVy).typed(w.bLife).typed(w.bDamage).typed(w.bOwner).typed(w.bPierce).typed(w.bHit);
  c.typed(w.pDrone).typed(w.pDLv).typed(w.pDXp).typed(w.pDWarm).typed(w.pAway).typed(w.dX).typed(w.dY).typed(w.dAim).typed(w.dCd).typed(w.dBeam).typed(w.dN).typed(w.eSlow).typed(w.eSlowP).typed(w.bSrc).typed(w.bBlastR).typed(w.bBlastD);
  return c.digest();
}
