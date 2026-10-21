/**
 * Cost of one simulation tick in a busy fight: `pnpm --filter @wrh/server exec tsx ../sim/scripts/bench.ts [wave] [ticks] [players]`.
 * Prints the tick time percentiles and the enemy count; add `--cpu-prof` to node (NODE_OPTIONS) for a profile.
 */
import { createGame, setWave, step } from '../src';
import { botInput } from '../tests/bot';

const wave = Number(process.argv[2] ?? 12);
const ticks = Number(process.argv[3] ?? 900);
const players = Number(process.argv[4] ?? 3);
const w = createGame({ seed: 7, players: Array.from({ length: players }, (_, i) => ({ slot: i, weapon: 'smg' as const, cls: i % 9 })), map: 0, difficulty: 1 });
setWave(w, wave);
for (let s = 0; s < players; s++) w.pHp[s] = w.pMaxHp[s] = 1e7;
const times: number[] = [];
let enemies = 0;
for (let t = 0; t < ticks; t++) {
  const inputs = Array.from({ length: players }, (_, s) => botInput(w, s));
  const t0 = performance.now();
  step(w, inputs);
  times.push(performance.now() - t0);
  enemies = Math.max(enemies, w.enemyCount);
}
times.sort((a, b) => a - b);
const q = (p: number): string => times[Math.floor(times.length * p)]!.toFixed(2);
console.log(`wave ${wave}, ${players} players, ${ticks} ticks, peak enemies ${enemies}: tick ms p50 ${q(0.5)} p95 ${q(0.95)} p99 ${q(0.99)} max ${times[times.length - 1]!.toFixed(2)} (budget 33.3)`);
