import { decodeTick, encodeTick, WEAPON_IDS, type PlayerInput, type WeaponId } from '@wrh/shared';
import { createGame, hashWorld, step, type GameSetup, type World } from './sim';

/** Hash checkpoints are stored every this many ticks (also the desync-check cadence on the network). */
export const CHECKPOINT_TICKS = 30;

export interface Replay {
  setup: GameSetup;
  /** One entry per tick: the confirmed inputs for every slot. */
  ticks: (PlayerInput | undefined)[][];
  /** hashes[i] is the world hash after tick (i + 1) * CHECKPOINT_TICKS. */
  hashes: number[];
}

/** Records the confirmed input stream while a game runs. */
export class Recorder {
  readonly replay: Replay;

  constructor(setup: GameSetup) {
    this.replay = { setup, ticks: [], hashes: [] };
  }

  /** Call after each step with the inputs that were fed to it. */
  record(world: World, inputs: ReadonlyArray<PlayerInput | undefined>): void {
    this.replay.ticks.push(inputs.map((i) => (i ? { ...i } : undefined)));
    if (world.tick % CHECKPOINT_TICKS === 0) this.replay.hashes.push(hashWorld(world));
  }
}

/** Run a replay from the start. Returns the final world and the first checkpoint that did not match (or -1). */
export function playReplay(r: Replay, onTick?: (w: World) => void): { world: World; mismatch: number; hash: number } {
  const w = createGame(r.setup);
  let mismatch = -1;
  for (let t = 0; t < r.ticks.length; t++) {
    step(w, r.ticks[t]!);
    onTick?.(w);
    if (w.tick % CHECKPOINT_TICKS === 0) {
      const i = w.tick / CHECKPOINT_TICKS - 1;
      if (mismatch < 0 && r.hashes[i] !== undefined && r.hashes[i] !== hashWorld(w)) mismatch = w.tick;
    }
  }
  return { world: w, mismatch, hash: hashWorld(w) };
}

/** Result of checking a replay against the simulation (the basis for server-side score verification). */
export interface Verdict {
  ok: boolean;
  /** Tick of the first checkpoint whose hash did not match, or -1. */
  mismatch: number;
  ticks: number;
  wave: number;
  kills: number;
  hash: number;
}

/** Re-run a replay and check every stored checkpoint (and, optionally, the final hash). */
export function verifyReplay(r: Replay, expectedFinalHash?: number): Verdict {
  const { world, mismatch, hash } = playReplay(r);
  const finalOk = expectedFinalHash === undefined || expectedFinalHash >>> 0 === hash >>> 0;
  return { ok: mismatch < 0 && finalOk && r.hashes.length > 0, mismatch, ticks: world.tick, wave: world.wave, kills: world.kills, hash };
}

/** Marks the second version of the binary form (map, difficulty and classes are stored too). */
const MAGIC = [0x57, 0x54];

/** Compact binary form: header (seed, map, difficulty, players), then per tick the wire encoding, then the hashes. */
export function encodeReplay(r: Replay): Uint8Array {
  const parts: Uint8Array[] = [];
  const head = new Uint8Array(2 + 4 + 2 + 1 + r.setup.players.length * 3 + 4 + 4);
  const dv = new DataView(head.buffer);
  head[0] = MAGIC[0]!;
  head[1] = MAGIC[1]!;
  dv.setUint32(2, r.setup.seed >>> 0, true);
  head[6] = r.setup.map ?? 0;
  head[7] = r.setup.difficulty ?? 1;
  head[8] = r.setup.players.length;
  let o = 9;
  for (const p of r.setup.players) {
    head[o++] = p.slot;
    head[o++] = WEAPON_IDS.indexOf(p.weapon) & 255;
    head[o++] = (p.cls ?? 0) & 255;
  }
  dv.setUint32(o, r.ticks.length, true);
  dv.setUint32(o + 4, r.hashes.length, true);
  parts.push(head);
  for (const t of r.ticks) parts.push(encodeTick(t));
  const hb = new Uint8Array(r.hashes.length * 4);
  const hv = new DataView(hb.buffer);
  r.hashes.forEach((h, i) => hv.setUint32(i * 4, h >>> 0, true));
  parts.push(hb);
  let size = 0;
  for (const p of parts) size += p.length;
  const out = new Uint8Array(size);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function decodeReplay(buf: Uint8Array): Replay {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // older replays were recorded with other input and class formats and cannot be replayed any more
  if (buf[0] !== MAGIC[0] || buf[1] !== MAGIC[1]) throw new Error('This replay was recorded by an older version of the game');
  const v2 = true;
  let o = 2;
  const seed = dv.getUint32(o, true);
  o += 4;
  let map = 0;
  let difficulty = 1;
  if (v2) {
    map = buf[o++]!;
    difficulty = buf[o++]!;
  }
  const n = buf[o++]!;
  const players: { slot: number; weapon: WeaponId; cls: number }[] = [];
  let maxSlot = 0;
  for (let i = 0; i < n; i++) {
    const slot = buf[o++]!;
    const weapon = WEAPON_IDS[buf[o++]!]!;
    players.push({ slot, weapon, cls: buf[o++]! });
    if (slot > maxSlot) maxSlot = slot;
  }
  const ticks = dv.getUint32(o, true);
  const nh = dv.getUint32(o + 4, true);
  o += 8;
  const out: Replay = { setup: { seed, players, map, difficulty }, ticks: [], hashes: [] };
  for (let t = 0; t < ticks; t++) {
    const d = decodeTick(buf.subarray(o), maxSlot + 1);
    out.ticks.push(d.inputs);
    o += d.size;
  }
  for (let i = 0; i < nh; i++) out.hashes.push(dv.getUint32(o + i * 4, true));
  return out;
}
