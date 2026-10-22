import { appendFileSync, writeFileSync } from 'node:fs';
import { MAX_LEVEL, STAT, STATS } from '@wrh/shared';
import { createGame, step } from '@wrh/sim';
import { ENEMY_TYPES } from '@wrh/shared';
import { describe, it } from 'vitest';
import { Squad, botLoadouts, type Skill } from '../src';

/**
 * Prints every hit a bot takes with what was next to it. Skipped unless TRACE=1.
 *   TRACE=1 TRACE_OUT=trace.txt SEED=2000 BOTS=1 SKILL=expert MAP=0 MINUTES=3 pnpm --filter @wrh/bot exec vitest run tests/trace.test.ts
 */
describe.skipIf(process.env.TRACE !== '1')('bot trace', () => {
  it('logs the hits', () => {
    const out = process.env.TRACE_OUT ?? 'trace.txt';
    writeFileSync(out, '');
    const seed = Number(process.env.SEED ?? 2000);
    const bots = Number(process.env.BOTS ?? 1);
    const skill = (process.env.SKILL ?? 'expert') as Skill;
    const map = Number(process.env.MAP ?? 0);
    const maxTicks = 30 * 60 * Number(process.env.MINUTES ?? 3);
    const loads = botLoadouts(Array.from({ length: bots }, (_, i) => i), bots, seed);
    const w = createGame({ seed, level: MAX_LEVEL, map, mods: 0, players: loads.map((l) => ({ slot: l.slot, weapon: l.weapon, cls: l.cls })) });
    const squad = new Squad(loads.map((l) => l.slot), skill, seed);
    const log = (s: string): void => appendFileSync(out, s + '\n');
    const up = { fight: 0, reloading: 0, firing: 0, idle: 0, empty: 0 };
    while (!w.gameOver && w.tick < maxTicks) {
      const inputs = [];
      for (const [slot, input] of squad.inputs(w)) inputs[slot] = input;
      if (w.misc[4] === 0 && w.enemyCount > 0 && w.pState[0] === 0) {
        up.fight++;
        if (w.pReload[0]! > 0) up.reloading++;
        else if (w.pMag[0] === 0) up.empty++;
        else if (inputs[0] && (inputs[0].buttons & 1)) up.firing++;
        else up.idle++;
      }
      step(w, inputs);
      for (const ev of w.events) {
        if (ev.type === 'playerHit' || ev.type === 'playerDown') {
          // nearest enemies around the hit
          const near: string[] = [];
          for (let i = 0; i < w.eActive.length; i++) {
            if (!w.eActive[i]) continue;
            const d = Math.hypot(w.eX[i]! - ev.x, w.eY[i]! - ev.y);
            if (d < 5) near.push(`${ENEMY_TYPES[w.eType[i]!]}@${d.toFixed(1)}${w.eBoss[i] ? 'B' : ''}${w.eMod[i] ? 'e' + w.eMod[i] : ''}`);
          }
          log(`t${w.tick} ${ev.type} ${ev.type === 'playerHit' ? ev.damage.toFixed(1) : ''} hp ${w.pHp[0]!.toFixed(0)} pos ${ev.x.toFixed(1)},${ev.y.toFixed(1)} wave ${w.wave} enemies ${w.enemyCount} near: ${near.slice(0, 8).join(' ')}`);
        }
      }
    }
    for (const l of loads) {
      const st = (k: number): number => w.pStat[l.slot * STATS + k]!;
      log(`slot ${l.slot} cls ${l.cls} shots ${st(STAT.Shots)} hits ${st(STAT.Hits)} swings ${st(STAT.Swings)} dashes ${st(STAT.Dashes)} abilities ${st(STAT.Abilities)} grenades ${st(STAT.Grenades)} dmgTaken ${st(STAT.DamageTaken).toFixed(0)} downs ${st(STAT.Downs)} alive ${st(STAT.AliveTicks)} distance ${st(STAT.Distance).toFixed(0)}`);
    }
    log(`uptime of slot 0 in fights: ${JSON.stringify(up)}`);
    log(`end t${w.tick} floor ${w.wave} kills ${w.kills}`);
  }, 3_600_000);
});
