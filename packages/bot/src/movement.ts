import { ARENA_HALF_H, ARENA_HALF_W, BALANCE, ENEMY_TYPES, MAPS, PERK, PERKS, PickupType, PlayerState, WEAPON_IDS } from '@wrh/shared';
import { owns } from '@wrh/sim';
import { BLOW, DPS, HOLD, RANGED, STAND_OFF, T, bursts, lateScale, radiusOf, speedOf, telePain } from './danger';
import { focusBoxes, focusRay, geoOf, movingDist2, nearRamp, segmentCovered, onDeck, pushOutLocal, pushed, rampEnd, rampPoint, teleDist, wrapAngle, type MapGeo } from './geometry';
import { NavState, computeField, fieldFresh, goalDist, goalField, goalWaypoint, territoryAt, useNav, waypoint } from './nav';
import { engagement } from './weapons';
import type { Ctx, MoveDecision, Percept, TeamDecision } from './types';

/**
 * Where to move and when to dash.
 *
 * Every tick the planner tries a ring of headings (and, when the dash is ready, a dash along some of them). For each heading it
 * plays the next two seconds forward: the bot runs straight at the player speed (stopping at walls, boxes and the deck edge), the
 * enemies chase it (ranged ones hold their distance), and the cost is added up in "pain" (1 pain = 10 hit points): contact and
 * near-contact with every enemy, ground attacks that land while the bot is still inside them, acid and fire, spit, plus small
 * terms for staying in shooting range, for pickups and for the team's pull. A heading that ends in a cramped or cut-off place
 * pays for it (nav.ts: who gets to each cell first). The cheapest heading wins; dashing is chosen when it is clearly cheaper,
 * because the dash's invulnerability also dodges what lands in its first quarter second.
 * The skill's `dodge` scales how much of the ground-attack warnings the bot takes into account and switches the dash off when low.
 */

const DIRS = 16;
const DASH_EVERY = 2;
const STEPS = 10;
const DT = 0.2;
const HORIZON = STEPS * DT;
const MAXE = 40;
const SEE2 = 26 * 26;
const FIELD2 = 34 * 34;
/** Ticks the room field is kept (the territory does not change much in a tenth of a second). */
const FIELD_AGE = 3;
const PR = BALANCE.player.radius;
const DASH_SECONDS = Math.ceil(BALANCE.dash.seconds * 30) / 30;
/**
 * The weights of the planner. They are exposed so that tests and tuning runs can try other values; the defaults were tuned against
 * the benchmark (damage taken per minute and floors reached).
 */
export const tuning = {
  /** Price of ending the look-ahead cramped or cut off, at most. */
  roomW: 2,
  /** The margin around an enemy in which the approach already costs: base plus this times its speed. */
  approachBase: 1.5,
  approachSpeed: 0.4,
  /** Weight of the approach cost against the cost of contact. */
  nearWeight: 0.7,
  /** Weight of staying in shooting range (per unit beyond the band). */
  lagK: 0.05,
  /** What spending the dash costs (pain). */
  dashCost: 0.7,
  /** Extra price of turning right around (share of the cost). */
  turnPenalty: 0.3,
};
const DIR_X = new Float64Array(DIRS);
const DIR_Y = new Float64Array(DIRS);
for (let k = 0; k < DIRS; k++) {
  DIR_X[k] = Math.cos((k / DIRS) * Math.PI * 2);
  DIR_Y[k] = Math.sin((k / DIRS) * Math.PI * 2);
}

