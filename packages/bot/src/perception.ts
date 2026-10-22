import { MAX_BARRELS, MAX_ENEMIES, MAX_PICKUPS, MAX_PLAYERS, MAX_SPIT, MAX_ZONES, MISC, PERK, PERKS, PlayerState, type PlayerInput } from '@wrh/shared';
import type { World } from '@wrh/sim';
import type { Ally, Barrel, Memory, Percept, Pickup, Spit, Telegraph, Threat, Zone } from './types';

const AIM_TO_RAD = (Math.PI * 2) / 65536;
const MAX_THREATS = 96;

/** Read one player's view of the world. `humans` lists the slots driven by people (for ally roles). */
export function perceive(w: World, slot: number, mem: Memory, humans: ReadonlySet<number> = new Set()): Percept {
  const px = w.pX[slot]!;
  const py = w.pY[slot]!;
  const prev = (mem.perceptionPrev ?? new Map<number, { x: number; y: number; tick: number }>()) as Map<number, { x: number; y: number; tick: number }>;
  const next = new Map<number, { x: number; y: number; tick: number }>();
  const enemies: Threat[] = [];
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!w.eActive[i]) continue;
    const x = w.eX[i]!;
    const y = w.eY[i]!;
    const dx = x - px;
    const dy = y - py;
    const before = prev.get(i);
    const dt = before ? Math.max(1, w.tick - before.tick) : 0;
    enemies.push({
      id: i,
      x,
      y,
      d2: dx * dx + dy * dy,
      type: w.eType[i]!,
      boss: w.eBoss[i]! > 0,
      elite: w.eMod[i]!,
      hp: w.eHp[i]!,
      maxHp: w.eMaxHp[i]! > 0 ? w.eMaxHp[i]! : w.eHp[i]!,
      vx: before ? (x - before.x) / dt : 0,
      vy: before ? (y - before.y) / dt : 0,
      layer: w.eLayer[i]!,
    });
    next.set(i, { x, y, tick: w.tick });
  }
  mem.perceptionPrev = next;
  enemies.sort((a, b) => a.d2 - b.d2);
  if (enemies.length > MAX_THREATS) enemies.length = MAX_THREATS;

  const telegraphs: Telegraph[] = [];
  for (let t = 0; t < w.tActive.length; t++) {
    if (!w.tActive[t]) continue;
    telegraphs.push({ x: w.tX[t]!, y: w.tY[t]!, shape: w.tShape[t]!, w: w.tW[t]!, l: w.tL[t]!, eta: w.tLeft[t]!, effect: w.tEffect[t]!, angle: w.tA[t]!, amt: w.tAmt[t]! });
  }

  const zones: Zone[] = [];
  for (let z = 0; z < MAX_ZONES; z++) {
    if (!w.zActive[z]) continue;
    zones.push({ x: w.zX[z]!, y: w.zY[z]!, r: w.zR[z]!, left: w.zLeft[z]!, kind: w.zKind[z]! });
  }
  const spits: Spit[] = [];
  for (let k = 0; k < MAX_SPIT; k++) {
    if (!w.sActive[k]) continue;
    spits.push({ x: w.sX[k]!, y: w.sY[k]!, vx: w.sVx[k]!, vy: w.sVy[k]!, life: w.sLife[k]!, layer: w.sLayer[k]! });
  }

  const barrels: Barrel[] = [];
  for (let b = 0; b < MAX_BARRELS; b++) {
    if (!w.brActive[b]) continue;
    barrels.push({ x: w.brX[b]!, y: w.brY[b]!, hp: w.brHp[b]! });
  }

  const pickups: Pickup[] = [];
  for (let k = 0; k < MAX_PICKUPS; k++) {
    if (!w.kActive[k]) continue;
    pickups.push({ id: k, x: w.kX[k]!, y: w.kY[k]!, type: w.kType[k]!, data: w.kData[k]!, layer: w.kLayer[k]! });
  }

  const allies: Ally[] = [];
  for (let o = 0; o < MAX_PLAYERS; o++) {
    if (o === slot || !w.pActive[o]) continue;
    allies.push({ slot: o, x: w.pX[o]!, y: w.pY[o]!, state: w.pState[o]!, hp: w.pHp[o]!, maxHp: w.pMaxHp[o]!, human: humans.has(o) });
  }

  const offer: number[] = [];
  for (let i = 0; i < 3; i++) {
    const c = w.pOffer[slot * 3 + i]!;
    if (c >= 0) offer.push(c);
  }

  return {
    tick: w.tick,
    wave: w.wave,
    slot,
    x: px,
    y: py,
    angle: w.pAngle[slot]!,
    hp: w.pHp[slot]!,
    maxHp: w.pMaxHp[slot]!,
    state: w.pState[slot]!,
    layer: w.pLayer[slot]!,
    mag: w.pMag[slot]!,
    weapon: w.pWeapon[slot]!,
    enemies,
    telegraphs,
    zones,
    spits,
    barrels,
    pickups,
    allies,
    offer,
    phase: w.misc[MISC.Phase]!,
    grenades: w.pGren[slot]!,
    world: w,
  };
}

/** The class of a player (CLASS_IDS index). */
export const classOf = (w: World, slot: number): number => w.pPerk[slot * PERKS + PERK.Class]!;

/** Is this player standing (not downed or dead)? */
export const isStanding = (p: { state: number }): boolean => p.state === PlayerState.Alive;

/** Convert a sim aim value to radians and back. */
export const aimToRad = (aim: number): number => aim * AIM_TO_RAD;
export const radToAim = (rad: number): number => ((Math.round(((rad % (Math.PI * 2)) + Math.PI * 2) / AIM_TO_RAD) % 65536) + 65536) % 65536;

/** Clamp an input to what the wire allows. */
export function sanitize(i: PlayerInput): PlayerInput {
  const c = (v: number): number => Math.max(-127, Math.min(127, Math.round(v)));
  return { ...i, moveX: c(i.moveX), moveY: c(i.moveY), aim: i.aim & 0xffff, buttons: i.buttons & 0x1ff };
}
