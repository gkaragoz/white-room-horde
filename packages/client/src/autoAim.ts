import { BALANCE, EnemyState, MAX_BARRELS, MAX_ENEMIES, MAX_PLAYERS, TICK_DT, WEAPON_IDS } from '@wrh/shared';
import { lineClear, type World } from '@wrh/sim';

/** What the auto-aim is locked on: an enemy (kind 0) or an explosive barrel (kind 1). */
export interface AimTarget {
  kind: 0 | 1;
  id: number;
  x: number;
  y: number;
}

/** A new target has to be this much closer than the one we are on before we let go of it (no flicker between two equals). */
const STICKY = 0.8;
/** Targets farther than the weapon's range times this are ignored. */
const REACH = 1.25;
/** How many nearer targets hidden behind cover are skipped before giving up. */
const MAX_HIDDEN = 8;

const reject = new Uint8Array(MAX_ENEMIES + MAX_BARRELS);

function position(w: World, kind: 0 | 1, id: number): { x: number; y: number } {
  return kind === 0 ? { x: w.eX[id]!, y: w.eY[id]! } : { x: w.brX[id]!, y: w.brY[id]! };
}

/**
 * The nearest enemy or barrel the player can actually shoot: within reach of the weapon in the hands and not hidden
 * behind cover (a wall in the way would just eat the bullets). Barrels inside their blast of the shooter are skipped:
 * shooting one at your feet would hurt you. Null when there is nothing (then the character keeps looking where it was).
 */
export function pickTarget(w: World, slot: number, prev: AimTarget | null): AimTarget | null {
  if (!w.pActive[slot]) return null;
  const px = w.pX[slot]!;
  const py = w.pY[slot]!;
  const range = BALANCE.weapons[WEAPON_IDS[w.pWeapon[slot]!]!]!.range * REACH;
  const limit = range * range;
  const safe = BALANCE.barrels.radius + 1.2;
  reject.fill(0);
  let best: AimTarget | null = null;
  for (let attempt = 0; attempt <= MAX_HIDDEN; attempt++) {
    let cand: AimTarget | null = null;
    let candD = limit;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (!w.eActive[i] || w.eState[i] === EnemyState.Spawn || reject[i]) continue;
      const dx = w.eX[i]! - px;
      const dy = w.eY[i]! - py;
      const d = dx * dx + dy * dy;
      if (d < candD) {
        candD = d;
        cand = { kind: 0, id: i, x: w.eX[i]!, y: w.eY[i]! };
      }
    }
    for (let b = 0; b < MAX_BARRELS; b++) {
      if (!w.brActive[b] || reject[MAX_ENEMIES + b]) continue;
      const dx = w.brX[b]! - px;
      const dy = w.brY[b]! - py;
      const d = dx * dx + dy * dy;
      if (d < safe * safe) continue;
      if (d < candD) {
        candD = d;
        cand = { kind: 1, id: b, x: w.brX[b]!, y: w.brY[b]! };
      }
    }
    if (!cand) break;
    if (lineClear(w, px, py, cand.x, cand.y)) {
      best = cand;
      break;
    }
    reject[cand.kind === 0 ? cand.id : MAX_ENEMIES + cand.id] = 1;
  }
  if (!best || !prev || (prev.kind === best.kind && prev.id === best.id)) return best;
  // stay on the current target unless something else is clearly nearer
  const alive = prev.kind === 0 ? !!w.eActive[prev.id] && w.eState[prev.id] !== EnemyState.Spawn : !!w.brActive[prev.id];
  if (!alive) return best;
  const p = position(w, prev.kind, prev.id);
  const dpx = p.x - px;
  const dpy = p.y - py;
  const dp = dpx * dpx + dpy * dpy;
  const db = (best.x - px) ** 2 + (best.y - py) ** 2;
  if (dp <= limit && lineClear(w, px, py, p.x, p.y) && db > dp * STICKY * STICKY) return { kind: prev.kind, id: prev.id, x: p.x, y: p.y };
  return best;
}

