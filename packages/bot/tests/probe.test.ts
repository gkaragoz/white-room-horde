import { appendFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { playGame, type Skill } from '../src';

/**
 * A quick look at single games, for tuning. Skipped unless PROBE=1. Lines go to PROBE_OUT when set.
 *
 *   PROBE=1 BOTS=1 SKILL=expert MAP=0 SEEDS=2000,2001 MINUTES=6 PROBE_OUT=probe.txt pnpm --filter @wrh/bot exec vitest run tests/probe.test.ts
 */
describe.skipIf(process.env.PROBE !== '1')('bot probe', () => {
  it('plays the listed seeds and prints one line each', () => {
    const bots = Number(process.env.BOTS ?? 1);
    const skill = (process.env.SKILL ?? 'expert') as Skill;
    const map = Number(process.env.MAP ?? 0);
    const minutes = Number(process.env.MINUTES ?? 6);
    const seeds = (process.env.SEEDS ?? '2000,2001,2002,2003').split(',').map(Number);
    for (const seed of seeds) {
      const t0 = Date.now();
      const r = playGame({ seed, bots, skill, map, maxTicks: 30 * 60 * minutes });
      const line = `seed ${seed} map ${map} bots ${bots} ${skill}: floor ${r.floor} ${r.seconds.toFixed(0)}s kills ${r.kills} alive ${r.alive} ${r.capped ? 'CAPPED' : ''} wall ${((Date.now() - t0) / 1000).toFixed(1)}s`;
      if (process.env.PROBE_OUT) appendFileSync(process.env.PROBE_OUT, line + '\n');
    }
  }, 3_600_000);
});
