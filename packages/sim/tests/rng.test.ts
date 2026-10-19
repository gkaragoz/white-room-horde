import { describe, expect, it } from 'vitest';
import { Rng } from '../src/rng';

describe('Rng', () => {
  it('produces a fixed stream for a seed (cross-engine reference values)', () => {
    const r = new Rng(12345);
    expect([r.nextU32(), r.nextU32(), r.nextU32()]).toEqual([1333010638, 820971536, 3303648126]);
    const q = new Rng(0);
    expect([q.nextU32(), q.nextU32()]).toEqual([155034901, 3555406135]);
  });

  it('float() stays in [0, 1) and int(n) in [0, n)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 5000; i++) {
      const f = r.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(10);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(10);
    }
  });

  it('state can be saved and restored', () => {
    const a = new Rng(99);
    for (let i = 0; i < 10; i++) a.nextU32();
    const s = a.getState();
    const x = [a.nextU32(), a.nextU32()];
    const b = new Rng(1);
    b.setState(s);
    expect([b.nextU32(), b.nextU32()]).toEqual(x);
  });
});
