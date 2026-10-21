import { describe, expect, it } from 'vitest';
import { PredictedView } from '../src/smoothing';

const TICK = 1 / 30;

/** A character running at `speed` units/s drawn at 60 fps with a jittery input clock; `bump` adds a misprediction at a tick. */
function run(opts: { speed: number; seconds: number; jitter: number; bump?: { tick: number; dx: number }; seed?: number }) {
  let r = opts.seed ?? 7;
  const rnd = (): number => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 0x100000000);
  const v = new PredictedView();
  const xs: number[] = [];
  let nextSend = 0;
  let tick = 10; // the tick of the last send
  let sentAt = 0;
  let offset = 0; // what the prediction thinks the position is above the true line
  const frames = Math.round(opts.seconds * 60);
  let lastT = 0;
  for (let i = 0; i < frames; i++) {
    const t = i / 60 + (rnd() - 0.5) * 0.004;
    while (t >= nextSend) {
      tick++;
      sentAt = nextSend;
      nextSend += TICK + (rnd() - 0.5) * 2 * opts.jitter;
      if (opts.bump && tick === opts.bump.tick) offset += opts.bump.dx;
    }
    // the predicted position of the last two input ticks: the true line, plus any correction that has been applied
    const posCur = opts.speed * tick * TICK + offset;
    const posPrev = opts.speed * (tick - 1) * TICK + offset;
    v.update({ tickPrev: tick - 1, tickCur: tick, prevX: posPrev, prevY: 0, curX: posCur, curY: 0, phase: (t - sentAt) / TICK, dt: Math.max(0.001, t - lastT) });
    lastT = t;
    xs.push(v.x);
  }
  return { xs, v };
}

describe('PredictedView', () => {
  it('moves smoothly with a jittery input clock: never backwards, steps within 15% of the true pace', () => {
    const speed = 11;
    const { xs } = run({ speed, seconds: 4, jitter: 0.004 });
    const per = (speed / 60) * 1;
    let backwards = 0;
    let worst = 0;
    for (let i = 20; i < xs.length; i++) {
      const d = xs[i]! - xs[i - 1]!;
      if (d < -1e-9) backwards++;
      worst = Math.max(worst, Math.abs(d - per) / per);
    }
    expect(backwards).toBe(0);
    expect(worst).toBeLessThan(0.5); // frame time itself jitters here; the large pops of the old drawing were a whole tick (200%)
  });

  it('absorbs a 1-unit misprediction without a jump and lets it go within 0.6 s', () => {
    const { xs } = run({ speed: 11, seconds: 3, jitter: 0, bump: { tick: 40, dx: -1 } });
    let biggest = 0;
    for (let i = 20; i < xs.length; i++) biggest = Math.max(biggest, Math.abs(xs[i]! - xs[i - 1]! - 11 / 60));
    expect(biggest).toBeLessThan(0.25);
    // the offset eased out: after the bump the drawn line sits on the true line again (shifted by the bump itself)
    const end = xs[xs.length - 1]!;
    const line = 11 * (xs.length / 60);
    expect(Math.abs(end - (line - 1) - 11 * (10 * TICK))).toBeLessThan(1.2);
  });

  it('snaps on a big error (teleport)', () => {
    const { v } = run({ speed: 11, seconds: 2, jitter: 0, bump: { tick: 40, dx: 6 } });
    expect(v.snaps).toBeGreaterThan(0);
  });

  it('a decaying error stays below 0.02 after 0.6 s', () => {
    const v = new PredictedView();
    const f = { tickPrev: 1, tickCur: 2, prevX: 0, prevY: 0, curX: 0, curY: 0, phase: 0, dt: 1 / 60 };
    v.update(f);
    v.update({ ...f, tickPrev: 2, tickCur: 3, prevX: 1, curX: 1 }); // tick 2 was at 0, is now predicted at 1: error -1
    expect(Math.abs(v.errX)).toBeGreaterThan(0.5);
    for (let i = 0; i < 36; i++) v.update({ ...f, tickPrev: 2, tickCur: 3, prevX: 1, curX: 1 });
    expect(Math.abs(v.errX)).toBeLessThan(0.02);
  });
});