// scratch (module level: a bot decides synchronously, so nothing is shared across calls)
const ex = new Float64Array(MAXE);
const ey = new Float64Array(MAXE);
const esp = new Float64Array(MAXE);
const etouch = new Float64Array(MAXE);
const eoff = new Float64Array(MAXE);
const edps = new Float64Array(MAXE);
const eblow = new Float64Array(MAXE);
const ehold = new Float64Array(MAXE);
const erel2 = new Float64Array(MAXE);
const eburst = new Uint8Array(MAXE);
/** For enemies that shoot a fan or a beam at whoever they see: squared range and the price per step of standing in it. */
const efire2 = new Float64Array(MAXE);
const efire = new Float64Array(MAXE);
const fx = new Float64Array(96);
const fy = new Float64Array(96);
const wx = new Float64Array(MAXE);
const wy = new Float64Array(MAXE);
const pathX = new Float64Array(STEPS + 1);
const pathY = new Float64Array(STEPS + 1);
const stepped = { x: 0, y: 0 };
const brx = new Float64Array(24);
const bry = new Float64Array(24);
let nBarrels = 0;
const BARREL_KEEP2 = 3.8 * 3.8;

/** Range and price (pain per step) of standing where the enemy can fire its beams or its fan at the bot. */
const FIRE_RANGE = new Float64Array(ENEMY_TYPES.length);
const FIRE_RATE = new Float64Array(ENEMY_TYPES.length);
FIRE_RANGE[T.spiker] = BALANCE.special.spiker!.range! + 1;
FIRE_RATE[T.spiker] = 0.3;
FIRE_RANGE[T.marksman] = BALANCE.special.marksman!.range! + 1;
FIRE_RATE[T.marksman] = 0.12;
FIRE_RANGE[T.chopper] = BALANCE.special.chopper!.range! + 1;
FIRE_RATE[T.chopper] = 0.12;

interface Memo {
  heading: number;
}

const MAXG = 4;
const goalX = new Float64Array(MAXG);
const goalY = new Float64Array(MAXG);
const goalV = new Float64Array(MAXG);
let goalN = 0;
/** Keep the most worthwhile goals (value per distance). */
function addGoal(x: number, y: number, value: number, px: number, py: number): void {
  const score = value / (8 + Math.hypot(x - px, y - py));
  let at = goalN < MAXG ? goalN : -1;
  if (at < 0) {
    let worst = 0;
    let worstScore = 1e9;
    for (let i = 0; i < MAXG; i++) {
      const sc = goalV[i]! / (8 + Math.hypot(goalX[i]! - px, goalY[i]! - py));
      if (sc < worstScore) {
        worstScore = sc;
        worst = i;
      }
    }
    if (score <= worstScore) return;
    at = worst;
  } else goalN++;
  goalX[at] = x;
  goalY[at] = y;
  goalV[at] = value;
}


/** The player's own speed in units per second. */
function speedNow(p: Percept): number {
  const w = p.world;
  const s = p.slot;
  let v = BALANCE.player.speed * w.modSpeed[s]! * w.pModSpeed[s]!;
  if (w.pPerk[s * PERKS + PERK.Haste]! > 0) v *= 1.4;
  if (w.pSpecT[s]! > 0) {
    const cls = w.pPerk[s * PERKS + PERK.Class]!;
    if (cls === 3) v *= BALANCE.abilities.scout!.speed!;
    else if (cls === 2) v *= BALANCE.abilities.heavy!.speed!;
    else if (cls === 6) v *= BALANCE.abilities.berserker!.speed!;
    else if (cls === 7) v *= BALANCE.abilities.swordsman!.speed!;
  }
  if (w.pRally[s]! > 0) v *= BALANCE.abilities.soldier!.speed!;
  if (w.pCharge[s]! > 0) v *= 0.45;
  return v;
}

const isMeleeWeapon = (p: Percept): boolean => !!BALANCE.weapons[WEAPON_IDS[p.weapon]!]!.melee;

/** What a pickup is worth to this player right now, in pain. */
function pickupValue(p: Percept, type: number, data: number): number {
  const hurt = 1 - p.hp / Math.max(1, p.maxHp);
  switch (type) {
    case PickupType.Health:
      return p.hp < p.maxHp ? 1 + hurt * 6 : 0;
    case PickupType.Grenade:
      return p.grenades < BALANCE.grenade.max ? 0.7 : 0;
    case PickupType.Weapon:
      return owns(p.world, p.slot, data) || isMeleeWeapon(p) ? 0 : 1.6;
    case PickupType.Shield:
      return p.world.pPerk[p.slot * PERKS + PERK.Shield]! < 100 ? 1.6 : 0;
    case PickupType.Haste:
      return 1.2;
    case PickupType.Quad:
      return 2.2;
    case PickupType.Nuke:
      return 3.2;
    case PickupType.Freeze:
      return 2.2;
    case PickupType.Drone:
      return 2;
    default:
      return p.grenades < BALANCE.grenade.max ? 0.5 : 0;
  }
}

