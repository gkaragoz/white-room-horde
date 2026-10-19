/** Simulation and camera constants shared by sim, client and server. */
export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;
export const INPUT_DELAY_TICKS = 3;
export const MAX_PLAYERS = 11;
export const MAX_BULLETS = 1024;
export const MAX_ENEMIES = 640;
export const ARENA_HALF_W = 30;
export const ARENA_HALF_H = 20;

/** Camera (docs/DESIGN.md section 5, iso62): orthographic, elevation 28 deg, yaw 30 deg, ~17 units wide. */
export const CAMERA = { orthoWidth: 17, elevationDeg: 28, yawDeg: 30 } as const;

/** Player vest colours (docs/DESIGN.md section 3), slot 0..10. */
export const PLAYER_COLORS = [
  '#1FA2FF', '#FF4F9A', '#FFD21F', '#9A63FF', '#FF9A6A', '#3DD6C6',
  '#A8E063', '#5B6BE0', '#E057C8', '#D2B48C', '#8E9AAF',
] as const;
