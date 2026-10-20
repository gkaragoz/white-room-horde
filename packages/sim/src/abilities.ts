import { BALANCE, Buttons, CLASS_IDS, MAX_ENEMIES, MAX_PLAYERS, PERK, PlayerState, TICK_DT, TeleEffect, TeleShape, WEAPON_IDS, ENEMY_TYPES, type PlayerInput } from '@wrh/shared';
import type { WeaponStats } from '@wrh/shared';
import { atan2, clamp, cos, sin, sqrt } from './detmath';
import { damageEnemyBy, shove } from './enemies';
import { abilityRate, damageMul, perk } from './features';
import { addTelegraph } from './hazards';
import type { World } from './state';

const T_RADIUS = ENEMY_TYPES.map((id) => BALANCE.enemies[id].radius);
const A = BALANCE.abilities;

export const CLS = { soldier: 0, medic: 1, heavy: 2, scout: 3, demolisher: 4, ranger: 5, berserker: 6, swordsman: 7, hammerer: 8 } as const;
void CLASS_IDS;

function classOf(w: World, s: number): number {
  return perk(w, s, PERK.Class);
}

/** The ability of this character is on right now (the timed ones: fortify, burst, rampage, blade storm). */
export function abilityActive(w: World, s: number): boolean {
  return w.pSpecT[s]! > 0;
}

function allies(w: World, s: number, radius: number, fn: (o: number) => void): void {
  const r2 = radius * radius;
  for (let o = 0; o < MAX_PLAYERS; o++) {
    if (!w.pActive[o] || w.pState[o] !== PlayerState.Alive) continue;
    const dx = w.pX[o]! - w.pX[s]!;
    const dy = w.pY[o]! - w.pY[s]!;
    if (dx * dx + dy * dy <= r2) fn(o);
  }
}

/** The damage of one blow of player `s` with a weapon: the weapon's own damage, every card and buff, and a roll for a critical hit. */
function blow(w: World, s: number, base: number): number {
  const crit = w.modCrit[s]! > 0 && w.rng.float() < w.modCrit[s]! ? 2 : 1;
  return base * w.modDamage[s]! * w.pModDmg[s]! * damageMul(w, s) * crit;
}

/** Hit every enemy of a swing (an arc in front of the player, or the whole circle) and push them back. */
function sweep(w: World, s: number, angle: number, arc: number, radius: number, damage: number, knock: number, circle: boolean, weaponIndex: number, charge = 0): void {
  const px = w.pX[s]!;
  const py = w.pY[s]!;
  let hits = 0;
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!w.eActive[i]) continue;
    const dx = w.eX[i]! - px;
    const dy = w.eY[i]! - py;
    const reach = radius + T_RADIUS[w.eType[i]!]! * (w.eBoss[i] ? 1.7 : 1);
    const d2 = dx * dx + dy * dy;
    if (d2 > reach * reach) continue;
    const d = sqrt(d2);
    if (!circle && d > 0.6) {
      let da = atan2(dy, dx) - angle;
      da = atan2(sin(da), cos(da));
      // a big body is hit even when its middle is just outside the arc
      const slack = d > 0.01 ? atan2(T_RADIUS[w.eType[i]!]!, d) : 3;
      if (Math.abs(da) > arc / 2 + slack) continue;
    }
    const nx = d > 1e-6 ? dx / d : cos(angle);
    const ny = d > 1e-6 ? dy / d : sin(angle);
    damageEnemyBy(w, i, s, blow(w, s, damage), nx, ny);
    if (w.eActive[i]) shove(w, i, nx * knock * (w.eBoss[i] ? 0.15 : 1) * 0.35, ny * knock * (w.eBoss[i] ? 0.15 : 1) * 0.35);
    hits++;
  }
  w.events.push({ type: 'swing', slot: s, weapon: weaponIndex, x: px, y: py, angle, arc: circle ? 6.2832 : arc, radius, hits, charge });
}

/**
 * A blade or a hammer: while the trigger is held a swing sweeps an arc in front of the character and hits everything in it.
 * The hammer can also be charged: hold the trigger, the character slows down and the hammer builds up, let go and it spins
 * all the way round, harder and wider the longer it was held.
 */
export function meleeAttack(w: World, s: number, inp: PlayerInput, angle: number, stats: WeaponStats): void {
  const m = stats.melee!;
  const weaponIndex = w.pWeapon[s]!;
  w.pCooldown[s] = w.pCooldown[s]! - TICK_DT;
  if (w.pCooldown[s]! < 0) w.pCooldown[s] = 0;
  const held = (inp.buttons & Buttons.Fire) !== 0;
  const interval = 1 / (stats.rate * w.modRate[s]! * w.pModRate[s]! * abilityRate(w, s));
  if (m.charge > 0) {
    if (held && w.pCooldown[s]! <= 0) {
      w.pCharge[s] = Math.min(m.charge, w.pCharge[s]! + TICK_DT);
    } else if (!held && w.pCharge[s]! > 0) {
      const c = w.pCharge[s]!;
      w.pCharge[s] = 0;
      const frac = c / m.charge;
      if (c < 0.25) sweep(w, s, angle, m.arc, m.radius, stats.damage, m.knock, false, weaponIndex);
      else sweep(w, s, angle, m.arc, m.radius * (1 + 0.5 * frac), stats.damage * (1 + 2.4 * frac), m.knock * (1 + frac), true, weaponIndex, frac);
      w.pCooldown[s] = interval * (c < 0.25 ? 1 : 1.3);
    }
    return;
  }
  if (held && w.pCooldown[s]! <= 0) {
    sweep(w, s, angle, m.arc, m.radius, stats.damage, m.knock, false, weaponIndex);
    w.pCooldown[s] = interval;
  }
}

