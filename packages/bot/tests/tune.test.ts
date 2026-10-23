import { appendFileSync } from 'node:fs';
import { MAX_LEVEL, STAT, STATS } from '@wrh/shared';
import { createGame, step } from '@wrh/sim';
import { describe, it } from 'vitest';
import { Squad, botLoadouts, type Skill } from '../src';
import { tuning } from '../src/movement';

/**
 * A/B runs for the planner weights: plays the seeds and reports the damage taken per bot and minute, the downs, the kills and the floor.
 * Skipped unless TUNE=1.
 *
 *   TUNE=1 TUNE_JSON='{"approachBase":1.6}' LABEL=wide BOTS=4 SKILL=expert SEEDS=2000,2001 MINUTES=8 TUNE_OUT=tune.txt pnpm --filter @wrh/bot exec vitest run tests/tune.test.ts
 */
describe.skipIf(process.env.TUNE !== '1')('bot tuning', () => {
  it('plays the seeds', () => {
    if (process.env.TUNE_JSON) Object.assign(tuning, JSON.parse(process.env.TUNE_JSON));
    const bots = Number(process.env.BOTS ?? 4);
    const skill = (process.env.SKILL ?? 'expert') as Skill;
    const map = Number(process.env.MAP ?? 0);
    const minutes = Number(process.env.MINUTES ?? 8);
    const seeds = (process.env.SEEDS ?? '2000,2001,2002,2003').split(',').map(Number);
    let damage = 0;
    let botMinutes = 0;
    let downs = 0;
    let kills = 0;
    let floors = 0;
    const per: string[] = [];
    for (const seed of seeds) {
      const loads = botLoadouts(Array.from({ length: bots }, (_, i) => i), bots, seed);
      const w = createGame({ seed, level: MAX_LEVEL, map, mods: 0, players: loads.map((l) => ({ slot: l.slot, weapon: l.weapon, cls: l.cls })) });
      const squad = new Squad(loads.map((l) => l.slot), skill, seed);
      const maxTicks = 30 * 60 * minutes;
      while (!w.gameOver && w.tick < maxTicks) {
        const inputs = [];
        for (const [slot, input] of squad.inputs(w)) inputs[slot] = input;
        step(w, inputs);
      }
      let d = 0;
      let dn = 0;
      for (const l of loads) {
        d += w.pStat[l.slot * STATS + STAT.DamageTaken]!;
        dn += w.pStat[l.slot * STATS + STAT.Downs]!;
      }
      damage += d;
      downs += dn;
      kills += w.kills;
      floors += w.wave;
      botMinutes += (loads.length * w.tick) / 1800;
      per.push(`${seed}:f${w.wave}${w.gameOver ? 'x' : 'c'}`);
    }
    const n = seeds.length;
    const line = `${process.env.LABEL ?? 'run'} ${bots}x${skill} dmg/botmin ${(damage / botMinutes).toFixed(1)} downs ${downs} kills ${(kills / n).toFixed(0)} floor ${(floors / n).toFixed(1)} [${per.join(' ')}]`;
    appendFileSync(process.env.TUNE_OUT ?? 'tune.txt', line + '\n');
  }, 7_200_000);
});