/** Angle from the player to a target (sim axes). */
export function angleTo(w: World, slot: number, t: AimTarget): number {
  return Math.atan2(t.y - w.pY[slot]!, t.x - w.pX[slot]!);
}

/**
 * Works out the shot direction that really hits: from where the muzzle will be (not from the player's middle: the barrel
 * sits ahead and to the right), at where a moving target will be when the bullet and the delay of the input have
 * passed. Speeds come from the position change between two simulation ticks.
 */
export class AimSolver {
  private tick = -1;
  private readonly ex = new Float64Array(MAX_ENEMIES);
  private readonly ey = new Float64Array(MAX_ENEMIES);
  private readonly evx = new Float64Array(MAX_ENEMIES);
  private readonly evy = new Float64Array(MAX_ENEMIES);
  private readonly was = new Uint8Array(MAX_ENEMIES);
  private readonly px = new Float64Array(MAX_PLAYERS);
  private readonly py = new Float64Array(MAX_PLAYERS);
  private readonly pvx = new Float64Array(MAX_PLAYERS);
  private readonly pvy = new Float64Array(MAX_PLAYERS);

  /** Call whenever the world may have moved on; does nothing within the same tick. */
  track(w: World): void {
    if (w.tick === this.tick) return;
    const dt = Math.max(1, w.tick - this.tick) * TICK_DT;
    const first = this.tick < 0 || w.tick < this.tick;
    this.tick = w.tick;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const on = w.eActive[i] === 1;
      if (on && this.was[i] && !first) {
        const dx = w.eX[i]! - this.ex[i]!;
        const dy = w.eY[i]! - this.ey[i]!;
        // a slot that was refilled, or a blast that threw the body, is not a speed
        const far = dx * dx + dy * dy > 9;
        this.evx[i] = far ? 0 : dx / dt;
        this.evy[i] = far ? 0 : dy / dt;
      } else {
        this.evx[i] = 0;
        this.evy[i] = 0;
      }
      this.ex[i] = w.eX[i]!;
      this.ey[i] = w.eY[i]!;
      this.was[i] = on ? 1 : 0;
    }
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (first) {
        this.pvx[s] = this.pvy[s] = 0;
      } else {
        const dx = w.pX[s]! - this.px[s]!;
        const dy = w.pY[s]! - this.py[s]!;
        const far = dx * dx + dy * dy > 9;
        this.pvx[s] = far ? 0 : dx / dt;
        this.pvy[s] = far ? 0 : dy / dt;
      }
      this.px[s] = w.pX[s]!;
      this.py[s] = w.pY[s]!;
    }
  }

  /** The shot angle for `target`; `delayTicks` is how long the input takes to reach the simulation. */
  angle(w: World, slot: number, t: AimTarget, delayTicks: number): number {
    const st = BALANCE.weapons[WEAPON_IDS[w.pWeapon[slot]!]!]!;
    const delay = Math.max(0, delayTicks) * TICK_DT;
    const pvx = this.pvx[slot]!;
    const pvy = this.pvy[slot]!;
    const tvx = t.kind === 0 ? this.evx[t.id]! : 0;
    const tvy = t.kind === 0 ? this.evy[t.id]! : 0;
    const Px = w.pX[slot]! + pvx * delay;
    const Py = w.pY[slot]! + pvy * delay;
    const tx = t.x + tvx * delay;
    const ty = t.y + tvy * delay;
    let a = Math.atan2(ty - Py, tx - Px);
    if (Math.hypot(tx - Px, ty - Py) <= st.muzzleFwd + 0.3) return a; // closer than the muzzle: the sweep from the shooter hits it
    for (let k = 0; k < 4; k++) {
      const mx = Px + Math.cos(a) * st.muzzleFwd + Math.sin(a) * st.muzzleSide;
      const my = Py + Math.sin(a) * st.muzzleFwd - Math.cos(a) * st.muzzleSide;
      const flight = Math.hypot(tx - mx, ty - my) / st.bulletSpeed;
      a = Math.atan2(ty + tvy * flight - my, tx + tvx * flight - mx);
    }
    return a;
  }
}
