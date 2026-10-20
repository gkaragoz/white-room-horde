import { applyObstacles } from './obstacles';
import type { World } from './state';

/** Every typed array that is part of the simulated state, in a fixed order (flow field included: it is cached across ticks). */
function arrays(w: World): ArrayBufferView[] {
  return [
    w.pXp, w.pLevel, w.pPending, w.pOffer, w.pCardTimer, w.pCardLock, w.pCardPrev, w.pCards,
    w.modDamage, w.modRate, w.modSpeed, w.modPierce, w.modRevive, w.modMagnet, w.modXp, w.modBlast, w.modReload, w.modDash, w.modArmor, w.modCrit,
    w.pActive, w.pX, w.pY, w.pAngle, w.pHp, w.pMaxHp, w.pState, w.pTimer, w.pRevive, w.pCooldown, w.pIFrames, w.pWeapon, w.pAmmo, w.pOwned, w.pInvMag, w.pInvAmmo, w.pMoving, w.pMag, w.pReload, w.pDash, w.pDashCd, w.pDashX, w.pDashY, w.pModDmg, w.pModSpeed, w.pModRate, w.pModPierce, w.pModArmor, w.pLifesteal, w.pPerk, w.pGren, w.pGrenCharge, w.pGrenCd,
    w.eActive, w.eType, w.eBoss, w.eAux, w.eState, w.eStateTick, w.eX, w.eY, w.eAngle, w.eHp, w.eCooldown, w.eMod, w.eFrost, w.eAct, w.eActT, w.eAir, w.eVX, w.eVY,
    w.pStun, w.pKnockX, w.pKnockY, w.pAir, w.pLayer, w.eLayer, w.bLayer, w.sLayer, w.pSpecCd, w.pSpecT, w.pRally, w.pCharge, w.pOver,
    w.zActive, w.zKind, w.zX, w.zY, w.zR, w.zLeft,
    w.tActive, w.tShape, w.tEffect, w.tX, w.tY, w.tA, w.tW, w.tL, w.tAmt, w.tLeft, w.tTotal, w.tOwner,
    w.brActive, w.brX, w.brY, w.brHp, w.brT, w.misc,
    w.gActive, w.gX, w.gY, w.gVx, w.gVy, w.gFuse, w.gOwner,
    w.kActive, w.kType, w.kX, w.kY, w.kLife, w.kData, w.kLayer,
    w.sActive, w.sX, w.sY, w.sVx, w.sVy, w.sLife,
    w.bActive, w.bX, w.bY, w.bVx, w.bVy, w.bLife, w.bDamage, w.bOwner, w.bPierce, w.bHit,
    w.field.cost, w.field.dirX, w.field.dirY,
    w.field1.cost, w.field1.dirX, w.field1.dirY,
  ];
}

const SCALARS = 11;

/** Serialise the whole world (for desync recovery and fast late join). */
export function serializeWorld(w: World): Uint8Array {
  const list = arrays(w);
  let size = SCALARS * 8 + 16;
  for (const a of list) size += a.byteLength;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  const sc = [w.difficulty, w.map, w.tick, w.wave, w.waveTick, w.countMul, w.hpMul, w.kills, w.enemyCount, w.gameOver, w.modLoot];
  sc.forEach((v, i) => dv.setFloat64(i * 8, v, true));
  const rs = w.rng.getState();
  for (let i = 0; i < 4; i++) dv.setUint32(SCALARS * 8 + i * 4, rs[i]!, true);
  let off = SCALARS * 8 + 16;
  for (const a of list) {
    out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), off);
    off += a.byteLength;
  }
  return out;
}

/** Overwrite the world with a snapshot made by `serializeWorld` (same build). */
export function restoreWorld(w: World, buf: Uint8Array): void {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const sc: number[] = [];
  for (let i = 0; i < SCALARS; i++) sc.push(dv.getFloat64(i * 8, true));
  [w.difficulty, w.map, w.tick, w.wave, w.waveTick, w.countMul, w.hpMul, w.kills, w.enemyCount, w.gameOver, w.modLoot] = sc as [number, number, number, number, number, number, number, number, number, number, number];
  applyObstacles(w.field, w.map, 0);
  applyObstacles(w.field1, w.map, 1);
  w.rng.setState([dv.getUint32(SCALARS * 8, true), dv.getUint32(SCALARS * 8 + 4, true), dv.getUint32(SCALARS * 8 + 8, true), dv.getUint32(SCALARS * 8 + 12, true)]);
  let off = SCALARS * 8 + 16;
  for (const a of arrays(w)) {
    new Uint8Array(a.buffer, a.byteOffset, a.byteLength).set(buf.subarray(off, off + a.byteLength));
    off += a.byteLength;
  }
  w.events.length = 0;
}
