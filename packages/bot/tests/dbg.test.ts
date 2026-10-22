import { writeFileSync } from 'node:fs';
import { MAX_LEVEL } from '@wrh/shared';
import { createGame, step } from '@wrh/sim';
import { describe, it } from 'vitest';
import { Squad, botLoadouts, type Skill } from '../src';
import { lastCosts, lastTerms, seen } from '../src/movement';

/** Prints the planner's costs around a moment of a game. Skipped unless DBG=1. */
describe.skipIf(process.env.DBG !== '1')('dbg', () => {
  it('prints', () => {
    const seed = Number(process.env.SEED ?? 2000);
    const from = Number(process.env.FROM ?? 850);
    const to = Number(process.env.TO ?? 870);
    const skill = (process.env.SKILL ?? 'expert') as Skill;
    const loads = botLoadouts([0], 1, seed);
    const w = createGame({ seed, level: MAX_LEVEL, map: Number(process.env.MAP ?? 0), mods: 0, players: loads.map((l) => ({ slot: l.slot, weapon: l.weapon, cls: l.cls })) });
    const squad = new Squad([0], skill, seed);
    const lines: string[] = [];
    while (!w.gameOver && w.tick < to) {
      const inputs = [];
      for (const [slot, input] of squad.inputs(w)) inputs[slot] = input;
      const inp = inputs[0]!;
      if (w.tick >= from) {
        const near: string[] = [];
        const far: string[] = [];
        for (let i = 0; i < w.eActive.length; i++) {
          if (!w.eActive[i]) continue;
          far.push(`${w.eType[i]}@(${(w.eX[i]! - w.pX[0]!).toFixed(0)},${(w.eY[i]! - w.pY[0]!).toFixed(0)}) st${w.eState[i]} fr${w.eFrost[i]} L${w.eLayer[i]} hp${w.eHp[i]!.toFixed(0)}`);
        }
        for (let i = 0; i < w.eActive.length; i++) {
          if (!w.eActive[i]) continue;
          const dx = w.eX[i]! - w.pX[0]!;
          const dy = w.eY[i]! - w.pY[0]!;
          if (dx * dx + dy * dy < 36) near.push(`(${dx.toFixed(1)},${dy.toFixed(1)})`);
        }
        lines.push(`t${w.tick} pos ${w.pX[0]!.toFixed(2)},${w.pY[0]!.toFixed(2)} hp ${w.pHp[0]!.toFixed(0)} if ${w.pIFrames[0]!.toFixed(2)} dashcd ${w.pDashCd[0]!.toFixed(1)} move ${inp.moveX},${inp.moveY} btn ${inp.buttons}\n   costs ${Array.from(lastCosts).map((c, k) => c.toFixed(1) + '[' + Array.from(lastTerms.slice(k * 5, k * 5 + 5)).map((v) => v.toFixed(1)).join(',') + ']').join(' ')}\n   all ${far.length}: ${far.slice(0, 16).join(' ')}\n   near ${near.join(' ')}\n   seen ${seen.n}: ${Array.from({ length: Math.min(seen.n, 8) }, (_, i) => `(${(seen.ex[i]! - w.pX[0]!).toFixed(1)},${(seen.ey[i]! - w.pY[0]!).toFixed(1)} sp${seen.esp[i]!.toFixed(1)} t${seen.etouch[i]!.toFixed(2)} dps${seen.edps[i]!.toFixed(2)} rel${Math.sqrt(seen.erel2[i]!).toFixed(1)} h${seen.ehold[i]})`).join(' ')}`);
      }
      step(w, inputs);
    }
    writeFileSync(process.env.DBG_OUT ?? 'dbg.txt', lines.join('\n'));
  });
});
