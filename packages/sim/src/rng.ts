/** Seeded xorshift128 (Marsaglia). 32-bit integer ops only, so every engine produces the same stream. */
export class Rng {
  private s0 = 0;
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;

  constructor(seed: number) {
    this.seed(seed);
  }

  seed(seed: number): void {
    // splitmix32-style integer scrambling to fill the state
    let z = seed >>> 0;
    const next = (): number => {
      z = (z + 0x9e3779b9) >>> 0;
      let t = z ^ (z >>> 16);
      t = Math.imul(t, 0x21f0aaad) >>> 0;
      t ^= t >>> 15;
      t = Math.imul(t, 0x735a2d97) >>> 0;
      t ^= t >>> 15;
      return t >>> 0;
    };
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next() || 1;
  }

  nextU32(): number {
    const t = (this.s0 ^ (this.s0 << 11)) >>> 0;
    this.s0 = this.s1;
    this.s1 = this.s2;
    this.s2 = this.s3;
    this.s3 = (this.s3 ^ (this.s3 >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
    return this.s3;
  }

  /** Uniform float in [0, 1). Division by 2^32 is exact. */
  float(): number {
    return this.nextU32() / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.float() * n);
  }

  getState(): [number, number, number, number] {
    return [this.s0, this.s1, this.s2, this.s3];
  }

  setState(s: readonly [number, number, number, number]): void {
    this.s0 = s[0] >>> 0;
    this.s1 = s[1] >>> 0;
    this.s2 = s[2] >>> 0;
    this.s3 = s[3] >>> 0;
  }
}