/** Longest stretch walked between two collision checks: the thinnest cover on the ground is 1.2 thick, a body 0.9 wide, so a step of 1.5 cannot jump a wall (the deck rails are thinner: the deck uses `SUB_DECK`). */
const SUB = 1.5;
const SUB_DECK = 0.8;

/** Walk the player forward along (hx, hy), stopping at boxes, the arena edge and the deck edge. Result in `stepped`. */
function stepPlayer(g: MapGeo, deck: boolean, x: number, y: number, hx: number, hy: number, dist: number): void {
  const n = Math.ceil(dist / (deck ? SUB_DECK : SUB));
  const d = dist / n;
  for (let i = 0; i < n; i++) {
    let nx = x + hx * d;
    let ny = y + hy * d;
    nx = nx < -ARENA_HALF_W + PR ? -ARENA_HALF_W + PR : nx > ARENA_HALF_W - PR ? ARENA_HALF_W - PR : nx;
    ny = ny < -ARENA_HALF_H + PR ? -ARENA_HALF_H + PR : ny > ARENA_HALF_H - PR ? ARENA_HALF_H - PR : ny;
    if (pushOutLocal(nx, ny, PR)) {
      nx = pushed.x;
      ny = pushed.y;
    }
    if (deck && !onDeck(g, nx, ny)) {
      nx = x;
      ny = y;
    }
    x = nx;
    y = ny;
  }
  stepped.x = x;
  stepped.y = y;
}

/**
 * Cost of one candidate: `dash` makes the first step a dash. `n` enemies are in the scratch arrays. Returns pain; `pathX/pathY`
 * hold the player's positions at the end of each step.
 */
