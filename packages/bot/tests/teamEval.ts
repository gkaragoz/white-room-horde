import { Buttons, MAX_LEVEL, PlayerState, type PlayerInput } from '@wrh/shared';
import { createGame, runScore, step } from '@wrh/sim';
import { botLoadouts, Squad, type Skill } from '../src';
import { perceive, radToAim, sanitize } from '../src/perception';
import type { Memory } from '../src/types';

/**
 * Focused evaluation of the team behaviour: a squad of bots plays with one stand-in for a human (slot 0). The stand-in is a plain
 * kiter that shoots the nearest enemy and kneels beside a friend only when it happens to be next to one; it never uses team code.
 */
export interface TeamGame {
  seed: number;
  skill: Skill;
  /** Bots next to the human stand-in (0 = a squad of bots only; the human slot is then a bot as well). */
  bots: number;
  human: boolean;
  maxTicks: number;
  level?: number;
}

export interface TeamStats {
  floor: number;
  seconds: number;
  downs: number;
  revives: number;
  bleeds: number;
  /** Downs nobody resolved before the next floor lifted everybody. */
  carried: number;
  /** Mean seconds a downed friend waited for a revive (bleed outs and floor lifts count with the time they lasted). */
  wait: number;
  /** Same for the human stand-in only. */
  humanDowns: number;
  humanWait: number;
  humanDamage: number;
  /** Share of ticks the bots stood within 3..16 units of the human (alive, in the fight). */
  inBand: number;
  /** Mean distance of bots to the human. */
  meanDist: number;
  alive: number;
  capped: boolean;
  score: number;
}

function humanInput(w: Parameters<typeof perceive>[0], slot: number, mem: Memory): PlayerInput {
  const p = perceive(w, slot, mem);
  let fx = 0;
  let fy = 0;
  let near = 0;
  for (const e of p.enemies) {
    if (e.d2 >= 144) break;
    const d = Math.sqrt(e.d2) + 0.5;
    fx -= (e.x - p.x) / (d * d);
    fy -= (e.y - p.y) / (d * d);
    near++;
  }
  const wx = Math.abs(p.x) / 52;
  const wy = Math.abs(p.y) / 35;
  if (wx > 0.75) fx -= Math.sign(p.x) * (wx - 0.75) * 8;
  if (wy > 0.7) fy -= Math.sign(p.y) * (wy - 0.7) * 8;
  for (const t of p.telegraphs) {
    const dx = p.x - t.x;
    const dy = p.y - t.y;
    const r = (t.shape === 0 ? t.w : Math.max(t.w, t.l)) + 2;
    const d = Math.hypot(dx, dy);
    if (d < r) {
      fx += (dx / (d + 0.1)) * 6;
      fy += (dy / (d + 0.1)) * 6;
    }
  }
  let buttons = 0;
  let aim = p.angle;
  const first = p.enemies[0];
  if (first) {
    aim = Math.atan2(first.y - p.y, first.x - p.x);
    buttons |= Buttons.Fire;
  }
  if (p.mag === 0) buttons |= Buttons.Reload;
  // walk to a downed friend when it is calm, and hold revive beside one
  for (const a of p.allies) {
    if (a.state !== PlayerState.Downed) continue;
    const dx = a.x - p.x;
    const dy = a.y - p.y;
    const d = Math.hypot(dx, dy);
    if (near < 3 && d < 14) {
      fx += (dx / (d + 0.1)) * 1.2;
      fy += (dy / (d + 0.1)) * 1.2;
    }
    if (d < 1.4) buttons |= Buttons.Revive;
  }
  const len = Math.hypot(fx, fy);
  const k = len > 0.05 ? 1 / Math.max(len, 1) : 0;
  return sanitize({ moveX: fx * k * 127, moveY: fy * k * 127, aim: radToAim(aim), buttons, aimDist: 0 });
}

export function playTeamGame(o: TeamGame): TeamStats {
  const total = o.bots + 1;
  const loads = botLoadouts(Array.from({ length: total }, (_, i) => i), total, o.seed);
  const players = loads.map((l) => ({ slot: l.slot, weapon: l.weapon, cls: l.cls }));
  const w = createGame({ seed: o.seed, level: o.level ?? MAX_LEVEL, map: 0, mods: 0, players });
  const humans = new Set<number>(o.human ? [0] : []);
  const botSlots = loads.map((l) => l.slot).filter((s) => !humans.has(s));
  const squad = new Squad(botSlots, o.skill, o.seed, humans);
  const hmem: Memory = {};
  const inputs: (PlayerInput | undefined)[] = [];
  const downAt = new Map<number, number>();
  const waits: number[] = [];
  const humanWaits: number[] = [];
  let downs = 0;
  let revives = 0;
  let bleeds = 0;
  let carried = 0;
  let humanDowns = 0;
  let humanDamage = 0;
  let lastHp = w.pHp[0]!;
  let inBand = 0;
  let bandN = 0;
  let distSum = 0;
  while (!w.gameOver && w.tick < o.maxTicks) {
    inputs.length = 0;
    for (const [slot, input] of squad.inputs(w)) inputs[slot] = input;
    if (o.human) inputs[0] = humanInput(w, 0, hmem);
    step(w, inputs);
    for (const ev of w.events) {
      if (ev.type === 'playerDown') {
        downs++;
        downAt.set(ev.slot, w.tick);
        if (ev.slot === 0 && o.human) humanDowns++;
      } else if (ev.type === 'playerRevive' || ev.type === 'playerDead') {
        const t0 = downAt.get(ev.slot);
        if (t0 !== undefined) {
          const wt = (w.tick - t0) / 30;
          waits.push(wt);
          if (ev.slot === 0 && o.human) humanWaits.push(wt);
          downAt.delete(ev.slot);
        }
        if (ev.type === 'playerRevive') revives++;
        else bleeds++;
      }
    }
    if (o.human) {
      if (w.pState[0] === PlayerState.Alive) {
        if (w.pHp[0]! < lastHp) humanDamage += lastHp - w.pHp[0]!;
        // the fight only
        if (w.misc[4] === 0) {
          for (const s of botSlots) {
            if (w.pState[s] !== PlayerState.Alive) continue;
            const d = Math.hypot(w.pX[s]! - w.pX[0]!, w.pY[s]! - w.pY[0]!);
            bandN++;
            distSum += d;
            if (d >= 3 && d <= 16) inBand++;
          }
        }
      }
      lastHp = w.pHp[0]!;
    }
    // a new floor revives everybody: forget the open downs
    if (w.events.some((e) => e.type === 'floorEnter')) {
      for (const [slot, t0] of downAt) {
        const wt = (w.tick - t0) / 30;
        waits.push(wt);
        if (slot === 0 && o.human) humanWaits.push(wt);
        carried++;
      }
      downAt.clear();
    }
  }
  let alive = 0;
  for (const l of loads) if (w.pState[l.slot] === PlayerState.Alive) alive++;
  const mean = (v: number[]): number => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
  return {
    floor: w.wave,
    seconds: w.tick / 30,
    downs,
    revives,
    bleeds,
    carried,
    wait: mean(waits),
    humanDowns,
    humanWait: mean(humanWaits),
    humanDamage,
    inBand: bandN ? inBand / bandN : 0,
    meanDist: bandN ? distSum / bandN : 0,
    alive,
    capped: !w.gameOver,
    score: runScore(w).final,
  };
}
