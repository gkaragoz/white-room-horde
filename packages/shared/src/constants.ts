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
export const CAMERA = { orthoWidth: 32, elevationDeg: 28, yawDeg: 30 } as const;

/** Player vest colours (docs/DESIGN.md section 3), slot 0..10. */
export const PLAYER_COLORS = [
  '#1FA2FF', '#FF4F9A', '#FFD21F', '#9A63FF', '#FF9A6A', '#3DD6C6',
  '#A8E063', '#5B6BE0', '#E057C8', '#D2B48C', '#8E9AAF',
] as const;

export const MAX_GRENADES = 32;
export const MAX_BARRELS = 12;
export const MAX_SPIT = 160;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Arena layouts: axis-aligned boxes (centre x, y in sim coordinates, full width and height). Shared by sim and renderer. */
export const MAPS: readonly { id: string; boxes: readonly Box[] }[] = [
  {
    id: 'warehouse',
    boxes: [
      { x: -10, y: 6, w: 4, h: 2 },
      { x: 9, y: -5, w: 2, h: 5 },
      { x: 0, y: 12, w: 6, h: 1.5 },
      { x: -18, y: -8, w: 2, h: 6 },
      { x: 16, y: 10, w: 3, h: 3 },
      { x: -6, y: -12, w: 5, h: 2 },
      { x: 22, y: -14, w: 2, h: 2 },
      { x: -24, y: 12, w: 2, h: 2 },
    ],
  },
  {
    id: 'courtyard',
    boxes: [
      { x: 9, y: 0, w: 2, h: 2 },
      { x: 6.4, y: 6.4, w: 2, h: 2 },
      { x: 0, y: 9, w: 2, h: 2 },
      { x: -6.4, y: 6.4, w: 2, h: 2 },
      { x: -9, y: 0, w: 2, h: 2 },
      { x: -6.4, y: -6.4, w: 2, h: 2 },
      { x: 0, y: -9, w: 2, h: 2 },
      { x: 6.4, y: -6.4, w: 2, h: 2 },
      { x: 20, y: 12, w: 6, h: 1.5 },
      { x: -20, y: 12, w: 6, h: 1.5 },
      { x: 20, y: -12, w: 6, h: 1.5 },
      { x: -20, y: -12, w: 6, h: 1.5 },
    ],
  },
  {
    id: 'corridors',
    boxes: [
      { x: -14, y: 7, w: 16, h: 1.2 },
      { x: 14, y: 7, w: 16, h: 1.2 },
      { x: -14, y: -7, w: 16, h: 1.2 },
      { x: 14, y: -7, w: 16, h: 1.2 },
      { x: 23, y: 0, w: 1.2, h: 8 },
      { x: -23, y: 0, w: 1.2, h: 8 },
      { x: 0, y: 14, w: 4, h: 2 },
      { x: 0, y: -14, w: 4, h: 2 },
    ],
  },
  {
    id: 'field',
    boxes: [
      { x: -14, y: -9, w: 3, h: 3 },
      { x: 13, y: 8, w: 3, h: 3 },
      { x: -4, y: 10, w: 2, h: 2 },
      { x: 5, y: -11, w: 4, h: 1.5 },
      { x: 24, y: 0, w: 2, h: 6 },
    ],
  },
  {
    id: 'ruins',
    boxes: [
      { x: -18, y: 6, w: 5, h: 1.2 },
      { x: -20.4, y: 4, w: 1.2, h: 4 },
      { x: 18, y: -6, w: 5, h: 1.2 },
      { x: 20.4, y: -4, w: 1.2, h: 4 },
      { x: -8, y: -10, w: 1.2, h: 5 },
      { x: 8, y: 10, w: 1.2, h: 5 },
      { x: 0, y: 6, w: 4, h: 1.2 },
      { x: 0, y: -6, w: 4, h: 1.2 },
      { x: -24, y: -12, w: 4, h: 1.2 },
      { x: 24, y: 12, w: 4, h: 1.2 },
      { x: 12, y: -14, w: 1.2, h: 4 },
      { x: -12, y: 14, w: 1.2, h: 4 },
      { x: -4, y: 8, w: 2, h: 2 },
      { x: 4, y: -8, w: 2, h: 2 },
    ],
  },
  {
    id: 'factory',
    boxes: [
      { x: -12, y: 10, w: 18, h: 1.6 },
      { x: 12, y: 10, w: 18, h: 1.6 },
      { x: -12, y: -10, w: 18, h: 1.6 },
      { x: 12, y: -10, w: 18, h: 1.6 },
      { x: -6.5, y: 0, w: 4, h: 4 },
      { x: 6.5, y: 0, w: 4, h: 4 },
      { x: -24, y: 0, w: 2, h: 10 },
      { x: 24, y: 0, w: 2, h: 10 },
      { x: 0, y: 15.5, w: 3, h: 2 },
      { x: 0, y: -15.5, w: 3, h: 2 },
    ],
  },
];
export const MAP_COUNT = MAPS.length;
/** The first layout (kept for code that only needs one set of cover). */
export const OBSTACLES: readonly Box[] = MAPS[0]!.boxes;


export const MAX_PICKUPS = 64;
