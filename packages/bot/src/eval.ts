import { MAX_LEVEL, type PlayerInput } from '@wrh/shared';
import { createGame, runScore, step } from '@wrh/sim';
import { botLoadouts, Squad } from './squad';
import type { Skill } from './types';

/** One benchmark game: a squad of bots against the horde, nobody else. */
export interface GameOptions {
  seed: number;
  /** Bots in the squad (1..11). */
  bots: number;
  skill: Skill;
  /** Meta level the room plays at (default: the full game). */
  level?: number;
  map?: number;
  mods?: number;
  /** Stop after this many ticks (default 20 minutes). */
  maxTicks?: number;
}

export interface GameResult {
  seed: number;
  floor: number;
  ticks: number;
  seconds: number;
  kills: number;
  score: number;
  /** Squad members still standing when the game ended (all dead = 0; the time cap leaves survivors). */
  alive: number;
  /** True when the time cap ended the game rather than a wipe. */
  capped: boolean;
}

/** Play one game to the end (a wipe or the time cap). */
export function playGame(o: GameOptions): GameResult {
  const loads = botLoadouts(Array.from({ length: o.bots }, (_, i) => i), o.bots, o.seed);
  const w = createGame({ seed: o.seed, level: o.level ?? MAX_LEVEL, map: o.map ?? 0, mods: o.mods ?? 0, players: loads.map((l) => ({ slot: l.slot, weapon: l.weapon, cls: l.cls })) });
  const squad = new Squad(loads.map((l) => l.slot), o.skill, o.seed);
  const maxTicks = o.maxTicks ?? 30 * 60 * 20;
  const inputs: (PlayerInput | undefined)[] = [];
  while (!w.gameOver && w.tick < maxTicks) {
    inputs.length = 0;
    for (const [slot, input] of squad.inputs(w)) inputs[slot] = input;
    step(w, inputs);
  }
  let alive = 0;
  for (const l of loads) if (w.pState[l.slot] === 0) alive++;
  return { seed: o.seed, floor: w.wave, ticks: w.tick, seconds: w.tick / 30, kills: w.kills, score: runScore(w).final, alive, capped: !w.gameOver };
}

export interface Report {
  options: Omit<GameOptions, 'seed'>;
  runs: number;
  floor: { median: number; p10: number; p90: number; mean: number };
  seconds: { median: number };
  kills: { median: number };
  score: { median: number };
  /** Share of games that hit the time cap alive. */
  capped: number;
}

const sorted = (v: number[]): number[] => [...v].sort((a, b) => a - b);
const at = (v: number[], q: number): number => sorted(v)[Math.min(v.length - 1, Math.floor(v.length * q))]!;

/** Play `seeds` games with the same options and summarise them. */
export function evaluate(o: Omit<GameOptions, 'seed'>, seeds: readonly number[]): { report: Report; results: GameResult[] } {
  const results = seeds.map((seed) => playGame({ ...o, seed }));
  const floors = results.map((r) => r.floor);
  return {
    results,
    report: {
      options: o,
      runs: results.length,
      floor: { median: at(floors, 0.5), p10: at(floors, 0.1), p90: at(floors, 0.9), mean: floors.reduce((a, b) => a + b, 0) / Math.max(1, floors.length) },
      seconds: { median: at(results.map((r) => r.seconds), 0.5) },
      kills: { median: at(results.map((r) => r.kills), 0.5) },
      score: { median: at(results.map((r) => r.score), 0.5) },
      capped: results.filter((r) => r.capped).length / Math.max(1, results.length),
    },
  };
}
