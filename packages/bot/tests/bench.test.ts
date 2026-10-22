import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { SKILLS, evaluate, type Skill } from '../src';

/**
 * The benchmark: how far squads of bots get on the full game (level 100). Skipped unless MEASURE=1.
 *
 *   MEASURE=1 pnpm --filter @wrh/bot exec vitest run tests/bench.test.ts
 *   BOTS=1,4 SKILLS=expert,superhuman RUNS=20 MAPS=0,3 MEASURE_OUT=out.txt MEASURE=1 ...
 *
 * The table goes to MEASURE_OUT (default bench.txt). Compare runs on the same seeds: they are 2000 + i.
 */
const RUNS = Number(process.env.RUNS ?? 12);
const BOTS = (process.env.BOTS ?? '1,4').split(',').map(Number);
const LIST = (process.env.SKILLS ?? SKILLS.join(',')).split(',') as Skill[];
const MAPS = (process.env.MAPS ?? '0').split(',').map(Number);
const MAX_MIN = Number(process.env.MINUTES ?? 20);

describe.skipIf(process.env.MEASURE !== '1')('bot benchmark', () => {
  it('prints floor, time and kills per squad size and skill', () => {
    const lines = [`level 100, ${RUNS} games per row, cap ${MAX_MIN} min`, 'bots  skill       map  floor(p10/med/p90)  minutes  kills  capped'];
    for (const map of MAPS) {
      for (const bots of BOTS) {
        for (const skill of LIST) {
          const { report, results } = evaluate({ bots, skill, map, maxTicks: 30 * 60 * MAX_MIN }, Array.from({ length: RUNS }, (_, i) => 2000 + i));
          lines.push(`${String(bots).padStart(4)}  ${skill.padEnd(10)}  ${String(map).padStart(3)}  ${String(report.floor.p10).padStart(4)}/${String(report.floor.median).padStart(3)}/${String(report.floor.p90).padEnd(3)}        ${(report.seconds.median / 60).toFixed(1).padStart(6)}  ${String(report.kills.median).padStart(5)}  ${(report.capped * 100).toFixed(0)}%`);
          if (process.env.PER_SEED === '1') lines.push('        ' + results.map((r) => `${r.seed}:f${r.floor}${r.capped ? 'c' : 'x'}`).join(' '));
        }
      }
    }
    writeFileSync(process.env.MEASURE_OUT ?? 'bench.txt', lines.join(String.fromCharCode(10)) + String.fromCharCode(10));
  }, 7_200_000);
});
