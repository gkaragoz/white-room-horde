import { decodeTick, encodeTick, type PlayerInput, type WeaponId } from '@wrh/shared';

/** First byte of every binary message. */
export const Bin = { Input: 1, Bundle: 2, Snapshot: 3, SnapshotDeliver: 4 } as const;

export interface PlayerInfo {
  slot: number;
  name: string;
  host: boolean;
  connected: boolean;
}

export type ClientMsg =
  | { t: 'create'; name: string; weapon?: WeaponId }
  | { t: 'join'; code: string; name: string; weapon?: WeaponId }
  | { t: 'start' }
  | { t: 'hash'; tick: number; hash: number }
  | { t: 'ping'; ts: number }
  | { t: 'resync' }
  | { t: 'leave' };

export type ServerMsg =
  | { t: 'room'; code: string; slot: number; players: PlayerInfo[]; started: boolean }
  | { t: 'start'; seed: number; players: { slot: number; weapon: WeaponId }[] }
  | { t: 'desync'; tick: number; slots: number[] }
  | { t: 'pong'; ts: number }
  | { t: 'snapshotRequest' }
  | { t: 'error'; message: string };

export interface Join {
  slot: number;
  weapon: WeaponId;
}

export interface Bundle {
  tick: number;
  joins: { slot: number; weaponIndex: number }[];
  inputs: (PlayerInput | undefined)[];
}

/** Client to server: the input a player wants applied at `tick`. */
export function encodeInputMsg(tick: number, input: PlayerInput): Uint8Array {
  const body = encodeTick([input]);
  const out = new Uint8Array(5 + 5);
  out[0] = Bin.Input;
  new DataView(out.buffer).setUint32(1, tick, true);
  // single-input wire form: skip the slot mask, five bytes of input
  out.set(body.subarray(2), 5);
  return out;
}

export function decodeInputMsg(buf: Uint8Array): { tick: number; input: PlayerInput } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tick = dv.getUint32(1, true);
  const mask = new Uint8Array(2 + 5);
  mask[0] = 1;
  mask.set(buf.subarray(5, 10), 2);
  const d = decodeTick(mask, 1);
  return { tick, input: d.inputs[0]! };
}

export function encodeBundle(b: Bundle): Uint8Array {
  const body = encodeTick(b.inputs);
  const out = new Uint8Array(1 + 4 + 1 + b.joins.length * 2 + body.length);
  out[0] = Bin.Bundle;
  new DataView(out.buffer).setUint32(1, b.tick, true);
  out[5] = b.joins.length;
  let o = 6;
  for (const j of b.joins) {
    out[o++] = j.slot;
    out[o++] = j.weaponIndex;
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
    joins.push({ slot: buf[o]!, weaponIndex: buf[o + 1]! });
    o += 2;
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
