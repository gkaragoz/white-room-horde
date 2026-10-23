import { writeFileSync } from 'node:fs';
import { createGame, step } from '@wrh/sim';
import { describe, it } from 'vitest';
import { decideMove, lastCosts, lastTerms, lastTrip } from '../src/movement';
import { perceive } from '../src/perception';
import { profileOf } from '../src/skill';

describe.skipIf(process.env.DBG4 !== '1')('dbg4', () => {
  it('prints', () => {
    const w = createGame({ seed: 5, map: 6, players: [{ slot: 0, weapon: 'smg', cls: 0 }] });
    w.misc[1] = 0;
    w.pX[0] = 10;
    w.pY[0] = 17;
    w.pLayer[0] = 1;
    const ctx = { skill: profileOf('superhuman'), rand: () => 0.5, mem: {} };
    const lines: string[] = [];
    for (let t = 0; t < 200; t++) {
      const m = decideMove(perceive(w, 0, ctx.mem), ctx, { revive: false, bias: { x: 0, y: 0 } });
      if (t % 5 === 0) lines.push(`t${t} pos ${w.pX[0]!.toFixed(1)},${w.pY[0]!.toFixed(1)} L${w.pLayer[0]} move ${m.x.toFixed(2)},${m.y.toFixed(2)} trip ${lastTrip.value}/${lastTrip.start.toFixed(1)} u ${lastTrip.ux.toFixed(2)},${lastTrip.uy.toFixed(2)} costs ${Array.from(lastCosts).map((c, k) => c.toFixed(1) + '[' + Array.from(lastTerms.slice(k * 8, k * 8 + 8)).map((v) => v.toFixed(1)).join(',') + ']').join(' ')}`);
      step(w, [{ moveX: m.x * 127, moveY: m.y * 127, aim: 0, buttons: 0 }]);
    }
    writeFileSync('C:/Users/annot/AppData/Local/Temp/claude/d10.txt', lines.join('\n'));
  });
});
