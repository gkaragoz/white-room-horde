import { WEAPON_IDS, levelFromXp, xpForLevel, MAX_LEVEL, XP_REFERENCE_RUN, type PlayerInput } from '@wrh/shared';
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { createGame, runScore, step } from '../src';
import { botInput } from './bot';

/**
 * Measurement, not a test: how far the bot gets and what a run is worth in XP at each meta level (docs/wayfinder/meta-progression/balance.md).
 * Skipped unless MEASURE=1:
 *
 *   MEASURE=1 pnpm --filter @wrh/sim exec vitest run tests/meta-balance.test.ts
 *   RUNS=40 LEVELS=1,10,60,100 MEASURE_OUT=out.txt MEASURE=1 ...    to change the sample and where the table goes
 */
const RUNS = Number(process.env.RUNS ?? 20);
const LEVELS = (process.env.LEVELS ?? '1,3,5,10,20,30,45,60,80,100').split(',').map(Number);
const MAX_TICKS = 30 * 60 * 14;
const MET = (1 << WEAPON_IDS.indexOf('pistol')) | (1 << WEAPON_IDS.indexOf('smg'));

function run(seed: number, level: number): { floor: number; seconds: number; xp: number } {
  const w = createGame({ seed, level, players: [{ slot: 0, weapon: 'pistol', cls: 0, metWeapons: MET, metDrones: 0 }] });
  while (!w.gameOver && w.tick < MAX_TICKS) {
    const inputs: PlayerInput[] = [botInput(w, 0)];
    step(w, inputs);
  }
  const seconds = w.tick / 30;
  return { floor: w.wave, seconds, xp: seconds >= 15 ? Math.round(runScore(w).final / 10) : 0 };
}

const lines: string[] = [];
const say = (text: string): void => {
  lines.push(text);
};

const median = (v: number[]): number => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;
const p90 = (v: number[]): number => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * 0.9))]!;

describe.skipIf(process.env.MEASURE !== '1')('meta balance measurement', () => {
  it('prints the bot floor and XP per run at each level', () => {
    const rows: { level: number; floor: number; floor90: number; seconds: number; xp: number; xp90: number }[] = [];
    for (const level of LEVELS) {
      const runs = Array.from({ length: RUNS }, (_, i) => run(1000 + i, level));
      rows.push({
        level,
        floor: median(runs.map((r) => r.floor)),
        floor90: p90(runs.map((r) => r.floor)),
        seconds: Math.round(median(runs.map((r) => r.seconds))),
        xp: median(runs.map((r) => r.xp)),
        xp90: p90(runs.map((r) => r.xp)),
      });
    }
    say(`bot, solo, ${RUNS} runs per level, ${MAX_TICKS / 1800} minute cap`);
    say('level  floor(med/p90)  seconds  XP(med)  XP(p90)  runs to next level (at median XP)');
    for (const r of rows) {
      const step = Math.min(xpForLevel(Math.min(MAX_LEVEL, r.level + 1)) - xpForLevel(r.level), XP_REFERENCE_RUN * 2);
      say(`${String(r.level).padStart(5)}  ${String(r.floor).padStart(3)}/${String(r.floor90).padEnd(3)}        ${String(r.seconds).padStart(5)}  ${String(r.xp).padStart(7)}  ${String(r.xp90).padStart(7)}  ${(step / Math.max(1, r.xp)).toFixed(2)}`);
    }
    // the climb: runs needed from level 1 to 100 when a run is worth the median XP of the level the player is at (interpolated between measured levels)
    const at = (level: number): number => {
      const lo = [...rows].reverse().find((r) => r.level <= level) ?? rows[0]!;
      const hi = rows.find((r) => r.level >= level) ?? rows[rows.length - 1]!;
      if (lo.level === hi.level) return lo.xp;
      return lo.xp + ((hi.xp - lo.xp) * (level - lo.level)) / (hi.level - lo.level);
    };
    for (const mult of [1, 1.5, 2]) {
      let xp = 0;
      let runs = 0;
      while (levelFromXp(xp) < MAX_LEVEL && runs < 2000) {
        xp += at(levelFromXp(xp)) * mult;
        runs++;
      }
      say(`climb to level 100 with a player worth ${mult}x the bot: ${runs} runs`);
    }
    for (const target of [3, 20, 60]) {
      let xp = 0;
      let runs = 0;
      while (runs < target) {
        xp += at(levelFromXp(xp)) * 1.5;
        runs++;
      }
      say(`level after ${target} runs at 1.5x the bot: ${levelFromXp(xp)}`);
    }
    writeFileSync(process.env.MEASURE_OUT ?? 'meta-balance.txt', lines.join(String.fromCharCode(10)) + String.fromCharCode(10));
  }, 3_600_000);
});
