import { applyObstacles } from './obstacles';
import { SCALAR_NAMES, snapshotArrays } from './schema';
import type { World } from './state';

const RNG_WORDS = 4;
const HEADER = SCALAR_NAMES.length * 8 + RNG_WORDS * 4;

/** Serialise the whole world (for desync recovery and fast late join). Layout: the scalars, the rng, then every array of the WorldSchema. */
export function serializeWorld(w: World): Uint8Array {
  const list = snapshotArrays(w);
  let size = HEADER;
  for (const a of list) size += a.byteLength;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  SCALAR_NAMES.forEach((name, i) => dv.setFloat64(i * 8, w[name], true));
  const rs = w.rng.getState();
  for (let i = 0; i < RNG_WORDS; i++) dv.setUint32(SCALAR_NAMES.length * 8 + i * 4, rs[i]!, true);
  let off = HEADER;
  for (const a of list) {
    out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), off);
    off += a.byteLength;
  }
  return out;
}

/** Overwrite the world with a snapshot made by `serializeWorld` (same build). */
export function restoreWorld(w: World, buf: Uint8Array): void {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  SCALAR_NAMES.forEach((name, i) => (w[name] = dv.getFloat64(i * 8, true)));
  applyObstacles(w.field, w.map, 0);
  applyObstacles(w.field1, w.map, 1);
  const rngAt = SCALAR_NAMES.length * 8;
  w.rng.setState([
    dv.getUint32(rngAt, true),
    dv.getUint32(rngAt + 4, true),
    dv.getUint32(rngAt + 8, true),
    dv.getUint32(rngAt + 12, true),
  ]);
  let off = HEADER;
  for (const a of snapshotArrays(w)) {
    new Uint8Array(a.buffer, a.byteOffset, a.byteLength).set(buf.subarray(off, off + a.byteLength));
    off += a.byteLength;
  }
  w.events.length = 0;
}
