import { appendFileSync } from 'node:fs';
import { MAX_LEVEL, PlayerState, type PlayerInput } from '@wrh/shared';
import { createGame, step } from '@wrh/sim';
import { describe, it } from 'vitest';
import { Squad, botLoadouts } from '../src';
import { perceive } from '../src/perception';
import { planRevives } from '../src/revive';
import { squadOf } from '../src/roles';
import { decideMove } from '../src/movement';
import { decideTeam } from '../src/team';
import { makeRand, profileOf } from '../src/skill';

interface Ep {
  start: number;
  samples: number;
  assigned: number;
  hot: number;
  zone: number;
  maxPress: number;
  minPress: number;
  standing: number;
}

describe.skipIf(process.env.DIAG !== '1')('diag', () => {
  it('logs downed episodes', () => {
    const seeds = (process.env.DIAG_SEEDS ?? '3000,3001').split(',').map(Number);
    for (const seed of seeds) {
      const loads = botLoadouts([0, 1, 2, 3], 4, seed);
      const w = createGame({ seed, level: MAX_LEVEL, map: 0, mods: 0, players: loads.map((l) => ({ slot: l.slot, weapon: l.weapon, cls: l.cls })) });
      const squad = new Squad([0, 1, 2, 3], 'expert', seed);
      const inputs: (PlayerInput | undefined)[] = [];
      const dmem: Record<string, unknown> = {};
      const open = new Map<number, Ep>();
      const out: string[] = [];
      const close = (slot: number, how: string): void => {
        const e = open.get(slot);
        if (!e) return;
        open.delete(slot);
        out.push(`seed ${seed} floor ${w.wave} slot ${slot} start ${e.start.toFixed(0)}s dur ${(w.tick / 30 - e.start).toFixed(1)}s ${how} assigned ${(e.assigned / Math.max(1, e.samples)).toFixed(2)} hot ${(e.hot / Math.max(1, e.samples)).toFixed(2)} zone ${(e.zone / Math.max(1, e.samples)).toFixed(2)} press ${e.minPress.toFixed(0)}..${e.maxPress.toFixed(0)} standing ${e.standing}`);
      };
      while (!w.gameOver && w.tick < 30 * 60 * Number(process.env.DIAG_MIN ?? 6)) {
        inputs.length = 0;
        for (const [s, i] of squad.inputs(w)) inputs[s] = i;
        if (w.tick % 10 === 0) {
          const plan = planRevives(w, squadOf(perceive(w, 0, {})));
          const standing = [0, 1, 2, 3].filter((s) => w.pState[s] === PlayerState.Alive).length;
          for (const d of plan.downed) {
            const e = open.get(d.slot) ?? { start: w.tick / 30, samples: 0, assigned: 0, hot: 0, zone: 0, maxPress: 0, minPress: 1e9, standing };
            open.set(d.slot, e);
            e.samples++;
            if (d.assignee >= 0) e.assigned++;
            if (d.zoneEta < Infinity) e.zone++;
            e.maxPress = Math.max(e.maxPress, d.pressure);
            e.minPress = Math.min(e.minPress, d.pressure);
            e.standing = Math.min(e.standing, standing);
          }
        }
        if (process.env.DIAG_FROM && w.tick % 15 === 0 && w.tick / 30 >= Number(process.env.DIAG_FROM) && w.tick / 30 <= Number(process.env.DIAG_TO)) {
          const plan = planRevives(w, squadOf(perceive(w, 0, {})));
          const row = [0, 1, 2, 3].map((s) => `${s}:${w.pState[s]}/${w.pHp[s]!.toFixed(0)}@${w.pX[s]!.toFixed(0)},${w.pY[s]!.toFixed(0)} rv${inputs[s] && (inputs[s]!.buttons & 4) ? 1 : 0}`).join(' ');
          const dctx = { skill: profileOf('expert'), rand: makeRand(1), mem: dmem };
          for (const d of plan.downed) {
            if (d.assignee < 0) continue;
            const pp = perceive(w, d.assignee, dctx.mem);
            const td = decideTeam(pp, dctx);
            const mv = decideMove(pp, dctx, td);
            out.push(`    assignee ${d.assignee} team rev=${td.revive} bias=${td.bias.x.toFixed(2)},${td.bias.y.toFixed(2)} move=${mv.x.toFixed(2)},${mv.y.toFixed(2)} real=${inputs[d.assignee]!.moveX},${inputs[d.assignee]!.moveY} dx=${(d.x - pp.x).toFixed(1)},${(d.y - pp.y).toFixed(1)} layer=${pp.layer}/${w.pLayer[d.slot]}`);
          }
          out.push(`  t=${(w.tick / 30).toFixed(1)} ph=${w.misc[4]} ${row} | ` + plan.downed.map((d) => `D${d.slot} a${d.assignee} p${d.pressure.toFixed(0)} left${d.timeLeft.toFixed(0)} z${d.zoneEta}`).join('; '));
        }
        step(w, inputs);
        for (const ev of w.events) {
          if (ev.type === 'playerRevive') close(ev.slot, 'REVIVED');
          else if (ev.type === 'playerDead') close(ev.slot, 'DEAD');
          else if (ev.type === 'floorEnter') for (const k of [...open.keys()]) close(k, 'lifted');
        }
      }
      appendFileSync(process.env.DIAG_OUT ?? 'diag.txt', out.join('\n') + '\n');
    }
  }, 900_000);
});
