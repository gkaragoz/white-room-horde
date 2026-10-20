/** Simulation and camera constants shared by sim, client and server. */
export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;
export const INPUT_DELAY_TICKS = 3;
export const MAX_PLAYERS = 11;
export const MAX_BULLETS = 1024;
export const MAX_ENEMIES = 640;
export const ARENA_HALF_W = 52;
export const ARENA_HALF_H = 35;

/** Camera (docs/DESIGN.md section 5, iso62): orthographic, elevation 28 deg, yaw 30 deg, ~17 units wide. */
export const CAMERA = { orthoWidth: 42, elevationDeg: 28, yawDeg: 30 } as const;

/** Player vest colours (docs/DESIGN.md section 3), slot 0..10. */
export const PLAYER_COLORS = [
  '#1FA2FF', '#FF4F9A', '#FFD21F', '#9A63FF', '#FF9A6A', '#3DD6C6',
  '#A8E063', '#5B6BE0', '#E057C8', '#D2B48C', '#8E9AAF',
] as const;

export const MAX_GRENADES = 32;
export const MAX_BARRELS = 20;
export const MAX_SPIT = 160;
/** Pools of the ground effects: lingering acid and fire, and the telegraphed attacks that are still charging. */
export const MAX_ZONES = 96;
export const MAX_TELE = 48;

export type { Box } from './layers';
import { LAYERED_MAPS, type Box, type MapDef } from './layers';

/** Reflect a quarter of an arena across both axes (the layouts are built from one quarter, then mirrored, and a few pieces added by hand). */
function mirror4(quarter: readonly Box[]): Box[] {
  const out: Box[] = [];
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      for (const b of quarter) {
        // pieces that sit on an axis are not doubled
        if ((b.x === 0 && sx < 0) || (b.y === 0 && sy < 0)) continue;
        out.push({ ...b, x: b.x * sx, y: b.y * sy });
      }
    }
  }
  return out;
}

/**
 * Arena layouts: axis-aligned boxes (centre x, y in sim coordinates, full width and height). Shared by sim and renderer.
 * The arenas are 104 x 70 units: wide open ground to run in and gather a crowd, with cover, lanes and choke points to use.
 */
