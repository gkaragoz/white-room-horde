import { describe, expect, it } from 'vitest';
import { atan2, cos, sin, TAU, wrapAngle } from '../src/detmath';

describe('detmath', () => {
  it('sin/cos match Math within 1e-7 over several turns', () => {
    for (let i = -2000; i <= 2000; i++) {
      const a = i * 0.0173;
      expect(Math.abs(sin(a) - Math.sin(a))).toBeLessThan(1e-7);
      expect(Math.abs(cos(a) - Math.cos(a))).toBeLessThan(1e-7);
    }
  });

  it('atan2 matches Math within 2e-5 in every quadrant', () => {
    for (let i = 0; i < 720; i++) {
      const a = (i / 720) * TAU - Math.PI;
      const x = Math.cos(a) * 3.7;
      const y = Math.sin(a) * 3.7;
      expect(Math.abs(atan2(y, x) - Math.atan2(y, x))).toBeLessThan(2e-5);
    }
    expect(atan2(0, 0)).toBe(0);
  });

  it('wrapAngle returns values in [-PI, PI)', () => {
    for (const a of [-100, -7, -3.2, 0, 3.2, 7, 100]) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThanOrEqual(-Math.PI);
      expect(w).toBeLessThan(Math.PI);
    }
  });

  it('is exactly reproducible (same input, same bits)', () => {
    const a = sin(1.2345);
    const b = sin(1.2345);
    expect(Object.is(a, b)).toBe(true);
  });
});
