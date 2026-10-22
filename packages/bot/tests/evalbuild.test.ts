import { appendFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { buildMode, type Skill } from '../src';
import { applyTune } from '../src/strategy/tune';
import { playBuildGame } from '../src/eval-build';

/**
 * Focused evaluation of the build strategy: fixed-length games, same seeds, same movement and combat, only the build module differs.
 *
 *   MEASURE_BUILD=1 STRAT=baseline|new GOD=0|1 BOTS=4 SKILL=expert MINUTES=8 RUNS=8 OUT=file pnpm --filter @wrh/bot exec vitest run tests/evalbuild.test.ts
 *
 * One JSON line per game is appended to OUT.
 */
describe.skipIf(process.env.MEASURE_BUILD !== '1')('build evaluation', () => {
  it('plays the games', () => {
    buildMode.baseline = process.env.STRAT === 'baseline';
    buildMode.noCards = process.env.STRAT === 'nocards';
    buildMode.noWeapons = process.env.STRAT === 'noweapons';
    buildMode.noDrones = process.env.STRAT === 'nodrones';
    buildMode.weaponRank = process.env.STRAT === 'wrank';
    applyTune(process.env.TUNE);
    const runs = Number(process.env.RUNS ?? 8);
    const first = Number(process.env.FIRST ?? 0);
    for (let i = first; i < first + runs; i++) {
      const r = playBuildGame({ seed: 2000 + i, bots: Number(process.env.BOTS ?? 4), skill: (process.env.SKILL ?? 'expert') as Skill, ticks: 30 * 60 * Number(process.env.MINUTES ?? 8), god: process.env.GOD === '1' });
      appendFileSync(process.env.OUT ?? 'build-eval.jsonl', JSON.stringify({ strat: process.env.STRAT, god: process.env.GOD === '1', bots: process.env.BOTS ?? '4', skill: process.env.SKILL ?? 'expert', ...r }) + '\n');
    }
  }, 7_200_000);
});