function rollout(p: Percept, g: MapGeo, deck: boolean, n: number, hx: number, hy: number, speed: number, dash: boolean, iframes: number, band: number, near: number, melee: boolean): number {
  let px = p.x;
  let py = p.y;
  pathX[0] = px;
  pathY[0] = py;
  for (let i = 0; i < n; i++) {
    wx[i] = ex[i]!;
    wy[i] = ey[i]!;
  }
  let cost = 0;
  const free = dash ? Math.max(iframes, BALANCE.dash.iFrames) : iframes;
  const meleeK = melee ? 0.35 : 1;
  // a blade has to be near what it cuts: it pays more for drifting out of reach
  const lagK = melee ? 0.35 : tuning.lagK;
  for (let k = 1; k <= STEPS; k++) {
    const sp = dash && k === 1 ? speed * BALANCE.dash.speedMul : speed;
    const ox = px;
    const oy = py;
    stepPlayer(g, deck, px, py, hx, hy, sp * (dash && k === 1 ? DASH_SECONDS : DT));
    px = stepped.x;
    py = stepped.y;
    pathX[k] = px;
    pathY[k] = py;
    const tw = 1 - 0.4 * (k / STEPS);
    const safe = k * DT <= free;
    let nearest2 = 1e9;
    for (let i = 0; i < n; i++) {
      // the enemy moves toward the player (ranged ones hold their distance)
      const ax = wx[i]!;
      const ay = wy[i]!;
      const dx0 = px - ax;
      const dy0 = py - ay;
      const d02 = dx0 * dx0 + dy0 * dy0;
      const d0 = Math.sqrt(d02) + 1e-6;
      let mv = esp[i]! * DT;
      const hold = ehold[i]!;
      if (hold > 0) {
        if (d0 < hold) mv = -mv * 0.8;
        else if (d0 < hold + 2) mv = 0;
      } else {
        const stop = etouch[i]! - 0.2;
        if (d0 - stop < mv) mv = d0 - stop > 0 ? d0 - stop : 0;
      }
      const nx = ax + (dx0 / d0) * mv;
      const ny = ay + (dy0 / d0) * mv;
      wx[i] = nx;
      wy[i] = ny;
      if (efire2[i]! > 0 && !safe) {
        // in the line of fire of a spiker's fan, a marksman's beam, a chopper's axe: the longer, the likelier the blow
        const fx2 = px - nx;
        const fy2 = py - ny;
        if (fx2 * fx2 + fy2 * fy2 < efire2[i]! && !segmentCovered(g, nx, ny, px, py)) {
          cost += efire[i]! * tw;
        }
      }
      const q2 = movingDist2(ox, oy, px, py, ax, ay, nx, ny);
      if (q2 < nearest2) nearest2 = q2;
      if (safe || q2 > erel2[i]!) continue;
      const dmin = Math.sqrt(q2);
      const gap = dmin - etouch[i]!;
      const off = eoff[i]!;
      if (gap <= 0) {
        cost += (eburst[i] ? eblow[i]! : edps[i]! * DT * meleeK) * tw;
      } else {
        const a = tuning.approachBase + esp[i]! * tuning.approachSpeed;
        if (gap < a) {
          const f = (a - gap) / a;
          cost += (eburst[i] ? eblow[i]! * 0.5 : edps[i]! * DT * meleeK) * f * f * tuning.nearWeight * tw;
        }
      }
      if (off > 0 && gap > 0 && gap < off) {
        const f = (off - gap) / off;
        cost += (eburst[i] ? eblow[i]! : eblow[i]! * 0.5) * f * f * 0.5 * tw;
      }
    }
    // stay in shooting range of the crowd: a bot that only runs away never kills anything
    if (n > 0) {
      const nearest = Math.sqrt(nearest2);
      if (nearest > band) cost += Math.min(2, (nearest - band) * lagK) * DT * 3;
      else if (nearest < near) cost += (near - nearest) * 0.05 * DT;
    }
    // a barrel that goes off hurts whoever stands by it: keep clear while there is a fight
    for (let b = 0; b < nBarrels; b++) {
      const dx = px - brx[b]!;
      const dy = py - bry[b]!;
      if (dx * dx + dy * dy < BARREL_KEEP2) cost += 0.15 * tw;
    }
    // edges: the arena's border is where a run ends
    const mx = ARENA_HALF_W - Math.abs(px);
    const my = ARENA_HALF_H - Math.abs(py);
    if (mx < 4) cost += (4 - mx) * 0.06 * DT * 3;
    if (my < 4) cost += (4 - my) * 0.06 * DT * 3;
  }
  return cost;
}

/** Pain from the ground attacks, acid, fire and spit along the path in `pathX/pathY`. */
function groundCost(p: Percept, iframes: number, dash: boolean, lag: number): number {
  const free = dash ? Math.max(iframes, BALANCE.dash.iFrames) : iframes;
  let cost = 0;
  const wave = p.wave;
  const margin = PR + 0.2;
  const lagS = lag / 30;
  for (const t of p.telegraphs) {
    const tl = Math.max(0, t.eta - lag) / 30;
    if (tl <= free && tl <= HORIZON) continue;
    const pain = telePain(t, p.maxHp, p.hp, wave);
    if (pain <= 0) continue;
    const tt = Math.min(tl, HORIZON);
    const f = tt / DT;
    const i0 = Math.min(STEPS - 1, Math.floor(f));
    const u = f - i0;
    const qx = pathX[i0]! + (pathX[i0 + 1]! - pathX[i0]!) * u;
    const qy = pathY[i0]! + (pathY[i0 + 1]! - pathY[i0]!) * u;
    const d = teleDist(t.shape, t.x, t.y, t.w, t.l, t.angle, qx, qy);
    if (d < margin) cost += pain * (tl > HORIZON ? 0.35 : 1) * (d < -1 ? 1 : 0.85);
  }
  for (const z of p.zones) {
    const dps = (z.kind === 1 ? BALANCE.hazards.fire.dps : BALANCE.hazards.acid.dps) * BALANCE.enemyDamageMul;
    const r = z.r + PR;
    const r2 = r * r;
    for (let k = 1; k <= STEPS; k++) {
      if (z.left - lag < k * DT * 30) break;
      if (k * DT <= free) continue;
      const dx = pathX[k]! - z.x;
      const dy = pathY[k]! - z.y;
      if (dx * dx + dy * dy < r2) cost += (dps * DT) / 10;
    }
  }
  for (const s of p.spits) {
    const rr = BALANCE.spit.radius * BALANCE.hitbox.enemyMul + PR + 0.3;
    for (let k = 1; k <= STEPS; k++) {
      const t = k * DT;
      if (t > s.life - lagS) break;
      if (t <= free) continue;
      const dx = pathX[k]! - (s.x + s.vx * (t + lagS));
      const dy = pathY[k]! - (s.y + s.vy * (t + lagS));
      if (dx * dx + dy * dy < rr * rr) {
        cost += BLOW[T.spitter]! * lateScale(wave) * 0.9;
        break;
      }
    }
  }
  return cost;
}