function activate(w: World, s: number, inp: PlayerInput, cls: number): void {
  const px = w.pX[s]!;
  const py = w.pY[s]!;
  const angle = w.pAngle[s]!;
  switch (cls) {
    case CLS.soldier:
      allies(w, s, A.soldier!.radius!, (o) => (w.pRally[o] = A.soldier!.seconds!));
      break;
    case CLS.medic:
      allies(w, s, A.medic!.radius!, (o) => {
        const hp = w.pHp[o]! + w.pMaxHp[o]! * A.medic!.heal!;
        w.pHp[o] = hp > w.pMaxHp[o]! ? w.pMaxHp[o]! : hp;
      });
      break;
    case CLS.heavy:
      w.pSpecT[s] = A.heavy!.seconds!;
      break;
    case CLS.scout:
      w.pSpecT[s] = A.scout!.seconds!;
      w.pDashCd[s] = 0;
      if (w.pIFrames[s]! < 0.5) w.pIFrames[s] = 0.5;
      break;
    case CLS.demolisher: {
      const a = A.demolisher!;
      const reach = Math.min(a.reach!, inp.aimDist ? Math.max(5, inp.aimDist * 0.5) : a.reach!);
      const tx = clamp(px + cos(angle) * reach, -29, 29);
      const ty = clamp(py + sin(angle) * reach, -19, 19);
      for (let k = 0; k < a.count!; k++) {
        const ox = k === 0 ? 0 : (w.rng.float() * 2 - 1) * a.spread!;
        const oy = k === 0 ? 0 : (w.rng.float() * 2 - 1) * a.spread!;
        const t = addTelegraph(w, TeleShape.Circle, TeleEffect.Strike, clamp(tx + ox, -29, 29), clamp(ty + oy, -19, 19), 0, a.radius!, 0, a.delay! + k * a.stagger!, blow(w, s, a.damage!));
        if (t >= 0) w.tOwner[t] = s;
      }
      break;
    }
    case CLS.ranger:
      w.pOver[s] = A.ranger!.shots!;
      break;
    case CLS.berserker:
      w.pSpecT[s] = A.berserker!.seconds!;
      break;
    case CLS.swordsman:
      w.pSpecT[s] = A.swordsman!.seconds!;
      break;
    case CLS.hammerer: {
      const a = A.hammerer!;
      sweep(w, s, angle, 6.2832, a.radius!, BALANCE.weapons.hammer.damage * a.damage!, a.knock!, true, WEAPON_IDS.indexOf('hammer'), 1);
      w.events.push({ type: 'explosion', x: px, y: py, radius: a.radius! * 0.7 });
      break;
    }
    default:
      return;
  }
  w.pSpecCd[s] = A[CLASS_IDS_BY_INDEX[cls]!]!.cd!;
  w.events.push({ type: 'ability', slot: s, cls, x: px, y: py });
}

const CLASS_IDS_BY_INDEX = ['soldier', 'medic', 'heavy', 'scout', 'demolisher', 'ranger', 'berserker', 'swordsman', 'hammerer'];

/** Timers, the Special button, and the effects that run on their own (blade storm). Called once a tick after the players moved. */
export function updateAbilities(w: World, inputs: ReadonlyArray<PlayerInput | undefined>): void {
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s]) continue;
    if (w.pSpecCd[s]! > 0) w.pSpecCd[s] = Math.max(0, w.pSpecCd[s]! - TICK_DT);
    if (w.pRally[s]! > 0) w.pRally[s] = Math.max(0, w.pRally[s]! - TICK_DT);
    if (w.pState[s] !== PlayerState.Alive) {
      w.pSpecT[s] = 0;
      w.pCharge[s] = 0;
      continue;
    }
    const cls = classOf(w, s);
    if (w.pSpecT[s]! > 0) {
      w.pSpecT[s] = Math.max(0, w.pSpecT[s]! - TICK_DT);
      if (cls === CLS.swordsman) {
        const a = A.swordsman!;
        // the blade storm: the blade whirls round the character
        if (Math.round(w.pSpecT[s]! * 30) % a.every! === 0) sweep(w, s, w.pAngle[s]!, 6.2832, a.radius!, BALANCE.weapons.sword.damage * a.damage!, a.knock!, true, WEAPON_IDS.indexOf('sword'), 1);
      }
    }
    const inp = inputs[s];
    if (inp && (inp.buttons & Buttons.Special) !== 0 && w.pSpecCd[s]! <= 0 && w.pStun[s] === 0) activate(w, s, inp, cls);
  }
}
