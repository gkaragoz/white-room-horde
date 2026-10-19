import { Buttons, type PlayerInput } from '@wrh/shared';
import { cos, sin } from './detmath';
import { addPlayer, createWorld, hashWorld, step, type World } from './sim';

/**
 * A scripted input stream so any two environments (Node tests, the browser QA page, a CI browser) can run the same
 * simulation and compare hashes bit for bit. Uses detmath only, so the script itself is deterministic too.
 */
export function scriptedInput(t: number, slot: number): PlayerInput {
  const phase = t + slot * 17;
  return {
    moveX: Math.round(sin(phase * 0.05) * 127),
    moveY: Math.round(cos(phase * 0.031) * 127),
    aim: (phase * 311) % 65536,
    buttons: phase % 40 < 25 ? Buttons.Fire : 0,
  };
}

export function runScripted(seed: number, ticks: number, players = 4): { world: World; hash: number } {
  const w = createWorld(seed);
  for (let s = 0; s < players; s++) addPlayer(w, s, s * 2 - 3, 0);
  for (let t = 0; t < ticks; t++) step(w, Array.from({ length: players }, (_, s) => scriptedInput(t, s)));
  return { world: w, hash: hashWorld(w) };
}
