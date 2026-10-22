import { writeFileSync } from 'node:fs';
import { describe, it, vi } from 'vitest';
import type { Skill } from '../src';
import { playTeamGame, type TeamStats } from './teamEval';

// TEAM=baseline plays with the skeleton's team module instead of the companion one (for the before/after comparison)
vi.mock('../src/team', async (orig) => {
  if (process.env.TEAM === 'baseline') return { decideTeam: (await import('./baselineTeam')).decideTeam };
  return orig();
});

/**
 * Focused team evaluation, skipped unless MEASURE=1:
 *   MEASURE=1 TEAM=baseline RUNS=20 MEASURE_OUT=base.txt pnpm --filter @wrh/bot exec vitest run tests/team.eval.test.ts
 *   MEASURE=1 RUNS=20 MEASURE_OUT=team.txt ...
 * Rows: 3 bots + a stand-in human, 4 bots (no human), at the given skills. Seeds are 3000 + i.
 */
const RUNS = Number(process.env.RUNS ?? 12);
const SKILL_LIST = (process.env.SKILLS ?? 'expert').split(',') as Skill[];
const MINUTES = Number(process.env.MINUTES ?? 10);
const MODES = (process.env.MODES ?? 'human,bots').split(',');

const mean = (v: number[]): number => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const med = (v: number[]): number => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0;
const f = (x: number, n = 1): string => x.toFixed(n);

describe.skipIf(process.env.MEASURE !== '1')('team evaluation', () => {
  it('prints downs, revives, waits and floors', () => {
    const nl = String.fromCharCode(10);
    const lines = [`TEAM=${process.env.TEAM ?? 'companion'} level 100, ${RUNS} games per row, cap ${MINUTES} min`, 'mode   skill       floor(med/mean)  downs  revives  bleeds  carried  wait(s)  humanDowns  humanWait  humanDmg  inBand  dist  alive  capped'];
    for (const mode of MODES) {
      for (const skill of SKILL_LIST) {
        const rows: TeamStats[] = [];
        for (let i = 0; i < RUNS; i++) rows.push(playTeamGame({ seed: 3000 + i, skill, bots: mode === 'human' ? 3 : 3, human: mode === 'human', maxTicks: 30 * 60 * MINUTES }));
        const col = (k: keyof TeamStats): number[] => rows.map((r) => Number(r[k]));
        lines.push(
          `${mode.padEnd(6)} ${skill.padEnd(10)}  ${String(med(col('floor'))).padStart(5)}/${f(mean(col('floor'))).padEnd(6)}  ${f(mean(col('downs'))).padStart(5)}  ${f(mean(col('revives'))).padStart(7)}  ${f(mean(col('bleeds'))).padStart(6)}  ${f(mean(col('carried'))).padStart(7)}  ${f(mean(col('wait'))).padStart(7)}  ${f(mean(col('humanDowns'))).padStart(10)}  ${f(mean(col('humanWait'))).padStart(9)}  ${f(mean(col('humanDamage')), 0).padStart(8)}  ${f(mean(col('inBand')), 2).padStart(6)}  ${f(mean(col('meanDist'))).padStart(4)}  ${f(mean(col('alive'))).padStart(5)}  ${f(mean(col('capped')) * 100, 0)}%`,
        );
      }
    }
    writeFileSync(process.env.MEASURE_OUT ?? 'team-eval.txt', lines.join(nl) + nl);
  }, 7_200_000);
});
