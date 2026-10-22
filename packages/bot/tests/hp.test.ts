import { appendFileSync } from 'node:fs';
import { ENEMY_TYPES, MAX_LEVEL } from '@wrh/shared';
import { createGame, fxOf, setWave, spawnEnemy } from '@wrh/sim';
import { describe, it } from 'vitest';

/** What a grunt is worth on each floor at level 100. Skipped unless HP=1. */
describe.skipIf(process.env.HP !== '1')('hp', () => {
  it('prints', () => {
    const w = createGame({ seed: 1, level: MAX_LEVEL, map: 0, mods: 0, players: [{ slot: 0, weapon: 'smg', cls: 2 }] });
    const lines: string[] = [];
    for (let f = 1; f <= 16; f++) {
      setWave(w, f);
      const i = spawnEnemy(w, ENEMY_TYPES.indexOf('grunt'), 10, 10);
      lines.push(`floor ${f}: grunt hp ${w.eHp[i]!.toFixed(0)} hpMul ${w.hpMul.toFixed(2)} countMul ${w.countMul.toFixed(2)} fx.enemyHp ${fxOf(w).enemyHp} total ${w.misc[3]}`);
      w.eActive[i] = 0;
      w.enemyCount = 0;
    }
    appendFileSync(process.env.HP_OUT ?? 'hp.txt', lines.join('\n') + '\n');
  });
});
