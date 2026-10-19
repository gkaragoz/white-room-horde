/** Picks the player animation clip from simulation state (clip ids come from tools/mixamo/manifest.json and the 8-way pack). */
const DIRS = ['forward', 'forward_left', 'left', 'backward_left', 'backward', 'backward_right', 'right', 'forward_right'] as const;

/**
 * @param moveAngle direction of movement in radians (sim space)
 * @param facing direction the character aims at (sim space)
 */
export function eightWay(moveAngle: number, facing: number): (typeof DIRS)[number] {
  let d = moveAngle - facing; // 0 = moving where we aim; positive = counter-clockwise (to the left)
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const sector = Math.round(d / (Math.PI / 4)); // -4..4
  return DIRS[((sector % 8) + 8) % 8]!;
}

export function pickPlayerClip(opts: { moving: boolean; firing: boolean; moveAngle: number; facing: number }): string {
  if (!opts.moving) return opts.firing ? 'fire_stand' : 'aim_idle';
  const dir = eightWay(opts.moveAngle, opts.facing);
  if (opts.firing && dir === 'forward') return 'fire_run';
  return 'run_' + dir;
}