const FLAT_MAPS: readonly { id: string; boxes: readonly Box[] }[] = [
  {
    // shelving in four stores round an open middle: run the aisles, then come out into the middle to sweep the crowd
    id: 'warehouse',
    boxes: [
      ...mirror4([
        { x: 30, y: 9, w: 18, h: 2 },
        { x: 30, y: 19, w: 18, h: 2 },
        { x: 30, y: 29, w: 18, h: 2 },
        { x: 47, y: 14, w: 2, h: 10 },
        { x: 13, y: 22, w: 6, h: 2 },
        { x: 14, y: 30, w: 2, h: 6 },
      ]),
      { x: 6, y: 3, w: 2, h: 2 },
      { x: -6, y: -3, w: 2, h: 2 },
    ],
  },
  {
    // a ring of pillars round the centre, a low outer wall in every corner and planters between them
    id: 'courtyard',
    boxes: [
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ x: Math.round(Math.cos((k * Math.PI) / 4) * 120) / 10, y: Math.round(Math.sin((k * Math.PI) / 4) * 120) / 10, w: 2.2, h: 2.2 })),
      ...mirror4([
        { x: 36, y: 23, w: 10, h: 1.5 },
        { x: 41, y: 18.5, w: 1.5, h: 9 },
        { x: 24, y: 0, w: 2, h: 8 },
        { x: 0, y: 22, w: 8, h: 2 },
      ]),
    ],
  },
  {
    // long walls cut the arena into lanes with doorways: fight in a lane or run through a door and come out behind them
    id: 'corridors',
    boxes: [
      ...mirror4([
        { x: 36, y: 14, w: 20, h: 1.2 },
        { x: 0, y: 14, w: 22, h: 1.2 },
        { x: 40, y: 4, w: 1.2, h: 10 },
        { x: 22, y: 27, w: 6, h: 1.5 },
        { x: 10, y: 4, w: 4, h: 4 },
      ]),
    ],
  },
  {
    // open country: a few rocks and sheds, a lot of room to kite in circles
    id: 'field',
    boxes: [
      { x: -30, y: -18, w: 5, h: 5 },
      { x: 28, y: 16, w: 5, h: 5 },
      { x: -8, y: 20, w: 3, h: 3 },
      { x: 10, y: -22, w: 6, h: 2 },
      { x: 44, y: 0, w: 3, h: 10 },
      { x: -44, y: 6, w: 3, h: 8 },
      { x: -20, y: 6, w: 2, h: 2 },
      { x: 20, y: -6, w: 2, h: 2 },
      { x: -38, y: 28, w: 6, h: 3 },
      { x: 36, y: -29, w: 6, h: 3 },
      { x: 0, y: -9, w: 4, h: 4 },
      { x: -16, y: -28, w: 3, h: 3 },
      { x: 18, y: 28, w: 3, h: 3 },
    ],
  },
  {
    // broken walls: L-shaped shelters with gaps to slip through
    id: 'ruins',
    boxes: [
      { x: -34, y: 12, w: 8, h: 1.2 },
      { x: -37.6, y: 9, w: 1.2, h: 6 },
      { x: 34, y: -12, w: 8, h: 1.2 },
      { x: 37.6, y: -9, w: 1.2, h: 6 },
      { x: -14, y: -18, w: 1.2, h: 8 },
      { x: 14, y: 18, w: 1.2, h: 8 },
      { x: 0, y: 10, w: 6, h: 1.2 },
      { x: 0, y: -10, w: 6, h: 1.2 },
      { x: -42, y: -22, w: 7, h: 1.2 },
      { x: 42, y: 22, w: 7, h: 1.2 },
      { x: 22, y: -24, w: 1.2, h: 7 },
      { x: -22, y: 24, w: 1.2, h: 7 },
      { x: -8, y: 14, w: 3, h: 3 },
      { x: 8, y: -14, w: 3, h: 3 },
      { x: -26, y: -6, w: 1.2, h: 5 },
      { x: 26, y: 6, w: 1.2, h: 5 },
      { x: 18, y: 8, w: 4, h: 1.2 },
      { x: -18, y: -8, w: 4, h: 1.2 },
      { x: 46, y: -24, w: 1.2, h: 6 },
      { x: -46, y: 24, w: 1.2, h: 6 },
    ],
  },
  {
    // production lines: long conveyors with a gap in the middle, machines and sheds
    id: 'factory',
    boxes: [
      ...mirror4([
        { x: 22, y: 18, w: 32, h: 1.6 },
        { x: 12, y: 0, w: 6, h: 6 },
        { x: 46, y: 0, w: 2, h: 16 },
        { x: 0, y: 29, w: 5, h: 3 },
        { x: 26, y: 28, w: 4, h: 2 },
      ]),
    ],
  },
];
/** Every arena: the six flat layouts first, then the vertical ones (ramps, bridges, tunnels; see layers.ts). */
export const MAPS: readonly MapDef[] = [...FLAT_MAPS, ...LAYERED_MAPS];
export const MAP_COUNT = MAPS.length;
/** The first layout (kept for code that only needs one set of cover). */
export const OBSTACLES: readonly Box[] = MAPS[0]!.boxes;


export const MAX_PICKUPS = 64;

/** Where the world is in the climb between floors (`world.misc[MISC.Phase]`). */
export const FloorPhase = { Fight: 0, Cleared: 1, Ascend: 2, Arrive: 3 } as const;

/** Slots of `world.misc`. */
export const MISC = { Freeze: 0, Remaining: 1, Cleared: 2, Total: 3, Phase: 4, PhaseEnd: 5, Entered: 6, Killer: 7, KillX: 8, KillY: 9, Cine: 10 } as const;

/** Shapes and effects of a telegraphed ground attack (`world.tShape`, `world.tEffect`). */
export const TeleShape = { Circle: 0, Rect: 1, Fill: 2 } as const;
export const TeleEffect = { Hurt: 0, Half: 1, Kill: 2, Acid: 3, None: 4, Strike: 5 } as const;
export const ZoneKind = { Acid: 0, Fire: 1 } as const;
