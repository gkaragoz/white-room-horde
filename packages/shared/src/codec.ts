import type { PlayerInput } from './types';

/** Bytes per player input on the wire (docs/DESIGN.md section 8). */
export const INPUT_BYTES = 9;

export function writeInput(dv: DataView, off: number, i: PlayerInput): void {
  dv.setInt8(off, i.moveX);
  dv.setInt8(off + 1, i.moveY);
  dv.setUint16(off + 2, i.aim, true);
  dv.setUint8(off + 4, i.buttons);
  dv.setUint8(off + 5, Math.max(0, Math.min(255, Math.round(i.aimDist ?? 0))));
  dv.setUint8(off + 6, Math.max(0, Math.min(255, Math.round(i.wsel ?? 0))));
  dv.setUint16(off + 7, (i.gAim ?? i.aim) & 0xffff, true);
}

export function readInput(dv: DataView, off: number): PlayerInput {
  return { moveX: dv.getInt8(off), moveY: dv.getInt8(off + 1), aim: dv.getUint16(off + 2, true), buttons: dv.getUint8(off + 4), aimDist: dv.getUint8(off + 5), wsel: dv.getUint8(off + 6), gAim: dv.getUint16(off + 7, true) };
}

export function clampInput(i: PlayerInput): PlayerInput {
  const c = (v: number): number => (v < -127 ? -127 : v > 127 ? 127 : Math.round(v));
  return { moveX: c(i.moveX), moveY: c(i.moveY), aim: i.aim & 0xffff, buttons: i.buttons & 0xff, aimDist: Math.max(0, Math.min(255, Math.round(i.aimDist ?? 0))), wsel: Math.max(0, Math.min(14, Math.round(i.wsel ?? 0))), gAim: (i.gAim ?? i.aim) & 0xffff };
}

/** One tick of confirmed inputs: u16 slot mask followed by the present inputs in slot order. */
export function encodeTick(inputs: ReadonlyArray<PlayerInput | undefined>): Uint8Array {
  let mask = 0;
  let n = 0;
  for (let s = 0; s < inputs.length; s++) {
    if (inputs[s]) {
      mask |= 1 << s;
      n++;
    }
  }
  const out = new Uint8Array(2 + n * INPUT_BYTES);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, mask, true);
  let off = 2;
  for (let s = 0; s < inputs.length; s++) {
    const i = inputs[s];
    if (i) {
      writeInput(dv, off, i);
      off += INPUT_BYTES;
    }
  }
  return out;
}

export function decodeTick(buf: Uint8Array, slots: number): { inputs: (PlayerInput | undefined)[]; size: number } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const mask = dv.getUint16(0, true);
  const inputs: (PlayerInput | undefined)[] = new Array<PlayerInput | undefined>(slots).fill(undefined);
  let off = 2;
  for (let s = 0; s < slots; s++) {
    if (mask & (1 << s)) {
      inputs[s] = readInput(dv, off);
      off += INPUT_BYTES;
    }
  }
  return { inputs, size: off };
}
