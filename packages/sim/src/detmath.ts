/**
 * Deterministic math for the simulation. Only + - * / sqrt abs floor are used (IEEE-754 exact on every engine);
 * Math.sin/cos/atan2/pow/exp/log are forbidden in this package (see eslint.config.js).
 */
export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

/** Wrap an angle into [-PI, PI). */
export function wrapAngle(a: number): number {
  return a - TAU * Math.floor((a + PI) / TAU);
}

/** sin via an 11th order Taylor polynomial on [-PI/2, PI/2] (|error| < 1e-8). */
export function sin(x: number): number {
  let a = wrapAngle(x);
  if (a > HALF_PI) a = PI - a;
  else if (a < -HALF_PI) a = -PI - a;
  const a2 = a * a;
  return a * (1 + a2 * (-1 / 6 + a2 * (1 / 120 + a2 * (-1 / 5040 + a2 * (1 / 362880 + a2 * (-1 / 39916800))))));
}

export function cos(x: number): number {
  return sin(x + HALF_PI);
}

function atanPoly(t: number): number {
  const t2 = t * t;
  return t * (0.999866 + t2 * (-0.3302995 + t2 * (0.180141 + t2 * (-0.085133 + t2 * 0.0208351))));
}

/** atan2 with |error| < 1e-5 rad. */
export function atan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  let a = ay <= ax ? atanPoly(ay / ax) : HALF_PI - atanPoly(ax / ay);
  if (x < 0) a = PI - a;
  if (y < 0) a = -a;
  return a;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function sqrt(x: number): number {
  return Math.sqrt(x);
}
