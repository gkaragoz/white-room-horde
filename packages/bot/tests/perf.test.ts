import { appendFileSync } from 'node:fs';
import { MAX_LEVEL } from '@wrh/shared';
import { createGame, step } from '@wrh/sim';
import { describe, it } from 'vitest';
import { Bot } from '../src';
import { perceive } from '../src/perception';
import { decideCombat } from '../src/combat';
import { decideMove } from '../src/movement';
import { decideTeam } from '../src/team';
import { profileOf } from '../src/skill';

/** Time per decision of each stage in a busy game. Skipped unless PERF=1 (results appended to PERF_OUT). */
describe.skipIf(process.env.PERF !== '1')('bot perf', () => {
  it('measures', () => {
    const seed = Number(process.env.SEED ?? 2002);
    const w = createGame({ seed, level: MAX_LEVEL, map: Number(process.env.MAP ?? 0), mods: 0, players: [{ slot: 0, weapon: 'smg', cls: 2 }] });
    const bot = new Bot({ slot: 0, skill: 'superhuman', seed });
    const mem = {};
    const ctx = { skill: profileOf('superhuman'), rand: Math.random, mem };
    const tm = { perceive: 0, team: 0, move: 0, combat: 0, n: 0, enemies: 0 };
    const until = Number(process.env.TICKS ?? 2400);
    while (!w.gameOver && w.tick < until) {
      const inp = bot.input(w);
      if (w.tick > 600 && w.tick % 3 === 0) {
        let t0 = performance.now();
        const p = perceive(w, 0, mem);
        let t1 = performance.now();
        tm.perceive += t1 - t0;
        t0 = t1;
        const team = decideTeam(p, ctx);
        t1 = performance.now();
        tm.team += t1 - t0;
        t0 = t1;
        decideMove(p, ctx, team);
        t1 = performance.now();
        tm.move += t1 - t0;
        t0 = t1;
        decideCombat(p, ctx);
        t1 = performance.now();
        tm.combat += t1 - t0;
        tm.n++;
        tm.enemies += p.enemies.length;
      }
      step(w, [inp]);
    }
    const f = (v: number): string => (v / tm.n).toFixed(3);
    appendFileSync(process.env.PERF_OUT ?? 'perf.txt', `avg ms: perceive ${f(tm.perceive)} team ${f(tm.team)} move ${f(tm.move)} combat ${f(tm.combat)} enemies ${(tm.enemies / tm.n).toFixed(0)}\n`);
  }, 600_000);
});
