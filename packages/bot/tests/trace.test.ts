import { appendFileSync, writeFileSync } from 'node:fs';
import { MAPS, MAX_LEVEL, STAT, STATS } from '@wrh/shared';
import { nearRamp } from '../src/geometry';
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
    if (process.env.CLS) loads[0]!.cls = Number(process.env.CLS);
    if (process.env.WEAPON) loads[0]!.weapon = process.env.WEAPON as never;
    const w = createGame({ seed, level: MAX_LEVEL, map, mods: 0, players: loads.map((l) => ({ slot: l.slot, weapon: l.weapon, cls: l.cls })) });
    const squad = new Squad(loads.map((l) => l.slot), skill, seed);
    const log = (s: string): void => appendFileSync(out, s + '\n');
    const prevLayer: number[] = [];
    const wasOnRamp: boolean[] = [];
    const up = { fight: 0, reloading: 0, firing: 0, idle: 0, empty: 0, deck: 0 };
    while (!w.gameOver && w.tick < maxTicks) {
      const inputs = [];
      for (const [slot, input] of squad.inputs(w)) inputs[slot] = input;
      for (const l of loads) {
        if (w.pLayer[l.slot] === 1) up.deck++;
        const onRamp = nearRamp(MAPS[w.map]!, w.pX[l.slot]!, w.pY[l.slot]!, 0);
        if (onRamp && !wasOnRamp[l.slot]) log(`RAMP slot ${l.slot} entered at t${w.tick} pos (${w.pX[l.slot]!.toFixed(1)},${w.pY[l.slot]!.toFixed(1)}) layer ${w.pLayer[l.slot]} move ${inputs[l.slot]?.moveX},${inputs[l.slot]?.moveY} btn ${inputs[l.slot]?.buttons} stun ${w.pStun[l.slot]} knock ${w.pKnockX[l.slot]!.toFixed(1)},${w.pKnockY[l.slot]!.toFixed(1)} dash ${w.pDash[l.slot]} map ${w.map}`);
        wasOnRamp[l.slot] = onRamp;
        if (w.pLayer[l.slot] !== prevLayer[l.slot]) {
          log(`LAYER slot ${l.slot} ${prevLayer[l.slot]} -> ${w.pLayer[l.slot]} at t${w.tick} pos (${w.pX[l.slot]!.toFixed(1)},${w.pY[l.slot]!.toFixed(1)}) move ${inputs[l.slot]?.moveX},${inputs[l.slot]?.moveY} stun ${w.pStun[l.slot]} knock ${w.pKnockX[l.slot]!.toFixed(1)},${w.pKnockY[l.slot]!.toFixed(1)} dash ${w.pDash[l.slot]} floor ${w.wave}`);
          prevLayer[l.slot] = w.pLayer[l.slot]!;
        }
      }
      if (w.misc[4] === 0 && w.enemyCount > 0 && w.pState[0] === 0) {
        up.fight++;
        if (w.pReload[0]! > 0) up.reloading++;
        else if (w.pMag[0] === 0) up.empty++;
        else if (inputs[0] && (inputs[0].buttons & 1)) up.firing++;
        else up.idle++;
      }
      if (process.env.SAMPLE && w.tick % Number(process.env.SAMPLE) === 0) {
        let nd = 1e9;
        let nn = 0;
        for (let i = 0; i < w.eActive.length; i++) {
          if (!w.eActive[i]) continue;
          nn++;
          nd = Math.min(nd, Math.hypot(w.eX[i]! - w.pX[0]!, w.eY[i]! - w.pY[0]!));
        }
        log(`S t${w.tick} floor ${w.wave} map ${w.map} enemies ${nn} nearest ${nd.toFixed(0)} hp ${w.pHp[0]!.toFixed(0)} pos ${w.pX[0]!.toFixed(0)},${w.pY[0]!.toFixed(0)} shots ${w.pStat[0 * STATS + STAT.Shots]} mag ${w.pMag[0]} btn ${inputs[0]?.buttons} players ${loads.map((l) => `(${w.pX[l.slot]!.toFixed(0)},${w.pY[l.slot]!.toFixed(0)})L${w.pLayer[l.slot]}s${w.pState[l.slot]}`).join(' ')}`);
      }
      step(w, inputs);
      for (const ev of w.events) {
        if (ev.type === 'teleHit' && Math.hypot(ev.x - w.pX[0]!, ev.y - w.pY[0]!) < ev.radius + 3) log(`   TELE landed t${w.tick} shape ${ev.shape} effect ${ev.effect} at (${ev.x.toFixed(0)},${ev.y.toFixed(0)}) r${ev.radius.toFixed(1)} player (${w.pX[0]!.toFixed(1)},${w.pY[0]!.toFixed(1)})`);
        if (ev.type === 'waveCleared') log(`FLOOR ${ev.wave} cleared at t${w.tick} (${(w.tick / 30).toFixed(0)}s) kills ${w.kills}`);
        if (ev.type === 'playerHit' || ev.type === 'playerDown') {
          if (process.env.NOHITS === '1') continue;
          // nearest enemies around the hit
          const near: string[] = [];
          for (let i = 0; i < w.eActive.length; i++) {
            if (!w.eActive[i]) continue;
            const d = Math.hypot(w.eX[i]! - ev.x, w.eY[i]! - ev.y);
            if (d < 5) near.push(`${ENEMY_TYPES[w.eType[i]!]}@${d.toFixed(1)}${w.eBoss[i] ? 'B' : ''}${w.eMod[i] ? 'e' + w.eMod[i] : ''}`);
          }
          const teles: string[] = [];
          for (let t = 0; t < w.tActive.length; t++) if (w.tActive[t]) teles.push(`[sh${w.tShape[t]} ef${w.tEffect[t]} (${w.tX[t]!.toFixed(0)},${w.tY[t]!.toFixed(0)}) w${w.tW[t]!.toFixed(1)} l${w.tL[t]!.toFixed(0)} left${w.tLeft[t]}]`);
          if (ev.type === 'playerHit' && ev.damage > 20) log('   teles(after step): ' + teles.join(' '));
          log(`t${w.tick} ${ev.type} ${ev.type === 'playerHit' ? ev.damage.toFixed(1) : ''} hp ${w.pHp[0]!.toFixed(0)} pos ${ev.x.toFixed(1)},${ev.y.toFixed(1)} wave ${w.wave} enemies ${w.enemyCount} near: ${near.slice(0, 8).join(' ')}`);
        }
      }
    }
    for (const l of loads) {
      const st = (k: number): number => w.pStat[l.slot * STATS + k]!;
      log(`slot ${l.slot} cls ${l.cls} shots ${st(STAT.Shots)} hits ${st(STAT.Hits)} swings ${st(STAT.Swings)} dashes ${st(STAT.Dashes)} abilities ${st(STAT.Abilities)} grenades ${st(STAT.Grenades)} barrels ${st(STAT.Barrels)} pickups ${st(STAT.Pickups)} dmgTaken ${st(STAT.DamageTaken).toFixed(0)} downs ${st(STAT.Downs)} alive ${st(STAT.AliveTicks)} distance ${st(STAT.Distance).toFixed(0)}`);
    }
    {
      const left: string[] = [];
      for (let i = 0; i < w.eActive.length; i++) if (w.eActive[i]) left.push(`${ENEMY_TYPES[w.eType[i]!]}@(${w.eX[i]!.toFixed(0)},${w.eY[i]!.toFixed(0)}) L${w.eLayer[i]} hp${w.eHp[i]!.toFixed(0)}`);
      log(`player (${w.pX[0]!.toFixed(0)},${w.pY[0]!.toFixed(0)}) L${w.pLayer[0]} enemies left ${left.length}: ${left.slice(0, 12).join(' ')}`);
    }
    log(`uptime of slot 0 in fights: ${JSON.stringify(up)}`);
    log(`end t${w.tick} floor ${w.wave} kills ${w.kills}`);
  }, 3_600_000);
});
