import { Buttons, WEAPON_IDS, type PlayerInput, type WeaponId } from '@wrh/shared';
import { cos, sin } from './detmath';
import { addPlayer, createGame, hashWorld, setMet, setWave, step, type World } from './sim';
import { createWorld } from './state';

/**
 * A scripted input stream so any two environments (Node tests, the browser QA page, a CI browser) can run the same
 * simulation and compare hashes bit for bit. Uses detmath only, so the script itself is deterministic too. It leans on
 * every input: moving, firing, grenades, reloading, dashing, reviving and picking cards.
 */
export function scriptedInput(t: number, slot: number): PlayerInput {
  const phase = t + slot * 17;
  let buttons = phase % 40 < 25 ? Buttons.Fire : 0;
  if (phase % 211 < 2) buttons |= Buttons.Grenade;
  if (phase % 173 === 0) buttons |= Buttons.Reload;
  if (phase % 97 === 0) buttons |= Buttons.Dash;
  if (phase % 61 < 20) buttons |= Buttons.Revive;
  const card = phase % 300;
  if (card === 5) buttons |= Buttons.Card1;
  else if (card === 150) buttons |= Buttons.Card2;
  else if (card === 250) buttons |= Buttons.Card3;
  // now and then click another weapon in the list (index + 1)
  const pick = phase % 83;
  const wsel = pick === 7 || pick === 41 ? 1 + ((phase >> 3) % 25) : 0;
  return {
    moveX: Math.round(sin(phase * 0.05) * 127),
    moveY: Math.round(cos(phase * 0.031) * 127),
    aim: (phase * 311) % 65536,
    buttons,
    wsel,
    gAim: (phase * 197) % 65536,
  };
}

export interface ScriptOptions {
  map?: number;
  mods?: number;
  /** Start on this wave (more enemy types, bosses). */
  wave?: number;
}

export function runScripted(
  seed: number,
  ticks: number,
  players = 4,
  opts: ScriptOptions = {},
): { world: World; hash: number } {
  const w = createGame({
    seed,
    map: opts.map ?? 0,
    mods: opts.mods ?? 0,
    players: Array.from({ length: players }, (_, s) => ({
      slot: s,
      weapon: WEAPON_IDS[s % WEAPON_IDS.length]!,
    })),
  });
  if (opts.wave && opts.wave > 1) setWave(w, opts.wave);
  for (let t = 0; t < ticks; t++)
    step(
      w,
      Array.from({ length: players }, (_, s) => scriptedInput(t, s)),
    );
  return { world: w, hash: hashWorld(w) };
}

export interface QuietOptions {
  seed?: number;
  map?: number;
  mods?: number;
  /** The meta level (default: the full game). */
  level?: number;
  /** Who is in the world (default: one pistol player at the origin in slot 0). */
  players?: { slot: number; weapon?: WeaponId; x?: number; y?: number; cls?: number; metWeapons?: number; metDrones?: number }[];
}

/**
 * A world where nothing happens on its own: no wave is due and none is queued, so the test decides what appears.
 * The one place that knows how to make a world stand still.
 */
export function quietWorld(opts: QuietOptions = {}): World {
  const w = createWorld(opts.seed ?? 1, opts.map ?? 0, opts.mods ?? 0, opts.level);
  w.waveTick = 1e9;
  w.countMul = 0;
  for (const p of opts.players ?? [{ slot: 0 }]) {
    addPlayer(w, p.slot, p.x ?? 0, p.y ?? 0, p.weapon ?? 'pistol', p.cls ?? 0);
    setMet(w, p.slot, p.metWeapons, p.metDrones);
  }
  return w;
}