let huntValue = 0;
let huntStart = 0;
let huntGX = 0;
let huntGY = 0;
let huntUX = 0;
let huntUY = 0;
let huntNear = false;

/** What the goals (pickups, the team's pull, the middle of the arena, the enemies to hunt) are worth along the path, as a negative cost. */
function goalGain(startX: number, startY: number, reach: number): number {
  let gain = 0;
  if (huntValue > 0) {
    // the way to the last enemies, around the boxes: how far the path got toward the next bend of the walking field (a path that
    // pushes into a wall gets nowhere, one that slides along it makes the way it slides), as the crow flies in the last cells
    const dx = pathX[STEPS]! - startX;
    const dy = pathY[STEPS]! - startY;
    const progress = huntNear
      ? Math.max(0, Math.min(1, (Math.hypot(startX - huntGX, startY - huntGY) - Math.hypot(pathX[STEPS]! - huntGX, pathY[STEPS]! - huntGY)) / 3))
      : Math.max(0, Math.min(1, (dx * huntUX + dy * huntUY) / 6));
    gain += huntValue * progress;
  }
  for (let i = 0; i < goalN; i++) {
    const gx = goalX[i]!;
    const gy = goalY[i]!;
    const d0 = Math.sqrt((gx - startX) * (gx - startX) + (gy - startY) * (gy - startY)) + 1e-6;
    let best2 = d0 * d0;
    for (let k = 2; k <= STEPS; k += 2) {
      const dx = gx - pathX[k]!;
      const dy = gy - pathY[k]!;
      const d2 = dx * dx + dy * dy;
      if (d2 < best2) best2 = d2;
    }
    const best = Math.sqrt(best2);
    const progress = Math.min(1, (d0 - best) / Math.min(d0, reach));
    if (progress > 0) gain += goalV[i]! * progress * (best < 0.9 ? 1.5 : 1);
  }
  return gain;
}

/** Cost of ending the look-ahead somewhere cramped or about to be cut off (see nav.ts): 0 in the open, up to `tuning.roomW` when boxed in. */
function roomCost(): number {
  const w = tuning.roomW;
  return w * (1 - territoryAt(pathX[STEPS]!, pathY[STEPS]!)) + w * 0.5 * (1 - territoryAt(pathX[STEPS >> 1]!, pathY[STEPS >> 1]!));
}

const RAMP_LOOK = [0.6, 1.2, 1.8, 2.4, 3.2, 4.0, 5.0, 6.0];

/** Would walking this way for `dist` units put the bot on a ramp? */
function stepsOntoRamp(p: Percept, hx: number, hy: number, dist: number): boolean {
  const map = MAPS[p.world.map]!;
  for (const t of RAMP_LOOK) {
    if (t > dist) break;
    if (nearRamp(map, p.x + hx * t, p.y + hy * t, 0.35)) return true;
  }
  return false;
}

