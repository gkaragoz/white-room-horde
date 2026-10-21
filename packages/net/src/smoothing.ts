/**
 * Where the local character is drawn while the network is in the loop.
 *
 * The prediction gives the character's position after each input tick it has sent (`prev` for the tick before the last
 * one, `cur` for the last). Those ticks advance on the *input* clock (one per sent input), so the drawn position runs
 * between them on that same clock: nothing the confirmed simulation does (a bundle arriving, a step in a burst) moves it.
 *
 * When a new frame predicts the same tick somewhere else than the frame before did, the prediction was wrong (a shove, a
 * late input, a ramp): the difference goes into an error offset that is added to the drawn position and eases out, so a
 * correction is a short glide instead of a pop. Only a big error (a teleport, a floor change) snaps.
 */
export interface PredictedFrame {
  tickPrev: number;
  tickCur: number;
  prevX: number;
  prevY: number;
  curX: number;
  curY: number;
  /** 0..1: how far the input clock is between the last two input ticks. */
  phase: number;
  /** Seconds since the previous frame. */
  dt: number;
}

export const ERR_DECAY_SECONDS = 0.11;
export const ERR_SNAP_DISTANCE = 2.5;

export class PredictedView {
  x = 0;
  y = 0;
  /** The part of the position that is still easing out (a correction in progress). */
  errX = 0;
  errY = 0;
  ready = false;
  /** Corrections absorbed / hard snaps since the last reset of the counters (diagnostics). */
  corrections = 0;
  snaps = 0;
  maxErr = 0;
  private tick = -1;
  private tx = 0;
  private ty = 0;

  reset(): void {
    this.ready = false;
    this.errX = this.errY = 0;
    this.tick = -1;
  }

  update(f: PredictedFrame): void {
    // what is left of an earlier correction eases out first; a new one starts at its full size
    const k = Math.exp(-f.dt / ERR_DECAY_SECONDS);
    this.errX *= k;
    this.errY *= k;
    if (this.ready && this.tick >= 0) {
      // the position this frame predicts for the tick the previous frame ended on
      let nx = NaN;
      let ny = NaN;
      if (f.tickCur === this.tick) {
        nx = f.curX;
        ny = f.curY;
      } else if (f.tickPrev === this.tick) {
        nx = f.prevX;
        ny = f.prevY;
      }
      if (nx === nx) {
        const dx = this.tx - nx;
        const dy = this.ty - ny;
        if (dx * dx + dy * dy > 1e-8) {
          this.errX += dx;
          this.errY += dy;
          this.corrections++;
        }
      }
    }
    const e2 = this.errX * this.errX + this.errY * this.errY;
    if (!this.ready || e2 > ERR_SNAP_DISTANCE * ERR_SNAP_DISTANCE) {
      if (this.ready) this.snaps++;
      this.errX = this.errY = 0;
    } else {
      if (e2 > this.maxErr * this.maxErr) this.maxErr = Math.sqrt(e2);
    }
    const ph = f.phase < 0 ? 0 : f.phase > 1 ? 1 : f.phase;
    this.x = f.prevX + (f.curX - f.prevX) * ph + this.errX;
    this.y = f.prevY + (f.curY - f.prevY) * ph + this.errY;
    this.ready = true;
    this.tick = f.tickCur;
    this.tx = f.curX;
    this.ty = f.curY;
  }
}
