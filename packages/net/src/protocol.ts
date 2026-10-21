import { INPUT_BYTES, decodeTick, encodeTick, type PlayerInput, type WeaponId } from '@wrh/shared';

/** First byte of every binary message. */
export const Bin = { Input: 1, Bundle: 2, Snapshot: 3, SnapshotDeliver: 4, Inputs: 5 } as const;

/** How many of the latest inputs every input message repeats, so a lost or late message does not cost a tick. */
export const INPUT_REDUNDANCY = 4;

export interface PlayerInfo {
  slot: number;
  name: string;
  host: boolean;
  connected: boolean;
  weapon: WeaponId;
  /** Accessory index chosen in the lobby (cosmetic). */
  acc: number;
  /** Vest colour index chosen in the lobby (-1: the slot's own colour). */
  color: number;
  /** Class index chosen in the lobby (see CLASS_IDS). */
  cls: number;
}

export interface RoomOptions {
  /** Arena layout index, or -1 for a random one when the game starts. */
  map: number;
  /** The chosen difficulty multipliers: a bit mask over MODS (0 = none). */
  mods: number;
}

export interface JoinOpts {
  password?: string;
  acc?: number;
  color?: number;
  cls?: number;
  /** Game version of the client; the server refuses a different major.minor (the simulation rules may differ). */
  v?: string;
}

export type ClientMsg =
  | ({ t: 'create'; name: string; weapon?: WeaponId } & JoinOpts)
  | ({ t: 'join'; code: string; name: string; weapon?: WeaponId } & JoinOpts)
  /** `have`: the last tick the page already applied to a world it still has (resume without replaying the game). */
  | { t: 'rejoin'; code: string; token: string; v?: string; have?: number }
  | { t: 'start' }
  | { t: 'hash'; tick: number; hash: number }
  | { t: 'ping'; ts: number; rtt?: number }
  | { t: 'resync' }
  | { t: 'weapon'; weapon: WeaponId }
  | { t: 'options'; map: number; mods: number }
  | { t: 'look'; acc: number; color?: number; cls?: number }
  /** Host only: stop or resume the game for everybody. */
  | { t: 'pause'; on: boolean }
  | { t: 'leave' };

export type ServerMsg =
  | { t: 'room'; code: string; slot: number; players: PlayerInfo[]; started: boolean; options: RoomOptions; token: string; locked: boolean }
  | { t: 'start'; seed: number; players: { slot: number; weapon: WeaponId; cls: number }[]; map: number; mods: number }
  | { t: 'desync'; tick: number; slots: number[] }
  | { t: 'pong'; ts: number }
  | { t: 'paused'; on: boolean }
  | { t: 'snapshotRequest' }
  /** `code`: a short reason a page can act on (room_gone, bad_token, version); `message` is for people. */
  | { t: 'error'; message: string; code?: string };

export interface Join {
  slot: number;
  weapon: WeaponId;
}

export interface Bundle {
  tick: number;
  joins: { slot: number; weaponIndex: number; cls: number }[];
  inputs: (PlayerInput | undefined)[];
}

/** Client to server: the input a player wants applied at `tick`. */
export function encodeInputMsg(tick: number, input: PlayerInput): Uint8Array {
  const body = encodeTick([input]);
  const out = new Uint8Array(5 + INPUT_BYTES);
  out[0] = Bin.Input;
  new DataView(out.buffer).setUint32(1, tick, true);
  // single-input wire form: skip the slot mask, one input record
  out.set(body.subarray(2), 5);
  return out;
}

/**
 * Client to server: the newest input is for `tick`, the ones before it (oldest first) for the ticks just before. The
 * server only takes the older ones for ticks it has no input for yet.
 */
export function encodeInputsMsg(tick: number, inputs: readonly PlayerInput[]): Uint8Array {
  const n = Math.min(INPUT_REDUNDANCY, inputs.length);
  const out = new Uint8Array(6 + n * INPUT_BYTES);
  out[0] = Bin.Inputs;
  new DataView(out.buffer).setUint32(1, tick, true);
  out[5] = n;
  for (let i = 0; i < n; i++) out.set(encodeTick([inputs[inputs.length - n + i]!]).subarray(2), 6 + i * INPUT_BYTES);
  return out;
}

export function decodeInputsMsg(buf: Uint8Array): { tick: number; inputs: PlayerInput[] } | null {
  if (buf.length < 6) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tick = dv.getUint32(1, true);
  const n = buf[5]!;
  if (n < 1 || n > INPUT_REDUNDANCY || buf.length !== 6 + n * INPUT_BYTES) return null;
  const inputs: PlayerInput[] = [];
  for (let i = 0; i < n; i++) {
    const rec = new Uint8Array(2 + INPUT_BYTES);
    rec[0] = 1;
    rec.set(buf.subarray(6 + i * INPUT_BYTES, 6 + (i + 1) * INPUT_BYTES), 2);
    inputs.push(decodeTick(rec, 1).inputs[0]!);
  }
  return { tick, inputs };
}

export function decodeInputMsg(buf: Uint8Array): { tick: number; input: PlayerInput } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tick = dv.getUint32(1, true);
  const mask = new Uint8Array(2 + INPUT_BYTES);
  mask[0] = 1;
  mask.set(buf.subarray(5, 5 + INPUT_BYTES), 2);
  const d = decodeTick(mask, 1);
  return { tick, input: d.inputs[0]! };
}

export function encodeBundle(b: Bundle): Uint8Array {
  const body = encodeTick(b.inputs);
  const out = new Uint8Array(1 + 4 + 1 + b.joins.length * 3 + body.length);
  out[0] = Bin.Bundle;
  new DataView(out.buffer).setUint32(1, b.tick, true);
  out[5] = b.joins.length;
  let o = 6;
  for (const j of b.joins) {
    out[o++] = j.slot;
    out[o++] = j.weaponIndex & 255;
    out[o++] = j.cls & 255;
  }
  out.set(body, o);
  return out;
}

export function decodeBundle(buf: Uint8Array, slots: number): Bundle {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tick = dv.getUint32(1, true);
  const n = buf[5]!;
  const joins: Bundle['joins'] = [];
  let o = 6;
  for (let i = 0; i < n; i++) {
    joins.push({ slot: buf[o]!, weaponIndex: buf[o + 1]!, cls: buf[o + 2]! });
    o += 3;
  }
  return { tick, joins, inputs: decodeTick(buf.subarray(o), slots).inputs };
}

/** Snapshot messages: [type][tick u32][world bytes]. */
export function encodeSnapshot(type: typeof Bin.Snapshot | typeof Bin.SnapshotDeliver, tick: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + data.length);
  out[0] = type;
  new DataView(out.buffer).setUint32(1, tick, true);
  out.set(data, 5);
  return out;
}

export function decodeSnapshot(buf: Uint8Array): { tick: number; data: Uint8Array } {
  return { tick: new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(1, true), data: buf.subarray(5) };
}