/** Where the bot goes when nothing is in shooting range. */
interface Trip {
  go: boolean;
  x: number;
  y: number;
  /** How much the trip is worth (pain). */
  value: number;
}
const trip: Trip = { go: false, x: 0, y: 0, value: 0 };

/**
 * Nothing to shoot: walk to the enemies that are left, around the boxes. The bot keeps off the decks: with even one player upstairs the
 * horde's walking breaks (ground enemies jam at the foot of the ramps, and an enemy on a deck that is not the one the player stands on
 * never comes down), so a bot that finds itself on a deck takes the nearest ramp down.
 */
function planTrip(p: Percept, band: number): Trip {
  trip.go = false;
  trip.value = 0;
  if (p.layer === 1) {
    const ramps = MAPS[p.world.map]?.ramps;
    if (ramps && ramps.length > 0) {
      let best = 0;
      let bestD = 1e9;
      for (let i = 0; i < ramps.length; i++) {
        rampPoint(ramps[i]!, false);
        const d = (rampEnd.x - p.x) ** 2 + (rampEnd.y - p.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      // a little beyond the foot, so that the way there leads all the way down
      rampPoint(ramps[best]!, false, -1.8);
      trip.go = true;
      trip.x = rampEnd.x;
      trip.y = rampEnd.y;
      trip.value = 5;
      return trip;
    }
  }
  for (const e of p.enemies) {
    if (e.layer !== p.layer) continue;
    if (e.d2 > (band + 1) * (band + 1)) {
      trip.go = true;
      trip.x = e.x;
      trip.y = e.y;
      trip.value = 2;
    }
    break;
  }
  return trip;
}

export function decideMove(p: Percept, ctx: Ctx, team: TeamDecision): MoveDecision {
  // a fresh object per decision: the Bot keeps it for the ticks in between
  const out: MoveDecision = { x: 0, y: 0, dash: false };
  const w = p.world;
  const s = p.slot;
  const memo = ((ctx.mem.move as Memo | undefined) ?? (ctx.mem.move = { heading: -1 } as Memo)) as Memo;
  useNav(((ctx.mem.nav as NavState | undefined) ?? (ctx.mem.nav = new NavState())) as NavState);
  const bx = team.bias.x;
  const by = team.bias.y;
  if (p.state !== PlayerState.Alive) {
    const bl = Math.hypot(bx, by);
    if (bl > 0.05) {
      out.x = bx / Math.max(1, bl);
      out.y = by / Math.max(1, bl);
    }
    return out;
  }
  if (w.pStun[s]! > 0) return out;

  // holding the revive key next to a downed friend halves the pace and takes the dash away
  const reviving = team.revive;
  const speed = speedNow(p) * (reviving ? BALANCE.player.reviveMoveMul : 1);
  const weapon = engagement(p);
  // anticipation: how many ticks of the picture's age the bot makes up for (judgement scales it: a poor player does not)
  const lag = Math.round(ctx.skill.reactionTicks * ctx.skill.judgement);
  const plan = planTrip(p, weapon.band);
  // standing on a ramp's footprint, the walls of the plan must be the sim's (the footprint is open, only its side walls stop)
  const g = geoOf(w.map, p.layer, p.layer === 0 && nearRamp(MAPS[w.map] ?? MAPS[0]!, p.x, p.y, 0.6));
  const deck = p.layer === 1;
  const melee = weapon.melee;

  // enemies that matter: this level, close enough to reach us in the planning time
  let n = 0;
  const late = lateScale(p.wave);
  for (const e of p.enemies) {
    if (e.d2 > SEE2) break;
    if (e.layer !== p.layer && e.d2 > 25) continue;
    const typ = e.type;
    // the bot reacts to a picture that is `lag` ticks old: it moves what it sees on by what it knows of its speed
    ex[n] = e.x + e.vx * lag;
    ey[n] = e.y + e.vy * lag;
    let sp = speedOf(e);
    if (typ === T.leaper || typ === T.pouncer || typ === T.blinker) sp *= 1.7;
    // measured speed catches floor effects (swift floors, auras)
    const vm = Math.hypot(e.vx, e.vy) * 30;
    if (vm > sp) sp = Math.min(vm, sp * 2);
    if (e.boss) sp *= 1.1;
    esp[n] = sp;
    const touch = radiusOf(e) + PR + 0.15 + BALANCE.hitbox.melee + 0.15;
    etouch[n] = touch;
    const off = STAND_OFF[typ]! + (e.boss ? 3 : 0);
    eoff[n] = off;
    edps[n] = e.boss ? 6 : DPS[typ]! * late;
    ehold[n] = RANGED[typ]! ? HOLD[typ]! : 0;
    const burst = bursts(e);
    eburst[n] = burst ? 1 : 0;
    eblow[n] = e.boss ? 6 : burst ? (typ === T.exploder ? BLOW[T.exploder]! : BALANCE.elites.volatileDamage * BALANCE.enemyDamageMul * 0.1) : BLOW[typ]! * late;
    const reach = touch + Math.max(off, 1.1 + sp * 0.4, 3) + 0.2;
    erel2[n] = reach * reach;
    const fr = FIRE_RANGE[typ]!;
    efire2[n] = fr * fr;
    efire[n] = FIRE_RATE[typ]!;
    n++;
    if (n >= MAXE) break;
  }

  nBarrels = Math.min(24, p.barrels.length);
  for (let b = 0; b < nBarrels; b++) {
    brx[b] = p.barrels[b]!.x;
    bry[b] = p.barrels[b]!.y;
  }
  // nothing within shooting range: go and find the rest of the floor (up or down a ramp when they are on the other level)
  huntValue = 0;
  if (plan.go) {
    goalField(g, w.map, p.layer, plan.x, plan.y, p.tick);
    huntStart = goalDist(p.x, p.y);
    huntGX = plan.x;
    huntGY = plan.y;
    if (huntStart < 1e5) {
      huntValue = plan.value;
      huntNear = huntStart < 4.5;
      goalWaypoint(p.x, p.y);
      if (waypoint.ok) {
        const wx2 = waypoint.x - p.x;
        const wy2 = waypoint.y - p.y;
        const wl = Math.hypot(wx2, wy2) + 1e-6;
        huntUX = wx2 / wl;
        huntUY = wy2 / wl;
      } else {
        const wx2 = plan.x - p.x;
        const wy2 = plan.y - p.y;
        const wl = Math.hypot(wx2, wy2) + 1e-6;
        huntUX = wx2 / wl;
        huntUY = wy2 / wl;
      }
    }
  }
  // goals: pickups, the team's pull, the middle of the arena when nothing is around
  goalN = 0;
  if (n < 14) {
    for (const k of p.pickups) {
      if ((k.layer ?? 0) !== p.layer) continue;
      const dx = k.x - p.x;
      const dy = k.y - p.y;
      const kd2 = dx * dx + dy * dy;
      // too far to bother; and one the bot stands on is one it cannot take
      if (kd2 > 45 * 45 || kd2 < 1.44) continue;
      const v = pickupValue(p, k.type, k.data);
      if (v > 0) addGoal(k.x, k.y, v, p.x, p.y);
    }
  }
  if (reviving) {
    // standing at a downed friend with the key held: stay with them unless the danger says otherwise
    for (const a of p.allies) {
      if (a.state !== PlayerState.Downed) continue;
      const dx = a.x - p.x;
      const dy = a.y - p.y;
      if (dx * dx + dy * dy < 9) addGoal(a.x, a.y, 4, p.x, p.y);
    }
  }
  const bl = Math.hypot(bx, by);
  if (bl > 0.05) addGoal(p.x + (bx / bl) * 12, p.y + (by / bl) * 12, 1.4 * Math.min(1, bl), p.x, p.y);
  if (n === 0 && (p.x * p.x) / (ARENA_HALF_W * ARENA_HALF_W) + (p.y * p.y) / (ARENA_HALF_H * ARENA_HALF_H) > 0.25) addGoal(0, 0, 0.6, p.x, p.y);

  const iframes = w.pIFrames[s]!;
  const dashReady = w.pDashCd[s]! <= 0 && w.pDash[s]! === 0 && !reviving;
  const reach = speed * HORIZON;
  const gscale = 0.3 + 0.7 * ctx.skill.dodge;
  // hurt, the bot weighs every danger more: below 70% health the price of a blow goes up to double
  const risk = 1 + 1.6 * Math.max(0, 0.7 - p.hp / Math.max(1, p.maxHp));
  focusBoxes(g, p.x, p.y, 36);
  // the room field sees the whole crowd, the rollouts the nearest few; it is kept for a few ticks
  if (!fieldFresh(g, w.map, p.layer, p.tick, p.x, p.y, FIELD_AGE)) {
    let nf = 0;
    for (const e of p.enemies) {
      if (e.d2 > FIELD2) break;
      if (e.layer !== p.layer && e.d2 > 25) continue;
      fx[nf] = e.x;
      fy[nf] = e.y;
      nf++;
    }
    computeField(g, w.map, p.layer, p.x, p.y, speed, nf, fx, fy, 0.3, p.tick);
  }
  // on the ground the ramps stay off limits: the sim would let the bot walk up them (see geoOf), the plan only treats them as walls
  const rampsMatter = p.layer === 0 && !!MAPS[w.map]?.ramps && !nearRamp(MAPS[w.map]!, p.x, p.y, 0.2);
  // on a trip the walking field leads (the straight line to the enemies does not see the walls in between)
  const band = huntValue > 0 ? 1e9 : weapon.band;
  const last = memo.heading;

  // plain headings
  let bestK = -1;
  let bestCost = 1e18;
  for (let k = 0; k < DIRS; k++) {
    focusRay(p.x, p.y, DIR_X[k]!, DIR_Y[k]!, reach + 6, 5);
    let c = rollout(p, g, deck, n, DIR_X[k]!, DIR_Y[k]!, speed, false, iframes, band, weapon.near, melee);
    const ramp = rampsMatter && stepsOntoRamp(p, DIR_X[k]!, DIR_Y[k]!, 2.4) ? 40 : 0;
    const room = roomCost();
    c += ramp + groundCost(p, iframes, false, lag) * gscale + room;
    c *= risk;
    if (last >= 0) {
      // keep a course: turning around has to buy a clearly cheaper way out
      const turn = Math.abs(wrapAngle(((k - last) / DIRS) * Math.PI * 2)) / Math.PI;
      c = c * (1 + tuning.turnPenalty * turn) + 0.15 * turn;
    }
    const gain = goalGain(p.x, p.y, reach);
    c -= gain;
    if (c < bestCost) {
      bestCost = c;
      bestK = k;
    }
  }
  const bestPlain = bestCost;
  let dash = false;
  // dashes: only worth testing when plain running still costs something
  if (dashReady && bestPlain > 0.7 && ctx.skill.dodge >= 0.4) {
    let bestDashK = -1;
    let bestDash = 1e18;
    for (let k = 0; k < DIRS; k += DASH_EVERY) {
      focusRay(p.x, p.y, DIR_X[k]!, DIR_Y[k]!, reach + 6, 5);
      let c = rollout(p, g, deck, n, DIR_X[k]!, DIR_Y[k]!, speed, true, iframes, band, weapon.near, melee);
      if (rampsMatter && stepsOntoRamp(p, DIR_X[k]!, DIR_Y[k]!, 6)) c += 40;
      c += groundCost(p, iframes, true, lag) * gscale + roomCost();
      c = c * risk + tuning.dashCost;
      c -= goalGain(p.x, p.y, reach);
      if (c < bestDash) {
        bestDash = c;
        bestDashK = k;
      }
    }
    if (bestDash + 0.25 < bestPlain && bestDashK >= 0) {
      dash = true;
      bestK = bestDashK;
    }
  }
  if (bestK < 0) return out;
  memo.heading = bestK;
  out.x = DIR_X[bestK]!;
  out.y = DIR_Y[bestK]!;
  out.dash = dash;
  if (n === 0 && goalN === 0 && huntValue === 0) {
    out.x = 0;
    out.y = 0;
  }
  return out;
}
