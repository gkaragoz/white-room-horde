import { describe, expect, it } from 'vitest';
import { tests, type Ctx } from '../src/qa/tests';

/**
 * The QA tests that need no browser (marked `pure`) run here, in Node, on every `pnpm test`; the QA page keeps only
 * the ones that need a real renderer. They are the same test objects, so a failure reads the same in both places.
 */
const ctx: Ctx = { stage: null as never, log: () => {}, paint: async () => {} };

describe('QA tests that need no browser', () => {
  const pure = tests.filter((t) => t.pure);
  it('has some', () => {
    expect(pure.length).toBeGreaterThanOrEqual(6);
  });
  for (const t of pure) {
    it(`${t.id}: ${t.title}`, async () => {
      const r = await t.run(ctx);
      expect(r.status, r.detail).toBe('pass');
    });
  }
});
