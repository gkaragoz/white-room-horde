const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** Incremental CRC32 (IEEE). Feed the typed arrays of the world in a fixed order. */
export class Crc32 {
  private c = 0xffffffff;

  bytes(u8: Uint8Array): this {
    let c = this.c;
    for (let i = 0; i < u8.length; i++) c = TABLE[(c ^ u8[i]!) & 0xff]! ^ (c >>> 8);
    this.c = c;
    return this;
  }

  typed(a: ArrayBufferView): this {
    return this.bytes(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  }

  u32(v: number): this {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0, true);
    return this.bytes(b);
  }

  digest(): number {
    return (this.c ^ 0xffffffff) >>> 0;
  }
}
