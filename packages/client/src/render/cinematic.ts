/**
 * The finisher: when the last enemy of a floor falls, the camera pushes in on the blow (between the character that struck it
 * and the enemy), time slows down for what is left of the death (particles, ragdoll, animation), then the camera pulls back
 * out and the floor-clear countdown starts. The simulation holds everybody still for the same length (`finisherSeconds`), so
 * this is purely a matter of drawing: it needs no network message and looks the same on every machine.
 */
export interface CineFrame {
  /** 0 = normal view, 1 = fully pushed in on the blow. */
  focus: number;
  /** How much of the slow motion is on: 0 = normal speed, 1 = the slowest. */
  slow: number;
  /** Camera zoom factor (1 = normal). */
  zoom: number;
  /** Letterbox bars and vignette strength, 0..1. */
  bars: number;
}

const IN = 0.4;
const OUT = 0.7;
const SLOWEST = 0.22;

const NORMAL: CineFrame = { focus: 0, slow: 0, zoom: 1, bars: 0 };

const ease = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));

export class Cinematic {
  private t0 = -1;
  private length = 2.6;
  private outAsked = false;
  private frame: CineFrame = NORMAL;
  /** Where to look (sim axes) and who landed the blow. */
  x = 0;
  y = 0;
  by = -1;

  get active(): boolean {
    return this.t0 >= 0;
  }

  /** `seconds` is how long the simulation holds everybody still; the camera move takes exactly that long. */
  start(now: number, seconds: number, x: number, y: number, by: number): void {
    this.t0 = now;
    this.length = Math.max(1.2, seconds);
    this.x = x;
    this.y = y;
    this.by = by;
    this.outAsked = false;
  }

  /** Freeze the clock (the game is paused). */
  hold(dt: number): void {
    if (this.t0 >= 0) this.t0 += dt;
  }

  cancel(): void {
    this.t0 = -1;
    this.frame = NORMAL;
  }

  /** Advance to `now` (real seconds) and return the look of this frame. `maxZoom` is how far this view can push in. */
  update(now: number, maxZoom: number): CineFrame {
    if (this.t0 < 0) return NORMAL;
    const t = now - this.t0;
    if (t >= this.length) {
      this.cancel();
      return NORMAL;
    }
    const k = Math.min(ease(t / IN), ease((this.length - t) / OUT));
    // the slow motion sets in a little after the push-in starts and lets go before the pull-back ends
    const slow = Math.min(ease((t - 0.1) / 0.25), ease((this.length - OUT * 0.6 - t) / 0.3));
    this.frame = { focus: k, slow, zoom: 1 + (maxZoom - 1) * k, bars: k };
    return this.frame;
  }

  /** Speed of effects (particles, ragdolls, animation) right now: 1 normal, down to about a fifth. */
  timeScale(): number {
    return 1 - (1 - SLOWEST) * this.frame.slow;
  }

  /** True once, when the pull-back begins (for its sound). */
  takeOutSound(now: number): boolean {
    if (this.t0 < 0 || this.outAsked || this.length - (now - this.t0) > OUT + 0.05) return false;
    this.outAsked = true;
    return true;
  }
}
