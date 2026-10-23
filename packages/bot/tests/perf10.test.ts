import { appendFileSync } from 'node:fs';
import { MAX_LEVEL } from '@wrh/shared';
import { createGame, step } from '@wrh/sim';
import { describe, it } from 'vitest';
import { Squad, botLoadouts, type Skill } from '../src';
import { perceive } from '../src/perception';

/**
 * What a squad of bots costs per tick next to the simulation itself. Skipped unless PERF10=1.
 *   PERF10=1 BOTS=10 SKILL=superhuman TICKS=5400 PERF_OUT=perf10.txt pnpm --filter @wrh/bot exec vitest run tests/perf10.test.ts
 */
describe.skipIf(process.env.PERF10 !== '1')('squad cost', () => {
  it('measures', () => {
    const bots = Number(process.env.BOTS ?? 10);
    const skill = (process.env.SKILL ?? 'superhuman') as Skill;
    const seed = Number(process.env.SEED ?? 2000);
    const ticks = Number(process.env.TICKS ?? 5400);
    const loads = botLoadouts(Array.from({ length: bots }, (_, i) => i), bots, seed);
    const w = createGame({ seed, level: MAX_LEVEL, map: 0, mods: 0, players: loads.map((l) => ({ slot: l.slot, weapon: l.weapon, cls: l.cls })) });
    const squad = new Squad(loads.map((l) => l.slot), skill, seed);
    const mems = loads.map(() => ({}));
    let tPerceive = 0;
    let tBots = 0;
    let tSim = 0;
    let worstBots = 0;
    let enemies = 0;
    for (let t = 0; t < ticks && !w.gameOver; t++) {
      // what reading the world alone costs (the bots do it themselves again inside)
      const tp0 = performance.now();
      for (const l of loads) perceive(w, l.slot, mems[l.slot]!);
      tPerceive += performance.now() - tp0;
      const t0 = performance.now();
      const inputs = [];
      for (const [slot, input] of squad.inputs(w)) inputs[slot] = input;
      const t1 = performance.now();
      step(w, inputs);
      const t2 = performance.now();
      tBots += t1 - t0;
      tSim += t2 - t1;
      worstBots = Math.max(worstBots, t1 - t0);
      enemies += w.enemyCount;
    }
    const n = w.tick;
    appendFileSync(process.env.PERF_OUT ?? 'perf10.txt', `${bots} bots ${skill}: ${(tBots / n).toFixed(2)} ms/tick for the bots (${(tBots / n / bots).toFixed(3)} per bot), worst tick ${worstBots.toFixed(1)} ms, sim ${(tSim / n).toFixed(2)} ms/tick, perceive alone ${(tPerceive / n).toFixed(2)} ms/tick, avg enemies ${(enemies / n).toFixed(0)}, floor ${w.wave}\n`);
  }, 3_600_000);
});
